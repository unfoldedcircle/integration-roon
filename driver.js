"use strict";

import * as uc from "@unfoldedcircle/integration-api";
import RoonApi from "node-roon-api";
import RoonApiStatus from "node-roon-api-status";
import RoonApiTransport from "node-roon-api-transport";
import RoonApiImage from "node-roon-api-image";
import fs from "fs";

const driver = new uc.IntegrationAPI();
driver.init("driver.json");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// roon global variables
let RoonCore = null;
let RoonTransport = null;
const RoonZones = {};
let RoonPaired = false;
let RoonImage = null;

async function handleEntityCommand(entity, cmdId, params) {
  // console.log(`[uc_roon] ENTITY COMMAND: ${JSON.stringify(entity, null, 2)} ${cmdId}`);
  console.log("--------------------------------");
  console.log("find", driver.getConfiguredEntities().getEntity(entity.id));
  console.log("--------------------------------");
  console.log("entity", entity);
  console.log("--------------------------------");

  if (!RoonPaired) {
    console.error(`[uc_roon] Roon is not paired. Not executing command ${cmdId}`);
  }

  switch (cmdId) {
    case uc.MediaPlayerCommands.PlayPause:
      if (entity.attributes.state === uc.MediaPlayerStates.Playing) {
        RoonTransport.control(entity.id, "pause", async (error) => {
          if (error) {
            console.error(`[uc_roon] Error pausing media player: ${error}`);
            return uc.StatusCodes.ServerError;
          }
          return uc.StatusCodes.Ok;
        });
      } else {
        RoonTransport.control(entity.id, "play", async (error) => {
          if (error) {
            console.error(`[uc_roon] Error playing media player: ${error}`);
            return uc.StatusCodes.ServerError;
          }
          return uc.StatusCodes.Ok;
        });
      }
      break;

    case uc.MediaPlayerCommands.Next:
      RoonTransport.control(entity.id, "next", async (error) => {
        if (error) {
          console.error(`[uc_roon] Error next media player: ${error}`);
          return uc.StatusCodes.ServerError;
        }
        return uc.StatusCodes.Ok;
      });
      break;

    case uc.MediaPlayerCommands.Previous:
      RoonTransport.control(entity.id, "previous", async (error) => {
        if (error) {
          console.error(`[uc_roon] Error previous media player: ${error}`);
          return uc.StatusCodes.ServerError;
        }
        return uc.StatusCodes.Ok;
      });
      break;

    case uc.MediaPlayerCommands.Volume:
      if (RoonZones[entity.id] && RoonZones[entity.id].outputs && RoonZones[entity.id].outputs[0]) {
        RoonTransport.change_volume(
          RoonZones[entity.id].outputs[0].output_id,
          "absolute",
          params.volume,
          async (error) => {
            if (error) {
              console.error(`[uc_roon] Error changing volume media player: ${error}`);
              return uc.StatusCodes.ServerError;
            }
            return uc.StatusCodes.Ok;
          }
        );
      } else {
        return uc.StatusCodes.ServiceUnavailable;
      }
      break;

    case uc.MediaPlayerCommands.VolumeUp:
      if (RoonZones[entity.id] && RoonZones[entity.id].outputs && RoonZones[entity.id].outputs[0]) {
        RoonTransport.change_volume(RoonZones[entity.id].outputs[0].output_id, "relative_step", 1, async (error) => {
          if (error) {
            console.error(`[uc_roon] Error changing volume media player: ${error}`);
            return uc.StatusCodes.ServerError;
          }
          return uc.StatusCodes.Ok;
        });
      } else {
        return uc.StatusCodes.ServiceUnavailable;
      }
      break;

    case uc.MediaPlayerCommands.VolumeDown:
      if (RoonZones[entity.id] && RoonZones[entity.id].outputs && RoonZones[entity.id].outputs[0]) {
        RoonTransport.change_volume(RoonZones[entity.id].outputs[0].output_id, "relative_step", -1, async (error) => {
          if (error) {
            console.error(`[uc_roon] Error changing volume media player: ${error}`);
            return uc.StatusCodes.ServerError;
          }
          return uc.StatusCodes.Ok;
        });
      } else {
        return uc.StatusCodes.ServiceUnavailable;
      }
      break;

    case uc.MediaPlayerCommands.MuteToggle:
      if (RoonZones[entity.id] && RoonZones[entity.id].outputs && RoonZones[entity.id].outputs[0]) {
        if (entity.attributes.muted) {
          RoonTransport.mute(RoonZones[entity.id].outputs[0].output_id, "unmute", async (error) => {
            if (error) {
              console.error(`[uc_roon] Error unmuting media player: ${error}`);
              return uc.StatusCodes.ServerError;
            }
            return uc.StatusCodes.Ok;
          });
        } else {
          RoonTransport.mute(RoonZones[entity.id].outputs[0].output_id, "mute", async (error) => {
            if (error) {
              console.error(`[uc_roon] Error muting media player: ${error}`);
              return uc.StatusCodes.ServerError;
            }
            return uc.StatusCodes.Ok;
          });
        }
      } else {
        return uc.StatusCodes.ServiceUnavailable;
      }
      break;

    case uc.MediaPlayerCommands.Seek:
      RoonTransport.seek(entity.id, "absolute", params.media_position, async (error) => {
        if (error) {
          console.error(`[uc_roon] Error seeking media player: ${error}`);
          return uc.StatusCodes.ServerError;
        }
        return uc.StatusCodes.Ok;
      });
      break;

    default:
      console.warn(`[uc_roon] Unknown entity command: ${cmdId}`);
      return uc.StatusCodes.BadRequest;
  }
}

