/*---------------------------------------------------------------------------------------------
 *  CYCLOTRON'S WORKBENCH HALF — everything about this build that is Blender's rather
 *  than the editor kit's.
 *
 *  THIS FILE LIVES IN THIS REPOSITORY (`packages/cyclotron/workbench/src/`) and is OVERLAID on a
 *  Code-OSS checkout at a pin by `scripts/workbench/overlay.mjs --product cyclotron`. Edit it here.
 *
 *  It is the counterpart of `packages/cyclotron/src/index.ts`, which composes the SAME
 *  product in the editor's own realm: that file says which packages this editor is, what it
 *  looks like and what workspace it opens; this one says what the WORKBENCH around them is
 *  called, what it says when it asks for trust, and which of this build's theme artifacts the
 *  look wears. Both are thin, and neither is a switch.
 *
 *  IT IMPORTS TWO LEAVES OF THE KIT and nothing else of it (`volterProduct.ts`'s header says
 *  why): importing the kit's contribution would evaluate it before this file registers, and
 *  the kit reads its product at load.
 *--------------------------------------------------------------------------------------------*/

import './media/blender-look.css';
import './media/model-cover.css';
import { mainWindow } from '../../../../base/browser/window.js';
import { FileAccess } from '../../../../base/common/network.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../files/browser/fileConstants.js';
import { registerViewBackground } from '../../volter/browser/volterColors.js';
import { registerVolterProduct, type VolterProductCover, type VolterProductCoverContext, type VolterProductMountContext } from '../../volter/browser/volterProduct.js';
import { mountOpening, pullSetting, type OpeningSetting } from './opening.js';
// Written by the overlay from this product's package.json (`scripts/workbench/overlay.mjs`), the one
// place its id, the name a person sees and its command are stated.
import { PRODUCT_IDENTITY } from './productIdentity.js';

// BLENDER'S OWN UI FONT (Inter, OFL), lifted from the Blender payload's datafiles/fonts. It is
// loaded through `FileAccess.asBrowserUri` off the APP ROOT, which is what makes the look
// survive the origin split: the font and the skin CSS are both `'self'` under the workbench's
// CSP and nothing of the look is fetched from the session. The path is the overlay's fixed product directory — one name for every product,
// which is what keeps this literal and the build's resource glob from drifting apart.
(() => {
	const style = mainWindow.document.createElement('style');
	style.textContent = `@font-face { font-family: 'Inter'; src: url(${FileAccess.asBrowserUri('vs/workbench/contrib/volterProduct/browser/media/Inter.woff2').toString(true)}) format('woff2'); font-weight: 100 900; }`;
	mainWindow.document.head.appendChild(style);
})();

/** Cyclotron owns the Blender node editor backdrop colour and its theme row. The kit’s generic view background keeps a null default so each product supplies its own palette. */
const volterNodeEditorBackground = registerColor('volter.nodeEditor.background',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	localize('volterNodeEditorBackground', "The node editor's canvas backdrop. Blender's Shader Editor fills its area with TH_BACK (#1a1a1a) inside a #303030 panel, which is why this view does not read as a panel."));
registerViewBackground('blender-node-editor', volterNodeEditorBackground);

/** The product reads the kit’s document registry through a structural mirror of VolterDocumentsBridge. activeSource returns a project-relative path, or an empty path for a document with no disk source. */
interface DocumentsSource {
	activeSource(): { readonly kind: string; readonly path: string } | null;
	/** Every open workspace document. area identifies documents opened by the active workspace layout, including this product’s Timeline strip. */
	list(): readonly { readonly area?: unknown }[];
	/** The registry's active document id, or null while nothing is open yet. */
	activeId(): string | null;
	/** Fires when the open set or the active document changes. */
	subscribe(listener: () => void): () => void;
}

/** A user document is open only when it is activatable and outside the workspace’s layout areas. The Timeline alone cannot satisfy this predicate. */
function openDocument(registry: DocumentsSource): boolean {
	return (
		registry.list().some((document) => document.area === undefined) &&
		registry.activeId() !== null
	);
}
let documents: DocumentsSource | undefined;

/** This product's splash while it is opening, so `ready` below can narrate its own wait into
 *  the cover it drew. Set by `cover`, cleared by the handle's `dispose`. */
let splash: { say(text: string): void; readonly landed: Promise<void> } | undefined;

/**
 * THE SETTINGS A BOOT CAN PULL (`opening.ts`): renders of the machine standing somewhere, each
 * a card. The art lives in this product's media, under the app root like the font, so it is
 * `'self'` under the workbench's CSP; its sources are design/opening/asset (the canyon:
 * `build_canyon.py`, rendered in Blender, resized to 600 x 800 for a 300 x 420 card at 2x).
 */
const OPENING_SETTINGS: readonly [OpeningSetting, ...OpeningSetting[]] = [
	{
		id: 'canyon',
		name: localize('volterOpeningCanyon', "Canyon"),
		art: FileAccess.asBrowserUri('vs/workbench/contrib/volterProduct/browser/media/settings/canyon.jpg').toString(true),
		stars: 5,
	},
];

