"use strict";

const deviceStates = {
	connected: "CONNECTED",
	connecting: "CONNECTING",
	disconnected: "DISCONNECTED",
	error: "ERROR",
};

module.exports.deviceStates = deviceStates;

const messages = {
	get_driver_version: "get_driver_version",
	get_device_state: "get_device_state",
	get_available_entities: "get_available_entities",
	get_entity_states: "get_entity_states",
	subscribe_events: "subscribe_events",
	unsubscribe_events: "unsubscribe_events",
	entity_command: "entity_command",
};

module.exports.messages = messages;

const events = {
	// own events
	entity_command: "entity_command",
	entity_attributes_updated: "entity_attributes_updated",
	subscribe_entities: "subscribe_entities",
	unsubscribe_entities: "unsubscribe_entities",

	// integration api events
	connect: "connect",
	disconnect: "disconnect",
	driver_version: "driver_version",
	device_state: "device_state",
	available_entities: "available_entities",
	entity_states: "entity_states",
	entity_change: "entity_change",
};

module.exports.events = events;
