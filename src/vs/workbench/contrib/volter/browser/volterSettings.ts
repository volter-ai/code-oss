

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationDefaults, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { VOLTER_CONFIGURATION_NODE, VOLTER_SETTING_KEYS } from './volterGeneratedSettings.js';
import { TITLE_BAR_HEIGHT_KEY } from './volterTitleBar.js';

// EVERY volter SETTING, DECLARED AT LOAD. This is the `configuration` contribution point — the
// same door every core contribution under `src/vs/workbench/contrib/**` declares its own
// settings through — so VS Code's Settings editor lists each `volter.*` key with the sentence
// its Zod `.describe()` call already carries, and `.vscode/settings.json` autocompletes them.
// It is additive and no core file is touched. A generated module rather than an extension
// manifest: configuration is honoured at load from here.
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(VOLTER_CONFIGURATION_NODE);
// A product opens its project document; upstream onboarding is not a project.
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([{ overrides: { 'workbench.startupEditor': 'none', 'zenMode.showTabs': 'none', 'workbench.layoutControl.enabled': true, 'workbench.layoutControl.type': 'toggles' } }]);

/** Project-scoped workbench settings use the memory layer, above user preferences and
 * below workspace values. Autosave bounds the dirty interval during which editor writes
 * refuse to overwrite unsaved text. Its delay uses the workbench's default; a project can
 * override either value in .vscode/settings.json. */
const WORKBENCH_ADAPTER_VALUES: readonly (readonly [string, unknown])[] = [
	['files.autoSave', 'afterDelay'],
	['files.autoSaveDelay', 1000],
];

/** The active look supplies the title bar height and an adapter-declared style's colour theme.
 * Both use the adapter's memory layer, with workspace values taking precedence. LOOK_KEYS
 * declares the keys this layer may write so withdrawing a look clears its values. */
const COLOR_THEME_KEY = 'workbench.colorTheme';

const LOOK_KEYS: readonly string[] = [TITLE_BAR_HEIGHT_KEY, COLOR_THEME_KEY];

/**
 * WHAT THE FRAME HANDS THE EDITOR — the counterpart of the bridge's `VolterSettingsHandle`,
 * declared here for the same reason `VolterFilesBridge` is: nothing under `src/vs/` imports an
 * editor module.
 */
export interface VolterSettingsBridge {
	/** Install the frame's settings provider on `EditorHost.settings`. Called once, after the
	 *  mount, because the services it needs exist only inside the command's own invocation. */
	setProvider(provider: VolterSettingsProvider): void;
	/** What the open project's `editor/volter.adapter.ts` DECLARES, as dotted `volter.*` keys. The editor
	 *  derives it from the adapter object; the frame never parses the adapter itself. */
	adapterValues(): readonly (readonly [string, unknown])[];
	/** Workbench keys supplied by the active look: title bar height and colour theme.
	 * subscribe fires when either changes. */
	workbenchValues(): readonly (readonly [string, unknown])[];
	/** Fires when the adapter's declaration changes — a project opening, an adapter module
	 *  loading or unloading, the active look changing. Returns the unsubscribe. */
	subscribe(listener: () => void): () => void;
	/** Say something in the Volter editor's OWN console, where the editor's `console` command reads it. */
	report(level: 'warn' | 'error', message: string): void;
	/** Notify the person through the editor's INotificationService delegate when a user
	 * setting is shadowed by this project's adapter. */
	notify(notification: {
		readonly id: string;
		readonly tone: 'info' | 'warning' | 'error';
		readonly title: string;
		readonly detail?: string;
	}): void;
}

export interface VolterSettingsInspection {
	readonly default: unknown;
	readonly user: unknown;
	readonly adapter: unknown;
	readonly project: unknown;
	readonly effective: unknown;
}

export interface VolterSettingsProvider {
	get(key: string): unknown;
	inspect(key: string): VolterSettingsInspection;
	set(key: string, value: unknown, target: 'user' | 'project'): Promise<void>;
	subscribe(listener: () => void): () => void;
}

/** Display strings in curly quotes and other values as JSON. */
function displayValue(value: unknown): string {
	return typeof value === 'string' ? `“${value}”` : JSON.stringify(value) ?? String(value);
}

export class VolterSettings extends Disposable {

