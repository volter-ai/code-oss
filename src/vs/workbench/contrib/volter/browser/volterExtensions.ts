/*---------------------------------------------------------------------------------------------
 *  VOLTER PACKAGES ARE CODE-OSS EXTENSIONS — ARCHITECTURE.md §3.2.
 *
 *  A Volter package states its contributions once, in its package.json's
 *  `contributes.volter` (an object keyed by kind: `editors`, `views`, `inspectors`, …). This file
 *  registers that `volter` extension point, so Code-OSS's extension service reads every
 *  package's contributions before any of its code loads, and hands the result to the editor.
 *
 *  The packages are the session's: the product's composed packages and the ones the project
 *  declares, which the session's serving door lists with their install folders. They become
 *  extensions through Code-OSS's own installer (`installFromLocation`, the same door as
 *  "Install Extension from Location…"), and one the session no longer lists is uninstalled the
 *  same way. Volter keeps no list of its own beside the profile's.
 *
 *  The editor imports the modules itself, in the renderer (gap 13's ruling), and activates each
 *  package's page half there (`contributes.volter.page`, in `extensionDependencies` order:
 *  `docs/adr/plugin-apis.md`). A package's `browser` entry is extension-host code, apart from this.
 *
 *  Nothing under `src/vs/` imports an editor module: the catalog leaves through
 *  `VolterContributionsBridge`, the `frame` argument `mountVolter` takes.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { match } from '../../../../base/common/glob.js';
import { readVolterContributions, type VolterContribution, type VolterEditorDeclaration, type VolterUtilityDeclaration } from './volterGeneratedContributions.js';

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
				description: "The package's views, keyed by container as Code-OSS's `contributes.views` is: `panel` lists panel views (`{ id, title, module }`, each `onView:<id>`), `statusbar` lists status-bar item modules.",
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
					statusbar: { type: 'array', items: { type: 'string' }, description: 'The ./-relative status-bar item modules.' },
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
const listeners = new Set<() => void>();

extensionPoint.setHandler(extensions => {
	const next: VolterContributionEntry[] = [];
	const nextPackages: VolterPackageDeclaration[] = [];
	const nextEditors: VolterEditorDeclaration[] = [];
	const nextUtilities: VolterUtilityDeclaration[] = [];
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
		next.push(...read.entries.map(entry => ({ ...at, ...entry })));
	}
	entries = next;
	packages = nextPackages;
	editors = nextEditors;
	utilities = nextUtilities;
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
 * `installFromLocation`, routes both by the location's scheme. Answers how many it uninstalled.
 */
export async function reconcileVolterExtensions(
	packages: readonly { readonly name: string; readonly dir: string }[],
	remoteAuthority: string | undefined,
	pageOrigin: string,
	extensionManagement: IWorkbenchExtensionManagementService,
): Promise<number> {
	const installed = (await extensionManagement.getInstalled(ExtensionType.User)).filter(extension => extension.manifest.publisher === VOLTER_PUBLISHER);
	const listed = packages.map(({ dir }) => pathOf(dir));
	// Uninstalls first: Code-OSS uninstalls by identifier, so a package listed at a new folder would lose the install
	// made from it if its old entry went afterwards. One batch: Code-OSS refuses to uninstall a package an installed one
	// still depends on (`extensionDependencies`), unless the dependent goes in the same call.
	const stale = installed.filter(extension => !listed.includes(extension.location.path));
	if (stale.length > 0) { await extensionManagement.uninstallExtensions(stale.map(extension => ({ extension }))); }
	for (const path of listed) {
		if (installed.some(extension => extension.location.path === path)) { continue; }
		await extensionManagement.installFromLocation(remoteAuthority
			? URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path })
			: URI.parse(pageOrigin).with({ path }));
	}
	return stale.length;
}
