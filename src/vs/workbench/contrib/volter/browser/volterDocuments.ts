/** Mirror the document registry into native editor groups and reflect native activation back into the
 * registry. Open, activate, then close the bootstrap so React's shared pane stays attached. Area
 * documents use adjacent groups with declared size ratios applied when the area opens, switches
 * document or requests a new ratio. Native serialization preserves placement; the bridge resolves
 * content. Exclude area activation from changing the current model. */

import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, isEqual, joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorCloseContext } from '../../../common/editor.js';
import { GroupDirection, GroupsOrder, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
// From the LEAF module, never from the contribution: importing it back from there
// while the contribution imports `VolterDocuments` is the cycle the production emit's
// dependency checker fails on (see `volterDocumentInput.ts`'s header).
import { VolterDocumentInput } from './volterDocumentInput.js';
import { documentView, VolterDocumentView } from './volterDocumentViews.js';
import { VOLTER_DOCUMENT_WORKING_COPY_TYPE, VolterDocumentWorkingCopy, VolterWorkingCopyBridge } from './volterDocumentWorkingCopy.js';
import { onDidChangeVolterContributions, volterEditors, volterEditorsForFile } from './volterExtensions.js';

/** Where the workbench draws editor actions; `hidden` leaves a group's tab row holding only its tabs. */
const EDITOR_ACTIONS_LOCATION = 'workbench.editor.editorActionsLocation';

/** The workspace AREA one document fills — `WorkspaceAreaContribution`'s own three fields,
 *  reshaped so that no file under `src/vs/` imports an editor module. `place` is relative to
 *  the group the mount used; `ratio` is that area's share of the two groups' combined extent,
 *  and it is the BOOTSTRAP size only. */
export interface VolterDocumentArea {
	readonly id: string;
	readonly place: 'left' | 'right' | 'above' | 'below';
	readonly ratio: number;
}

export interface VolterDocument {
	readonly id: string;
	readonly title: string;
	/** Set only for a document the active workspace opened into one of its `areas`. */
	readonly area?: VolterDocumentArea;
	/** The project-relative file a document with a working copy is. */
	readonly file?: string;
}

/** An area's `place`, as VS Code's own split direction. */
const AREA_DIRECTION: Record<VolterDocumentArea['place'], GroupDirection> = {
	left: GroupDirection.LEFT,
	right: GroupDirection.RIGHT,
	above: GroupDirection.UP,
	below: GroupDirection.DOWN,
};

export interface VolterDocumentsBridge extends VolterWorkingCopyBridge {
	whenRestored(): Promise<void>;
	/** The active document's kind and the project-relative file it is, or null. */
	activeSource(): { kind: string; path: string } | null;
	/** Every OPEN workspace document, in the registry's own order. */
	list(): readonly VolterDocument[];
	/** The registry's active document id, or null. */
	activeId(): string | null;
	/** Fires when the open set, the titles or the active document change. */
	subscribe(listener: () => void): () => void;
	/** Activate one open document — the frame's half of a tab click. */
	activate(id: string, viewId?: string): void;
	/** Close one open document — the frame's half of `View: Close Editor`. */
	close(id: string): void;
	/** Publish one native editor occurrence; detachment is distinct from close. */
	setView(view: VolterDocumentView, closed: boolean): void;
	/** Open the document a project file is, for the editor resolver: its id, or null. */
	openFile(path: string): Promise<string | null>;
}

export class VolterDocuments extends Disposable {

	/** The group the mount used, and the one the registry's ACTIVE document draws in.
	 *  REBOUND, never latched: a person can close its last editor, which disposes it. */
	private group: IEditorGroup;
	private readonly registeredDocuments = new Set<string>();
	/** One group per workspace AREA, keyed by the area's id — the frame's half of
	 *  `WorkspaceAreaContribution.id`'s own promise ("the frame's editor group is keyed by
	 *  it"). Cleared by `onDidRemoveGroup` when a person closes one. */
	private readonly areaGroups = new Map<string, IEditorGroup>();
	/**
	 * Track each area group's current document by group id. A workspace switch that changes that
	 * document restores the area's declared ratio; the same document in the same group retains the
	 * person's resized layout. Area ids alone cannot detect a different workspace reusing the group.
	 */
	private readonly areaDocuments = new Map<number, string>();
	/** The ratio each area GROUP was last stood up at, keyed as `areaDocuments` is. A new ratio
	 *  for the same document is a stand-up too: the document changed its job and asked for the
	 *  size the new one needs (editor-core's `src/workspace-areas.ts`' `setWorkspaceAreaRatio`
	 *  — a workspace's bottom area can be a timeline in one mode and another
	 *  panel in another mode). The same ratio keeps the person's drag. */
	private readonly areaRatios = new Map<number, number>();
	/** Areas stood up during the pass now running, sized once it has finished opening AND
	 *  closing — see `groupForArea` for why the order matters. */
	private readonly areaToSize = new Map<string, { group: IEditorGroup; area: VolterDocumentArea }>();
	/** True while THIS class is driving the group, so the active-editor
	 *  listener does not report our own activation back as a person's gesture. */
	private applying = false;
	/** The bound group was disposed (its last editor closed, a merge, a closed window).
	 *  A FLAG TO REBIND ON, not a latch — see `liveGroup`. */
	private groupGone = false;
	/** Last synchronized active document id, initialized from the bridge. A newly opened input
	 * still activates when this memo already names its document. */
	private appliedActiveId: string | null = null;
	/** The dispose watch on the bound group, re-armed by `watchGroup` on every rebind. */
	private readonly groupWatch = this._register(new MutableDisposable());
	private pass: Promise<void> = Promise.resolve();
	private queued = false;
	/** One working copy per open file document, keyed by its document id, with what binds it to its input. */
	private readonly workingCopies = this._register(new DisposableMap<string, DisposableStore>());
	/** The resolver's registrations for the installed packages' editors. */
	private readonly resolverEditors = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly bridge: VolterDocumentsBridge,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
	) {
		super();
		// Native restoration owns the group grid, including intentionally empty splits.
		this.group = editorGroupsService.activeGroup;
		// Restoration already chose the active native editor, possibly a source file.
		// Registry metadata alone must not steal focus on the first reconciliation.
		this.appliedActiveId = bridge.activeId();
		// A PACKAGE'S EDITOR OPENS ITS FILES wherever a file is opened (the Explorer, quick open, a
		// link), and "Reopen Editor With…" lists it.
		this.registerEditors();
		this._register(toDisposable(onDidChangeVolterContributions(() => this.registerEditors())));
		// A backup a restart left reopens its document even when its editor was not restored.
		this._register(workingCopyEditorService.registerHandler({
			handles: workingCopy => workingCopy.typeId === VOLTER_DOCUMENT_WORKING_COPY_TYPE,
			isOpen: (workingCopy, editor) => editor instanceof VolterDocumentInput && isEqual(editor.resource, workingCopy.resource),
			createEditor: workingCopy => this.inputForFile(workingCopy.resource),
		}));
		this.watchGroup();
		this.reportActiveEditor();
		this._register(toDisposable(this.bridge.subscribe(() => this.schedule())));
		this._register(this.editorService.onDidActiveEditorChange(() => this.reportActiveEditor()));
		// Any editor opened, closed or moved anywhere can change how many tabs there are, and the
		// actions setting decides whether the row holds anything else (`syncTabRow`).
		this._register(this.editorService.onDidEditorsChange(() => this.syncTabRow()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(EDITOR_ACTIONS_LOCATION)) { this.syncTabRow(); }
		}));
		this._register(this.editorGroupsService.onDidChangeActiveGroup(() => this.reportActiveEditor()));
		// From the mount on, not from the first pass's end: a restored single document has no row to lose.
		this.syncTabRow();
		// AN AREA IS RESIZED OR JOINED, NEVER CLOSED. If a person closes the area's
		// group the map must forget it (its `IEditorGroup` is dead) and the next reconcile
		// re-creates it — which is this schedule, because the registry has no reason to
		// notify about a workbench group going away.
		this._register(editorGroupsService.onDidRemoveGroup(removed => {
			let ours = removed === this.group;
			for (const [id, group] of this.areaGroups) {
				if (group === removed) { this.areaGroups.delete(id); ours = true; }
			}
			if (ours) { this.schedule(); }
		}));
		// A person's native Close Editor action also closes the registry document. applying distinguishes
		// those actions from this class's own reconciliation closes.
		this._register(this.editorService.onDidCloseEditor(event => {
			if (this.applying) { return; }
			const editor = event.editor;
			if (!(editor instanceof VolterDocumentInput) || editor.documentId === undefined) { return; }
			// A MOVE IS NOT A CLOSE: dragging an editor between groups closes it in one and
			// opens it in the other, and the workbench says so (`context`). Closing a document
			// that is still open somewhere is the tab reappearing for no reason.
			if (event.context === EditorCloseContext.MOVE) { return; }
			if (this.editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).some(group => group.contains(editor))) { return; }
			this.bridge.close(editor.documentId);
		}));
		this.schedule();
	}

	private registerEditors(): void {
		const registrations = new DisposableStore();
		for (const editor of volterEditors()) {
			const priority = editor.priority === 'option' ? RegisteredEditorPriority.option : RegisteredEditorPriority.default;
			for (const pattern of editor.filenamePatterns) {
				registrations.add(this.editorResolverService.registerEditor(
					pattern,
					// A diff or a merge of these files stays the workbench's own.
					{ id: editor.viewType, label: editor.displayName, priority: { editor: priority, diff: RegisteredEditorPriority.option } },
					{ singlePerResource: true, canSupportResource: resource => this.projectPath(resource) !== undefined },
					{ createEditorInput: async ({ resource, options }) => ({ editor: await this.inputForFile(resource, editor.viewType), options }) },
				));
			}
		}
		this.resolverEditors.value = registrations;
	}

	/** A resource's project-relative path, when it is in the project's folder. */
	private projectPath(resource: URI): string | undefined {
		const folder = this.workspaceService.getWorkspace().folders[0]?.uri;
		return folder ? relativePath(folder, resource) : undefined;
	}

	/** The input of the document a project file is, opened in the page first. */
	private async inputForFile(resource: URI, editorId?: string): Promise<VolterDocumentInput> {
		const path = this.projectPath(resource);
		if (!path) { throw new Error(`${resource.toString(true)} is not in the project's folder.`); }
		const id = await this.bridge.openFile(path);
		if (!id) { throw new Error(`No document of the project is ${path}.`); }
		return VolterDocumentInput.forDocument(id, this.bridge.list().find(document => document.id === id)?.title ?? basename(resource),
			{ resource, editorId: editorId ?? this.editorIdFor(resource) });
	}

	/** The declared editor whose files a resource is, as the resolver matches a basename. */
	private editorIdFor(resource: URI): string | undefined {
		const name = basename(resource);
		return volterEditorsForFile(name)[0];
	}

	/** The input of one listed document: a file document's resource is its file. */
	private inputFor(document: VolterDocument): VolterDocumentInput {
		const folder = this.workspaceService.getWorkspace().folders[0]?.uri;
		const resource = document.file && folder ? joinPath(folder, document.file) : undefined;
		return VolterDocumentInput.forDocument(document.id, document.title, resource ? { resource, editorId: this.editorIdFor(resource) } : undefined);
	}

	/** One working copy for each open file document; one whose document closed goes. */
	private syncWorkingCopies(documents: readonly VolterDocument[]): void {
		const files = new Map(documents.filter(document => document.file).map(document => [document.id, document]));
		for (const id of [...this.workingCopies.keys()]) {
			if (!files.has(id)) { this.workingCopies.deleteAndDispose(id); }
		}
		for (const [id, document] of files) {
			if (this.workingCopies.has(id)) { continue; }
			const input = this.inputFor(document);
			const bound = new DisposableStore();
			const workingCopy = bound.add(this.instantiationService.createInstance(VolterDocumentWorkingCopy, input.resource, document.title, id, this.bridge));
			bound.add(workingCopy.onDidChangeDirty(() => input.dirtyChanged()));
			input.setWorkingCopy(workingCopy);
			bound.add(toDisposable(() => input.setWorkingCopy(undefined)));
			this.workingCopies.set(id, bound);
			workingCopy.restoreBackup().catch(error => this.bridge.report('error',
				`The unsaved changes ${document.title} had at the last exit could not be restored: ${error instanceof Error ? error.message : String(error)}`));
		}
	}

	/** Re-arm the dispose watch on whatever group is currently bound. */
	private watchGroup(): void {
		this.groupGone = false;
		this.groupWatch.value = this.group.onWillDispose(() => { this.groupGone = true; });
	}

	/** Rebind the document group when it is disposed. Prefer a live group already holding a Volter input,
	 * otherwise the active group, and re-arm its disposal watch. */
	private liveGroup(): IEditorGroup {
		if (!this.groupGone) { return this.group; }
		const groups = this.editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);
		const areaGroups = new Set(this.areaGroups.values());
		const holding = groups.find(group => !areaGroups.has(group)
			&& group.editors.some(editor => editor instanceof VolterDocumentInput));
		this.group = holding ?? this.editorGroupsService.activeGroup;
		// The mount's own active-editor report is the MAIN group's only, so the bound group
		// changing means the registry's next activation belongs to a different group.
		this.appliedActiveId = null;
		this.watchGroup();
		return this.group;
	}

	/** Restoration can leave an area's tab active, especially after the model
	 * was closed. That group is not the centre to split again on every boot. */
	private bindMainGroup(documents: readonly VolterDocument[]): boolean {
		let created = false;
		const areas = new Set(documents.filter(document => document.area).map(document => document.id));
		const centres = new Set(documents.filter(document => !document.area).map(document => document.id));
		const holds = (group: IEditorGroup, ids: Set<string>) => group.editors.some(editor =>
			editor instanceof VolterDocumentInput && editor.documentId !== undefined && ids.has(editor.documentId));
		const groups = this.editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);
		let main = holds(this.group, centres) ? this.group : groups.find(group => holds(group, centres));
		if (!main && !holds(this.group, areas)) { main = this.group; }
		if (!main) { main = groups.find(group => !holds(group, areas)); }
		if (!main) {
			const area = documents.find(document => document.area && holds(this.group, new Set([document.id])))?.area;
			if (!area) { return false; }
			const opposite: Record<VolterDocumentArea['place'], GroupDirection> = {
				left: GroupDirection.RIGHT, right: GroupDirection.LEFT,
				above: GroupDirection.DOWN, below: GroupDirection.UP,
			};
			main = this.editorGroupsService.addGroup(this.group, opposite[area.place]);
			created = true;
		}
		// The documents' group is never an area, even when `liveGroup` fell back to one.
		for (const [id, group] of this.areaGroups) {
			if (group === main) { this.areaGroups.delete(id); }
		}
		if (main === this.group) { return false; }
		// Restore tab rows when reassigning the main document group. A document dragged into an area's group
		// can make it the main group; the area then gets a separate group and its tab policy.
		if (![...this.areaGroups.values()].includes(this.group)) { this.group.setTabsHidden(false); }
		this.group = main;
		this.appliedActiveId = null;
		this.watchGroup();
		return created;
	}

	/** Create an area's group on first use or adopt an empty group already in that direction. Native grid
	 * restoration can provide that group before its document input returns. Leave neighbors holding other
	 * editors untouched. */
	private groupForArea(area: VolterDocumentArea, documentId: string): IEditorGroup {
		const adjacent = this.editorGroupsService.findGroup({ direction: AREA_DIRECTION[area.place] }, this.group);
		const restored = adjacent?.editors.some(editor => editor instanceof VolterDocumentInput && editor.documentId === documentId) ? adjacent : undefined;
		if (!this.areaGroups.has(area.id) && restored) {
			// AN AREA HAS NO TAB. It is one of the workspace's surfaces (the Timeline under the
			// viewport), never a set of documents to pick between, so where the product shows
			// document tabs the area's group keeps its whole height and nothing to close.
			restored.setTabsHidden(true);
			this.areaGroups.set(area.id, restored);
			this.areaDocuments.set(restored.id, documentId);
			this.areaRatios.set(restored.id, area.ratio);
			return restored;
		}
		const known = this.areaGroups.get(area.id);
		const neighbour = known ?? adjacent;
		const group = neighbour && neighbour !== this.group && (known !== undefined || neighbour.count === 0)
			? neighbour
			: this.editorGroupsService.addGroup(this.group, AREA_DIRECTION[area.place]);
		group.setTabsHidden(true);
		this.areaGroups.set(area.id, group);
		// A STAND-UP IS A NEW DOCUMENT IN THE AREA, or a new job for the one there: the first
		// open, every workspace switch that puts a different document there (one workspace's
		// node editor where another's timeline was), and a new ratio the area's document asked
		// for (another panel where the timeline was, `areaRatios`).
		// Switching workspaces restores that workspace's screen, ratios and all, and the same
		// document at the same ratio keeps whatever size the person dragged it to.
		if (this.areaDocuments.get(group.id) !== documentId || this.areaRatios.get(group.id) !== area.ratio) {
			this.areaDocuments.set(group.id, documentId);
			this.areaRatios.set(group.id, area.ratio);
			// Size area groups at the end of the pass. Replacements open before the old editor closes, so
			// intermediate group contents do not yet describe the final split.
			if (area.ratio > 0 && area.ratio < 1) { this.areaToSize.set(area.id, { group, area }); }
		}
		return group;
	}

	/** Apply an area's bootstrap size immediately and on layout events for the next second while the
	 * workbench settles. Then dispose the listener so later sash changes remain the person's choice. */
	private sizeAreaGroup(group: IEditorGroup, area: VolterDocumentArea): void {
		const horizontal = area.place === 'left' || area.place === 'right';
		const extentOf = (size: { width: number; height: number }) => (horizontal ? size.width : size.height);
		const set = (target: IEditorGroup, extent: number) => {
			const size = this.editorGroupsService.getSize(target);
			this.editorGroupsService.setSize(target, horizontal
				? { width: Math.max(1, extent), height: size.height }
				: { width: size.width, height: Math.max(1, extent) });
		};
		// Converge on the desired extent by measuring after setSize and retrying from the other group.
		// SplitView distributes leftover space by priority; stop once correct or after four synchronous
		// passes.
		const apply = () => {
			for (let pass = 0; pass < 4; pass++) {
				const own = extentOf(this.editorGroupsService.getSize(group));
				const main = extentOf(this.editorGroupsService.getSize(this.group));
				const combined = own + main;
				if (combined <= 0) { return; }
				const target = Math.max(1, Math.round(combined * area.ratio));
				if (Math.abs(own - target) <= 1) { return; }
				if (pass % 2 === 0) { set(group, target); } else { set(this.group, combined - target); }
			}
		};
		apply();
		// AND THROUGH THE WORKBENCH'S SETTLING. An area is stood up while the frame is still
		// taking its own shape — `volterTitleBar` takes the top bar's height moments after the
		// mount and the editor part is laid out again at a new height — so the pass is
		// repeated on every layout for one second and then the listener disposes itself.
		// After that the sash is the person's and nothing here touches it.
		const until = Date.now() + 1000;
		const settling = this.editorGroupsService.mainPart.onDidLayout(() => {
			if (Date.now() > until) { settling.dispose(); return; }
			apply();
		});
		this._register(settling);
	}

	/** One reconcile at a time; a publish during one queues exactly one more. */
	private schedule(): void {
		if (this.queued) { return; }
		this.queued = true;
		this.pass = this.pass.then(async () => {
			this.queued = false;
			try { await this.reconcile(); } catch { /* a closed group or a disposed input is not a failure to report */ }
		});
	}

	private async reconcile(): Promise<void> {
		// REBIND FIRST, so a closed group is a group that moved rather than the end of this
		// class's life. Everything below reads `this.group`, which `liveGroup` has just
		// made current.
		this.liveGroup();
		const documents = this.bridge.list();
		this.applying = true;
		try {
			const createdMain = this.bindMainGroup(documents);
			const areaDestinations = new Map<string, IEditorGroup>();
			// An area opens in its area group; other documents keep their native group. `preserveFocus` matters for the area: creating the split must not
			// take the caret out of whatever the person was typing in.
			const opened = new Set<string>();
			this.syncWorkingCopies(documents);
			for (const document of documents) {
				const input = this.inputFor(document);
				// Native tab moves own placement after the document is opened.
				const group = document.area ? this.groupForArea(document.area, document.id) : this.groupContaining(input) ?? this.group;
				if (document.area) {
					areaDestinations.set(document.id, group);
					// With only the Timeline restored, recreating the centre starts a
					// new split. Its native 50/50 default is not a saved user resize.
					if (createdMain && document.area.ratio > 0 && document.area.ratio < 1) {
						this.areaToSize.set(document.area.id, {group, area: document.area});
					}
				}
				if (!group.contains(input)) {
					opened.add(document.id);
					await this.editorService.openEditor(input, { inactive: true, preserveFocus: true, pinned: true }, group);
				}
			}
			// ACTIVATE ONLY ON A REAL CHANGE OF THE REGISTRY'S ACTIVE DOCUMENT. The registry
			// notifies on far more than activation — a dirty dot, a retitled model, a
			// utility appearing — and re-asserting our document on every one of those would
			// yank a person out of a Monaco editor open in this same group, on a beat they
			// did not cause. Activate when activeId changes or this pass opens that document's input.
			//
			// Area documents do not become the registry's active authoring subject.
			const centre = documents.filter(document => !document.area);
			const activeId = this.bridge.activeId();
			const active = centre.find(document => document.id === activeId) ?? centre[0];
			if (active) {
				const activeInput = this.inputFor(active);
				// Activate a document this pass just opened even when appliedActiveId already matches it. The memo
				// suppresses unrelated reassertions, not a person's reopen gesture.
				const activeGroup = this.groupContaining(activeInput) ?? this.group;
				if ((this.appliedActiveId !== active.id || opened.has(active.id)) && activeGroup.activeEditor !== activeInput) {
					await this.editorService.openEditor(activeInput, { pinned: true }, activeGroup);
				}
				this.appliedActiveId = active.id;
			}
			const wanted = new Set(documents.map(document => document.id));
			// A native restored input can precede its asynchronous content. Only an
			// actual removal from a previously registered open set means "close".
			// Missing source content stays a native tab, just like a missing text file.
			for (const id of wanted) { this.registeredDocuments.add(id); }
			for (const group of this.editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
				// NEVER EMPTY THE MAIN GROUP, for the reason the head of this file states:
				// closing its last editor detaches the pane container the bridge portals
				// into. An AREA group has no such contract — its document leaves with the
				// workspace switch that closed it, and the group goes with it.
				for (const editor of [...group.editors]) {
					if (!(editor instanceof VolterDocumentInput)) { continue; }
					const destination = editor.documentId === undefined ? undefined : areaDestinations.get(editor.documentId);
					if (destination && destination !== group) {
						// An area is one workspace surface, not an ordinary document's
						// intentionally split views. Retire old restored duplicates only.
						const area = documents.find(document => document.id === editor.documentId)?.area;
						await group.closeEditor(editor);
						if (group !== this.group && group.count === 0 && this.editorGroupsService.groups.includes(group)) {
							this.editorGroupsService.removeGroup(group);
						}
						if (area) { this.areaToSize.set(area.id, {group: destination, area}); }
						continue;
					}
					if (editor.documentId !== undefined && (wanted.has(editor.documentId) || !this.registeredDocuments.has(editor.documentId))) { continue; }
					if (group === this.group && editor.documentId === undefined && centre.length === 0) { continue; }
					await group.closeEditor(editor);
				}
			}
			// Apply sizes after all opens and closes so ratios use the final group split.
			for (const [id, pending] of [...this.areaToSize]) {
				this.areaToSize.delete(id);
				this.sizeAreaGroup(pending.group, pending.area);
			}
		} finally {
			this.applying = false;
			this.syncTabRow();
			this.reportActiveEditor();
		}
	}

	/** Hide the tab row when only one non-area editor is open in this window and editor actions are hidden.
	 * A second document or source file brings it back. Ignore area groups and overlay editor parts such as
	 * Settings. Update only after reconciliation so bootstrap opening and closing do not flicker the row. */
	private syncTabRow(): void {
		if (this.applying || this.groupGone) { return; }
		const areas = new Set(this.areaGroups.values());
		const tabs = this.editorGroupsService.getPart(this.group).groups
			.reduce((sum, group) => areas.has(group) ? sum : sum + group.count, 0);
		const onlyTheTab = this.configurationService.getValue<string>(EDITOR_ACTIONS_LOCATION) === 'hidden';
		this.group.setTabsHidden(onlyTheTab && tabs <= 1);
	}

	private groupContaining(input: VolterDocumentInput): IEditorGroup | undefined {
		return this.editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find(group => group.contains(input));
	}

	/** Native activation in any group selects its document; layout areas do not
	 * change the authoring subject (for example, clicking a Timeline area). */
	private reportActiveEditor(): void {
		if (this.applying) { return; }
		const editor = this.editorGroupsService.activeGroup.activeEditor;
		if (!(editor instanceof VolterDocumentInput) || editor.documentId === undefined) { return; }
		if (!this.bridge.list().some(document => document.id === editor.documentId && !document.area)) { return; }
		this.appliedActiveId = editor.documentId;
		this.bridge.activate(editor.documentId, documentView(this.editorGroupsService.activeGroup.id, editor)?.id);
	}
}
