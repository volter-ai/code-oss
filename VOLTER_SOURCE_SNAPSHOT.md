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
- **A chat response can carry a system notification row** (proposal `chatSystemNotification`).
  `src/vscode-dts/vscode.proposed.chatSystemNotification.d.ts` declares
  `ChatResponseSystemNotificationPart`, added to `ExtendedChatResponseParts` as `chatHooks` adds its part;
  `extensionsApiProposals.ts` registers the proposal; `extHostTypes.ts`, `extHost.api.impl.ts` and
  `extHostTypeConverters.ts` (`ChatResponseSystemNotificationPart`, `ChatResponsePart.from`) make it the
  workbench's `{kind: 'systemNotification'}` part, with its `icon`; `extHostChatAgents2.ts` `push` checks the proposal.
- **A chat session's provider can start a request turn itself, and the responses it streams keep their result**
  (proposal `chatSessionResponses`). `src/vscode-dts/vscode.proposed.chatSessionResponses.d.ts` declares
  `ChatSession.onDidStartServerRequest` and `ChatSessionServerRequest`. `extHostChatSessions.ts` subscribes to it,
  streams each request's response under its own request id, cancels it from `$interruptChatSessionActiveResponse`,
  passes the `ChatResult` an active response or a server request resolves with to `$handleProgressComplete`, and
  keeps `errorDetails` in `convertResponseTurn`. `extHost.protocol.ts` carries `$startServerRequest`, the result and
  the history item's `errorDetails`. `mainThreadChatSessions.ts` `ObservableChatSession` fires
  `IChatSession.onDidStartServerRequest` (the event the agent host's server-initiated turns use), ignores parts and
  completion of a request a later one ended, and exposes `resultObs`, which `chatServiceImpl.ts` sets on the
  response when it completes; `chatSessionsService.ts` declares `resultObs`. A request with `systemInitiatedLabel`
  is the workbench's system-initiated request (`isSystemInitiated`, `systemInitiatedLabel`), and one with
  `isRequestHidden` its hidden-request turn; live and, through
  `ChatRequestTurn.systemInitiatedLabel`, in history. The main thread acknowledges each request it opens
  (`$startServerRequest` resolves `false` for a session it no longer holds, and the provider's `notStartedCallback`
  runs) and accepts parts only for the requests it opened; an earlier session for the same resource reaches nothing.
  The active response has its own token, so stopping it never cancels a later request. A question carousel on a
  session's stream is answered: `mainThreadChatSessions.ts` forwards `onDidReceiveQuestionCarouselAnswer` to
  `$handleQuestionCarouselAnswer`, by its unique `resolveId` (the test double in `mainThreadChatSessions.test.ts`
  stubs it).
- **An extension can retire a confirmation answered elsewhere** (proposal `chatConfirmationResolution`).
  `src/vscode-dts/vscode.proposed.chatConfirmationResolution.d.ts` adds `ChatResponseConfirmationPart.isUsed`;
  `extHostTypes.ts` and `extHostTypeConverters.ts` carry it, `extHostChatAgents2.ts` `push` checks the proposal,
  `chatModel.ts` replaces the response's open confirmation with equal `data` by a used copy, and
  `chatConfirmationContentPart.ts` re-renders a confirmation that became used.

## Patches moved from the editor overlay

On `main`, on top of `601de14d6bef3347a3f27b50ac79f01fc056f806` (cut first from `d6d53660ed1e`,
then rebased onto main, which only adds `.github/workflows`; the editor's
`packages/editor-core/workbench/FORK.json` pins this branch's head). Each commit is one patch function from
`volter-ai/editor`'s `scripts/workbench/overlay.mjs` at editor commit
`0629f5a793e47f4266f853e849717b41387bdd1a`, applied alone in this order, leaves first, so the
overlay can drop it.

| Commit | Overlay function | Files |
|---|---|---|
| `a0d85b8ca9ad` | `patchNativePermissionPicker` | `src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts`, `src/vs/workbench/contrib/chat/browser/widget/input/permissionPickerActionItem.ts` |
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
