# Volter Harness VS Code frontend

This is an optional VS Code extension that presents an **already-running** Volter Harness SDK runtime in
the editor's own Chat view. It uses the exact generated `@volter/supercode-frontend` client
for all session discovery, history, events, and semantic actions, and VS Code's own chat API for all
presentation — no webview, no React, no stylesheet of its own.

It does not run an agent, load context, authenticate a provider, execute tools,
import sessions, or write session files. The Rust/headless Volter Harness core does not depend on this
package or npm.

## Native chat controls

The optional host-controls state can include `setup: { ready, actions, reason,
cwd }`. Each action supplies `kind` (`login` or `install`), `harness`, `name` and
the exact `command` shown before execution. Chat renders native buttons, with
**Sign in with ChatGPT** for Codex and the reported name for other harnesses.
Clicking asks the host's authenticated `/setup` door to revalidate `{ kind,
harness }` and return the action plus a structured `{ program, arguments, cwd, env? }`
terminal launch. Absolute executables and an optional host-authored PATH keep
the terminal on the same installation and discovery path as the host's probe.
It runs directly as the integrated terminal's process, without typing a shell
command; credentials and
browser interaction belong to the harness. Failed or cancelled processes can be
retried, and closing a terminal never counts as successful authentication.

While setup is not ready, Chat refreshes `/state` every three seconds and exposes
**Check again**. When the host returns a ready runtime connection, it attaches
and reveals that conversation without a reload. Polling only finishes after both
attachment and the host's native reveal command succeed for that same session
and runtime URL. A transient attach/reveal failure stays pending and is retried;
**Check again** retries that handoff even when the host already reports ready.
Changed setup resources refresh
Code-OSS's cached status history after an install. Hosts without these optional
fields keep the existing runtime-attachment behavior.

`starterPrompts?: {label: string; prompt: string}[]` is project data supplied by
the host. An eligible new conversation exposes at most three short command links
in the default participant's native welcome content, outside the transcript.
The host's `fillInputCommand` receives the exact native session resource and full
prompt and must return `{sessionResource, input}` after filling that existing
widget, without submitting. A missing or mismatched receipt is an error.
The untargeted partial-query command is not used. Links never send or write a turn.
Presentation and clicks use the same `starterEligibility` calculation; runtime
and host state changes update the welcome message, and a user turn clears it.
Native Chat also hides its welcome surface immediately when a request is added.
Eligibility requires a successful attachment, an idle runtime, no pending request,
no saved/canonical non-system messages or truncated saved history, and no observed
user turn. Accepted-input events (`user_message`, `turn_started`) and busy snapshots
record turn evidence that survives re-attachment and replay eviction. Setup/status
events can advance cursors without disqualifying a new conversation; system-only
history also stays eligible. The checks run again after
project data loads and before filling; a failed attachment never offers starters.
`supercode.frontend.status(true)` includes each connection's `starterEligibility`:
attachment state, turn state, pending count, saved-history presence/truncation/count
and roles, canonical count/roles, sticky turn evidence, both cursors, replay count
and kinds, active host ID, host busy state, connection identity check, and rejection
reasons. `lastStarterAttempt` preserves the exact post-attachment guard snapshot
and native binding from the latest click. These contain no message bodies or tokens.
A rejected click names its failed conditions instead of a generic new/idle error.
The pinned Chat session API exposes immutable history, without withdrawal or
live enablement of a rendered command part. Starters therefore never enter history.
`defaultChatParticipant.additionalWelcomeMessage` supplies trusted Markdown with
only `supercode.frontend.fillStarter` allowed; labels are escaped and command
arguments are encoded. Hosts without that proposal get no starter offer rather
than permanent transcript buttons. Existing setup actions keep their native status
presentation. No new workbench API or editor-side contribution is required.
The pinned Code-OSS `f16dc165` has no `suggestedPrompts` field in either
`vscode.proposed.defaultChatParticipant.d.ts` or the internal
`IChatViewWelcomeContent`. `ChatViewWelcomePart` renders `additionalMessage` as
Markdown; its optional `firstLinkToButton` converts only one anchor and the
participant welcome never enables that option. The editor's native overlay can
render standalone trusted command links as welcome buttons without a new extension
API; other hosts keep Markdown links. The two introductory lines live together in
this extension's `package.json`: `chatSessions.welcomeMessage` and
`supercodeFrontendWelcome.starterIntroduction`. Hosts own their project prompt data.
If `starterPromptsPending` is true, the project configuration is still loading.
Empty-conversation resolution refreshes the host until that declaration arrives
(cancellable, with a 30-second timeout), so native Chat does not cache an empty
offer before the project adapter loads.

W32/W37 passed starter filling and W37 passed healthy refresh with draft retention.
W44 passed a real boost turn and exposed a presentation defect: transcript starter
buttons remained after the turn even though the guard rejected them. W50 passed
the native welcome fix at `29d8fac99`: all three pointer fills, one real HUD turn,
first-turn disappearance, return-to-idle suppression, and no starters when reopening
the earlier conversation with seven history entries. The shorter introductory copy
is source-only; it needs a frontend build plus a workbench overlay copy.
The accompanying native button and New Session repairs require a Code-OSS compile.
W50 also found that the generic native New Session action
bypasses this provider's creation command; its owning host must route that action
through `chatSessions/newSession` rather than opening an unbound untitled resource.
Signed-out/install transitions and failed-discovery/attachment recovery remain
unverified live. A published frontend and rebuilt workbench are needed for npx users.

A bundling host can expose a private lifecycle endpoint through
`SUPERCODE_FRONTEND_HOST_URL` and `SUPERCODE_FRONTEND_HOST_CREDENTIAL_FILE`.
The endpoint must be loopback HTTP and the credential follows the runtime credential-file
checks. `GET /state` describes the selected harness/model/effort, available choices,
and current connection; `POST /select` asks the host to start the selected configuration
and returns its new scoped connection. The host owns validation, process lifetime,
persistence, and failure handling. Prompts and approvals still use the generated frontend client.
The contract is in `src/host-controls.ts`.

With that host, **Chat: New Chat: Choose Harness, Model and Reasoning** chooses
configuration before opening a separate conversation. A conversation's harness, model and
reasoning settings remain fixed: this integration does not advertise hot swapping. Native
Chat displays its selected model and provider icon inside the composer and its supported
approval policy below it. The response author identifies the harness.

The host publishes durable conversation IDs and their exact harness history identities.
`POST /open` resumes only the requested saved conversation; `POST /remember` binds its
reported native session ID to discovered history. Unknown or missing bindings fail explicitly,
never falling back to the currently active runtime. The host may provide an `openSessionCommand`
to reveal an exact resource through its native widget service. Cached native widgets should
notify `supercode.frontend.activateSession` when focused. The frontend owns no processes.

The permission group offers **Ask for approval** and, on an answerable interactive attachment,
**Auto approve**. Policies are scoped by conversation and captured for each turn; automatic
approval does not bypass harness sandbox rules. Unsupported modes are refused. Unanswerable
harnesses show **Harness permissions**. Previously answered requests cannot affect another
connection. Native command-button fallback limitations are documented below.

Text files and selected ranges use native Add Context and attachment chips. Their current
editor contents are serialized as explicitly labeled user-supplied context through the existing
prompt protocol. Binary text, more than 256 KiB per attachment, or more than 1 MiB total is
rejected without truncation. Image and tool attachments remain unavailable. Model inventories,
mode/tool controls, and context limits are not invented where the runtime has no contract.

These controls use native provider APIs; there is no custom composer or webview.
`test/bindings.test.mjs`, `test/context.test.mjs`, and `test/host-controls.test.mjs` cover
routing boundaries, context serialization/limits, identity and approval interpretation.
Live product acceptance is separate from these frontend unit tests.

## Attaching

Three paths, in precedence order.

1. **A host hands over the connection.** `activate()` returns an API a bundling product calls when
   it already knows where its runtime is:

   ```ts
   const supercode = vscode.extensions.getExtension('volter-ai-dev.supercode-frontend-vscode');
   const api = await supercode.activate();
   await api.connect({baseUrl, token, permissions: ['observe', 'interact', 'approve']});
   // api.connections, api.disconnect(id), api.grantedProposals, api.onDidChangeConnections
   ```

2. **The runtime's environment handover.** At activation the extension reads
   `SUPERCODE_FRONTEND_URL`, `SUPERCODE_FRONTEND_CLIENT_ID`, `SUPERCODE_FRONTEND_CREDENTIAL_FILE`
   and `SUPERCODE_FRONTEND_PERMISSIONS` from the extension host's environment — the same shape
   `crates/cli/src/frontend_client.rs` already uses to launch the pi frontend, without the `PI`
   infix. A Code-OSS server passes its environment to its extension host, so a product that starts
   the server hands the connection over with no pasted token. The credential is a *file*, read with
   `sdk/frontend-pi`'s rules (a regular, private, single-linked file of 64 hex bytes, re-checked
   across the open). It differs from pi's in one deliberate way: the token is stored in
   `SecretStorage` **before** the one-shot file is removed, because an extension host outlives one
   attachment and reloads.

   The credential file is **read, never consumed**. `sdk/frontend-pi` unlinks it, because a pi
   process is exactly one attachment; an extension host is not — it reloads, and a reload must not
   lose the runtime it was handed. Nor can the token be kept instead: `SecretStorage` is in-memory
   in a host with no credential provider (measured in VS Code Web), and there is no durable place
   an extension may put a bearer token that is better than the runtime's own private 0600 file. The
   base URL it was handed is remembered in `globalState`, so the next activation reconnects.

   A host that could not start a runtime at all says so with the fourth variable,
   `SUPERCODE_FRONTEND_UNAVAILABLE` (or `connect({unavailable})`): its own sentence, naming its own
   harness and the command a person must type. Nothing is attached and that sentence is what the
   Chat view shows. It is shown as a **session** — `chatViewsWelcome` cannot do it, because
   `ChatViewPane.shouldShowWelcome()` in
   `src/vs/workbench/contrib/chat/browser/widgetHosts/viewPane/chatViewPane.ts` begins
   `const shouldShow = !hasCoreAgent && …`, so the whole welcome control is suppressed whenever any
   core agent is registered for the Chat location, which a Code-OSS derivative with an agent host
   always has; the `when` clause is never consulted. The session's `activeResponseCallback` is the
   one door that writes into a session nobody has typed into, so the reason is on screen where the
   eye lands rather than waiting for a prompt.

   An attachment that arrives with HISTORY — a resumed runtime, `claude --resume <id>` — opens its
   own session once, so the panel opens *on* the conversation instead of beside it. A runtime with
   no history is left alone: there is nothing to show and stealing the panel would be rude.

3. **Settings plus `SecretStorage`.** `supercode.frontend.baseUrl` names the runtime;
   **Volter Harness: Set Runtime Token** prompts once and stores the credential in `SecretStorage`. The
   credential is never a setting and never a URL query. `supercode.frontend.permissions` narrows the
   attachment; `observe` is always included, and every control is still rendered only when the
   runtime's own descriptor advertises the matching action.

The generated client opens SSE **before** taking the attachment snapshot, so no event falls between
history and live. Dropping or detaching never closes the runtime.

## API proposals, and what it does without them

The extension asks for five proposals. A host grants them through
`product.json#extensionEnabledApiProposals` (a Code-OSS derivative that bundles this extension) or
`--enable-proposed-api volter-ai-dev.supercode-frontend-vscode`. **Stock VS Code grants none, and
everything below still works there** — the granted set is read back from the extension host at
runtime (`context.extension.packageJSON.enabledApiProposals` is the *filtered* description, not the
request), and each part declares its own fallback.

