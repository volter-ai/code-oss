/*---------------------------------------------------------------------------------------------
 *  THE VOLTER EDITOR'S OWN ACTIONS AS CODE-OSS COMMANDS — their palette titles and their chords.
 *
 *  The workbench half implements each one (`volterKeyboard.ts` runs the editor action of the
 *  same name), so it declares them in its own code, as Code-OSS's workbench declares its
 *  built-ins: `volterKeyboard.ts` registers these tables when this module loads, the commands
 *  in `CommandsRegistry` and `MenuRegistry` and the chords in `KeybindingsRegistry`. A keymap
 *  package's `contributes.keybindings`, gated on `volter.keymap`, adds and overrides chords over
 *  these.
 *
 *  `primary` is the chord on Windows and Linux; `mac` is macOS's (`KeyMod.CtrlCmd` is Cmd there).
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';

export interface VolterEditorCommand {
	readonly id: string;
	readonly title: string;
	readonly category: string;
}

export interface VolterEditorKeybinding {
	readonly command: string;
	readonly primary: number;
	readonly mac: number;
	/** A context key expression, as `ContextKeyExpr.deserialize` reads one. */
	readonly when: string;
}

export const VOLTER_EDITOR_COMMANDS: readonly VolterEditorCommand[] = [
	{ id: 'volter.canvas.panMode', title: 'Canvas: Pan Mode', category: 'Volter' },
	{ id: 'volter.canvas.rulerMode', title: 'Canvas: Ruler Mode', category: 'Volter' },
	{ id: 'volter.canvas.toggleGrid', title: 'Canvas: Toggle Grid', category: 'Volter' },
	{ id: 'volter.edit.copy', title: 'Edit: Copy', category: 'Volter' },
	{ id: 'volter.edit.cut', title: 'Edit: Cut', category: 'Volter' },
	{ id: 'volter.edit.delete', title: 'Edit: Delete', category: 'Volter' },
	{ id: 'volter.edit.deselectAll', title: 'Edit: Deselect All', category: 'Volter' },
	{ id: 'volter.edit.duplicate', title: 'Edit: Duplicate', category: 'Volter' },
	{ id: 'volter.edit.enterScope', title: 'Edit: Enter Scope', category: 'Volter' },
	{ id: 'volter.edit.exitScopeOrDeselect', title: 'Edit: Exit Scope Or Deselect', category: 'Volter' },
	{ id: 'volter.edit.group', title: 'Edit: Group', category: 'Volter' },
	{ id: 'volter.edit.nudgeDown', title: 'Edit: Nudge Down', category: 'Volter' },
	{ id: 'volter.edit.nudgeDownCoarse', title: 'Edit: Nudge Down Coarse', category: 'Volter' },
	{ id: 'volter.edit.nudgeLeft', title: 'Edit: Nudge Left', category: 'Volter' },
	{ id: 'volter.edit.nudgeLeftCoarse', title: 'Edit: Nudge Left Coarse', category: 'Volter' },
	{ id: 'volter.edit.nudgeRight', title: 'Edit: Nudge Right', category: 'Volter' },
	{ id: 'volter.edit.nudgeRightCoarse', title: 'Edit: Nudge Right Coarse', category: 'Volter' },
	{ id: 'volter.edit.nudgeUp', title: 'Edit: Nudge Up', category: 'Volter' },
	{ id: 'volter.edit.nudgeUpCoarse', title: 'Edit: Nudge Up Coarse', category: 'Volter' },
	{ id: 'volter.edit.paste', title: 'Edit: Paste', category: 'Volter' },
	{ id: 'volter.edit.redo', title: 'Edit: Redo', category: 'Volter' },
	{ id: 'volter.edit.save', title: 'Edit: Save', category: 'Volter' },
	{ id: 'volter.edit.selectAll', title: 'Edit: Select All', category: 'Volter' },
	{ id: 'volter.edit.undo', title: 'Edit: Undo', category: 'Volter' },
	{ id: 'volter.edit.unwrap', title: 'Edit: Unwrap', category: 'Volter' },
	{ id: 'volter.edit.wrap', title: 'Edit: Wrap', category: 'Volter' },
	{ id: 'volter.transform.combined', title: 'Transform: Combined', category: 'Volter' },
	{ id: 'volter.transform.rotate', title: 'Transform: Rotate', category: 'Volter' },
	{ id: 'volter.transform.scale', title: 'Transform: Scale', category: 'Volter' },
	{ id: 'volter.transform.select', title: 'Transform: Select', category: 'Volter' },
	{ id: 'volter.transform.translate', title: 'Transform: Translate', category: 'Volter' },
	{ id: 'volter.view.all', title: 'View: All', category: 'Volter' },
	{ id: 'volter.view.back', title: 'View: Back', category: 'Volter' },
	{ id: 'volter.view.bottom', title: 'View: Bottom', category: 'Volter' },
	{ id: 'volter.view.camera', title: 'View: Camera', category: 'Volter' },
	{ id: 'volter.view.commandPalette', title: 'View: Command Palette', category: 'Volter' },
	{ id: 'volter.view.focusMode', title: 'View: Focus Mode', category: 'Volter' },
	{ id: 'volter.view.front', title: 'View: Front', category: 'Volter' },
	{ id: 'volter.view.left', title: 'View: Left', category: 'Volter' },
	{ id: 'volter.view.opposite', title: 'View: Opposite', category: 'Volter' },
	{ id: 'volter.view.orbitDown', title: 'View: Orbit Down', category: 'Volter' },
	{ id: 'volter.view.orbitLeft', title: 'View: Orbit Left', category: 'Volter' },
	{ id: 'volter.view.orbitRight', title: 'View: Orbit Right', category: 'Volter' },
	{ id: 'volter.view.orbitUp', title: 'View: Orbit Up', category: 'Volter' },
	{ id: 'volter.view.perspective', title: 'View: Perspective', category: 'Volter' },
	{ id: 'volter.view.projection', title: 'View: Projection', category: 'Volter' },
	{ id: 'volter.view.resetPan', title: 'View: Reset Pan', category: 'Volter' },
	{ id: 'volter.view.right', title: 'View: Right', category: 'Volter' },
	{ id: 'volter.view.rollLeft', title: 'View: Roll Left', category: 'Volter' },
	{ id: 'volter.view.rollRight', title: 'View: Roll Right', category: 'Volter' },
	{ id: 'volter.view.toggleConsole', title: 'View: Toggle Console', category: 'Volter' },
	{ id: 'volter.view.top', title: 'View: Top', category: 'Volter' },
	{ id: 'volter.view.zoomIn', title: 'View: Zoom In', category: 'Volter' },
	{ id: 'volter.view.zoomOut', title: 'View: Zoom Out', category: 'Volter' },
	{ id: 'volter.viewport.cyclePivot', title: 'Viewport: Cycle Pivot', category: 'Volter' },
	{ id: 'volter.viewport.frameSelection', title: 'Viewport: Frame Selection', category: 'Volter' },
	{ id: 'volter.viewport.snapToFloor', title: 'Viewport: Snap To Floor', category: 'Volter' },
	{ id: 'volter.viewport.toggleSnap', title: 'Viewport: Toggle Snap', category: 'Volter' },
	{ id: 'volter.workspace.cycleNext', title: 'Workspace: Cycle Next', category: 'Volter' },
	{ id: 'volter.workspace.cyclePrevious', title: 'Workspace: Cycle Previous', category: 'Volter' },
	{ id: 'volter.unboundKey', title: 'Unbound Key', category: 'Volter' },
];

