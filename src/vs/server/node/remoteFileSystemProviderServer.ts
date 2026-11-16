/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../base/common/event.js';
import { URI, UriComponents } from '../../base/common/uri.js';
import { IURITransformer } from '../../base/common/uriIpc.js';
import { IFileChange, IFileOpenOptions, isFileOpenForWriteOptions } from '../../platform/files/common/files.js';
import { ILogService } from '../../platform/log/common/log.js';
import { createURITransformer } from '../../base/common/uriTransformer.js';
import { RemoteAgentConnectionContext } from '../../platform/remote/common/remoteAgentEnvironment.js';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider.js';
import { posix, delimiter } from '../../base/common/path.js';
import { isWindows } from '../../base/common/platform.js';
import { IServerEnvironmentService } from './serverEnvironmentService.js';
import { AbstractDiskFileSystemProviderChannel, AbstractSessionFileWatcher, ISessionFileWatcher } from '../../platform/files/node/diskFileSystemProviderServer.js';
import { IRecursiveWatcherOptions } from '../../platform/files/common/watcher.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import type { VolterWindowChannel } from './volterWindowChannel.js';

export class RemoteAgentFileSystemProviderChannel extends AbstractDiskFileSystemProviderChannel<RemoteAgentConnectionContext> {

	private readonly uriTransformerCache = new Map<string, IURITransformer>();

	/** `windowWrites` (Volter): each write is made through it, with the connection it comes from: a whole-file write, and a
	 *  handle opened for writing from its `open` to its `close`. */
	constructor(
		logService: ILogService,
		private readonly environmentService: IServerEnvironmentService,
		private readonly configurationService: IConfigurationService,
		private readonly windowWrites?: VolterWindowChannel
	) {
		super(new DiskFileSystemProvider(logService), logService);

		this._register(this.provider);
	}

	override call<TResult>(ctx: RemoteAgentConnectionContext, command: string, args: unknown[]): Promise<TResult> {
		const writes = this.windowWrites;
		if (writes) {
			const resource = () => this.transformIncoming(this.getUriTransformer(ctx), args[0] as UriComponents);
			switch (command) {
				case 'writeFile':
					return writes.writing(ctx, resource(), () => super.call<TResult>(ctx, command, args));
				case 'open':
					if (isFileOpenForWriteOptions(args[1] as IFileOpenOptions)) {
						return writes.opening(ctx, resource(), () => super.call<number>(ctx, command, args)) as Promise<TResult>;
					}
					break;
				case 'close':
					return writes.closing(args[0] as number, () => super.call<void>(ctx, command, args)) as Promise<TResult>;
			}
		}
		return super.call(ctx, command, args);
	}

	protected override getUriTransformer(ctx: RemoteAgentConnectionContext): IURITransformer {
		let transformer = this.uriTransformerCache.get(ctx.remoteAuthority);
		if (!transformer) {
			transformer = createURITransformer(ctx.remoteAuthority);
			this.uriTransformerCache.set(ctx.remoteAuthority, transformer);
		}

		return transformer;
	}

	protected override transformIncoming(uriTransformer: IURITransformer, _resource: UriComponents, supportVSCodeResource = false): URI {
		if (supportVSCodeResource && _resource.path === '/vscode-resource' && _resource.query) {
			const requestResourcePath = JSON.parse(_resource.query).requestResourcePath;

			return URI.from({ scheme: 'file', path: requestResourcePath });
		}

		return URI.revive(uriTransformer.transformIncoming(_resource));
	}

	//#region File Watching

	protected createSessionFileWatcher(uriTransformer: IURITransformer, emitter: Emitter<IFileChange[] | string>): ISessionFileWatcher {
		return new SessionFileWatcher(uriTransformer, emitter, this.logService, this.environmentService, this.configurationService);
	}

	//#endregion
}

class SessionFileWatcher extends AbstractSessionFileWatcher {

	constructor(
		uriTransformer: IURITransformer,
		sessionEmitter: Emitter<IFileChange[] | string>,
		logService: ILogService,
		environmentService: IServerEnvironmentService,
		configurationService: IConfigurationService
	) {
		super(uriTransformer, sessionEmitter, logService, environmentService);
	}

	protected override getRecursiveWatcherOptions(environmentService: IServerEnvironmentService): IRecursiveWatcherOptions | undefined {
		const fileWatcherPolling = environmentService.args['file-watcher-polling'];
		if (fileWatcherPolling) {
			const segments = fileWatcherPolling.split(delimiter);
			const pollingInterval = Number(segments[0]);
			if (pollingInterval > 0) {
				const usePolling = segments.length > 1 ? segments.slice(1) : true;
				return { usePolling, pollingInterval };
			}
		}

		return undefined;
	}

	protected override getExtraExcludes(environmentService: IServerEnvironmentService): string[] | undefined {
		if (environmentService.extensionsPath) {
			// when opening the $HOME folder, we end up watching the extension folder
			// so simply exclude watching the extensions folder. With forward slashes: on Windows the
			// path holds backslashes, and the recursive watcher (@parcel/watcher) compiles each
			// exclude into a regular expression in which a backslash before a digit (a folder `53b5`,
			// a home folder `1jo`) is a back-reference, so it throws and the file watcher stops.
			return [posix.join(isWindows ? environmentService.extensionsPath.replace(/\\/g, '/') : environmentService.extensionsPath, '**')];
		}

		return undefined;
	}
}
