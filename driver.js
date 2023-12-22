"use strict";

const uc = require("uc-integration-api");
uc.init("driver.json");

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const fs = require("fs");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// roon global variables
let RoonCore = null;
let RoonTransport = null;
const RoonZones = {};
let RoonPaired = false;
let RoonImage = null;

uc.on(uc.EVENTS.ENTITY_COMMAND, async (wsHandle, entityId, entityType, cmdId, params) => {
  console.log(`[uc_roon] ENTITY COMMAND: ${wsHandle} ${entityId} ${entityType} ${cmdId}`);

  if (!RoonPaired) {
    console.error(`[uc_roon] Roon is not paired. Not executing command ${cmdId}`);
  }

  const entity = uc.configuredEntities.getEntity(entityId);
  if (entity == null) {
    console.warn(`[uc_roon] Entity ${entityId} is not configured: cannot execute command ${cmdId}`);
    await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.BAD_REQUEST);
    return;
  }

  switch (cmdId) {
    case uc.Entities.MediaPlayer.COMMANDS.PLAY_PAUSE:
      if (entity.attributes.state === uc.Entities.MediaPlayer.STATES.PLAYING) {
        RoonTransport.control(entityId, "pause", async (error) => {
          await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
        });
      } else {
        RoonTransport.control(entityId, "play", async (error) => {
          await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
        });
      }
      break;

    case uc.Entities.MediaPlayer.COMMANDS.NEXT:
      RoonTransport.control(entityId, "next", async (error) => {
        await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
      });
      break;

    case uc.Entities.MediaPlayer.COMMANDS.PREVIOUS:
      RoonTransport.control(entityId, "previous", async (error) => {
        await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
      });
      break;

    case uc.Entities.MediaPlayer.COMMANDS.VOLUME:
      if (RoonZones[entityId] && RoonZones[entityId].outputs && RoonZones[entityId].outputs[0]) {
        RoonTransport.change_volume(
          RoonZones[entityId].outputs[0].output_id,
          "absolute",
          params.volume,
          async (error) => {
            await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
          }
        );
      } else {
        await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.SERVICE_UNAVAILABLE);
      }
      break;

    case uc.Entities.MediaPlayer.COMMANDS.VOLUME_UP:
      if (RoonZones[entityId] && RoonZones[entityId].outputs && RoonZones[entityId].outputs[0]) {
        RoonTransport.change_volume(RoonZones[entityId].outputs[0].output_id, "relative_step", 1, async (error) => {
          await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
        });
      } else {
        await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.SERVICE_UNAVAILABLE);
      }
      break;

    case uc.Entities.MediaPlayer.COMMANDS.VOLUME_DOWN:
      if (RoonZones[entityId] && RoonZones[entityId].outputs && RoonZones[entityId].outputs[0]) {
        RoonTransport.change_volume(RoonZones[entityId].outputs[0].output_id, "relative_step", -1, async (error) => {
          await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
        });
      } else {
        await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.SERVICE_UNAVAILABLE);
      }
      break;

    case uc.Entities.MediaPlayer.COMMANDS.MUTE_TOGGLE:
      if (RoonZones[entityId] && RoonZones[entityId].outputs && RoonZones[entityId].outputs[0]) {
        if (entity.attributes.muted) {
          RoonTransport.mute(RoonZones[entityId].outputs[0].output_id, "unmute", async (error) => {
            await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
          });
        } else {
          RoonTransport.mute(RoonZones[entityId].outputs[0].output_id, "mute", async (error) => {
            await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
          });
        }
      } else {
        await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.SERVICE_UNAVAILABLE);
      }
      break;

    case uc.Entities.MediaPlayer.COMMANDS.SEEK:
      RoonTransport.seek(entityId, "absolute", params.media_position, async (error) => {
        await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
      });
      break;

    default:
      console.warn(`[uc_roon] Unknown entity command: ${cmdId}`);
      await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.BAD_REQUEST);
      break;
  }
});

