# Volter Harness VS Code frontend

This is an optional VS Code extension that presents an **already-running** Volter Harness SDK runtime in
the editor's own Chat view. It uses the exact generated `@volter/supercode-frontend` client
for all session discovery, history, events, and semantic actions, and VS Code's own chat API for all
presentation — no webview, no React, no stylesheet of its own.

It does not run an agent, load context, authenticate a provider, execute tools,
import sessions, or write session files. The Rust/headless Volter Harness core does not depend on this
package or npm.

## Native chat controls

When no coding agent is ready, native Chat offers **Sign in with ChatGPT**
(Codex) and **Sign in with Claude** (Claude Code), with the subtitle
“Use the AI plan you already pay for.” Both use the coding agent in this Chat.
A click starts one install/sign-in operation for that agent. The host returns
its exact structured terminal launch through the authenticated `/setup` door;
a missing agent installs from its vendor package, then the same click continues
to login. The frontend never interprets repair prose as a command.

The host's `/state` supplies `setup: {ready, actions, agents, reason, cwd}`.
Each agent supplies `{harness, name, installed, signedIn, account}`; an unknown
account is `null`. Each action supplies `{kind, harness, name, command}` with
`kind` equal to `install` or `login`. The host revalidates the chosen action
before returning `{program, arguments, cwd, env?}`. Credentials remain with
the coding agent; browser sign-in requires the person's approval.

The versioned local `supercode.frontend.setupState` command returns
`{version:1, visible, title, subtitle, footnote, composerPlaceholder,
composerEnabled, rows, signedInNotice}`. Rows include both providers with their
installation/login state, `phase` (`idle`, `installing`, `signing-in`, `failed`,
`signed-in`), `buttonLabel`, `caption`, `busy`, and `operationId`. A renderer
uses `visible` and `composerEnabled`, rather than the mere presence of rows,
to decide whether the welcome or disabled composer belongs in the current
view. This local read starts no process and makes no host request.

`supercode.frontend.beginSetup(harness)` starts work and returns its receipt.
Duplicate clicks on a busy agent return the same operation. The other agent
remains usable. `supercode.frontend.cancelSetup(harness, operationId)` cancels
only the terminal that operation started; a stale operation id does nothing.
Cancel returns to idle, while process failure shows **Try again** and
**Sign-in didn't finish.** The full reason is written to the Chat output log.
A process finishing never proves authentication: the host's native inventory
must report a signed-in account. Once it does, readiness polling attaches
and reveals the conversation without requiring another click, including when
sign-in finishes in a separate terminal.

Welcome metadata changes in place on each phase change. Cyclotron's paired
native renderer uses it to show primary/secondary buttons, disabled spinners,
one caption/Cancel/error slot per provider, and **Sign in to start a chat**
in the disabled composer. Stock hosts retain native Markdown links. The
editor's renderer/build is a separate integration; the frontend package alone
does not claim those richer controls are installed in every host. A successful
explicit sign-in publishes **Signed in with ChatGPT** or **Signed in with
Claude** above the newly opened Chat.

Setup creates no transcript turns. The guarded readiness reveal preserves a
newer draft or selection; a welcome-owned empty draft can give way to the first
ready conversation. Hosts without the guarded reveal command report the
limitation. Passive inventory polling retries a transient handoff failure until
attachment and reveal both succeed for the same conversation.

A bundling host can expose a private lifecycle endpoint through
`SUPERCODE_FRONTEND_HOST_URL` and `SUPERCODE_FRONTEND_HOST_CREDENTIAL_FILE`.
The endpoint must be loopback HTTP and the credential follows the runtime credential-file
checks. `GET /state` describes the selected harness/model/effort, available choices,
and current connection; `POST /select` asks the host to start the selected configuration
and returns its new scoped connection. The host owns validation, process lifetime,
persistence, and failure handling. Prompts and approvals still use the generated frontend client.
The contract is in `src/host-controls.ts`.

With that host, **New Session** / **Chat: New Chat: Choose Agent** lists all
coding agents, including Codex and Claude Code when missing or signed out.
Their rows say **Signed in with ChatGPT/Claude** or **Sign in with
ChatGPT/Claude…**. A sign-in row starts the same install/login operation as the
welcome. Selecting a ready agent leaves model and reasoning at its defaults;
the separate **<agent>: model and reasoning…** rows retain explicit settings.
The picker is titled **New chat**, with **Choose your coding agent** as its
placeholder. Cancelling it starts no backend conversation. Initial automatic
agent selection and last-used selection remain the host's responsibility.

