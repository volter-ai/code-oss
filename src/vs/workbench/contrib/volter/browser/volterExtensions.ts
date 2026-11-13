/* Volter packages register their contributes.volter declarations with the
 * Code-OSS extension service. Session package folders are installed through
 * installFromLocation and withdrawn packages are uninstalled.
 * The renderer imports contribution modules and activates page entries in
 * dependency order; browser entries execute in the extension host.
 * VolterContributionsBridge carries the catalog to mountVolter without an
 * src/vs module importing editor code. See docs/adr/plugin-apis.md. */

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { IExtensionService, toExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ILocalExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { match } from '../../../../base/common/glob.js';
import { readVolterContributions, type VolterContribution, type VolterEditorDeclaration, type VolterStatusItemDeclaration, type VolterUtilityDeclaration } from './volterGeneratedContributions.js';

/** The publisher every Volter package names, so the installed ones are known by the profile alone. */
const VOLTER_PUBLISHER = 'volter';

/** One contribution as a package declares it (`@volter/sdk/volter-contributions`'s `VolterContribution`), with its
 *  package. */
export interface VolterContributionEntry extends VolterContribution {
	/** The package's name (`@volter/<package>`). */
	readonly package: string;
	/** The package's folder, as the extension service located it. */
	readonly location: string;
}

/**
 * One installed package as the editor activates its page half (`editor-core/src/page-activation.ts`): its
 * Code-OSS id, its `extensionDependencies` and its `contributes.volter.page`, both unchecked.
 */
export interface VolterPackageDeclaration {
	/** `publisher.name`, as Code-OSS forms it (`volter.@volter/<package>`). */
	readonly id: string;
	readonly name: string;
	readonly location: string;
	readonly packageJSON: Readonly<Record<string, unknown>>;
	readonly extensionDependencies: unknown;
	readonly page: unknown;
}

/** What `mountVolter`'s `frame` argument carries to the editor (`bridge.tsx`). */
export interface VolterContributionsBridge {
	list(): readonly VolterContributionEntry[];
	packages(): readonly VolterPackageDeclaration[];
	/** The declared editors whose files `path` is, by viewType ({@link volterEditorsForFile}). */
	editorsForFile(path: string): readonly string[];
	subscribe(listener: () => void): () => void;
}

const extensionPoint = ExtensionsRegistry.registerExtensionPoint<Record<string, unknown>>({
	extensionPoint: 'volter',
	jsonSchema: {
		description: "A Volter package's contributions to the Volter editor, for what Code-OSS has no key for, keyed by kind.",
		type: 'object',
		properties: {
			editors: {
				description: "What the package opens. An entry is a file editor (`viewType`, `displayName`, `selector`, `priority` and its `document` module), a document with no file (`document` alone), a document kind the package registers in code (`kind`, with the `views` documents that open it), or an Asset Lab route it registers a viewer for (`assetRoute`). Each implies its activation events: `onCustomEditor:<viewType>`, `onDocument:<document's base name>`, `onDocument:<kind>` and `onDocument:<view>`, `onAssetViewer:<route>`.",
				type: 'array',
				items: {
					type: 'object',
					properties: {
						viewType: { type: 'string', description: "The file editor's id." },
						displayName: { type: 'string', description: 'What "Reopen Editor With…" lists.' },
						document: { type: 'string', description: 'The ./-relative document module.' },
						selector: { type: 'array', items: { type: 'object', required: ['filenamePattern'], properties: { filenamePattern: { type: 'string' } } } },
						priority: { enum: ['default', 'option'], description: 'Whether it opens these files by default, or is one option among their editors.' },
						kind: { type: 'string', description: 'A document kind or id the package registers in code (an opener, a restorer or a board).' },
						views: { type: 'array', items: { type: 'string' }, description: 'The view documents that open the kind.' },
						assetRoute: { type: 'string', description: 'An Asset Lab route the package registers a viewer for in code.' },
					},
				},
			},
			views: {
				description: "The package's views, keyed by container as Code-OSS's `contributes.views` is: `panel` lists panel views (`{ id, title, module }`, each `onView:<id>`), `statusbar` lists status-bar items (`{ id, name, alignment, priority, module }`, Code-OSS's `contributes.statusBarItems` fields with a module for its text and command).",
				type: 'object',
				properties: {
					panel: {
						type: 'array',
						items: {
							type: 'object',
							required: ['id', 'title', 'module'],
							properties: {
								id: { type: 'string', description: "The view's id, which `onView:<id>` names." },
								title: { type: 'string', description: "The view's title." },
								module: { type: 'string', description: 'The ./-relative view module.' },
							},
						},
					},
					statusbar: {
						type: 'array',
						items: {
							type: 'object',
							required: ['id', 'name', 'alignment', 'module'],
							properties: {
								id: { type: 'string', description: "The item's id, unique within the package." },
								name: { type: 'string', description: "What a person calls the item: the status bar's own menu lists it by this name." },
								alignment: { enum: ['left', 'right'], description: 'The side of the status bar.' },
								priority: { type: 'number', description: 'Higher is further left, as Code-OSS orders its status bar.' },
								module: { type: 'string', description: "The ./-relative module whose default export renders the item's content." },
							},
						},
					},
				},
				additionalProperties: false,
			},
			inspectors: {
				description: "The package's selection inspectors: ./-relative modules.",
				type: 'array', items: { type: 'string' },
			},
			finders: {
				description: "The package's finders: each one's name and ./-relative module.",
				type: 'array',
				items: {
					type: 'object',
					required: ['name', 'module'],
					properties: {
						name: { type: 'string', description: "The finder's name, which its module's `finder` states and `onFinder:<name>` names." },
						module: { type: 'string', description: 'The ./-relative finder module.' },
					},
				},
			},
			looks: {
				description: "The package's looks: ./-relative modules, each a layout, a keymap, a style or an environment by the `point` it exports. Data, registered without activating the package.",
				type: 'array', items: { type: 'string' },
			},
			services: {
				description: "The package's services: ./-relative modules exporting start(), or { module, sourceAnalyzer?, designTimeMount? } for one that registers a source analyzer (`onSourceAnalysis:<id>`) or a design-time mount (`onDesignTimeMount:<medium>`).",
				type: 'array',
				items: {
					anyOf: [
						{ type: 'string' },
						{
							type: 'object',
							required: ['module'],
							properties: {
								module: { type: 'string', description: 'The ./-relative service module.' },
								sourceAnalyzer: { type: 'string', description: 'The source analyzer it registers.' },
								designTimeMount: { type: 'string', description: 'The medium it registers a design-time mount for.' },
							},
						},
					],
				},
			},
			activationEvents: {
				description: "Code-OSS's `activationEvents`, for a package whose only code is its page half: Code-OSS refuses top-level `activationEvents` without a `main` or `browser` entry. They join the events the package's contributions imply.",
				type: 'array', items: { type: 'string' },
			},
			page: {
				description: "The package's page half: one ./-relative module exporting activate(context), whose result is the package's API.",
				type: 'array', maxItems: 1, items: { type: 'string' },
			},
			viewRoutes: {
				description: "The package's routes in a limited view: one ./-relative browser module exporting viewRoutes(services).",
				type: 'array', maxItems: 1, items: { type: 'string' },
			},
			product: {
				description: "A product package's declaration: its entry, the packages it composes, its name, install line, color theme and workbench release. Read in Node by `@volter/live/product-locator`; the page loads none of it.",
				type: 'object',
			},
			serving: {
				description: "The package's server half: one ./-relative Node module exporting servingPlugins(services), which joins the session's Vite. The page loads none of it.",
				type: 'array', maxItems: 1, items: { type: 'string' },
			},
			projectAdapters: {
				description: "The adapters the package supplies for projects that have a file of its kind and no editor/volter.adapter.ts of their own: { when, module }, `when` a file in the project's folder and `module` a ./-relative module exporting defineAdapter(...). Read in Node by the session.",
				type: 'array',
				items: { type: 'object', required: ['when', 'module'], properties: { when: { type: 'string' }, module: { type: 'string' } } },
			},
		},
		additionalProperties: false,
	},
});

let entries: readonly VolterContributionEntry[] = [];
let packages: readonly VolterPackageDeclaration[] = [];
let editors: readonly VolterEditorDeclaration[] = [];
let utilities: readonly VolterUtilityDeclaration[] = [];
let statusItems: readonly VolterPackageStatusItem[] = [];
const listeners = new Set<() => void>();

extensionPoint.setHandler(extensions => {
	const next: VolterContributionEntry[] = [];
	const nextPackages: VolterPackageDeclaration[] = [];
	const nextEditors: VolterEditorDeclaration[] = [];
	const nextUtilities: VolterUtilityDeclaration[] = [];
	const nextStatusItems: VolterPackageStatusItem[] = [];
	for (const extension of extensions) {
		const declared = extension.value;
		if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
			extension.collector.error("`contributes.volter` must be an object of kinds, each a list of ./-relative modules.");
			continue;
		}
		const { description } = extension;
		const at = { package: description.name, location: folderOf(description.extensionLocation) };
		nextPackages.push({
			id: description.identifier.value, name: description.name, location: at.location,
			packageJSON: description as unknown as Record<string, unknown>,
			extensionDependencies: description.extensionDependencies, page: (declared as Record<string, unknown>)['page'],
		});
		// The page entry is the package's, not a contribution kind: the editor checks it as it activates. The view routes
		// are the limited view's, and a product's declaration and a serving half are read in Node.
		const read = readVolterContributions(declared);
		for (const error of read.errors) { extension.collector.error(error); }
		nextEditors.push(...read.editors);
		nextUtilities.push(...read.utilities);
		nextStatusItems.push(...read.statusItems.map(item => ({ ...item, package: description.name })));
		next.push(...read.entries.map(entry => ({ ...at, ...entry })));
	}
	entries = next;
	packages = nextPackages;
	editors = nextEditors;
	utilities = nextUtilities;
	statusItems = nextStatusItems;
	for (const listener of listeners) { listener(); }
});

