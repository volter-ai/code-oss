/*---------------------------------------------------------------------------------------------
 *  NATIVE CHAT, BRIDGED FOR THE SUPERCODE SESSION PROVIDER.
 *
 *  Code-OSS owns the composer, transcript, toolbar, menus and session list; the bundled
 *  `supercode-frontend-vscode` extension adapts the runtime's protocol; the editor host owns
 *  runtime lifecycle (`packages/chat/serving/frontend-controls.ts`). These are the few
 *  doors this Code-OSS pin does not give an extension session provider on its own.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewPane } from '../widgetHosts/viewPane/chatViewPane.js';
import { isHarnessApproval } from './volterChatApproval.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { IChatProgressResponseContent } from '../../common/model/chatModel.js';
import { isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import './media/panel-states.css';

/**
 * A CONVERSATION OPENED IN NATIVE CHAT, answered by the Chat view's own `loadSession`: the model it bound, which is the
 * conversation asked for, or none where a later load superseded it ("the last call wins"), or another (a new chat)
 * where the load failed (a provider that threw, which the view also shows in a notification, or no provider that
 * answered, which only this function's error says). One already shown (in the view or an editor) is revealed as
 * `IChatWidgetService.openSession` reveals it. The answer is the widget `IChatWidgetService` holds for the conversation
 * once it loaded, never the view's own widget: a view closed mid-load leaves its widget disposed and unregistered.
 */
async function openConversation(accessor: ServicesAccessor, resource: URI): Promise<IChatWidget> {
	const widgets = accessor.get(IChatWidgetService);
	const views = accessor.get(IViewsService);
	if (widgets.getWidgetBySessionResource(resource)) {
		const shown = await widgets.openSession(resource, ChatViewPaneTarget, { revealIfOpened: true });
		if (shown) { return shown; }
	}
	const chatView = await views.openView<ChatViewPane>(ChatViewId, true);
	if (!chatView) { throw new Error(`The Chat view did not open, so ${resource.toString()} was not opened.`); }
	const model = await chatView.loadSession(resource);
	if (!model || !isEqual(model.sessionResource, resource)) {
		throw new Error(model
			? `Chat could not load ${resource.toString()} and showed a new chat in its place.`
			: `Chat was asked for another conversation or a new chat before ${resource.toString()} opened, which superseded it.`);
	}
	const widget = widgets.getWidgetBySessionResource(resource);
	if (!widget) { throw new Error(`Chat loaded ${resource.toString()}, but no Chat widget shows it: the Chat view closed before the load ended.`); }
	widget.focusInput();
	return widget;
}

// The pinned extension API can publish sessions but cannot reveal a specific
// resource in the sidebar. Keep this bridge limited to native Chat's own view and widget service.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.openSession', title: localize2('openHarnessChat', 'Open Harness Conversation'), f1: false }); }
	async run(accessor: ServicesAccessor, value: string): Promise<{ resource: string }> {
		const resource = URI.parse(value);
		if (resource.scheme !== 'supercode') { throw new Error('Expected a Volter Harness chat session.'); }
		await openConversation(accessor, resource);
		return { resource: resource.toString() };
	}
});

// THE FOCUSED CONVERSATION, told to the session provider (`supercode.frontend.focusSession`), which reads it for its
// controls and for which conversation a shown one is read-only beside. Opening a conversation and making it the one
// the runtime runs are the provider's own, in its `provideChatSessionContent` (`volter.chat.sessionGateCapability`
// below): the workbench keeps no gate of its own.
class HarnessChatFocus extends Disposable {
	static readonly ID = 'volter.harnessChatFocus';
	constructor(
		@IChatWidgetService widgets: IChatWidgetService,
		@ICommandService commands: ICommandService,
		@INotificationService notifications: INotificationService,
	) {
		super();
		let last: string | undefined;
		let observingHarness = false;
		const sync = () => {
			const resource = widgets.lastFocusedWidget?.viewModel?.sessionResource;
			const key = resource?.toString();
			if (key === last) { return; }
			last = key;
			observingHarness ||= resource?.scheme === 'supercode';
			if (!observingHarness) { return; }
			commands.executeCommand('supercode.frontend.focusSession', key).then(undefined, error => notifications.error(error));
		};
		this._register(widgets.onDidChangeFocusedSession(sync));
		sync();
	}
}
registerWorkbenchContribution2(HarnessChatFocus.ID, HarnessChatFocus, WorkbenchPhase.AfterRestored);

