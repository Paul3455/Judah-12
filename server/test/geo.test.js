import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, isValidCoordinate, withinRadius } from '../src/lib/geo.js';

test('U9: identical points are zero metres apart', () => {
  assert.equal(haversineMeters({ lat: 6.5244, lng: 3.3792 }, { lat: 6.5244, lng: 3.3792 }), 0);
});

test('U10: one degree of latitude is about 111 km', () => {
  const distance = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(distance > 110_000 && distance < 112_000, `got ${distance}`);
});

test('U11: the radius boundary is inclusive and rounding is stable', () => {
  const venue = { lat: 6.5244, lng: 3.3792 };
  const near = { lat: 6.5254, lng: 3.3792 }; // ~111 m north
  const distance = haversineMeters(near, venue);
  assert.ok(distance > 90 && distance < 130, `got ${distance}`);
  assert.equal(withinRadius(distance, 150), true);
  assert.equal(withinRadius(distance, 50), false);
  assert.equal(withinRadius(Infinity, 150), false);
});

test('U17: coordinates outside the valid ranges are rejected', () => {
  assert.equal(isValidCoordinate(6.5, 3.3), true);
  assert.equal(isValidCoordinate(91, 3.3), false);
  assert.equal(isValidCoordinate(6.5, 181), false);
  assert.equal(isValidCoordinate(Number.NaN, 3.3), false);
});

test('U18: a missing location never counts as inside the geofence', () => {
  assert.equal(haversineMeters(null, { lat: 6.5, lng: 3.3 }), Infinity);
  assert.equal(withinRadius(haversineMeters(null, { lat: 6.5, lng: 3.3 }), 5000), false);
});
