import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptedStepsFor,
  buildPayload,
  deriveCode,
  stepExpiry,
  timeStep,
  verifyCode,
  verifyPayload,
} from '../src/lib/qr.js';

const SECRET = 'unit-test-qr-secret';
const SESSION_A = '11111111-2222-3333-4444-555555555555';
const SESSION_B = '99999999-8888-7777-6666-555555555555';
const STEP_SECONDS = 45;

const accepted = (nowMs, capturedAtMs = null) =>
  acceptedStepsFor({ nowMs, capturedAtMs, stepSeconds: STEP_SECONDS, graceMinutes: 30 });

test('U1: the same session and window always derive the same code', () => {
  assert.equal(deriveCode(SECRET, SESSION_A, 1234), deriveCode(SECRET, SESSION_A, 1234));
});

test('U2: different sessions in the same window derive different codes', () => {
  assert.notEqual(deriveCode(SECRET, SESSION_A, 1234), deriveCode(SECRET, SESSION_B, 1234));
});

test('U3: the code is six numeric characters', () => {
  for (let step = 0; step < 200; step += 7) {
    assert.match(deriveCode(SECRET, SESSION_A, step), /^\d{6}$/);
  }
});

test('U4: a QR payload round-trips to its session and window', () => {
  const now = Date.now();
  const step = timeStep(now, STEP_SECONDS);
  const payload = buildPayload(SECRET, SESSION_A, step);
  const result = verifyPayload(SECRET, payload, { acceptedSteps: accepted(now) });
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, SESSION_A);
  assert.equal(result.step, step);
});

test('U5: a payload signed with another secret is rejected', () => {
  const now = Date.now();
  const payload = buildPayload('a-different-secret', SESSION_A, timeStep(now, STEP_SECONDS));
  const result = verifyPayload(SECRET, payload, { acceptedSteps: accepted(now) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_signature');
});

test('U6: a payload from two windows ago is expired', () => {
  const now = Date.now();
  const step = timeStep(now, STEP_SECONDS) - 2;
  const payload = buildPayload(SECRET, SESSION_A, step);
  const result = verifyPayload(SECRET, payload, { acceptedSteps: accepted(now) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'expired');
});

test('U7: the previous window is still accepted', () => {
  const now = Date.now();
  const step = timeStep(now, STEP_SECONDS) - 1;
  const payload = buildPayload(SECRET, SESSION_A, step);
  assert.equal(verifyPayload(SECRET, payload, { acceptedSteps: accepted(now) }).ok, true);
});

test('U8: malformed payloads are rejected', () => {
  const now = Date.now();
  for (const payload of ['', 'nope', 'CC1.only-three-parts', 'CC2.11111111-2222-3333-4444-555555555555.1.abc']) {
    const result = verifyPayload(SECRET, payload, { acceptedSteps: accepted(now) });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'malformed');
  }
});

test('U14: a typed six-digit code verifies and a wrong one does not', () => {
  const now = Date.now();
  const step = timeStep(now, STEP_SECONDS);
  const code = deriveCode(SECRET, SESSION_A, step);
  assert.equal(verifyCode(SECRET, SESSION_A, code, { acceptedSteps: accepted(now) }).ok, true);
  assert.equal(verifyCode(SECRET, SESSION_A, '000000', { acceptedSteps: [] }).ok, false);
  assert.equal(verifyCode(SECRET, SESSION_A, '12345', { acceptedSteps: accepted(now) }).reason, 'malformed');
});

test('U15: an offline-queued code is accepted back to the capture time, not older', () => {
  const now = Date.now();
  const capturedAt = now - 8 * 60 * 1000;
  const capturedStep = timeStep(capturedAt, STEP_SECONDS);
  const payload = buildPayload(SECRET, SESSION_A, capturedStep);

  assert.equal(verifyPayload(SECRET, payload, { acceptedSteps: accepted(now, capturedAt) }).ok, true);

  const tooOld = buildPayload(SECRET, SESSION_A, timeStep(now - 45 * 60 * 1000, STEP_SECONDS));
  assert.equal(verifyPayload(SECRET, tooOld, { acceptedSteps: accepted(now, capturedAt) }).ok, false);
});

test('U16: the window expires exactly at the next step boundary', () => {
  const step = 1000;
  assert.equal(stepExpiry(step, STEP_SECONDS).getTime(), (step + 1) * STEP_SECONDS * 1000);
});
