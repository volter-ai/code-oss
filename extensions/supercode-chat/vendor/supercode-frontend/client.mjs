import { FRONTEND_METHODS, FRONTEND_SCHEMA } from './generated.mjs';
import { GeneratedFrontendClient } from './generated-client.mjs';

export { FRONTEND_EVENT_METHOD, FRONTEND_METHODS, FRONTEND_SCHEMA } from './generated.mjs';
export { GeneratedFrontendClient } from './generated-client.mjs';

class FrontendEmitter extends GeneratedFrontendClient {
  #listeners = new Map();

  on(event, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const listeners = this.#listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  off(event, listener) {
    const listeners = this.#listeners.get(event);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.#listeners.delete(event);
    return this;
  }

  once(event, listener) {
    const onceListener = (...args) => {
      this.off(event, onceListener);
      listener(...args);
    };
    return this.on(event, onceListener);
  }

  emit(event, ...args) {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) listener(...args);
  }
}

export class FrontendClientError extends Error {
  constructor(error) {
    super(error?.message ?? 'frontend request failed');
    this.name = error?.name ?? 'transport';
    this.code = error?.code ?? null;
    this.operation = error?.operation ?? null;
    this.permission = error?.permission ?? null;
    this.holder = error?.holder ?? null;
    this.expiresAtMs = error?.expiresAtMs ?? null;
    this.extensions = {
      ...(error?.extensions && typeof error.extensions === 'object' ? error.extensions : {}),
      ...Object.fromEntries(
        Object.entries(error ?? {}).filter(([key]) => !['name', 'message', 'code', 'operation', 'permission', 'holder', 'expiresAtMs', 'extensions'].includes(key)),
      ),
    };
  }
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function randomClientId() {
  return `ts-${globalThis.crypto.randomUUID()}`;
}

function validateDescriptor(descriptor) {
  if (!descriptor || descriptor.schema_version !== 2 || typeof descriptor.session_id !== 'string') {
    throw new FrontendClientError({ name: 'transport', message: `peer is not ${FRONTEND_SCHEMA}` });
  }
  return descriptor;
}

function validateSnapshot(snapshot) {
  validateDescriptor(snapshot?.descriptor);
  if (!Array.isArray(snapshot.history) || !Array.isArray(snapshot.replay)
    || !Number.isSafeInteger(snapshot.history_cursor) || snapshot.history_cursor < 0
    || (snapshot.history_events !== undefined && !Array.isArray(snapshot.history_events))
    || (snapshot.history_events_dropped !== undefined
      && (!Number.isSafeInteger(snapshot.history_events_dropped) || snapshot.history_events_dropped < 0))) {
    throw new FrontendClientError({name:'transport', message:'invalid frontend attachment snapshot'});
  }
  let previous = 0;
  for (const event of snapshot.history_events ?? []) {
    if (!Number.isSafeInteger(event?.sequence) || event.sequence <= previous
      || (previous > 0 && event.sequence !== previous + 1)
      || event.sequence > snapshot.history_cursor || typeof event.kind !== 'string') {
      throw new FrontendClientError({name:'transport', message:'invalid frontend historical event boundary'});
    }
    previous = event.sequence;
  }
  if (previous > 0 && previous !== snapshot.history_cursor) {
    throw new FrontendClientError({name:'transport', message:'incomplete frontend historical event boundary'});
  }
}

/** Join a captured snapshot to retained later observations without changing
 * the native capture point. A missing bounded suffix refuses attachment. */
export function mergeFrontendSnapshot(snapshot, observed = [], cursor = 0) {
  validateSnapshot(snapshot);
  const captureCursor = snapshot.snapshot_cursor ?? Math.max(snapshot.history_cursor,
    ...snapshot.replay.map(event => event.sequence));
  if (!Number.isSafeInteger(captureCursor) || captureCursor < snapshot.history_cursor
    || !Number.isSafeInteger(cursor) || cursor < 0) {
    throw new FrontendClientError({name:'transport', message:'invalid frontend snapshot capture boundary'});
  }
  const events = new Map();
  for (const event of snapshot.replay) {
    if (!Number.isSafeInteger(event?.sequence) || event.sequence <= snapshot.history_cursor
      || event.sequence > captureCursor || typeof event.kind !== 'string') {
      throw new FrontendClientError({name:'transport', message:'invalid frontend snapshot replay boundary'});
    }
    events.set(event.sequence, event);
  }
  for (const event of observed) {
    if (event.sequence > captureCursor) events.set(event.sequence, event);
  }
  const replay = [...events.values()].sort((a, b) => a.sequence - b.sequence);
  const later = replay.filter(event => event.sequence > captureCursor);
  let projected = captureCursor;
  for (const event of later) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== projected + 1) {
      throw new FrontendClientError({name:'event_gap', message:`frontend snapshot needs event ${projected + 1}, received ${event.sequence}`});
    }
    projected = event.sequence;
  }
  if (projected < cursor) {
    throw new FrontendClientError({name:'event_gap', message:`frontend snapshot lost retained events ${projected + 1} through ${cursor}`});
  }
  return {captureCursor, cursor:projected, replay, later};
}

