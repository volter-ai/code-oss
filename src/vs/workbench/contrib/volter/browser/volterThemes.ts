/*---------------------------------------------------------------------------------------------
 *  THE PAGE'S PALETTE IS THE ACTIVE COLOUR THEME'S — docs/adr/looks-one-model.md.
 *
 *  Every palette role is a registered colour (`volterGeneratedColors.ts`), which a colour theme
 *  sets and every theme kind defaults. This hands the page the active theme's value for each,
 *  so the page and the workbench wear one value, and chooses a theme as the editor's settings land
 *  a choice: where it wins (`settings-store.ts` `targetFor`). A person's `workbench.colorCustomizations` reach the page with no step of ours.
 *
 *  Nothing under `src/vs/` imports an editor module: what arrives is the themes bridge.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchColorTheme, IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { VOLTER_PALETTE_COLOR_IDS } from './volterGeneratedColors.js';

/** The page's half (`bridge.tsx`'s `VolterThemesHandle`). */
export interface VolterThemesBridge {
	setProvider(provider: {
		active(): { readonly id: string; readonly colors: Readonly<Record<string, string>> };
		ids(): readonly string[];
		choose(id: string): void;
		onDidChange(listener: () => void): () => void;
	} | null): void;
}

export class VolterThemes extends Disposable {

	private readonly changed = this._register(new Emitter<void>());
	/** The colour themes this window has, by the id a person's setting names them with. */
	private themes: readonly IWorkbenchColorTheme[] = [];

	constructor(
		bridge: VolterThemesBridge,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._register(themeService.onDidColorThemeChange(() => this.changed.fire()));
		// A package's themes arrive when its extension installs, after the window loads.
		this._register(extensionService.onDidChangeExtensions(() => this.refreshThemes()));
		this.refreshThemes();
		bridge.setProvider({
			active: () => {
				const theme = this.themeService.getColorTheme();
				const colors: Record<string, string> = {};
				for (const id of VOLTER_PALETTE_COLOR_IDS) {
					const color = theme.getColor(id);
					if (color) { colors[id] = Color.Format.CSS.formatHexA(color, true); }
				}
				return { id: theme.settingsId, colors };
			},
			ids: () => this.themes.map(theme => theme.settingsId),
			choose: id => {
				const theme = this.themes.find(candidate => candidate.settingsId === id);
				if (!theme) { return; }
				// A project whose adapter declares a style pins its colour theme in MEMORY, and a
				// project may set its own: a choice written to USER would lose to either, so it is
				// the workspace's then, as a style chosen there is (`volter.style`).
				const layered = this.configurationService.inspect('workbench.colorTheme');
				const projectHolds = layered.memoryValue !== undefined || layered.workspaceValue !== undefined;
				void this.themeService.setColorTheme(theme.id, projectHolds ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER);
			},
			onDidChange: listener => {
				const subscription = this.changed.event(listener);
				return () => subscription.dispose();
			},
		});
		this._register({ dispose: () => bridge.setProvider(null) });
	}

	private async refreshThemes(): Promise<void> {
		this.themes = await this.themeService.getColorThemes();
		this.changed.fire();
	}
}
