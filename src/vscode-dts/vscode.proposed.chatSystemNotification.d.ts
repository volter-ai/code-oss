/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A record of the agent's harness that is neither the agent's words nor the user's: a background task
	 * reporting that it finished, a turn the harness records as interrupted. It is shown as the chat's system
	 * notification row, which stays in the response when other parts follow it (unlike a
	 * {@link ChatResponseProgressPart progress message}).
	 */
	export class ChatResponseSystemNotificationPart {
		/** The notification's text. */
		value: MarkdownString;

		/**
		 * Creates a new system notification part.
		 * @param value The notification's text.
		 */
		constructor(value: string | MarkdownString);
	}

	export interface ExtendedChatResponseParts {
		ChatResponseSystemNotificationPart: ChatResponseSystemNotificationPart;
	}
}
