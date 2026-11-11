

import { trackFocus } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyValue, IContext, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { VOLTER_EDITOR_COMMANDS, VOLTER_EDITOR_KEYBINDINGS } from './volterEditorActions.js';

// ---- What the bridge hands over. The Volter editor's own door (`@volter/sdk/host`'s
// `keyboard` member) reshaped by `bridge.tsx` into the facts this frame needs, so this file
// imports nothing of the editor.

export interface VolterKeyboardBridge {
	/** The keymap the PROJECT selected. */
	activeKeymap(): string;
	/** Run one action; false when nothing handles it now or its own gate refused. */
	invoke(id: string): boolean;
	subscribe(listener: () => void): () => void;
	/** The stage and document facts the context keys publish. */
	facts(): {
		readonly surface: string | null;
		readonly mode: string | null;
		readonly documentKind: string | null;
	};
	/** Say something in the Volter editor's OWN console, where the editor's `console` command reads it —
	 *  the frame's refusals belong in the session's ledger, not in a toast. */
	report(level: 'warn' | 'error', message: string): void;
}

// ---- The context keys.

export const VolterFocused = new RawContextKey<boolean>('volter.focused', false, localize('volterFocused', "Whether keyboard focus is inside one of the Volter Editor's parts (its stage, outliner or properties)."));
export const VolterStageFocused = new RawContextKey<boolean>('volter.stage.focused', false, localize('volterStageFocused', "Whether keyboard focus is on a volter stage."));
export const VolterStageSurface = new RawContextKey<string>('volter.stage.surface', '', localize('volterStageSurface', "The surface the focused volter stage paints: 'stage', 'canvas' (a mounted 2D canvas document), or empty."));
export const VolterStageMode = new RawContextKey<string>('volter.stage.mode', '', localize('volterStageMode', "The focused volter document's own interaction mode (for example object, edit or sculpt), when it reports one."));
export const VolterDocumentKind = new RawContextKey<string>('volter.document.kind', '', localize('volterDocumentKind', "The kind of the active volter document."));
export const VolterKeymap = new RawContextKey<string>('volter.keymap', '', localize('volterKeymap', "The keymap the open Volter project selected (its adapter's editor.keymap). The editor's own chords (`volterEditorActions.ts`) hold under every keymap; a keymap package's rules, gated on this key, add and override chords over them."));

// ---- The commands.
//
// Every `volter.*` command runs the editor action of the same name: the editor's own
// (`volterEditorActions.ts`), registered below as this module loads, and each one a
// declarative package declares (`contributes.commands`), registered from its declaration
// as the extension service reads it. A keybinding rule naming one therefore finds a
// handler; before a mount no rule can match (focus is ours only once the editor is), and
// a command run by hand says so.

let liveBridge: VolterKeyboardBridge | undefined;

/** The command a keymap binds to a chord it leaves free, so the editor's own
 *  chord there stands down. It runs nothing and the palette does not list it. */
const UNBOUND_KEY = 'volter.unboundKey';

function runAction(id: string): void {
	if (!liveBridge) {
		throw new Error(localize('volterNoEditor', "The Volter Editor is not mounted in this window. Run \"Volter Editor: Open Workspace\" first."));
	}
	if (!liveBridge.invoke(id)) {
		liveBridge.report('warn', `The keyboard action "${id}" did not run: the editor has no live handler for it right now (its stage or panel is not mounted), or the action's own gate refused.`);
	}
}

