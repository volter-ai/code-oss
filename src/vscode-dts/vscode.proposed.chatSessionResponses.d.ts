/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A request a chat session's provider starts itself rather than one the editor sends to the session's
	 * participant: input that reached the session from another client, a prompt the provider's backend runs
	 * on its own. The editor shows it as a request turn of its own, as it shows a turn an agent host starts.
	 */
	export interface ChatSessionServerRequest {
		/**
		 * The request's prompt: the text of its request turn.
		 */
		readonly prompt: string;

		/**
		 * Set when no user sent the request (a prompt the provider's scheduler runs): its request turn is then drawn
		 * as the editor draws a system-initiated request, a notification row with this label in place of the prompt.
		 */
		readonly systemInitiatedLabel?: string;

		/**
		 * Streams the request's response. The response is complete once the returned thenable resolves, and a
		 * {@link ChatResult} it resolves with is the response's result: its `errorDetails` are the response's
		 * error. The token is cancelled when the user stops the response or the session is disposed.
		 */
		readonly responseCallback: (stream: ChatResponseStream, token: CancellationToken) => Thenable<ChatResult | void>;
	}

	export interface ChatSession {
		/**
		 * Fires when the provider starts a {@link ChatSessionServerRequest request} in this session. The editor
		 * ends the response the session is streaming (its {@link ChatSession.activeResponseCallback active response}
		 * or an earlier server request), adds a request turn with the request's prompt, and calls its
		 * {@link ChatSessionServerRequest.responseCallback responseCallback} for that turn's response. A response
		 * the session's participant is writing ends when its request handler returns.
		 *
		 * Where this proposal is enabled, the thenable {@link ChatSession.activeResponseCallback} returns may also
		 * resolve with a {@link ChatResult}, which is the active response's result, and a {@link ChatResponseTurn2}
		 * in {@link ChatSession.history} keeps the `errorDetails` of its result.
		 */
		readonly onDidStartServerRequest?: Event<ChatSessionServerRequest>;
	}
}