/** Project only native lifecycle events; a model round-trip does not idle a turn. */
export function projectFrontendDescriptor(descriptor, event) {
  if (!descriptor) return descriptor;
  if (event.kind === 'runtime_disconnected') {
    return {...descriptor, connection_state:'shutting_down', turn_state:'idle',
      actions:{...descriptor.actions, submit:false, steer:false, interrupt:false, respond:false}};
  }
  if (['turn_succeeded', 'turn_failed', 'turn_interrupted'].includes(event.kind)) {
    return {...descriptor, turn_state:'idle'};
  }
  if (['turn_started', 'user_message'].includes(event.kind)) return {...descriptor, turn_state:'busy'};
  return descriptor;
}

/** The runtime-minted input id a `user_message` or `turn_started` carries, or null (another kind, or an older runtime). */
export function frontendEventInputId(event) {
  if (event?.kind !== 'user_message' && event?.kind !== 'turn_started') return null;
  const id = event.payload?.input_id;
  return typeof id === 'string' ? id : null;
}

/** Whether a `turn_started` joins the turn already running (`payload.joins`): the same response goes on. */
export function frontendEventJoins(event) {
  return event?.kind === 'turn_started' && event.payload?.joins === true;
}

export class FrontendClient extends FrontendEmitter {
  #baseUrl;
  #token;
  #clientId;
  #permissions;
  #nextId = 1;
  #fetch;
  #eventAbort = null;
  #pendingEventResponse = null;
  #lastSequence = 0;

  constructor({ baseUrl, token, clientId = randomClientId(), permissions = ['observe', 'interact', 'approve'], fetch = globalThis.fetch }) {
    super();
    this.#baseUrl = requiredString(baseUrl, 'baseUrl').replace(/\/$/, '');
    this.#token = requiredString(token, 'token');
    this.#clientId = requiredString(clientId, 'clientId');
    this.#permissions = [...permissions];
    if (typeof fetch !== 'function') throw new TypeError('fetch implementation is required');
    // Browser-native `window.fetch` performs a receiver brand check. Calling
    // it later as `this.#fetch(...)` would bind `this` to FrontendClient and
    // throw `Illegal invocation`; bind only the native global while leaving
    // injected test/host implementations receiver-neutral.
    this.#fetch = fetch === globalThis.fetch ? fetch.bind(globalThis) : (...args) => fetch(...args);
  }

  get clientId() { return this.#clientId; }
  get lastSequence() { return this.#lastSequence; }

  headers() {
    return {
      authorization: `Bearer ${this.#token}`,
      'content-type': 'application/json',
      'x-supercode-client-id': this.#clientId,
      'x-supercode-permissions': this.#permissions.join(','),
    };
  }

  async rpc(method, params = {}, options = {}) {
    const response = await this.#fetch(`${this.#baseUrl}/rpc`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id: this.#nextId++, method, params }),
      signal: options.signal,
    });
    if (!response.ok) throw new FrontendClientError({ name: 'transport', message: `frontend HTTP ${response.status}` });
    const envelope = await response.json();
    if (envelope.error) throw new FrontendClientError(envelope.error);
    return envelope.result;
  }

  async describe(options) { return validateDescriptor(await this.rpc(FRONTEND_METHODS.describe, {}, options)); }
  async attach(limit = 1000, { afterSequence = 0, ...options } = {}) {
    // Establish the live subscription before taking the snapshot. The body
    // stream buffers while the RPC is in flight, so every racing event is in
    // either snapshot.replay or this already-open stream.
    if (!this.#eventAbort) this.#pendingEventResponse = await this.#openEventStream(null, options.signal);
    let snapshot;
    try {
      snapshot = await super.attach(limit, { afterSequence, ...options });
    } catch (error) {
      this.stopEvents();
      throw error;
    }
    validateSnapshot(snapshot);
    // Replay remains the native snapshot's, even if a running stream already
    // delivered some of it. View adapters need that capture boundary to merge
    // their later observations; the stream's delivery cursor cannot erase it.
    const {captureCursor} = mergeFrontendSnapshot(snapshot);
    this.#lastSequence = Math.max(this.#lastSequence, afterSequence, captureCursor);
    return snapshot;
  }
  async #openEventStream(afterSequence, signal) {
    if (this.#eventAbort) throw new FrontendClientError({ name: 'transport', message: 'frontend event stream already active' });
    const controller = new AbortController();
    this.#eventAbort = controller;
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const suffix = afterSequence === null ? '' : `?after_sequence=${encodeURIComponent(afterSequence)}`;
      const response = await this.#fetch(`${this.#baseUrl}/frontend/events${suffix}`, {
        headers: this.headers(),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new FrontendClientError({ name: 'transport', message: `frontend events HTTP ${response.status}` });
      return response;
    } catch (error) {
      this.#eventAbort = null;
      throw error;
    }
  }

