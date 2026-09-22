/**
 * Roon integration driver for Remote Two/3.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import * as uc from "@unfoldedcircle/integration-api";
import { AbortDriverSetup } from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import RoonApi from "node-roon-api";
import type { Core, Output, Zone } from "node-roon-api";
import RoonApiBrowse from "node-roon-api-browse";
import type { RoonImageOptions } from "node-roon-api-image";
import RoonApiStatus from "node-roon-api-status";
import RoonApiTransport from "node-roon-api-transport";
import type { SubscribeZoneChanged, SubscribeZoneSubscribed } from "node-roon-api-transport";
import { BrowseService } from "./roon-browse.js";
import Config from "./config.js";
import {
  convertImageToBase64,
  delay,
  getStandbySupport,
  mediaPlayerAttributesFromZone,
  newEntityFromZone
} from "./util.js";
import { type RoonDriver as RoonDriverInterface, RoonMediaPlayer } from "./media-player.js";
import { calculateVolumeToPercentage } from "./volume.js";

import os from "os";

export default class RoonDriver implements RoonDriverInterface {
  private driver: uc.IntegrationAPI;
  private readonly roon: RoonApi;
  private readonly roonApiStatus: RoonApiStatus;
  private roonCore: Core | null = null;
  public roonTransport: RoonApiTransport | null = null;
  public browseService: BrowseService | null = null;
  public roonPaired = false;
  private config: Config;
  private static imageConfig: RoonImageOptions = {
    scale: "fit",
    width: 480,
    height: 480,
    format: "image/jpeg"
  };

  private currentZones: Map<string, Zone> = new Map();

  constructor() {
    this.driver = new uc.IntegrationAPI();
    this.driver.init("driver.json", this.handleDriverSetup.bind(this));
    this.config = new Config(this.driver.getConfigDirPath());
    this.initLocalZones();
    this.roon = new RoonApi({
      extension_id: "com.uc.remote",
      display_name: `Remote Two/3 Integration (${os.hostname()})`,
      display_version: this.driver.getDriverVersion().version.driver,
      publisher: "Unfolded Circle",
      email: "support@unfoldedcircle.com",
      website: "https://unfoldedcircle.com",
      core_paired: this.handleRoonCorePaired.bind(this),
      core_unpaired: this.handleRoonCoreUnpaired.bind(this),
      configDir: this.driver.getConfigDirPath()
    });

    this.roonApiStatus = new RoonApiStatus(this.roon);
    this.setupDriverEvents();
  }

  private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
    if (msg instanceof uc.DriverSetupRequest) {
      return this.handleDriverSetupRequest(msg);
    }

    if (msg instanceof uc.UserConfirmationResponse) {
      return this.handleDriverSetupUserConfirmation(msg);
    }
    log.error("Unknown Roon integration setup message", msg);
    return new uc.AbortDriverSetup("Unknown Roon integration setup message");
  }

  private handleDriverSetupRequest(msg: uc.DriverSetupRequest): uc.SetupAction {
    if (msg.reconfigure) {
      // TODO redesign setup flow: do we really want to delete the configuration at this point?
      //      This should be done as late as possible: the user should not lose the old cfg if setup fails!
      this.config.clear();
    }
    const img = convertImageToBase64("./assets/setupimg.png");
    if (!img) {
      log.error("Failed to convert image to base64");
      return new AbortDriverSetup("Failed to process image during setup");
    }
    return new uc.RequestUserConfirmation(
      "User action needed",
      "Please open Roon, navigate to *Settings/Extensions* and click *Enable* next to the Unfolded Circle Roon Integration.\n\nThen click Next.",
      img
    );
  }

  private async handleDriverSetupUserConfirmation(msg: uc.UserConfirmationResponse): Promise<uc.SetupAction> {
    if (!msg.confirm) {
      return new AbortDriverSetup("You need to confirm the setup");
    }
    await delay(3000);
    if (this.roonPaired) {
      await this.getRoonZones();
      // TODO let user choose which Zones to add
      return new uc.SetupComplete();
    }
    return new uc.SetupError("Failed to pair with Roon");
  }

  /**
   * Load saved configuration and create an available media-player entity for each zone.
   */
  private initLocalZones() {
    let count = 0;
    this.config.forEachZone((zone) => {
      log.info(`Creating media-player for configured zone: ${zone.display_name} (${zone.zone_id})`);
      const entity = newEntityFromZone(zone, this, true);
      this.driver.addAvailableEntity(entity);
      count++;
    });

    if (count === 0) {
      log.warn("Setup required: no configured zones found!");
    }
  }

  private setupDriverEvents() {
    this.driver.on(uc.Events.Connect, this.handleConnect.bind(this));
    this.driver.on(uc.Events.SubscribeEntities, this.handleSubscribeEntities.bind(this));
    this.driver.on(uc.Events.Disconnect, this.handleDisconnect.bind(this));
    this.driver.on(uc.Events.EnterStandby, this.handleEnterStandby.bind(this));
    this.driver.on(uc.Events.ExitStandby, this.handleExitStandby.bind(this));
  }

  private async handleConnect() {
    this.roon.start_discovery();
    this.roonApiStatus?.set_status("Connected", false);
    await this.driver.setDeviceState(uc.DeviceStates.Connected);
  }

  private async handleSubscribeEntities(entityIds: string[]) {
    log.debug("Subscribe entities: %s", entityIds);

    if (!this.roonCore) {
      log.warn("Can't send entity data after subscribe: Roon core not available");
      return;
    }

    entityIds.forEach((entityId) => {
      const entity = this.driver.getConfiguredEntities().getEntity(entityId);

      if (!entity) {
        return;
      }

      log.info(`Subscribe: ${entityId}`);

      // Resolve the configured entity by its physical output rather than
      // assuming its original zone_id still exists. This allows an entity
      // to follow its output when Roon has moved it into a group.
      const zone = this.resolveCurrentZone(entityId);

      if (zone) {
        log.debug(
          `Subscribe resolved entity ${entityId} to current Roon zone ` + `${zone.display_name} (${zone.zone_id})`
        );

        this.updateMediaPlayerFromZone(zone);
        return;
      }

      // During startup UC may subscribe before Roon has delivered its
      // initial zone snapshot. Preserve the entity's last known attributes;
      // the Roon "Subscribed" event will refresh them once currentZones
      // has been populated.
      log.debug(`Current Roon zone not yet known for subscribed entity ${entityId}; ` + `using last known attributes`);

      this.driver.emit(uc.Events.EntityAttributesUpdated, entity.id, entity.entity_type, entity.attributes);
    });
  }

  private async handleDisconnect() {
    this.roonApiStatus?.set_status("Disconnected", false);
    // TODO unsubscribe from Roon? how?
    await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
  }

  private async handleEnterStandby() {
    log.debug("enter standby");
    this.roonApiStatus?.set_status("Standby", false);
    // #56 force Roon disconnect
    this.roon.stop_discovery();
    this.roon.disconnect_all();
  }

  private async handleExitStandby() {
    log.info("exit standby");
    // #56 force Roon reconnect
    this.roon.start_discovery();

    this.roonApiStatus?.set_status("Connected", false);
  }

  /**
   * Reconcile configured UC entities against Roon's current zone topology.
   *
   * A configured entity remains available as long as at least one of its
   * configured physical outputs exists in a current Roon zone. This
   * distinguishes an output joining/leaving a group from an output
   * actually disappearing from Roon.
   */
  private reconcileConfiguredEntityAvailability(): void {
    this.config.forEachZone((configuredZone) => {
      const entityId = configuredZone.zone_id;

      if (!this.driver.getConfiguredEntities().contains(entityId)) {
        return;
      }

      const currentZone = this.resolveCurrentZone(entityId);

      if (currentZone) {
        return;
      }

      log.debug(`Configured entity ${entityId} is not present in any current Roon zone; ` + `marking unavailable`);

      this.setEntityState(entityId, uc.MediaPlayerStates.Unavailable);
    });
  }

  private async subscribeRoonZones() {
    if (this.roonCore == null) {
      log.warn("Cannot subscribe to Roon zones. Roon Core not available.");
      return;
    }

    if (this.roonTransport == null) {
      log.warn("Cannot subscribe to Roon zones. Roon Transport not available.");
      return;
    }

    // add event listeners to roon
    this.roonTransport.subscribe_zones(async (cmd, msg) => {
      // log.debug("subscribe_zones callback: %s - %s", cmd, JSON.stringify(msg))

      switch (cmd) {
        case "Changed": {
          const data = msg as SubscribeZoneChanged;

          // Remove old zones from the current topology first.
          //
          // Do NOT mark the corresponding configured entity unavailable
          // here. Roon also reports a zone as removed when its output is
          // moved into a group.
          if (data.zones_removed) {
            data.zones_removed.forEach((zoneId) => {
              log.info(`Zone removed: ${zoneId}`);
              this.currentZones.delete(zoneId);
            });
          }

          // Add newly created zones, including groups.
          if (data.zones_added) {
            data.zones_added.forEach((zone: Zone) => {
              log.info(`Zone added: ${zone.display_name}`);
              this.updateMediaPlayerFromZone(zone);
            });
          }

          // Refresh existing zones.
          if (data.zones_changed) {
            data.zones_changed.forEach((zone: Zone) => {
              log.debug(`Zone changed: ${zone.display_name}`);
              this.updateMediaPlayerFromZone(zone);
            });
          }

          // Seek updates are independent of zones_changed.
          if (data.zones_seek_changed) {
            data.zones_seek_changed.forEach((seekChange) => {
              const currentZone = this.currentZones.get(seekChange.zone_id);

              if (!currentZone) {
                log.debug(`Current zone not found, not updating seek: ${seekChange.zone_id}`);
                return;
              }

              const entityIds = this.findConfiguredEntityIdsForZone(currentZone);

              for (const entityId of entityIds) {
                if (!this.driver.getConfiguredEntities().contains(entityId)) {
                  continue;
                }

                this.driver.getConfiguredEntities().updateEntityAttributes(entityId, {
                  [uc.MediaPlayerAttributes.MediaPosition]: seekChange.seek_position ?? 0
                });
              }
            });
          }

          // Only determine availability after all topology changes in
          // this notification have been applied.
          this.reconcileConfiguredEntityAvailability();

          break;
        }

        case "Subscribed": {
          const data = msg as SubscribeZoneSubscribed;

          // Roon's initial snapshot is authoritative. Rebuild our current
          // topology so restart/reconnect while already grouped works.
          this.currentZones.clear();

          if (data.zones) {
            data.zones.forEach((zone) => {
              if (this.updateMediaPlayerFromZone(zone)) {
                log.info(`Subscribed: ${zone.display_name}`);
              }
            });
          }

          this.reconcileConfiguredEntityAvailability();

          break;
        }

        case "Unsubscribed": {
          log.debug("Zone unsubscribe %s", JSON.stringify(msg));
          break;
        }
      }
    });
  }

  /**
   * Find every configured UC entity whose physical Roon output is
   * currently part of the given Roon zone.
   *
   * A Roon zone may contain multiple configured outputs when zones are
   * grouped, so one current Roon zone can map to multiple UC entities.
   */
  private findConfiguredEntityIdsForZone(zone: Zone): string[] {
    const currentOutputIds = new Set(zone.outputs?.map((output) => output.output_id) ?? []);

    const matches: string[] = [];

    this.config.forEachZone((configuredZone) => {
      const configuredOutputs = configuredZone.outputs ?? [];

      if (configuredOutputs.some((output) => currentOutputIds.has(output.output_id))) {
        matches.push(configuredZone.zone_id);
      }
    });

    return matches;
  }

  /**
   * Resolve a configured UC entity to the Roon zone that currently
   * contains its original output.
   */
  public resolveCurrentZone(entityId: string): Zone | undefined {
    const configuredZone = this.config.getZone(entityId);
    if (!configuredZone) {
      return undefined;
    }

    const configuredOutputIds = new Set(configuredZone.outputs?.map((output) => output.output_id) ?? []);

    for (const zone of this.currentZones.values()) {
      if (zone.outputs?.some((output) => configuredOutputIds.has(output.output_id))) {
        return zone;
      }
    }

    return undefined;
  }

  /**
   * Return the current Roon zone_id for a configured UC entity.
   */
  public resolveCurrentZoneId(entityId: string): string | undefined {
    return this.resolveCurrentZone(entityId)?.zone_id;
  }

  private updateMediaPlayerFromZone(zone: Zone): boolean {
    if (!zone) {
      return false;
    }

    // Keep a cache of Roon's current zone topology.
    this.currentZones.set(zone.zone_id, zone);

    // One current Roon zone may contain several outputs that each have
    // their own configured UC entity.
    const entityIds = this.findConfiguredEntityIdsForZone(zone);

    if (entityIds.length === 0) {
      return false;
    }

    let updated = false;

    for (const entityId of entityIds) {
      if (!this.driver.getConfiguredEntities().contains(entityId)) {
        log.debug(`Configured entity not found, not updating: ${entityId} (${zone.display_name})`);
        continue;
      }

      if (entityId !== zone.zone_id) {
        log.debug(
          `Mapped current Roon zone ${zone.display_name} (${zone.zone_id}) ` + `to configured entity ${entityId}`
        );
      }

      const attr = mediaPlayerAttributesFromZone(zone);

      // mediaPlayerAttributesFromZone() provides zone/group-level
      // attributes. Volume and mute belong to the individual physical
      // output represented by this configured UC entity.
      //
      // Resolve that physical output inside the current Roon zone and
      // override the group-level volume attributes with its own values.
      const configuredOutput = this.config.getZone(entityId)?.outputs?.[0];

      const currentOutput = configuredOutput
        ? zone.outputs?.find((output) => output.output_id === configuredOutput.output_id)
        : undefined;

      if (currentOutput?.volume) {
        const volume = currentOutput.volume;

        const volumePercentage = calculateVolumeToPercentage(volume);

        log.debug(
          `Output volume for entity ${entityId}: ` +
            `${currentOutput.display_name} ` +
            `native=${volume.value}, ` +
            `percentage=${volumePercentage}, ` +
            `muted=${volume.is_muted}`
        );

        attr[uc.MediaPlayerAttributes.Volume] = volumePercentage;

        attr[uc.MediaPlayerAttributes.Muted] = volume.is_muted ?? false;
      }

      if (zone.now_playing?.image_key) {
        const image = this.browseService?.buildImageUrl(zone.now_playing.image_key);
        log.debug(`Artwork for ${zone.display_name}: ${zone.now_playing.image_key} -> ${image ?? "none"}`);

        attr[uc.MediaPlayerAttributes.MediaImageUrl] = image ?? "";
      } else {
        log.debug(`No artwork for ${zone.display_name}`);
        // Explicitly clear stale artwork.
        attr[uc.MediaPlayerAttributes.MediaImageUrl] = "";
      }

      const entity = this.driver.getConfiguredEntities().getEntity(entityId) as RoonMediaPlayer;

      if (entity) {
        entity.updateStandbySupport(getStandbySupport(zone));
      }

      log.debug(
        `Updating entity ${entityId} from zone ${zone.display_name}: ` +
          `state=${attr[uc.MediaPlayerAttributes.State]}, ` +
          `artwork=${attr[uc.MediaPlayerAttributes.MediaImageUrl] ?? "unset"}`
      );

      if (this.driver.getConfiguredEntities().updateEntityAttributes(entityId, attr)) {
        updated = true;
      }
    }
    return updated;
  }

  private async handleRoonCorePaired(core: Core) {
    this.roonCore = core;
    this.roonPaired = true;
    this.roonTransport = core.services.RoonApiTransport as RoonApiTransport;
    const browseApi = core.services.RoonApiBrowse as RoonApiBrowse;

    this.browseService = new BrowseService(
      browseApi,
      RoonDriver.imageConfig,
      this.roonCore.moo.transport.host,
      +this.roonCore.moo.transport.port
    );

    log.info(`Roon Core paired: ${core.core_id} ${core.display_name} ${core.display_version}`);

    await this.subscribeRoonZones();
  }

  private handleRoonCoreUnpaired() {
    log.info("Roon Core unpaired");
    this.roonPaired = false;
    this.roonCore = null;
    this.roonTransport = null;
    this.browseService = null;
    // #56 set all entities to unavailable if we are no longer paired with the Roon core
    this.driver
      .getConfiguredEntities()
      .getIds()
      .forEach((entityId) => {
        this.setEntityState(entityId, uc.MediaPlayerStates.Unavailable);
      });
  }

  private async getRoonZones(): Promise<void> {
    if (this.roonCore == null) {
      log.warn("Cannot get Roon zones. Roon Core not available.");
      return;
    }

    if (this.roonTransport == null) {
      log.warn("Cannot get Roon zones. Roon Transport not available.");
      return;
    }

    return new Promise((resolve, reject) => {
      this.roonTransport?.get_zones(async (error, data) => {
        if (error) {
          log.warn("Failed to get Roon Zones");
          reject(error);
        }

        // clear config every time we fetch zones
        // so we can keep track of available zones
        this.config.clear();
        for (const zone of data.zones) {
          log.info(`Found available zone: ${zone.display_name} (${zone.zone_id})`);
          const res = this.driver.getAvailableEntities().getEntity(zone.zone_id);
          if (!res) {
            const entity = newEntityFromZone(zone, this);
            this.driver.addAvailableEntity(entity);
          }
          this.config.updateZone(zone);
        }
        resolve();
      });
    });
  }

  // public getDefaultZoneOutput(zoneId: string): Output | undefined {
  //   return this.config.getZone(zoneId)?.outputs?.[0];
  // }

  public getDefaultZoneOutput(zoneId: string): Output | undefined {
    const configuredOutput = this.config.getZone(zoneId)?.outputs?.[0];
    if (!configuredOutput) {
      return undefined;
    }

    const currentZone = this.resolveCurrentZone(zoneId);
    if (!currentZone) {
      return configuredOutput;
    }

    return currentZone.outputs?.find((output) => output.output_id === configuredOutput.output_id) ?? configuredOutput;
  }

  public setEntityState(entityId: string, state: uc.MediaPlayerStates) {
    // ignore zone if it's not in our zone configuration
    if (!this.config.hasZone(entityId)) {
      return;
    }
    this.driver.getConfiguredEntities().updateEntityAttributes(entityId, {
      [uc.MediaPlayerAttributes.State]: state
    });
  }

  async init() {
    this.roon.init_services({
      required_services: [RoonApiTransport, RoonApiBrowse],
      provided_services: [this.roonApiStatus]
    });
    this.roonApiStatus.set_status("Disconnected", false);
    this.roon.start_discovery();
  }
}
