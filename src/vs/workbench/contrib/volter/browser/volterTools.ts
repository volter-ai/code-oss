/*---------------------------------------------------------------------------------------------
 *  A VOLTER PACKAGE'S AGENT TOOLS ARE CODE-OSS'S LANGUAGE MODEL TOOLS.
 *
 *  A package declares each tool in Code-OSS's own `contributes.languageModelTools`, named for the
 *  editor verb it runs (`<namespace>-execute`), so an agent, the CLI and `live` call one thing by one
 *  name. Code-OSS registers the declaration; its implementation is this file's, from the
 *  workbench half, as Code-OSS implements its own built-in tools: every tool a Volter package
 *  contributes runs its verb in the page and answers with what the verb answered. The editor's own
 *  tools (`volterEditorTools.ts`) are this file's to declare too, as Code-OSS's built-in tools.
 *
 *  Nothing under `src/vs/` imports an editor module: what arrives is the tools bridge.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { VOLTER_EDITOR_TOOLS } from './volterEditorTools.js';

/** The page's half (`bridge.tsx`'s `VolterToolsHandle`). */
export interface VolterToolsBridge {
	/** Run one editor verb with the tool's input as its fields: what it answered, as text. */
	run(verb: string, fields: Record<string, unknown>): Promise<{ readonly text: string; readonly ok: boolean }>;
	/** The declared tools, for an agent of the page's own. */
	declare(tools: readonly { readonly name: string; readonly description: string; readonly inputSchema: unknown }[]): void;
}

/** The publisher every Volter package names (`volterExtensions.ts`). */
const VOLTER_PUBLISHER = 'volter';
const VOLTER_EDITOR_TOOL_IDS = new Set(VOLTER_EDITOR_TOOLS.map(tool => tool.name));

function isVolterTool(tool: IToolData): boolean {
	if (tool.source.type === 'internal') { return VOLTER_EDITOR_TOOL_IDS.has(tool.id); }
	return tool.source.type === 'extension' && tool.source.extensionId.value.split('.')[0] === VOLTER_PUBLISHER;
}

export class VolterTools extends Disposable {

	/** The implementation registered for each Volter tool, by its id (its verb). */
	private readonly implemented = this._register(new DisposableMap<string>());

	constructor(
		private readonly bridge: VolterToolsBridge,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
	) {
		super();
		this.sync();
		this._register(toolsService.onDidChangeTools(() => this.sync()));
	}

	/** Implement every tool a Volter package declares, and let go of one no longer declared. */
	private sync(): void {
		const declared = new Set<string>();
		const published: { name: string; description: string; inputSchema: unknown }[] = [];
		for (const tool of this.toolsService.getAllToolsIncludingDisabled()) {
			if (!isVolterTool(tool)) { continue; }
			declared.add(tool.id);
			published.push({ name: tool.id, description: tool.modelDescription, inputSchema: tool.inputSchema ?? { type: 'object', properties: {} } });
			if (this.implemented.has(tool.id)) { continue; }
			this.implemented.set(tool.id, this.toolsService.registerToolImplementation(tool.id, {
				invoke: async invocation => {
					const answer = await this.bridge.run(tool.id, invocation.parameters ?? {});
					return { content: [{ kind: 'text', value: answer.text }], ...(answer.ok ? {} : { toolResultError: answer.text }) };
				},
			}));
		}
		for (const id of [...this.implemented.keys()]) {
			if (!declared.has(id)) { this.implemented.deleteAndDispose(id); }
		}
		this.bridge.declare(published);
	}
}

/**
 * The editor's own tools, declared as the workbench starts, as Code-OSS declares its built-in tools: from the
 * workbench, with no extension. {@link VolterTools} implements them, with every package's, once the editor mounts.
 */
export class VolterEditorTools extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.volterEditorTools';

	constructor(@ILanguageModelToolsService toolsService: ILanguageModelToolsService) {
		super();
		for (const { name, tags, displayName, modelDescription, inputSchema } of VOLTER_EDITOR_TOOLS) {
			this._register(toolsService.registerToolData({
				id: name, source: ToolDataSource.Internal, tags, displayName, modelDescription, inputSchema: inputSchema as IJSONSchema,
			}));
		}
	}
}
