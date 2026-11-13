/*---------------------------------------------------------------------------------------------
 *  A VOLTER FILE DOCUMENT IS A CODE-OSS WORKING COPY, as an extension's custom editor is: the
 *  workbench owns its dirty state, Save and Save All, Revert, autosave, close confirmation and
 *  hot-exit backup, and the editor stays the file's one writer, because `save` is the editor's
 *  own write (`DocumentWorkingCopy` in `@volter/sdk/contributions`), which may carry only what a
 *  save changed rather than the whole file.
 *
 *  Nothing under `src/vs/` imports an editor module: what arrives is the documents bridge.
 *--------------------------------------------------------------------------------------------*/

import { bufferToReadable, streamToBuffer, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRevertOptions, ISaveOptions } from '../../../common/editor.js';
import { IWorkingCopy, IWorkingCopyBackup, IWorkingCopySaveEvent, WorkingCopyCapabilities } from '../../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyBackupService } from '../../../services/workingCopy/common/workingCopyBackup.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';

/** The documents bridge's working-copy half (`bridge.tsx`'s `VolterDocumentsHandle`). */
export interface VolterWorkingCopyBridge {
	dirty(id: string): boolean;
	/** Fires when a document changes, or its dirty state does. */
	subscribeDirty(listener: () => void): () => void;
	save(id: string): Promise<void>;
	revert(id: string): Promise<void>;
	backup(id: string): Promise<Uint8Array>;
	restore(id: string, content: Uint8Array): Promise<void>;
	/** Say something in the Volter editor's own console. */
	report(level: 'warn' | 'error', message: string): void;
}

/** Its own type, so a file's text working copy and this one never share a backup. */
export const VOLTER_DOCUMENT_WORKING_COPY_TYPE = 'volterDocument';

export class VolterDocumentWorkingCopy extends Disposable implements IWorkingCopy {

	readonly typeId = VOLTER_DOCUMENT_WORKING_COPY_TYPE;
	readonly capabilities = WorkingCopyCapabilities.None;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;
	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;
	private readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	private dirty: boolean;

	constructor(
		readonly resource: URI,
		readonly name: string,
		private readonly documentId: string,
		private readonly bridge: VolterWorkingCopyBridge,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IWorkingCopyBackupService private readonly backupService: IWorkingCopyBackupService,
	) {
		super();
		this.dirty = bridge.dirty(documentId);
		this._register(workingCopyService.registerWorkingCopy(this));
		this._register(toDisposable(bridge.subscribeDirty(() => this.update())));
	}

	/** A change while dirty is new content, which the backup tracker backs up again. */
	private update(): void {
		const dirty = this.bridge.dirty(this.documentId);
		const changed = dirty !== this.dirty;
		this.dirty = dirty;
		if (dirty) { this._onDidChangeContent.fire(); }
		if (changed) { this._onDidChangeDirty.fire(); }
	}

	/** The backup a restart left, shown as the document's unsaved state. */
	async restoreBackup(): Promise<void> {
		const backup = await this.backupService.resolve(this);
		if (!backup) { return; }
		await this.bridge.restore(this.documentId, (await streamToBuffer(backup.value)).buffer);
		this.update();
	}

	isDirty(): boolean { return this.dirty; }
	isModified(): boolean { return this.dirty; }

	async backup(): Promise<IWorkingCopyBackup> {
		return { content: bufferToReadable(VSBuffer.wrap(await this.bridge.backup(this.documentId))) };
	}

	async save(options?: ISaveOptions): Promise<boolean> {
		try {
			await this.bridge.save(this.documentId);
		} catch (error) {
			this.bridge.report('error', `${this.name} was not saved: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
		this.update();
		this._onDidSave.fire({ reason: options?.reason, source: options?.source });
		return true;
	}

	async revert(_options?: IRevertOptions): Promise<void> {
		await this.bridge.revert(this.documentId);
		this.update();
	}
}
