/**
 * Roon integration driver for Remote Two/3.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import * as uc from "@unfoldedcircle/integration-api";
import { AbortDriverSetup } from "@unfoldedcircle/integration-api";
import log from "./loggers.js";
import RoonApi, { Core, Zone } from "node-roon-api";
import RoonApiImage from "node-roon-api-image";
import RoonApiStatus from "node-roon-api-status";
import RoonApiTransport, { SubscribeZoneChanged, SubscribeZoneSubscribed } from "node-roon-api-transport";
import Config from "./config.js";
import { convertImageToBase64, delay, getLoopMode, mediaPlayerAttributesFromZone, newEntityFromZone } from "./util.js";

import os from "os";

export default class RoonDriver {
  private driver: uc.IntegrationAPI;
  private readonly roon: RoonApi;
  private readonly roonApiStatus: RoonApiStatus;
  private roonCore: Core | null = null;
  private roonImage: RoonApiImage | null = null;
  private roonTransport: RoonApiTransport | null = null;
  private roonPaired = false;
  private config: Config;

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
      log_level: "none",
      core_paired: this.handleRoonCorePaired.bind(this),
      core_unpaired: this.handleRoonCoreUnpaired.bind(this),
      configDir: this.driver.getConfigDirPath()
    });

    this.roonApiStatus = new RoonApiStatus(this.roon);
    this.roonTransport = new RoonApiTransport(this.roon);
    this.roonImage = new RoonApiImage({} as any);
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
      // TODO redesign setup flow: do we really want to delete the configration at this point?
      //      This should be done as late as possible: the user should not loose the old cfg if setup fails!
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
      const entity = newEntityFromZone(zone, true);
      entity.setCmdHandler(this.handleEntityCommand.bind(this));
      this.driver.addAvailableEntity(entity);
      count++;
    });

    if (count == 0) {
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
      if (entity) {
        log.info(`Subscribe: ${entityId}`);

        // update entity with current Zone information
        const zone = this.roonTransport?.zone_by_zone_id(entityId);
        if (zone) {
          log.debug(`Zone data: ${JSON.stringify(zone)}`);
          const attr = mediaPlayerAttributesFromZone(zone);
          this.driver.getConfiguredEntities().updateEntityAttributes(entity.id, attr);
        } else {
          // Send entity change with last known information to update UI
          this.driver.emit(uc.Events.EntityAttributesUpdated, entity.id, entity.entity_type, entity.attributes);
        }
      }
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
    // TODO #56 force Roon disconnect, but how?
  }

  private async handleExitStandby() {
    log.debug("exit standby");
    // TODO #56 force Roon reconnect
    // No disconnect method found in API! Let's try sending a request, maybe this triggers a reconnect
    this.roonTransport?.get_zones();
    this.roonApiStatus?.set_status("Connected", false);
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
          if (data.zones_added) {
            data.zones_added.forEach((zone: Zone) => {
              log.info(`Zone added: ${zone.display_name}`);
              this.updateMediaPlayerFromZone(zone);
            });
          }

          if (data.zones_removed) {
            data.zones_removed.forEach((zone_id) => {
              log.info(`Zone removed: ${zone_id}`);
              this.setEntityState(zone_id, uc.MediaPlayerStates.Unavailable);
            });
          }

          if (data.zones_changed) {
            data.zones_changed.forEach((zone: Zone) => {
              log.debug(`Zone changed: ${zone.display_name}`);
              this.updateMediaPlayerFromZone(zone);
            });
          } else if (data.zones_seek_changed) {
            data.zones_seek_changed.forEach((zone) => {
              // ignore zone if it's not in our zone configuration
              if (!this.config.hasZone(zone.zone_id)) {
                return;
              }
              if (!this.driver.getConfiguredEntities().contains(zone.zone_id)) {
                log.debug(`Configured entity not found, not updating seek:(${zone.zone_id})`);
                return;
              }

              this.driver.getConfiguredEntities().updateEntityAttributes(zone.zone_id, {
                [uc.MediaPlayerAttributes.MediaPosition]: zone.seek_position ?? 0
              });
            });
          }
          break;
        }
        case "Subscribed": {
          const data = msg as SubscribeZoneSubscribed;
          if (data.zones) {
            data.zones.forEach((zone) => {
              if (this.updateMediaPlayerFromZone(zone)) {
                log.info(`Subscribed: ${zone.display_name}`);
              }
            });
          }
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
   * Update configured media-player entity from given zone.
   *
   * @param {Object} zone The Roon zone
   */
  private updateMediaPlayerFromZone(zone: Zone): boolean {
    if (!zone) {
      return false;
    }
    // ignore zone if it's not in our zone configuration
    if (!this.config.hasZone(zone.zone_id)) {
      return false;
    }

    if (!this.driver.getConfiguredEntities().contains(zone.zone_id)) {
      log.info(`Configured entity not found, not updating: ${zone.display_name} (${zone.zone_id})`);
      return false;
    }
    const attr = mediaPlayerAttributesFromZone(zone);
    if (zone.now_playing) {
      // TODO cache image key to avoid multiple calls
      if (!zone.now_playing.image_key) {
        attr[uc.MediaPlayerAttributes.MediaImageUrl] = "";
      } else {
        this.roonImage?.get_image(
          zone.now_playing.image_key,
          {
            scale: "fit",
            width: 480,
            height: 480,
            format: "image/jpeg"
          },
          (error, _contentType, image) => {
            if (error) {
              log.warn(`Failed to get image: ${error}`);
            } else if (image) {
              this.driver.getConfiguredEntities().updateEntityAttributes(zone.zone_id, {
                [uc.MediaPlayerAttributes.MediaImageUrl]: "data:image/png;base64," + image.toString("base64")
              });
            }
          }
        );
      }
    }
    return this.driver.getConfiguredEntities().updateEntityAttributes(zone.zone_id, attr);
  }

  private async handleRoonCorePaired(core: Core) {
    this.roonCore = core;
    this.roonPaired = true;
    this.roonImage = new RoonApiImage(core);
    this.roonTransport = core.services.RoonApiTransport as RoonApiTransport;

    log.info(`Roon Core paired: ${core.core_id} ${core.display_name} ${core.display_version}`);

    await this.subscribeRoonZones();
  }

  private handleRoonCoreUnpaired() {
    log.info("Roon Core unpaired");
    this.roonPaired = false;
    this.roonCore = null;
    this.roonImage = null;
    this.roonTransport = null;
    // #56 set all entities to unavailable if we are no longer paired with the Roon core
    // TODO enhance integration-library with helper functions to retrieve all entity IDs or update all entity states
    this.driver
      .getConfiguredEntities()
      .getEntities()
      .forEach((entity) => {
        const entityId = entity.entity_id?.toString();
        if (entityId) {
          this.setEntityState(entityId, uc.MediaPlayerStates.Unavailable);
        }
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
            const entity = newEntityFromZone(zone);
            entity.setCmdHandler(this.handleEntityCommand.bind(this));
            this.driver.addAvailableEntity(entity);
          }
          this.config.updateZone(zone);
        }
        resolve();
      });
    });
  }

  private async handleEntityCommand(
    entity: uc.Entity,
    command: string,
    params?: { [key: string]: string | number | boolean }
  ): Promise<uc.StatusCodes> {
    if (!this.roonPaired) {
      log.error(`Roon is not paired. Not executing command ${command}`);
      this.setEntityState(entity.id, uc.MediaPlayerStates.Unavailable);
      return uc.StatusCodes.ServiceUnavailable;
    }

    if (!this.roonTransport) {
      log.error(`RoonTransport is not initialized. Not executing command ${command}`);
      this.setEntityState(entity.id, uc.MediaPlayerStates.Unavailable);
      return uc.StatusCodes.ServiceUnavailable;
    }

    return new Promise((resolve) => {
      switch (command) {
        case uc.MediaPlayerCommands.PlayPause: {
          const roonCmd =
            entity?.attributes?.[uc.MediaPlayerAttributes.State] === uc.MediaPlayerStates.Playing ? "pause" : "play";
          this.roonTransport?.control(entity.id, roonCmd, async (error) => {
            if (error) {
              log.error(`Error on ${roonCmd} media player: ${error}`);
              // TODO parse `error` and handle certain error conditions like `ZoneNotFound`
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        }
        case uc.MediaPlayerCommands.Next:
          this.roonTransport?.control(entity.id, "next", async (error) => {
            if (error) {
              log.error(`Error next media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Previous:
          this.roonTransport?.control(entity.id, "previous", async (error) => {
            if (error) {
              log.error(`Error previous media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Volume: {
          const output = this.getDefaultZoneOutput(entity.id);
          if (output) {
            this.roonTransport?.change_volume(output.output_id, "absolute", Number(params?.volume), async (error) => {
              if (error) {
                log.error(`Error changing volume media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            });
          }
          break;
        }
        case uc.MediaPlayerCommands.VolumeUp: {
          const output = this.getDefaultZoneOutput(entity.id);
          if (output) {
            this.roonTransport?.change_volume(output.output_id, "relative_step", 1, async (error) => {
              if (error) {
                log.error(`Error changing volume media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            });
          } else {
            log.error(`Volume up, output not found, entity:${entity.id}`);
            resolve(uc.StatusCodes.ServiceUnavailable);
          }
          break;
        }
        case uc.MediaPlayerCommands.VolumeDown: {
          const output = this.getDefaultZoneOutput(entity.id);
          if (output) {
            this.roonTransport?.change_volume(output.output_id, "relative_step", -1, async (error) => {
              if (error) {
                log.error(`Error changing volume media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            });
          }
          break;
        }
        case uc.MediaPlayerCommands.MuteToggle: {
          const output = this.getDefaultZoneOutput(entity.id);
          if (output) {
            const roonCmd = entity.attributes?.[uc.MediaPlayerAttributes.Muted] ? "unmute" : "mute";
            this.roonTransport?.mute(output.output_id, roonCmd, async (error) => {
              if (error) {
                log.error(`Error on ${roonCmd} media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            });
          }
          break;
        }
        case uc.MediaPlayerCommands.Seek:
          this.roonTransport?.seek(entity.id, "absolute", Number(params?.media_position), async (error) => {
            if (error) {
              log.error(`Error seeking media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Shuffle:
          const shuffle = !!params?.shuffle;
          this.roonTransport?.change_settings(entity.id, { shuffle }, async (error) => {
            if (error) {
              log.error(`Shuffle error: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Repeat:
          let loop = getLoopMode(params?.repeat.toString());
          this.roonTransport?.change_settings(entity.id, { loop }, async (error) => {
            if (error) {
              log.error(`Repeat error: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        default:
          log.warn(`Unknown entity command: ${command}`);
          resolve(uc.StatusCodes.BadRequest);
      }
    });
  }

  private getDefaultZoneOutput(zoneId: string) {
    return this.config.getZone(zoneId)?.outputs?.[0];
  }

  private setEntityState(entityId: string, state: uc.MediaPlayerStates) {
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
      required_services: [RoonApiTransport, RoonApiImage],
      provided_services: [this.roonApiStatus]
    });
    this.roonApiStatus.set_status("Disconnected", false);
    this.roon.start_discovery();
  }
}
