/** The status bar's Volter items are native `IStatusbarService` entries, added from their declarations: the editor's own
 * (`volterEditorStatus.ts`) and each package's `contributes.volter.views.statusbar` entry, read by the `volter` extension
 * point (`volterExtensions.ts`) before any of the package's code loads.
 *
 * Code-OSS's own `contributes.statusBarItems` is not used: it is the proposed API `contribStatusBarItems`, granted per
 * extension id (`product.json#extensionEnabledApiProposals`, `extensionsProposedApi.ts`), and its item is text, a
 * tooltip and a command (`api/browser/statusBarExtensionPoint.ts`, `IExtensionStatusBarItemService.setOrUpdateEntry`).
 * A Volter item is page-rendered, so it is added as a workbench built-in with its own rendering adds one, with
 * `IStatusbarEntry.content`, an `HTMLElement` (`services/statusbar/browser/statusbar.ts`), as
 * `contrib/editTelemetry`'s `AiStatsStatusBar` does.
 *
 * Each entry offers its element to the page, which portals the item's renderer into it once one is registered under
 * the item's id: at mount for the editor's own, when its package activates for a package's. VolterStatusBridge mirrors
 * bridge.tsx's VolterStatusHandle; the workbench half imports no page modules. */

import { $ } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { VOLTER_EDITOR_STATUS_ITEMS } from './volterEditorStatus.js';
import { onDidChangeVolterContributions, volterStatusItems } from './volterExtensions.js';

export interface VolterStatusBridge {
	/** The element the workbench draws the item `itemId` in; `null` when its entry goes away. */
	offerBody(itemId: string, element: HTMLElement | null): void;
}

export class VolterStatus extends Disposable {

	private readonly generation = this._register(new DisposableStore());
	private published = '';

	constructor(
		private readonly bridge: VolterStatusBridge,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();
		this._register(toDisposable(onDidChangeVolterContributions(() => this.publish())));
		this.publish();
	}

	private publish(): void {
		// A package's item is keyed by its package, as Code-OSS keys an extension's item by its extension
		// (`asStatusBarItemIdentifier`); the page registers its renderer under the same key (`tool-loader.ts`).
		const items = [
			...VOLTER_EDITOR_STATUS_ITEMS,
			...volterStatusItems().map(item => ({ ...item, id: `${item.package}.${item.id}` })),
		];
		// A NO-OP IS SILENT: the extension point re-reads every package on any change, and re-adding unchanged entries
		// makes the bar flicker.
		const signature = items.map(item => `${item.id}\u0000${item.name}\u0000${item.alignment}\u0000${item.priority}`).join('\u0001');
		if (signature === this.published) { return; }
		this.generation.clear();
		this.published = signature;
		for (const item of items) {
			const element = $('.volter-status-item');
			element.style.cssText = 'display:flex;align-items:center;height:100%;';
			const accessor = this.statusbarService.addEntry({
				name: item.name,
				text: '',
				ariaLabel: item.name,
				content: element,
			}, `volter.status.${item.id}`, item.alignment === 'right' ? StatusbarAlignment.RIGHT : StatusbarAlignment.LEFT, item.priority);
			this.generation.add(toDisposable(() => { this.bridge.offerBody(item.id, null); accessor.dispose(); }));
			this.bridge.offerBody(item.id, element);
		}
	}
}
