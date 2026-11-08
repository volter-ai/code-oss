/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/*
	 * What a chat session's own responses keep, where this proposal is enabled:
	 *
	 * - The thenable {@link ChatSession.activeResponseCallback} returns may resolve with a {@link ChatResult}: it is
	 *   the active response's result, so its `errorDetails` are that response's error.
	 * - A {@link ChatResponseTurn2} in {@link ChatSession.history} keeps the `errorDetails` of its result.
	 * - A question carousel pushed to the active response's stream is answered, as on a participant's stream.
	 * - A {@link ChatRequestTurn} in {@link ChatSession.history} keeps the field below.
	 */

	export interface ChatRequestTurn {
		/**
		 * Set on a request turn in {@link ChatSession.history} that no user sent (a prompt the provider's scheduler
		 * ran): it is drawn as a system-initiated request, a notification row with this label.
		 */
		systemInitiatedLabel?: string;
	}
}
