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
Installation output stays in its own native task terminal after the command
ends, including failure. Retrying uses a new terminal; cancelling terminates
only that click's active installation. Login keeps its native sign-in terminal.

The host's `/state` supplies `setup: {ready, actions, agents, reason, cwd}`.
After a native login exits, setup allows two inventory refreshes begun after
that exit before reporting failure. Inventory-confirmed sign-in remains the
success condition, including when the process exits with code zero.
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
Claude** above the newly opened Chat, or **Signed in with <account>** when the
host names the account that signs the agent in (a setup agent's `account`).

Setup creates no transcript turns. The guarded readiness reveal preserves a
newer draft or selection; a welcome-owned empty draft can give way to the first
ready conversation. Hosts without the guarded reveal command report the
limitation. Passive inventory polling retries a transient handoff failure until
attachment and reveal both succeed for the same conversation.
When the native guard cancels an automatic reveal, the same connected
conversation/focus waits instead of repeating that navigation every three seconds.
A changed focus, conversation, connection or live-turn state permits another
attempt; the explicit `supercode.frontend.refreshSetup` command retries too.
Cancellation leaves the handoff incomplete. Other refresh failures keep their
warning and retry behavior, labeled as Chat setup. Inspect-mode runtime status
includes the focused resource/generation and the last canceled reveal's basis.
[Source and package evidence](../../docs/evidence/chat-canceled-reveal-2026-10-10.md)
leaves the native restored-composer input and real Windows reopen unresolved.

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
Their rows say **Signed in with ChatGPT/Claude** (**Signed in with <account>**
when the host names one) or **Sign in with ChatGPT/Claude…**. A sign-in row starts the same install/login operation as the
welcome. Selecting a ready agent leaves model and reasoning at its defaults;
the separate **<agent>: model and reasoning…** rows retain explicit settings.
The picker is titled **New chat**, with **Choose your coding agent** as its
placeholder. Cancelling it starts no backend conversation. Initial automatic
agent selection and last-used selection remain the host's responsibility.

The native blank chat opens before the picker appears. Sending before the choice
finishes shows **Choose your coding agent before sending** and leaves the draft
available. Choose the agent, then send again. A cancelled choice in the current
window also refuses a send; it starts no backend. After selection, first send
waits for the host's new connection through Code-OSS's session-creation handler;
the composer keeps the draft until the request is accepted. There is no later
conversation swap that can hide a message sent while the agent starts. This follows
the pinned workbench's [first-send materialization](https://github.com/volter-ai/code-oss/blob/f16dc165c0dffe701a7bbf59aefb1c662b206cee/src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts#L1272)
and [draft acceptance](https://github.com/volter-ai/code-oss/blob/f16dc165c0dffe701a7bbf59aefb1c662b206cee/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts#L3493)
paths. A failed startup leaves the draft available to retry.

The paired editor host also explains Enter when native session options are
invalid and the submit keybinding cannot reach the extension. Its explanation
uses the read-only `supercode.frontend.sendRefusal` command when available;
older frontends receive the host's agent/model explanation. The extension alone
cannot receive a keypress rejected by a host's keybinding precondition.
[Source and qualification](../../docs/evidence/chat-unselected-send-2026-10-10.md)
record the genuine published 0.1.58 source and the unperformed Windows reading.

New Chat highlights the agent from the focused conversation (or an already
chosen draft) before opening the blank chat. With no matching choice it keeps
the host/native default. This is a source correction with
[real Chat qualification still open](../../docs/evidence/chat-agent-picker-focus-2026-10-09.md).

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
to reveal an exact resource through its native widget service.
Native session-list updates reuse unchanged row objects, and readiness refreshes
skip unchanged composer option groups. Transcript and approval events remain
immediate. This removes redundant native publications; the
[Windows typing-lag cause and candidate latency remain unmeasured](../../docs/evidence/chat-composer-update-churn-2026-10-09.md).

Cached native widgets should
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
rules still apply. A request it answers adds no line of its own: the call's row is the record, as in Code-OSS's own
agent host, whose Auto approve answers a harness's call with no reason on its row; a card already shown loses its
buttons where the host can retire it (`chatConfirmationResolution`), else gets its answer as a line beneath it, and an
approval it could not answer has its card drawn again for the person to answer. A turn
re-joined after a page reload (the conversation's active response) is answered the same way. Unsupported modes are refused. Unanswerable
harnesses show **Harness permissions**. Previously answered requests cannot affect another
connection. Native command-button fallback limitations are documented below.

A lifecycle host can also select a project **YOLO** runtime policy. Model Editor reads
`"volter.chat.runtimePolicy": "yolo"` from the project's `.vscode/settings.json`;
user-wide values do not enable it. The next native Claude Code or Codex start or
resume runs without asking anyone, including configured model and inference
launches: Claude Code with its bypass flag; Codex with `approvalPolicy:
"on-request"`, `sandbox: "danger-full-access"` and a thread config that hands
every request to Codex's auto-reviewer (`approvals_reviewer = "auto_review"`)
under an `auto_review.policy` that approves it, on thread start and resume.
Never `never`, under which Codex refuses outright any command its own check
flags as dangerous. A service must advertise `yolo_policy: true` before
the host starts it this way. Other harnesses and existing endpoint attachments
cannot acquire this policy from the project setting.

The host records `ManagedChatSession.runtimePolicy` from the opened runtime.
The permission group shows **YOLO** for that runtime and does not save the item
as an approval choice. A saved Ask choice cannot restore prompts in a process
already launched under YOLO (Claude Code's bypass flag, Codex's auto-reviewer). Changing the workspace setting to `default`
applies on its next start or resume. `HostState.newChatRuntimePolicy` describes
the next runtime; it does not relabel a running conversation. Default-policy
chats retain their Ask and Auto approve choices. Auto approve also answers
supported requests raised outside this window's turns, through the same frontend
response door and with one answered-request set per connection.

The [source and build evidence](../../docs/evidence/chat-project-yolo-2026-10-10.md)
records successful compilation and the built service's capability replies. Real
build-agent approval behavior and the embedded workbench remain unmeasured.

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

After that snapshot arrives, the connection enters the session picker and follows
events while an interactive attachment acquires control. `connect()` still waits
for the control attempt before returning; early actions share that attempt.
A message sent from Chat draws exactly the turn it started. The runtime returns the
input id it minted for the message (`send_input`'s `input_id`), and the message's own
`turn_started` carries it; the response draws from that `turn_started` to the turn end
that follows it, and ends there. A turn the runtime starts itself, or another
client's input, arriving before it is not drawn into the response, and a later
`turn_started` ends it, unless it says `joins`: another input taken into this same
turn, whose response goes on to the turn's end. Approval requests and their resolutions are drawn whenever
they arrive, so a card raised while the message is being sent still shows. A
runtime that returns no id gets every event the attachment sees until a turn ends,
as before. So does a message whose attachment re-attached before its `turn_started`
was seen (a sequence gap, or a replay the runtime retired at a turn boundary), but
only when what the re-attach recorded lacks that `turn_started`, which may then
never arrive; a record that holds it keeps the response following its id. There is
no text matching.

A turn the hosted runtime's harness starts on its own (Claude Code waking for a
background task) runs as a claimed turn does: the runtime publishes a
`turn_started` without an input id at its start, its descriptor reads busy, it
refuses a send as Busy, and Stop interrupts it. This window's Stop is unfenced;
Teams' Stop is fenced to the turn id the descriptor names for it. A Claude Code
turn ends at its `result`, so a send after it is accepted while background
agents finish, as Claude Code itself accepts it. Claude Code reports where it
takes each input in (its per-input `command_lifecycle` record), and the runtime
places the message there: its `turn_started` where Claude Code starts its turn,
after any turn Claude Code runs first, or, saying `joins`, where Claude Code
folds it into the turn running or merges it into the turn another input opens,
which the response then follows to that turn's end. A response following the
earlier input reads a joining `turn_started` as the same response and goes on to
the turn's end. A message Claude Code cancels, discards or refuses before taking
it in, or whose process exits first, ends its response with Claude Code's reason;
a Stop interrupts the turn running and cancels every message not yet taken in,
each named in Claude Code's receipt. This is read in Claude Code 2.1.312's
binary, not run (`sdk/interchange/README.md`).
Input arriving in a rejoined response, or after a submitted turn's `turn_started`,
appears as **Additional input** while the response runs. Reopening reads the
runtime's user turns from history. The initial submitted prompt already has a
native request turn. [Source and package evidence](../../docs/evidence/chat-attach-live-input-2026-10-10.md)
records the remaining native timing and display qualification.

When a snapshot supplies `pending_requests`, the attachment replaces its local
request set at the exact snapshot capture boundary, then merges later retained
request, resolution and turn events before committing state and cursor. An empty
snapshot still clears old asks, while missing later events refuse attachment. Older runtimes retain
the existing replay-based behavior. Actual stream and recovery failures are
retained until a fresh attachment succeeds. They end the waiting Chat view with
the error while preserving the native turn state; reopening also shows the
failure in Chat. A failed initial attachment marks its saved session row failed.
Approval and interrupt RPCs remain available under their existing authority.
Fresh snapshots also restore retained `history_events` before replay at the
runtime's cursor. Their original sequences and payloads are preserved. Recovered
unseen events reach existing response listeners, and an authoritative idle
snapshot releases a restored response even when its terminal event is no longer
retained.
An unavailable saved runtime returns an error in Chat instead of a blank draft.
These are implemented source paths; real editor recovery and pending approval
interaction remain unqualified.

## API proposals, and what it does without them

Saved transcript text parts (`text`, `input_text`, `output_text`) use the same
bounded renderer as live payloads. Structured values display their JSON contents;
the frontend does not coerce them into JavaScript's object label.
[Published 0.1.35/0.1.42 comparison and source correction](../../docs/evidence/chat-structured-transcript-text-2026-10-09.md)
record this history path. The original Windows approval-row report remains
unattributed, and native approval behavior is separate.

The extension asks for eight proposals. Three of them (`chatSessionResponses`, `chatSystemNotification`,
`chatConfirmationResolution`) exist only in Volter's Code-OSS fork (volter-ai/code-oss, from `cb0c38b5`); a host
without one drops its name as a proposal that does not exist. A host grants them through
`product.json#extensionEnabledApiProposals` (a Code-OSS derivative that bundles this extension) or
`--enable-proposed-api volter-ai-dev.supercode-frontend-vscode`. **Stock VS Code grants none, and
everything below still works there** — the granted set is read back from the extension host at
runtime (`context.extension.packageJSON.enabledApiProposals` is the *filtered* description, not the
request), and each part declares its own fallback.

| Proposal | What it buys | Without it |
|---|---|---|
| `defaultChatParticipant` | `isDefault` — Volter Harness answers the Chat view with no `@` mention | the ordinary `@supercode` participant; a mention is required |
| `chatParticipantAdditions` | `ChatToolInvocationPart` (with its terminal, todo-list and subagent data), `ChatResponseConfirmationPart`, `ChatResponseWarningPart`, `codeblockUri`, `ChatResponseThinkingProgressPart`, `ChatResponseHookPart`, `questionCarousel` | progress lines, labeled Markdown results, typed replies, plain fenced diffs, blockquoted reasoning, quoted hook lines, answer buttons |
| `chatSessionsProvider` | the runtime's sessions in the Chat view's session picker, each reopening with its history | the participant still attaches; there is no session list |
| `chatParticipantPrivate` | dynamic participant identity with the harness and provider icon; an interrupted turn's error at warning level | static participant identity; the interruption is an ordinary error |
| `chatProvider` | native fixed-model identity and provider icon | host new-chat configuration |
| `chatSessionResponses` | the `ChatResult` a re-joined response resolves with and a saved turn's `result.errorDetails` as the response's error; the question carousel on a re-joined response; a conversation that could not be opened anchored to the system-initiated request "Couldn't open session" (`ChatRequestTurn.systemInitiatedLabel`) | a re-joined or saved response's error as a warning part, `Answer…` buttons on a re-joined response, that conversation's error under the marker request |
| `chatSystemNotification` | `ChatResponseSystemNotificationPart` for a harness notice, with its icon, live and saved | the notice as a plain line |
| `chatConfirmationResolution` | `ChatResponseConfirmationPart.isUsed`: an approval card answered elsewhere loses its buttons | one plain line beneath the card says the answer |

### Parity with Code-OSS's own chat

The measure is the event, not the API part: **does this event look as Code-OSS draws its own equivalent
event?** The citations are read from Volter's Code-OSS fork at the editor's `FORK.json` pin; the workbench archives
this product ships are cut from earlier fork commits until they are re-cut at it: `4a7cd45` on macOS arm64, `4782d9a2`
on Linux x64 and Windows x64. Using a native part for something VS Code never draws is not
parity. Each row names what Code-OSS itself draws, with its source, and what this frontend draws on the product's
host (all eight proposals granted). **Native**: drawn as Code-OSS draws it. **Fallback**: drawn, but plainer than
Code-OSS's own (why given). **Gap (API)**: Code-OSS's own drawing is not reachable through the extension API at the
pin; the row names the fork change that would reach it. **Gap**: reachable, not built. This count is the measure of
done; a change that moves a row says so here. Paths are under `src/vs/` unless they start with `src/vscode-dts`.

| Event | Code-OSS draws its own as | This frontend | Status |
|---|---|---|---|
| The agent's text | markdown (`chatMarkdownContentPart.ts`) | `ChatResponseMarkdownPart`; a subagent's own text is not shown | native |
| The agent's reasoning, live and saved | thinking (`chatThinkingContentPart.ts`) | `ChatResponseThinkingProgressPart`, in history too | native |
| A tool call, started then finished | one tool row updated in place (`chatToolInvocationPart.ts`) | `ChatToolInvocationPart` with `enablePartialUpdate` | native |
| A shell call | the terminal row: command and output (`chatTerminalToolProgressPart.ts`) | terminal tool data | native |
| A call's work left running in the background (a background Bash, a Monitor, a subagent sent to the background) | Code-OSS's own Claude host (`platform/agentHost/node/claude/claudeToolDisplay.ts` `TOOL_ROWS`, lines 100-102) sets no `isBackground`: a background `Bash` is a terminal row that completes with its launch result; `BashOutput` ("Reading shell output") and `KillBash` ("Kill shell command") are terminal rows of their own. The person stops a task by asking the agent; current Claude Code (2.1.312) then calls `TaskStop` (which still answers to the old names `KillShell` and `KillBash`), which Code-OSS's table does not list, so it is an ordinary tool row there and here | the same: the Bash row completes with its launch result, and BashOutput and KillBash are terminal rows with Code-OSS's titles; the harness's listing of its background tasks draws nothing | native |
| Output a background-status call drained (`background_output`) | that call's own row (`get_terminal_output`'s row) | nothing more: the status call's row result already carries it | native |
| A plan (TodoWrite, the task tools, `update_plan`) | the todo list (`chatTodoListWidget.ts`) | todo-list tool data | native |
| Codex's plan (`turn/plan/updated`, not a call) | the todo list | a status line | fallback: no call carries it, and a todo list is a tool row |
| A subagent and its calls | the subagent row with its calls grouped under it (`chatSubagentContentPart.ts`) | subagent tool data, `subAgentInvocationId` | native |
| A hook that blocked or warned | the hook row (`chatHookContentPart.ts`) | `ChatResponseHookPart` | native; **gap (API)** inside a subagent: the part carries no subagent id |
| An approval | the confirmation card, answered in the running turn (`chatConfirmationContentPart.ts`; the fork's `volter.chat.inTurnApprovalCapability`, `volterHarness/volterChat.ts`) | `ChatResponseConfirmationPart` where the host advertises in-turn cards (this product's host does); command buttons on a stock host, whose confirmation answers with a new request | native; fallback on a stock host |
| A harness's questions | the question carousel (`chatQuestionCarouselPart.ts`), in its turn's response | the carousel, on a turn this window runs and on a re-joined response (`chatSessionResponses`: `mainThreadChatSessions.ts` forwards the answer to the session's stream by its `resolveId`); `Answer…` buttons on a re-joined response on a host without it | native; fallback on a re-joined response without `chatSessionResponses` |
| A request answered through its own card in this window | the card or carousel shows what was chosen (`chatConfirmationContentPart.ts`, `chatQuestionCarouselPart.ts`); the call's row carries on or ends denied | the same; a stock host's buttons stay, inert, and the status bar says what was sent | native |
| A request answered any other way (another window, Auto approve turned on after its card showed, a typed reply) | the request's card retires itself: the call's row carries on or ends denied (`agentHostSessionHandler.ts` `IChatToolInvocation.confirmWith`); a carousel answered elsewhere is marked used with its answers (`answeredExternally`) | an approval card loses its buttons (`chatConfirmationResolution`: the same `ChatResponseConfirmationPart` pushed with `isUsed`, which `chatModel.ts` matches by its `data`); the call's row carries the outcome. A question carousel stays live, with one plain line beneath it saying the answer | native for an approval card; **gap (API)** for a question carousel: an extension cannot mark a carousel it pushed answered. Fork: let the extension resolve a pushed carousel with the answers given elsewhere (`answeredExternally`) |
| An approval answered automatically (Auto approve) | the call's row alone: Code-OSS's own agent host answers a harness's call under its Auto approve with `confirmed: NotNeeded` and no reason (`platform/agentHost/node/sessionPermissions.ts` `createToolReadyAction`, after `agentSideEffects.ts` strips the confirmation), so `getApprovalMessageFromReason` (`chatToolPartUtilities.ts`) has nothing to say. Only a client tool the workbench runs itself is "Auto approved by `autoApprove`" (`agentHostSessionHandler.ts` `getClientToolPreApproval`) | the call's row alone; an answer that fails or does not settle draws the approval's card again, as the one still waiting | native |
| A request this window cannot answer (another client holds it) | no read-only confirmation: another client's call is its row, "Running {0} on another client…", with a cancel action (`stateToProgressAdapter.ts` `toolCallStateToInvocation`) | its title and summary as words, no controls; its answer as a line beneath it | fallback: the extension API cannot draw another client's call |
| A turn that failed | the response's error (`agentHostSessionHandler.ts` `_getTurnErrorDetails`, `errorDetails`) | the request handler's `ChatResult.errorDetails`; on a re-joined response the `ChatResult` its `activeResponseCallback` resolves with, and in history the saved turn's `result.errorDetails` (`chatSessionResponses`: `extHostChatSessions.ts` passes both on, and `chatServiceImpl.ts` sets the result on the response as it completes); on a host without it, VS Code's warning part with the error's words there | native; fallback on a re-joined response and in history without `chatSessionResponses` |
| A turn interrupted from elsewhere | the response's warning-level, expected error (`_getTurnErrorDetails`, `executionInterrupted`) | `errorDetails` with `level: Warning`, `isExpectedError`, on the same paths | native; fallback without `chatSessionResponses`, as above |
| A turn the person stopped | VS Code marks the response stopped | nothing more | native |
| A request Chat cannot run (no sign-in, no runtime, a refused send) | the request's error | a thrown error, which the workbench writes as the response's error | native |
| A transport or stream error while a turn may still run (`stream_error`, `transport_error`, `watch_error`, `runtime_disconnected`) | the response's error | VS Code's warning part with the error's words | fallback: the turn may still be running, so it is not ended with an error |
| A re-joined stream that fails; a conversation that cannot be recovered | the response's error; a session that cannot be loaded is the system-initiated request "Couldn't open session" with that error (`agentHostSessionHandler.ts` `sessionLoadFailed`, `sessionLoadFailedLabel`) | the re-joined response's result carries the error; the conversation's marker request is the system-initiated "Couldn't open session" and its saved response's result carries the error (`chatSessionResponses`); VS Code's warning part under the marker request on a host without it | native; fallback without `chatSessionResponses` |
| A harness warning (`cache_warning`, `warning`, a usage limit) | the warning part (`chatErrorContentPart.ts`, warning level) | `ChatResponseWarningPart` | native |
| A harness record that is not the person's words (a background task's notification, live or saved; an interruption record) | a system notification row, its icon picked per notification kind with the completion check as default (`stateToProgressAdapter.ts` `systemNotificationToChatPart`; `claudeReplayMapper.ts` keeps `compact_boundary` and `notification`) | `ChatResponseSystemNotificationPart` with the notice's own words (`chatSystemNotification`, converted to `{kind: 'systemNotification'}` in `extHostTypeConverters.ts`), live and saved, once per task (Claude Code reports a finished task both as `system/task_notification` and as the user-role record that wakes the agent; the saved transcript keeps only the latter, a `queued_command` attachment). "Turn interrupted." and a background task that failed or was stopped carry `warning`, by analogy with the icon upstream gives an automatic-approval review that was interrupted: upstream draws neither as a notification of its own. A plain line on a host without it, never a progress part, which Code-OSS hides once any other part follows it (`chatProgressContentPart.ts`) | native; fallback without `chatSystemNotification` |
| A status line (`status`) | the progress message, hidden once another part follows (`chatProgressContentPart.ts`) | `ChatResponseProgressPart` | native |
| Input arriving from elsewhere while a turn runs | the running turn's pending Steering message until the turn takes it in, then nothing: the turn keeps its response and no request turn opens (`agentHostSessionHandler.ts` `_applyRemotePendingMessages` → `syncPendingRequestsFromRemote`; `removePendingRequest` once taken in) | **Additional input** and the words, inside the running response, once the turn takes it in | **gap (runtime)**: the runtime announces no input waiting to be taken in (no frontend event carries it; the hosted runtime holds a Claude Code input pending until Claude Code reports it `started`, and reads busy meanwhile, but publishes only its taking in). A steered input now carries its id: `steer` returns it and its `user_message` and `turn_started` carry it (`input_correlation`, `sdk/frontend/contract.json`). Then a proposed API with which a session's provider sets and removes its pending Steering messages, mirroring those two calls |
| A message sent from this window while a turn it follows runs (a re-joined response) | a pending Steering message, which the workbench dispatches to a streamed session's provider at once (`chatServiceImpl.ts`, mid-turn steering); the turn keeps its response | the request handler's own turn, which the runtime refuses while a turn runs | **gap (not built)**: the runtime gives what steering it needs: `steer` returns the input id and the steered input's `user_message` carries it, published where the turn takes it in (for Claude Code, where it reports the input `started`, read in its 2.1.312 binary, not run), so that `user_message` is known as this message's echo; this frontend still sends it as a request of its own only when no turn runs (the hosted Claude Code runtime would accept it, advertising `extensions.session_input.joins`) |
| A turn the runtime starts on its own (input that starts a turn while none runs, a turn after the previous one ended) | a request turn of its own (`agentHostSessionHandler.ts`, a changed active turn id: `startServerRequest`) | drawn inside the response of this window that follows the conversation, which follows to idle (a re-joined response), or only when the conversation reopens | **gap (not built)**: the runtime marks exactly where it starts. Another client's input starts a turn whose `turn_started` carries that input's id, not this window's, and a turn the hosted runtime's harness starts itself has a `turn_started` with no input id at its start (Claude Code's `running` with no input pending, or a main-loop record while no turn runs, read in its 2.1.312 binary, not run; else `harnessTurnStart`); this frontend does not open a request turn of its own from either yet |
| A prompt the runtime's scheduler starts | a system-initiated request turn: a notification row with its label (`chatListRenderer.ts` `renderSystemInitiatedRequest`) | a notice, "Scheduled prompt: …", inside the response this window follows, or nothing until the conversation reopens; the same in saved history. Nothing in this repository produces `scheduled_prompt_started` (it is declared by `agent-runtime-host.mjs` `displayKinds` and read by `frontend-transcript.mjs` and the browser client), so its payload is not known; the prompt is read from `prompt`, `name` or `message` | **gap (runtime)**: a producer, so that its turn opens as its own system-initiated request (as a turn the runtime starts on its own, above) without also drawing the runtime's `user_message` for it |
| A Codex diff | file edits with Keep/Undo and the multi-file diff (`chatTextEditContentPart.ts`, `chatMultiDiffContentPart.ts`) | `codeblockUri` with a fenced diff, plus one reference per file | **gap (known)**: the harness has already written the files and no event carries the before/after the editor needs (see *Why `diff_updated` is not an edit part*) |
| An MCP call | the MCP input/output row | the simple input/output row | fallback: its result arrives as text |
| Token usage | the context-window indicator (`stream.usage`) | not shown | **gap** |
| A protocol record (`native_event`, a kind this version does not know, a malformed request) | nothing | nothing; an unknown kind and a malformed request go to the output channel | native |
| Saved history | the same parts a live response draws | the same converter: tool rows, hooks, warnings, reasoning | native |
| History past its bound | left out without a word; a turn without its request gets "Message content could not be retrieved" (`claudeReplayMapper.ts` `missingPromptPlaceholder`) | the same | native |
| A call waiting on approval in re-joined history | its row, with its card on the active response | the same | native |

Count, by row (36), on this product's host (Volter's Code-OSS fork at the editor's `FORK.json` pin, with all eight
proposals granted; a stock host draws the fallbacks above): 26 native, of which hooks are an API gap inside a
subagent and a request answered elsewhere an API gap for a question carousel; 4 fallback; 2 gaps that wait on what
the runtime does not give yet: no event announces input waiting to be taken in (input from elsewhere while a turn
runs), and nothing produces a scheduled prompt; 1 known gap (native edits); 3 gaps not built (a message this window
sends into a turn it follows, whose steer id and echo the runtime now gives; a turn the runtime starts on its own,
whose `turn_started` the runtime now gives; `stream.usage`). The rows marked native for a harness's questions on a re-joined
response, harness records, a failed or interrupted turn on a re-joined or saved response, a conversation that cannot
be recovered, and a card answered elsewhere rest on the fork's proposals `chatSessionResponses`,
`chatSystemNotification` and `chatConfirmationResolution`; an automatic approval is native because Code-OSS's own
agent host draws that call's row alone.

Parts the extension API offers that no harness event this frontend receives carries, so not used:
`ChatResponseAnchorPart`, `ChatResponseFileTreePart`, `ChatResponseMarkdownWithVulnerabilitiesPart`,
`ChatResponseCodeCitationPart`, `ChatResponseMovePart`, `ChatResponseExtensionsPart`, `ChatResponsePullRequestPart`,
`ChatResponseInfoPart`, `ChatResponseAutoModeResolutionPart`, `ChatResponseProgressPart2`,
`ChatResponseReferencePart2`, `ChatResponseVoiceProgressPart`, and the resources tool data.

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
| `user_message` | `sdk/interchange/agent-runtime-host.mjs` accepted-turn projection; `runtime-native-projection.mjs` `claudeBlocks` for Claude's own user-role records (`source: harness`) | the request turn in history; dropped live before `turn_started` (VS Code already shows it); after it, **Additional input** inside the response; a harness record shows its `notice` as a system notification row (`chatSystemNotification`) → a plain line, or nothing |
| `turn_started` / `turn_completed` / `turn_succeeded` | `submit_claimed`; `AgentEvent::TurnCompleted` | lifecycle only — the handler resolves, nothing renders |
| `turn_interrupted` | `submit_claimed` | the response's result: `errorDetails` at warning level (a re-joined or saved response needs `chatSessionResponses`); else `ChatResponseWarningPart` → its words |
| `turn_failed` | `submit_claimed` | the response's result: `errorDetails` (a re-joined or saved response needs `chatSessionResponses`); else `ChatResponseWarningPart` → blockquote |
| `tool_call_started` / `tool_call_completed` | `AgentEvent::ToolCallStarted` / `ToolCallCompleted` | one `ChatToolInvocationPart` per call, updated in place with its result (`enablePartialUpdate`) → a progress line plus a labeled Markdown result |
| `diff_updated` | `crates/codex-frontend/src/codex_app_server_v0_144.rs` (stock Codex `turn/diff/updated`) | `codeblockUri` + a fenced `diff` block, plus one stable `reference` per file the diff names → the fenced block alone |
| `request` | `sdk/interchange/frontend-request-bridge.mjs` request publication | `ChatResponseConfirmationPart` where the host advertises in-turn cards, the question carousel for questions; else a titled markdown block plus one **command button per answer**. Read-only (title and summary) for a request this window cannot answer |
| `request_resolved` | `FrontendRequestBroker::respond` | nothing for a card answered through itself in this window; a native approval card answered elsewhere loses its buttons (`chatConfirmationResolution`); else one plain line beneath the card naming the answer |
| `cache_warning` | `AgentEvent::CacheWarning` | `ChatResponseWarningPart` → blockquote |
| `hook` | `runtime-native-projection.mjs` from Claude Code's failed `hook_response`, its blocked-prompt `informational` record, and a tool result in its own `PreToolUse:<tool> hook error:` words | `ChatResponseHookPart` ("Blocked by" / "Warning from" the hook) → blockquote |
| `background_tasks` | `runtime-native-projection.mjs` from Claude Code's `background_tasks_changed` | nothing: a background command is its call's row, as in Code-OSS's own Claude host |
| any event with `parent_id` | `runtime-native-projection.mjs` from Claude Code's `parent_tool_use_id` | a subagent's calls are grouped under its call; its own text, reasoning and input are not shown |
| `usage` | `AgentEvent::Usage` | nothing (see `stream.usage` in the parity table) |
| `background_output` | `sdk/interchange/agent-background.mjs` `status` | nothing: the status call's own row carries the output |
| `scheduled_prompt_started` / `_deferred` / `_completed` | declared by `agent-runtime-host.mjs` `displayKinds`; no producer here | started: a notice, "Scheduled prompt: …"; deferred and completed: lifecycle only |
| `scheduler_error` | same | `ChatResponseWarningPart` with its words → blockquote |
| `reasoning` / `thinking` | no producer in this repository; read because `sdk/interchange/frontend-transcript.mjs` reads them | `ChatResponseThinkingProgressPart` → blockquote |
| `stream_error` / `transport_error` / `watch_error` / `runtime_disconnected` | `crates/opencode-frontend/src/server.rs`; `crates/interchange/src/watch.rs`; synthesized by a frontend (`sdk/interchange/frontend-app.mjs`); `stream_error` has no producer here | `ChatResponseWarningPart` with its words → blockquote |
| anything else | opaque by contract | nothing in the transcript; written to the output channel |

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
status bar says what was sent. An elicitation that carries a `requested_schema` gets an
`Answer…` button that asks for the value first; a request still pending while the session is idle
can also be answered by typing.

**A harness's questions are VS Code's question carousel.** Why the carousel once swallowed its answer, read
from Code-OSS at `4a7cd45`, the fork commit the macOS arm64 archive is still cut from (Linux and Windows: `4782d9a2`): `questionCarousel` resolves through the resolver map of the stream it
was called on, and `$handleQuestionCarouselAnswer` reads only the participant's map
(`extHostChatAgents2.ts`). A session's *re-joined* response (`activeResponseCallback`) gets a stream with a
map of its own (`extHostChatSessions.ts`) that no answer reached at that pin. The fork's `chatSessionResponses`
routes a carousel answer to a session's stream by its `resolveId` (`mainThreadChatSessions.ts` →
`$handleQuestionCarouselAnswer`), so on the product's host the carousel is used on a re-joined response too;
a host without it keeps the buttons above on a re-joined response. The design:

- *The question reaches Chat as a request.* Supercode's own `ask_user` already asks through an `elicitation`
  whose `requested_schema.properties.qN` carry `title`, `description`, `x-options` (`[{label, description}]`)
  and `x-multi-select` (`sdk/interchange/question-tool.mjs`). Claude Code's AskUserQuestion takes the same
  input (`questions[{question, header, options[{label, description}], multiSelect}]`, at most four of each)
  and, with `--permission-prompt-tool stdio`, asks for it as a `can_use_tool` control request (Claude Code
  enables the tool only when a permission prompt tool answers it — measured on 2.1.312). The runtime's
  projection (`runtime-native-projection.mjs`) raises that request as an `elicitation` built by the same
  `questionElicitation` the `ask_user` tool uses, not as an approval, so Auto approve never answers it and
  every frontend that answers an elicitation answers this one.
- *Chat shows the carousel.* An elicitation whose every property is such a question (a `title`, the question
  alone as `x-question`, and `x-options`) is one `ChatQuestion` per property: single or multi select with
  free text allowed, or text when it has no options; Skip is allowed. Any other form (an MCP server's own
  schema, with its `enum`, `format` or `required`) keeps the `Answer…` door, which honours them. Without the
  carousel (no `chatParticipantAdditions`, or a re-joined response on a host without `chatSessionResponses`) it is
  the `Answer…` button.
- *The answer reaches the harness in its own format.* The carousel's answers become the elicitation's
  `{action:'accept', content:{qN: label | [labels] | text}}`, or `decline` when skipped or submitted with
  nothing chosen; a stopped turn sends nothing (Stop cancels its requests). A reply typed into Chat instead
  answers every question with its words. For Claude Code the
  hosted runtime (`runtime-hosted.mjs`) turns that into its permission reply
  `{behavior:'allow', updatedInput:{questions, answers:{<question>: <answer>}}}`, multiple answers joined
  with `, ` as AskUserQuestion's own output schema states; a decline is `{behavior:'deny', message}`.
  `ask_user` already reads the same `content`.

**A hosted harness runtime.** When the runtime is one Volter Harness HOSTS — a Claude Code, Codex, pi or
opencode session it started through `harness.v1.runtimes.start` — an approval it raises is
**answerable from this view** for every harness whose reply this runtime can translate
(`sdk/interchange/runtime-hosted.mjs`): the canonical `respond {decision}` becomes that harness's
own envelope, which for Claude Code is `{behavior:'allow'}` / `{behavior:'deny', message}`. The
request states which decisions its harness protocol actually carries, so this view offers exactly
those and no button the runtime would refuse — Claude Code has an allow and a deny and no
always-allow *behavior* at all, so it gets two. A harness with no translation keeps
`actions.respond: false`, and then the request is drawn read-only, its title and summary with no controls,
because a control appears only for an action the descriptor advertises; Code-OSS likewise draws another
client's pending call for every observer. Tool completions name only
the call they answer (Claude Code's `tool_result` block carries just a `tool_use_id`), so an unnamed
completion keeps the name the start stated rather than becoming a tool called `tool`.

**Bounds.** The projection is bounded like `@volter/supercode-frontend-browser`'s: 64 KiB per
part, 256 characters per title, 2 KiB for an opaque payload, 500 history turns. Turns past the bound are
left out without a word, as VS Code's own agent host shows a transcript its harness truncated; the
runtime's own history is unchanged and authoritative. Terminal control
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

Whose words a user-role record carries is one rule,
`@volter/supercode-interchange/user-provenance`, vendored here unchanged. Live
and replayed `user_message` events carry its answer as `source`
(`person` | `harness`) with a `notice` where one is shown; saved history is
read through the same rule. Records the harness wrote (`isMeta`,
`isSynthetic` — the stream's image-coordinate note — `isCompactSummary`,
`promptSource: system`, sidechain and tool-result records, file attachments)
create no person-message bubble, live or restored; ordinary quoted text
without those flags stays a person message. A task notification becomes a
short background-task notice, and Claude's unmarked, exact interruption
records (`[Request interrupted by user]`, `… for tool use]`) a short turn
interruption notice, each a plain line of its own words (see the parity table's harness-record row). The native transcript remains authoritative and unchanged.
[Source evidence and remaining qualification](../../docs/evidence/chat-native-notices-20261013.md).

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
with no user turn left. Rather than drop it, the projection pairs it with a marker turn whose prompt is
Code-OSS's own for a turn whose request is missing, "Message content could not be retrieved"
(`claudeReplayMapper.ts` `missingPromptPlaceholder`): nothing is presented as a person's words.

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

Reload restoration joins the runtime's canonical history to events after its
`history_cursor`. A separately loaded native transcript is a fallback when the
runtime has no user history; it never replaces the live event tail. The final
running response is replayed through `activeResponseCallback`, with each pending
request drawn once from the snapshot and later events followed by sequence.
An idle runtime with a pending request also keeps this callback open until the
request is resolved. Standalone requests use the explicit runtime-history marker
instead of reopening an earlier answer. A new conversation sends its first input
before trying to save its native identity: the harness creates its transcript
from that input. Identity saves run after input acceptance, retry with later
native events until one succeeds, and finish at the end of a turn. A successful
host save acknowledges that exact runtime connection, native id and catalogue
identity; completion skips another save while all three still match. A reload
or replacement connection must obtain its own acknowledgement. Completion
refreshes the host before that comparison; a changed/cleared binding or failed
refresh invalidates the local acknowledgement and retains the save attempt.
After reload,
the exact runtime's user history/events recover that save obligation; restored
snapshots, later events and response completion retry through the same host
checks without sending input. A busy state or standalone request alone does
not establish submitted input. A failed save
does not resend input or abort a running turn. An unbound conversation whose
final save fails says the prompt was submitted, and tells the person to keep Chat
open and avoid repeating the prompt.
Stop is observed throughout the turn and checked before input, including a lease
renewal retry. Retained request/decision records with no originating replay
prompt appear in a separate runtime-history turn.
The [reload investigation](../../docs/evidence/chat-pending-approval-reload-2026-10-08.md)
separates the retained first-user failure from this source change; a live
candidate reload and approval click remain unmeasured.
The [first-input regression investigation](../../docs/evidence/chat-first-input-binding-2026-10-08.md)
records the 0.1.52 binding-order failure, the correction and its outstanding
product reading.
The [identity-save investigation](../../docs/evidence/chat-identity-save-acknowledgement-2026-10-08.md)
names the repeated host lookup removed at completion; candidate latency and
real-editor qualification remain open.

The pinned Code-OSS host needs a resource-scoping repair in its input-state change
routing: stock code broadcasts changes to all input states of a provider. The
Volter overlay guards this fix with a native regression test. The former legacy
option-notification queue is no longer required. The narrow reveal/focus bridge
remains because the native model catalogue and participant identity are provider-wide.

### Native approval cards

A file approval names the harness-supplied path and shows its proposed replacement
text, new contents or patch before the answer buttons. Other requests show their
supplied arguments. Preview bounds are labelled, and a request with no supplied
preview says so. The frontend reads no workspace file to invent missing context
and never applies the preview. This source correction's real-editor qualification
is recorded separately in [the first-walk findings](../../docs/evidence/chat-first-walk-approvals-2026-10-09.md).

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
Its `selection` follows the focused draft or saved conversation; `selectionSource`
names that source. A draft with no choice and an external attachment report no
host selection. `hostSelection` retains the host's separate runtime choice.
Conversation-creation failures show their native error immediately, before a
request handler exists, and retain the refusal for that draft's handler.
[Source and outstanding Windows qualification](../../docs/evidence/chat-start-failures-2026-10-10.md)
record this change separately from the earlier native Windows launcher fixes.
`supercode.frontend.disconnect(connectionId)` also forgets the saved attachment.
IDs belonging to managed conversations cannot be reused for external attachments.
Calling `connect` without arguments retains the interactive settings flow.

These are ordinary connection/view APIs for any external runtime. Playback or
recording policy belongs to its runtime/controller; a host needs no replay-specific
commands. [Replay recording](../../docs/guides/replay-recording.md) illustrates a consumer.
