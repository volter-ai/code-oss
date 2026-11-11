/*---------------------------------------------------------------------------------------------
 *  THE EDITOR'S SEMANTIC WORKSPACE COMMANDS, ANSWERED BY THE WORKBENCH.
 *
 *  `@volter/sdk/workspace-host-commands` is the editor's imperative boundary: "reveal the
 *  Console", "focus the hierarchy", "toggle focus mode". Callers name a capability, never a
 *  location, and a call made before a host installs its answers waits for one. Under the frame
 *  the host is this file, and the answers are the workbench's own verbs:
 *
 *    * a utility is the view `volterUtilityViews.ts` registered for it (`volter.utility.<id>` in
 *      its panel container), opened, closed and read through `IViewsService`;
 *    * a static panel is a native view: the hierarchy and inspector are the kit's outliner and
 *      properties views (their ids PASSED by `volter.contribution.ts`, never spelled here), and
 *      `agent` is Chat's view;
 *    * focus mode is the workbench's Zen Mode, which owns its own visibility snapshot and
 *      restoration.
 *
 *  A view that is not there (a utility whose availability gate is closed, a product layout
 *  without that native view) is said in the editor's own console through `report`, so a menu
 *  item never does nothing silently.
 *
 *  Nothing under `src/vs/` imports an editor module: what arrives is `VolterWorkspaceBridge`,
 *  whose counterpart is `bridge.tsx`'s `VolterWorkspaceHandle`. The bridge installs these
 *  answers with `installWorkspaceHostCommands` in the page's own module graph, and records the
 *  static panel this file reports as shown with `setActiveWorkspaceStaticPanel`.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatViewId } from '../../chat/browser/chat.js';
import { viewIdFor } from './volterUtilityViews.js';

/** The editor's semantic workspace vocabulary, as the frame answers it. */
export interface VolterWorkspaceCommands {
	showUtility(id: string): void;
	toggleUtility(id: string): void;
	/** Resolves whether the panel's view is now shown; the bridge records the answer. */
	showStaticPanel(kind: string): Promise<boolean>;
	toggleFocus(): void;
}

export interface VolterWorkspaceBridge {
	/** Install the frame's answers (null uninstalls). */
	setCommands(commands: VolterWorkspaceCommands | null): void;
}

export class VolterWorkspaceHost extends Disposable {

	constructor(
		bridge: VolterWorkspaceBridge,
		/** The kit's own view ids, passed by the contribution that registers them. */
		private readonly ids: { readonly hierarchyView: string; readonly inspectorView: string },
		/** The editor's console, where the editor's `console` command reads it. */
		private readonly report: (level: 'warn' | 'error', message: string) => void,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();
		bridge.setCommands({
			showUtility: id => void this.openUtility(id),
			toggleUtility: id => void this.toggleUtility(id),
			showStaticPanel: kind => this.showStaticPanel(kind),
			toggleFocus: () => this.layoutService.toggleZenMode(),
		});
		this._register({ dispose: () => bridge.setCommands(null) });
	}

	private async openUtility(id: string): Promise<void> {
		const view = await this.viewsService.openView(viewIdFor(id), true);
		if (!view) { this.report('warn', localize('volterUtilityMissing', "The “{0}” utility has no view in this window, so it could not be opened: its availability gate is closed, or the editor has not published its views yet.", id)); }
	}

	private async toggleUtility(id: string): Promise<void> {
		const viewId = viewIdFor(id);
		if (this.viewsService.isViewVisible(viewId)) { this.viewsService.closeView(viewId); return; }
		await this.openUtility(id);
	}

	private async showStaticPanel(kind: string): Promise<boolean> {
		const viewId = kind === 'hierarchy' ? this.ids.hierarchyView : kind === 'inspector' ? this.ids.inspectorView : kind === 'agent' ? ChatViewId : null;
		const view = viewId ? await this.viewsService.openView(viewId, true) : null;
		if (!view) { this.report('warn', localize('volterStaticPanelMissing', "The “{0}” panel has no view in this window, so it could not be focused.", kind)); }
		return view !== null;
	}
}
