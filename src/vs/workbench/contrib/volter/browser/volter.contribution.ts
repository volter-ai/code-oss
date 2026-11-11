

import './media/volter-parts.css';
import './volterSidebarRestore.js';
import { attachDocumentView, installDocumentViewSink, VolterDocumentViews } from './volterDocumentViews.js';
import { $, Dimension } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationHandle, INotificationService } from '../../../../platform/notification/common/notification.js';
import Severity from '../../../../base/common/severity.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { IEditorProgressService, IProgressRunner, IProgressService } from '../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { EditorExtensions, IEditorOpenContext, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptorService, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorsOrder } from '../../../common/editor.js';
import { GettingStartedInput } from '../../welcomeGettingStarted/browser/gettingStartedInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { installSessionTabBootstrap, resolveSessionOrigin } from './volterSessionOrigin.js';
import { VolterKeybindingLabels, VolterKeyboard, VolterKeyboardBridge, VolterKeyboardCommands } from './volterKeyboard.js';
import { VolterHistory, VolterHistoryBridge } from './volterHistory.js';
import { VolterFiles, VolterFilesBridge } from './volterFiles.js';
import { VolterCommands, VolterCommandsBridge } from './volterCommands.js';
import { VolterNotification, volterNotify } from './volterNotifications.js';
import { VolterUtilitiesBridge, VolterUtilityViews } from './volterUtilityViews.js';
import { VolterWorkspaceBridge, VolterWorkspaceHost } from './volterWorkspaceCommands.js';
import { VolterStatus, VolterStatusBridge } from './volterStatus.js';
import { BAR_DELAY_MS, beginLaunchWait, documentWaiting, onDidChangeDocumentWaits, VolterProgress, VolterProgressBridge } from './volterProgress.js';
import { viewBackgroundFor } from './volterColors.js';
import { VolterSettings, VolterSettingsBridge } from './volterSettings.js';
import { NO_PRODUCT_REGISTERED, volterProduct, type VolterProductMountContext } from './volterProduct.js';
import { reconcileVolterExtensions, volterContributions, type VolterContributionsBridge } from './volterExtensions.js';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { raiseOpeningCover, VolterOpeningCover } from './volterCover.js';
import { VolterDocuments, VolterDocumentsBridge } from './volterDocuments.js';
import { VolterThemes, VolterThemesBridge } from './volterThemes.js';
import { VolterEditorTools, VolterTools, VolterToolsBridge } from './volterTools.js';
import { VolterDocumentInput, VolterDocumentInputSerializer } from './volterDocumentInput.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { resolveCommandsContext } from '../../../browser/parts/editor/editorCommandsContext.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { terminalCanvasFrame } from './volterTerminalCapture.js';

/** THE PRODUCT, read ONCE at load. `undefined` is a build the overlay assembled without a
 *  product half: the registrations below are skipped and the mount command refuses by name,
 *  rather than a pane and a container registering with nothing to name them. */
const product = volterProduct();

/** Additional center panes participate in stage-focus keybinding scope.
 * Native document bodies mount through viewOpened, viewBody and viewClosed;
 * the initial VscodeParts remain the three parts supplied by the frame. */
type PartId = 'center' | 'outliner' | 'properties' | `center:${string}`;
/** The parts handed to the bridge, as their DOM elements become available. */
const parts = new Map<PartId, HTMLElement>();
const partWaiters = new Set<() => void>();
/** The one keyboard owner's publisher, once the bridge has mounted (volterKeyboard.ts). */
let keyboard: VolterKeyboard | undefined;
/**
 * Withdraw a part when its current pane is disposed. Panes can be replaced before predecessors
 * finish disposing, so a stale holder must not withdraw its successor's element. Notify the bridge
 * to release the portal target rather than render into a detached node.
 */
function withdrawPart(id: PartId, element: HTMLElement): void {
	if (parts.get(id) !== element) { return; }
	parts.delete(id);
	keyboard?.untrackPart(id);
	if (id === 'center' || id === 'outliner' || id === 'properties') {
		void mounted?.then(mount => mount.offerPart(id, null)).catch(() => { /* an unmounted bridge has no part to withdraw */ });
	}
}
function offerPart(id: PartId, element: HTMLElement): void {
	element.classList.add('volter-host-part');
	// Make handed-over parts focusable and focus them on pointer down so native context keys follow the
	// clicked stage. Native input and textarea focus occurs afterward as the browser's default action.
	element.tabIndex = -1;
	element.addEventListener('pointerdown', () => element.focus({ preventScroll: true }));
	parts.set(id, element);
	keyboard?.trackPart(id, element);
	// Retarget the bridge portal when a replacement pane offers this part.
	if (id === 'center' || id === 'outliner' || id === 'properties') {
		void mounted?.then(mount => mount.offerPart(id, element)).catch(() => { /* not mounted yet: the mount takes the map */ });
	}
	for (const wake of partWaiters) { wake(); }
}
/** Connect the session tab before mounting the editor and settle workspace trust through the native
 * service. The session's bootstrap buffers routed events until the editor adopts it. A live session on
 * this folder records the existing decision to execute its code without disabling the trust model. The
 * mount awaits that result; failures clear the memo so another attempt can resolve again. */
