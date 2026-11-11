// Written by scripts/workbench/overlay.mjs from packages/sdk/src/volter-contributions.ts.
/**
 * THE ONE READER of a package's `contributes.volter`: what each key declares, the modules it names, and the activation
 * events its contributions imply. The workbench's `volter` extension point (`workbench/src/volterExtensions.ts`, through
 * the copy the overlay writes beside it, `volterGeneratedContributions.ts`), the page's activation (editor-core's `page-activation.ts`) and
 * Node's manifest reader (`@volter/live/volter-manifest`) all read a package here, so a declaration means one thing
 * everywhere it is read.
 *
 * It imports nothing: the workbench half is compiled inside the Code-OSS fork, which resolves no package, so
 * `scripts/workbench/overlay.mjs` copies this file into it at every overlay.
 *
 * The keys are an EDITOR's (`editors`), a VIEW's by container (`views.panel`, `views.statusbar`), an INSPECTOR's, a LOOK's,
 * a FINDER's and a SERVICE's. `page` is the package's page half, and `product`, `serving`, `viewRoutes` and
 * `projectAdapters` are declarations read in Node ({@link DECLARATION_KEYS}); none of them is a contribution kind.
 *
 * `activationEvents` is Code-OSS's top-level key, stated here by a package whose only code is its page half: Code-OSS
 * refuses an extension that lists top-level `activationEvents` without a `main` or `browser` entry
 * (`extensionValidator.ts`'s `validateExtensionManifest`), so such a package lists its explicit events under
 * `contributes.volter` instead, and they join the ones its contributions imply.
 */

/** The `contributes.volter` keys that are declarations, not contribution kinds: the product's declaration (`product`,
 *  `@volter/live/product-locator`), the server half (`serving`, editor-core's `server/session-product.ts`), the
 *  limited view's module (`viewRoutes`) and the adapters a package supplies for projects like a kind it knows
 *  (`projectAdapters`, editor-core's `server/session-product.ts`). */
const DECLARATION_KEYS: ReadonlySet<string> = new Set(['product', 'serving', 'viewRoutes', 'projectAdapters']);

/**
 * One editor a package declares under `contributes.volter.editors` with the files it opens (Code-OSS's `selector` and
 * `priority`, as `contributes.notebooks` states them). Code-OSS's `customEditors` is not used: it means a webview editor.
 */
export interface VolterEditorDeclaration {
	/** The editor's id in the resolver (`volter.<integration>.model`). */
	readonly viewType: string;
	/** What "Reopen Editor With…" lists. */
	readonly displayName: string;
	readonly filenamePatterns: readonly string[];
	readonly priority: 'default' | 'option';
}

/**
 * One panel view a package declares under `contributes.volter.views.panel`: `{ id, title, module }`, as an editor states
 * its `viewType` and `displayName`. The workbench registers its panel view from this before any of the package's code
 * loads, and the view's first showing is the package's `onView:<id>`.
 */
export interface VolterUtilityDeclaration {
	readonly id: string;
	readonly title: string;
}

/** One contribution module a package declares: the key it is listed under (`views.panel` for a panel view), its
 *  `./`-relative module, and a panel view's or a finder's own statement. */
export interface VolterContribution {
	readonly key: string;
	readonly entry: string;
	readonly declared?: VolterUtilityDeclaration;
	readonly finder?: string;
}

