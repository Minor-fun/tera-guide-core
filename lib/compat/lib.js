'use strict';

const spawn = require("../spawn");

class Spawn {
	constructor(handlers, event, entity, dispatch) {
		return new (spawn.Spawn)(entity, dispatch, handlers);
	}
}

module.exports = {
	SpawnItem(item, angle, distance, delay, duration, ...args) {
		(new Spawn(...args)).item(item, angle, distance, delay, duration);
	},
	SpawnMarker(target, angle, distance, delay, duration, highlight, label, ...args) {
		(new Spawn(...args)).marker(target, angle, distance, delay, duration, highlight, label);
	},
	SpawnPoint(item, angle, distance, delay, duration, ...args) {
		(new Spawn(...args)).point(item, angle, distance, delay, duration);
	},
	SpawnVector(item, offsetAngle, offsetDistance, angle, length, delay, duration, ...args) {
		(new Spawn(...args)).vector(item, offsetAngle, offsetDistance, angle, length, delay, duration);
	},
	SpawnCircle(target, item, offsetAngle, offsetDistance, interval, radius, delay, duration, ...args) {
		(new Spawn(...args)).circle(target, item, offsetAngle, offsetDistance, interval, radius, delay, duration);
	},
	SpawnSemicircle(degree1, degree2, item, offsetAngle, offsetDistance, interval, radius, delay, duration, ...args) {
		(new Spawn(...args)).semicircle(degree1, degree2, item, offsetAngle, offsetDistance, interval, radius, delay, duration);
	},
	SpawnObject(type, target, item, offsetAngle, offsetDistance, angle, distance, delay, duration, label, ...args) {
		(new Spawn(...args)).object(type, target, item, offsetAngle, offsetDistance, angle, distance, delay, duration, label);
	}
};

Object.assign(module.exports, spawn, { Spawn });