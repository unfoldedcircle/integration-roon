"use strict";

const Entity = require("./entity");

const states = {
	unavailable: "UNAVAILABLE",
	unknown: "UNKNOWN",
	on: "ON",
	off: "OFF",
	playing: "PLAYING",
	paused: "PAUSED",
};

const features = {
	on_off: "on_off",
	toggle: "toggle",
	volume: "volume",
	volume_up_down: "volume_up_down",
	mute_toggle: "mute_toggle",
	mute: "mute",
	unmute: "unmute",
	play_pause: "play_pause",
	stop: "stop",
	next: "next",
	previous: "previous",
	fast_forward: "fast_forward",
	rewind: "rewind",
	repeat: "repeat",
	shuffle: "shuffle",
	seek: "seek",
	media_duration: "media_duration",
	media_position: "media_position",
	media_title: "media_title",
	media_artist: "media_artist",
	media_album: "media_album",
	media_image_url: "media_image_url",
	media_type: "media_type",
	source: "source",
	sound_mode: "sound_mode",
};

const attributes = {
	state: "state",
	volume: "volume",
	muted: "muted",
	media_duration: "media_duration",
	media_position: "media_position",
	media_type: "media_type",
	media_image_url: "media_image_url",
	media_title: "media_title",
	media_artist: "media_artist",
	media_album: "media_album",
	repeat: "repeat",
	shuffle: "shuffle",
	source: "source",
	source_list: "source_list",
	sound_mode: "sound_mode",
	sound_mode_list: "sound_mode_list",
};

const commands = {
	on: "on",
	off: "off",
	toggle: "toggle",
	play_pause: "play_pause",
	stop: "stop",
	previous: "previous",
	next: "next",
	fast_forward: "fast_forward",
	rewind: "rewind",
	seek: "seek",
	volume: "volume",
	volume_up: "volume_up",
	volume_down: "volume_down",
	mute_toggle: "mute_toggle",
	mute: "mute",
	unmute: "unmute",
	repeat: "repeat",
	shuffle: "shuffle",
	source: "source",
	sound_mode: "sound_mode",
	search: "search",
};

const deviceClasses = { receiver: "receiver", speaker: "speaker" };

const options = { volume_steps: "volume_steps" };

class MediaPlayer extends Entity {
	constructor(
		id,
		name,
		device_id,
		features,
		attributes,
		deviceClass,
		options,
		area
	) {
		super(
			id,
			name,
			Entity.types.media_player,
			device_id,
			features,
			attributes,
			deviceClass,
			options,
			area
		);

		console.debug(`MediaPlayer entity created with id: ${this.id}`);
	}
}

module.exports = MediaPlayer;
module.exports.states = states;
module.exports.features = features;
module.exports.attributes = attributes;
module.exports.commands = commands;
module.exports.deviceClasses = deviceClasses;
module.exports.options = options;