| Proposal | What it buys | Without it |
|---|---|---|
| `defaultChatParticipant` | `isDefault` — Volter Harness answers the Chat view with no `@` mention | the ordinary `@supercode` participant; a mention is required |
| `chatParticipantAdditions` | `ChatToolInvocationPart`, `ChatResponseConfirmationPart`, `ChatResponseWarningPart`, `codeblockUri`, `ChatResponseThinkingProgressPart` | progress lines, labeled Markdown results, typed replies, plain fenced diffs, blockquoted reasoning |
| `chatSessionsProvider` | the runtime's sessions in the Chat view's session picker, each reopening with its history | the participant still attaches; there is no session list |
| `chatParticipantPrivate` | dynamic participant identity with the harness and provider icon | static participant identity |
| `chatProvider` | native fixed-model identity and provider icon | host new-chat configuration |

The session participant uses the exact session type id (`supercode`). With
`chatParticipantPrivate`, the extension registers its dynamic identity directly and keeps
`canDelegate` disabled so the workbench does not pre-register a generic agent that masks the
model name. Model descriptors target only the `supercode` session type, whose contribution declares
`requiresCustomModels` so the workbench renders and forwards the native model selection. As in Code-OSS's own
AgentHostLanguageModelProvider, they do not expose a second direct inference endpoint:
the participant validates model settings against the bound conversation, and the runtime
owns execution. Unknown token limits remain zero, not invented. Model/reasoning changes
require an explicitly new conversation; they never reset an existing transcript on send.
The permission group uses `kind: permissions`; the embedding workbench must expose its
native permission-picker action for this session type. No composer CSS or bespoke toolbar
is supplied by this frontend.

