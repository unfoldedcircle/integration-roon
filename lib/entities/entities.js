"use strict";

const EventEmitter = require("events");

const Entity = require("./entity");
const Button = require("./button");
const Climate = require("./climate");
const Cover = require("./cover");
const Light = require("./light");
const MediaPlayer = require("./media_player");
const Sensor = require("./sensor");
const Switch = require("./switch");

class Entities {
	#storage;

	constructor() {
		this.#storage = {};
		this.events = new EventEmitter();
	}

	static generateId() {
		return (
			"entity_" +
			Array(25)
				.fill()
				.map(() =>
					"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(
						Math.random() * 62
					)
				)
				.join("")
		);
	}

	async contains(id) {
		if (this.#storage[id]) {
			return true;
		} else {
			return false;
		}
	}

	async getEntity(id) {
		if (!this.#storage[id]) {
			console.log(`Entity does not exists: ${id}`);
			return false;
		}

		return this.#storage[id];
	}

	async addEntity(entity) {
		if (this.#storage[entity.id]) {
			console.log(`Entity is already in storage: ${entity.id}`);
			return false;
		}
		this.#storage[entity.id] = entity;

		console.log(`Entity added: ${entity.id}`);
		return true;
	}

	async removeEntity(id) {
		if (!this.#storage[id]) {
			console.log(`Entity does not exists: ${id}`);
			return false;
		}

		delete this.#storage[id];

		console.log(`Entity removed: ${id}`);
		return true;
	}

	async updateEntityAttributes(id, keys, values) {
		if (!this.contains(id)) {
			return false;
		}

		let updatedData = {};

		for (let i = 0; i < keys.length; i++) {
			if (values[i] != undefined) {
				this.#storage[id].attributes[keys[i]] = values[i];
				updatedData[keys[i]] = values[i];
			}
		}

		this.events.emit(
			"entity_attributes_updated",
			id,
			this.#storage[id].entity_type,
			updatedData
		);
	}

	async getEntities() {
		let entities = [];

		Object.entries(this.#storage).forEach(([key, value]) => {
			let entity = {
				entity_id: value.id,
				entity_type: value.entity_type,
				device_id: value.device_id,
				features: value.features,
				name: { en: value.name },
				area: value.area,
			};

			entities.push(entity);
		});

		return entities;
	}

	async getStates() {
		let entities = [];

		Object.entries(this.#storage).forEach(([key, value]) => {
			let entity = {
				entity_id: value.id,
				entity_type: value.entity_type,
				device_id: value.device_id,
				attributes: value.attributes,
			};

			entities.push(entity);
		});

		return entities;
	}
}

module.exports = Entities;
module.exports.types = Entity.types;
module.exports.Button = Button;
module.exports.Climate = Climate;
module.exports.Cover = Cover;
module.exports.Light = Light;
module.exports.MediaPlayer = MediaPlayer;
module.exports.Sensor = Sensor;
module.exports.Switch = Switch;
