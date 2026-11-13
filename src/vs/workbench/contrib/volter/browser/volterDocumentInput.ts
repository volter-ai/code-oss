/*---------------------------------------------------------------------------------------------
 *  `VolterDocumentInput`, in its OWN module because two modules need it:
 *  `volterDocuments.ts` and `volter.contribution.ts`, which imports `VolterDocuments`.
 *  Either importing it from the other would be a cycle, which the production build's
 *  dependency checker refuses by name ("CYCLIC dependency: volter.contribution.js ->
 *  volterDocuments.js -> volter.contribution.js"); `compile-client` does not run that
 *  check. This leaf module imports nothing of either side, and both import it.
 *
 *  IT HOSTS ANY Volter DOCUMENT, and is named for it: every product's documents ride this
 *  same input and the same pane, so its name is the kit's word, not a product's.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities, IRevertOptions, ISaveOptions, IUntypedEditorInput, IEditorSerializer, GroupIdentifier } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkingCopy } from '../../../services/workingCopy/common/workingCopy.js';
import { volterProduct } from './volterProduct.js';

/** The scheme of a document that is no file. */
export const VOLTER_DOCUMENT_SCHEME = 'volter-document';

/** Represent every open document with a native editor input. File documents use their project URI and
 * working copy; others use volter-document:/<id>. The bootstrap input lets the mount obtain a center
 * container before documents exist. Close it only after a real editor is active so its shared pane and
 * React portals remain attached. */
export class VolterDocumentInput extends EditorInput {
	static readonly ID = 'workbench.input.volterDocument';
	private static _instance: VolterDocumentInput | undefined;
	private static readonly _byResource = new Map<string, VolterDocumentInput>();
	static get instance(): VolterDocumentInput {
		if (!VolterDocumentInput._instance || VolterDocumentInput._instance.isDisposed()) { VolterDocumentInput._instance = new VolterDocumentInput(); }
		return VolterDocumentInput._instance;
	}
	/** The input for one open volter document — `file` when it is a project file — minted once
	 *  and RETITLED in place when the document's own title moves (a renamed model). */
	static forDocument(documentId: string, title: string, file?: { readonly resource: URI; readonly editorId?: string }): VolterDocumentInput {
		const resource = file?.resource ?? URI.from({ scheme: VOLTER_DOCUMENT_SCHEME, path: `/${documentId}` });
		let input = VolterDocumentInput._byResource.get(resource.toString());
		if (!input || input.isDisposed()) {
			input = new VolterDocumentInput(documentId, title, resource, file?.editorId);
			VolterDocumentInput._byResource.set(resource.toString(), input);
		} else if (input._title !== title) {
			input._title = title;
			input._onDidChangeLabel.fire();
		}
		return input;
	}
	private _title: string;
	private _workingCopy: IWorkingCopy | undefined;
	readonly resource: URI;
	constructor(readonly documentId?: string, title?: string, resource?: URI, private readonly _editorId?: string) {
		super();
		// The BOOTSTRAP input's name is the product's title (`Model`, for one) — it is the
		// editor a person sees for the beat before the first real document opens, and the
		// product is what that editor is. A build with no product half is refused by the
		// mount command long before this, so the generic name is a floor, not a fallback.
		this._title = title ?? volterProduct()?.title ?? localize('volterDocument', "Document");
		this.resource = resource ?? URI.from({ scheme: VOLTER_DOCUMENT_SCHEME, path: '/' });
	}
	/** The working copy of a file document, which owns its dirty state, Save and Revert. */
	setWorkingCopy(workingCopy: IWorkingCopy | undefined): void {
		if (this._workingCopy === workingCopy) { return; }
		this._workingCopy = workingCopy;
		this._onDidChangeCapabilities.fire();
		this._onDidChangeDirty.fire();
	}
	/** Fired by the working copy's owner when its dirty state changes. */
	dirtyChanged(): void { this._onDidChangeDirty.fire(); }
	override get typeId(): string { return VolterDocumentInput.ID; }
	override get editorId(): string | undefined { return this._editorId; }
	override get capabilities(): EditorInputCapabilities {
		return this._workingCopy ? EditorInputCapabilities.Singleton : EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}
	override getName(): string { return this._title; }
	override isDirty(): boolean { return this._workingCopy?.isDirty() ?? false; }
	override async save(_group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | undefined> {
		return this._workingCopy && await this._workingCopy.save(options) ? this : undefined;
	}
	override async revert(_group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this._workingCopy?.revert(options);
	}
	/** A file document as the resolver knows it, so "Reopen Editor With…" can offer its editors. */
	override toUntyped(): IUntypedEditorInput | undefined {
		return this.resource.scheme === VOLTER_DOCUMENT_SCHEME ? undefined : { resource: this.resource, options: { override: this.editorId } };
	}
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || (other instanceof VolterDocumentInput && isEqual(other.resource, this.resource));
	}
}

/** Code-OSS persists tab placement and order; the registry restores document content. */
export class VolterDocumentInputSerializer implements IEditorSerializer {
	canSerialize(input: VolterDocumentInput): boolean { return input.documentId !== undefined; }
	serialize(input: VolterDocumentInput): string {
		return JSON.stringify({ id: input.documentId, title: input.getName(), resource: input.resource.toString(), editorId: input.editorId });
	}
	deserialize(_instantiationService: IInstantiationService, value: string): VolterDocumentInput | undefined {
		try {
			const data = JSON.parse(value);
			if (typeof data.id !== 'string' || typeof data.title !== 'string' || typeof data.resource !== 'string') { return undefined; }
			const resource = URI.parse(data.resource);
			return VolterDocumentInput.forDocument(data.id, data.title, resource.scheme === VOLTER_DOCUMENT_SCHEME
				? undefined
				: { resource, ...(typeof data.editorId === 'string' ? { editorId: data.editorId } : {}) });
		} catch { /* Invalid persisted input is omitted by native restoration. */ }
		return undefined;
	}
}
