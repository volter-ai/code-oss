/*---------------------------------------------------------------------------------------------
 *  The command palette belongs to the workbench.
 *
 *  The editor's KEYBOARD actions are commands the workbench half declares (`volterEditorActions.ts`,
 *  registered by `volterKeyboard.ts`, so the palette lists them). The editor's PALETTE table is another
 *  thing: its ids are a different namespace (`editor.undo` here, `edit.undo` there), several of
 *  its labels are templated per selection ("View Through <camera name>"), and its entity,
 *  tool-document, board-open and package-registered (`tool:*`) entries do not exist until
 *  something mounts or a package loads. It is live state, not a declaration.
 *
 *  A MENU ITEM registered late is not inert, which is the asymmetry that decides the shape: a
 *  keybinding rule registered after `workbench.common.main.ts` has loaded never fires, while
 *  `MenuRegistry` fires `onDidChangeMenu` and the
 *  palette rebuilds its picks on every open — which is how every extension-contributed command
 *  reaches it. So this file registers the editor's live table AT RUNTIME, re-registering it
 *  whenever the table's signature changes.
 *
 *  Nothing under `src/vs/` imports an editor module: what arrives is `VolterCommandsBridge`, the
 *  `frame/bridge.tsx`'s palette table from `@volter/sdk/editor-commands`, reshaped into the facts
 *  a menu item needs. Its counterpart is that frame's `VolterCommandsHandle`.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';

/**
 * WHAT THE FRAME GETS OF THE EDITOR'S PALETTE — declared here for the same reason
 * `VolterKeyboardBridge` and `VolterFilesBridge` are: no file under `src/vs/` imports an editor
 * module, and the editor's own door keeps its own shape.
 */
export interface VolterCommandsBridge {
	/** Every action the editor's palette would list, right now. */
	list(): readonly { readonly id: string; readonly label: string; readonly category: string }[];
	/** Run one by id. `false` means the editor no longer has that entry. */
	invoke(id: string): boolean;
	/** Fires when the table's membership or any label changes. */
	subscribe(listener: () => void): () => void;
	/** How the editor's own `view.commandPalette` action opens a palette in this window. */
	setPaletteOpener(open: () => void): void;
	/** Run editor.command through this window's ICommandService, reaching native commands, view verbs and
	 * Volter actions. The editor waits while the command bridge is not installed. */
	setCommandExecutor(run: (id: string, args?: unknown) => Promise<unknown>): void;
	/**
	 * How a Volter package's page half registers its commands in this window
	 * (`context.commands.registerCommand`, `docs/adr/plugin-apis.md`): Code-OSS's own
	 * `CommandsRegistry`, so the command service runs them by id as it runs an extension's. The
	 * answer is the release.
	 */
	setCommandRegistrar(register: ((id: string, handler: (...args: unknown[]) => unknown) => () => void) | null): void;
	/** Say something in the Volter editor's OWN console, where the editor's `console` command reads it. */
	/** `notify`: the refusal answers the person's own gesture, so it reaches the tray too. */
	report(level: 'warn' | 'error', message: string, options?: { readonly notify?: boolean }): void;
}

/** One VS Code command id per palette action. The action segment keeps it separate from key-action
 * commands. */
function commandIdFor(actionId: string): string {
	return `volter.action.${actionId}`;
}

/** Categories distinguish entity and asset picks from actions with the same label. */
function categoryFor(category: string) {
	switch (category) {
		case 'entity': return localize2('volterEntityCategory', "Volter Editor Entity");
		case 'asset': return localize2('volterAssetCategory', "Volter Editor Asset");
		default: return localize2('volterCategory', "Volter Editor");
	}
}

export class VolterCommands extends Disposable {

	/** The current generation's command + menu registrations, replaced whole on every change. */
	private readonly generation = this._register(new DisposableStore());

	constructor(
		private readonly bridge: VolterCommandsBridge,
		@ICommandService commandService: ICommandService,
	) {
		super();
		// THE EDITOR'S OWN `view.commandPalette` ACTION, answered by the workbench. Its CHORD is
		// unbound under the frame (Cmd+K is VS Code's chord prefix), so this is reached from a
		// keybinding a person made or from the action itself — and without it the action would
		// toggle a palette that is not mounted, which is a silent nothing.
		bridge.setPaletteOpener(() => { void commandService.executeCommand('workbench.action.showCommands'); });
		// AND THE COMMAND DOOR ITSELF. The palette opener runs ONE fixed id; this runs whichever
		// id the caller names, which is what makes a drawer view drivable by the product at all —
		// `editor.document.*` reaches the active centre document by its own contract, and a view
		// is not one. The command's own result is handed straight back: a view verb answers with
		// its state, and the session serialises it for the editor's `eval` command.
		bridge.setCommandExecutor((id, args) => commandService.executeCommand(id, args));
		bridge.setCommandRegistrar((id, handler) => {
			const registration = CommandsRegistry.registerCommand({ id, handler: (_accessor, ...args: unknown[]) => handler(...args) });
			return () => registration.dispose();
		});
		this._register(toDisposable(() => bridge.setCommandRegistrar(null)));
		this._register(toDisposable(bridge.subscribe(() => this.publish())));
		this._register(toDisposable(() => bridge.setPaletteOpener(() => { })));
		this.publish();
	}

	private publish(): void {
		this.generation.clear();
		for (const entry of this.bridge.list()) {
			const id = commandIdFor(entry.id);
			const actionId = entry.id;
			this.generation.add(CommandsRegistry.registerCommand({
				id,
				metadata: { description: localize('volterPaletteAction', "volter: {0}", entry.label) },
				handler: () => {
					// The table can move between the palette listing it and the person picking it
					// (a selection changed, a tool document closed, a package unloaded). Say so in
					// the session's ledger rather than doing nothing.
					if (!this.bridge.invoke(actionId)) {
						this.bridge.report('warn', `The palette action "${actionId}" did not run: the editor no longer offers it.`, { notify: true });
					}
				},
			}));
			this.generation.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
				command: { id, title: entry.label, category: categoryFor(entry.category) },
			}));
		}
	}
}