Two participant contributions exist for one reason: the workbench refuses a `chatParticipants` entry
that declares `isDefault` without the grant *and skips it entirely*, so a single entry would leave a
stock host with no `@supercode` at all. `supercode.chat` carries no proposal-gated manifest field and
is `when`-gated on `!supercodeChatDefaultParticipant`; `supercode.chat.default` carries `isDefault`,
`locations: ["panel"]` and `modes: ["ask"]` and is gated on the inverse. The extension sets that
context key from the grant it actually received. A host that grants nothing logs one line naming the
refused proposal and runs on the plain participant. (`locations` is omitted from the plain entry on
purpose: it too needs `chatParticipantAdditions`, and its absence already defaults to the Chat panel
— `chatParticipant.contribution.ts`, `locations: isNonEmptyArray(...) ? ... : [ChatAgentLocation.Chat]`.)

## The mapping

`src/view.ts` is the whole event-to-chat-part mapping and it is pure: every input is the runtime's
own sequenced `FrontendEvent`, every output is a description of a VS Code chat part plus the proposal
it needs and the fallback it degrades to. Each arm names the producer it reads.

| Event kind | Producer | Rendered as |
|---|---|---|
| `text_delta` | `crates/runtime/src/event.rs` `AgentEvent::TextDelta` | `response.markdown` (streamed) |
| `user_message` | `crates/harness/src/server.rs` `submit_claimed` | the request turn in history; dropped live (VS Code already shows it) |
| `turn_started` / `turn_completed` / `turn_succeeded` | `submit_claimed`; `AgentEvent::TurnCompleted` | lifecycle only — the handler resolves, nothing renders |
| `turn_interrupted` | `submit_claimed` | an italic notice |
| `turn_failed` | `submit_claimed` | `ChatResponseWarningPart` → blockquote |
| `tool_call_started` / `tool_call_completed` | `AgentEvent::ToolCallStarted` / `ToolCallCompleted` | one `ChatToolInvocationPart` per call, updated in place with its result (`enablePartialUpdate`) → a progress line plus a labeled Markdown result |
| `diff_updated` | `crates/codex-frontend/src/codex_app_server_v0_144.rs` (stock Codex `turn/diff/updated`) | `codeblockUri` + a fenced `diff` block, plus one stable `reference` per file the diff names → the fenced block alone |
| `request` | `crates/harness/src/server.rs` `FrontendRequestBroker::publish` | a titled markdown block plus one **command button per answer** — stable API, no proposal |
| `cache_warning` | `AgentEvent::CacheWarning` | `ChatResponseWarningPart` → blockquote |
| `usage` | `AgentEvent::Usage` | a progress line |
| `background_output` | `AgentEvent::BackgroundOutput` | a fenced block, saying so when the runtime stopped retaining |
| `scheduled_prompt_started` / `_deferred` / `_completed` | declared by `frontend_descriptor`'s `display.event_kinds` | a progress line |
| `scheduler_error` | same | `ChatResponseWarningPart` → blockquote |
| `reasoning` / `thinking` | no producer in this repository; read because `crates/frontend-model/src/transcript.rs` reads them | `ChatResponseThinkingProgressPart` → blockquote |
| `stream_error` / `transport_error` / `watch_error` / `runtime_disconnected` | `crates/opencode-frontend/src/server.rs`; `crates/interchange/src/watch.rs`; synthesized by a frontend (`crates/frontend-tui/src/app.rs`); `stream_error` has no producer here | `ChatResponseWarningPart` → blockquote |
| anything else | opaque by contract | one **bounded** markdown cell that names the kind and shows the payload — never dropped |

