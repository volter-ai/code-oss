/*
 * EVERY WAIT IN THE EDITOR, shown where Code-OSS shows an extension's progress. The page reports
 * its waits through `@volter/sdk/progress` (the bridge below), which the session also reads as the
 * page's phase; the kit's own open reports through `beginLaunchWait`. The rules, all here:
 *
 *   * a document's wait is on the progress bar of each editor that shows the document
 *     (`IEditorProgressService`, read by `VolterDocumentPane`);
 *   * a panel's wait is on its view's progress bar alone, as Code-OSS's view progress is, and
 *     never becomes a notification;
 *   * ONE wait is the window's: the newest of the document in front, else the newest of the
 *     editor's own (not the engine steps only the session names), else the open's. It is the status bar's phase (`ProgressLocation.Window`), and
 *     once it has run long a notification with progress (`ProgressLocation.Notification`) with
 *     its actions. It has no title of its own, so a wait that moves to its next phase, or an open
 *     that moves to its document, stays the same notification. A document behind its tab is not
 *     the window's wait.
 *
 * The waits are read once per task, so work begun and ended in one task shows nothing.
 * Nothing here draws in a document or a view: a document still opening keeps its empty frame.
 */

import { DeferredPromise } from '../../../../base/common/async.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VolterDocumentInput } from './volterDocumentInput.js';

/** Something a person can do about a wait (`@volter/sdk/progress`'s `ProgressAction`, mirrored). */
export interface VolterProgressAction {
	readonly label: string;
	readonly run: () => void;
}

/** One wait the page reports (`@volter/sdk/progress`'s `ProgressEntry`, mirrored). */
export interface VolterProgressItem {
	readonly id: string;
	readonly title: string;
	readonly message?: string | undefined;
	readonly documentId?: string | undefined;
	readonly view?: 'outliner' | 'properties' | undefined;
	readonly actions?: readonly VolterProgressAction[] | undefined;
	/** Work only the session names (an engine's step), which the window never shows. */
	readonly internal?: boolean | undefined;
}

export interface VolterProgressBridge {
	/** Every wait the page has now. */
	list(): readonly VolterProgressItem[];
	/** Fires when they change. */
	subscribe(listener: () => void): () => void;
}

/** When the window's wait has run long and becomes a notification. */
const LONG_WAIT_MS = 15_000;
/** When an editor's progress bar appears: Code-OSS's own for an editor opening once the workbench is restored (`EditorPanes`). */
export const BAR_DELAY_MS = 800;
/** When a view's progress bar appears: Code-OSS's own for the Explorer (`ExplorerService`). */
const VIEW_DELAY_MS = 500;

const text = (wait: { readonly title: string; readonly message?: string | undefined }): string =>
	wait.message ? `${wait.title}: ${wait.message}` : wait.title;
const labels = (actions: readonly VolterProgressAction[]): string => actions.map(action => action.label).join('\u0000');

// ---- The documents that are waiting, for their editors' progress bars.

let waitingDocuments = new Set<string>();
const documentWaitsChanged = new Emitter<void>();
export const onDidChangeDocumentWaits: Event<void> = documentWaitsChanged.event;

/** Whether `documentId` has a wait, which its editor's progress bar shows. */
export function documentWaiting(documentId: string | undefined): boolean {
	return documentId !== undefined && waitingDocuments.has(documentId);
}

// ---- The window's one wait.

class WindowWait {
	private reporters = new Set<IProgress<IProgressStep>>();
	private readonly over = new DeferredPromise<void>();
	/** What shows the wait now: the status bar's phase, or its notification. */
	private phase = new DeferredPromise<void>();
	private notifying = false;
	private long: number | undefined;

	constructor(
		private readonly progressService: IProgressService,
		private message: string,
		private actions: readonly VolterProgressAction[],
		/** The wait's actions as the page holds them now, so the latest `run` runs. */
		private readonly latestActions: () => readonly VolterProgressAction[],
	) {
		this.inStatusBar();
	}

	private show(options: Parameters<IProgressService['withProgress']>[0], until: Promise<void>): void {
		this.progressService.withProgress(options, async (reporter) => {
			this.reporters.add(reporter);
			reporter.report({ message: this.message });
			try { await until; } finally { this.reporters.delete(reporter); }
		}).catch(onUnexpectedError);
	}

	/** The status bar's phase; RUN LONG, and it becomes a notification, as Code-OSS's own delayed notification
	 *  progress does (hidden, the notification goes back to the status bar itself). */
	private inStatusBar(): void {
		this.phase.complete();
		this.phase = new DeferredPromise<void>();
		this.notifying = false;
		this.show({ location: ProgressLocation.Window }, this.phase.p);
		mainWindow.clearTimeout(this.long);
		this.long = mainWindow.setTimeout(() => this.notify(), LONG_WAIT_MS);
	}