registerVolterProduct({
	id: PRODUCT_IDENTITY.id,
	layout: {
		sidebarWidth: 255,
		containers: [
			{
				id: 'workbench.view.volter',
				title: 'Model',
				location: 'sidebar',
				views: [
					// 18 %: Blender's Outliner area is 189 of 1028 px.
					{ part: 'outliner', title: 'Outliner', weight: 18 },
					{ part: 'properties', title: 'Properties', weight: 82 },
				],
			},
		],
	},
	title: PRODUCT_IDENTITY.displayName,
	command: PRODUCT_IDENTITY.command,
	// Trust allows this project's contributions, dev server and Blender worker to run.
	trustSentence: localize('volterModelTrustRequest', "{0} runs this project's own code — its editor contributions, its dev server, and Blender itself in this tab. Trust this folder to open it.", PRODUCT_IDENTITY.displayName),
	// The product cover draws the opening card pull and narration; the kit owns its lifecycle and refusal presentation.
	cover(host: HTMLElement, context: VolterProductCoverContext): VolterProductCover {
		const { setting, isNew, remember } = pullSetting(OPENING_SETTINGS);
		const opening = mountOpening(host, {
			setting,
			isNew,
			firstLine: localize('volterModelCoverOpening', "Opening {0}…", context.folderName),
			onShown: remember,
		});
		splash = { say: (text: string) => opening.say(text), landed: opening.landed };
		return {
			dispose: () => {
				splash = undefined;
				opening.dispose();
			},
		};
	},
	// Keep the cover until a Model document is registered and active, then allow its pane to paint.
	async ready(context: VolterProductMountContext): Promise<void> {
		// Wait for the opening card to land as well as the Model document. Reduced motion lands immediately.
		const landed = splash?.landed;
		const registry = context.mount['documents'] as DocumentsSource;

		const open = (): boolean => openDocument(registry);
		if (!open()) {
			splash?.say(localize('volterModelCoverWaiting', "Opening the first model…"));
			await new Promise<void>((resolve) => {
				let unsubscribe: (() => void) | undefined;
				// DECLARED BEFORE IT IS INSTALLED, because a registry that notifies
				// synchronously from `subscribe` would otherwise reach a `const` still in its
				// temporal dead zone and throw out of this promise.
				const stop = () => {
					unsubscribe?.();
					unsubscribe = undefined;
				};
				unsubscribe = registry.subscribe(() => { if (open()) { stop(); resolve(); } });
				// One more read after subscribing: the document can land between the check
				// above and this listener, and then no further change is coming.
				if (open()) { stop(); resolve(); }
			});
		}
		await landed;
		// Allow two animation-frame turns after activation before lifting the cover.
		splash?.say(localize('volterModelCoverDrawing', "Drawing…"));
		await new Promise<void>((resolve) => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
	},
	mount(context: VolterProductMountContext): void {
		documents = context.mount['documents'] as DocumentsSource;
		context.store.add({ dispose: () => { documents = undefined; } });
	},
});

// Open the active model’s sibling bpy script beside the Model document, with Explorer and Source Control in the opposite sidebar.
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'volter.model.openSourceBeside', title: localize2('volterOpenSource', "Volter Editor: Show Explorer and Open Model Source Beside"), category: Categories.View, f1: true });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewDescriptorService = accessor.get(IViewDescriptorService);
		const viewsService = accessor.get(IViewsService);
		const editorService = accessor.get(IEditorService);
		const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
		// Explorer AND Source Control, because the session's Code-OSS server is where git exists
		// at all (a web-only workbench has no Node extension host) and the two are the same gesture:
		// VS Code's own file estate on the side bar OPPOSITE our outliner and properties.
		// The side bar itself is ours — moving these into it would evict the Model workspace's
		// own column.
		for (const id of ['workbench.view.explorer', 'workbench.view.scm']) {
			const container = viewDescriptorService.getViewContainerById(id);
			if (container && viewDescriptorService.getViewContainerLocation(container) !== ViewContainerLocation.AuxiliaryBar) {
				viewDescriptorService.moveViewContainerToLocation(container, ViewContainerLocation.AuxiliaryBar, undefined, 'volter');
			}
		}
		layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		await viewsService.openViewContainer('workbench.view.scm', false);
		await viewsService.openViewContainer('workbench.view.explorer', false);
		// ---- and the ACTIVE MODEL's own source beside it.
		//
		// What it opens is derived from the document that is actually open: the bridge
		// knows the Model document's entry, the sibling `<name>.py` beside a `<name>.blend` is
		// the SOURCE (the `.blend` itself is binary and Monaco has nothing to show of it), and
		// when no such script exists the honest answer is the folder, revealed in the Explorer
		// this same command just opened. No model open at all is a refusal BY NAME rather than
		// a silent no-op.
		const folder = workspace.folders[0]?.uri;
		const notifications = accessor.get(INotificationService);
		const commands = accessor.get(ICommandService);
		const files = accessor.get(IFileService);
		const active = documents?.activeSource() ?? null;
		if (!folder) {
			notifications.warn(localize('volterNoFolder', "No folder is open, so there is no model source to open. Open the project folder first."));
			return;
		}
		if (!active) {
			notifications.warn(localize('volterNoModelOpen', "No document is open in the Volter Editor, so this command has no source to show. Run \"Volter Editor: Open Workspace\" and open a model first."));
			return;
		}
		if (active.path === '') {
			// Naming the KIND is the difference between a refusal and a shrug: the reader
			// learns that a document IS open and that it is not one with a file behind it.
			notifications.warn(localize('volterNotAModel', "The active volter document is a \"{0}\", which is not a file on disk, so there is no source to open beside it. Open a model first.", active.kind));
			return;
		}
		const model = joinPath(folder, active.path);
		const script = model.with({ path: model.path.replace(/\.blend$/, '.py') });
		if (script.path !== model.path && await files.exists(script)) {
			await editorService.openEditor({ resource: script, options: { pinned: true } }, SIDE_GROUP);
			return;
		}
		// No bpy beside it — show where the model lives instead of opening its bytes.
		await commands.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, model);
		notifications.info(localize('volterNoModelScript', "{0} has no bpy script beside it ({1}), so the Explorer is showing the model's folder instead.", basename(model), basename(script)));
	}
});
