/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { shouldSynchronizeModel } from '../../../editor/common/model.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IProgressStep, IProgress } from '../../../platform/progress/common/progress.js';
import { extHostCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ITextFileSaveParticipant, ITextFileService, ITextFileEditorModel, ITextFileSaveParticipantContext } from '../../services/textfile/common/textfiles.js';
import { ExtHostContext, ExtHostDocumentSaveParticipantShape } from '../common/extHost.protocol.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { ILogService } from '../../../platform/log/common/log.js';

class ExtHostSaveParticipant implements ITextFileSaveParticipant {

	private readonly _proxy: ExtHostDocumentSaveParticipantShape;

	constructor(
		extHostContext: IExtHostContext,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentSaveParticipant);
	}

	async participate(editorModel: ITextFileEditorModel, context: ITextFileSaveParticipantContext, _progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		if (!editorModel.textEditorModel || !shouldSynchronizeModel(editorModel.textEditorModel)) {
			// the model never made it to the extension
			// host meaning we cannot participate in its save
			return undefined;
		}

		const p = new Promise<void>((resolve, reject) => {

			let answered = false;
			const asked = Date.now();
			const participated = this._proxy.$participateInSave(editorModel.resource, context.reason);
			setTimeout(
				() => {
					reject(new Error(localize('timeout.onWillSave', "Aborted onWillSaveTextDocument-event after 1750ms")));
					if (answered) {
						return;
					}
					// WHICH PARTICIPANT HELD IT, said once the extension host answers: its listeners by extension and time
					const resource = editorModel.resource;
					participated.then(() => undefined, () => undefined).then(() => {
						const answeredAfter = Date.now() - asked;
						return this._proxy.$lastSaveListeners(resource).then(listeners => ({ answeredAfter, listeners }));
					}).then(({ answeredAfter, listeners }) => {
						const named = listeners.map(({ extension, ms }) => `'${extension}' ${ms === null ? 'did not finish' : `took ${ms}ms`}`);
						this._logService.error(`onWillSaveTextDocument for ${resource.toString()} was aborted after 1750ms; the extension host answered after ` +
							`${answeredAfter}ms, and its listeners were: ${named.join(', ') || 'none'}`);
					}, () => { /* the extension host went: nothing to name */ });
				},
				1750
			);
			participated.then(() => { answered = true; }, () => { answered = true; });
			participated.then(values => {
				if (!values.every(success => success)) {
					return Promise.reject(new Error('listener failed'));
				}
				return undefined;
			}).then(resolve, reject);
		});

		return raceCancellationError(p, token);
	}
}

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
@extHostCustomer
export class SaveParticipant {

	private _saveParticipantDisposable: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextFileService private readonly _textFileService: ITextFileService
	) {
		this._saveParticipantDisposable = this._textFileService.files.addSaveParticipant(instantiationService.createInstance(ExtHostSaveParticipant, extHostContext));
	}

	dispose(): void {
		this._saveParticipantDisposable.dispose();
	}
}
