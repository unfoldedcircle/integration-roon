"use strict";

const WebSocket = require("ws");
const EventEmitter = require("events");
const fs = require("fs");

const uc = require("./api_definitions");
const Entities = require("./entities/entities");

class IntegrationAPI {
	#driverInfo;
	#state;
	#server;

	constructor() {
		this.events = new EventEmitter();

		/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
		// load driver information from driver.json
		const raw = fs.readFileSync("driver.json");

		try {
			this.#driverInfo = JSON.parse(raw);
		} catch (e) {
			console.debug("Error parsing driver info");
		}

		// set default state to connected
		this.#state = uc.deviceStates.connected;

		// create storage for available and configured entities
		this.availableEntities = new Entities();
		this.configuredEntities = new Entities();

		// connect to update events for entity attributes
		this.configuredEntities.events.on(
			uc.events.entity_attributes_updated,
			async (entity_id, entity_type, attributes) => {
				const data = {
					entity_id: entity_id,
					entity_type: entity_type,
					attributes: attributes,
				};

				this.#sendEvent(uc.events.entity_change, data, "ENTITY");
			}
		);

		/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
		// setup websocket server - remote-core will connect to this
		this.#server = new WebSocket.Server({ port: this.#driverInfo.port });
		this.connection = null;

		this.#server.on("connection", (connection, req) => {
			console.log("New connection");
			this.connection = connection;

			connection.on("message", (message) => {
				this.#messageReceived(message);
			});

			connection.on("close", () => {
				console.log("Connection closed");
				this.connection = null;
			});

			connection.on("error", () => {
				console.log("Error");
				this.connection = null;
			});
		});
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	// send a response to a request
	async #sendResponse(id, msg = "result", msgData, success = true) {
		const json = {
			kind: "resp",
			req_id: id,
			code: success ? 200 : 500,
			msg,
			msg_data: msgData,
		};

		if (this.connection != null) {
			console.debug("Sending response:");
			console.debug(JSON.stringify(json));
			this.connection.send(JSON.stringify(json));
		}
	}

	// send an event
	async #sendEvent(msg, msgData, cat = "") {
		const json = {
			kind: "event",
			msg,
			msg_data: msgData,
			cat: cat,
		};

		if (this.connection != null) {
			console.debug("Sending event:");
			console.debug(json);
			this.connection.send(JSON.stringify(json));
		}
	}

	// process incoming websocket messages
	async #messageReceived(message) {
		let json;
		try {
			json = JSON.parse(message);
		} catch (e) {
			console.debug("Json parse error");
			return;
		}

		console.debug("Incoming:");
		console.debug(json);
		console.debug("------------------------------------------------");

		const kind = json.kind;
		const id = json.id;
		const msg = json.msg;
		const msgData = json.msg_data;

		if (kind == "req") {
			switch (msg) {
				case uc.messages.get_driver_version:
					await this.#sendResponse(
						id,
						uc.events.driver_version,
						await this.getDriverVersion()
					);
					break;

				case uc.messages.get_device_state:
					await this.#sendResponse(
						id,
						uc.events.device_state,
						await this.#getDeviceState(msgData.device_id)
					);
					break;

				case uc.messages.get_available_entities:
					await this.#sendResponse(id, uc.events.available_entities, {
						available_entities: await this.#getAvailableEntities(),
					});
					break;

				case uc.messages.get_entity_states:
					await this.#sendResponse(
						id,
						uc.events.entity_states,
						await this.#getEntityStates()
					);
					break;

				case uc.messages.entity_command:
					await this.#sendResponse(id);
					await this.#entityCommand(msgData);
					break;

				case uc.messages.subscribe_events:
					await this.#sendResponse(
						id,
						"result",
						"",
						await this.#subscribeEvents(msgData)
					);
					break;

				case uc.messages.unsubscribe_events:
					await this.#sendResponse(
						id,
						"result",
						"",
						await this.#unSubscribeEvents(msgData)
					);
					break;

				default:
					break;
			}
		} else if (kind == "event") {
			switch (msg) {
				case uc.events.connect:
					this.events.emit(uc.events.connect);
					await this.setDeviceState(uc.deviceStates.connected);
					break;

				case uc.events.disconnect:
					this.events.emit(uc.events.disconnect);
					await this.setDeviceState(uc.deviceStates.disconnected);
					break;

				default:
					break;
			}
		}
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	// private methods
	async getDriverVersion() {
		return {
			name: this.#driverInfo.name.en,
			version: {
				api: this.#driverInfo.min_core_api,
				driver: this.#driverInfo.version,
			},
		};
	}

	async #getDeviceState(deviceId) {
		return {
			state: this.#state,
		};
	}

	async #getAvailableEntities() {
		// return list of entities
		return await this.availableEntities.getEntities();
	}

	async #subscribeEvents(entities) {
		// copy available entities to registered entities
		let res = true;

		entities.entity_ids.forEach((entityId) => {
			const entity = this.availableEntities.getEntity(entityId);
			if (!this.configuredEntities.addEntity(entity)) {
				res = false;
			}
		});

		this.events.emit(uc.events.subscribe_entities, entities.entity_ids);

		return res;
	}

	async #unSubscribeEvents(entities) {
		// remove entities from registered entities
		let res = true;

		entities.entity_ids.forEach((entityId) => {
			if (!this.configuredEntities.removeEntity(entityId)) {
				res = false;
			}
		});

		this.events.emit(uc.events.unsubscribe_entities, entities.entity_ids);

		return res;
	}

	async #getEntityStates() {
		// simply return entity states from configured entities
		return await this.configuredEntities.getStates();
	}

	async #entityCommand(data) {
		const entity_id = data.entity_id;
		const entity_type = data.entity_type;
		const cmd_id = data.cmd_id;
		const params = data.params;

		// emit event, so the driver can act on it
		this.events.emit(
			uc.messages.entity_command,
			entity_id,
			entity_type,
			cmd_id,
			params
		);
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	getVersion() {}
	getLocalizationConfig() {}

	async setDeviceState(state) {
		this.#state = state;

		await this.#sendEvent(
			uc.events.device_state,
			{
				state: this.#state,
			},
			"DEVICE"
		);
	}
}

module.exports = new IntegrationAPI();
module.exports.deviceStates = uc.deviceStates;
module.exports.eventTypes = uc.events;
module.exports.Entities = Entities;