export const VOLTER_EDITOR_KEYBINDINGS: readonly VolterEditorKeybinding[] = [
	{ command: 'volter.edit.copy', primary: KeyMod.CtrlCmd | KeyCode.KeyC, mac: KeyMod.CtrlCmd | KeyCode.KeyC, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.cut', primary: KeyMod.CtrlCmd | KeyCode.KeyX, mac: KeyMod.CtrlCmd | KeyCode.KeyX, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.paste', primary: KeyMod.CtrlCmd | KeyCode.KeyV, mac: KeyMod.CtrlCmd | KeyCode.KeyV, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.duplicate', primary: KeyMod.CtrlCmd | KeyCode.KeyD, mac: KeyMod.CtrlCmd | KeyCode.KeyD, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.group', primary: KeyMod.CtrlCmd | KeyCode.KeyG, mac: KeyMod.CtrlCmd | KeyCode.KeyG, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.wrap', primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyG, mac: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.KeyG, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.unwrap', primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, mac: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.KeyG, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.selectAll', primary: KeyMod.CtrlCmd | KeyCode.KeyA, mac: KeyMod.CtrlCmd | KeyCode.KeyA, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.save', primary: KeyMod.CtrlCmd | KeyCode.KeyS, mac: KeyMod.CtrlCmd | KeyCode.KeyS, when: "volter.focused" },
	{ command: 'volter.edit.delete', primary: KeyCode.Backspace, mac: KeyCode.Backspace, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.delete', primary: KeyCode.Delete, mac: KeyCode.Delete, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.enterScope', primary: KeyCode.Enter, mac: KeyCode.Enter, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.exitScopeOrDeselect', primary: KeyCode.Escape, mac: KeyCode.Escape, when: "volter.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeUp', primary: KeyCode.UpArrow, mac: KeyCode.UpArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeUpCoarse', primary: KeyMod.Shift | KeyCode.UpArrow, mac: KeyMod.Shift | KeyCode.UpArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeDown', primary: KeyCode.DownArrow, mac: KeyCode.DownArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeDownCoarse', primary: KeyMod.Shift | KeyCode.DownArrow, mac: KeyMod.Shift | KeyCode.DownArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeLeft', primary: KeyCode.LeftArrow, mac: KeyCode.LeftArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeLeftCoarse', primary: KeyMod.Shift | KeyCode.LeftArrow, mac: KeyMod.Shift | KeyCode.LeftArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeRight', primary: KeyCode.RightArrow, mac: KeyCode.RightArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.edit.nudgeRightCoarse', primary: KeyMod.Shift | KeyCode.RightArrow, mac: KeyMod.Shift | KeyCode.RightArrow, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.view.resetPan', primary: KeyMod.CtrlCmd | KeyCode.Digit0, mac: KeyMod.CtrlCmd | KeyCode.Digit0, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.view.commandPalette', primary: KeyMod.CtrlCmd | KeyCode.KeyK, mac: KeyMod.CtrlCmd | KeyCode.KeyK, when: "volter.focused" },
	{ command: 'volter.view.toggleConsole', primary: KeyCode.Backquote, mac: KeyCode.Backquote, when: "volter.focused" },
	{ command: 'volter.view.focusMode', primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF, mac: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.KeyF, when: "volter.focused" },
	{ command: 'volter.workspace.cycleNext', primary: KeyMod.CtrlCmd | KeyCode.PageDown, mac: KeyMod.CtrlCmd | KeyCode.PageDown, when: "volter.focused" },
	{ command: 'volter.workspace.cyclePrevious', primary: KeyMod.CtrlCmd | KeyCode.PageUp, mac: KeyMod.CtrlCmd | KeyCode.PageUp, when: "volter.focused" },
	{ command: 'volter.transform.select', primary: KeyCode.KeyQ, mac: KeyCode.KeyQ, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.transform.combined', primary: KeyCode.KeyT, mac: KeyCode.KeyT, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.transform.translate', primary: KeyCode.KeyW, mac: KeyCode.KeyW, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.transform.rotate', primary: KeyCode.KeyE, mac: KeyCode.KeyE, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.transform.scale', primary: KeyCode.KeyR, mac: KeyCode.KeyR, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.viewport.toggleSnap', primary: KeyMod.Shift | KeyCode.KeyS, mac: KeyMod.Shift | KeyCode.KeyS, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.viewport.frameSelection', primary: KeyCode.KeyF, mac: KeyCode.KeyF, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.viewport.cyclePivot', primary: KeyCode.Period, mac: KeyCode.Period, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.canvas.panMode', primary: KeyCode.KeyG, mac: KeyCode.KeyG, when: "volter.stage.focused && volter.stage.mode != 'PLAY' && volter.stage.surface == 'canvas'" },
	{ command: 'volter.canvas.rulerMode', primary: KeyCode.KeyM, mac: KeyCode.KeyM, when: "volter.stage.focused && volter.stage.mode != 'PLAY' && volter.stage.surface == 'canvas'" },
	{ command: 'volter.canvas.toggleGrid', primary: KeyMod.CtrlCmd | KeyCode.Quote, mac: KeyMod.CtrlCmd | KeyCode.Quote, when: "volter.stage.focused && volter.stage.mode != 'PLAY' && volter.stage.surface == 'canvas'" },
	{ command: 'volter.viewport.snapToFloor', primary: KeyCode.PageDown, mac: KeyCode.PageDown, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.view.top', primary: KeyCode.Numpad7, mac: KeyCode.Numpad7, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.view.front', primary: KeyCode.Numpad1, mac: KeyCode.Numpad1, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.view.right', primary: KeyCode.Numpad3, mac: KeyCode.Numpad3, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.view.perspective', primary: KeyCode.Numpad5, mac: KeyCode.Numpad5, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
	{ command: 'volter.view.camera', primary: KeyCode.Numpad0, mac: KeyCode.Numpad0, when: "volter.stage.focused && volter.stage.mode != 'PLAY'" },
];