	/** Every key the ADAPTER layer may carry: the generated `volter.*` set plus the workbench keys
	 *  above. A key outside it is refused BY NAME rather than dropped. */
	private readonly keys = new Set([...VOLTER_SETTING_KEYS, ...WORKBENCH_ADAPTER_VALUES.map(([key]) => key), ...LOOK_KEYS]);
	/** The order `apply()` walks. Same set, as a list. */
	private readonly appliedKeys: readonly string[] = [...VOLTER_SETTING_KEYS, ...WORKBENCH_ADAPTER_VALUES.map(([key]) => key), ...LOOK_KEYS];
	private readonly listeners = new Set<() => void>();
	/** Serialize apply calls and remember whether another pass was requested during the current one. */
	private applyRun: Promise<void> | null = null;
	private applyAgain = false;
	/** What is registered as this window's defaults right now, and the signature that decides
	 *  whether a pass has anything to change. Registering fires the registry's own change
	 *  event, which wakes `apply()` — so an unconditional re-register is the same loop the
	 *  memory write's value comparison exists to prevent. */
	private registeredDefaults: IConfigurationDefaults[] = [];
	private registeredDefaultsSignature = '';
	/** ONE notification per key per session (the ruling). A key leaves this set only when the
	 *  window is gone, which is what "per session" means. */
	private readonly notifiedUserValueKeys = new Set<string>();