let sessionTab: Promise<string> | undefined;
function connectSessionTab(workspaceTrust: IWorkspaceTrustManagementService): Promise<string> {
	if (!sessionTab) {
		sessionTab = (async () => {
			const sessionOrigin = await resolveSessionOrigin(product?.command);
			await installSessionTabBootstrap(sessionOrigin);
			await trustTheSessionsFolder(workspaceTrust);
			return sessionOrigin;
		})();
		sessionTab.catch(() => { sessionTab = undefined; });
	}
	return sessionTab;
}

/**
 * The trust the session already implies, written through the service's own door.
 *
 * AFTER `workspaceTrustInitialized`, because before it there is nothing to write into: under
 * the REH shape the service waits on `resolveAuthority` and `canSetWorkspaceTrust()` answers
 * false until that lands (`workspaceTrust.ts`'s remote branch). Already-trusted folders and a
 * workspace the service says cannot be set (a remote that decides trust itself) are left
 * alone — this adds the person's own decision, it never overrides the host's.
 *
 * A THROW HERE IS NOT FATAL TO THE TAB. The write failing means the folder stays untrusted,
 * and the mount command's gate is exactly the right thing to happen next; reported through the
 * workbench's own unexpected-error channel so it is not silent.
 */
async function trustTheSessionsFolder(workspaceTrust: IWorkspaceTrustManagementService): Promise<void> {
	try {
		await workspaceTrust.workspaceTrustInitialized;
		if (workspaceTrust.isWorkspaceTrusted() || !workspaceTrust.canSetWorkspaceTrust()) { return; }
		await workspaceTrust.setWorkspaceTrust(true);
	} catch (error) {
		onUnexpectedError(error);
	}
}

function waitForParts(ids: readonly PartId[], timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;
		const check = () => {
			if (ids.every(id => parts.has(id))) { partWaiters.delete(check); resolve(); }
			else if (Date.now() > deadline) { partWaiters.delete(check); reject(new Error(`parts missing: ${ids.filter(id => !parts.has(id)).join(', ')}`)); }
		};
		partWaiters.add(check);
		check();
		setTimeout(check, timeoutMs + 10);
	});
}

// ---- The editor pane: the document.

export class VolterDocumentPane extends EditorPane {
	static readonly ID = 'workbench.editor.volterDocument';
	private container: HTMLElement | undefined;
	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorProgressService private readonly editorProgress: IEditorProgressService,
	) {
		super(VolterDocumentPane.ID, group, telemetryService, themeService, storageService);
		this._register(onDidChangeDocumentWaits(() => this.showWait()));
	}
	/**
	 * Allow document panes a 24 px minimum height so small declared area ratios remain usable.
	 * The native EditorPane default is 70 px; a group clamped exactly to its minimum is treated as
	 * collapsed by doRestoreGroup and expanded on activation. A lower minimum preserves compact area
	 * splits without triggering that restore rule.
	 */
	override get minimumHeight(): number { return 24; }
	override get minimumWidth(): number { return 24; }
	/** The document this pane's container is currently the slot for. */
	private releaseView: (() => void) | undefined;
	/** The part id this pane handed over, withdrawn when it is disposed. */
	private partId: PartId | undefined;
	private static panes = 0;
	protected createEditor(parent: HTMLElement): void {
		this.container = $('.volter-model-pane');
		this.container.style.cssText = 'width:100%;height:100%;overflow:hidden;position:relative;';
		parent.appendChild(this.container);
		// A newly created pane supplies center when that slot is empty. Additional panes
		// offer separate ids and document slots while sharing stage focus context.
		this.partId = parts.has('center') ? `center:${VolterDocumentPane.panes++}` : 'center';
		offerPart(this.partId, this.container);
	}
	/** The group activating this editor focuses the STAGE, so `volter.stage.focused` is true
	 *  for the same gestures that focus any other editor (a tab click, ⌘1, Go Back). */
	override focus(): void {
		this.container?.focus({ preventScroll: true });
	}
	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested && this.input === input) { this.takeSlot(input); }
	}
	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);
		this.takeSlot(visible ? this.input : undefined);
	}
	override clearInput(): void {
		this.takeSlot(undefined);
		super.clearInput();
	}
	override dispose(): void {
		this.takeSlot(undefined);
		if (this.partId !== undefined && this.container) { withdrawPart(this.partId, this.container); }
		super.dispose();
	}
	/** VS Code REUSES one pane for every input of its type in a group, and it calls `setInput`
	 *  for the new one without a `clearInput` for the old — so the withdrawal is here, in the
	 *  one place that knows both halves. */
	private takeSlot(input: EditorInput | undefined): void {
		this.releaseView?.();
		this.releaseView = input && this.container ? attachDocumentView(this.group.id, input, this.container) : undefined;
		this.slotInput = input;
		// The group's bar is the active editor's, and the group stops it whenever that changes.
		this.waitRunner?.done();
		this.waitRunner = undefined;
		this.showWait();
	}
	/** The input this pane shows now, whose wait (`volterProgress.ts`) is on the group's progress bar. */
	private slotInput: EditorInput | undefined;
	private waitRunner: IProgressRunner | undefined;
	private showWait(): void {
		const waiting = this.slotInput instanceof VolterDocumentInput && documentWaiting(this.slotInput.documentId);
		if (waiting && !this.waitRunner) { this.waitRunner = this.editorProgress.show(true, BAR_DELAY_MS); }
		else if (!waiting && this.waitRunner) { this.waitRunner.done(); this.waitRunner = undefined; }
	}

	override layout(_dimension: Dimension): void { /* the volter document surface measures its own box */ }
}

