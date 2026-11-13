# Volter Code-OSS source snapshot

This repository starts with the reviewed Code-OSS source used by Volter Editor.
It intentionally contains no history from Volter's private development repository.

The initial source tree was exported from revision
`9b4e5584bdf905b9fb9daeff53bf1c3fef67ef7d` (tree
`193fde242d12b7e7b37c111e7ce8928a5903f697`). `SOURCE_PROVENANCE.json`
records that input in machine-readable form. The licenses and notices already in
this tree continue to govern their respective files.

Volter Editor product overlays live in the separate
[`volter-ai/editor`](https://github.com/volter-ai/editor) repository. Release
artifacts identify both this source snapshot and the exact editor overlay used
to build them.

The Windows cut's artifact-only dispatch is documented beside its inputs in
[the workflow](.github/workflows/volter-workbench-win32.yml). Building and
publishing are separate operations; a retained artifact establishes neither
publication nor editor behavior.

## Changes to Code-OSS's own source

Each change the fork makes to upstream files (not build or release steps), so a
rebase onto a newer Code-OSS can redo them as a checklist:

- **An editor group can hide its own tab row** (volter-ai/code-oss#12).
  `IEditorGroup.tabsHidden` and `setTabsHidden()` in
  `src/vs/workbench/services/editor/common/editorGroupsService.ts`, a `Tabs`
  region in `src/vs/workbench/browser/parts/editor/editorGroupView.ts` (with the
  flag read in `updateTitleContainer` and `updateStyles`), the flag read in
  `createEditorTabsControl` and the extracted `recreateTabsControl` in
  `editorTitleControl.ts`, and the test double in
  `src/vs/workbench/test/browser/workbenchTestServices.ts`. Used by the editor's
  `volterDocuments.ts` for workspace areas.
- **The server's watcher exclude for its extensions folder uses forward slashes.**
  `getExtraExcludes` in `src/vs/server/node/remoteFileSystemProviderServer.ts`. On Windows the
  extensions path (`resolve(--extensions-dir)`) holds backslashes, and @parcel/watcher compiles
  each exclude glob into a regular expression in which a backslash before a digit is a
  back-reference: the watcher threw and every file watch stopped. The only watcher glob in the
  source built from a filesystem path.
- **A protocol's writes flush on a posted message, not a timer.** `ProtocolWriter._scheduleWriting` in
  `src/vs/base/parts/ipc/common/ipc.net.ts` schedules its flush with `setTimeout0`
  (`src/vs/base/common/platform.ts`). `PersistentProtocol`'s keep-alive `setInterval` writes through the same
  writer; once the interval is past Chromium's timer nesting limit, the flush it schedules is a
  `kJavascriptTimerDelayedHighNesting` timer clamped to 4 ms (`dom_timer.cc`), which a page hidden past the
  grace period runs only at a once-a-minute wake-up 3 ms long (`frame_scheduler_impl.cc`,
  `page_scheduler_impl.h`/`.cc`). The 4 ms flush misses the wake-up it was posted in, and every later write joins
  it, so every workbench → extension host call in a long-hidden tab waited for the next minute. A window's
  `setTimeout0` posts a message (`kPostedMessage`, never throttled); Node and workers keep `setTimeout`. It reaches
  a person only with the next workbench release, which is a publication.
- **A chat response can carry a system notification row** (proposal `chatSystemNotification`).
  `src/vscode-dts/vscode.proposed.chatSystemNotification.d.ts` declares
  `ChatResponseSystemNotificationPart`, added to `ExtendedChatResponseParts` as `chatHooks` adds its part;
  `extensionsApiProposals.ts` registers the proposal; `extHostTypes.ts`, `extHost.api.impl.ts` and
  `extHostTypeConverters.ts` (`ChatResponseSystemNotificationPart`, `ChatResponsePart.from`) make it the
  workbench's `{kind: 'systemNotification'}` part, with its `icon`; `extHostChatAgents2.ts` `push` checks the proposal.
- **A chat session's own responses keep their result, their questions and their saved requests** (proposal
  `chatSessionResponses`). `src/vscode-dts/vscode.proposed.chatSessionResponses.d.ts` states what it keeps and adds
  `ChatRequestTurn.systemInitiatedLabel`.
  - *For a provider with the proposal:* `extHostChatSessions.ts` passes the `ChatResult` the active response resolves
    with to `$handleProgressComplete`, keeps `errorDetails` in `convertResponseTurn` and the request's label in
    `convertRequestTurn`, and answers a question carousel on the active response's stream:
    `mainThreadChatSessions.ts` forwards `onDidReceiveQuestionCarouselAnswer` to `$handleQuestionCarouselAnswer`, by
    its unique `resolveId` (the test double in `mainThreadChatSessions.test.ts` stubs it). `extHost.protocol.ts`
    carries the result and the history items' fields; `mainThreadChatSessions.ts` exposes `resultObs`, which
    `chatServiceImpl.ts` sets on the response as it completes (`chatSessionsService.ts` declares it), and passes the
    saved request's label to the chat model.
  - *For every provider:* `extHostChatSessions.ts` gives the active response its own token (stopping it is not the
    session's disposal); interrupts and completes only the active response (`'ongoing'`), and
    `mainThreadChatSessions.ts` completes only that one through `$handleProgressComplete`; lets only the session the
    workbench holds now for a resource reach it (`isCurrent`: its parts and its active response's completion), and
    releases an earlier one's disposables without cancelling it; and does not log the active response's Stop
    (a cancellation) as an error.
- **An extension can retire a confirmation answered elsewhere** (proposal `chatConfirmationResolution`).
  `src/vscode-dts/vscode.proposed.chatConfirmationResolution.d.ts` adds `ChatResponseConfirmationPart.isUsed`;
  `extHostTypes.ts` and `extHostTypeConverters.ts` carry it, `extHostChatAgents2.ts` `push` checks the proposal,
  `chatModel.ts` replaces the response's open confirmation with equal `data` by a used copy, and
  `chatConfirmationContentPart.ts` re-renders a confirmation that became used.
- **The Chat view chooses a new chat's session type once the installed extensions are registered.**
  `ChatViewPane` in `src/vs/workbench/contrib/chat/browser/widgetHosts/viewPane/chatViewPane.ts` awaits
  `IExtensionService.whenInstalledExtensionsRegistered()` (`whenSessionTypesRegistered`) in
  `acquireDefaultNewSession`, and in `shouldSkipRestoredLocalSession` for an empty Local session. The default type
  (`getDefaultNewChatSessionTypeAndReasonFromServices`) reads the contributed session types and the extensions'
  `configurationDefaults` (`chat.editor.localAgent.enabled`). The view renders and calls `applyModel` before a
  remote extension host's extensions are registered, so a fresh start chose Local before Supercode's `chatSessions`
  type and `@volter/chat`'s default existed. Resolving a contributed session already waits for the same thing
  (`ChatSessionsService.canResolveChatSession`). Upstream's main has the same synchronous choice.
- **Chat's rendered transcript can be read.** `volter.chat.transcript` (`volterHarness/volterChat.ts`) returns the
  focused (or named) conversation's items from `ChatViewModel.getItems()`, the list `ChatListRenderer` renders: each
  request attributed to the person, or to the system when `isSystemInitiated` (shown as its `systemInitiatedLabel`);
  each response's parts, with a confirmation's `isUsed`, a harness approval's request, and a tool invocation's state
  and `IChatToolInvocation.executionConfirmedOrDenied`. It returns the last 20 items unless asked for `last`, each text
  cut at 2000 characters with its `textLength`. A rebase keeps those view model and part types, or redoes it against
  their successors.
- **A set of extensions installs from its folders as one change.** `installFromLocations(locations, profileLocation)`
  beside `installFromLocation`: `IExtensionManagementService` (`src/vs/platform/extensionManagement/common/extensionManagement.ts`)
  and `CommontExtensionManagementService` declare it; the node `ExtensionManagementService` scans each folder and
  makes one `addExtensionsToProfile` call, so one `onDidInstallExtensions` fires, as `installExtensionsFromProfile`
  does; `WebExtensionManagementService` makes one `installExtensions` call; `extensionManagementIpc.ts` carries it
  through the channel and its client, `ProfileAwareExtensionManagementChannelClient` resolves its profile, and
  `IWorkbenchExtensionManagementService.installFromLocations(locations)` gives each server its locations in one call
  (the test double in `workbenchTestServices.ts`). Each install event is one `_deltaExtensions` in
  `AbstractExtensionService`'s queue, and each waits for the extension host to take the one before
  (`ExtensionHostManager.deltaExtensions`), so packages installed one call each registered only after the host
  started plus a round trip per package. Used by the editor's `volterExtensions.ts`.

## Patches moved from the editor overlay

On `main`, on top of `601de14d6bef3347a3f27b50ac79f01fc056f806` (cut first from `d6d53660ed1e`,
then rebased onto main, which only adds `.github/workflows`; the editor's
`packages/editor-core/workbench/FORK.json` pins this branch's head). Each commit is one patch function from
`volter-ai/editor`'s `scripts/workbench/overlay.mjs` at editor commit
`0629f5a793e47f4266f853e849717b41387bdd1a`, applied alone in this order, leaves first, so the
overlay can drop it.

| Commit | Overlay function | Files |
|---|---|---|
| `aef57c2e0968` | `patchHarnessMoveActions` | `src/vs/workbench/contrib/chat/browser/actions/chatMoveActions.ts` |
| `619a7760a07c` | `patchHarnessPassiveViews` | `src/vs/workbench/contrib/chat/browser/actions/chatElicitationActions.ts`, `src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts`, `src/vs/workbench/contrib/chat/browser/actions/chatToolActions.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatCommandContentPart.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatReadOnlyBanner.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts` |
| `f95416c09cdc` | `patchHarnessDraftAgentMention` | `src/vs/workbench/contrib/chat/browser/widget/input/editor/chatInputEditorContrib.ts` |
| `280edb3510b8` | `patchHarnessChatNavigation` | `src/vs/workbench/browser/parts/editor/editorGroupView.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatWidgetService.ts`, `src/vs/workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.ts`, `src/vs/workbench/contrib/chat/browser/widgetHosts/viewPane/chatViewPane.ts` |
| `6b84ccf6fdc8` | `patchChatSetupWelcome` | `src/vs/workbench/contrib/chat/browser/viewsWelcome/chatViewWelcomeController.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts` |
| `298969b7204a` | `patchNativeChat` | `src/vs/workbench/api/common/extHostChatSessions.ts`, `src/vs/workbench/api/common/extHostTypeConverters.ts`, `src/vs/workbench/contrib/chat/browser/actions/chatNewActions.ts`, `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupContributions.ts`, `src/vs/workbench/contrib/chat/browser/chatStatus/chatStatusEntry.ts`, `src/vs/workbench/contrib/chat/browser/viewsWelcome/chatViewWelcomeController.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatCommandContentPart.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatConfirmationContentPart.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts`, `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`, `src/vs/workbench/contrib/chat/common/chatService/chatService.ts`, `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts`, `src/vs/workbench/contrib/chat/common/widget/annotations.ts`, `src/vs/workbench/workbench.web.main.ts`, `src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts` |
| `cbc04426ae16` | `patchExtensionSignatures` | `src/vs/platform/extensionManagement/node/extensionManagementService.ts` |
| `5413df879fca` | `patchOptionalVsda` | `src/vs/base/common/product.ts`, `src/vs/platform/sign/browser/signService.ts` |
| `d4d947da70db` | `patchRehCopilotShim` | `build/gulpfile.reh.ts` |
| `a142f7793fdf` | `patchWin32Dependencies` | `build/gulpfile.reh.ts` |
| `a36ad3ad2dad` | `patchNpmDirs` | `build/npm/dirs.ts` |
| `aede13df14f0` | `main()` inline: vscode-api-tests out of the dev compile | `build/gulpfile.extensions.ts` |
| `cc13aa989177` | `harnessChatSources`: Volter's harness Chat modules, beside the patches that import them | `src/vs/workbench/contrib/chat/browser/volterHarness/**`, the eight chat-patch files' imports, `src/vs/workbench/workbench.common.main.ts`, `build/gulpfile.vscode.web.ts` |

The chat patches import Volter's harness Chat modules from
`src/vs/workbench/contrib/chat/browser/volterHarness/` (`harnessChatSources`), in this repository.

`patchSourcesProduct` stays in the overlay: it writes per-target build configuration.

`extensions/copilot` and `extensions/vscode-api-tests` are deleted in this fork, which keeps `build/npm/dirs.ts`,
`build/gulpfile.extensions.ts` and the REH's Copilot ripgrep shim from reaching for them, and the root `compile` and
`watch` scripts from running Copilot's. The server declares no Copilot runtime (`@github/copilot`,
`@github/copilot-sdk`, `@vscode/copilot-api` are gone from `remote/package.json`, and `build/gulpfile.reh.ts` fetches
no Copilot platform package): the built-in agent host that would load them is off
(`VolterAgentHostEnablementService`), and the renderer connects to the server's lazily started agent host only while
it is enabled (`EditorRemoteAgentHostServiceClient`).
