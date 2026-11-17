/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadConsoleShape } from '../common/extHost.protocol.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IRemoteConsoleLog, log } from '../../../base/common/console.js';
import { logRemoteEntry, logRemoteEntryIfError } from '../../services/extensions/common/remoteConsoleUtil.js';
import { parseExtensionDevOptions } from '../../services/extensions/common/extensionDevOptions.js';
import { ILogService, isDevConsoleLogForwarderRegistered } from '../../../platform/log/common/log.js';

@extHostNamedCustomer(MainContext.MainThreadConsole)
export class MainThreadConsole implements MainThreadConsoleShape {

	private readonly _isExtensionDevTestFromCli: boolean;

	constructor(
		_extHostContext: IExtHostContext,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._isExtensionDevTestFromCli = parseExtensionDevOptions(this._environmentService).isExtensionDevTestFromCli;
	}

	dispose(): void {
		//
	}

	$logExtensionHostMessage(entry: IRemoteConsoleLog): void {
		// (asked for each message: a window's console forwarder is registered at run time, by the window or its kit)
		if (this._isExtensionDevTestFromCli || isDevConsoleLogForwarderRegistered()) {
			// In development scenarios, or where the window's console goes to the log service, log all extension host
			// console output to the log service, and none to the local console, which would forward it again.
			logRemoteEntry(this._logService, entry, this._isExtensionDevTestFromCli ? null : 'Extension Host');
		} else {
			// Log to the log service only errors and log everything to local console
			logRemoteEntryIfError(this._logService, entry, 'Extension Host');
			log(entry, 'Extension Host');
		}
	}
}
