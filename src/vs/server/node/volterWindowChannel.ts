/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Volter AI, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A Volter editor window's presence, on the window's own management connection to this server, as this server registers
// its agent host channel (`agentHostProxy`). The window says who it is and its lifecycle on the channel; this server says
// each of those, and the connection's permanent end, to the Volter session that started it. The connection's end is
// the IPC server's own event (`onDidRemoveConnection`), and whether the window said it was going is Code-OSS's own
// word for that: the Disconnect a web window sends as it shuts down (the extension service's `join.disconnectRemote`,
// on every shutdown path), which the management connection tells apart from the end of this server's reconnection
// grace (`--reconnection-grace-time`). Code-OSS's own mechanisms, used as they are, with no clock of ours beside them.

import { Event } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { IPCServer, IServerChannel } from '../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../platform/log/common/log.js';
import { RemoteAgentConnectionContext } from '../../platform/remote/common/remoteAgentEnvironment.js';
import { generateUuid } from '../../base/common/uuid.js';

export const VOLTER_WINDOW_CHANNEL_NAME = 'volterWindow';

/** Where the session that started this server hears its windows: its origin, from the session's own environment. */
const SESSION_ORIGIN_ENV = 'VOLTER_SESSION_ORIGIN';

/** One report to the session: a window announced, its lifecycle, or its connection gone for good. */
interface VolterWindowReport {
	readonly connection: string;
	readonly event: 'announce' | 'lifecycle' | 'gone';
	readonly [key: string]: unknown;
}

export class VolterWindowChannel extends Disposable implements IServerChannel<RemoteAgentConnectionContext> {

	/** Each management connection's own id. Every web window's context names the same client id (`renderer`), so a
	 *  connection is known by its context, which the IPC server keeps once for the connection's life and hands to both
	 *  this channel's calls and its `onDidRemoveConnection`. */
	private readonly ids = new WeakMap<RemoteAgentConnectionContext, string>();
	/** The connections whose window announced itself. */
	private readonly announced = new Set<string>();

	private idOf(ctx: RemoteAgentConnectionContext): string {
		let id = this.ids.get(ctx);
		if (id === undefined) {
			id = generateUuid();
			this.ids.set(ctx, id);
		}
		return id;
	}

	/** The channel, or none where no Volter session started this server (its origin unset). */
	static create(ipcServer: IPCServer<RemoteAgentConnectionContext>, connectionToken: string | undefined, logService: ILogService): VolterWindowChannel | undefined {
		const origin = process.env[SESSION_ORIGIN_ENV];
		return origin ? new VolterWindowChannel(ipcServer, origin, connectionToken, logService) : undefined;
	}

	private constructor(
		ipcServer: IPCServer<RemoteAgentConnectionContext>,
		private readonly origin: string,
		private readonly connectionToken: string | undefined,
		private readonly logService: ILogService,
	) {
		super();
		this._register(ipcServer.onDidRemoveConnection(client => {
			const connection = this.ids.get(client.ctx);
			if (connection === undefined || !this.announced.delete(connection)) { return; }
			this.report({ connection, event: 'gone', saidGoing: client.endedByClient() });
		}));
	}

	listen<T>(_ctx: RemoteAgentConnectionContext, event: string): Event<T> {
		throw new Error(`Invalid listen: ${event}`);
	}

	async call<T>(ctx: RemoteAgentConnectionContext, command: string, arg?: unknown): Promise<T> {
		const said = (arg ?? {}) as Record<string, unknown>;
		const connection = this.idOf(ctx);
		switch (command) {
			case 'announce':
				this.announced.add(connection);
				await this.report({ ...said, connection, event: 'announce' });
				return undefined as T;
			case 'lifecycle':
				await this.report({ ...said, connection, event: 'lifecycle' });
				return undefined as T;
		}
		throw new Error(`Invalid call: ${command}`);
	}

	/** The reports in the order they were made: each fetch is its own request, and a window's last lifecycle reaches the
	 *  session before its connection's end. */
	private reported: Promise<void> = Promise.resolve();

	private report(report: VolterWindowReport): Promise<void> {
		this.reported = this.reported.then(() => this.send(report));
		return this.reported;
	}

	/** Said to the session (`POST /__editor/windows`). This server is not a page, so it sends no `Origin`: it proves
	 *  itself as Code-OSS's own server is trusted, by the connection token it already holds, in the `vscode-tkn` cookie
	 *  the session's gate checks on every request. A session that can't be reached is logged in its words: the window's
	 *  presence is then unknown to it. */
	private async send(report: VolterWindowReport): Promise<void> {
		try {
			const response = await fetch(new URL('/__editor/windows', this.origin), {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(this.connectionToken ? { cookie: `vscode-tkn=${this.connectionToken}` } : {}),
				},
				body: JSON.stringify(report),
			});
			if (!response.ok) { this.logService.warn(`[volterWindow] the session refused the window's ${report.event}: ${response.status} ${await response.text()}`); }
		} catch (error) {
			this.logService.warn(`[volterWindow] the session could not be told the window's ${report.event}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
