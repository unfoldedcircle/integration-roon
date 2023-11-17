"use strict";

const uc = require("uc-integration-api");
uc.init("driver.json");

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const fs = require("fs");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// roon global variables
let RoonCore = null;
let RoonTransport = null;
let RoonZones = {};
let RoonPaired = false;
let RoonImage = null;

let subscribedEntities = [];

// set working directory
const process = require('process')
try {
	process.chdir(uc.configDirPath);
	console.log(`[uc_roon] Changed working directory to: ${uc.configDirPath}`);
} catch (error) {
	console.error(`[uc_roon] Error changing working directory: ${error}`);
}

uc.on(
	uc.EVENTS.ENTITY_COMMAND,
	async (wsHandle, entity_id, entity_type, cmd_id, params) => {
		console.log(
			`[uc_roon] ENTITY COMMAND: ${wsHandle} ${entity_id} ${entity_type} ${cmd_id}`
		);

		if (!RoonPaired) {
			console.error(`[uc_roon] Roon is not paird. Not executing command ${cmd_id}`);
		}

		const entity = uc.configuredEntities.getEntity(entity_id);
		if (entity == null) {
			console.warn(`[uc_roon] Entity ${entity_id} is not configured: cannot execute command ${cmd_id}`)
			await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.BAD_REQUEST);
			return
		}

		switch (cmd_id) {
			case uc.Entities.MediaPlayer.COMMANDS.PLAY_PAUSE:
				if (
					entity.attributes.state ===
					uc.Entities.MediaPlayer.STATES.PLAYING
				) {
					RoonTransport.control(entity_id, "pause", async (error) => {
						await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
					});
				} else {
					RoonTransport.control(entity_id, "play", async (error) => {
						await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
					});
				}
				break;

			case uc.Entities.MediaPlayer.COMMANDS.NEXT:
				RoonTransport.control(entity_id, "next", async (error) => {
					await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
				});
				break;

			case uc.Entities.MediaPlayer.COMMANDS.PREVIOUS:
				RoonTransport.control(entity_id, "previous", async (error) => {
					await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
				});
				break;

			case uc.Entities.MediaPlayer.COMMANDS.VOLUME:
				RoonTransport.change_volume(
					RoonZones[entity_id].outputs[0].output_id,
					"absolute",
					params.volume,
					async (error) => {
						await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
					}
				);
				break;

			case uc.Entities.MediaPlayer.COMMANDS.VOLUME_UP:
				RoonTransport.change_volume(
					RoonZones[entity_id].outputs[0].output_id,
					"relative_step", 1,
					async (error) => {
						await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
					}
				);
				break;

			case uc.Entities.MediaPlayer.COMMANDS.VOLUME_DOWN:
				RoonTransport.change_volume(
					RoonZones[entity_id].outputs[0].output_id,
					"relative_step", -1,
					async (error) => {
						await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
					}
				);
				break;

			case uc.Entities.MediaPlayer.COMMANDS.MUTE_TOGGLE:
				if (entity.attributes.muted) {
					RoonTransport.mute(
						RoonZones[entity_id].outputs[0].output_id,
						"unmute",
						async (error) => {
							await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
						}
					);
				} else {
					RoonTransport.mute(
						RoonZones[entity_id].outputs[0].output_id,
						"mute",
						async (error) => {
							await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
						}
					);
				}
				break;

			case uc.Entities.MediaPlayer.COMMANDS.SEEK:
				RoonTransport.seek(
					entity_id,
					"absolute",
					params.media_position,
					async (error) => {
						await uc.acknowledgeCommand(wsHandle, !error ? uc.STATUS_CODES.OK : uc.STATUS_CODES.SERVER_ERROR);
					}
				);
				break;

			default:
				console.warn(`[uc_roon] Unknown entity command: ${cmd_id}`)
				await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.BAD_REQUEST);
				break;
		}
	}
);

