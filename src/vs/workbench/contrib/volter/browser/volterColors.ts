/** Register theme colors for view backdrops separately from their containing dock. Defaults stay null
 * so unthemed views retain their stylesheet fills. The load-time registry holds the generic view
 * color; product contributions register their own specific colors. */

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
