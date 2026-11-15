/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Volter AI, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A Volter editor window's presence, on the window's own management connection to this server, as this server registers
// its agent host channel (`agentHostProxy`). The window says who it is and its lifecycle on the channel; this server says
// each of those, and the connection's permanent end, to the Volter session that started it, on the Node IPC channel it
// was spawned with. The connection's end is
// the IPC server's own event (`onDidRemoveConnection`), and whether the window said it was going is Code-OSS's own
// word for that: the Disconnect a web window sends as it shuts down (the extension service's `join.disconnectRemote`,
// on every shutdown path), which the management connection tells apart from the end of this server's reconnection
// grace (`--reconnection-grace-time`). Code-OSS's own mechanisms, used as they are, with no clock of ours beside them.
// Each whole-file write a window's file service makes through this server's file channel is said too, from the write's
// own connection, so the session records it by that window's participant.

import { Event } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { IPCServer, IServerChannel } from '../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../platform/log/common/log.js';
import { RemoteAgentConnectionContext } from '../../platform/remote/common/remoteAgentEnvironment.js';
import { generateUuid } from '../../base/common/uuid.js';
import { URI } from '../../base/common/uri.js';

export const VOLTER_WINDOW_CHANNEL_NAME = 'volterWindow';

/** One report to the session: a window announced, its lifecycle, or its connection gone for good. */
interface VolterWindowReport {
	readonly connection: string;
	readonly event: 'announce' | 'lifecycle' | 'gone' | 'writing' | 'wrote';
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

	/** The channel, or none where no process started this server with a Node IPC channel (`process.send`): the Volter
	 *  session spawns it with one. */
	static create(ipcServer: IPCServer<RemoteAgentConnectionContext>, logService: ILogService): VolterWindowChannel | undefined {
		return process.send ? new VolterWindowChannel(ipcServer, logService) : undefined;
	}

	/** Each report the session has yet to answer, by its number. */
	private readonly unanswered = new Map<number, () => void>();
	private reports = 0;

	private constructor(
		ipcServer: IPCServer<RemoteAgentConnectionContext>,
		private readonly logService: ILogService,
	) {
		super();
		// (the session answers each report once it has taken it, in order; a session gone answers none, so its channel's
		// end answers them all)
		const answered = (message: { answered?: number; refused?: string | null }) => {
			const report = this.unanswered.get(message.answered ?? -1);
			if (report === undefined) { return; }
			this.unanswered.delete(message.answered!);
			if (message.refused) { this.logService.warn(`[volterWindow] the session refused a window's report: ${message.refused}`); }
			report();
		};
		const gone = () => {
			for (const report of this.unanswered.values()) { report(); }
			this.unanswered.clear();
		};
		process.on('message', answered);
		process.on('disconnect', gone);
		this._register({ dispose: () => { process.off('message', answered); process.off('disconnect', gone); } });
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

	/** A window's write through this server's file channel (`RemoteAgentFileSystemProviderChannel`): said before it is
	 *  made (`writing`), so the session's watcher leaves its file to this write, and once it is done (`wrote`, and whether
	 *  it landed), so the session records the file as it then is, by the window's participant where it landed. The
	 *  window is answered after both. A connection whose window never announced itself is not a Volter window: its writes
	 *  are left to the watcher. */
	async writing<T>(ctx: RemoteAgentConnectionContext, resource: URI, write: () => Promise<T>): Promise<T> {
		const connection = this.ids.get(ctx);
		if (connection === undefined || !this.announced.has(connection) || resource.scheme !== 'file') { return write(); }
		const path = resource.fsPath;
		await this.report({ connection, event: 'writing', path });
		let landed = false;
		try {
			const written = await write();
			landed = true;
			return written;
		} finally {
			await this.report({ connection, event: 'wrote', path, landed });
		}
	}

	/** Said to the session on the Node IPC channel it spawned this server with, whose messages arrive in the order they
	 *  are sent; answered once the session has taken it. A session that can't be reached is logged in its words: the
	 *  window's presence is then unknown to it. */
	private report(report: VolterWindowReport): Promise<void> {
		const id = ++this.reports;
		return new Promise(resolve => {
			this.unanswered.set(id, resolve);
			process.send!({ ...report, id }, undefined, undefined, error => {
				if (!error || !this.unanswered.delete(id)) { return; }
				this.logService.warn(`[volterWindow] the session could not be told the window's ${report.event}: ${error.message}`);
				resolve();
			});
		});
	}
}