uc.on(uc.EVENTS.CONNECT, async () => {
	roonExtentionStatus.set_status("Connected", false);
	await getRoonZones(null);
	uc.setDeviceState(uc.DEVICE_STATES.CONNECTED);
});

uc.on(uc.EVENTS.DISCONNECT, async () => {
	roonExtentionStatus.set_status("Disconnected", false);
	uc.setDeviceState(uc.DEVICE_STATES.DISCONNECTED);
});

uc.on(uc.EVENTS.SUBSCRIBE_ENTITIES, async (wsHandle, entityIds) => {
	subscribedEntities = entityIds;

	entityIds.forEach(async (entityId) => {
		const entity = uc.availableEntities.getEntity(entityId);
		if (entity == null) {
			console.error(`[uc_roon] Available entity not found: ${entityId}`);
			await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.NOT_FOUND);
			return;
		}

		uc.configuredEntities.addEntity(entity);
	});

	await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.OK);
});

uc.on(uc.EVENTS.UNSUBSCRIBE_ENTITIES, async (wsHandle, entityIds) => {
	entityIds.forEach(async (entityId) => {
		console.debug(`[uc_roon] Unsubscribe: ${entityId}`);
		uc.configuredEntities.removeEntity(entityId);
	});

	await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.OK);
});

uc.on(uc.EVENTS.ENTER_STANDBY, async () => {
	roonExtentionStatus.set_status("Disconnected", false);
});

uc.on(uc.EVENTS.EXIT_STANDBY, async () => {
	roonExtentionStatus.set_status("Connected", false);
});

uc.on(uc.EVENTS.GET_AVAILABLE_ENTITIES, async (wsHandle) => {
	await getRoonZones(wsHandle);
});

// DRIVER SETUP
uc.on(uc.EVENTS.SETUP_DRIVER, async (wsHandle, setupData) => {
	console.log(`[uc_roon] Setting up driver. Setup data: ${setupData}`);

	await uc.acknowledgeCommand(wsHandle);
	console.log('[uc_roon] Acknowledged driver setup');

	const img = convertImageToBase64('/opt/uc/integrations/roon/assets/setupimg.png');
	await uc.requestDriverSetupUserConfirmation(wsHandle, 'User action needed', 'Please open Roon, navigate to *Settings/Extensions* and click *Enable* next to the Unfolded Circle Roon Integration.\n\nThen click Next.', img);
});

uc.on(uc.EVENTS.SETUP_DRIVER_USER_CONFIRMATION, async (wsHandle) => {
	console.log('[uc_roon] Received user confirmation for driver setup: sending OK');
	await uc.acknowledgeCommand(wsHandle);

	// Update setup progress
	await uc.driverSetupProgress(wsHandle);
	console.log('[uc_roon] Sending setup progress that we are still busy...');

	await delay(3000);

	if (RoonPaired) {
		console.log('[uc_roon] Driver setup completed!');
		await getRoonZones(null);
		await uc.driverSetupComplete(wsHandle);
	} else {
		await uc.driverSetupError(wsHandle, 'Failed to pair with Roon.');
		console.error("[uc_roon] Failed to pair with Roon");
	}
});
// END DRIVER SETUP

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

let roon = new RoonApi({
	extension_id: "com.uc.remote",
	display_name: "Unfolded Circle Roon Integration",
	display_version: uc.getDriverVersion().version.driver,
	publisher: "Unfolded Circle",
	email: "support@unfoldedcircle.com",
	website: "https://unfoldedcircle.com",

	core_paired: async (core) => {
		RoonCore = core;
		RoonPaired = true;
		RoonImage = new RoonApiImage(core);

		console.log(
			`[uc_roon] Roon Core paired: ${core.core_id} ${core.display_name} ${core.display_version}`
		);

		await getRoonZones(null);
	},

	core_unpaired: (core) => {
		RoonPaired = false;

		console.log(
			`[uc_roon] Roon Core unpaired: ${core.core_id} ${core.display_name} ${core.display_version}`
		);

		const entities = uc.configuredEntities.getEntities();

		for (const entity of entities) {
			if (entity.entity_id) {
				let response = new Map([]);
				response.set([uc.Entities.Light.ATTRIBUTES.STATE], uc.Entities.Light.STATES.UNAVAILABLE);
				uc.configuredEntities.updateEntityAttributes(entity.entity_id, response);
			}
		}

		// TODO(marton): Do we need to do anything here? It seems like it pairs automatically again after some time.
	},
});