// THE PANE'S REGISTERED NAME IS THE PRODUCT'S TITLE. It is what the workbench shows where it
// names the KIND of editor rather than the document (the `Reopen Editor With…` list); the tab
// itself carries the document's own title, which is why a models scaffold's editor is called
// `cube`.
if (product) {
	Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
		EditorPaneDescriptor.create(VolterDocumentPane, VolterDocumentPane.ID, product.title),
		[new SyncDescriptor(VolterDocumentInput)]
	);
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(VolterDocumentInput.ID, VolterDocumentInputSerializer);

// ---- Portal hosts for the native views declared by each product.

abstract class VolterHostView extends ViewPane {
	protected abstract readonly partId: 'outliner' | 'properties';
	private hostBody: HTMLElement | undefined;
	// These panels supply their own headers. Keep the native layout informed,
	// including when the container updates header visibility after a move.
	override get headerVisible(): boolean { return false; }
	override set headerVisible(_visible: boolean) { super.headerVisible = false; }
	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}
	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.closest('.pane')?.classList.add('volter-pane');
		this.hostBody = $('.volter-view-body');
		this.hostBody.style.cssText = 'width:100%;height:100%;overflow:hidden;position:relative;';
		container.appendChild(this.hostBody);
		// Use the view's registered backdrop color independently from the dock's fill. Unset themes leave
		// stylesheet fills intact.
		this._register(this.themeService.onDidColorThemeChange(() => this.applyBackground()));
		this.applyBackground();
		offerPart(this.partId, this.hostBody);
		const body = this.hostBody;
		this._register({ dispose: () => withdrawPart(this.partId, body) });
	}
	private applyBackground(): void {
		if (!this.hostBody) { return; }
		// `viewBackgroundFor` keys its per-view rows by UTILITY id; these two are views of the
		// contribution's own, so they take the generic colour — which is the whole point of it.
		const color = viewBackgroundFor(this.themeService.getColorTheme(), this.partId);
		this.hostBody.style.background = color ? color.toString() : '';
	}
	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.hostBody) { this.hostBody.style.height = `${height}px`; this.hostBody.style.width = `${width}px`; }
	}
	/** Focusing the view focuses the volter panel inside it, not the empty pane body, so
	 *  `volter.focused` follows the workbench's own focus gestures. */
	override focus(): void {
		if (this.hostBody) { this.hostBody.focus({ preventScroll: true }); } else { super.focus(); }
	}
}
class VolterOutlinerView extends VolterHostView { static readonly ID = 'volter.outliner'; protected readonly partId = 'outliner' as const; }
class VolterPropertiesView extends VolterHostView { static readonly ID = 'volter.properties'; protected readonly partId = 'properties' as const; }
const hostViews = { outliner: VolterOutlinerView, properties: VolterPropertiesView };
// Product defaults register real Code-OSS views. Never impose one product's arrangement on another's.
if (product) {
	for (const container of product.layout.containers) {
		const registered = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
			id: container.id, title: { value: container.title, original: container.title }, icon: Codicon.symbolClass, order: 0,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [container.id, { mergeViewWithContainerWhenSingleView: false }]),
			hideIfEmpty: true,
		}, container.location === 'sidebar' ? ViewContainerLocation.Sidebar : ViewContainerLocation.AuxiliaryBar);
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(container.views.map((view, order) => ({
			id: hostViews[view.part].ID, name: { value: view.title, original: view.title },
			ctorDescriptor: new SyncDescriptor<VolterHostView>(hostViews[view.part]), canToggleVisibility: true, canMoveView: true,
			weight: view.weight, order,
		})), registered);
	}
}

// ---- The command that assembles the parts and mounts the Volter editor over them.

// VolterDocumentsBridge carries the open document set. activeSource returns a project-relative path,
// which can be empty for documents with no file.