  async startEvents({ afterSequence = this.#lastSequence, signal } = {}) {
    const response = this.#pendingEventResponse ?? await this.#openEventStream(afterSequence, signal);
    this.#pendingEventResponse = null;
    try {
      const decoder = new TextDecoder();
      let pending = '';
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        let boundary;
        while ((boundary = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, boundary).replace(/\r$/, '');
          pending = pending.slice(boundary + 1);
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));
          if (!Number.isSafeInteger(event.sequence) || event.sequence <= afterSequence || event.sequence <= this.#lastSequence) continue;
          this.#lastSequence = event.sequence;
          this.emit('event', event);
        }
      }
    } finally {
      this.#eventAbort = null;
      this.#pendingEventResponse = null;
      this.emit('disconnect');
    }
  }

  stopEvents() {
    this.#pendingEventResponse = null;
    this.#eventAbort?.abort();
  }
  async detach(options) {
    const result = await this.rpc(FRONTEND_METHODS.detach, {}, options);
    this.stopEvents();
    return result;
  }
  async close(options) {
    const result = await this.rpc(FRONTEND_METHODS.close, {}, options);
    this.stopEvents();
    return result;
  }
}

/** Header-capable WebSocket binding. The injected factory receives the exact
 * authentication headers; browser-only factories must not move secrets into
 * URLs and should use the HTTP/SSE client until an approved cookie/token
 * bootstrap exists. */
export class FrontendWebSocketClient extends FrontendEmitter {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #lastSequence = 0;

  constructor(socket) {
    super();
    if (!socket || typeof socket.send !== 'function' || typeof socket.addEventListener !== 'function') {
      throw new TypeError('an open WebSocket-compatible transport is required');
    }
    this.#socket = socket;
    socket.addEventListener('message', (message) => this.#receive(message.data));
    socket.addEventListener('close', () => this.#disconnect('WebSocket transport closed'));
    socket.addEventListener('error', () => this.#disconnect('WebSocket transport failed'));
  }

  static async connect({ url, token, clientId = randomClientId(), permissions = ['observe', 'interact', 'approve'], webSocketFactory }) {
    requiredString(url, 'url');
    requiredString(token, 'token');
    if (typeof webSocketFactory !== 'function') throw new TypeError('header-capable webSocketFactory is required');
    const socket = await webSocketFactory({
      url,
      headers: {
        authorization: `Bearer ${token}`,
        'x-supercode-client-id': requiredString(clientId, 'clientId'),
        'x-supercode-permissions': [...permissions].join(','),
      },
    });
    return new FrontendWebSocketClient(socket);
  }

  get lastSequence() { return this.#lastSequence; }

  #receive(data) {
    let envelope;
    try {
      envelope = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    } catch (error) {
      this.emit('protocolError', error);
      return;
    }
    if (envelope.method === 'frontend.v2.event') {
      const event = envelope.params?.event;
      if (event && Number.isSafeInteger(event.sequence) && event.sequence > this.#lastSequence) {
        this.#lastSequence = event.sequence;
        this.emit('event', event);
      }
      if (envelope.params?.error) this.emit('protocolError', new FrontendClientError(envelope.params.error));
      return;
    }
    const pending = this.#pending.get(envelope.id);
    if (!pending) return;
    this.#pending.delete(envelope.id);
    if (envelope.error) pending.reject(new FrontendClientError(envelope.error));
    else pending.resolve(envelope.result);
  }

  #disconnect(message) {
    for (const pending of this.#pending.values()) {
      pending.reject(new FrontendClientError({name:'transport', message}));
    }
    this.#pending.clear();
    this.emit('disconnect');
  }

  rpc(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {resolve, reject});
      try {
        this.#socket.send(JSON.stringify({jsonrpc:'2.0', id, method, params}));
      } catch (error) {
        this.#pending.delete(id);
        reject(new FrontendClientError({name:'transport', message:String(error)}));
      }
    });
  }

  async describe() { return validateDescriptor(await this.rpc(FRONTEND_METHODS.describe)); }
  async attach(limit = 1000, {afterSequence = 0} = {}) {
    const snapshot = await this.rpc(FRONTEND_METHODS.attach, {limit, after_sequence:afterSequence});
    validateSnapshot(snapshot);
    // Replay remains the native snapshot's, even if a running stream already
    // delivered some of it. View adapters need that capture boundary to merge
    // their later observations; the stream's delivery cursor cannot erase it.
    const {captureCursor} = mergeFrontendSnapshot(snapshot);
    this.#lastSequence = Math.max(this.#lastSequence, afterSequence, captureCursor);
    return snapshot;
  }
  async detach() { const result = await this.rpc(FRONTEND_METHODS.detach); this.closeTransport(); return result; }
  async close() { const result = await this.rpc(FRONTEND_METHODS.close); this.closeTransport(); return result; }
  closeTransport() { this.#socket.close(); }
}
