/*---------------------------------------------------------------------------------------------
 *  A VIEW'S SURFACE COLOUR IS ITS OWN THEME COLOUR — WORK.md §The core is Code-OSS U8,
 *  ruling (2), 2026-09-19.
 *
 *  A view's fill can differ from the dock around it: the node editor's area fill is `#1a1a1a`
 *  in one look while the dock group around it is `surface.panel` `#303030`. A view
 *  container is where a view lives, and a view's BACKDROP is a `registerColor` theme colour
 *  the theme extension sets per look, not a region claim (a UTILITY cannot claim a region the
 *  way a static panel can). So there is a colour id, and a look's colour theme gives it that look's
 *  value while Classic leaves it unset and our panels' own stylesheet paints, which is exactly
 *  what "Classic's reference frame is our panels with no look declared" means.
 *
 *  WHY THE DEFAULTS ARE NULL. A `registerColor` default of `null` resolves to no colour at all,
 *  so an unthemed workbench applies NOTHING and the pane keeps whatever our stylesheet gives
 *  it. A default of, say, `#303030` here would make Classic wear another look's value under a
 *  different name — the "host default versus skew" rule read backwards.
 *
 *  WHY THE TABLE IS FILLED AT LOAD. `registerColor` is a load-time registry (a colour has to
 *  exist before a theme can name it), while which utilities exist is a runtime fact. So the
 *  ids are a small fixed set registered at load — the KIT's generic one here, a product's own
 *  in the product's contribution — and a view without an entry falls back to the generic one;
 *  adding a view's own backdrop is adding a row, which is also what makes it a reviewable
 *  claim ("this surface reads differently from a panel") rather than a per-view free-for-all.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
// Every palette role (the stage's colours among them) is a registered colour too, generated from the
// SDK's palette table (docs/adr/looks-one-model.md).
import './volterGeneratedColors.js';
import { localize } from '../../../../nls.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';

/** Every volter view's body, unless its own id below overrides it. */
export const volterViewBackground = registerColor('volter.view.background',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	localize('volterViewBackground', "The backdrop of a volter view's body (Outliner, Properties, and every drawer utility without its own colour). Unset by default, so an unthemed workbench leaves the panel's own stylesheet to paint it."));

/**
 * WHICH VIEW GETS WHICH COLOUR, by the utility's own id. A row here is a CLAIM that the
 * surface reads differently from a panel, made once and reviewable; everything else resolves
 * to {@link volterViewBackground}.
 *
 * THE ROWS ARE THE PRODUCT'S, because the utility and the colour both are: the one row that
 * exists is a node editor's `#1a1a1a` inside a `#303030` panel, contributed by an integration
 * and themed by that package's own colour theme. A product registers
 * its colour id and its row at LOAD, which is when `registerColor` accepts one — the product's
 * contribution is imported above the kit's for exactly this kind of reason.
 */
const VIEW_COLORS = new Map<string, string>();

/** Claim a distinct backdrop for one view, by the utility's own id. */
export function registerViewBackground(utilityId: string, colorId: string): void {
	VIEW_COLORS.set(utilityId, colorId);
}

/**
 * The colour a view's body should wear, or `undefined` when the active theme sets neither its
 * own nor the generic one — which is the Classic case and means "paint nothing".
 */
export function viewBackgroundFor(theme: IColorTheme, utilityId: string): Color | undefined {
	const own = VIEW_COLORS.get(utilityId);
	return (own ? theme.getColor(own) : undefined) ?? theme.getColor(volterViewBackground) ?? undefined;
}
