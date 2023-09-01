"use strict";

// get the UC module
const uc = require("uc-integration-api");
uc.init("driver.json");

// set working directory
const process = require('process')
try {
	process.chdir(uc.configDirPath);
	console.log(`Changed working directory to: ${uc.configDirPath}`);
} catch (error) {
	console.error(`Error changing working directory: ${error}`);
}

uc.on(
	uc.EVENTS.ENTITY_COMMAND,
	async (wsHandle, entity_id, entity_type, cmd_id, params) => {
		console.log(
			`ENTITY COMMAND: ${wsHandle} ${entity_id} ${entity_type} ${cmd_id}`
		);

		const entity = uc.configuredEntities.getEntity(entity_id);

		switch (cmd_id) {
			case uc.Entities.MediaPlayer.COMMANDS.PLAY_PAUSE:
				if (
					entity.attributes.state ==
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
				await uc.acknowledgeCommand(wsHandle, uc.STATUS_CODES.NOT_FOUND);
				break;
		}
	}
);

uc.on(uc.EVENTS.CONNECT, async () => {
	// aka get available entities
	await getRoonZones();
	await roonConnect();
	uc.setDeviceState(uc.DEVICE_STATES.CONNECTED);
});

uc.on(uc.EVENTS.DISCONNECT, async () => {
	await roonDisconnect();
	uc.setDeviceState(uc.DEVICE_STATES.DISCONNECTED);
});

uc.on(uc.EVENTS.ENTER_STANDBY, async () => {
	await getRoonZones();
	await roonConnect();
});

uc.on(uc.EVENTS.EXIT_STANDBY, async () => {
	await roonDisconnect();
});

// DRIVER SETUP
uc.on(uc.EVENTS.SETUP_DRIVER, async (wsHandle, setupData) => {
	console.log(`Setting up driver. Setup data: ${setupData}`);

	await uc.acknowledgeCommand(wsHandle);
	console.log('Acknowledged driver setup');

	const img = convertImageToBase64('./assets/setupimg.png');
	await uc.requestDriverSetupUserConfirmation(wsHandle, 'User action needed', 'Please open Roon, navigate to *Settings/Extensions* and click *Enable* next to the Unfolded Circle Roon Integration.\n\nThen click Next.', img);
});

uc.on(uc.EVENTS.SETUP_DRIVER_USER_CONFIRMATION, async (wsHandle) => {
	console.log('Received user confirmation for driver setup: sending OK');
	await uc.acknowledgeCommand(wsHandle);

	// Update setup progress
	await uc.driverSetupProgress(wsHandle);
	console.log('Sending setup progress that we are still busy...');

	if (RoonPaired) {
		console.log('Driver setup completed!');
		await uc.driverSetupComplete(wsHandle);
	} else {
		await uc.driverSetupError(wsHandle, 'Failed to pair with Roon.');
		console.error("Failed to pair with Roon");
	}
});
// END DRIVER SETUP

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const fs = require("fs");

let RoonCore = null;
let RoonTransport = null;
let RoonZones = {};
let RoonPaired = false;

const roon = new RoonApi({
	extension_id: "com.uc.remote",
	display_name: "Unfolded Circle Roon Integration",
	display_version: uc.getDriverVersion().version.api,
	publisher: "Unfolded Circle",
	email: "support@unfoldedcircle.com",
	website: "https://unfoldedcircle.com",

	core_paired: (core) => {
		RoonCore = core;
		RoonPaired = true;

		console.log(
			`Roon Core paired: ${core.core_id} ${core.display_name} ${core.display_version}`
		);
	},

	core_unpaired: (core) => {
		RoonCore = null;
		RoonPaired = false;

		console.log(
			`Roon Core unpaired: ${core.core_id} ${core.display_name} ${core.display_version}`
		);
	},
});

const roonExtentionStatus = new RoonApiStatus(roon);

async function getRoonZones() {
	if (RoonCore != null) {
		console.log("Getting Roon Zones");
		RoonTransport = RoonCore.services.RoonApiTransport;

		RoonTransport.subscribe_zones(async (cmd, data) => {
			if (cmd == "Subscribed") {
				// if we haven't, we add the zone as entity
				console.log("Subscribed to zones");

				data.zones.forEach(async (zone) => {
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

						const entity = new uc.Entities.MediaPlayer(
							zone.zone_id,
							new Map([[
								'en', zone.display_name
							]]),
							[
								uc.Entities.MediaPlayer.FEATURES.ON_OFF,
								uc.Entities.MediaPlayer.FEATURES.VOLUME,
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
							],
							new Map([
								[uc.Entities.MediaPlayer.ATTRIBUTES.STATE,
									state],
								[uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME,
									zone.outputs[0].volume.value],
								[uc.Entities.MediaPlayer.ATTRIBUTES.MUTED,
									zone.outputs[0].volume.is_muted],
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
							])
						);

						uc.availableEntities.addEntity(entity);
					}
				});
			}
		});
	}
}

async function roonConnect() {
	roonExtentionStatus.set_status("Connected", false);

	// add event listeners to roon
	if (RoonCore != null) {
		RoonTransport = RoonCore.services.RoonApiTransport;

		RoonTransport.subscribe_zones(async (cmd, data) => {
			// update entities here
			if (cmd == "Changed") {
				if (data.zones_changed) {
					data.zones_changed.forEach(async (zone) => {
						console.log(`change: ${zone.zone_id}`);
						
						if (!uc.configuredEntities.contains(zone.zone_id)) {
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

						// volume
						response.set([uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME], 
							zone.outputs[0].volume.value);

						// muted
						response.set([uc.Entities.MediaPlayer.ATTRIBUTES.MUTED],
							zone.outputs[0].volume.is_muted);

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

						response.set([
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_IMAGE_URL
						], `http://${RoonCore.registration.extension_host}:${RoonCore.registration.http_port}/api/image/${zone.now_playing.image_key}?scale=fit&width=480&height=480`);

						uc.configuredEntities.updateEntityAttributes(zone.zone_id, response);
					});
				} else if (data.zones_seek_changed) {
					data.zones_seek_changed.forEach(async (zone) => {
						if (!uc.configuredEntities.contains(zone.zone_id)) {
							return;
						}

						uc.configuredEntities.updateEntityAttributes(
							zone.zone_id,
							new Map([
								[uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_POSITION, zone.seek_position]
							]));
					});
				}
			}
		});
	}
}

async function roonDisconnect() {
	// remove event listeners
	roonExtentionStatus.set_status("Disconnected", false);
	RoonZones = {};
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
function convertImageToBase64(file) {
	let data;

	try {
		data = fs.readFileSync(file, 'base64');
	} catch (e) {
		console.log(e);
	}

	return data;
}

async function init() {
	// setup roon things
	roon.init_services({
		required_services: [RoonApiTransport, RoonApiImage],
		provided_services: [roonExtentionStatus],
	});

	roonExtentionStatus.set_status("Disconnected", false);

	roon.start_discovery();
}

init();
