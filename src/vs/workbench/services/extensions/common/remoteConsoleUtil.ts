/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteConsoleLog, parse } from '../../../../base/common/console.js';
import { format, ILogService } from '../../../../platform/log/common/log.js';

export function logRemoteEntry(logService: ILogService, entry: IRemoteConsoleLog, label: string | null = null): void {
	const args = parse(entry).args;
	// (a line whose first argument isn't a format string is logged as the console would print it)
	let firstArg: string = typeof args[0] === 'string' ? args.shift() : format(args.splice(0));

	if (!entry.severity) {
		entry.severity = 'info';
	}

	if (label) {
		if (!/^\[/.test(label)) {
			label = `[${label}]`;
		}
		if (!/ $/.test(label)) {
			label = `${label} `;
		}
		firstArg = label + firstArg;
	}

	switch (entry.severity) {
		case 'debug':
			logService.debug(firstArg, ...args);
			break;
		case 'log':
		case 'info':
			logService.info(firstArg, ...args);
			break;
		case 'warn':
			logService.warn(firstArg, ...args);
			break;
		case 'error':
			logService.error(firstArg, ...args);
			break;
	}
}

export function logRemoteEntryIfError(logService: ILogService, entry: IRemoteConsoleLog, label: string): void {
	const args = parse(entry).args;
	const firstArg = args.shift();
	if (typeof firstArg !== 'string' || entry.severity !== 'error') {
		return;
	}

	if (!/^\[/.test(label)) {
		label = `[${label}]`;
	}
	if (!/ $/.test(label)) {
		label = `${label} `;
	}

	logService.error(label + firstArg, ...args);
}
