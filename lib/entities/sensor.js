"use strict";

const Entity = require("./entity");

const states = {
	unavailable: "UNAVAILABLE",
	unknown: "UNKNOWN",
	on: "ON",
};

const features = {};

const attributes = {
	state: "state",
	value: "value",
	unit: "unit",
};

const commands = {};

const deviceClasses = {
	custom: "custom",
	battery: "battery",
	current: "current",
	energy: "energy",
	humidity: "humidity",
	power: "power",
	temperature: "temperature",
	voltage: "voltage",
};

const options = {
	custom_unit: "custom_unit",
	native_unit: "native_unit",
	decimals: "decimals",
	min_value: "min_value",
	max_value: "max_value",
};

class Sensor extends Entity {
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
			Entity.types.sensor,
			device_id,
			features,
			attributes,
			deviceClass,
			options,
			area
		);

		console.debug(`Sensor entity created with id: ${this.id}`);
	}
}

module.exports = Sensor;
module.exports.states = states;
module.exports.features = features;
module.exports.attributes = attributes;
module.exports.commands = commands;
module.exports.deviceClasses = deviceClasses;
module.exports.options = options;
