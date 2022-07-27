"use strict";

// get the UC module
const uc = require("uc-integration-api");
const fs = require("fs");

uc.init("driver.json");

// handle commands coming from the core
uc.events.on(
	uc.eventTypes.entity_command,
	async (entity_id, entity_type, cmd_id, params) => {
		console.log(
			`ENTITY COMMAND: ${entity_id} ${entity_type} ${cmd_id} ${JSON.stringify(
				params
			)}`
		);

		const entity = await uc.configuredEntities.getEntity(entity_id);

		switch (cmd_id) {
			case uc.Entities.MediaPlayer.commands.play_pause:
				if (
					entity.attributes.state ==
					uc.Entities.MediaPlayer.states.playing
				) {
					RoonTransport.control(entity_id, "pause");
				} else {
					RoonTransport.control(entity_id, "play");
				}
				break;

			case uc.Entities.MediaPlayer.commands.next:
				RoonTransport.control(entity_id, "next");
				break;

			case uc.Entities.MediaPlayer.commands.previous:
				RoonTransport.control(entity_id, "previous");
				break;

			case uc.Entities.MediaPlayer.commands.volume:
				RoonTransport.change_volume(
					RoonZones[entity_id].outputs[0].output_id,
					"absolute",
					params.volume
				);
				break;

			case uc.Entities.MediaPlayer.commands.mute_toggle:
				if (entity.attributes.muted) {
					RoonTransport.mute(
						RoonZones[entity_id].outputs[0].output_id,
						"unmute"
					);
				} else {
					RoonTransport.mute(
						RoonZones[entity_id].outputs[0].output_id,
						"mute"
					);
				}
				break;

			case uc.Entities.MediaPlayer.commands.seek:
				RoonTransport.seek(
					entity_id,
					"absolute",
					params.media_position
				);
				break;
		}
	}
);

