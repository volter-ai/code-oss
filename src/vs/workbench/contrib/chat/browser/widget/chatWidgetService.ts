/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ACTIVE_GROUP, IEditorService, type PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService, isEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidget, IChatWidgetService, IQuickChatService, isIChatViewViewContext } from '../chat.js';
import { ChatEditor, IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { ChatViewPane } from '../widgetHosts/viewPane/chatViewPane.js';
import { HarnessChatNavigationPermit, IHarnessChatNavigationService } from '../volterHarness/volterChatNavigation.js';

export class ChatWidgetService extends Disposable implements IChatWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: IChatWidget[] = [];
	private harnessOpenGeneration = 0;
	private harnessUntitledOpening: (() => boolean) | undefined;
	private cancelHarnessUntitledOpening: (() => void) | undefined;
	private _lastFocusedWidget: IChatWidget | undefined = undefined;

	private readonly _onDidAddWidget = this._register(new Emitter<IChatWidget>());
	readonly onDidAddWidget = this._onDidAddWidget.event;

	private readonly _onDidRemoveWidget = this._register(new Emitter<IChatWidget>());
	readonly onDidRemoveWidget = this._onDidRemoveWidget.event;

	private readonly _onDidChangeWidgetVisibility = this._register(new Emitter<IChatWidget>());
	readonly onDidChangeWidgetVisibility = this._onDidChangeWidgetVisibility.event;

	private readonly _onDidBackgroundSession = this._register(new Emitter<URI>());
	readonly onDidBackgroundSession = this._onDidBackgroundSession.event;

	private readonly _onDidChangeFocusedWidget = this._register(new Emitter<IChatWidget | undefined>());
	readonly onDidChangeFocusedWidget = this._onDidChangeFocusedWidget.event;

	private readonly _onDidChangeFocusedSession = this._register(new Emitter<void>());
	readonly onDidChangeFocusedSession = this._onDidChangeFocusedSession.event;

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IViewsService private readonly viewsService: IViewsService,
		@IQuickChatService private readonly quickChatService: IQuickChatService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatService private readonly chatService: IChatService,
		@ILogService private readonly logService: ILogService,
		@IHarnessChatNavigationService private readonly harnessNavigation: IHarnessChatNavigationService,
	) {
		super();
	}

	get lastFocusedWidget(): IChatWidget | undefined {
		return this._lastFocusedWidget;
	}

	getAllWidgets(): ReadonlyArray<IChatWidget> {
		return this._widgets;
	}

	getWidgetsByLocations(location: ChatAgentLocation): ReadonlyArray<IChatWidget> {
		return this._widgets.filter(w => w.location === location);
	}

	getWidgetByInputUri(uri: URI): IChatWidget | undefined {
		return this._widgets.find(w => isEqual(w.input.inputUri, uri));
	}

	getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined {
		return this._widgets.find(w => isEqual(w.viewModel?.sessionResource, sessionResource));
	}

	async revealWidget(preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		const last = this.lastFocusedWidget;
		if (last && await this.reveal(last, preserveFocus)) {
			return last;
		}

		return (await this.viewsService.openView<ChatViewPane>(ChatViewId, !preserveFocus))?.widget;
	}

	async reveal(widget: IChatWidget, preserveFocus?: boolean): Promise<boolean> {
		const resource = widget.viewModel?.sessionResource;
		return resource ? this.harnessNavigation.run(resource, async permit => {
			const revealed = await this.revealAfterGuard(widget, preserveFocus, permit);
			if (permit && (!revealed || !this._widgets.includes(widget) || widget.viewModel?.sessionResource.toString() !== resource.toString())) {
				throw new Error('The requested conversation was not revealed by native Chat.');
			}
			return revealed;
		}, undefined,
			() => this._widgets.includes(widget) && widget.viewModel?.sessionResource.toString() === resource.toString()) : this.revealAfterGuard(widget, preserveFocus);
	}

	private async revealAfterGuard(widget: IChatWidget, preserveFocus?: boolean, permit?: HarnessChatNavigationPermit): Promise<boolean> {
		if (widget.viewModel?.sessionResource) {
			const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(widget.viewModel.sessionResource, { preserveFocus, harnessNavigationPermit: permit });
			if (alreadyOpenWidget) {
				return true;
			}
		}

		if (isIChatViewViewContext(widget.viewContext)) {
			const view = await this.viewsService.openView(widget.viewContext.viewId, !preserveFocus);
			if (!preserveFocus) {
				view?.focus();
			}
			return !!view;
		}

		return false;
	}

	/**
	 * Reveal the session if already open, otherwise open it.
	 */
	openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;
	openSession(sessionResource: URI, target?: PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;
	async openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget | PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		this.cancelHarnessUntitledOpening?.();
		const generation = ++this.harnessOpenGeneration;
		const untitledSidebar = sessionResource.scheme === 'supercode' && sessionResource.path.startsWith('/untitled-')
			&& (target === ChatViewPaneTarget || typeof target === 'undefined') && !this.getWidgetBySessionResource(sessionResource);
		const focused = this.lastFocusedWidget;
		const focusedResource = focused?.viewModel?.sessionResource.toString();
		let bindingWidget: IChatWidget | undefined;
		let focusing = false;
		let unchanged = true;
		const cancellation = untitledSidebar ? new CancellationTokenSource() : undefined;
		const invalidate = () => { unchanged = false; cancellation?.cancel(); };
		const isCurrent = () => unchanged && generation === this.harnessOpenGeneration
			&& (!bindingWidget || this._widgets.includes(bindingWidget));
		if (untitledSidebar) { this.harnessUntitledOpening = isCurrent; this.cancelHarnessUntitledOpening = invalidate; }
		const focusListeners: IDisposable[] = [];
		const observeFocus = (widget: IChatWidget) => focusListeners.push(widget.onDidFocus(() => {
			if (!focusing || widget !== bindingWidget || widget.viewModel?.sessionResource.toString() !== sessionResource.toString()) { invalidate(); }
		}));
		if (untitledSidebar) {
			this._widgets.forEach(observeFocus);
			focusListeners.push(this.editorService.onDidActiveEditorChange(invalidate), this.editorGroupsService.onDidChangeActiveGroup(invalidate));
			focusListeners.push(this.onDidRemoveWidget(widget => { if (widget === bindingWidget) { invalidate(); } }));
		}
		const added = untitledSidebar ? this.onDidAddWidget(widget => {
			if (isIChatViewViewContext(widget.viewContext) && widget.viewContext.viewId === ChatViewId) { bindingWidget = widget; }
			observeFocus(widget);
		}) : undefined;
		const listener = untitledSidebar ? this.onDidChangeFocusedSession(() => {
			const widget = this.lastFocusedWidget;
			const key = widget?.viewModel?.sessionResource.toString();
			// The original focus may stay put, or its own load may bind the target.
			// Any other selection invalidates this opening permanently.
			if (widget === focused && key === focusedResource) { return; }
			if (bindingWidget && widget === bindingWidget && key === sessionResource.toString()) { return; }
			invalidate();
		}) : undefined;
		try {
			return await this.harnessNavigation.run(sessionResource, async permit => {
				const opening = untitledSidebar ? { isCurrent, token: cancellation!.token,
					willBind: (widget: IChatWidget) => { bindingWidget = widget; }, willFocus: () => { focusing = true; } } : undefined;
				const widget = await this.openSessionAfterGuard(sessionResource, target, options, permit, opening);
				if (untitledSidebar && !isCurrent()) { throw new CancellationError(); }
				if ((permit || untitledSidebar) && widget?.viewModel?.sessionResource.toString() !== sessionResource.toString()) {
					throw new Error('The requested conversation was not selected by native Chat.');
				}
				return widget;
			}, options?.harnessNavigationPermit, untitledSidebar ? isCurrent : undefined);
		} finally {
			listener?.dispose(); added?.dispose(); focusListeners.forEach(listener => listener.dispose()); cancellation?.dispose();
			if (this.harnessUntitledOpening === isCurrent) { this.harnessUntitledOpening = undefined; this.cancelHarnessUntitledOpening = undefined; }
		}
	}

	private async openSessionAfterGuard(sessionResource: URI, target?: typeof ChatViewPaneTarget | PreferredGroup, options?: IChatEditorOptions, permit?: HarnessChatNavigationPermit, opening?: { isCurrent: () => boolean; token: CancellationTokenSource['token']; willBind: (widget: IChatWidget) => void; willFocus: () => void }): Promise<IChatWidget | undefined> {
		if (permit) { options = { ...options, harnessNavigationPermit: permit }; }
		const t0 = Date.now();
		const targetKind = target === ChatViewPaneTarget ? 'view' : (typeof target === 'undefined' ? 'undefined' : 'editor');
		this.logService.trace(`[ChatWidgetService] openSession start uri=${sessionResource.toString()} target=${targetKind}`);

		// Reveal if already open unless instructed otherwise
		if (typeof target === 'undefined' || options?.revealIfOpened) {
			const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(sessionResource, options);
			if (alreadyOpenWidget) {
				this.logService.trace(`[ChatWidgetService] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} path=reveal`);
				return alreadyOpenWidget;
			}
		} else {
			await this.prepareSessionForMove(sessionResource, target);
		}

		// Load this session in chat view (preferred)
		if (target === ChatViewPaneTarget || typeof target === 'undefined') {
			// A harness draft owns its requested URI before this awaited open. Do not
			// publish the outgoing sidebar's focus before binding that URI.
			const chatView = await this.viewsService.openView<ChatViewPane>(ChatViewId, sessionResource.scheme === 'supercode' ? false : !options?.preserveFocus);
			if (chatView) {
				if (opening && !opening.isCurrent()) { throw new CancellationError(); }
				opening?.willBind(chatView.widget);
				await chatView.loadSession(sessionResource, options?.sessionTypeSelectionReason, permit, opening?.token);
				if (sessionResource.scheme === 'supercode' && chatView.widget?.viewModel?.sessionResource.toString() !== sessionResource.toString()) {
					throw new Error('The requested conversation was not bound by the native Chat view.');
				}
				if (opening && !opening.isCurrent()) { throw new CancellationError(); }
				if (!options?.preserveFocus) {
					opening?.willFocus();
					chatView.focusInput();
				}
			}
			this.logService.trace(`[ChatWidgetService] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} path=view`);
			return chatView?.widget;
		}

		// Open in chat editor
		const pane = await this.editorService.openEditor({
			resource: sessionResource,
			options: {
				...options,
				revealIfOpened: options?.revealIfOpened ?? true // always try to reveal if already opened unless explicitly told not to
			}
		}, target);
		this.logService.trace(`[ChatWidgetService] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} path=editor`);
		return pane instanceof ChatEditor ? pane.widget : undefined;
	}

	private async revealSessionIfAlreadyOpen(sessionResource: URI, options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		// Already open in chat view?
		const chatView = this.viewsService.getViewWithId<ChatViewPane>(ChatViewId);
		if (chatView?.widget.viewModel?.sessionResource && isEqual(chatView.widget.viewModel.sessionResource, sessionResource)) {
			const view = await this.viewsService.openView(ChatViewId, !options?.preserveFocus);
			if (!options?.preserveFocus) {
				view?.focus();
			}
			return chatView.widget;
		}

		// Already open in an editor?
		const existingEditor = this.findExistingChatEditorByUri(sessionResource);
		if (existingEditor) {
			const existingEditorWindowId = existingEditor.group.windowId;

			// focus transfer to other documents is async. If we depend on the focus
			// being synchronously transferred in consuming code, this can fail, so
			// wait for it to propagate
			const isGroupActive = () => dom.getWindow(this.layoutService.activeContainer).vscodeWindowId === existingEditorWindowId;

			let ensureFocusTransfer: Promise<void> | undefined;
			if (!isGroupActive() && !options?.preserveFocus) {
				ensureFocusTransfer = Event.toPromise(Event.once(Event.filter(this.layoutService.onDidChangeActiveContainer, isGroupActive)));
			}

			const pane = await existingEditor.group.openEditor(existingEditor.editor, options);
			await ensureFocusTransfer;
			return pane instanceof ChatEditor ? pane.widget : undefined;
		}

		// Already open in quick chat?
		if (isEqual(sessionResource, this.quickChatService.sessionResource)) {
			this.quickChatService.focus();
			return undefined;
		}

		return undefined;
	}

	private async prepareSessionForMove(sessionResource: URI, target: typeof ChatViewPaneTarget | PreferredGroup | undefined): Promise<void> {
		const existingWidget = this.getWidgetBySessionResource(sessionResource);
		if (existingWidget) {
			const existingEditor = isIChatViewViewContext(existingWidget.viewContext) ?
				undefined :
				this.findExistingChatEditorByUri(sessionResource);

			if (isIChatViewViewContext(existingWidget.viewContext) && target === ChatViewPaneTarget) {
				return;
			}

			if (!isIChatViewViewContext(existingWidget.viewContext) && target !== ChatViewPaneTarget && existingEditor && this.isSameEditorTarget(existingEditor.group.id, target)) {
				return;
			}

			if (existingEditor) {
				// widget.clear() on an editor leaves behind an empty chat editor
				await this.editorService.closeEditor({ editor: existingEditor.editor, groupId: existingEditor.group.id }, { preserveFocus: true });
			} else {
				await existingWidget.clear();
			}
		}
	}

	private findExistingChatEditorByUri(sessionUri: URI): { editor: ChatEditorInput; group: IEditorGroup } | undefined {
		for (const group of this.editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor instanceof ChatEditorInput && isEqual(editor.sessionResource, sessionUri)) {
					return { editor, group };
				}
			}
		}
		return undefined;
	}

	private isSameEditorTarget(currentGroupId: number, target?: PreferredGroup): boolean {
		return typeof target === 'number' && target === currentGroupId ||
			target === ACTIVE_GROUP && this.editorGroupsService.activeGroup?.id === currentGroupId ||
			isEditorGroup(target) && target.id === currentGroupId;
	}

	private setLastFocusedWidget(widget: IChatWidget | undefined): void {
		if (widget === this._lastFocusedWidget) {
			return;
		}

		this._lastFocusedWidget = widget;
		this._onDidChangeFocusedWidget.fire(widget);
		this._onDidChangeFocusedSession.fire();
	}

	register(newWidget: IChatWidget): IDisposable {
		if (this._widgets.some(widget => widget === newWidget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		this._widgets.push(newWidget);
		this._onDidAddWidget.fire(newWidget);

		// An unfocused sidebar created by this current draft open is not a focus
		// gesture. Its requested focus will be published after target binding.
		if (!this._lastFocusedWidget && !(this.harnessUntitledOpening?.()
			&& isIChatViewViewContext(newWidget.viewContext) && newWidget.viewContext.viewId === ChatViewId)) {
			this.setLastFocusedWidget(newWidget);
		}

		return combinedDisposable(
			newWidget.onDidFocus(() => this.setLastFocusedWidget(newWidget)),
			newWidget.onDidShow(() => this._onDidChangeWidgetVisibility.fire(newWidget)),
			newWidget.onDidHide(() => this._onDidChangeWidgetVisibility.fire(newWidget)),
			newWidget.onDidChangeViewModel(({ previousSessionResource, currentSessionResource }) => {
				if (this._lastFocusedWidget === newWidget && !isEqual(previousSessionResource, currentSessionResource)) {
					this._onDidChangeFocusedSession.fire();
				}

				if (!previousSessionResource || (currentSessionResource && isEqual(previousSessionResource, currentSessionResource))) {
					return;
				}

				// Timeout to ensure it wasn't just moving somewhere else
				void timeout(200).then(() => {
					if (!this.getWidgetBySessionResource(previousSessionResource) && this.chatService.getSession(previousSessionResource)) {
						this._onDidBackgroundSession.fire(previousSessionResource);
					}
				});
			}),
			toDisposable(() => {
				this._widgets.splice(this._widgets.indexOf(newWidget), 1);
				if (this._lastFocusedWidget === newWidget) {
					this.setLastFocusedWidget(undefined);
				}
				this._onDidRemoveWidget.fire(newWidget);
			})
		);
	}
}
