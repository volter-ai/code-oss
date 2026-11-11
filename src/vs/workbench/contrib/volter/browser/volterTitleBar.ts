/** The look supplies the title-bar height through --volter-command-bar-height. The bridge hands the
 * resolved value to the window.titleBarHeight setting at MEMORY scope, beneath project settings. The
 * ProjectHeader portal supplies the workspace tabs and transport; the native title bar reserves their
 * configured height. */

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';

/** The one key core edit 1 reads. Named in the `window` namespace rather than `volter.*` on
 *  purpose: it is a fact about the WINDOW's chrome, it is the shape upstream would give the
 *  setting if it ever grew one, and on the day it does our edit disappears instead of leaving
 *  a volter-branded key behind in a core part. */
export const TITLE_BAR_HEIGHT_KEY = 'window.titleBarHeight';

// WINDOW scope, not APPLICATION: the height is a property of the window a project is open in,
// so a project may answer it in `.vscode/settings.json` and the adapter layer's inspect gate
// hands it the win. Declared with NO default, so an unset key leaves the part's own 30/35
// arithmetic untouched — a workbench with no Volter project open is byte-identical to upstream.
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'window',
	order: 8,
	title: localize('volterWindowConfigurationTitle', "Window"),
	type: 'object',
	properties: {
		[TITLE_BAR_HEIGHT_KEY]: {
			type: 'number',
			minimum: 1,
			scope: ConfigurationScope.WINDOW,
			markdownDescription: localize('volterTitleBarHeight', "The height of the custom title bar, in pixels. Unset, the title bar sizes itself (30px, or 35px with the Command Center). The Volter Editor sets this from the active look's own top-bar height."),
		},
	},
});