driver.on(uc.Events.Connect, async () => {
  roonExtentionStatus.set_status("Connected", false);
  try {
    await getRoonZones();
    await driver.setDeviceState(uc.DeviceStates.Connected);
  } catch (e) {
    console.log(`[uc_roon] Failed to get Roon zones: ${e}`);
    await driver.setDeviceState(uc.DeviceStates.Disconnected);
  }
});

driver.on(uc.Events.SubscribeEntities, async (entityIds) => {
  console.log(`[uc_roon] Subscribing to entities: ${entityIds}`);
  if (RoonCore == null) {
    console.log("[uc_roon] Can't send entity data after subscribe: Roon core not available");
    return;
  }

  const roonTransport = RoonCore.services.RoonApiTransport;

  entityIds.forEach((entityId) => {
    const entity = driver.getConfiguredEntities().getEntity(entityId);
    if (entity) {
      console.log(`[uc_roon] Subscribe: ${entityId}`);

      // update entity with current Zone information
      const zone = roonTransport.zone_by_zone_id(entityId);
      if (zone) {
        console.log(`[uc_roon] Zone data: ${JSON.stringify(zone)}`);
        const attr = mediaPlayerAttributesFromZone(zone);
        console.log(`[uc_roon] Attributes: ${entityId} ${JSON.stringify(attr)}`);
        driver.getConfiguredEntities().updateEntityAttributes(entityId, attr);
      } else {
        // Send entity change with last known information to update UI
        driver.emit(uc.Events.EntityAttributesUpdated, entity.id, entity.entity_type, entity.attributes);
      }
    }
  });
});

driver.on(uc.Events.Disconnect, async () => {
  roonExtentionStatus.set_status("Disconnected", false);
  // TODO unsubscribe from Roon?
  await driver.setDeviceState(uc.DeviceStates.Disconnected);
});

driver.on(uc.Events.EnterStandby, async () => {
  roonExtentionStatus.set_status("Disconnected", false);
});

driver.on(uc.Events.ExitStandby, async () => {
  roonExtentionStatus.set_status("Connected", false);
});

// DRIVER SETUP
driver.on(uc.Events.SetupDriver, async (wsHandle, setupData) => {
  console.log(`[uc_roon] Setting up driver. Setup data: ${setupData}`);

  await driver.acknowledgeCommand(wsHandle);
  console.log("[uc_roon] Acknowledged driver setup");

  const img = convertImageToBase64("./assets/setupimg.png");
  await driver.requestDriverSetupUserConfirmation(
    wsHandle,
    "User action needed",
    "Please open Roon, navigate to *Settings/Extensions* and click *Enable* next to the Unfolded Circle Roon Integration.\n\nThen click Next.",
    img
  );
});

driver.on(uc.Events.SetupDriverUserConfirmation, async (wsHandle) => {
  console.log("[uc_roon] Received user confirmation for driver setup: sending OK");
  await driver.acknowledgeCommand(wsHandle);

  // Update setup progress
  await driver.driverSetupProgress(wsHandle);
  console.log("[uc_roon] Sending setup progress that we are still busy...");

  await delay(3000);

  if (RoonPaired) {
    console.log("[uc_roon] Driver setup completed!");
    await getRoonZones();
    await driver.driverSetupComplete(wsHandle);
  } else {
    await driver.driverSetupError(wsHandle, "Failed to pair with Roon.");
    console.error("[uc_roon] Failed to pair with Roon");
  }
});
// END DRIVER SETUP

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

