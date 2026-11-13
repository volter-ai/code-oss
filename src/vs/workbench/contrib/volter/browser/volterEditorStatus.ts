/*---------------------------------------------------------------------------------------------
 *  THE VOLTER EDITOR'S OWN STATUS-BAR ITEMS — what a person calls each, its side and its priority.
 *
 *  Data, and nothing else: `volterStatus.ts` adds each as an `IStatusbarService` entry, as Code-OSS's
 *  workbench adds its built-in items in its own code, beside the items packages declare under
 *  `contributes.volter.views.statusbar`. The shape is that declaration's, which is Code-OSS's
 *  `contributes.statusBarItems` (`id`, `name`, `alignment`, `priority`). The page renders each
 *  item's content under the same id (`components/status-contributions.tsx`).
 *
 *  `priority` is Code-OSS's: a higher value is further left, on either side.
 *--------------------------------------------------------------------------------------------*/

interface VolterEditorStatusItem {
	readonly id: string;
	readonly name: string;
	readonly alignment: 'left' | 'right';
	readonly priority: number;
}

export const VOLTER_EDITOR_STATUS_ITEMS: readonly VolterEditorStatusItem[] = [
	{ id: 'editor-lease', name: 'Editor server', alignment: 'left', priority: -90 },
	{ id: 'save-status', name: 'Save state', alignment: 'left', priority: 0 },
	{ id: 'mount-failure', name: 'Mount failure', alignment: 'left', priority: 5 },
	{ id: 'console-counts', name: 'Console errors and warnings', alignment: 'left', priority: 10 },
	{ id: 'play-state', name: 'Play state', alignment: 'left', priority: 20 },
	{ id: 'project-utilities', name: 'Project utilities', alignment: 'left', priority: 25 },
	{ id: 'asset-editor-status', name: 'Asset editor', alignment: 'left', priority: 40 },
];