const roonExtentionStatus = new RoonApiStatus(roon);

async function getRoonZones(wsHandle) {
	if (RoonCore != null) {
		console.log("[uc_roon] Getting Roon Zones");
		RoonTransport = RoonCore.services.RoonApiTransport;

		RoonTransport.get_zones(async (error, data) => {
			if (!error) {
				for (const zone of data.zones) {
					console.log(`[uc_roon] Found zone: ${zone.zone_id}`);
					RoonZones[zone.zone_id] = {
						outputs: zone.outputs,
					};

					const res = uc.availableEntities.contains(zone.zone_id);
					if (!res) {
						let state;

						switch (zone.state) {
							case "playing":
								state = uc.Entities.MediaPlayer.STATES.PLAYING;
								break;

							case "stopped":
							case "paused":
								state = uc.Entities.MediaPlayer.STATES.PAUSED;
								break;
						}

						let features = [
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
							uc.Entities.MediaPlayer.FEATURES
								.MEDIA_IMAGE_URL,
						];

						let attributes = new Map([
							[uc.Entities.MediaPlayer.ATTRIBUTES.STATE,
								state],
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_DURATION, zone.now_playing
								? zone.now_playing.length
									? zone.now_playing.length
									: 0
								: 0],
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_POSITION, 0],
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_IMAGE_URL, ""],
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_TITLE, zone.now_playing
								? zone.now_playing.three_line.line1
								: ""],
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_ARTIST, zone.now_playing
								? zone.now_playing.three_line.line2
								: ""],
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_ALBUM, zone.now_playing
								? zone.now_playing.three_line.line3
								: ""]
						]);

						if (zone.outputs[0].volume) {
							features.push(uc.Entities.MediaPlayer.FEATURES.VOLUME);
							features.push(uc.Entities.MediaPlayer.FEATURES.VOLUME_UP_DOWN);

							attributes.set([uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME], zone.outputs[0].volume.value);
							attributes.set([uc.Entities.MediaPlayer.ATTRIBUTES.MUTED], zone.outputs[0].volume.is_muted);
						}

						const entity = new uc.Entities.MediaPlayer(
							zone.zone_id,
							new Map([[
								'en', zone.display_name
							]]),
							features,
							attributes
						);

						uc.availableEntities.addEntity(entity);
					}
				};

				if (wsHandle != null) {
					await uc.sendAvailableEntities(wsHandle);
				}
			}

			for (const entityId of subscribedEntities) {
				const entity = uc.availableEntities.getEntity(entityId);
				console.debug(`Entity is: ${entity}`);
				if (entity != null) {
					uc.configuredEntities.addEntity(entity);
				}
			}
	
			await subscribeRoonZones();
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
					data.zones_changed.forEach(async (zone) => {
						console.log(`[uc_roon] Change: ${zone.zone_id}`);

						if (!uc.configuredEntities.contains(zone.zone_id)) {
							console.log(`[uc_roon] Configured entity not found, not updating: ${zone.zone_id}`);
							return;
						}

						let response = new Map([]);

						// state
						switch (zone.state) {
							case "playing":
								response.set([uc.Entities.MediaPlayer.ATTRIBUTES.STATE],
									uc.Entities.MediaPlayer.STATES.PLAYING);
								break;

							case "stopped":
							case "paused":
								response.set([uc.Entities.MediaPlayer.ATTRIBUTES.STATE],
									uc.Entities.MediaPlayer.STATES.PAUSED);
								break;
						}

						if (zone.outputs[0].volume) {
							// volume
							response.set([uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME],
								zone.outputs[0].volume.value);

							// muted
							response.set([uc.Entities.MediaPlayer.ATTRIBUTES.MUTED],
								zone.outputs[0].volume.is_muted);
						}

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_TITLE
						], zone.now_playing.three_line.line1);

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ARTIST
						], zone.now_playing.three_line.line2);

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ALBUM
						], zone.now_playing.three_line.line3);

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_DURATION
						], zone.now_playing.length);

						if (zone.now_playing.image_key) {
							RoonImage.get_image(zone.now_playing.image_key, { scale: 'fit', width: 480, height: 480, format: 'image/jpeg' }, (error, content_type, image) => {
								if (image) {
									let imageResponse = new Map([]);
									imageResponse.set([
										uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_IMAGE_URL
									], "data:image/png;base64," + image.toString('base64'));
									uc.configuredEntities.updateEntityAttributes(zone.zone_id, imageResponse);
								}
							});
						}

						uc.configuredEntities.updateEntityAttributes(zone.zone_id, response);
					});

				} else if (data.zones_seek_changed) {
					data.zones_seek_changed.forEach(async (zone) => {
						if (!uc.configuredEntities.contains(zone.zone_id)) {
							console.log(`[uc_roon] Configured entity not found, not updating: ${zone.zone_id}`);
							return;
						}

						uc.configuredEntities.updateEntityAttributes(
							zone.zone_id,
							new Map([
								[uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_POSITION, zone.seek_position]
							]));
					});
				}
			} else if (cmd == "Subscribed") {
				if (data.zones) {
					data.zones.forEach(async (zone) => {
						console.log(`[uc_roon] Subscribed: ${zone.zone_id}`);

						if (!uc.configuredEntities.contains(zone.zone_id)) {
							console.log(`[uc_roon] Configured entity not found, not updating: ${zone.zone_id}`);
							return;
						}

						let response = new Map([]);

						// state
						switch (zone.state) {
							case "playing":
								response.set([uc.Entities.MediaPlayer.ATTRIBUTES.STATE],
									uc.Entities.MediaPlayer.STATES.PLAYING);
								break;

							case "stopped":
							case "paused":
								response.set([uc.Entities.MediaPlayer.ATTRIBUTES.STATE],
									uc.Entities.MediaPlayer.STATES.PAUSED);
								break;
						}

						if (zone.outputs[0].volume) {
							// volume
							response.set([uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME],
								zone.outputs[0].volume.value);

							// muted
							response.set([uc.Entities.MediaPlayer.ATTRIBUTES.MUTED],
								zone.outputs[0].volume.is_muted);
						}

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_TITLE
						], zone.now_playing.three_line.line1);

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ARTIST
						], zone.now_playing.three_line.line2);

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ALBUM
						], zone.now_playing.three_line.line3);

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_DURATION
						], zone.now_playing.length);

						if (zone.now_playing.image_key) {
							RoonImage.get_image(zone.now_playing.image_key, { scale: 'fit', width: 480, height: 480, format: 'image/jpeg' }, (error, content_type, image) => {
								if (image) {
									let imageResponse = new Map([]);
									imageResponse.set([
										uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_IMAGE_URL
									], "data:image/png;base64," + image.toString('base64'));
									uc.configuredEntities.updateEntityAttributes(zone.zone_id, imageResponse);
								}
							});
						}

						uc.configuredEntities.updateEntityAttributes(zone.zone_id, response);
					});
				}
			}
		});
	}
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
function convertImageToBase64(file) {
	let data = null;

	try {
		data = fs.readFileSync(file, 'base64');
	} catch (e) {
		console.log(e);
	}

	return data;
}

async function init() {
	roon.init_services({
		required_services: [RoonApiTransport, RoonApiImage],
		provided_services: [roonExtentionStatus],
	});

	roonExtentionStatus.set_status("Disconnected", false);

	roon.start_discovery();
}

init();
