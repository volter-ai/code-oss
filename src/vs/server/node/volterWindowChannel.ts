/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Volter AI, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A Volter editor window's presence, on the window's own management connection to this server, as this server registers
// its agent host channel (`agentHostProxy`). The window says who it is and its lifecycle on the channel; this server says
// each of those, and the connection's permanent end, to the Volter session that started it, on the Node IPC channel it
// was spawned with. The connection's end is the IPC server's own event (`onDidRemoveConnection`): the window's
// Disconnect, or the end of this server's reconnection grace (`--reconnection-grace-time`), which nothing here tells
// apart. Code-OSS's own mechanisms, used as they are, with no clock of ours beside them.
// Each write a window's file service makes through this server's file channel is said too, from the write's own
// connection: a whole file (`writeFile`), or a handle opened for writing (`open`) until its `close`, as the file service
// streams a text save. The session records it by that window's participant, or refuses it where another window holds
// the file's lock (`FileSystemProviderErrorCode.FileWriteLocked`, in the session's words). A report the session refuses
// rejects the window's call with the session's words.

import { Event } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { IPCServer, IServerChannel } from '../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../platform/log/common/log.js';
import { RemoteAgentConnectionContext } from '../../platform/remote/common/remoteAgentEnvironment.js';
import { generateUuid } from '../../base/common/uuid.js';
import { URI } from '../../base/common/uri.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode } from '../../platform/files/common/files.js';

export const VOLTER_WINDOW_CHANNEL_NAME = 'volterWindow';

/** One report to the session: a window announced, its lifecycle, its connection gone for good, or a write's start and end. */
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

	/** Each report the session has yet to answer, by its number, with the answer's handler. */
	private readonly unanswered = new Map<number, (answer: { refused?: string | null; locked?: string }) => void>();
	private reports = 0;
	/** Each handle a window opened for writing (the disk provider's file descriptor), until its `close`: the write's
	 *  connection and file, as its `writing` said them. */
	private readonly openWrites = new Map<number, { connection: string; path: string }>();

	private constructor(
		ipcServer: IPCServer<RemoteAgentConnectionContext>,
		private readonly logService: ILogService,
	) {
		super();
		// (the session answers each report once it has taken it, in order; a session gone takes this server with it,
		// server-main.ts's `disconnect`)
		const answered = (message: { answered?: number; refused?: string | null; locked?: string }) => {
			const report = this.unanswered.get(message.answered ?? -1);
			if (report === undefined) { return; }
			this.unanswered.delete(message.answered!);
			report(message);
		};
		process.on('message', answered);
		this._register({ dispose: () => process.off('message', answered) });
		this._register(ipcServer.onDidRemoveConnection(client => {
			const connection = this.ids.get(client.ctx);
			if (connection === undefined || !this.announced.delete(connection)) { return; }
			// (a handle its window left open is a write no call can end now: it did not land)
			for (const [fd, write] of this.openWrites) {
				if (write.connection === connection) {
					this.openWrites.delete(fd);
					this.untold(this.report({ ...write, event: 'wrote', landed: false }));
				}
			}
			this.untold(this.report({ connection, event: 'gone' }));
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
				try {
					await this.report({ ...said, connection, event: 'announce' });
				} catch (refused) {
					// (a window the session didn't take is none of its windows: its writes are left to the watcher)
					this.announced.delete(connection);
					throw refused;
				}
				return undefined as T;
			case 'lifecycle':
				await this.report({ ...said, connection, event: 'lifecycle' });
				return undefined as T;
		}
		throw new Error(`Invalid call: ${command}`);
	}

	/** A window's whole-file write through this server's file channel (`RemoteAgentFileSystemProviderChannel`): said
	 *  before it is made (`writing`), so the session's watcher leaves its file to this write, and once it is done
	 *  (`wrote`, and whether it landed), so the session records the file as it then is, by the window's participant where
	 *  it landed. The window is answered after both. A `writing` the session answers as locked (another window holds the
	 *  file's lock) is not made: it throws `FileWriteLocked` in the session's words. A connection whose window never
	 *  announced itself is not a Volter window: its writes are left to the watcher. */
	async writing<T>(ctx: RemoteAgentConnectionContext, resource: URI, write: () => Promise<T>): Promise<T> {
		const said = await this.said(ctx, resource);
		if (said === undefined) { return write(); }
		let landed = false;
		try {
			const written = await write();
			landed = true;
			return written;
		} finally {
			await this.wrote(said, landed);
		}
	}

	/** A handle a window opens for writing (`open` with `create`, as the file service's buffered write opens one): its
	 *  write is said at the open (`writing`), as a whole-file write's is, and ends at the handle's `close`. */
	async opening(ctx: RemoteAgentConnectionContext, resource: URI, open: () => Promise<number>): Promise<number> {
		const said = await this.said(ctx, resource);
		if (said === undefined) { return open(); }
		let fd: number;
		try {
			fd = await open();
		} catch (error) {
			await this.wrote(said, false);
			throw error;
		}
		this.openWrites.set(fd, said);
		return fd;
	}

	/** A handle's `close`: where a window opened it for writing, its write is said done (`wrote`) once it closed, and
	 *  landed where the close did. */
	async closing(fd: number, close: () => Promise<void>): Promise<void> {
		const said = this.openWrites.get(fd);
		if (said === undefined) { return close(); }
		// (taken before the close: the system may hand the same descriptor to the next open once it is closed)
		this.openWrites.delete(fd);
		let landed = false;
		try {
			await close();
			landed = true;
		} finally {
			await this.wrote(said, landed);
		}
	}

	/** A Volter window's write, said to the session before it is made; undefined where the write is no Volter window's
	 *  (its connection never announced a window) or not on the disk. */
	private async said(ctx: RemoteAgentConnectionContext, resource: URI): Promise<{ connection: string; path: string } | undefined> {
		const connection = this.ids.get(ctx);
		if (connection === undefined || !this.announced.has(connection) || resource.scheme !== 'file') { return undefined; }
		const said = { connection, path: resource.fsPath };
		const locked = await this.report({ ...said, event: 'writing' });
		if (locked) { throw createFileSystemProviderError(locked, FileSystemProviderErrorCode.FileWriteLocked); }
		return said;
	}

	/** A write's end, said to the session. Where the write failed, its own error is the window's answer, and the
	 *  session's refusal of its `wrote` is logged. */
	private async wrote(said: { connection: string; path: string }, landed: boolean): Promise<void> {
		const told = this.report({ ...said, event: 'wrote', landed });
		await (landed ? told : this.untold(told));
	}

	/** A report no window's call is answered with: the session's refusal, or a session that can't be reached, is logged
	 *  in its words. */
	private untold(told: Promise<unknown>): Promise<unknown> {
		return told.catch((error: Error) => this.logService.warn(`[volterWindow] ${error.message}`));
	}

	/** Said to the session on the Node IPC channel it spawned this server with, whose messages arrive in the order they
	 *  are sent. Resolves once the session has taken it, with its refusal of a write as locked; rejects with the
	 *  session's refusal in its words, or where the session can't be reached. */
	private report(report: VolterWindowReport): Promise<string | undefined> {
		const id = ++this.reports;
		return new Promise((resolve, reject) => {
			this.unanswered.set(id, answer => answer.refused
				? reject(new Error(`the session refused the window's ${report.event}: ${answer.refused}`))
				: resolve(answer.locked));
			process.send!({ ...report, id }, undefined, undefined, error => {
				if (!error || !this.unanswered.delete(id)) { return; }
				reject(new Error(`the session could not be told the window's ${report.event}: ${error.message}`));
			});
		});
	}
}
