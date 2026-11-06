# Third-party notice

This optional frontend needs **no runtime npm installation**. It builds against `@types/vscode`
(Copyright (c) Microsoft Corporation, MIT) as an exact devDependency for types only; `vscode` itself
is supplied by the editor at runtime and is never bundled or redistributed here.

No Microsoft source is copied into this repository. In particular the editor's
`vscode.proposed.*.d.ts` files are **not** vendored: `src/vscode-proposed.d.ts` is a
Volter Harness-authored declaration of the narrow proposed-API subset this package calls, written against
the published proposals rather than copied from them.

The generated attachment client under `vendor/supercode-frontend/` is this repository's own
`@volter/supercode-frontend`, synced by `scripts/sync-sdk.mjs` and version-pinned by
`package.json#supercodeFrontendContract`.

Volter Harness-authored integration and presentation code is identified by this package's source history
and remains under the repository's declared `MIT OR Apache-2.0` license.

The bundled provider/harness SVG marks in media/ are derived from this repository's sdk/ui/src/logo.jsx. Brand marks identify the active provider; they do not imply affiliation.