// ---- The editor's own commands and chords, registered as this module loads.
//
// A chord rule registered after the workbench has loaded is never consulted, so these are not
// left to a contribution's constructor. Their weight is a built-in extension's, the weight they
// had as `extensions/volter-editor`'s: above Code-OSS's own defaults on the same chord, below an
// installed keymap package's.
for (const { id, title, category } of VOLTER_EDITOR_COMMANDS) {
	MenuRegistry.addCommand({ id, title, category });
	CommandsRegistry.registerCommand(id, id === UNBOUND_KEY ? () => { } : () => runAction(id.slice('volter.'.length)));
}
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: UNBOUND_KEY, title: localize('volterUnboundKey', "Unbound Key") }, when: ContextKeyExpr.false() });
for (const { command, primary, mac, when } of VOLTER_EDITOR_KEYBINDINGS) {
	KeybindingsRegistry.registerKeybindingRule({ id: command, weight: KeybindingWeight.BuiltinExtension, when: ContextKeyExpr.deserialize(when), primary, mac: { primary: mac } });
}

export class VolterKeyboardCommands extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.volterKeyboardCommands';

	private readonly registered = new Map<string, IDisposable>();

	constructor(@IExtensionService private readonly extensionService: IExtensionService) {
		super();
		this._register(extensionService.onDidChangeExtensions(() => this.sync()));
		this._register(toDisposable(() => { for (const command of this.registered.values()) { command.dispose(); } }));
		void extensionService.whenInstalledExtensionsRegistered().then(() => this.sync());
	}

	private sync(): void {
		const declared = new Set<string>();
		for (const extension of this.extensionService.extensions) {
			// Only a declarative extension's: one with code (`main`, `browser`) registers its own.
			if (extension.main || extension.browser) { continue; }
			for (const { command } of extension.contributes?.commands ?? []) {
				if (command.startsWith('volter.') && command !== UNBOUND_KEY) { declared.add(command); }
			}
		}
		for (const [command, registration] of this.registered) {
			if (!declared.has(command)) { registration.dispose(); this.registered.delete(command); }
		}
		for (const command of declared) {
			if (this.registered.has(command) || CommandsRegistry.getCommand(command)) { continue; }
			const id = command.slice('volter.'.length);
			this.registered.set(command, CommandsRegistry.registerCommand(command, () => runAction(id)));
		}
	}
}

/**
 * THE HINTS THE EDITOR PRINTS, as this workbench resolves them: for an action,
 * the chord that runs `volter.<action>` under the active keymap and is not
 * taken by a weightier rule on the same chord. Resolved as if the editor held
 * focus, because a hint is read while a person looks at a button, not at the
 * stage; every other context key is the live one.
 */
export class VolterKeybindingLabels {

	constructor(
		private readonly keybindingService: IKeybindingService,
		private readonly contextKeyService: IContextKeyService,
	) { }

	label(action: string): string | undefined {
		const live = this.contextKeyService.getContext(null);
		const focused: IContext = {
			getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined =>
				key === VolterFocused.key || key === VolterStageFocused.key ? true as T : live.getValue<T>(key),
		};
		const winner = new Map<string, ResolvedKeybindingItem>();
		for (const item of this.keybindingService.getKeybindings()) {
			if (item.chords.length === 0 || item.when?.evaluate(focused) === false) { continue; }
			winner.set(item.chords.join(' '), item);
		}
		let found: ResolvedKeybindingItem | undefined;
		for (const item of winner.values()) {
			if (item.command === `volter.${action}`) { found = item; }
		}
		return found?.resolvedKeybinding?.getLabel() ?? undefined;
	}

	subscribe(listener: () => void): () => void {
		const keys = new Set([VolterKeymap.key, VolterStageSurface.key, VolterStageMode.key, VolterDocumentKind.key]);
		const store = new DisposableStore();
		store.add(this.keybindingService.onDidUpdateKeybindings(listener));
		store.add(this.contextKeyService.onDidChangeContext(event => { if (event.affectsSome(keys)) { listener(); } }));
		return () => store.dispose();
	}
}

/**
 * Install the one keyboard owner's view of the Volter editor: the context keys the
 * keybinding rules are gated on, and the bridge the commands dispatch through. Called once,
 * after the bridge has mounted and handed back its keyboard door.
 */
export class VolterKeyboard extends Disposable {