// The members this file installs are the KIT's doors, declared here as mirrors of
// `bridge.tsx`'s handles, because nothing under `src/vs/` can import React TSX.
interface BridgeMount {
	host: HTMLElement;
	keyboard: VolterKeyboardBridge;
	offerPart(id: 'center' | 'outliner' | 'properties', element: HTMLElement | null): void;
	documents: VolterDocumentsBridge;
	history: VolterHistoryBridge;
	files: VolterFilesBridge;
	settings: VolterSettingsBridge;
	commands: VolterCommandsBridge;
	utilities: VolterUtilitiesBridge;
	workspace: VolterWorkspaceBridge;
	status: VolterStatusBridge;
	startup: VolterStartupBridge;
	progress: VolterProgressBridge;
	tools: VolterToolsBridge;
	themes: VolterThemesBridge;
}
/** The editor's terminal boot failure (`bridge.tsx`'s `VolterStartupHandle`), a mirror like the rest. */
interface VolterStartupBridge { subscribe(listener: (failure: { message: string; guidance: string | null; command: string | null; transient?: boolean } | null) => void): () => void }
interface BridgeModule {
	mountVolter(parts: { chromeRoot: HTMLElement; header: HTMLElement; center: HTMLElement; outliner?: HTMLElement; properties?: HTMLElement }, frame?: { canvasRender?: (canvas: HTMLCanvasElement) => Promise<CanvasImageSource> | null; contributions?: VolterContributionsBridge; keybindings?: { label(action: string): string | undefined; subscribe(listener: () => void): () => void }; notify?: (notification: VolterNotification) => INotificationHandle; workspaceStorage?: { get(key: string): string | undefined; store(key: string, value: string | undefined): void; flush(): Promise<void> } }): Promise<BridgeMount>;
}
let mounted: Promise<BridgeMount> | undefined;
const keyboardStore = new DisposableStore();

/**
 * THE PRODUCT'S COVER over this open (`volterCover.ts`). Raised by `VolterSessionTab` at the first
 * moment the workspace folder is known and taken away by whichever outcome arrives first:
 *
 *   * this folder is not a project → `VolterProjectAutoOpen` removes it (nothing of ours will run)
 *   * a project with no session    → the mount command FAILS it with the reason and the command
 *                                    that starts one
 *   * the person declines trust    → the mount command removes it (the workbench is what is left)
 *   * the editor mounts            → the mount command removes it
 *   * the open refuses or throws   → the cover SAYS SO and grows a way out
 *   * the editor reports a startup failure → the cover says that, in the editor's words
 *   * the open is slow             → the open's wait (`volterProgress.ts`) says what it is
 *                                    waiting on, and the cover keeps waiting
 */
let cover: VolterOpeningCover | undefined;

/** When a still-waiting cover also offers Dismiss, so the wait never seals the workbench for as
 *  long as it lasts. */
const OPEN_DISMISS_AFTER_S = 60;
/** Whether the editor's own startup REFUSAL stands: then nothing else replaces it on the cover. */
let startupRefused = false;

/** A refusal's message and its fix, without the command twice when the message or guidance
 *  already names it (the engine pin's does — `AppRoot`'s console line dedupes the same way). */
function startupRefusalText(failure: { message: string; guidance: string | null; command: string | null }): string {
	const named = (text: string | null) => !!failure.command && !!text?.includes(failure.command);
	const run = failure.command && !named(failure.message) && !named(failure.guidance)
		? localize('volterStartupRun', "Run from the project folder:\n{0}", failure.command)
		: null;
	return [failure.message, failure.guidance, run].filter(Boolean).join('\n\n');
}

