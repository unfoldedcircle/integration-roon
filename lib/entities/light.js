"use strict";

const Entity = require("./entity");

const states = {
	unavailable: "UNAVAILABLE",
	unknown: "UNKNOWN",
	on: "ON",
	off: "OFF",
};

const features = {
	on_off: "on_off",
	toggle: "toggle",
	dim: "dim",
	color: "color",
	color_temperature: "color_temperature",
};

const attributes = {
	state: "state",
	hue: "hue",
	saturation: "saturation",
	brightness: "brightness",
	color_temperature: "color_temperature",
};

const commands = {
	on: "on",
	off: "off",
	toggle: "toggle",
};

const deviceClasses = {};

const options = { color_temperature_steps: "color_temperature_steps" };

class Light extends Entity {
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
			Entity.types.light,
			device_id,
			features,
			attributes,
			deviceClass,
			options,
			area
		);

		console.debug(`Light entity created with id: ${this.id}`);
	}
}

module.exports = Light;
module.exports.states = states;
module.exports.features = features;
module.exports.attributes = attributes;
module.exports.commands = commands;
module.exports.deviceClasses = deviceClasses;
module.exports.options = options;