	private readonly focused: IContextKey<boolean>;
	private readonly stageFocused: IContextKey<boolean>;
	private readonly stageSurface: IContextKey<string>;
	private readonly stageMode: IContextKey<string>;
	private readonly documentKind: IContextKey<string>;
	private readonly keymap: IContextKey<string>;

	/** Which handed-over parts currently hold DOM focus. */
	private readonly focusedParts = new Set<string>();
	/** One focus tracker per handed-over part, disposed when the part is withdrawn. */
	private readonly partTrackers = new Map<string, DisposableStore>();

	constructor(
		private readonly bridge: VolterKeyboardBridge,
		contextKeyService: IContextKeyService,
	) {
		super();
		this.focused = VolterFocused.bindTo(contextKeyService);
		this.stageFocused = VolterStageFocused.bindTo(contextKeyService);
		this.stageSurface = VolterStageSurface.bindTo(contextKeyService);
		this.stageMode = VolterStageMode.bindTo(contextKeyService);
		this.documentKind = VolterDocumentKind.bindTo(contextKeyService);
		this.keymap = VolterKeymap.bindTo(contextKeyService);

		liveBridge = bridge;
		this._register(toDisposable(() => { if (liveBridge === bridge) { liveBridge = undefined; } }));
		this._register(toDisposable(bridge.subscribe(() => this.syncFacts())));
		this.syncFacts();
	}

	/**
	 * Track focus on one part the contribution handed to the bridge. VS Code's own
	 * `trackFocus` is what decides — the part is a real focusable element (the pane and the
	 * views set `tabIndex` and focus themselves on a pointer down), so "is the stage
	 * focused" is the workbench's answer to the same question it asks of every other part,
	 * not a guess from a class name.
	 */
	trackPart(id: string, element: HTMLElement): void {
		this.partTrackers.get(id)?.dispose();
		const store = new DisposableStore();
		const tracker = store.add(trackFocus(element));
		store.add(tracker.onDidFocus(() => { this.focusedParts.add(id); this.syncFocus(); }));
		store.add(tracker.onDidBlur(() => { this.focusedParts.delete(id); this.syncFocus(); }));
		this.partTrackers.set(id, store);
		this._register(store);
		if (element.contains(element.ownerDocument.activeElement)) { this.focusedParts.add(id); this.syncFocus(); }
	}

	/**
	 * FORGET A PART THAT IS GONE — a pane disposed with its group (W12).
	 *
	 * Without this the tracker outlived the element it watched and `focusedParts` kept an id
	 * whose part no longer exists, so `volter.focused` could stay TRUE with nothing of ours on
	 * screen. The tracker is disposed here rather than only at shutdown because a part is
	 * withdrawn and re-offered many times in one session.
	 */
	untrackPart(id: string): void {
		const store = this.partTrackers.get(id);
		if (!store) { return; }
		this.partTrackers.delete(id);
		store.dispose();
		if (this.focusedParts.delete(id)) { this.syncFocus(); }
	}

	private syncFocus(): void {
		this.focused.set(this.focusedParts.size > 0);
		// EVERY volter EDITOR PANE IS THE STAGE, not just the mount's. A workspace AREA is a
		// second editor group and therefore a second `VolterDocumentPane` (WORK.md's Timeline
		// item 1), offered as `center:<n>`; a keystroke in the Timeline is a keystroke in our
		// surface exactly as one in the Model pane is, and the distinction that matters to
		// `volter.stage.focused` is ours-versus-Monaco.
		this.stageFocused.set([...this.focusedParts].some(id => id === 'center' || id.startsWith('center:')));
	}

	private syncFacts(): void {
		const facts = this.bridge.facts();
		this.stageSurface.set(facts.surface ?? '');
		this.stageMode.set(facts.mode ?? '');
		this.documentKind.set(facts.documentKind ?? '');
		this.keymap.set(this.bridge.activeKeymap());
	}
}