	constructor(
		private readonly bridge: VolterSettingsBridge,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.bridge.setProvider({
			get: key => this.configurationService.getValue(key),
			inspect: key => this.inspect(key),
			set: (key, value, target) => this.write(key, value, target),
			subscribe: listener => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			},
		});
		// RE-EVALUATED ON EVERY CONFIGURATION CHANGE — that is the half of the ruling that puts
		// the project back above the adapter. A `.vscode/settings.json` value appearing while
		// the window is open clears the memory value in the same beat, and one being removed
		// puts the adapter's back.
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			const applied = this.appliedKeys.some(key => event.affectsConfiguration(key));
			if (applied) { void this.apply(); }
			// (a package's own setting changed, whoever changed it: the editor's readers hear it as they hear the
			// editor's own)
			if (applied || [...event.affectedKeys].some(key => this.contributed(key))) {
				for (const listener of this.listeners) { listener(); }
			}
		}));
		// And when the ADAPTER's own declaration moves — a project opening, its adapter module
		// loading. The editor is the only side that knows.
		this._register({ dispose: this.bridge.subscribe(() => void this.apply()) });
		// The defaults are THIS WINDOW'S, so they leave with it — a contribution that is
		// disposed and leaves a `volter.keymap` default behind would be claiming a project that
		// is no longer open.
		this._register({ dispose: () => this.syncDefaults(new Map()) });
		void this.apply();
	}

	/** Inspect the native settings layers, with workspace-folder values belonging to the project. A key
	 * with no explicitly set layer returns undefined so generated type defaults such as an empty string
	 * cannot become editor settings. */
	private inspect(key: string): VolterSettingsInspection {
		const layered = this.configurationService.inspect(key);
		const answered = layered.applicationValue !== undefined
			|| layered.userValue !== undefined
			|| layered.userLocalValue !== undefined
			|| layered.userRemoteValue !== undefined
			|| layered.workspaceValue !== undefined
			|| layered.workspaceFolderValue !== undefined
			|| layered.memoryValue !== undefined
			|| layered.policyValue !== undefined
			// An extension's `configurationDefaults` (a product's default style, `volter.style`) is a
			// value somebody set too, unlike the registry's synthesised one.
			|| Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationDefaultsOverrides().has(key);
		return {
			// `defaultValue` follows the same rule: what the registry synthesised from the type
			// is not a volter default, and reporting it would put `''` back in the document one
			// layer down. When the ADAPTER declares a key, `syncDefaults` has registered its
			// value as this window's default and `memoryValue` carries it, so `answered` is true
			// and the real default is reported.
			default: answered ? layered.defaultValue : undefined,
			user: layered.userValue ?? layered.userLocalValue,
			adapter: layered.memoryValue,
			project: layered.workspaceFolderValue ?? layered.workspaceValue,
			effective: answered ? layered.value : undefined,
		};
	}

	/**
	 * THE ADAPTER LAYER, applied. One pass over every declared key: write the adapter's value
	 * to MEMORY while the project is silent about it, clear the memory value when the project
	 * speaks or the adapter stops declaring it.
	 *
	 * Skip matching memory values so configuration events do not schedule redundant writes.
	 */
	private apply(): Promise<void> {
		if (this.applyRun) {
			this.applyAgain = true;
			return this.applyRun;
		}
		this.applyRun = (async () => {
			do {
				this.applyAgain = false;
				await this.applyOnce();
			} while (this.applyAgain);
		})().finally(() => { this.applyRun = null; });
		return this.applyRun;
	}

	private async applyOnce(): Promise<void> {
		try {
			// The workbench keys FIRST, so a project's adapter that somehow declares one of them
			// wins — the project's own code outranks this file's claim about what a Volter project
			// needs, which is the same precedence the layers already state.
			const declared = new Map<string, unknown>(WORKBENCH_ADAPTER_VALUES);
			// THE LOOK'S OWN, before the adapter's for the same precedence reason: what the
			// project's code says outranks what the look computed.
			for (const [key, value] of this.bridge.workbenchValues()) {
				if (!LOOK_KEYS.includes(key)) { continue; }
				if (value !== undefined) { declared.set(key, value); }
			}
			for (const [key, value] of this.bridge.adapterValues()) {
				if (!this.keys.has(key)) {
					// A key the schema does not declare cannot be shown, read back or written by
					// anyone: name it rather than dropping it, because the silent version is an
					// adapter whose look simply does not apply and says nothing about why.
					this.bridge.report('warn', localize('volterSettingsUnknownKey', "The project's adapter declares “{0}”, which is not a volter setting, so it was not applied. Regenerate the frame's settings contribution if the schema has grown: node scripts/workbench/generate-settings.mjs --write", key));
					continue;
				}
				declared.set(key, value);
			}
			// THE DEFAULTS, from the same `declared` map that feeds the memory writes below, so
			// the value the Settings editor SHOWS and the value in force cannot drift apart.
			this.syncDefaults(declared);
			for (const key of this.appliedKeys) {
				const layered = this.configurationService.inspect(key);
				// THE INSPECT GATE. A project value — `.vscode/settings.json`, or a folder's —
				// outranks the adapter, so the adapter's value is not written at all and one
				// written earlier is cleared.
				const projectSpeaks = layered.workspaceValue !== undefined || layered.workspaceFolderValue !== undefined;
				const wanted = projectSpeaks ? undefined : declared.get(key);
				this.reportIneffectiveUserValue(key, layered.userValue ?? layered.userLocalValue, wanted, projectSpeaks);
				if (layered.memoryValue === wanted) { continue; }
				await this.configurationService.updateValue(key, wanted, ConfigurationTarget.MEMORY);
			}
		} catch (error) {
			this.bridge.report('error', localize('volterSettingsApplyFailed', "The project's adapter settings could not be applied: {0}", error instanceof Error ? error.message : String(error)));
		}
	}

	/**
	 * THIS WINDOW'S DEFAULTS for the adapter-declared keys — what makes the adapter's value
	 * VISIBLE in the Settings editor, which reads `inspect()` and has no memory-layer concept.
	 *
	 * Only the `volter.*` keys: the workbench keys this layer also carries (`files.autoSave`,
	 * `window.titleBarHeight`) are VS Code's own, declared by the workbench with its own
	 * defaults, and re-defaulting somebody else's setting is a claim about their product
	 * rather than about this project.
	 *
	 * Registered and deregistered as ONE record so the withdrawal is exact: an adapter that
	 * stops declaring a key, or a project that closes, leaves the key's real default behind
	 * and nothing of ours. The signature check is the re-entrancy guard's other half — see the
	 * field's own note.
	 */
	private syncDefaults(declared: ReadonlyMap<string, unknown>): void {
		const overrides: Record<string, unknown> = {};
		for (const key of VOLTER_SETTING_KEYS) {
			const value = declared.get(key);
			if (value !== undefined) { overrides[key] = value; }
		}
		const signature = JSON.stringify(overrides);
		if (signature === this.registeredDefaultsSignature) { return; }
		const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		if (this.registeredDefaults.length > 0) {
			registry.deregisterDefaultConfigurations(this.registeredDefaults);
			this.registeredDefaults = [];
		}
		this.registeredDefaultsSignature = signature;
		if (Object.keys(overrides).length === 0) { return; }
		this.registeredDefaults = [{ overrides }];
		registry.registerDefaultConfigurations(this.registeredDefaults);
	}

	/**
	 * A USER VALUE ON AN ADAPTER-DECLARED KEY: visible in the Settings editor, and ineffective
	 * in this project because the adapter's value sits above it on the memory layer. Said once
	 * per key per session, to the person, at the moment it is observed — at load or on change.
	 *
	 * Nothing is written and nothing is refused: the person's value is theirs and it is what
	 * every OTHER project will use. What the notification adds is the sentence they cannot get
	 * from the Settings editor, which has no way to draw a layer it does not model.
	 */
	private reportIneffectiveUserValue(key: string, userValue: unknown, adapterValue: unknown, projectSpeaks: boolean): void {
		if (projectSpeaks || userValue === undefined || adapterValue === undefined) { return; }
		if (userValue === adapterValue) { return; }
		if (this.notifiedUserValueKeys.has(key)) { return; }
		this.notifiedUserValueKeys.add(key);
		this.bridge.notify({
			id: `volter-settings-user-value-${key}`,
			tone: 'info',
			title: localize('volterSettingsUserValueShadowed', "“{0}” is {1} in this project, not your {2}.", key, displayValue(adapterValue), displayValue(userValue)),
			detail: localize('volterSettingsUserValueShadowedDetail', "This project's adapter declares the value, and a project's declaration outranks a user setting. Your setting still applies everywhere else. To change it HERE, set it in this workspace ({0}) — a workspace value wins over both.", '.vscode/settings.json'),
		});
	}

	/**
	 * WHAT THE DOOR ADMITS BEYOND THE EDITOR'S OWN KEYS: any `volter.*` key the configuration registry holds. In
	 * practice that is one a package of the project declares in its `package.json` `contributes.configuration` (Play's
	 * `volter.play.players`), which Code-OSS registers from the project's packages at every session start, as it
	 * registers any extension's settings, before any page half runs. Its value is read, written
	 * and announced through the configuration service exactly as the editor's own keys are, so a package's setting
	 * needs no workbench release to be declared, and the Settings editor, `.vscode/settings.json` and the package
	 * read one value. A key nobody registered is still refused by name. It adds no reach over the project's settings:
	 * a page half can already write `.vscode/settings.json` through `EditorHost.files`; a user-target write of such a
	 * key reaches the user's settings as a write of the editor's own keys does. The ADAPTER layer stays the editor's
	 * own keys.
	 */
	private contributed(key: string): boolean {
		return key.startsWith('volter.')
			&& Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[key] !== undefined;
	}

	/**
	 * A person's write.
	 *
	 * `'project'` is the WORKSPACE target — `.vscode/settings.json`, the file the frame's own
	 * project layer IS — and it is where a gesture on an adapter-declared key lands, because
	 * the memory value above the user layer would swallow a user write whole. `'user'` is the
	 * ordinary user settings file.
	 *
	 * It settles when the write has landed AND the `apply()` run after it has finished (so a
	 * workspace write on an adapter-declared key has cleared the memory value above it), or when
	 * it failed and was reported — never rejecting: the editor holds a value it just wrote until
	 * then, and the effective value is the new one by the time it reads again.
	 */
	private write(key: string, value: unknown, target: 'user' | 'project'): Promise<void> {
		if (!this.keys.has(key) && !this.contributed(key)) {
			this.bridge.report('error', localize('volterSettingsWriteUnknownKey', "“{0}” is not a volter setting, nor one a package of the project declares, so it was not written.", key));
			return Promise.resolve();
		}
		const configurationTarget = target === 'project' ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
		return this.configurationService.updateValue(key, value, configurationTarget).then(
			// A write to the workspace that the project also declares through its adapter needs
			// the memory value gone, or the effective value does not move and the gesture looks
			// like it did nothing. The change event runs `apply()` too; this makes the ordering
			// explicit rather than incidental.
			() => this.apply(),
			error => this.bridge.report('error', localize('volterSettingsWriteFailed', "“{0}” could not be written to the {1} settings: {2}", key, target, error instanceof Error ? error.message : String(error))),
		);
	}
}
