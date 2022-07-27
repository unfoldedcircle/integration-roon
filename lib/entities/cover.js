"use strict";

const Entity = require("./entity");

const states = {
	unavailable: "UNAVAILABLE",
	unknown: "UNKNOWN",
	opening: "OPENING",
	open: "OPEN",
	closing: "CLOSING",
	closed: "CLOSED",
};

const features = {
	open: "open",
	close: "close",
	stop: "stop",
	position: "position",
	tilt: "tilt",
	tilt_stop: "tilt_stop",
	tilt_position: "tilt_position",
};

const attributes = {
	state: "state",
	position: "position",
	tilt_position: "tilt_position",
};

const commands = {
	open: "open",
	close: "close",
	stop: "stop",
	position: "position",
	tilt: "tilt",
	tilt_up: "tilt_up",
	tilt_down: "tilt_down",
	tilt_stop: "tilt_stop",
};

const deviceClasses = {
	blind: "blind",
	curtain: "curtain",
	garage: "garage",
	shade: "shade",
	door: "door",
	gate: "gate",
	window: "window",
};

const options = {};

class Cover extends Entity {
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
			Entity.types.cover,
			device_id,
			features,
			attributes,
			deviceClass,
			options,
			area
		);

		console.debug(`Cover entity created with id: ${this.id}`);
	}
}

module.exports = Cover;
module.exports.states = states;
module.exports.features = features;
module.exports.attributes = attributes;
module.exports.commands = commands;
module.exports.deviceClasses = deviceClasses;
module.exports.options = options;
