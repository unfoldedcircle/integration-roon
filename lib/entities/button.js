"use strict";

const Entity = require("./entity");

const states = {
	unavailable: "UNAVAILABLE",
	available: "AVAILABLE",
};

const attributes = {
	state: "AVAILABLE",
};

class Button extends Entity {
	constructor(id, name, device_id, area) {
		super(id, name, Entity.types.button, device_id, ["press"], {}, area);

		console.debug(`Button entity created with id: ${this.id}`);
	}
}

module.exports = Button;
module.exports.states = states;
module.exports.attributes = attributes;