function hostedSlot(parentSelector: string, className: string): HTMLElement {
	const parent = mainWindow.document.querySelector<HTMLElement>(parentSelector);
	if (!parent) { throw new Error(`${parentSelector} is not in the workbench`); }
	parent.classList.add('volter-hosted');
	let slot = parent.querySelector<HTMLElement>(`.${className}`);
	if (!slot) { slot = $(`.volter-host-part.${className}`); parent.appendChild(slot); }
	return slot;
}

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'volter.workspace.open', title: localize2('volterWorkspaceOpen', "Volter Editor: Open Workspace"), category: Categories.View, f1: true });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const notifications = accessor.get(INotificationService);
		// NO PRODUCT, NO WORKSPACE — and it is said in the workbench's own voice rather than
		// mounted half-way: with no product the pane and the container were never registered,
		// so there is nothing for this command to open.
		if (!product) { cover?.remove(); notifications.error(NO_PRODUCT_REGISTERED); return; }
		// Capture every service before the first await; ServicesAccessor is valid only during the invocation's
		// synchronous portion.
		const workspaceService = accessor.get(IWorkspaceContextService);
		const contextKeyService = accessor.get(IContextKeyService);
		const keybindingService = accessor.get(IKeybindingService);
		const instantiationService = accessor.get(IInstantiationService);
		const workspaceTrust = accessor.get(IWorkspaceTrustManagementService);
		const workspaceTrustRequest = accessor.get(IWorkspaceTrustRequestService);
		// Capture configuration before awaiting workspace trust, for the same synchronous-accessor constraint.
		const storage = accessor.get(IStorageService);
		const extensionManagement = accessor.get(IWorkbenchExtensionManagementService);
		const extensionService = accessor.get(IExtensionService);
		const extensionEnablement = accessor.get(IWorkbenchExtensionEnablementService);
		const host = accessor.get(IHostService);
		const environment = accessor.get(IWorkbenchEnvironmentService);
		const terminals = accessor.get(ITerminalService);
		const progressService = accessor.get(IProgressService);
		/** Shared context for the product's mount and readiness hooks. */
		const productContext = (mount: BridgeMount): VolterProductMountContext => ({
			mount: mount as unknown as Readonly<Record<string, unknown>>,
			store: keyboardStore,
		});
		// Wait for session-tab trust settlement before checking the native workspace-trust gate. A folder
		// without a trusted live session uses the workbench prompt; refusal prevents mounting. The product
		// supplies its own explanation of what trusting executes.
		await connectSessionTab(workspaceTrust).catch(() => { /* no session: the gate below asks, and the mount says why */ });
		if (!workspaceTrust.isWorkspaceTrusted()) {
			const trusted = await workspaceTrustRequest.requestWorkspaceTrust({
				message: product.trustSentence,
			});
			if (!trusted) {
				// The cover comes down whole: what is left is the workbench, which is usable,
				// plus this refusal in the workbench's own voice.
				cover?.remove();
				notifications.warn(localize('volterTrustRefused', "Volter Editor: Open Workspace needs a trusted folder — this project's own code runs in the pane. Trust the folder and run the command again."));
				return;
			}
		}
		// THE OPEN'S WAIT (`volterProgress.ts`): what it is doing, until the cover comes down or the
		// open fails. A wait the editor reports while it stands (its document opening) stands in
		// front of it as the same notification.
		const folder = workspaceService.getWorkspace().folders[0]?.uri;
		const opening = beginLaunchWait(progressService,
			localize('volterOpening', "Opening {0}", folder ? basename(folder) : product.title),
			localize('volterStepLayout', "Laying out the workbench"));
		// Dismissing the cover is the person leaving the open behind: its wait goes with the cover.
		cover?.onDismiss(() => opening.done());
		// AND A WAY OUT once the wait is long, through the product's `ready` too (which may never
		// end if nothing ever opens): the cover never seals the workbench. Not cleared at `ready`
		// on purpose; the cover's removal makes it a no-op.
		mainWindow.setTimeout(() => cover?.offerDismiss(), OPEN_DISMISS_AFTER_S * 1000);
		try {
			// Discard only upstream's onboarding, including a restored Welcome tab.
			await editorService.closeEditors(editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor.typeId === GettingStartedInput.ID));
			const layoutKey = `volter.layout.${product.id}.v1`;
			const firstLayout = !storage.getBoolean(layoutKey, StorageScope.WORKSPACE, false);
			if (firstLayout) {
				layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
				layoutService.setPartHidden(true, Parts.PANEL_PART);
				// Preserve the native secondary sidebar default on first open. Declared auxiliary views open
				// through the loop below; products without one retain the workbench's default container.
				layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
			// Keep the native restored tab if a pane already supplies the mount slot.
			if (!parts.has('center')) {
				const restored = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(({ editor }) => editor instanceof VolterDocumentInput);
				if (restored) { await editorService.openEditor(restored.editor, { preserveFocus: true }, restored.groupId); }
				else { await editorService.openEditor(VolterDocumentInput.instance, { pinned: true }); }
			}
			// Only a fresh workspace needs product defaults. On later boots the native
			// view service restores visibility and placement; opening every view here
			// would switch containers and undo that restoration just to mount portals.
			if (firstLayout) {
				for (const container of product.layout.containers) {
					for (const view of container.views) {
						await viewsService.openView(hostViews[view.part].ID, false);
					}
				}
			}
			opening.update(localize('volterStepParts', "Waiting for the editor's panes"));
			await waitForParts(['center'], 8000);
			if (firstLayout) {
				const sidebar = layoutService.getSize(Parts.SIDEBAR_PART);
				layoutService.resizePart(Parts.SIDEBAR_PART, product.layout.sidebarWidth - sidebar.width, 0);
				storage.store(layoutKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
			if (!mounted) {
				const header = hostedSlot('.part.titlebar .titlebar-container', 'volter-titlebar-host');
				// Status contributions use native IStatusbarService entries. The page does not receive a separate
				// status slot.
				const chromeRoot = mainWindow.document.querySelector<HTMLElement>('.monaco-workbench')!;
				mounted = (async () => {
					// WHERE THE SESSION IS, and this page already being one of its TABS:
					// `connectSessionTab` above, which the activation contribution and this
					// command's own trust gate have both already run — this await is the memo,
					// and it is here for the ORIGIN it returns. It checks that origin
					// (`volterSessionOrigin.ts`: the page's own, which the session's proxy
					// fronts), installs the session's tab bootstrap and records the trust the
					// session implies.
					opening.update(localize('volterStepSession', "Connecting to the session"));
					const sessionOrigin = await connectSessionTab(workspaceTrust);
					// THE EDITOR IS THE SESSION'S, and the session says where: its serving door
					// (`/__editor/served-modules`) hands back the url of its own frame entry,
					// mtime-stamped in dev and content-hashed in a production build. Nothing here
					// declares anything and nothing is copied — the door answers with the module
					// the session is already serving.
					const doorUrl = `${sessionOrigin}/__editor/served-modules`;
					opening.update(localize('volterStepDoor', "Asking the session what it serves"));
					const door = await fetch(doorUrl, { headers: { accept: 'application/json' } });
					if (!door.ok) { throw new Error(`the Volter session's serving door answered ${door.status} at ${doorUrl}`); }
					const served = await door.json() as { modules: { id: string; url: string }[]; refusals: { id: string | null; message: string }[]; extensions?: { name: string; dir: string; changed: boolean }[] };
					// THE SESSION'S PACKAGES AS CODE-OSS EXTENSIONS (`volterExtensions.ts`): installed from
					// their folders on the remote server that hosts the session, before the editor loads,
					// so the `volter` point has their contributions when the editor asks.
					opening.update(localize('volterStepExtensions', "Installing the project's packages"));
					// A package the page had already registered was uninstalled, and Code-OSS answers that with a
					// reload: this page's extension registry still holds the old set, and a package whose dependency
					// left mid-swap is refused for the life of the page. The next load finds nothing stale.
					if (await reconcileVolterExtensions(served.extensions ?? [], environment.remoteAuthority, sessionOrigin, extensionManagement, extensionService, extensionEnablement) > 0) {
						await host.reload();
						return new Promise<never>(() => { });
					}
					const bridge = served.modules.find(m => m.id === 'vscode-bridge');
					if (!bridge) {
						const refused = (served.refusals).map(r => `${r.id ?? '(document)'}: ${r.message}`).join('; ');
						throw new Error(`the Volter session at ${sessionOrigin} serves no "vscode-bridge" module, so there is no editor to mount. Its serving door is /__editor/served-modules (packages/editor-core/server/routes/served-modules.ts)${refused ? ` and it refused: ${refused}` : ''}`);
					}
					const bridgeUrl = `${sessionOrigin}${bridge.url}`;
					// The serving host owns any development preamble. A packaged product
					// is a normal ESM entry and has no Vite Fast Refresh endpoint.
					opening.update(localize('volterStepModules', "Loading the editor"));
					const mod = await import(bridgeUrl) as BridgeModule;
					opening.update(localize('volterStepMount', "Starting the editor"));
					const mount = await mod.mountVolter(
						{ chromeRoot, header, center: parts.get('center')!, outliner: parts.get('outliner'), properties: parts.get('properties') },
						// The project's state lives in the workbench's WORKSPACE scope, which this
						// release keeps in the project's folder (the fork's `workspaceStorageUrl`).
						{
							canvasRender: canvas => terminalCanvasFrame(terminals, canvas),
							contributions: volterContributions,
							keybindings: new VolterKeybindingLabels(keybindingService, contextKeyService),
							// Every notification the editor says is one of the workbench's (`volterNotifications.ts`).
							notify: volterNotify(notifications),
							workspaceStorage: {
								get: (key) => storage.get(key, StorageScope.WORKSPACE),
								store: (key, value) => value === undefined
									? storage.remove(key, StorageScope.WORKSPACE)
									: storage.store(key, value, StorageScope.WORKSPACE, StorageTarget.MACHINE),
								// The session's end: every service saves its state, then the writes land.
								flush: () => storage.flush(WillSaveStateReason.SHUTDOWN),
							},
						},
					);
					// KEYBOARD OWNERSHIP, installed the moment the editor is there to dispatch

					// The bridge has already told the editor the frame owns the keyboard — it
					// does that BEFORE mounting, so the editor's own dispatcher is never
					// installed — and what arrives here is that editor's action table.
					keyboard = keyboardStore.add(new VolterKeyboard(mount.keyboard, contextKeyService));
					for (const [id, element] of parts) { keyboard.trackPart(id, element); }
					// THE EDITOR REFUSED TO OPEN THE PROJECT, and the cover is what a person is
					// looking at. The editor's own error screen renders beneath it; the open below
					// then waits on a workspace restore that a project which never opened never
					// makes, so the splash would run forever over the refusal.
					// The cover fails in the editor's words instead. The open is left waiting on
					// purpose: Dismiss shows the editor's error screen, and its Retry — after the
					// fix — finishes this same open rather than mounting a second editor.
					// ANY STARTUP FAILURE, not only the pin's: every part of the boot publishes into
					// the same door (`@volter/sdk/startup-failure`) — a
					// project that cannot be read, a page with no project, a crashed surface, a
					// engine worker that could not open the model.
					// A FAILURE THE EDITOR RETRIES (a transient startup notice) IS SAID ONCE: the cover's note
					// while the cover stands, and an error notice once it has lifted (or when the failure
					// arrives after), closed when a retry succeeds.
					let retried: { readonly failure: { message: string; guidance: string | null }; notice?: INotificationHandle } | undefined;
					const sayRetried = () => {
						if (!retried || retried.notice || cover?.standing) { return; }
						const { failure } = retried;
						retried.notice = notifications.notify({
							severity: Severity.Error,
							message: failure.guidance ? `${failure.message} — ${failure.guidance}` : failure.message,
							source: product.title,
							sticky: true,
						});
					};
					cover?.onRemoved(sayRetried);
					keyboardStore.add(toDisposable(() => { retried?.notice?.close(); retried = undefined; }));
					keyboardStore.add(toDisposable(mount.startup.subscribe(failure => {
						// A failure the editor retries is a note under the splash; only a refusal fails the cover.
						startupRefused = failure !== null && !failure.transient;
						if (retried && retried.failure.message !== (failure?.transient ? failure.message : undefined)) {
							retried.notice?.close();
							retried = undefined;
						}
						if (!failure) { cover?.note(null); return; }
						if (failure.transient) {
							cover?.note(failure.message);
							retried ??= { failure };
							sayRetried();
							return;
						}
						// A refusal is not a wait: the open's wait ends where the cover says why.
						opening.done();
						cover?.fail(localize('volterStartupRefused', "{0} did not open.\n\n{1}", product.title, startupRefusalText(failure)));
					})));
					// The page's waits (`@volter/sdk/progress`), each where Code-OSS shows progress.
					keyboardStore.add(instantiationService.createInstance(VolterProgress, mount.progress,
						{ outliner: VolterOutlinerView.ID, properties: VolterPropertiesView.ID }));
					// Register the editor's recorded history with the native undo service.
					keyboardStore.add(instantiationService.createInstance(VolterHistory, mount.history));
					// Install the workbench file provider over its IFileService and ITextFileService so editor writes use
					// native working copies and history. Until installed, the door uses session transports.
					keyboardStore.add(instantiationService.createInstance(VolterFiles, mount.files));
					// Register the page's live action table with CommandsRegistry and MenuId.CommandPalette so actions
					// appear in the native palette.
					keyboardStore.add(instantiationService.createInstance(VolterCommands, mount.commands));
					// Register workspace utilities as native panel views. The panel owns their tab strip and toggle;
					// native view movement can place them in sidebars or other groups.
					keyboardStore.add(new VolterUtilityViews(mount.utilities));
					// Workspace commands use the native views service and Zen Mode. Installing the handler drains
					// calls queued while those services were unavailable.
					keyboardStore.add(instantiationService.createInstance(VolterWorkspaceHost, mount.workspace,
						{ hierarchyView: VolterOutlinerView.ID, inspectorView: VolterPropertiesView.ID },
						(level: 'warn' | 'error', message: string) => mount.keyboard.report(level, message)));
					// Add one IStatusbarService entry per declared status-bar item, the editor's own and each package's, with
					// native alignment, priority, visibility and context-menu controls. Each entry offers its element to the page.
					keyboardStore.add(instantiationService.createInstance(VolterStatus, mount.status));
					// Install IConfigurationService as the settings provider. Adapter-declared values populate its
					// memory target unless the workspace provides them, and configuration changes re-evaluate that layer.

					keyboardStore.add(instantiationService.createInstance(VolterSettings, mount.settings));
					// AND WHATEVER THE PRODUCT INSTALLS. The ids are
					// PASSED, so a product never becomes a second author of an id this file spells.
					product.mount?.(productContext(mount));
					// Install document containers before VolterDocuments creates area groups. Native inputs represent
					// every open document. Construct the document bridge last because it replaces the bootstrap input
					// after the page has published real content.
					const documentsBridge = mount.documents;
					installDocumentViewSink((view, closed) => documentsBridge.setView(view, closed));
					keyboardStore.add(instantiationService.createInstance(VolterDocumentViews));
					opening.update(localize('volterStepRestore', "Restoring the project's workspace"));
					await documentsBridge.whenRestored();
					keyboardStore.add(instantiationService.createInstance(VolterDocuments, mount.documents));
					keyboardStore.add(instantiationService.createInstance(VolterTools, mount.tools));
					keyboardStore.add(instantiationService.createInstance(VolterThemes, mount.themes));
					return mount;
				})();
				// THE SHARED PROMISE'S OWN RESET, and nothing more. The `await mounted` below is
				// inside this invocation's try, so the refusal is REPORTED there — once, by the
				// one handler that also brings the cover down. This exists so a rejection no
				// one is awaiting is still handled and the next invocation builds a fresh mount.
				mounted.catch(() => { mounted = undefined; });
			}
			const mount = await mounted;
			// Wait for the product's ready promise after mounting. The assembled editor may still be loading its
			// first document; the product owns that wait and its refusal message, and the open's wait says
			// where to look when nothing opens.
			opening.update(localize('volterStepReady', "Waiting for a document to open. `{0} status` says what the editor is doing", product.command));
			await product.ready?.(productContext(mount));
			opening.done();
			// THE EDITOR IS THERE. The cover comes down whole, at the end of the whole open —
			// the bridge mounted, every door is installed, the documents are the group's
			// editors and the product says it is open — rather than at `mountVolter`, so nobody
			// watches the assembly finish.
			cover?.remove();
		} catch (error) {
			// THE OPEN DID NOT HAPPEN. The auto-open contribution swallows this command's throw on
			// purpose (the workbench's own notifications are the channel), so the cover is what
			// says it, in the words of whichever step refused, with a way out underneath.
			opening.done();
			const message = error instanceof Error ? error.message : String(error);
			// The editor's own startup reason, when one stands, is the better sentence (a
			// product's `ready` timing out behind it is a consequence, not the cause).
			if (!startupRefused) { cover?.fail(localize('volterDidNotOpen', "{0} did not open.\n\n{1}", product.title, message)); }
			notifications.error(`volter did not mount: ${message}`);
		}
	}
});