uc.on(uc.EVENTS.CONNECT, async () => {
  roonExtentionStatus.set_status("Connected", false);
  try {
    await getRoonZones();
    await uc.setDeviceState(uc.DEVICE_STATES.CONNECTED);
  } catch (e) {
    console.log(`[uc_roon] Failed to get Roon zones: ${e}`);
    await uc.setDeviceState(uc.DEVICE_STATES.DISCONNECTED);
  }
});

uc.on(uc.EVENTS.SUBSCRIBE_ENTITIES, async (entityIds) => {
  if (RoonCore == null) {
    console.log("[uc_roon] Can't send entity data after subscribe: Roon core not available");
    return;
  }

  const roonTransport = RoonCore.services.RoonApiTransport;

  entityIds.forEach((entityId) => {
    const entity = uc.configuredEntities.getEntity(entityId);
    if (entity) {
      console.log(`[uc_roon] Subscribe: ${entityId}`);

      // update entity with current Zone information
      const zone = roonTransport.zone_by_zone_id(entityId);
      if (zone) {
        console.log(`[uc_roon] Zone data: ${JSON.stringify(zone)}`);
        const attr = mediaPlayerAttributesFromZone(zone);
        uc.configuredEntities.updateEntityAttributes(entityId, attr);
      } else {
        // Send entity change with last known information to update UI
        uc.emit(uc.EVENTS.ENTITY_ATTRIBUTES_UPDATED, entity.id, entity.entity_type, entity.attributes);
      }
    }
  });
});

uc.on(uc.EVENTS.DISCONNECT, async () => {
  roonExtentionStatus.set_status("Disconnected", false);
  // TODO unsubscribe from Roon?
  await uc.setDeviceState(uc.DEVICE_STATES.DISCONNECTED);
});

uc.on(uc.EVENTS.ENTER_STANDBY, async () => {
  roonExtentionStatus.set_status("Disconnected", false);
});

uc.on(uc.EVENTS.EXIT_STANDBY, async () => {
  roonExtentionStatus.set_status("Connected", false);
});

// DRIVER SETUP
uc.on(uc.EVENTS.SETUP_DRIVER, async (wsHandle, setupData) => {
  console.log(`[uc_roon] Setting up driver. Setup data: ${setupData}`);

  await uc.acknowledgeCommand(wsHandle);
  console.log("[uc_roon] Acknowledged driver setup");

  const img = convertImageToBase64("./assets/setupimg.png");
  await uc.requestDriverSetupUserConfirmation(
    wsHandle,
    "User action needed",
    "Please open Roon, navigate to *Settings/Extensions* and click *Enable* next to the Unfolded Circle Roon Integration.\n\nThen click Next.",
    img
  );
});

uc.on(uc.EVENTS.SETUP_DRIVER_USER_CONFIRMATION, async (wsHandle) => {
  console.log("[uc_roon] Received user confirmation for driver setup: sending OK");
  await uc.acknowledgeCommand(wsHandle);

  // Update setup progress
  await uc.driverSetupProgress(wsHandle);
  console.log("[uc_roon] Sending setup progress that we are still busy...");

  await delay(3000);

  if (RoonPaired) {
    console.log("[uc_roon] Driver setup completed!");
    await getRoonZones();
    await uc.driverSetupComplete(wsHandle);
  } else {
    await uc.driverSetupError(wsHandle, "Failed to pair with Roon.");
    console.error("[uc_roon] Failed to pair with Roon");
  }
});
// END DRIVER SETUP

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

const roon = new RoonApi({
  extension_id: "com.uc.remote",
  display_name: "Unfolded Circle Roon Integration",
  display_version: uc.getDriverVersion().version.driver,
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

    const entities = uc.configuredEntities.getEntities();

    for (const entity of entities) {
      if (entity.entity_id) {
        const attr = new Map([]);
        attr.set([uc.Entities.Light.ATTRIBUTES.STATE], uc.Entities.Light.STATES.UNAVAILABLE);
        uc.configuredEntities.updateEntityAttributes(entity.entity_id, attr);
      }
    }

    // TODO(marton): Do we need to do anything here? It seems like it pairs automatically again after some time.
  }
});