The native blank chat opens before the picker appears. First send waits for the
choice and the host's new connection through Code-OSS's session-creation handler;
the composer keeps the draft until the request is accepted. There is no later
conversation swap that can hide a message sent while the agent starts. This follows
the pinned workbench's [first-send materialization](https://github.com/volter-ai/code-oss/blob/f16dc165c0dffe701a7bbf59aefb1c662b206cee/src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1272)
and [draft acceptance](https://github.com/volter-ai/code-oss/blob/f16dc165c0dffe701a7bbf59aefb1c662b206cee/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts#L3493)
paths. A failed startup leaves the draft available to retry.

The pending agent/model choice belongs to that blank chat's untitled resource
and is retired when another conversation opens. Cancelling or opening sign-in
does not choose an agent. Readiness polling continues to discover
agents while a draft is open, updating the welcome and model catalogue without
replacing its widget or input. First send refreshes readiness; after a native
sign-in choice it uses that agent once ready, otherwise it keeps the draft with
a visible sign-in error.

The composer's native **Model settings** control offers **Choose model and reasoning
for a new chat…** for Claude Code and Codex, and **Chat: Model and Reasoning: Open New
Chat** does the same from anywhere (with no conversation open it asks for the agent
first). The models and each model's reasoning efforts are the host's
`modelsByHarness` choices, which a host reads from the harness itself (Model Editor:
Claude Code's `--help`, Codex's models cache), so levels such as `xhigh` and `max`
appear as the harness offers them; a host that sends no efforts gets low/medium/high.
Exact model ID entry remains. When a turn ends, its reply notes the model it ran on
(as the harness's replies name it) and the effort it was given. Only completing the choices
configures the new blank chat; its backend starts on first send. Cancelling a
choice starts no backend and leaves the blank chat available.
A conversation's harness, model and reasoning remain fixed: this integration does
not advertise hot swapping. The built-in model picker still displays the selected
model and provider icon; nondelegating session providers cannot add its Manage
Models action, so configuration uses the native session-options command door.
The response author identifies the harness. Other harnesses keep their own defaults.

This simplified creation flow is source-only pending frontend compilation and a
live check of zero/one picker, cancellation, defaults and explicit configuration.

The host publishes durable conversation IDs and their exact harness history identities.
`POST /open` resumes only the requested saved conversation; `POST /remember` binds its
reported native session ID to discovered history. Unknown or missing bindings fail explicitly,
never falling back to the currently active runtime. The host may provide an `openSessionCommand`
to reveal an exact resource through its native widget service. Cached native widgets should
notify `supercode.frontend.focusSession` on every native focused-resource change,
including untitled resources and leaving harness Chat (`undefined` when there is
no focused session). This retires abandoned draft choices even when returning to
the same cached conversation. Managed resources then notify
`supercode.frontend.activateSession` to restore their exact backend. The frontend
owns no processes.

The permission group offers **Ask for approval** and, on an answerable interactive attachment,
**Auto approve**. Policies are scoped by conversation and read throughout the turn: switching to
**Auto approve** while a turn runs answers the approvals already waiting and every later one.
A lifecycle host may start the conversations it creates in **Auto approve**: it records
`defaultPermission: "autoApprove"` on each such conversation and declares `newChatPermission` for the new
chat's picker (Model Editor does). A conversation without its own recorded default asks, so one that existed
before a host began doing this keeps its behaviour. A new blank chat does not inherit the previous conversation's permission choice.
It applies to Claude Code and Codex where the runtime answers approvals
through Chat, every other harness keeps its own prompts, and a person's explicit pick always
wins. Only a pick that differs from the default (or replaces an earlier pick) is saved, so the
default is never stored as a choice (a pick equal to the default follows the default if it later
changes), and an Auto approve is never stored for a conversation that cannot answer. Conversations opened before 0.1.36 saved their picker's
**Ask** when opened and keep it. Auto approve approves the requests the harness would ask you about, including requests to run
outside its sandbox (Codex's approval requests are its sandbox escalations); the harness's deny
rules still apply. Each request it answers is noted in the turn ("auto-approved: …"). A turn
re-joined after a page reload (the conversation's active response) is answered the same way. Unsupported modes are refused. Unanswerable
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

   A host that could not start a runtime can supply
   `SUPERCODE_FRONTEND_UNAVAILABLE` (or `connect({unavailable})`). Without managed
   setup, its diagnostic appears in the native empty-chat welcome on hosts that
   grant `defaultChatParticipant`. It is never manufactured into conversation
   history. Managed setup uses the sign-in welcome described above instead.

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
start with the host's new-chat default and offer modes for the selected draft's harness,
independently of the previous runtime. The paired native host exposes actual
`initialSessionOptions` separately from its type-wide previous input state, so an
explicit draft choice survives materialization. Draft input groups refresh after
agent selection without overwriting the person's choice. Stock hosts without
that optional context retain their previous-state contract; old untitled bindings
are read only for backwards compatibility.
Restored response cancellation interrupts the runtime and waits for acknowledgement.
Session-list updates consistently prioritize pending input over busy status.

The pinned Code-OSS host needs a resource-scoping repair in its input-state change
routing: stock code broadcasts changes to all input states of a provider. The
Volter overlay guards this fix with a native regression test. The former legacy
option-notification queue is no longer required. The narrow reveal/focus bridge
remains because the native model catalogue and participant identity are provider-wide.

### Native approval cards

A host advertising `volter.chat.inTurnApprovalCapability` version 1 presents
actual approval requests in its native confirmation card. The original offered
labels, order and response payloads are preserved. Clicking answers the pending
request inside the current turn through `supercode.frontend.respondInTurnApproval`;
it never submits a new chat prompt. The host guards the addressed conversation,
disables the choices during dispatch and retires them only after an acknowledged
response or an already-resolved result. Hosts without this capability retain
stable command buttons. Other request kinds retain their existing presentation.

## External runtime handoff

`supercode.frontend.connect(handoff)` accepts a `SupercodeRuntimeHandoff` with
`baseUrl`, `clientId`, `connectionId`, `credentialFile`, optional permissions and
label. Credentials are read from the private file; command arguments contain no
raw token. External attachments retain their exact identity across reloads.
`supercode.frontend.openSession(connectionId)` opens that conversation;
`supercode.frontend.status(true)` reports connection state, conversation view
readiness/resource and rendered event cursor. View readiness follows history
restoration and live-response subscription, rather than a socket alone.
`supercode.frontend.disconnect(connectionId)` also forgets the saved attachment.
IDs belonging to managed conversations cannot be reused for external attachments.
Calling `connect` without arguments retains the interactive settings flow.

These are ordinary connection/view APIs for any external runtime. Playback or
recording policy belongs to its runtime/controller; a host needs no replay-specific
commands. [Replay recording](../../docs/guides/replay-recording.md) illustrates a consumer.