// ---- AN AUXILIARY WINDOW IS NEVER A SECOND TAB, so the volter pane is MAIN-WINDOW ONLY.
//

// Block auxiliary-window moves for Volter editors because their handed-over parts, React portals
// and session bootstrap belong to the main window. Register shadow handlers after the native
// commands; delegate to the original handler for other editors while retaining titles and bindings.

for (const { id, wholeGroup } of [
	{ id: MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, wholeGroup: false },
	{ id: COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, wholeGroup: false },
	{ id: MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, wholeGroup: true },
	{ id: COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, wholeGroup: true },
]) {
	const original = CommandsRegistry.getCommand(id);
	// Upstream renamed or dropped the command: there is nothing to guard and nothing of ours
	// to break. The gate that catches it is the fork gate's `git apply --3way`, not a throw here.
	if (!original) { continue; }
	CommandsRegistry.registerCommand({
		id,
		handler: (accessor: ServicesAccessor, ...args: unknown[]) => {
			const editorService = accessor.get(IEditorService);
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const listService = accessor.get(IListService);
			const notifications = accessor.get(INotificationService);
			const editors = wholeGroup
				? [...editorGroupsService.activeGroup.editors]
				: resolveCommandsContext(args, editorService, editorGroupsService, listService).groupedEditors.flatMap(entry => entry.editors);
			if (editors.some(editor => editor instanceof VolterDocumentInput)) {
				notifications.warn(localize('volterNoAuxWindow', "The volter Model document stays in this window. Its parts and the React portals into them live here, so an auxiliary window would show an empty pane and this window would lose the document; the auxiliary window is also not one of the Volter session's tabs. Split it beside another editor instead."));
				return;
			}
			return original.handler(accessor, ...args);
		},
	});
}

