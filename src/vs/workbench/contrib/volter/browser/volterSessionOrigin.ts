/** The session this workbench page belongs to: the page's own origin, where the session's proxy fronts the workbench
 * and the session alike, and its tab bootstrap, loaded from there before the editor module graph. */

import { mainWindow } from '../../../../base/browser/window.js';

/**
 * The origin that serves the Volter editor for the folder this workbench has open: this page's own, checked against
 * the session's serving door (`/__editor/served-modules`, a session-only route that needs no project state and the
 * very next thing the contribution asks of it). A page the Code-OSS server serves without the session's proxy in front
 * answers no such route, and is refused by name.
 */
export async function resolveSessionOrigin(
	/** The product's own command (`VolterProduct.command`), for the sentence that says where the editor is; never a
	 *  generic name the person does not have. */
	command: string | undefined,
): Promise<string> {
	const pageOrigin = mainWindow.location.origin;
	let answered = false;
	try {
		answered = (await fetch(`${pageOrigin}/__editor/served-modules`)).ok;
	} catch {
		answered = false;
	}
	if (!answered) {
		throw new Error(`this page's origin ${pageOrigin} serves no Volter session: open the editor at the address ${command ? `\`${command} edit\`` : "the editor's `edit` command"} prints`);
	}
	return pageOrigin;
}

/** Load the session's tab-bootstrap.js as a classic script before the editor module graph. It supplies
 * tab identity, control channel, heartbeat and goodbye beacon. The script's own URL locates the
 * session; surface=vscode identifies the workbench page. */
export async function installSessionTabBootstrap(sessionOrigin: string): Promise<void> {
	const w = mainWindow as unknown as Record<string, unknown>;
	if (w['__VOLTER_EDITOR_PRESENCE_BOOTSTRAP__']) {
		return;
	}
	const src = `${sessionOrigin}/__editor/tab-bootstrap.js?surface=vscode`;
	await new Promise<void>((resolve, reject) => {
		const script = mainWindow.document.createElement('script');
		// Classic, not a module: the bootstrap reads `document.currentScript` to learn where
		// the session is, and a module script has none.
		script.async = false;
		script.src = src;
		script.addEventListener('load', () => resolve());
		script.addEventListener('error', () => reject(new Error(`the Volter session did not serve ${src} — without it this window cannot beat, and the session will report it as a tab that is not running`)));
		mainWindow.document.head.appendChild(script);
	});
	if (!w['__VOLTER_EDITOR_PRESENCE_BOOTSTRAP__']) {
		throw new Error(`${src} loaded but registered no presence bootstrap; the served script does not provide the tab bootstrap contract`);
	}
}
