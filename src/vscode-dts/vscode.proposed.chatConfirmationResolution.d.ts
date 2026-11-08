/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatResponseConfirmationPart {
		/**
		 * Whether the confirmation has been answered without the user answering it through its buttons: in another
		 * window, by a typed reply. A confirmation pushed with `isUsed` set retires the open confirmation of the same
		 * response whose {@link ChatResponseConfirmationPart.data data} equals its own: its buttons are removed, as
		 * when it is answered through them. It adds nothing when no such confirmation is open.
		 */
		isUsed?: boolean;
	}
}