/** A package's `contributes.volter`, read. */
interface VolterContributions {
	/** Each contribution module, in declaration order; a refused entry is left out. */
	readonly entries: readonly VolterContribution[];
	/** The file editors, for the workbench's editor resolver. */
	readonly editors: readonly VolterEditorDeclaration[];
	/** The panel views. */
	readonly utilities: readonly VolterUtilityDeclaration[];
	/** The activation events the contributions imply ({@link activationEvents}). */
	readonly events: readonly string[];
	/** Why each refused entry is refused, as `contributes.volter.<key>: <why>.` */
	readonly errors: readonly string[];
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** A declared list's string entries. */
function strings(list: unknown): string[] {
	return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** A contribution module's id, its base name without its extension: `contributions/timeline.document.tsx` is
 *  `timeline.document`. An editor's `document` implies `onDocument:<id>`, and the loader records a module by it. */
export function contributionIdFromPath(entry: string): string {
	return (entry.split(/[\\/]/).pop() ?? entry).replace(/\.[jt]sx?$/, '');
}

/** One `contributes.volter.editors` entry, read. */
interface ReadEditor {
	readonly declaration?: VolterEditorDeclaration;
	/** The document module the page loads; absent for a kind or an asset route the package registers in code. */
	readonly document?: string;
	readonly kind?: string;
	readonly views?: readonly string[];
	readonly assetRoute?: string;
}

function readEditor(value: unknown): ReadEditor | string {
	const editor = record(value);
	if (editor === null) return 'an entry is not an object';
	const { viewType, displayName, document, selector, priority, kind, views, assetRoute } = editor;
	if (document !== undefined && typeof document !== 'string') return 'a document is a ./-relative module';
	if (kind !== undefined && (typeof kind !== 'string' || kind === '')) return 'a kind is a non-empty string';
	if (views !== undefined && (kind === undefined || !Array.isArray(views) || views.some((view) => typeof view !== 'string'))) return "views are a kind's list of view document ids";
	if (assetRoute !== undefined && (typeof assetRoute !== 'string' || assetRoute === '')) return 'an assetRoute is a non-empty string';
	if (document === undefined && kind === undefined && assetRoute === undefined) return 'an entry names a document, a kind or an assetRoute';
	const read = {
		...(document === undefined ? {} : { document }),
		...(kind === undefined ? {} : { kind }),
		...(views === undefined ? {} : { views: views as string[] }),
		...(assetRoute === undefined ? {} : { assetRoute }),
	};
	if (viewType === undefined && displayName === undefined && selector === undefined && priority === undefined) return read;
	if (typeof viewType !== 'string' || typeof displayName !== 'string' || typeof document !== 'string') return 'a file editor needs a viewType, a displayName and a document module';
	const filenamePatterns = Array.isArray(selector) ? selector.map((item) => record(item)?.['filenamePattern']) : [];
	if (filenamePatterns.length === 0 || filenamePatterns.some((pattern) => typeof pattern !== 'string')) return `${viewType}'s selector must list its { filenamePattern }s`;
	if (priority !== undefined && priority !== 'default' && priority !== 'option') return `${viewType}'s priority is 'default' or 'option'`;
	return { ...read, declaration: { viewType, displayName, filenamePatterns: filenamePatterns as string[], priority: priority ?? 'default' } };
}

/** One `contributes.volter.services` entry, read: a module, or `{ module, sourceAnalyzer?, designTimeMount? }`. */
function readService(value: unknown): { readonly module: string; readonly sourceAnalyzer?: string; readonly designTimeMount?: string } | string {
	if (typeof value === 'string') return { module: value };
	const { module, sourceAnalyzer, designTimeMount } = record(value) ?? {};
	if (typeof module !== 'string' || [sourceAnalyzer, designTimeMount].some((id) => id !== undefined && (typeof id !== 'string' || id === ''))) {
		return 'an entry is a ./-relative module, or { module, sourceAnalyzer?, designTimeMount? }';
	}
	return {
		module,
		...(typeof sourceAnalyzer === 'string' ? { sourceAnalyzer } : {}),
		...(typeof designTimeMount === 'string' ? { designTimeMount } : {}),
	};
}

/** One `contributes.volter.finders` entry, read. */
function readFinder(value: unknown): { readonly name: string; readonly module: string } | string {
	const { name, module } = record(value) ?? {};
	if (typeof name !== 'string' || name === '' || typeof module !== 'string') return 'an entry is { name, module }, each a non-empty string';
	return { name, module };
}

/** One `contributes.volter.views.panel` entry, read. */
function readUtility(value: unknown): { readonly declaration: VolterUtilityDeclaration; readonly module: string } | string {
	const { id, title, module } = record(value) ?? {};
	if (typeof id !== 'string' || id === '' || typeof title !== 'string' || title.trim() === '' || typeof module !== 'string') return 'an entry is { id, title, module }, each a non-empty string';
	return { declaration: { id, title: title.trim() }, module };
}

/**
 * Read a package's `contributes.volter` (`declared`, unchecked). Each key is a list; the views are keyed by container,
 * as Code-OSS's `contributes.views` is. An entry that is refused is left out and named in `errors`.
 *
 * The implied activation events are Code-OSS's for an extension's contributions (`ImplicitActivationEvents`), carried
 * the same way by Volter's:
 * - for each `editors` entry, `onCustomEditor:<viewType>`, `onDocument:<id>` for its `document` (the module's base
 *   name), `onDocument:<kind>` and `onDocument:<view>` for its `kind` and `views`, and `onAssetViewer:<route>` for its
 *   `assetRoute`;
 * - `onView:<id>` for each `views.panel` entry;
 * - `onFinder:<name>` for each `finders` entry;
 * - for each `services` entry, `onSourceAnalysis:<id>` and `onDesignTimeMount:<medium>`;
 * - and each event `activationEvents` lists.
 */
export function readVolterContributions(declared: unknown): VolterContributions {
	const entries: VolterContribution[] = [];
	const editors: VolterEditorDeclaration[] = [];
	const utilities: VolterUtilityDeclaration[] = [];
	const events: string[] = [];
	const errors: string[] = [];
	const kinds = record(declared);
	if (kinds === null) return { entries, editors, utilities, events, errors: ['`contributes.volter` must be an object of kinds, each a list of ./-relative modules.'] };
	const listed: [string, unknown][] = [];
	for (const [key, list] of Object.entries(kinds)) {
		if (key === 'page' || DECLARATION_KEYS.has(key)) continue;
		if (key === 'activationEvents') {
			if (!Array.isArray(list) || list.some((event) => typeof event !== 'string')) errors.push('`contributes.volter.activationEvents` must be a list of activation events.');
			else events.push(...(list as string[]));
			continue;
		}
		if (key !== 'views') { listed.push([key, list]); continue; }
		const containers = record(list);
		if (containers === null) { errors.push('`contributes.volter.views` must be an object of containers: `panel`, `statusbar`.'); continue; }
		for (const [container, views] of Object.entries(containers)) listed.push([`views.${container}`, views]);
	}
	for (const [key, list] of listed) {
		if (!Array.isArray(list)) { errors.push(`\`contributes.volter.${key}\` must be a list.`); continue; }
		for (const entry of list) {
			const refuse = (why: string): void => { errors.push(`\`contributes.volter.${key}\`: ${why}.`); };
			if (key === 'views.panel') {
				const view = readUtility(entry);
				if (typeof view === 'string') { refuse(view); continue; }
				utilities.push(view.declaration);
				entries.push({ key, entry: view.module, declared: view.declaration });
				events.push(`onView:${view.declaration.id}`);
			} else if (key === 'finders') {
				const finder = readFinder(entry);
				if (typeof finder === 'string') { refuse(finder); continue; }
				entries.push({ key, entry: finder.module, finder: finder.name });
				events.push(`onFinder:${finder.name}`);
			} else if (key === 'services') {
				const service = readService(entry);
				if (typeof service === 'string') { refuse(service); continue; }
				entries.push({ key, entry: service.module });
				if (service.sourceAnalyzer !== undefined) events.push(`onSourceAnalysis:${service.sourceAnalyzer}`);
				if (service.designTimeMount !== undefined) events.push(`onDesignTimeMount:${service.designTimeMount}`);
			} else if (key === 'editors') {
				// An editor's document module is a document contribution like any other; a kind or an asset route the package
				// registers in code names no module, and implies its activation events alone.
				const editor = readEditor(entry);
				if (typeof editor === 'string') { refuse(editor); continue; }
				if (editor.declaration) { editors.push(editor.declaration); events.push(`onCustomEditor:${editor.declaration.viewType}`); }
				if (editor.document !== undefined) { entries.push({ key, entry: editor.document }); events.push(`onDocument:${contributionIdFromPath(editor.document)}`); }
				if (editor.kind !== undefined) events.push(`onDocument:${editor.kind}`);
				for (const view of editor.views ?? []) events.push(`onDocument:${view}`);
				if (editor.assetRoute !== undefined) events.push(`onAssetViewer:${editor.assetRoute}`);
			} else if (typeof entry !== 'string') {
				refuse(`${JSON.stringify(entry)} is not a ./-relative module`);
			} else {
				entries.push({ key, entry });
			}
		}
	}
	return { entries, editors, utilities, events, errors };
}

/** `contributes[key]`, unchecked. */
function contributed(packageJSON: Readonly<Record<string, unknown>>, key: string): unknown {
	return record(packageJSON['contributes'])?.[key];
}

/** The commands a package declares (`contributes.commands`), by id. */
function commandIds(packageJSON: Readonly<Record<string, unknown>>): string[] {
	const commands = contributed(packageJSON, 'commands');
	return (Array.isArray(commands) ? commands : []).flatMap((command) => {
		const id = record(command)?.['command'];
		return typeof id === 'string' ? [id] : [];
	});
}

/**
 * A package's activation events, as Code-OSS forms an extension's: the explicit ones it lists in its top-level
 * `activationEvents`, `onCommand:<id>` for each `contributes.commands` entry, and the ones its `contributes.volter`
 * implies ({@link readVolterContributions}). One list governs the package's page half and its extension-host half, as
 * one Code-OSS extension's `main` and `browser` entries share theirs.
 */
export function activationEvents(packageJSON: Readonly<Record<string, unknown>>): readonly string[] {
	return [
		...strings(packageJSON['activationEvents']),
		...commandIds(packageJSON).map((id) => `onCommand:${id}`),
		...readVolterContributions(contributed(packageJSON, 'volter') ?? {}).events,
	];
}

/**
 * The commands a package's page half answers: those it declares (`contributes.commands`), less, in a package with an
 * extension-host half (`main` or `browser`), the ones its `activationEvents` name (`onCommand:<id>`), which that half
 * registers.
 */
export function pageCommandIds(packageJSON: Readonly<Record<string, unknown>>): string[] {
	const hosted = packageJSON['main'] !== undefined || packageJSON['browser'] !== undefined;
	const hostCommands = new Set(hosted ? strings(packageJSON['activationEvents']) : []);
	return commandIds(packageJSON).filter((id) => !hostCommands.has(`onCommand:${id}`));
}

/** `contributes.volter.page`, checked: one `./`-relative module, or none. */
export function readPageEntry(name: string, page: unknown): { readonly entry: string | null } | { readonly malformed: string } {
	if (page === undefined) return { entry: null };
	const listed = Array.isArray(page) ? page : null;
	if (listed === null || listed.length > 1 || (listed.length === 1 && (typeof listed[0] !== 'string' || !listed[0].startsWith('./') || listed[0].includes('..')))) {
		return {
			malformed:
				`${name}'s package.json#contributes.volter.page is ${JSON.stringify(page)}: it lists one page entry, ` +
				'a ./-relative module without parent traversal that exports activate(context).',
		};
	}
	return { entry: (listed[0] as string | undefined) ?? null };
}

/** A declaration's one module (`serving`, `viewRoutes`: a one-entry list), unchecked; `undefined` when the package
 *  declares none and `null` when the declaration is not a one-entry list. */
export function declaredModule(declared: unknown, key: 'serving' | 'viewRoutes'): unknown {
	const listed = record(declared)?.[key];
	if (listed === undefined) return undefined;
	return Array.isArray(listed) && listed.length === 1 ? listed[0] : null;
}