const roon = new RoonApi({
  extension_id: "com.uc.remote",
  display_name: "Unfolded Circle Roon Integration",
  display_version: driver.getDriverVersion().version.driver,
  publisher: "Unfolded Circle",
  email: "support@unfoldedcircle.com",
  website: "https://unfoldedcircle.com",
  log_level: "none", // #9 disable excessive msg logging (album art image buffer)

  core_paired: async (core) => {
    RoonCore = core;
    RoonPaired = true;
    RoonImage = new RoonApiImage(core);

    console.log(`[uc_roon] Roon Core paired: ${core.core_id} ${core.display_name} ${core.display_version}`);

    await getRoonZones();
    await subscribeRoonZones();
  },

  core_unpaired: (core) => {
    RoonPaired = false;

    console.log(`[uc_roon] Roon Core unpaired: ${core.core_id} ${core.display_name} ${core.display_version}`);

    const entities = driver.configuredEntities.getEntities();

    for (const entity of entities) {
      if (entity.entity_id) {
        const attr = new Map([]);
        attr.set([uc.MediaPlayerAttributes.State], uc.MediaPlayerStates.Unavailable);
        driver.configuredEntities.updateEntityAttributes(entity.entity_id, attr);
      }
    }

    // TODO(marton): Do we need to do anything here? It seems like it pairs automatically again after some time.
  }
});

const roonExtentionStatus = new RoonApiStatus(roon);

async function getRoonZones() {
  if (RoonCore == null) {
    console.log("[uc_roon] Cannot get Roon zones. RoonCore is null.");
    return;
  }

  console.log("[uc_roon] Getting Roon Zones");
  RoonTransport = RoonCore.services.RoonApiTransport;

  RoonTransport.get_zones(async (error, data) => {
    if (error) {
      console.log("[uc_roon] Failed to get Roon Zones");
      return;
    }

    for (const zone of data.zones) {
      console.log(`[uc_roon] Found zone: ${zone.display_name} (${zone.zone_id})`);
      RoonZones[zone.zone_id] = {
        outputs: zone.outputs
      };

      // todo: driver should expose metod to get entity by id
      const res = driver.getAvailableEntities().contains(zone.zone_id);
      if (!res) {
        // TODO add & test REPEAT, SHUFFLE
        const features = [
          uc.MediaPlayerFeatures.OnOff,
          uc.MediaPlayerFeatures.MuteToggle,
          uc.MediaPlayerFeatures.PlayPause,
          uc.MediaPlayerFeatures.Next,
          uc.MediaPlayerFeatures.Previous,
          uc.MediaPlayerFeatures.Seek,
          uc.MediaPlayerFeatures.MediaDuration,
          uc.MediaPlayerFeatures.MediaPosition,
          uc.MediaPlayerFeatures.MediaTitle,
          uc.MediaPlayerFeatures.MediaArtist,
          uc.MediaPlayerFeatures.MediaAlbum,
          uc.MediaPlayerFeatures.MediaImageUrl
        ];

        if (zone.outputs && zone.outputs[0] && zone.outputs[0].volume) {
          // FIXME #25 not all Roon zones support volume setting! Check for `type: incremental`
          features.push(uc.MediaPlayerFeatures.Volume);
          features.push(uc.MediaPlayerFeatures.VolumeUpDown);
        }

        const attributes = mediaPlayerAttributesFromZone(zone);

        const entity = new uc.MediaPlayer(zone.zone_id, new Map([["en", zone.display_name]]), {
          features,
          attributes
        });
        entity.setCmdHandler(handleEntityCommand);
        driver.addAvailableEntity(entity);
      }
    }
  });
}
async function subscribeRoonZones() {
  // add event listeners to roon
  if (RoonCore != null) {
    RoonTransport = RoonCore.services.RoonApiTransport;

    RoonTransport.subscribe_zones(async (cmd, data) => {
      if (cmd === "Changed") {
        if (data.zones_changed) {
          data.zones_changed.forEach((zone) => {
            console.log(`[uc_roon] Change: ${zone.display_name} (${zone.zone_id})`);
            updateMediaPlayerFromZone(zone);
          });
        } else if (data.zones_seek_changed) {
          data.zones_seek_changed.forEach((zone) => {
            if (!driver.getConfiguredEntities().contains(zone.zone_id)) {
              console.log(
                `[uc_roon] Configured entity not found, not updating seek: ${zone.display_name} (${zone.zone_id})`
              );
              return;
            }

            driver
              .getConfiguredEntities()
              .updateEntityAttributes(
                zone.zone_id,
                new Map([[uc.MediaPlayerAttributes.MediaPosition, zone.seek_position]])
              );
          });
        }
      } else if (cmd === "Subscribed") {
        if (data.zones) {
          data.zones.forEach((zone) => {
            console.log(`[uc_roon] Subscribed: ${zone.display_name} (${zone.zone_id})`);
            updateMediaPlayerFromZone(zone);
          });
        }
      }
    });
  }
}

