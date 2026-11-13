

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { SaveReason } from '../../../common/editor.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';

/**
 * WHAT THE FRAME HANDS THE EDITOR — the counterpart of the bridge's `VolterFilesHandle`,
 * declared here for the same reason `VolterHistoryBridge` is: nothing under `src/vs/` imports an
 * editor module.
 *
 * Every path is PROJECT-RELATIVE, `/`-separated, no leading slash — the same spelling the
 * history door hands over, resolved against the same workspace folder. That is what puts a
 * volter write on exactly the URI Monaco holds for that file.
 */
export interface VolterFilesBridge {
	/** Install the frame's file provider on `EditorHost.files`. Called once, after the mount,
	 *  because the services it needs exist only inside the command's own invocation. */
	setProvider(provider: VolterFileProvider): void;
	/** Say something in the Volter editor's OWN console, where the editor's `console` command reads it. */
	report(level: 'warn' | 'error', message: string): void;
}

export interface VolterFileProvider {
	read(path: string): Promise<string>;
	readBytes(path: string): Promise<Uint8Array>;
	write(path: string, data: string | Uint8Array): Promise<void>;
	exists(path: string): Promise<boolean>;
	stat(path: string): Promise<{ readonly size: number; readonly mtime: number } | null>;
	watch(listener: (event: VolterFileEvent) => void): () => void;
}

interface VolterFileEvent {
	readonly type: 'create' | 'update' | 'remove';
	readonly path: string;
}

export class VolterFiles extends Disposable {

	constructor(
		private readonly bridge: VolterFilesBridge,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super();
		bridge.setProvider({
			read: path => this.read(path),
			readBytes: path => this.readBytes(path),
			write: (path, data) => this.write(path, data),
			exists: path => this.exists(path),
			stat: path => this.stat(path),
			watch: listener => this.watch(listener),
		});
	}

	/**
	 * The workspace folder a project-relative path resolves against.
	 *
	 * THE BRIDGE IS THE TRUST BOUNDARY, which is why the containment check is
	 * repeated here rather than left to the editor's own door. `EditorHost.files`
	 * validates every path today (`files/project-files.ts`'s `assertContained`),
	 * but ANY package's contribution in the open project reaches that door, and
	 * `joinPath` NORMALIZES — `joinPath(root, '../x')` is a real URI outside the
	 * workspace, and `joinPath(root, '/etc/passwd')` is not the absolute path it
	 * looks like but is still not what the caller wrote. A check on one side of a
	 * trust boundary is a check the other side is free to stop making.
	 */
	private resolve(path: string): URI {
		const root = this.workspaceService.getWorkspace().folders[0]?.uri;
		if (!root) {
			throw new Error(localize('volterFilesNoFolder', "No folder is open in this window, so “{0}” names nothing on disk.", path));
		}
		const segments = path.replace(/\\/g, '/').split('/');
		if (path === '' || path.startsWith('/') || segments.includes('..')) {
			const message = localize('volterFilesEscape', "“{0}” is not a project-relative path, so the Volter Editor did not reach it. Paths through this door are relative to the open folder, `/`-separated, with no leading slash and no “..” segment.", path);
			this.bridge.report('error', message);
			throw new Error(message);
		}
		return joinPath(root, path);
	}

	/** A resolved text file model for this URI, or undefined. A resolved model is the file's
	 *  TRUTH in this workbench — reading anything else would hand the editor a version of the
	 *  file the person is not looking at. */
	private resolvedModel(uri: URI) {
		const model = this.textFileService.files.get(uri);
		return model?.isResolved() ? model : undefined;
	}

	private async read(path: string): Promise<string> {
		const uri = this.resolve(path);
		const model = this.resolvedModel(uri);
		if (model) { return model.textEditorModel.getValue(); }
		return (await this.textFileService.read(uri)).value;
	}

	private async readBytes(path: string): Promise<Uint8Array> {
		const content = await this.fileService.readFile(this.resolve(path));
		return content.value.buffer;
	}

	private async write(path: string, data: string | Uint8Array): Promise<void> {
		const uri = this.resolve(path);
		if (typeof data !== 'string') {
			// Bytes never have a text model to update, so this is the plain file-service write —
			// still the workbench's own, which is all the asset lane needs.
			await this.fileService.writeFile(uri, VSBuffer.wrap(data));
			return;
		}
		const model = this.resolvedModel(uri);
		if (!model) {
			await this.fileService.writeFile(uri, VSBuffer.fromString(data));
			return;
		}
		// Captured BEFORE the dirty check: upstream declares `isDirty(): this is
		// IResolvedTextFileEditorModel`, so its false branch narrows an already-resolved model
		// to `never` and every later member access fails to compile.
		const textModel = model.textEditorModel;
		if (model.isDirty()) {
			// NEVER CLOBBER UNSAVED TEXT. The editor computed this content from the file on
			// disk, so writing it over a model holding unsaved keystrokes would destroy them
			// with no event anywhere. The editor's own sha guard normally refuses before this
			// (its read answers from the model above, so the divergence is visible to it);
			// this is the floor under that, for a write that carries no guard of its own.
			const message = localize('volterFilesDirty', "“{0}” has unsaved changes in its editor, so the Volter Editor did not write over it. Save or revert that editor and try again.", path);
			this.bridge.report('warn', message);
			throw new Error(message);
		}
		// Apply text without pushing another undo element: the Volter element already
		// occupies this resource stack, including its redo future.
		textModel.applyEdits([{ range: textModel.getFullModelRange(), text: data }]);
		await this.textFileService.save(uri, { reason: SaveReason.EXPLICIT });
	}

	private exists(path: string): Promise<boolean> {
		return this.fileService.exists(this.resolve(path));
	}

	/** The file service's change events under the workspace folder, the same ones Code-OSS hands an
	 *  extension's file system watcher, as project-relative paths. */
	private watch(listener: (event: VolterFileEvent) => void): () => void {
		const subscription = this.fileService.onDidFilesChange(event => {
			const root = this.workspaceService.getWorkspace().folders[0]?.uri;
			if (!root) { return; }
			const report = (resources: readonly URI[], type: VolterFileEvent['type']) => {
				for (const resource of resources) {
					const path = relativePath(root, resource);
					if (path) { listener({ type, path }); }
				}
			};
			report(event.rawAdded, 'create');
			report(event.rawUpdated, 'update');
			report(event.rawDeleted, 'remove');
		});
		return () => subscription.dispose();
	}

	/** A file's size and modification time, from the file service's own stat; null for no file. */
	private async stat(path: string): Promise<{ readonly size: number; readonly mtime: number } | null> {
		try {
			const found = await this.fileService.stat(this.resolve(path));
			return found.isFile ? { size: found.size, mtime: found.mtime } : null;
		} catch {
			return null;
		}
	}
}
