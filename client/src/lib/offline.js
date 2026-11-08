const QUEUE_KEY = 'campuscheck.checkin.queue';
const DEVICE_KEY = 'campuscheck.device';

function randomId(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    for (let index = 0; index < buffer.length; index += 1) buffer[index] = Math.floor(Math.random() * 256);
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Stable random id for this browser install; the server only ever stores its hash. */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* storage full or unavailable: the check-in simply cannot be queued */
  }
}

export function enqueueCheckIn(payload) {
  const items = readQueue();
  const item = { id: randomId(8), payload, queued_at: new Date().toISOString() };
  items.push(item);
  writeQueue(items);
  return item;
}

export function dequeueCheckIn(id) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export function queueLength() {
  return readQueue().length;
}
