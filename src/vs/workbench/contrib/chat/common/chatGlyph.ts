/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import product from '../../../../platform/product/common/product.js';

/**
 * THE GLYPH THE WORKBENCH DRAWS FOR ITS DEFAULT CHAT AGENT.
 *
 * `product.json#defaultChatAgent.extensionId` already decides WHICH extension fills the default
 * participant slot, but the Chat status bar entry and the chat title-bar actions drew the
 * `copilot` codicon family unconditionally — so a product that bundles its own default chat
 * participant still showed GitHub Copilot's mark for an agent that is not Copilot.
 *
 * A product names its own glyph with `defaultChatAgent.icon` (a codicon id, e.g.
 * `comment-discussion`). A product that names none keeps the Copilot family byte for byte, so
 * upstream behaviour is unchanged.
 *
 * The four ids below are ONE FAMILY in the icon font — `copilot`, `copilot-unavailable`,
 * `copilot-warning`, `copilot-snooze` — and a product-supplied glyph has no such siblings, so
 * every state resolves to the one glyph the product named. The state itself is already in the
 * entry's label and aria label, which is where it belongs.
 */
const productChatGlyph = product.defaultChatAgent?.icon;

function glyph(fallback: ThemeIcon): ThemeIcon {
	return productChatGlyph ? ThemeIcon.fromId(productChatGlyph) : fallback;
}

export const chatAgentIcon = glyph(Codicon.copilot);
export const chatAgentUnavailableIcon = glyph(Codicon.copilotUnavailable);
export const chatAgentWarningIcon = glyph(Codicon.copilotWarning);
export const chatAgentSnoozeIcon = glyph(Codicon.copilotSnooze);