/**
 * Open project folders as the editor automatically when volter.project.json is present. Other
 * folders remain ordinary workbench workspaces. Run the mount command through its workspace-trust
 * gate. Activate at Restored, when the target parts exist, so the product mounts with the workbench.
 */
class VolterProjectAutoOpen implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.volterProjectAutoOpen';

	constructor(
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IFileService fileService: IFileService,
		@ICommandService commandService: ICommandService,
		@INotificationService notifications: INotificationService,
	) {
		const folder = workspaceService.getWorkspace().folders[0]?.uri;
		if (!folder) { return; }
		(async () => {
			if (!await fileService.exists(joinPath(folder, 'volter.project.json'))) {
				// NOT A Volter PROJECT, so nothing of ours is coming and the product's cover has
				// nothing to cover. This contribution is the one that decides that, so it is
				// the one that takes the cover away — the alternative is a second reader of
				// `volter.project.json`, and a cover with no owner left over a bare workbench.
				cover?.remove();
				return;
			}
			await commandService.executeCommand('volter.workspace.open');
		})().catch((error: unknown) => {
			// The command reports its own refusals through the workbench's notifications and
			// through the cover. What reaches here escaped it (a throw before its own try, the
			// trust prompt itself failing). It says why, on the cover and in the tray, rather than
			// leaving a bare workbench on a project.
			const message = error instanceof Error ? error.message : String(error);
			cover?.fail(localize('volterAutoOpenFailed', "{0} did not open.\n\n{1}", product?.title ?? 'Volter', message));
			notifications.error(`volter did not open this project: ${message}`);
		});
	}
}