uc.events.on(uc.eventTypes.connect, async () => {
	svc_status.set_status("Connected", false);

	// add event listeners to roon
	if (RoonCore != null) {
		RoonTransport = RoonCore.services.RoonApiTransport;

		RoonTransport.subscribe_zones(async (cmd, data) => {
			// console.log(
			// 	RoonCore.core_id,
			// 	RoonCore.display_name,
			// 	RoonCore.display_version,
			// 	"-",
			// 	cmd,
			// 	data
			// );

			if (cmd == "Subscribed") {
				// if we haven't, we add the zone as entity
				console.log("Subscribed to zones");

				data.zones.forEach(async (zone) => {
					RoonZones[zone.zone_id] = {
						outputs: zone.outputs,
					};

					const res = await availableEntities.contains(zone.zone_id);
					if (!res) {
						let state;
						switch (zone.state) {
							case "playing":
								state = uc.Entities.MediaPlayer.states.playing;
								break;

							case "stopped":
							case "paused":
								state = uc.Entities.MediaPlayer.states.paused;
								break;
						}

						const entity = new uc.Entities.MediaPlayer(
							zone.zone_id,
							zone.display_name,
							uc.getDriverVersion().id,
							[
								uc.Entities.MediaPlayer.features.on_off,
								uc.Entities.MediaPlayer.features.volume,
								uc.Entities.MediaPlayer.features.mute_toggle,
								uc.Entities.MediaPlayer.features.play_pause,
								uc.Entities.MediaPlayer.features.next,
								uc.Entities.MediaPlayer.features.previous,
								uc.Entities.MediaPlayer.features.repeat,
								uc.Entities.MediaPlayer.features.shuffle,
								uc.Entities.MediaPlayer.features.seek,
								uc.Entities.MediaPlayer.features.media_duration,
								uc.Entities.MediaPlayer.features.media_position,
								uc.Entities.MediaPlayer.features.media_title,
								uc.Entities.MediaPlayer.features.media_artist,
								uc.Entities.MediaPlayer.features.media_album,
								uc.Entities.MediaPlayer.features
									.media_image_url,
							],
							{
								[uc.Entities.MediaPlayer.attributes.state]:
									state,
								[uc.Entities.MediaPlayer.attributes.volume]:
									zone.outputs[0].volume.value,
								[uc.Entities.MediaPlayer.attributes.muted]:
									zone.outputs[0].volume.is_muted,
								[uc.Entities.MediaPlayer.attributes
									.media_duration]: zone.now_playing
									? zone.now_playing.length
										? zone.now_playing.length
										: 0
									: 0,
								[uc.Entities.MediaPlayer.attributes
									.media_position]: 0,
								[uc.Entities.MediaPlayer.attributes
									.media_image_url]: "",
								[uc.Entities.MediaPlayer.attributes
									.media_title]: zone.now_playing
									? zone.now_playing.three_line.line1
									: "",
								[uc.Entities.MediaPlayer.attributes
									.media_artist]: zone.now_playing
									? zone.now_playing.three_line.line2
									: "",
								[uc.Entities.MediaPlayer.attributes
									.media_album]: zone.now_playing
									? zone.now_playing.three_line.line3
									: "",
								[uc.Entities.MediaPlayer.attributes
									.repeat]: false,
								[uc.Entities.MediaPlayer.attributes
									.shuffle]: false,
							}
						);

						uc.availableEntities.addEntity(entity);
						uc.configuredEntities.addEntity(entity);
					}
				});
			}
			// update entities here
			else if (cmd == "Changed") {
				if (data.zones_changed) {
					data.zones_changed.forEach(async (zone) => {
						console.log(`change: ${zone.zone_id}`);
						let response = {};

						// state
						switch (zone.state) {
							case "playing":
								response[
									uc.Entities.MediaPlayer.attributes.state
								] = uc.Entities.MediaPlayer.states.playing;
								break;

							case "stopped":
							case "paused":
								response[
									uc.Entities.MediaPlayer.attributes.state
								] = uc.Entities.MediaPlayer.states.paused;
								break;
						}

						// volume
						response[uc.Entities.MediaPlayer.attributes.volume] =
							zone.outputs[0].volume.value;

						// muted
						response[uc.Entities.MediaPlayer.attributes.muted] =
							zone.outputs[0].volume.is_muted;

						response[
							uc.Entities.MediaPlayer.attributes.media_title
						] = zone.now_playing.three_line.line1;

						response[
							uc.Entities.MediaPlayer.attributes.media_artist
						] = zone.now_playing.three_line.line2;

						response[
							uc.Entities.MediaPlayer.attributes.media_album
						] = zone.now_playing.three_line.line3;

						response[
							uc.Entities.MediaPlayer.attributes.media_duration
						] = zone.now_playing.length;

						response[
							uc.Entities.MediaPlayer.attributes.media_image_url
						] = `http://localhost:9300/api/image/${zone.now_playing.image_key}?scale=fit&width=480&height=480`;

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

							await uc.configuredEntities.updateEntityAttributes(
								zone.zone_id,
								keys,
								values
							);
						}
					});
				} else if (data.zones_seek_changed) {
					data.zones_seek_changed.forEach(async (zone) => {
						await uc.configuredEntities.updateEntityAttributes(
							zone.zone_id,
							[uc.Entities.MediaPlayer.attributes.media_position],
							[zone.seek_position]
						);
					});
				}
			}
		});
	}
});

uc.events.on(uc.eventTypes.disconnect, async () => {
	// remove event listeners
	svc_status.set_status("Disconnected", false);
	RoonZones = {};
});

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

const RoonApi = require("node-roon-api");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");

let RoonCore = null;
let RoonTransport = null;
let RoonZones = {};

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
	},

	core_unpaired: (core) => {
		RoonCore = null;

		console.log(
			`Roon Core unpaired: ${core.core_id} ${core.display_name} ${core.display_version}`
		);

		// remove entities
	},
});

const svc_status = new RoonApiStatus(roon);

async function getRoonImage(imageKey) {
	RoonCore.services.RoonApiImage.get_image(
		imageKey,
		{ scale: "fit", width: 480, height: 480, format: "image/png" },
		(cb, contentType, data) => {
			fs.writeFile("image.png", data);
		}
	);
}

roon.init_services({
	required_services: [RoonApiTransport, RoonApiImage],
	provided_services: [svc_status],
});

svc_status.set_status("Disconnected", false);

roon.start_discovery();