**Why `diff_updated` is not an edit part.** Measured: the payload carries one unified-diff *string*
and nothing else. `ChatResponseTextEditPart` wants ranges and the runtime has already written the
file, so replaying them would double-apply. `ChatResponseMultiDiffPart` wants an `originalUri` and a
`modifiedUri` per file — two resources this frontend would have to fabricate and serve.
`ChatResponseExternalEditPart` brackets a callback that *performs* the edit so the editor can take a
"before" snapshot; ours would be a no-op after the write, making the editor's undo stop wrong. What
the payload does state is which files it touched (`+++ b/<path>`), so those become stable references.

**Why a request is buttons.** Two richer mechanisms were tried against a live runtime in the
editor's own Chat view, and both failed there, so neither ships. `ChatResponseConfirmationPart`
retires its own buttons on click — but the click answers by sending a **new chat request**
(`chatConfirmationContentPart.onDidClick`), and a Volter Harness approval is raised **while the turn is
still running** (`decide_approval` blocks the agent loop), so the editor refuses that request, the
click does nothing, and the runtime waits forever. `stream.questionCarousel` is the right shape on
paper — it resolves inside the running turn and the widget retires itself — and the widget did
render with its three options; but Submit retired it without ever delivering an answer this
frontend could read, leaving the runtime blocked. A preferred path that silently swallows the
answer is worse than a plain one that works. A `ChatResponseCommandButtonPart` runs inside the live
turn, needs no proposal, and carries its own answer per button — so an approval offers `Allow` / `Allow for session` / `Deny`, all three, where a
confirmation's one `data` payload could only ever have carried two. The command
(`supercode.frontend.respond`) narrates itself in the status bar, because an action whose success is
invisible is one nobody can trust. A pushed command button cannot be withdrawn — `chatCommandContentPart`
enables on `!isStale` and carries no used-state, and only `confirmation`, `mcpAuthenticationRequired`,
`planReview` and `questionCarousel` have one — so the buttons stay visible after the answer. They are
inert: the command refuses a request the runtime no longer holds and says "already resolved", and the
resolution sentence lands directly beneath them. An elicitation that carries a `requested_schema` gets an
`Answer…` button that asks for the value first; a request still pending while the session is idle
can also be answered by typing.

