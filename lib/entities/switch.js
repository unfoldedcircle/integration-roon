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
};

const attributes = {
	state: "state",
};

const commands = {
	on: "on",
	off: "off",
	toggle: "toggle",
};

const deviceClasses = {
	outlet: "outlet",
	switch: "switch",
};

const options = { readable: "readable" };

class Switch extends Entity {
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
			Entity.types.switch,
			device_id,
			features,
			attributes,
			deviceClass,
			options,
			area
		);

		console.debug(`Switch entity created with id: ${this.id}`);
	}
}

module.exports = Switch;
module.exports.states = states;
module.exports.features = features;
module.exports.attributes = attributes;
module.exports.commands = commands;
module.exports.deviceClasses = deviceClasses;
module.exports.options = options;
