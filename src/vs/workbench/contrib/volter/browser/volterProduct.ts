

import { DisposableStore } from '../../../../base/common/lifecycle.js';

/** What the kit hands a product when the bridge has mounted. */
export interface VolterProductMountContext {
	/**
	 * What `mountVolter` handed back. The kit's own doors are installed by the kit; a product
	 * reads the member its OWN bridge half publishes and declares the shape it expects, exactly as the
	 * kit declares the shapes it expects. Nothing under `src/vs/` can import the bridge's
	 * types — it is React TSX this fork does not compile — so both sides mirror the published shape.
	 */
	readonly mount: Readonly<Record<string, unknown>>;
	/** Lives as long as the mount's own installations do. */
	readonly store: DisposableStore;
}

/** What the kit hands a product when it raises the opening cover. The folder is all there is
 *  to say at that moment: it is the first instant the workspace is known, before any session,
 *  any project file or any mount. */
export interface VolterProductCoverContext {
	readonly folderName: string;
}

/** A product's rendered splash, so the kit can take it away when the cover comes down. */
export interface VolterProductCover {
	dispose(): void;
}

/** Native view containers and starting proportions. The product owns the defaults;
 * Code-OSS owns subsequent moves, resizing and persistence. */
export interface VolterProductLayout {
	readonly sidebarWidth: number;
	readonly containers: readonly {
		readonly id: string;
		readonly title: string;
		readonly location: 'sidebar' | 'auxiliarybar';
		readonly views: readonly {
			readonly part: 'outliner' | 'properties';
			readonly title: string;
			readonly weight: number;
		}[];
	}[];
}

/** Everything a product tells the kit's contribution. */
export interface VolterProduct {

	readonly id: string;
	/** What the thing being edited is called: the document pane's registered name and the
	 *  sidebar container's title. */
	readonly title: string;
	/**
	 * The command a person types for this product — its package.json
	 * `bin`, which `@volter/sdk/product-command` reads on the editor's side. The frame
	 * needs it BEFORE any session exists (the cover's "no live session, start one with …"), so it
	 * cannot ask one; a message that names a command must name the one the person has, never a
	 * generic one.
	 */
	readonly command: string;
	readonly layout: VolterProductLayout;
	/** The product's own sentence in the workbench's trust prompt. */
	readonly trustSentence: string;
	/** Anything else this product installs once the bridge has mounted. */
	mount?(context: VolterProductMountContext): void;
	/** Product splash content for the kit's opening cover. The kit raises the
	 * cover as the folder connects and displays refusals, including no-session.
	 * This delegate supplies opening markup and styles before the product theme
	 * is registered. Without a delegate the kit shows its plain opening cover. */
	cover?(host: HTMLElement, context: VolterProductCoverContext): VolterProductCover;
	/**
	 * WHEN THIS PRODUCT IS OPEN, in its own terms — and the kit takes the cover down then.
	 *
	 * `mountVolter` resolving means the EDITOR is assembled, which is not the same as the thing
	 * a person came to see being on screen: a product whose document waits on an engine
	 * resolves when that document is open and drawn, so the cover stays up until then.
	 *
	 * A REJECTION is the same path as a mount failure: the cover stays and carries the
	 * message in the product's words, with a way out. So a product that waits here bounds its
	 * own wait and says what it was waiting for — the kit has no timer of its own and will
	 * not invent one.
	 *
	 * Without this member, the cover comes down when `mountVolter` resolves.
	 */
	ready?(context: VolterProductMountContext): Promise<void>;
}

let registered: VolterProduct | undefined;

/**
 * Register this build's product. Called at module scope by the product's own workbench
 * contribution, which the overlay imports ABOVE the kit's.
 *
 * A SECOND CALL IS A THROW, not a replacement: two products in one workbench means the overlay
 * copied two product halves into one build, and a silent last-one-wins would decide which
 * editor a person is looking at by import order.
 */
export function registerVolterProduct(product: VolterProduct): void {
	if (registered) {
		throw new Error(
			`the volter workbench already has a product (${registered.id}); ${product.id} is a second one. ` +
			'One build is one product — the overlay copies ' +
			'exactly one product\'s workbench half into a checkout (scripts/workbench/overlay.mjs --product).'
		);
	}
	registered = product;
}

/** The registered product, or `undefined` when the overlay wrote none. */
export function volterProduct(): VolterProduct | undefined {
	return registered;
}

/**
 * What the kit says when it is asked to mount with no product. It is a REFUSAL BY NAME rather
 * than a default product: a workbench with the kit and no product is a build that was assembled
 * wrong, and the only honest thing it can do is say which step did not run.
 */
export const NO_PRODUCT_REGISTERED =
	'No Volter product is registered in this workbench, so there is nothing to open. The build overlays ' +
	'the editor kit and a product on the Code-OSS fork at its source pin. Run ' +
	'scripts/workbench/overlay.mjs --checkout <fork dir> --product <product> ' +
	'from this repository, then compile the fork again.';
