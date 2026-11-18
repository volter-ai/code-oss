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

`FrontendWebSocketClient.connect()` requires a header-capable socket factory
and passes the bearer token only in `Authorization`. It deliberately has no
query-token fallback: browser clients that cannot set upgrade headers use the
HTTP/SSE binding until a separately approved credential bootstrap exists.