/**
 * Update configured media-player entity from given zone.
 *
 * @param {Object} zone The Roon zone
 */
function updateMediaPlayerFromZone(zone) {
  if (!zone) {
    return;
  }

  if (!driver.getConfiguredEntities().contains(zone.zone_id)) {
    console.log(`[uc_roon] Configured entity not found, not updating: ${zone.display_name} (${zone.zone_id})`);
    return;
  }

  const attr = mediaPlayerAttributesFromZone(zone);

  if (zone.now_playing) {
    // TODO cache image key to avoid multiple calls
    if (zone.now_playing.image_key) {
      RoonImage.get_image(
        zone.now_playing.image_key,
        {
          scale: "fit",
          width: 480,
          height: 480,
          format: "image/jpeg"
        },
        (error, contentType, image) => {
          if (error) {
            console.log(`[uc_roon] Failed to get image: ${error}`);
          } else if (image) {
            const imageResponse = new Map([]);
            imageResponse.set(
              [uc.MediaPlayerAttributes.MediaImageUrl],
              "data:image/png;base64," + image.toString("base64")
            );
            driver.getConfiguredEntities().updateEntityAttributes(zone.zone_id, imageResponse);
          }
        }
      );
    } else {
      attr.set([uc.MediaPlayerAttributes.MediaImageUrl], "");
    }
  }

  driver.getConfiguredEntities().updateEntityAttributes(zone.zone_id, attr);
}

/**
 * Extract media-player attributes from what's playing in the given Roon zone.
 *
 * The media image is not updated. This must be handled manually to avoid excessive media image fetching.
 *
 * @param {Object} zone The Roon zone
 * @returns {Map<string, any>} media-player attribute map
 */
function mediaPlayerAttributesFromZone(zone) {
  const attr = new Map([]);

  if (!zone) {
    return attr;
  }

  // state
  switch (zone.state) {
    case "playing":
      attr.set([uc.MediaPlayerAttributes.State], uc.MediaPlayerStates.Playing);
      break;

    case "stopped":
    case "paused":
      attr.set([uc.MediaPlayerAttributes.State], uc.MediaPlayerStates.Paused);
      break;
  }

  if (zone.outputs && zone.outputs[0] && zone.outputs[0].volume) {
    // volume
    attr.set([uc.MediaPlayerAttributes.Volume], zone.outputs[0].volume.value);

    // muted
    attr.set([uc.MediaPlayerAttributes.Muted], zone.outputs[0].volume.is_muted);
  }

  let mediaDuration = 0;
  let mediaPosition = 0;
  let mediaTitle = "";
  let mediaArtist = "";
  let mediaAlbum = "";

  if (zone.now_playing) {
    if (zone.now_playing.three_line) {
      mediaTitle = zone.now_playing.three_line.line1;
      mediaArtist = zone.now_playing.three_line.line2;
      mediaAlbum = zone.now_playing.three_line.line3;
    }

    if (zone.now_playing.length) {
      mediaDuration = zone.now_playing.length;
    }
    if (zone.now_playing.seek_position) {
      mediaPosition = zone.now_playing.seek_position;
    }
  }

  attr.set([uc.MediaPlayerAttributes.MediaTitle], mediaTitle);
  attr.set([uc.MediaPlayerAttributes.MediaArtist], mediaArtist);
  attr.set([uc.MediaPlayerAttributes.MediaAlbum], mediaAlbum);
  attr.set([uc.MediaPlayerAttributes.MediaDuration], mediaDuration);
  attr.set([uc.MediaPlayerAttributes.MediaPosition], mediaPosition);

  return attr;
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
function convertImageToBase64(file) {
  let data = null;

  try {
    data = fs.readFileSync(file, "base64");
  } catch (e) {
    console.log(e);
  }

  return data;
}

async function init() {
  roon.init_services({
    required_services: [RoonApiTransport, RoonApiImage],
    provided_services: [roonExtentionStatus]
  });
  roonExtentionStatus.set_status("Disconnected", false);
  roon.start_discovery();
}

init();
