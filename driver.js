"use strict";

// get the UC module
const uc = require("uc-integration-api");
const fs = require("fs");

uc.init("driver.json");

uc.on(uc.EVENTS.SUBSCRIBE_ENTITIES, async (entities) => {
	entities.forEach(async (entity) => {
		// update config with list of entities to add listeners to
		config.configured_entities[entity] =
			uc.availableEntities.getEntity(entity);
	});

	//save config
	saveConfig();
});

uc.on(uc.EVENTS.UNSUBSCRIBE_ENTITIES, async (entities) => {
	entities.forEach(async (entity) => {
		// update config with list of entities to add listeners to
		delete config.configured_entities[entity];
	});

	//save config
	saveConfig();
});

uc.on(
	uc.EVENTS.ENTITY_COMMAND,
	async (id, entity_id, entity_type, cmd_id, params) => {
		console.log(
			`ENTITY COMMAND: ${id} ${entity_id} ${entity_type} ${cmd_id} ${JSON.stringify(
				params
			)}`
		);

		const entity = uc.configuredEntities.getEntity(entity_id);

		switch (cmd_id) {
			case uc.Entities.MediaPlayer.COMMANDS.PLAY_PAUSE:
				if (
					entity.attributes.state ==
					uc.Entities.MediaPlayer.STATES.PLAYING
				) {
					RoonTransport.control(entity_id, "pause", async (error) => {
						await uc.acknowledgeCommand(id, !error);
					});
				} else {
					RoonTransport.control(entity_id, "play", async (error) => {
						await uc.acknowledgeCommand(id, !error);
					});
				}
				break;

			case uc.Entities.MediaPlayer.COMMANDS.NEXT:
				RoonTransport.control(entity_id, "next", async (error) => {
					await uc.acknowledgeCommand(id, !error);
				});
				break;

			case uc.Entities.MediaPlayer.COMMANDS.PREVIOUS:
				RoonTransport.control(entity_id, "previous", async (error) => {
					await uc.acknowledgeCommand(id, !error);
				});
				break;

			case uc.Entities.MediaPlayer.COMMANDS.VOLUME:
				RoonTransport.change_volume(
					RoonZones[entity_id].outputs[0].output_id,
					"absolute",
					params.volume,
					async (error) => {
						await uc.acknowledgeCommand(id, !error);
					}
				);
				break;

			case uc.Entities.MediaPlayer.COMMANDS.MUTE_TOGGLE:
				if (entity.attributes.muted) {
					RoonTransport.mute(
						RoonZones[entity_id].outputs[0].output_id,
						"unmute",
						async (error) => {
							await uc.acknowledgeCommand(id, !error);
						}
					);
				} else {
					RoonTransport.mute(
						RoonZones[entity_id].outputs[0].output_id,
						"mute",
						async (error) => {
							await uc.acknowledgeCommand(id, !error);
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
						await uc.acknowledgeCommand(id, !error);
					}
				);
				break;

			default:
				await uc.acknowledgeCommand(id, false);
				break;
		}
	}
);

uc.on(uc.EVENTS.CONNECT, async () => {
	roonExtentionStatus.set_status("Connected", false);

	// add event listeners to roon
	if (RoonCore != null) {
		RoonTransport = RoonCore.services.RoonApiTransport;

		RoonTransport.subscribe_zones(async (cmd, data) => {
			// todo remove this section when subscribe is implemented
			if (cmd == "Subscribed") {
				// if we haven't, we add the zone as entity
				console.log("Subscribed to zones");

				data.zones.forEach(async (zone) => {
					RoonZones[zone.zone_id] = {
						outputs: zone.outputs,
					};

					const entity = uc.availableEntities.getEntity(zone.zone_id);
					uc.configuredEntities.addEntity(entity);

					config.configured_entities[entity.id] = entity;
					saveConfig();
				});
			}
			// todo remove until this

			// update entities here
			if (cmd == "Changed") {
				if (data.zones_changed) {
					data.zones_changed.forEach(async (zone) => {
						console.log(`change: ${zone.zone_id}`);
						let response = {};

						// state
						switch (zone.state) {
							case "playing":
								response[
									uc.Entities.MediaPlayer.ATTRIBUTES.STATE
								] = uc.Entities.MediaPlayer.STATES.PLAYING;
								break;

							case "stopped":
							case "paused":
								response[
									uc.Entities.MediaPlayer.ATTRIBUTES.STATE
								] = uc.Entities.MediaPlayer.STATES.PAUSED;
								break;
						}

						// volume
						response[uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME] =
							zone.outputs[0].volume.value;

						// muted
						response[uc.Entities.MediaPlayer.ATTRIBUTES.MUTED] =
							zone.outputs[0].volume.is_muted;

						response[
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_TITLE
						] = zone.now_playing.three_line.line1;

						response[
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ARTIST
						] = zone.now_playing.three_line.line2;

						response[
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ALBUM
						] = zone.now_playing.three_line.line3;

						response[
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_DURATION
						] = zone.now_playing.length;

						response[
							uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_IMAGE_URL
						] = `http://${RoonCore.registration.extension_host}:${RoonCore.registration.http_port}/api/image/${zone.now_playing.image_key}?scale=fit&width=480&height=480`;

						// convert json
						let keys = [];
						let values = [];

						Object.entries(response).forEach(([key, value]) => {
							keys.push(key);
							values.push(value);
						});

						if (keys.length > 0) {
							//update entity
							console.log(`${keys} ${values}`);
							uc.configuredEntities.updateEntityAttributes(
								zone.zone_id,
								keys,
								values
							);
						}
					});
				} else if (data.zones_seek_changed) {
					data.zones_seek_changed.forEach(async (zone) => {
						uc.configuredEntities.updateEntityAttributes(
							zone.zone_id,
							[uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_POSITION],
							[zone.seek_position]
						);
					});
				}
			}
		});
	}

	uc.setDeviceState(uc.DEVICE_STATES.CONNECTED);
});

uc.on(uc.EVENTS.DISCONNECT, async () => {
	// remove event listeners
	roonExtentionStatus.set_status("Disconnected", false);
	RoonZones = {};
	uc.setDeviceState(uc.DEVICE_STATES.DISCONNECTED);
});

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");

let RoonCore = null;
let RoonTransport = null;
let RoonZones = {};

let config = {
	configured_entities: {},
};

const roon = new RoonApi({
	extension_id: "com.uc.remote",
	display_name: "Unfolded Circle Roon Integration",
	display_version: "0.0.1",
	publisher: "Unfolded Circle",
	email: "support@unfoldedcircle.com",
	website: "https://unfoldedcircle.com",

	core_paired: (core) => {
		RoonCore = core;

		console.log(
			`Roon Core paired: ${core.core_id} ${core.display_name} ${core.display_version}`
		);

		getRoonZones();
	},

	core_unpaired: (core) => {
		RoonCore = null;

		console.log(
			`Roon Core unpaired: ${core.core_id} ${core.display_name} ${core.display_version}`
		);

		// remove entities
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
					if (res == false) {
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
							zone.display_name,
							uc.getDriverVersion().id,
							[
								uc.Entities.MediaPlayer.FEATURES.ON_OFF,
								uc.Entities.MediaPlayer.FEATURES.VOLUME,
								uc.Entities.MediaPlayer.FEATURES.MUTE_TOGGLE,
								uc.Entities.MediaPlayer.FEATURES.PLAY_PAUSE,
								uc.Entities.MediaPlayer.FEATURES.NEXT,
								uc.Entities.MediaPlayer.FEATURES.PREVIOUS,
								uc.Entities.MediaPlayer.FEATURES.REPEAT,
								uc.Entities.MediaPlayer.FEATURES.SHUFFLE,
								uc.Entities.MediaPlayer.FEATURES.SEEK,
								uc.Entities.MediaPlayer.FEATURES.MEDIA_DURATION,
								uc.Entities.MediaPlayer.FEATURES.MEDIA_POSITION,
								uc.Entities.MediaPlayer.FEATURES.MEDIA_TITLE,
								uc.Entities.MediaPlayer.FEATURES.MEDIA_ARTIST,
								uc.Entities.MediaPlayer.FEATURES.MEDIA_ALBUM,
								uc.Entities.MediaPlayer.FEATURES
									.MEDIA_IMAGE_URL,
							],
							{
								[uc.Entities.MediaPlayer.ATTRIBUTES.STATE]:
									state,
								[uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME]:
									zone.outputs[0].volume.value,
								[uc.Entities.MediaPlayer.ATTRIBUTES.MUTED]:
									zone.outputs[0].volume.is_muted,
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.MEDIA_DURATION]: zone.now_playing
									? zone.now_playing.length
										? zone.now_playing.length
										: 0
									: 0,
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.MEDIA_POSITION]: 0,
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.MEDIA_IMAGE_URL]: "",
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.MEDIA_TITLE]: zone.now_playing
									? zone.now_playing.three_line.line1
									: "",
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.MEDIA_ARTIST]: zone.now_playing
									? zone.now_playing.three_line.line2
									: "",
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.MEDIA_ALBUM]: zone.now_playing
									? zone.now_playing.three_line.line3
									: "",
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.REPEAT]: false,
								[uc.Entities.MediaPlayer.ATTRIBUTES
									.SHUFFLE]: false,
							}
						);

						uc.availableEntities.addEntity(entity);
					}
				});
			}
		});
	}
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
function loadConfig() {
	try {
		const raw = fs.readFileSync("driver_config.json");

		try {
			const json = JSON.parse(raw);
			config = json;

			Object.entries(config.configured_entities).forEach(
				([key, value]) => {
					const entity = new uc.Entities.MediaPlayer(
						key,
						value.name,
						uc.getDriverVersion().id,
						[
							uc.Entities.MediaPlayer.FEATURES.ON_OFF,
							uc.Entities.MediaPlayer.FEATURES.VOLUME,
							uc.Entities.MediaPlayer.FEATURES.MUTE_TOGGLE,
							uc.Entities.MediaPlayer.FEATURES.PLAY_PAUSE,
							uc.Entities.MediaPlayer.FEATURES.NEXT,
							uc.Entities.MediaPlayer.FEATURES.PREVIOUS,
							uc.Entities.MediaPlayer.FEATURES.REPEAT,
							uc.Entities.MediaPlayer.FEATURES.SHUFFLE,
							uc.Entities.MediaPlayer.FEATURES.SEEK,
							uc.Entities.MediaPlayer.FEATURES.MEDIA_DURATION,
							uc.Entities.MediaPlayer.FEATURES.MEDIA_POSITION,
							uc.Entities.MediaPlayer.FEATURES.MEDIA_TITLE,
							uc.Entities.MediaPlayer.FEATURES.MEDIA_ARTIST,
							uc.Entities.MediaPlayer.FEATURES.MEDIA_ALBUM,
							uc.Entities.MediaPlayer.FEATURES.MEDIA_IMAGE_URL,
						],
						{
							[uc.Entities.MediaPlayer.ATTRIBUTES.STATE]:
								uc.Entities.MediaPlayer.STATES.PAUSED,
							[uc.Entities.MediaPlayer.ATTRIBUTES.VOLUME]: 0,
							[uc.Entities.MediaPlayer.ATTRIBUTES.MUTED]: false,
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_DURATION]: 0,
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_POSITION]: 0,
							[uc.Entities.MediaPlayer.ATTRIBUTES
								.MEDIA_IMAGE_URL]: "",
							[uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_TITLE]:
								"",
							[uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ARTIST]:
								"",
							[uc.Entities.MediaPlayer.ATTRIBUTES.MEDIA_ALBUM]:
								"",
							[uc.Entities.MediaPlayer.ATTRIBUTES.REPEAT]: false,
							[uc.Entities.MediaPlayer.ATTRIBUTES.SHUFFLE]: false,
						}
					);

					uc.configuredEntities.addEntity(entity);
				}
			);

			console.log("Config loaded");
		} catch (e) {
			uc.configuredEntities.clear();
			console.log(
				"Error parsing config info. Starting with empty config"
			);
		}
	} catch (e) {
		console.log("No config file found. Starting with empty config");
		uc.configuredEntities.clear();
	}
}

function saveConfig() {
	try {
		fs.writeFileSync("driver_config.json", JSON.stringify(config));
		console.log("Config saved to file.");
	} catch (e) {
		console.log("Error writing config.");
	}
}

async function init() {
	// load config file
	loadConfig();

	// setup roon things
	roon.init_services({
		required_services: [RoonApiTransport, RoonApiImage],
		provided_services: [roonExtentionStatus],
	});

	roonExtentionStatus.set_status("Disconnected", false);

	roon.start_discovery();
}

init();