/** A folder as a location's path, and back: Windows's `C:\x` is the path `/C:/x`. The session's
 *  folders are its own machine's, whichever platform this page runs on. */
function pathOf(folder: string): string { return folder.replaceAll('\\', '/').replace(/^(?=[A-Za-z]:\/)/, '/'); }
function folderOf(location: URI): string { return location.path.replace(/^\/(?=[A-Za-z]:\/)/, ''); }

/** The editors the installed packages declare, for the workbench's editor resolver. */
export function volterEditors(): readonly VolterEditorDeclaration[] { return editors; }

/** The declared editors whose files a resource named `name` is, by viewType: Code-OSS's glob `match` of each
 *  `filenamePattern` against the basename, as the editor resolver matches it. */
export function volterEditorsForFile(name: string): readonly string[] {
	return editors.filter(editor => editor.filenamePatterns.some(pattern => match(pattern, name))).map(editor => editor.viewType);
}

/** The panel views the installed packages declare (`contributes.volter.views.panel`). */
export function volterUtilities(): readonly VolterUtilityDeclaration[] { return utilities; }

/** One status-bar item a package declares (`contributes.volter.views.statusbar`), with its package. */
export interface VolterPackageStatusItem extends VolterStatusItemDeclaration {
	readonly package: string;
}