// Versioned support for the session provider owning a conversation's open and its read-only state: the workbench asks
// for a held session's content again on its provider's `onDidChangeChatSessionContent`, draws content without a
// `requestHandler` read-only with its `readOnlyMessage`, and keeps no open gate of its own.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.sessionGateCapability', title: localize2('sessionGateCapability', 'Session Provider Gate Capability'), f1: false }); }
	run() { return { version: 1 }; }
});

// Versioned support for native confirmation cards that answer a running turn.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.inTurnApprovalCapability', title: localize2('inTurnApprovalCapability', 'Native In-Turn Approval Capability'), f1: false }); }
	run() { return { version: 1 }; }
});

// Versioned support for `volter.chat.send`, as `volter.chat.inTurnApprovalCapability` declares its own: a caller asks
// it before relying on the send's answer, and an older workbench, which has neither, answers neither.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.sendCapability', title: localize2('sendCapability', 'Native Send Capability'), f1: false }); }
	run() { return { version: 1 }; }
});

// A PROMPT SENT AS CHAT'S OWN COMPOSER SENDS IT, answered with Code-OSS's own answer: `IChatWidget.acceptInput`, which
// resolves once the request has been sent (its response model), or with `undefined` where the composer kept it, and
// rejects where the send failed. A session provider that refuses a send by cancelling it (a cancellation error)
// answers `cancelled`: the provider's reason is shown in Chat, not carried in the cancellation. A provider that refuses
// by answering nothing lets the send go ahead, and is not caught here.
// `workbench.action.chat.open` doesn't await its submit, so a caller of it can only guess from the runtime's state;
// this answers the send itself. The prompt goes as `cyclotron chat send` gave it, the person's draft kept
// (`preserveInput`). `resource` names the conversation to send into (opened first, as `volter.chat.openSession`
// opens it, and refused in `openConversation`'s words where it did not open); without one, the focused Chat.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.send', title: localize2('sendHarnessChat', 'Send to Chat'), f1: false }); }
	async run(accessor: ServicesAccessor, args: { query?: unknown; resource?: unknown } | undefined): Promise<
		{ sent: true; sessionResource: string; requestId: string; responseId: string } | { sent: false; why: string; cancelled?: true }
	> {
		const query = args?.query;
		if (typeof query !== 'string' || query.trim() === '') { throw new Error('volter.chat.send takes { query, resource? }: the prompt, and the conversation to send it to.'); }
		const named = typeof args?.resource === 'string' ? URI.parse(args.resource) : undefined;
		let widget: IChatWidget | undefined;
		if (named) {
			try {
				widget = await openConversation(accessor, named);
			} catch (error) {
				return { sent: false, why: `${error instanceof Error ? error.message : String(error)} The prompt was not sent.` };
			}
		} else {
			widget = accessor.get(IChatWidgetService).lastFocusedWidget;
		}
		if (!widget) { return { sent: false, why: 'No Chat is open to send the prompt to.' }; }
		// (the composer's own reasons to keep a prompt, named where it can be read before the send)
		if (widget.input.hasPendingProgrammaticModelSelection) {
			return { sent: false, why: 'Chat\'s model is still being chosen, so its composer kept the prompt.' };
		}
		let response;
		try {
			response = await widget.acceptInput(query, { preserveInput: true });
		} catch (error) {
			// (a provider that refuses by cancelling says why in Chat; any other failure is said by its message)
			if (isCancellationError(error)) { return { sent: false, why: 'the chat provider refused the send', cancelled: true }; }
			return { sent: false, why: error instanceof Error && error.message ? error.message : 'Chat\'s send failed without saying why.' };
		}
		if (!response) {
			return { sent: false, why: widget.viewModel ? 'Chat\'s composer kept the prompt (a read-only conversation, a send it refused, or requests it waits on).' : 'Chat has no conversation to send the prompt to.' };
		}
		return { sent: true, sessionResource: response.session.sessionResource.toString(), requestId: response.requestId, responseId: response.id };
	}
});

