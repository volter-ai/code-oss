/*---------------------------------------------------------------------------------------------
 *  NATIVE CHAT, BRIDGED FOR THE SUPERCODE SESSION PROVIDER.
 *
 *  Code-OSS owns the composer, transcript, toolbar, menus and session list; the bundled
 *  `supercode-frontend-vscode` extension adapts the runtime's protocol; the editor host owns
 *  runtime lifecycle (`packages/editor-core/server/frontend-controls.ts`). These are the few
 *  doors this Code-OSS pin does not give an extension session provider on its own.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IHarnessChatNavigationService } from './volterChatNavigation.js';
import './media/panel-states.css';

// The native permissions picker supports provider-defined permission groups,
// but this Code-OSS pin only exposes its menu for built-in session types.
// Contribute the existing action for our session; the workbench owns its UI.
MenuRegistry.appendMenuItem(MenuId.ChatInputSecondary, {
	command: { id: 'workbench.action.chat.openPermissionPicker', title: localize('runtimePermissions', 'Set Permissions') },
	// Keep the effective permission visible before optional provider pickers:
	// the native secondary toolbar always retains its first action on overflow.
	group: 'navigation', order: -1,
	when: ContextKeyExpr.equals('chatSessionType', 'supercode'),
});

// Native Send requires valid session options. Before an agent/model is chosen,
// that precondition prevents Enter from reaching the provider at all. Explain
// this exact refusal while leaving the input and native submit action intact.
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'volter.chat.explainUnavailableSend',
			title: localize2('unavailableHarnessSend', 'Explain Why Chat Is Not Ready to Send'),
			f1: false,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('chatSessionType', 'supercode'),
				ChatContextKeys.inputHasSendableContent,
				ChatContextKeys.chatSessionOptionsValid.negate(),
				ChatContextKeys.requestInProgress.negate(),
			),
			keybinding: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib + 1,
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.withinEditSessionDiff.negate()),
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		let reason: string | undefined;
		try {
			reason = await accessor.get(ICommandService).executeCommand<string | undefined>('supercode.frontend.sendRefusal');
		} catch {
			// Older frontends have no readiness command; native options still say
			// this input cannot be sent. They receive the same visible explanation.
		}
		accessor.get(INotificationService).info(reason || localize('chooseHarnessBeforeSend', 'Choose your coding agent and an available model before sending. Your draft is saved.'));
	}
});

// The pinned extension API can publish sessions but cannot reveal a specific
// resource in the sidebar. Keep this bridge limited to the native widget service.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.openSession', title: localize2('openHarnessChat', 'Open Harness Conversation'), f1: false }); }
	async run(accessor: ServicesAccessor, value: string): Promise<{ resource: string }> {
		const resource = URI.parse(value);
		if (resource.scheme !== 'supercode') { throw new Error('Expected a Volter Harness chat session.'); }
		const widget = await accessor.get(IChatWidgetService).openSession(resource, ChatViewPaneTarget, { revealIfOpened: true });
		const selected = widget?.viewModel?.sessionResource.toString();
		if (selected !== resource.toString()) { throw new Error('The requested conversation was not selected.'); }
		return { resource: selected };
	}
});

// Readiness may reveal automatically after an extension-host round trip. Keep
// the observed native focus current throughout the same activation transaction.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.revealReadySession', title: localize2('revealReadyHarnessChat', 'Reveal Ready Harness Conversation'), f1: false }); }
	async run(accessor: ServicesAccessor, value: string, expectedFocus: string | null): Promise<{ resource: string }> {
		const resource = URI.parse(value);
		if (resource.scheme !== 'supercode') { throw new Error('Expected a Volter Harness chat session.'); }
		if (expectedFocus !== null && typeof expectedFocus !== 'string') { throw new Error('Expected the observed native conversation focus.'); }
		const widgets = accessor.get(IChatWidgetService);
		const navigation = accessor.get(IHarnessChatNavigationService);
		const focused = widgets.lastFocusedWidget;
		// A blank chat that is not a harness conversation holds nothing a person chose: the workbench restores one
		// on every page reload, and the extension is never told of it (focus is reported once a harness chat is
		// seen). Counted as focus, it refused every readiness reveal after a reload, leaving the running turn and
		// its approval cards out of sight (t_39dac582). It also matches no focus; a chat with requests or typed input,
		// and every harness chat, still guard. An extension that was told of the blank chat still matches it exactly.
		const resourceOf = (widget: typeof focused) => widget?.viewModel?.sessionResource.toString() ?? null;
		const blank = (widget: typeof focused) => {
			const viewModel = widget?.viewModel;
			return Boolean(viewModel && viewModel.sessionResource.scheme !== 'supercode' && !viewModel.model.hasRequests && !widget!.getInput().trim());
		};
		const matches = () => expectedFocus === resourceOf(focused) || (expectedFocus === null && blank(focused));
		const focusedResource = resourceOf(focused);
		const expected = matches();
		let unchanged = true;
		const isCurrent = () => unchanged && expected && matches()
			&& widgets.lastFocusedWidget === focused
			&& resourceOf(focused) === focusedResource
			&& (!focused || widgets.getAllWidgets().includes(focused));
		const listener = widgets.onDidChangeFocusedSession(() => { unchanged = isCurrent(); });
		try {
			return await navigation.run(resource, async permit => {
				const widget = await widgets.openSession(resource, ChatViewPaneTarget, { revealIfOpened: true, harnessNavigationPermit: permit });
				const selected = widget?.viewModel?.sessionResource.toString();
				if (selected !== resource.toString()) { throw new Error('The ready conversation was not selected.'); }
				return { resource: selected };
			}, undefined, isCurrent);
		} finally { listener.dispose(); }
	}
});

// Bound conversations activate through the awaited native navigation boundary.
// Focus bookkeeping (including newly materialized sessions) must not race it.
class HarnessChatFocus extends Disposable {
	static readonly ID = 'volter.harnessChatFocus';
	constructor(
		@IChatWidgetService widgets: IChatWidgetService,
		@IHarnessChatNavigationService navigation: IHarnessChatNavigationService,
		@INotificationService notifications: INotificationService,
	) {
		super();
		let last: string | undefined;
		let lastResource: URI | undefined;
		let lastWidget: typeof widgets.lastFocusedWidget;
		let generation = 0;
		let observingHarness = false;
		const sync = () => {
			const widget = widgets.lastFocusedWidget;
			const resource = widget?.viewModel?.sessionResource;
			const key = resource?.toString();
			if (key === last) { return; }
			const materialized = widget === lastWidget && lastResource?.scheme === 'supercode'
				&& lastResource.path.startsWith('/untitled-') && resource?.scheme === 'supercode'
				&& !resource.path.startsWith('/untitled-');
			last = key;
			lastResource = resource;
			lastWidget = widget;
			const current = ++generation;
			observingHarness ||= resource?.scheme === 'supercode';
			if (!observingHarness) { return; }
			void navigation.syncFocus(resource, () => current === generation
				&& widgets.lastFocusedWidget?.viewModel?.sessionResource.toString() === key, materialized).catch(error => {
				if (isCancellationError(error)) { return; }
				if (current !== generation) { return; }
				last = undefined;
				notifications.error(error);
			});
		};
		this._register(widgets.onDidChangeFocusedSession(sync));
		sync();
	}
}
registerWorkbenchContribution2(HarnessChatFocus.ID, HarnessChatFocus, WorkbenchPhase.AfterRestored);

// Versioned support for native confirmation cards that answer a running turn.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.inTurnApprovalCapability', title: localize2('inTurnApprovalCapability', 'Native In-Turn Approval Capability'), f1: false }); }
	run() { return { version: 1 }; }
});

// Read the native service, never a repository trust marker. A host may use the
// answer only for the exact folder currently open in this trusted workbench.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.workspaceTrust', title: localize2('harnessWorkspaceTrust', 'Read Chat Workspace Trust'), f1: false }); }
	run(accessor: ServicesAccessor, workspace: unknown): boolean {
		if (typeof workspace !== 'string' || !workspace) { return false; }
		const expected = URI.file(workspace).path;
		const matches = accessor.get(IWorkspaceContextService).getWorkspace().folders.some(folder =>
			isWindows ? folder.uri.path.toLowerCase() === expected.toLowerCase() : folder.uri.path === expected);
		return matches && accessor.get(IWorkspaceTrustManagementService).isWorkspaceTrusted();
	}
});

// `edit` automatically trusts its folder. That is permission to open project
// code, never consent to bypass Chat approvals. Only this dialog writes YOLO
// consent, in PROFILE storage (WORKSPACE storage is repository-authored here).
registerAction2(class extends Action2 {
	private readonly pending = new Map<string, Promise<boolean>>();
	constructor() { super({ id: 'volter.chat.confirmProjectYolo', title: localize2('confirmProjectYolo', 'Confirm Project YOLO Policy'), f1: false }); }
	async run(accessor: ServicesAccessor, request: unknown): Promise<boolean> {
		if (!request || typeof request !== 'object') { return false; }
		const { workspace, settingsSha256, requestConsent } = request as Record<string, unknown>;
		if (typeof workspace !== 'string' || !workspace || typeof settingsSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(settingsSha256)) { return false; }
		const context = accessor.get(IWorkspaceContextService);
		const trust = accessor.get(IWorkspaceTrustManagementService);
		const files = accessor.get(IFileService);
		const storage = accessor.get(IStorageService);
		const dialogs = accessor.get(IDialogService);
		const normalizedPath = (path: string) => isWindows ? path.toLowerCase() : path;
		const expected = normalizedPath(URI.file(workspace).path);
		const folder = context.getWorkspace().folders.find(candidate => normalizedPath(candidate.uri.path) === expected);
		if (!folder) { return false; }
		const folderIdentity = folder.uri.toString();
		const isCurrent = () => trust.isWorkspaceTrusted() && context.getWorkspace().folders.some(candidate => candidate.uri.toString() === folderIdentity);
		const settingsFile = URI.joinPath(folder.uri, '.vscode', 'settings.json');
		const matchesSettings = async () => {
			try {
				const contents = await files.readFile(settingsFile);
				const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(contents.value.buffer));
				return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') === settingsSha256;
			} catch { return false; }
		};
		if (!isCurrent() || !await matchesSettings() || !isCurrent()) { return false; }
		const key = `volter.chat.projectYolo.v1:${JSON.stringify([folder.uri.scheme, folder.uri.authority, expected])}`;
		if (storage.get(key, StorageScope.PROFILE) === settingsSha256) { return true; }
		if (requestConsent !== true) { return false; }
		const pendingKey = `${key}:${settingsSha256}`;
		const existing = this.pending.get(pendingKey);
		if (existing) { return existing; }
		const confirmation = (async () => {
			try {
				const { confirmed } = await dialogs.confirm({
					type: 'warning',
					message: localize('projectYoloQuestion', 'Enable YOLO for this project?'),
					detail: localize('projectYoloDetail', 'The settings in {0} request YOLO. Claude Code and Codex will run without approval prompts, and Codex will run without its sandbox. This choice applies only to this project and these settings. Changing the settings asks again.', workspace),
					primaryButton: localize('projectYoloEnable', 'Enable YOLO'),
					cancelButton: localize('projectYoloKeepApprovals', 'Keep Approvals'),
				});
				if (!confirmed || !isCurrent() || !await matchesSettings() || !isCurrent()) { return false; }
				storage.store(key, settingsSha256, StorageScope.PROFILE, StorageTarget.MACHINE);
				return true;
			} catch { return false; }
		})();
		this.pending.set(pendingKey, confirmation);
		try { return await confirmation; }
		finally { this.pending.delete(pendingKey); }
	}
});

// Read-only diagnostics for the product's native Chat/runtime boundary.
registerAction2(class extends Action2 {
	constructor() { super({ id: 'volter.chat.inspect', title: localize2('inspectHarnessChat', 'Inspect Chat Runtime'), f1: false }); }
	run(accessor: ServicesAccessor) {
		const widget = accessor.get(IChatWidgetService).lastFocusedWidget;
		const navigation = accessor.get(IHarnessChatNavigationService);
		const model = widget?.input.selectedLanguageModel.get()?.metadata;
		return {
			builtInAgentHostEnabled: accessor.get(IAgentHostEnablementService).enabled.get(),
			sessionResource: widget?.viewModel?.sessionResource.toString(),
			selectedHarness: model?.vendor === 'supercode-runtime' ? model.family : undefined,
			input: widget?.getInput(),
			activeConversationResource: navigation.activeResource,
			navigationOutcome: navigation.outcome,
			passive: widget?.viewModel?.sessionResource.scheme === 'supercode'
				&& !widget.viewModel.sessionResource.path.startsWith('/untitled-')
				&& widget.viewModel.sessionResource.toString() !== navigation.activeResource,
		};
	}
});