/** The status-bar items the installed packages declare. */
export function volterStatusItems(): readonly VolterPackageStatusItem[] { return statusItems; }

/** Fires when the installed packages' contributions, their editors included, change. */
export function onDidChangeVolterContributions(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export const volterContributions: VolterContributionsBridge = {
	list: () => entries,
	packages: () => packages,
	editorsForFile: path => volterEditorsForFile(path.split('/').pop() ?? path),
	subscribe: onDidChangeVolterContributions,
};

/**
 * Make the session's packages the installed Volter extensions: each one the session lists is
 * installed from its folder, and each installed one it no longer lists is uninstalled. With a
 * remote server the folder is a `vscode-remote:` location on it; without one (the limited view)
 * it is a path of this page's own origin, and Code-OSS installs it as a web extension. One call,
 * `installFromLocation`, routes both by the location's scheme.
 *
 * A PACKAGE WHOSE MANIFEST CHANGED IS INSTALLED AGAIN. Code-OSS's extension host runs the user extensions as its scan
 * of them last found them (its cache, whose key is the extensions list's modification time, not each manifest), as a
 * version is unchanging; a checkout's package changes its manifest without its version between releases. So a package
 * the session marks `changed` (its manifest written after the list, `editor-core/server/session-product.ts`) is
 * uninstalled and installed again from its folder, as Code-OSS updates an extension, which writes the list, so the
 * next scan is fresh, and the page reloads on its new manifest. Answers how many it uninstalled.
 *
 * IT ANSWERS ONCE THE EXTENSION SERVICE HAS REGISTERED THE PACKAGES. The editor's first pass reads the packages the
 * `volter` point has, and the point hears of them only as the service registers them: the installed ones once its
 * first scan is done (`whenInstalledExtensionsRegistered`), and one installed here after the install resolves, from
 * the service's own queue of changes, one install at a time. A page that mounted on the installs alone activated a
 * package before the one it depends on was registered ("depends on unknown extension"). So each one installed is
 * awaited as Code-OSS's own install action awaits it (`InstallAction`'s `getRunningExtension`): until the service holds
 * it, when the service will register it. Before a reload nothing is awaited: the next load scans them all.
 */
export async function reconcileVolterExtensions(
	packages: readonly { readonly name: string; readonly dir: string; readonly changed?: boolean }[],
	remoteAuthority: string | undefined,
	pageOrigin: string,
	extensionManagement: IWorkbenchExtensionManagementService,
	extensionService: IExtensionService,
	extensionEnablement: IWorkbenchExtensionEnablementService,
): Promise<number> {
	const installed = (await extensionManagement.getInstalled(ExtensionType.User)).filter(extension => extension.manifest.publisher === VOLTER_PUBLISHER);
	const listed = packages.map(({ dir }) => pathOf(dir));
	// Uninstalls first: Code-OSS uninstalls by identifier, so a package listed at a new folder would lose the install
	// made from it if its old entry went afterwards. One batch: Code-OSS refuses to uninstall a package an installed one
	// still depends on (`extensionDependencies`), unless the dependent goes in the same call.
	const changed = (extension: typeof installed[number]): boolean =>
		packages.some(({ dir, changed: newer }) => newer === true && pathOf(dir) === extension.location.path);
	const gone = installed.filter(extension => !listed.includes(extension.location.path) || changed(extension));
	// (a package another installed one depends on goes with its dependents, in one batch, as Code-OSS uninstalls them;
	// the listed ones are installed again below)
	const stale = [...gone];
	for (let grew = true; grew;) {
		grew = false;
		for (const extension of installed) {
			if (stale.includes(extension)) { continue; }
			const needs = extension.manifest.extensionDependencies ?? [];
			if (stale.some(one => needs.some(id => id.toLowerCase() === one.identifier.id.toLowerCase()))) { stale.push(extension); grew = true; }
		}
	}
	if (stale.length > 0) { await extensionManagement.uninstallExtensions(stale.map(extension => ({ extension }))); }
	const added: ILocalExtension[] = [];
	for (const path of listed) {
		if (installed.some(extension => extension.location.path === path && !stale.includes(extension))) { continue; }
		added.push(await extensionManagement.installFromLocation(remoteAuthority
			? URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path })
			: URI.parse(pageOrigin).with({ path })));
	}
	if (stale.length === 0) {
		await extensionService.whenInstalledExtensionsRegistered();
		await Promise.all(added.map(extension => registered(extension, extensionService, extensionEnablement)));
	}
	return stale.length;
}

/** Resolves once the extension service holds `extension`, or at once when it holds it already or will not register it:
 *  an invalid or disabled one, which its install event does not add (`AbstractExtensionService`'s
 *  `onDidInstallExtensions`), or one no extension host can run. */
async function registered(extension: ILocalExtension, extensionService: IExtensionService, extensionEnablement: IWorkbenchExtensionEnablementService): Promise<void> {
	if (!extension.isValid || !extensionEnablement.isEnabled(extension) || !extensionService.canAddExtension(toExtensionDescription(extension))) { return; }
	await new Promise<void>(resolve => {
		const check = async () => {
			if (await extensionService.getExtension(extension.identifier.id)) {
				listener.dispose();
				resolve();
			}
		};
		const listener = extensionService.onDidChangeExtensions(() => void check());
		void check();
	});
}