// Read-only diagnostics for the product's native Chat/runtime boundary.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.inspect', title: localize2('inspectHarnessChat', 'Inspect Chat Runtime'), f1: false }); }
	run(accessor: ServicesAccessor) {
		const widget = accessor.get(IChatWidgetService).lastFocusedWidget;
		const model = widget?.input.selectedLanguageModel.get()?.metadata;
		return {
			sessionResource: widget?.viewModel?.sessionResource.toString(),
			selectedHarness: model?.vendor === 'supercode-runtime' ? model.family : undefined,
			input: widget?.getInput(),
		};
	}
});

// Read-only: the conversation as Chat's list shows it, read from the same view model items the list renders
// (`ChatViewModel.getItems()`: hidden requests left out, queued and steering requests after their divider), so a
// reading can check what a person sees without a browser. A request is the person's unless it is system-initiated,
// which `ChatListRenderer.renderSystemInitiatedRequest` shows as a notification row of its label.
const markdownText = (value: string | IMarkdownString | undefined) => typeof value === 'string' ? value : value?.value;

const toolStates: Record<IChatToolInvocation.StateKind, string> = {
	[IChatToolInvocation.StateKind.Streaming]: 'streaming',
	[IChatToolInvocation.StateKind.WaitingForConfirmation]: 'waitingForConfirmation',
	[IChatToolInvocation.StateKind.Executing]: 'executing',
	[IChatToolInvocation.StateKind.WaitingForPostApproval]: 'waitingForPostApproval',
	[IChatToolInvocation.StateKind.Completed]: 'completed',
	[IChatToolInvocation.StateKind.Cancelled]: 'cancelled',
	[IChatToolInvocation.StateKind.WaitingForAuthentication]: 'waitingForAuthentication',
};

function toolApproval(part: IChatToolInvocation | IChatToolInvocationSerialized): string {
	const reason = IChatToolInvocation.executionConfirmedOrDenied(part);
	if (!reason) { return 'pending'; }
	switch (reason.type) {
		case ToolConfirmKind.UserAction: return 'approved';
		case ToolConfirmKind.Denied: return 'denied';
		case ToolConfirmKind.Skipped: return 'skipped';
		default: return 'notRequired';
	}
}