	private notify(): void {
		this.phase.complete();
		const phase = this.phase = new DeferredPromise<void>();
		this.notifying = true;
		const primaryActions: IAction[] = this.actions.map((action, index) => toAction({
			id: `volter.progress.action.${index}`,
			label: action.label,
			run: () => {
				// Code-OSS closes a notification when one of its buttons runs, and its status-bar fallback with
				// it: the wait goes back to the status bar and becomes a notification again if it runs long, so
				// what the action started stays in sight and the action is offered again.
				this.inStatusBar();
				this.latestActions().find(latest => latest.label === action.label)?.run();
			},
		}));
		this.show({ location: ProgressLocation.Notification, primaryActions }, Promise.race([phase.p, this.over.p]));
	}

	update(message: string, actions: readonly VolterProgressAction[]): void {
		const offered = labels(this.actions);
		this.actions = actions;
		if (message !== this.message) {
			this.message = message;
			for (const reporter of this.reporters) { reporter.report({ message }); }
		}
		// A notification's actions are fixed when it is made: new ones make it again.
		if (this.notifying && offered !== labels(actions)) { this.notify(); }
	}

	done(): void {
		mainWindow.clearTimeout(this.long);
		this.phase.complete();
		this.over.complete();
	}
}

let progressService: IProgressService | undefined;
let windowWait: WindowWait | undefined;
/** The kit's own open, while it stands. */
let launch: { readonly title: string; message: string } | undefined;
/** The page's waits, as the bridge last listed them, and the bridge to read them again. */
let pageWaits: readonly VolterProgressItem[] = [];
let listPageWaits: (() => readonly VolterProgressItem[]) | undefined;
/** The page wait the window shows, by id. */
let shownWait: string | undefined;
const latestActions = (): readonly VolterProgressAction[] =>
	listPageWaits?.().find(wait => wait.id === shownWait)?.actions ?? [];
/** The document in front: the active editor's. */
let front: string | undefined;
/** The views' progress, by wait. */
const viewWaits = new Map<string, DeferredPromise<void>>();
let viewIds: { readonly outliner: string; readonly properties: string } | undefined;

let scheduled = false;
function schedule(): void {
	if (scheduled) { return; }
	scheduled = true;
	queueMicrotask(() => { scheduled = false; reconcile(); });
}

function reconcile(): void {
	const documents = new Set(pageWaits.flatMap(wait => wait.documentId !== undefined ? [wait.documentId] : []));
	if (documents.size !== waitingDocuments.size || [...documents].some(id => !waitingDocuments.has(id))) {
		waitingDocuments = documents;
		documentWaitsChanged.fire();
	}

	const live = new Set<string>();
	for (const wait of pageWaits) {
		if (!wait.view || !viewIds || !progressService) { continue; }
		live.add(wait.id);
		if (viewWaits.has(wait.id)) { continue; }
		const over = new DeferredPromise<void>();
		viewWaits.set(wait.id, over);
		progressService.withProgress({ location: viewIds[wait.view], delay: VIEW_DELAY_MS }, () => over.p).catch(onUnexpectedError);
	}
	for (const [id, over] of viewWaits) {
		if (!live.has(id)) { over.complete(); viewWaits.delete(id); }
	}

	const page = pageWaits.filter(wait => wait.documentId !== undefined && wait.documentId === front).at(-1)
		?? pageWaits.filter(wait => wait.documentId === undefined && wait.view === undefined && !wait.internal).at(-1);
	shownWait = page?.id;
	const shown = page ? { message: text(page), actions: page.actions ?? [] } : launch ? { message: text(launch), actions: [] } : undefined;
	if (!shown || !progressService) {
		windowWait?.done();
		windowWait = undefined;
		return;
	}
	if (windowWait) { windowWait.update(shown.message, shown.actions); }
	else { windowWait = new WindowWait(progressService, shown.message, shown.actions, latestActions); }
}

export interface VolterWait {
	/** Say what the wait is doing now. */
	update(message: string): void;
	/** The wait is over. */
	done(): void;
}

/** The kit's own open as the window's wait, until `done`; the page's waits stand in front of it. */
export function beginLaunchWait(service: IProgressService, title: string, message: string): VolterWait {
	progressService = service;
	const mine = launch = { title, message };
	schedule();
	return {
		update(next) {
			if (launch !== mine || mine.message === next) { return; }
			mine.message = next;
			schedule();
		},
		done() {
			if (launch !== mine) { return; }
			launch = undefined;
			schedule();
		},
	};
}

/** The page's waits (`@volter/sdk/progress`), read from its bridge while the editor is mounted. */
export class VolterProgress extends Disposable {

	constructor(
		bridge: VolterProgressBridge,
		/** The workbench views a panel's wait shows in. */
		views: { readonly outliner: string; readonly properties: string },
		@IProgressService service: IProgressService,
		@IEditorService editorService: IEditorService,
	) {
		super();
		progressService = service;
		viewIds = views;
		listPageWaits = () => bridge.list();
		const read = () => { pageWaits = bridge.list(); schedule(); };
		const readFront = () => {
			const active = editorService.activeEditor;
			front = active instanceof VolterDocumentInput ? active.documentId : undefined;
			schedule();
		};
		this._register(toDisposable(bridge.subscribe(read)));
		this._register(editorService.onDidActiveEditorChange(readFront));
		this._register(toDisposable(() => { pageWaits = []; listPageWaits = undefined; viewIds = undefined; schedule(); }));
		read();
		readFront();
	}
}
