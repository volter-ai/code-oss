# `@volter/supercode-frontend`

This package is the generated, presentation-free attachment facade for one
already-running Volter Harness SDK runtime. It describes and attaches to canonical
history, consumes cursor-safe sequenced events, and sends semantic SDK actions.
It does not import sessions, select providers/models/reduction policies, start
agents, or own persistence.

The checked-in `contract.json` is the self-contained versioned
language-neutral IDL: it defines every wire object, tagged union, request,
event, action, result, error, and opaque-extension boundary without referring
to Rust or TypeScript types. Run `npm run check` to prove the typed Rust and
TypeScript clients are byte-identical to generator output. The HTTP client
opens SSE before taking its attachment snapshot, closing the history/live
race; HTTP uses bearer authentication plus an opaque client id and permission
narrowing. Dropping or detaching this client never closes the runtime;
`close()` is a separate terminate-authorized action.

Attachment snapshots may include `pending_requests`, the complete open-request
set at the snapshot boundary. An empty array means no request remains open;
absence denotes an older runtime with replay-derived state. IDs and payloads
come from the runtime; responses still use its existing exactly-once door.

`snapshot_cursor` is the full capture boundary of the descriptor and request
set, taken under the native projection lock. It differs from `history_cursor`,
which covers only canonical and retired display history. Transports return
unfiltered snapshot replay even when an existing stream has advanced.
`mergeFrontendSnapshot` joins later retained observations in sequence order;
an evicted suffix refuses attachment with `event_gap`. The view installs the
authoritative request set at capture before applying later requests, resolutions
and native turn boundaries. Legacy snapshots without the added cursor retain
their full replay boundary, and absence of the request set retains legacy
replay-derived behavior. These display fields grant no response authority.

`history_events` contains original sequenced events retired from replay since
canonical history was last captured. `history_cursor` covers canonical history
and these historical events; live/replay delivery begins after that boundary.
Historical events are display data, not events to send back to a harness. Both
native projection paths retain up to 4096 retired events plus 4096 replay events.
`history_events_dropped` counts older events outside that display window. A
frontend must show that omission rather than claim a complete transcript.
Canonical message history remains bounded separately. Open requests survive
independently of both event windows. Older clients need updating to render these
additive snapshot fields. See the [source and compilation record](../../docs/evidence/frontend-pending-snapshot-2026-10-10.md).

`FrontendWebSocketClient.connect()` requires a header-capable socket factory
and passes the bearer token only in `Authorization`. It deliberately has no
query-token fallback: browser clients that cannot set upgrade headers use the
HTTP/SSE binding until a separately approved credential bootstrap exists.
