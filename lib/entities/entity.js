"use strict";

const types = {
	cover: "cover",
	button: "button",
	climate: "climate",
	light: "light",
	media_player: "media_player",
	sensor: "sensor",
	switch: "switch",
};

class Entity {
	constructor(
		id,
		name,
		entity_type,
		device_id,
		features,
		attributes,
		deviceClass,
		options,
		area
	) {
		this.id = id;
		this.name = name;
		this.entity_type = entity_type;
		this.device_id = device_id;
		this.features = features;
		this.attributes = attributes;
		this.device_class = deviceClass;
		this.options = options;
		this.area = area;
	}
}

module.exports = Entity;
module.exports.types = types;
