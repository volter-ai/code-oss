/*---------------------------------------------------------------------------------------------
 *  THE VOLTER EDITOR'S OWN AGENT TOOLS — each named for the editor verb it runs.
 *
 *  Data, and nothing else: `volterTools.ts` registers each as one of Code-OSS's built-in language
 *  model tools and implements it, and the serving door's `workbenchTools()` lists the same entries to a serving
 *  half (`server/project-serving-services.ts`). A package's own tools stay its `contributes.languageModelTools`.
 *  The shape is that contribution point's, so both readers treat the two alike.
 *--------------------------------------------------------------------------------------------*/

export interface VolterEditorTool {
	readonly name: string;
	readonly tags: readonly string[];
	readonly displayName: string;
	readonly modelDescription: string;
	readonly inputSchema: object;
}

export const VOLTER_EDITOR_TOOLS: readonly VolterEditorTool[] = [
	{
		"name": "open",
		"tags": [
			"volter"
		],
		"displayName": "Open a document",
		"modelDescription": "Open (or bring forward) the document with this id: a model, a scene, a board. A model id for a file not written yet opens a new model there, written by its first save. Answers the document opened.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The document's id or table entry id, such as <kind>:<project path>."
				}
			},
			"required": [
				"id"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "select",
		"tags": [
			"volter"
		],
		"displayName": "Select an entity",
		"modelDescription": "Select one entity of the open scene by its id.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The entity's id."
				}
			},
			"required": [
				"id"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "select-multiple",
		"tags": [
			"volter"
		],
		"displayName": "Select entities",
		"modelDescription": "Select several entities of the open scene at once.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"ids": {
					"type": "array",
					"items": {
						"type": "string"
					},
					"description": "The entities' ids."
				}
			},
			"required": [
				"ids"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "inspect",
		"tags": [
			"volter"
		],
		"displayName": "Inspect the selection",
		"modelDescription": "Read the properties of what is selected, as the Properties panel shows them.",
		"inputSchema": {
			"type": "object",
			"properties": {},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "hierarchy",
		"tags": [
			"volter"
		],
		"displayName": "Read the hierarchy",
		"modelDescription": "Read the open scene's hierarchy: every entity, with its id, name and parent.",
		"inputSchema": {
			"type": "object",
			"properties": {},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "current-view",
		"tags": [
			"volter"
		],
		"displayName": "Read the current view",
		"modelDescription": "Read what the editor is showing: the document, its camera and its view settings.",
		"inputSchema": {
			"type": "object",
			"properties": {},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "document-table",
		"tags": [
			"volter"
		],
		"displayName": "Read the document table",
		"modelDescription": "List the project's documents: their ids, kinds and source files.",
		"inputSchema": {
			"type": "object",
			"properties": {},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "present-view",
		"tags": [
			"volter"
		],
		"displayName": "Present a view",
		"modelDescription": "Show a view described as current-view describes one: a document, its camera and its settings.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"view": {
					"type": "object",
					"description": "A view as current-view answers it."
				}
			},
			"required": [
				"view"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "undo",
		"tags": [
			"volter"
		],
		"displayName": "Undo",
		"modelDescription": "Undo the last change, as the person's own Undo does.",
		"inputSchema": {
			"type": "object",
			"properties": {},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "redo",
		"tags": [
			"volter"
		],
		"displayName": "Redo",
		"modelDescription": "Redo the last undone change.",
		"inputSchema": {
			"type": "object",
			"properties": {},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "focus-entity",
		"tags": [
			"volter"
		],
		"displayName": "Focus an entity",
		"modelDescription": "Frame the viewport on one entity; an unknown id does nothing.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The entity's id."
				}
			},
			"required": [
				"id"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "frame-entity",
		"tags": [
			"volter"
		],
		"displayName": "Frame an entity",
		"modelDescription": "Frame the edit viewport's camera on one entity; an unknown id is refused by name.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The entity's id."
				}
			},
			"required": [
				"id"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "focus-selection",
		"tags": [
			"volter"
		],
		"displayName": "Focus the selection",
		"modelDescription": "Frame the viewport on what is selected.",
		"inputSchema": {
			"type": "object",
			"properties": {},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "view-preset",
		"tags": [
			"volter"
		],
		"displayName": "View from a side",
		"modelDescription": "Look at the scene from a preset side.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"preset": {
					"type": "string",
					"enum": [
						"top",
						"front",
						"right",
						"bottom",
						"back",
						"left",
						"perspective"
					]
				}
			},
			"required": [
				"preset"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "set-camera",
		"tags": [
			"volter"
		],
		"displayName": "Place the camera",
		"modelDescription": "Place the viewport camera at a position, looking at a target, in scene units.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"position": {
					"type": "array",
					"items": {
						"type": "number"
					},
					"minItems": 3,
					"maxItems": 3,
					"description": "[x, y, z]"
				},
				"target": {
					"type": "array",
					"items": {
						"type": "number"
					},
					"minItems": 3,
					"maxItems": 3,
					"description": "[x, y, z]"
				},
				"fov": {
					"type": "number",
					"description": "Field of view in degrees."
				}
			},
			"required": [
				"position",
				"target"
			],
			"additionalProperties": false
		}
	},
	{
		"name": "document-frame",
		"tags": [
			"volter"
		],
		"displayName": "Frame the document",
		"modelDescription": "Frame the open document's subject (its selection if it has one); fit scales the distance, 1 is a tight fit.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"fit": {
					"type": "number",
					"description": "How far to stand off: 1 is tight."
				}
			},
			"required": [],
			"additionalProperties": false
		}
	},
	{
		"name": "set-shading-mode",
		"tags": [
			"volter"
		],
		"displayName": "Set the shading",
		"modelDescription": "Set the viewport's shading.",
		"inputSchema": {
			"type": "object",
			"properties": {
				"mode": {
					"type": "string",
					"enum": [
						"solid",
						"preview",
						"rendered",
						"clay",
						"unlit",
						"wireframe",
						"matcap",
						"normals",
						"overdraw"
					]
				}
			},
			"required": [
				"mode"
			],
			"additionalProperties": false
		}
	}
];