registerWorkbenchContribution2(
	VolterKeyboardCommands.ID,
	VolterKeyboardCommands,
	WorkbenchPhase.BlockRestore,
);

registerWorkbenchContribution2(
	VolterEditorTools.ID,
	VolterEditorTools,
	WorkbenchPhase.BlockRestore,
);

registerWorkbenchContribution2(
	VolterProjectAutoOpen.ID,
	VolterProjectAutoOpen,
	WorkbenchPhase.AfterRestored,
);

/** Connect the tab and show the product cover at BlockRestore, once the workspace folder is known. This
 * starts the asynchronous bootstrap before mount and trust waits, without blocking restoration. */
class VolterSessionTab implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.volterSessionTab';

	constructor(
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService workspaceTrust: IWorkspaceTrustManagementService,
	) {
		const folder = workspaceService.getWorkspace().folders[0]?.uri;
		if (!folder) { return; }
		cover = raiseOpeningCover(basename(folder));
		connectSessionTab(workspaceTrust).catch(() => {
			// NOT HERE, and not silently. For a folder that is not a project the cover goes, by
			// `VolterProjectAutoOpen`, the one reader of `volter.project.json`. For a PROJECT,
			// removing it here would hide the reason the open's own retry refuses with. So the
			// cover stays up — below the modal layers,
			// so VS Code's trust prompt is still readable and clickable over it — and the open
			// fails it with the reason and the command that starts a session.
		});
	}
}

registerWorkbenchContribution2(
	VolterSessionTab.ID,
	VolterSessionTab,
	WorkbenchPhase.BlockRestore,
);