function transcriptPart(part: IChatProgressResponseContent): Record<string, unknown> {
	switch (part.kind) {
		case 'markdownContent': case 'progressMessage': case 'systemNotification': case 'warning': case 'info':
			return { kind: part.kind, text: part.content.value };
		case 'thinking':
			return { kind: part.kind, text: Array.isArray(part.value) ? part.value.join('') : part.value ?? '' };
		case 'confirmation': {
			const answer = isHarnessApproval(part.data) && Array.isArray(part.data.answers) ? part.data.answers[0] : undefined;
			return {
				kind: part.kind, title: part.title, text: markdownText(part.message), buttons: part.buttons,
				state: part.isUsed ? 'answered' : 'pending',
				harnessApproval: answer ? { connectionId: answer.connectionId, requestId: answer.requestId } : undefined,
			};
		}
		case 'toolInvocation': {
			const state = part.state.get();
			const confirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages : undefined;
			return {
				kind: part.kind, toolId: part.toolId, toolCallId: part.toolCallId, state: toolStates[state.type],
				approval: state.type === IChatToolInvocation.StateKind.Streaming ? undefined : toolApproval(part),
				text: markdownText(state.type === IChatToolInvocation.StateKind.Completed ? part.pastTenseMessage ?? part.invocationMessage : part.invocationMessage),
				confirmation: confirmation ? { title: markdownText(confirmation.title), text: markdownText(confirmation.message) } : undefined,
			};
		}
		case 'toolInvocationSerialized':
			return {
				kind: part.kind, toolId: part.toolId, toolCallId: part.toolCallId, state: part.isComplete ? 'completed' : 'incomplete',
				approval: toolApproval(part), text: markdownText(part.pastTenseMessage ?? part.invocationMessage),
			};
		case 'elicitation2':
			return { kind: part.kind, title: markdownText(part.title), text: markdownText(part.message), state: part.state.get() };
		case 'elicitationSerialized':
			return { kind: part.kind, title: markdownText(part.title), text: markdownText(part.message), state: part.state };
		case 'questionCarousel':
			return { kind: part.kind, text: part.questions.map(question => question.title).join('\n'), state: part.isUsed ? 'answered' : 'pending' };
		case 'hook':
			return { kind: part.kind, text: part.systemMessage ?? part.stopReason };
		default:
			return { kind: part.kind };
	}
}

// Bounded by default: the last TRANSCRIPT_LAST items, each text cut at TRANSCRIPT_TEXT_CAP characters with its
// original length in `textLength`, so a long conversation does not arrive whole. `last` asks for a different count.
const TRANSCRIPT_LAST = 20;
const TRANSCRIPT_TEXT_CAP = 2000;

function capText<T extends Record<string, unknown>>(entry: T): T {
	const text = entry.text;
	if (typeof text !== 'string' || text.length <= TRANSCRIPT_TEXT_CAP) { return entry; }
	return { ...entry, text: text.slice(0, TRANSCRIPT_TEXT_CAP), textLength: text.length };
}

registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.transcript', title: localize2('harnessChatTranscript', 'Read Chat Transcript'), f1: false }); }
	run(accessor: ServicesAccessor, value?: unknown) {
		// A conversation resource, or `{resource?, last?}`.
		const options = typeof value === 'string' ? { resource: value } : value ?? {};
		if (typeof options !== 'object') { throw new Error('Expected a conversation resource or {resource, last}.'); }
		const { resource, last = TRANSCRIPT_LAST } = options as { resource?: unknown; last?: unknown };
		if (resource !== undefined && resource !== null && typeof resource !== 'string') { throw new Error('Expected a conversation resource.'); }
		if (typeof last !== 'number' || !Number.isSafeInteger(last) || last < 1) { throw new Error('Expected last to be a positive whole number.'); }
		const widgets = accessor.get(IChatWidgetService);
		const widget = resource ? widgets.getWidgetBySessionResource(URI.parse(resource)) : widgets.lastFocusedWidget;
		const viewModel = widget?.viewModel;
		if (!viewModel) { throw new Error(resource ? 'No Chat shows this conversation.' : 'No Chat is focused.'); }
		const all = viewModel.getItems();
		const items = all.slice(-last).map(item => {
			if (isRequestVM(item)) {
				return capText({
					kind: 'request', id: item.id, attribution: item.isSystemInitiated ? 'system' : 'user', username: item.username,
					text: item.isSystemInitiated ? item.systemInitiatedLabel ?? item.messageText : item.messageText,
					pending: item.pendingKind,
				});
			}
			if (isResponseVM(item)) {
				return {
					kind: 'response', id: item.id, requestId: item.requestId, attribution: 'agent', username: item.username,
					complete: item.isComplete, canceled: item.isCanceled, error: item.errorDetails?.message,
					parts: item.response.value.map(part => capText(transcriptPart(part))),
				};
			}
			return { kind: 'divider', pending: item.dividerKind, systemInitiated: !!item.isSystemInitiated };
		});
		return { sessionResource: viewModel.sessionResource.toString(), visible: widget.visible, totalItems: all.length, items };
	}
});
