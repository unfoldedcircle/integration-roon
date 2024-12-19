/**
 * Roon integration driver for Remote Two/3.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import * as uc from "@unfoldedcircle/integration-api";
import { AbortDriverSetup } from "@unfoldedcircle/integration-api";
import RoonApi, { Core, Zone } from "node-roon-api";
import RoonApiImage from "node-roon-api-image";
import RoonApiStatus from "node-roon-api-status";
import RoonApiTransport, { SubscribeZoneChanged, SubscribeZoneSubscribed } from "node-roon-api-transport";
import Config from "./config.js";
import { convertImageToBase64, delay, mediaPlayerAttributesFromZone, newEntityFromZone } from "./util.js";

import os from "os";

export default class RoonDriver {
  private driver: uc.IntegrationAPI;
  private roon: RoonApi;
  private roonApiStatus: RoonApiStatus;
  private roonCore: Core | null = null;
  private roonImage: RoonApiImage | null = null;
  private roonTransport: RoonApiTransport;
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
    console.error("[uc_roon] Unknown Roon integration setup message", msg);
    return new uc.AbortDriverSetup("Unknown Roon integration setup message");
  }

  private handleDriverSetupRequest(msg: uc.DriverSetupRequest): uc.SetupAction {
    if (msg.reconfigure) {
      this.config.clear();
    }
    const img = convertImageToBase64("./assets/setupimg.png");
    if (!img) {
      console.error("[uc_roon] Failed to convert image to base64");
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
      return new uc.SetupComplete();
    }
    return new uc.SetupError("Failed to pair with Roon");
  }

  private initLocalZones() {
    this.config.forEachZone((zone) => {
      const entity = newEntityFromZone(zone, true);
      entity.setCmdHandler(this.handleEntityCommand.bind(this));
      this.driver.addAvailableEntity(entity);
    });
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
    try {
      await this.driver.setDeviceState(uc.DeviceStates.Connected);
    } catch (e) {
      console.error(`[uc_roon] Failed to get Roon zones: ${e}`);
      await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
    }
  }

  private async handleSubscribeEntities(entityIds: string[]) {
    if (!this.roonCore) {
      console.warn("[uc_roon] Can't send entity data after subscribe: Roon core not available");
      return;
    }

    entityIds.forEach((entityId) => {
      const entity = this.driver.getConfiguredEntities().getEntity(entityId);
      if (entity) {
        console.log(`[uc_roon] Subscribe: ${entityId}`);

        // update entity with current Zone information
        const zone = this.roonTransport?.zone_by_zone_id(entityId);
        if (zone) {
          console.log(`[uc_roon] Zone data: ${JSON.stringify(zone)}`);
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
    // TODO unsubscribe from Roon?
    await this.driver.setDeviceState(uc.DeviceStates.Disconnected);
  }

  private async handleEnterStandby() {
    this.roonApiStatus?.set_status("Disconnected", false);
  }

  private async handleExitStandby() {
    this.roonApiStatus?.set_status("Connected", false);
  }

  private async subscribeRoonZones() {
    if (this.roonCore == null) {
      console.warn("[uc_roon] Cannot subscribe to Roon zones. RoonCore is null.");
      return;
    }

    if (this.roonTransport == null) {
      console.warn("[uc_roon] Cannot subscribe to Roon zones. RoonTransport is null.");
      return;
    }

    // add event listeners to roon
    this.roonTransport.subscribe_zones(async (cmd, msg) => {
      switch (cmd) {
        case "Changed": {
          const data = msg as SubscribeZoneChanged;
          if (data.zones_changed) {
            data.zones_changed.forEach((zone: Zone) => {
              console.log(`[uc_roon] Change: ${zone.display_name} (${zone.zone_id})`);
              this.updateMediaPlayerFromZone(zone);
            });
          } else if (data.zones_seek_changed) {
            data.zones_seek_changed.forEach((zone) => {
              if (!this.driver.getConfiguredEntities().contains(zone.zone_id)) {
                console.log(`[uc_roon] Configured entity not found, not updating seek:(${zone.zone_id})`);
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
              console.log(`[uc_roon] Subscribed: ${zone.display_name} (${zone.zone_id})`);
              this.updateMediaPlayerFromZone(zone);
            });
          }
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
  private updateMediaPlayerFromZone(zone: Zone) {
    if (!zone) {
      return;
    }
    if (!this.driver.getConfiguredEntities().contains(zone.zone_id)) {
      console.log(`[uc_roon] Configured entity not found, not updating: ${zone.display_name} (${zone.zone_id})`);
      return;
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
          (error, contentType, image) => {
            if (error) {
              console.warn(`[uc_roon] Failed to get image: ${error}`);
            } else if (image) {
              this.driver.getConfiguredEntities().updateEntityAttributes(zone.zone_id, {
                [uc.MediaPlayerAttributes.MediaImageUrl]: "data:image/png;base64," + image.toString("base64")
              });
            }
          }
        );
      }
    }
    this.driver.getConfiguredEntities().updateEntityAttributes(zone.zone_id, attr);
  }

  private async handleRoonCorePaired(core: Core) {
    this.roonCore = core;
    this.roonPaired = true;
    this.roonImage = new RoonApiImage(core);
    this.roonTransport = core.services.RoonApiTransport as RoonApiTransport;

    console.log(`[uc_roon] Roon Core paired: ${core.core_id} ${core.display_name} ${core.display_version}`);

    await this.getRoonZones();
    await this.subscribeRoonZones();
  }

  private handleRoonCoreUnpaired() {
    console.log("[uc_roon] Roon Core unpaired");
    this.roonPaired = false;
    this.roonCore = null;
    this.roonImage = null;
  }

  private async getRoonZones(): Promise<void> {
    if (this.roonCore == null) {
      console.warn("[uc_roon] Cannot get Roon zones. RoonCore is null.");
      return;
    }

    if (this.roonTransport == null) {
      console.warn("[uc_roon] Cannot get Roon zones. RoonTransport is null.");
      return;
    }

    return new Promise((resolve, reject) => {
      this.roonTransport.get_zones(async (error, data) => {
        if (error) {
          console.warn("[uc_roon] Failed to get Roon Zones");
          reject(error);
        }

        // clear config every time we fetch zones
        // so we can keep track of available zones
        this.config.clear();
        for (const zone of data.zones) {
          console.log(`[uc_roon] Found available zone: ${zone.display_name} (${zone.zone_id})`);
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
      console.error(`[uc_roon] Roon is not paired. Not executing command ${command}`);
      return uc.StatusCodes.ServerError;
    }

    if (!this.roonTransport) {
      console.error(`[uc_roon] RoonTransport is not initialized. Not executing command ${command}`);
      return uc.StatusCodes.ServerError;
    }

    return new Promise((resolve) => {
      switch (command) {
        case uc.MediaPlayerCommands.PlayPause: {
          const roonCmd =
            entity?.attributes?.[uc.MediaPlayerAttributes.State] === uc.MediaPlayerStates.Playing ? "pause" : "play";
          this.roonTransport.control(entity.id, roonCmd, async (error) => {
            if (error) {
              console.error(`[uc_roon] Error on ${roonCmd} media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        }
        case uc.MediaPlayerCommands.Next:
          this.roonTransport.control(entity.id, "next", async (error) => {
            if (error) {
              console.error(`[uc_roon] Error next media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Previous:
          this.roonTransport.control(entity.id, "previous", async (error) => {
            if (error) {
              console.error(`[uc_roon] Error previous media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        case uc.MediaPlayerCommands.Volume: {
          const output = this.getDefaultZoneOutput(entity.id);
          if (output) {
            this.roonTransport.change_volume(output.output_id, "absolute", Number(params?.volume), async (error) => {
              if (error) {
                console.error(`[uc_roon] Error changing volume media player: ${error}`);
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
            this.roonTransport.change_volume(output.output_id, "relative_step", 1, async (error) => {
              if (error) {
                console.error(`[uc_roon] Error changing volume media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            });
          } else {
            console.error(`[uc_roon] Volume up, output not found, entity:${entity.id}`);
            resolve(uc.StatusCodes.ServiceUnavailable);
          }
          break;
        }
        case uc.MediaPlayerCommands.VolumeDown: {
          const output = this.getDefaultZoneOutput(entity.id);
          if (output) {
            this.roonTransport.change_volume(output.output_id, "relative_step", -1, async (error) => {
              if (error) {
                console.error(`[uc_roon] Error changing volume media player: ${error}`);
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
            this.roonTransport.mute(output.output_id, roonCmd, async (error) => {
              if (error) {
                console.error(`[uc_roon] Error on ${roonCmd} media player: ${error}`);
                resolve(uc.StatusCodes.ServerError);
              } else {
                resolve(uc.StatusCodes.Ok);
              }
            });
          }
          break;
        }
        case uc.MediaPlayerCommands.Seek:
          this.roonTransport.seek(entity.id, "absolute", Number(params?.media_position), async (error) => {
            if (error) {
              console.error(`[uc_roon] Error seeking media player: ${error}`);
              resolve(uc.StatusCodes.ServerError);
            } else {
              resolve(uc.StatusCodes.Ok);
            }
          });
          break;
        default:
          console.warn(`[uc_roon] Unknown entity command: ${command}`);
          resolve(uc.StatusCodes.BadRequest);
      }
    });
  }

  private getDefaultZoneOutput(zoneId: string) {
    return this.config.getZone(zoneId)?.outputs?.[0];
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
