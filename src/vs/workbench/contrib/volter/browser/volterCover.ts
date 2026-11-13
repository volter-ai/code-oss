

import './media/volter-cover.css';
import { $ } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { volterProduct, type VolterProduct, type VolterProductCover } from './volterProduct.js';

/**
 * The cover over one open. Raised by the contribution the moment the workspace folder is known
 * and taken away by whichever of the mount's outcomes arrives — there is no third state and no
 * timer that decides one.
 */
export class VolterOpeningCover {
	/** How many frames to wait for `.monaco-workbench`. See {@link attach}. */
	private static readonly ATTACH_FRAMES = 120;

	private readonly element: HTMLElement;
	/** The kit's own status line — present only while the KIT is drawing the cover. */
	private state: HTMLElement | undefined;
	/** What the product drew, so it can be taken away with the cover. */
	private productCover: VolterProductCover | undefined;
	private removed = false;

	constructor(
		private readonly product: VolterProduct,
		private readonly folderName: string,
	) {
		this.element = $('.volter-opening-cover');
		// THE CONTENT IS THE PRODUCT'S WHEN IT HAS ONE (`VolterProduct.cover`). This class keeps
		// the mechanism either way — the element, the attach, the whole-removal, the refusal —
		// and a product that supplies nothing gets the plain one below.
		if (this.product.cover) {
			this.element.classList.add('volter-opening-cover-product');
			this.productCover = this.product.cover(this.element, { folderName });
		} else {
			this.drawKitContent();
		}
		this.attach(0);
	}

	/** The kit's own cover: the product's title, the folder, and what is happening. */
	private drawKitContent(): void {
		const heading = $('.volter-opening-cover-title');
		heading.textContent = this.product.title;
		const folder = $('.volter-opening-cover-folder');
		folder.textContent = this.folderName;
		const state = $('.volter-opening-cover-state');
		state.textContent = localize('volterCoverOpening', "Opening…");
		this.state = state;
		this.element.append(heading, folder, state);
	}

	/**
	 * `.monaco-workbench` is built by `Workbench.renderWorkbench`, which runs in the SAME task
	 * as the BlockRestore contributions and AFTER them (`lifecycleService.phase` is already
	 * `Ready` when `WorkbenchContributionsRegistry.start` runs, so that phase's contributions
	 * are constructed synchronously, before the workbench element exists). So the first frame
	 * is where the element is, and this is a retry rather than an observer. The bound is what
	 * keeps a page that never renders a workbench from holding a frame callback forever.
	 *
	 * The cover has to be a DESCENDANT of that element rather than of `body`: the colour theme
	 * is a stylesheet scoped to `.monaco-workbench` (`generateColorThemeCSS(…, '.monaco-workbench', …)`),
	 * so every `--vscode-*` this file reads is inherited through that node and nowhere else.
	 */
	private attach(frame: number): void {
		if (this.removed) { return; }
		const workbench = mainWindow.document.querySelector<HTMLElement>('.monaco-workbench');
		if (workbench) { workbench.appendChild(this.element); return; }
		if (frame >= VolterOpeningCover.ATTACH_FRAMES) { return; }
		mainWindow.requestAnimationFrame(() => this.attach(frame + 1));
	}

	/** The note under the splash, while one is shown. See {@link note}. */
	private noteElement: HTMLElement | undefined;

	/** Name a failure the editor is retrying under the splash (a transient startup notice). Null removes it; a
	 *  refusal is never replaced by a note. */
	note(text: string | null): void {
		if (this.removed || this.element.classList.contains('volter-opening-cover-failed')) { return; }
		if (text === null) { this.noteElement?.remove(); this.noteElement = undefined; return; }
		if (!this.noteElement) {
			this.noteElement = $('.volter-opening-cover-note');
			this.element.appendChild(this.noteElement);
		}
		this.noteElement.textContent = text;
	}

	/** Who hears the person dismiss the cover. */
	private readonly dismissed = new Set<() => void>();

	/** Hear the person dismiss the cover (its Dismiss, during a long open or after a refusal). */
	onDismiss(listener: () => void): void {
		this.dismissed.add(listener);
	}

	private dismiss(): void {
		this.remove();
		for (const listener of [...this.dismissed]) { listener(); }
	}

	/** Offer dismissal during a long open; mounting continues behind the cover. */
	offerDismiss(): void {
		if (this.removed || this.element.querySelector('.volter-opening-cover-dismiss')) { return; }
		const dismiss = $<HTMLButtonElement>('button.volter-opening-cover-dismiss.volter-opening-cover-dismiss-waiting');
		dismiss.textContent = localize('volterCoverDismiss', "Dismiss");
		dismiss.addEventListener('click', () => this.dismiss());
		this.element.appendChild(dismiss);
	}

	/** The editor is there: take the cover away, whole — the product's splash with it. */
	remove(): void {
		if (this.removed) { return; }
		this.removed = true;
		this.productCover?.dispose();
		this.productCover = undefined;
		this.element.remove();
		for (const listener of [...this.lifted]) { listener(); }
	}

	/** Who hears the cover come down, whichever way it does. */
	private readonly lifted = new Set<() => void>();

	/** Hear the cover come down (the open done, dismissed, or nothing to cover). */
	onRemoved(listener: () => void): void {
		this.lifted.add(listener);
	}

	/** Whether the cover is still over the workbench. */
	get standing(): boolean { return !this.removed; }

	/**
	 * The open did not happen. The cover STAYS, carrying the refusal in the words whoever
	 * refused chose, plus the one control it ever grows: a way out, so the workbench behind is
	 * usable rather than sealed under a product that never arrived.
	 *
	 * THE REFUSAL IS ALWAYS THE KIT'S PRESENTATION, even for a product that drew its own
	 * splash: a splash is a picture of an open that is happening, and this is the one state
	 * where it is not. So the product's content is disposed and the kit draws its own here —
	 * which is also what guarantees a Dismiss exists no matter what a product rendered.
	 */
	fail(message: string): void {
		if (this.removed) { return; }
		// Replace a previous refusal with the latest reason while preserving its Dismiss control.
		if (this.element.classList.contains('volter-opening-cover-failed')) {
			if (this.state) { this.state.textContent = message; }
			return;
		}
		this.productCover?.dispose();
		this.productCover = undefined;
		this.element.classList.remove('volter-opening-cover-product');
		this.element.textContent = '';
		this.noteElement = undefined;
		this.drawKitContent();
		this.element.classList.add('volter-opening-cover-failed');
		if (this.state) { this.state.textContent = message; }
		const dismiss = $<HTMLButtonElement>('button.volter-opening-cover-dismiss');
		dismiss.textContent = localize('volterCoverDismiss', "Dismiss");
		dismiss.addEventListener('click', () => this.dismiss());
		this.element.appendChild(dismiss);
	}
}

/**
 * Raise the cover for `folderName`, or nothing at all when this build has no product: with none
 * the mount command refuses by name (`NO_PRODUCT_REGISTERED`) and there is no editor coming, so
 * there is nothing to cover and the workbench is the honest thing to show.
 */
export function raiseOpeningCover(folderName: string): VolterOpeningCover | undefined {
	const product = volterProduct();
	if (!product) { return undefined; }
	return new VolterOpeningCover(product, folderName);
}