const roonExtentionStatus = new RoonApiStatus(roon);

async function getRoonZones() {
  if (RoonCore != null) {
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

        const res = uc.availableEntities.contains(zone.zone_id);
        if (!res) {
          // TODO add & test REPEAT, SHUFFLE
          const features = [
            uc.Entities.MediaPlayer.FEATURES.ON_OFF,
            uc.Entities.MediaPlayer.FEATURES.MUTE_TOGGLE,
            uc.Entities.MediaPlayer.FEATURES.PLAY_PAUSE,
            uc.Entities.MediaPlayer.FEATURES.NEXT,
            uc.Entities.MediaPlayer.FEATURES.PREVIOUS,
            uc.Entities.MediaPlayer.FEATURES.SEEK,
            uc.Entities.MediaPlayer.FEATURES.MEDIA_DURATION,
            uc.Entities.MediaPlayer.FEATURES.MEDIA_POSITION,
            uc.Entities.MediaPlayer.FEATURES.MEDIA_TITLE,
            uc.Entities.MediaPlayer.FEATURES.MEDIA_ARTIST,
            uc.Entities.MediaPlayer.FEATURES.MEDIA_ALBUM,
            uc.Entities.MediaPlayer.FEATURES.MEDIA_IMAGE_URL
          ];

          if (zone.outputs && zone.outputs[0] && zone.outputs[0].volume) {
            // FIXME #25 not all Roon zones support volume setting! Check for `type: incremental`
            features.push(uc.Entities.MediaPlayer.FEATURES.VOLUME);
            features.push(uc.Entities.MediaPlayer.FEATURES.VOLUME_UP_DOWN);
          }

          const attributes = mediaPlayerAttributesFromZone(zone);

          const entity = new uc.Entities.MediaPlayer(
            zone.zone_id,
            new Map([["en", zone.display_name]]),
            features,
            attributes
          );

          uc.availableEntities.addEntity(entity);
        }
      }
    });
  } else {
    console.log(`[uc_roon] Cannot get Roon zones. RoonCore is null.`);
  }
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
            if (!uc.configuredEntities.contains(zone.zone_id)) {
              console.log(
                `[uc_roon] Configured entity not found, not updating seek: ${zone.display_name} (${zone.zone_id})`
              );
              return;
            }

            uc.configuredEntities.updateEntityAttributes(
              zone.zone_id,
              new Map([[uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_POSITION, zone.seek_position]])
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

  if (!uc.configuredEntities.contains(zone.zone_id)) {
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
              [uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_IMAGE_URL],
              "data:image/png;base64," + image.toString("base64")
            );
            uc.configuredEntities.updateEntityAttributes(zone.zone_id, imageResponse);
          }
        }
      );
    } else {
      attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_IMAGE_URL], "");
    }
  }

  uc.configuredEntities.updateEntityAttributes(zone.zone_id, attr);
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
      attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.STATE], uc.Entities.MediaPlayer.STATES.PLAYING);
      break;

    case "stopped":
    case "paused":
      attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.STATE], uc.Entities.MediaPlayer.STATES.PAUSED);
      break;
  }

  if (zone.outputs && zone.outputs[0] && zone.outputs[0].volume) {
    // volume
    attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME], zone.outputs[0].volume.value);

    // muted
    attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.MUTED], zone.outputs[0].volume.is_muted);
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

  attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_TITLE], mediaTitle);
  attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ARTIST], mediaArtist);
  attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ALBUM], mediaAlbum);
  attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_DURATION], mediaDuration);
  attr.set([uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_POSITION], mediaPosition);

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
