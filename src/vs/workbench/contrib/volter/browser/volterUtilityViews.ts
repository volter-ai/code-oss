/** Workspace utilities are native Code-OSS panel views, with the panel's tab strip,
 * toggle and view movement. Their set comes from the open project's live registry and
 * manifest declarations (contributes.volter.views.panel). Declared utilities register
 * before package code loads; showing a view activates its package with onView:<id>.
 *
 * Each view offers its body element to the page, which portals the utility's React
 * content into it. VolterUtilitiesBridge mirrors bridge.tsx's VolterUtilitiesHandle;
 * the workbench half imports no page modules. */

import { $ } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewDescriptor, IViewDescriptorService, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { viewBackgroundFor } from './volterColors.js';
import { onDidChangeVolterContributions, volterUtilities } from './volterExtensions.js';

export interface VolterUtility {
	readonly id: string;
	readonly title: string;
	readonly order: number;
}

export interface VolterUtilitiesBridge {
	/** Every available `workspace.utility`, right now, in tab order. */
	list(): readonly VolterUtility[];
	/** Fires when the registry or an availability gate changes the set. */
	subscribe(listener: () => void): () => void;
	/** A view's body element, as the workbench renders it; `null` when the view goes away. */
	offerBody(utilityId: string, element: HTMLElement | null): void;
}

/** `console` → `volter.utility.console`. The view id is what the workbench persists a layout
 *  against, so it is derived from the utility's own stable id and never from its title. */
export function viewIdFor(utilityId: string): string {
	return `volter.utility.${utilityId}`;
}
function utilityIdFor(viewId: string): string {
	return viewId.slice('volter.utility.'.length);
}

/** The live bridge, so a view pane — which the workbench constructs, not us — can reach it. */
let liveBridge: VolterUtilitiesBridge | undefined;

class VolterUtilityView extends ViewPane {
	private hostBody: HTMLElement | undefined;
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
		// Make handed-over parts focusable and transfer focus on pointer down so native keybinding context
		// follows the clicked part.
		this.hostBody.tabIndex = -1;
		this.hostBody.addEventListener('pointerdown', () => this.hostBody?.focus({ preventScroll: true }));
		container.appendChild(this.hostBody);
		// Use the view's own theme colour; an unset colour leaves its stylesheet visible.
		// Unset by every theme but ours, so Classic paints nothing here and our panel's own
		// stylesheet is what shows — which is what "Classic is our panels with no look" means.
		this._register(this.themeService.onDidColorThemeChange(() => this.applyBackground()));
		this.applyBackground();
		liveBridge?.offerBody(utilityIdFor(this.id), this.hostBody);
		this._register(toDisposable(() => liveBridge?.offerBody(utilityIdFor(this.id), null)));
	}
	private applyBackground(): void {
		if (!this.hostBody) { return; }
		const color = viewBackgroundFor(this.themeService.getColorTheme(), utilityIdFor(this.id));
		this.hostBody.style.background = color ? color.toString() : '';
	}
	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.hostBody) { this.hostBody.style.height = `${height}px`; this.hostBody.style.width = `${width}px`; }
	}
	override focus(): void {
		if (this.hostBody) { this.hostBody.focus({ preventScroll: true }); } else { super.focus(); }
	}
}

export class VolterUtilityViews extends Disposable {

	private readonly registrations = new Map<string, DisposableStore>();

	constructor(private readonly bridge: VolterUtilitiesBridge) {
		super();
		liveBridge = bridge;
		this._register(toDisposable(() => { if (liveBridge === bridge) { liveBridge = undefined; } }));
		this._register(toDisposable(bridge.subscribe(() => this.publish())));
		this._register(toDisposable(onDidChangeVolterContributions(() => this.publish())));
		this._register(toDisposable(() => { for (const registration of this.registrations.values()) { registration.dispose(); } this.registrations.clear(); }));
		this.publish();
	}

	private publish(): void {
		const listed = this.bridge.list();
		// The page registers a package's utility under `tool:<id>` (`tool-loader.ts`); one declared and not yet mounted
		// takes its place after the listed ones.
		const declared = volterUtilities()
			.map((utility, index) => ({ id: `tool:${utility.id}`, title: utility.title, order: listed.length + index }))
			.filter(utility => !listed.some(other => other.id === utility.id));
		const utilities = [...listed, ...declared];
		const present = new Set(utilities.map(utility => utility.id));
		for (const [id, registration] of this.registrations) {
			if (!present.has(id)) { registration.dispose(); this.registrations.delete(id); }
		}
		const containers = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const views = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		for (const utility of utilities) {
			if (this.registrations.has(utility.id)) { continue; }
			const id = `workbench.view.${viewIdFor(utility.id)}`;
			const container = containers.registerViewContainer({
				id, title: { value: utility.title, original: utility.title }, icon: Codicon.tools,
				order: utility.order, hideIfEmpty: true,
				ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [id, { mergeViewWithContainerWhenSingleView: true }]),
			}, ViewContainerLocation.Panel);
			const descriptors: IViewDescriptor[] = [{
				id: viewIdFor(utility.id), name: { value: utility.title, original: utility.title },
				ctorDescriptor: new SyncDescriptor(VolterUtilityView), canToggleVisibility: true,
				canMoveView: true, order: utility.order,
			}];
			views.registerViews(descriptors, container);
			const store = new DisposableStore();
			store.add(toDisposable(() => {
				views.deregisterViews(descriptors, container);
				containers.deregisterViewContainer(container);
			}));
			this.registrations.set(utility.id, store);
		}
	}
}