**A hosted harness runtime.** When the runtime is one Volter Harness HOSTS — a Claude Code, Codex, pi or
opencode session it started through `harness.v1.runtimes.start` — an approval it raises is
**answerable from this view** for every harness whose reply this runtime can translate
(`crates/harness/src/runtime/hosted.rs`): the canonical `respond {decision}` becomes that harness's
own envelope, which for Claude Code is `{behavior:'allow'}` / `{behavior:'deny', message}`. The
request states which decisions its harness protocol actually carries, so this view offers exactly
those and no button the runtime would refuse — Claude Code has an allow and a deny and no
always-allow *behavior* at all, so it gets two. A harness with no translation keeps
`actions.respond: false`, and then the request is rendered as an observation naming who answers it,
because a control appears only for an action the descriptor advertises. Tool completions name only
the call they answer (Claude Code's `tool_result` block carries just a `tool_use_id`), so an unnamed
completion keeps the name the start stated rather than becoming a tool called `tool`.

**Bounds.** The projection is bounded like `@volter/supercode-frontend-browser`'s: 64 KiB per
part, 256 characters per title, 2 KiB for an opaque payload, 500 history turns. When turns are
omitted the view says so; the runtime's own history is unchanged and authoritative. Terminal control
characters never reach a rendered part.

**The turn.** A chat request submits through `frontend.v2.send_input` and resolves on the first
`turn_succeeded` / `turn_failed` / `turn_interrupted`; the request's cancellation token calls
`frontend.v2.interrupt`. It *also* resolves when the descriptor goes idle after having been busy:
the editor holds the chat response open until the handler returns, and a frontend that hangs one
forever is worse than one that ends it a beat early. A sequence gap is likewise not fatal — it is
what the cursor exists for, so the session re-takes its snapshot rather than throwing out of the
live listener and stranding every in-flight turn.

**The lease.** The runtime hands ONE controller a lease and expires it
(`crates/harness/src/runtime_lease.rs`), so an attachment that may submit takes control on attach
and heartbeats at a third of the advertised TTL; `controller_required` / `lease_expired` on any
action is a take-control-and-retry, never something the view reports.

**The system prompt renders nothing.** It is in the runtime's canonical history because the MODEL
needs it; a reader does not, and a collapsed block is still a reader's problem. No chat product shows
one to a person, so `role: 'system'` is dropped outright and the transcript starts where the
conversation does.

**Session times are real or nothing.** `frontend.v2` carries no session timestamp, and the editor's
session list ALWAYS reads `timing.created`, rendering the epoch ("57 yrs ago") when a provider
supplies none — there is no path in `agentSessionsViewer` that omits the time. So the item gets the
true times this frontend does know: when this window attached, and the turn boundaries it watched go
by. Never a zero dressed up as a date.

**History.** Saved tool results use labeled Markdown and fenced output; raw HTML is
not supported by native history rendering. A saved call is labeled neutrally because
a recorded invocation does not prove that permission was granted. VS Code's chat history is request/response **pairs** and drops a response turn with no
request before it. A runtime transcript legitimately opens with assistant or system content — the
runtime compacts, so its canonical history can begin `[earlier conversation compacted: N messages]`
with no user turn left. Rather than drop it, the projection pairs it with a marker turn,
`⟨supercode runtime history⟩`, which names itself: nothing is presented as a person's words.

## Building and packaging

```
npm install && npm run build      # sync the generated client, then tsc
npm run extension                 # write the VS Code extension folder to .extension/
node scripts/pack-extension.mjs --out .extension --vsix          # and a .vsix
node scripts/pack-extension.mjs --out .stock --no-proposals      # the stock-host manifest
```

One `package.json` cannot be both manifests: npm wants the scoped
`@volter/supercode-frontend-vscode`, while VS Code builds an extension id as
`${publisher}.${name}` and a scope would put an `@` and a `/` in it. The npm manifest is the source
of truth and `scripts/pack-extension.mjs` writes the extension's manifest beside the same built
files, with the plain name that resolves to `volter-ai-dev.supercode-frontend-vscode`. That folder is
what `--extensions-dir` wants; `--vsix` runs the stock packer over it.

`scripts/pack-extension.mjs` **ships inside the published package**, so a host that bundles this
extension into its own build runs the same transform rather than reimplementing it:

```
node node_modules/@volter/supercode-frontend-vscode/scripts/pack-extension.mjs \
     --out <build>/extensions/supercode-chat
```

The installed package is already built (`dist/` and `vendor/` are in `files`), so the script writes
the extension manifest beside those bytes with no build step of its own.

Conversation creation uses `ChatSessionItemController.newChatSessionItemHandler`.
Permissions use `getChatSessionInputState` and its change/disposal events, with
per-conversation preferences persisted in workspace state. New untitled chats
start with Ask; old untitled bindings are read only for backwards compatibility.
Restored response cancellation interrupts the runtime and waits for acknowledgement.
Session-list updates consistently prioritize pending input over busy status.

The pinned Code-OSS host needs a resource-scoping repair in its input-state change
routing: stock code broadcasts changes to all input states of a provider. The
Volter overlay guards this fix with a native regression test. The former legacy
option-notification queue is no longer required. The narrow reveal/focus bridge
remains because the native model catalogue and participant identity are provider-wide.
