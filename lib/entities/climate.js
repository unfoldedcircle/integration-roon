"use strict";

const Entity = require("./entity");

const states = {
	unavailable: "UNAVAILABLE",
	unknown: "UNKNOWN",
	off: "OFF",
	heat: "HEAT",
	cool: "COOL",
	heat_cool: "HEAT_COOL",
	fan: "FAN",
	auto: "AUTO",
};

const features = {
	on_off: "on_off",
	heat: "heat",
	cool: "cool",
	current_temperature: "current_temperature",
	target_temperature: "target_temperature",
	target_temperature_range: "target_temperature_range",
	fan: "fan",
};

const attributes = {
	state: "state",
	current_temperature: "current_temperature",
	target_temperature: "target_temperature",
	target_temperature_high: "target_temperature_high",
	target_temperature_low: "target_temperature_low",
	fan_mode: "fan_mode",
};

const commands = {
	on: "on",
	off: "off",
	hvac_mode: "hvac_mode",
	target_temperature: "target_temperature",
	target_temperature_range: "target_temperature_range",
	fan_mode: "fan_mode",
};

const deviceClasses = {};

const options = {
	temperature_unit: "temperature_unit",
	target_temperature_step: "target_temperature_step",
	max_temperature: "max_temperature",
	min_temperature: "min_temperature",
	fan_modes: "fan_modes",
};

class Climate extends Entity {
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
			Entity.types.climate,
			device_id,
			features,
			attributes,
			deviceClass,
			options,
			area
		);

		console.debug(`Climate entity created with id: ${this.id}`);
	}
}

module.exports = Climate;
module.exports.states = states;
module.exports.features = features;
module.exports.attributes = attributes;
module.exports.commands = commands;
module.exports.deviceClasses = deviceClasses;
module.exports.options = options;
