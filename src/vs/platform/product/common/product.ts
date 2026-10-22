/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from '../../../base/common/process.js';
import { IProductConfiguration } from '../../../base/common/product.js';
import { ISandboxConfiguration } from '../../../base/parts/sandbox/common/sandboxTypes.js';

interface IPackageConfiguration {
	readonly version: string;
	readonly dependencies?: Readonly<Record<string, string>>;
}

function getDependencyVersion(packageConfiguration: IPackageConfiguration, packageName: string): string | undefined {
	return packageConfiguration.dependencies?.[packageName]?.replace(/^[~^]/, '');
}

/**
 * @deprecated It is preferred that you use `IProductService` if you can. This
 * allows web embedders to override our defaults. But for things like `product.quality`,
 * the use is fine because that property is not overridable.
 */
let product: IProductConfiguration;

// Native sandbox environment
const vscodeGlobal = (globalThis as { vscode?: { context?: { configuration(): ISandboxConfiguration | undefined } } }).vscode;
if (typeof vscodeGlobal !== 'undefined' && typeof vscodeGlobal.context !== 'undefined') {
	const configuration: ISandboxConfiguration | undefined = vscodeGlobal.context.configuration();
	if (configuration) {
		product = configuration.product;
	} else {
		throw new Error('Sandbox: unable to resolve product configuration from preload script.');
	}
}
// _VSCODE environment
else if (globalThis._VSCODE_PRODUCT_JSON && globalThis._VSCODE_PACKAGE_JSON) {
	// Obtain values from product.json and package.json-data
	product = globalThis._VSCODE_PRODUCT_JSON as unknown as IProductConfiguration;
	const packageConfiguration = globalThis._VSCODE_PACKAGE_JSON as unknown as IPackageConfiguration;

	// Running out of sources
	if (env['VSCODE_DEV']) {
		Object.assign(product, {
			nameShort: `${product.nameShort} Dev`,
			nameLong: `${product.nameLong} Dev`,
			dataFolderName: `${product.dataFolderName}-dev`,
			serverDataFolderName: product.serverDataFolderName ? `${product.serverDataFolderName}-dev` : undefined
		});
	}

	// Version is added during built time, but we still
	// want to have it running out of sources so we
	// read it from package.json only when we need it.
	if (!product.version) {
		Object.assign(product, {
			version: packageConfiguration.version
		});
	}

	if (!product.copilotVersions) {
		const runtime = getDependencyVersion(packageConfiguration, '@github/copilot');
		const sdk = getDependencyVersion(packageConfiguration, '@github/copilot-sdk');
		if (runtime && sdk) {
			Object.assign(product, { copilotVersions: { runtime, sdk } });
		}
	}
}

// Web environment or unknown
else {

	// Built time configuration (do NOT modify)
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	product = { /*BUILD->INSERT_PRODUCT_CONFIGURATION*/ } as unknown as IProductConfiguration;

	// Running out of sources
	if (Object.keys(product).length === 0) {
		Object.assign(product, {
			version: '1.104.0-dev',
			nameShort: 'Code - OSS Dev',
			nameLong: 'Code - OSS Dev',
			applicationName: 'code-oss',
			dataFolderName: '.vscode-oss',
			urlProtocol: 'code-oss',
			reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new',
			licenseName: 'MIT',
			licenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
			serverLicenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
			defaultChatAgent: {
				extensionId: 'GitHub.copilot',
				chatExtensionId: 'GitHub.copilot-chat',
				provider: {
					default: {
						id: 'github',
						name: 'GitHub',
					},
					enterprise: {
						id: 'github-enterprise',
						name: 'GitHub Enterprise',
					}
				},
				providerScopes: []
			}
		});
		// VOLTER BEGIN source product configuration
		Object.assign(product, {"nameShort":"Code - OSS","nameLong":"Code - OSS","applicationName":"code-oss","dataFolderName":".vscode-oss","sharedDataFolderName":".vscode-oss-shared","win32MutexName":"vscodeoss","licenseName":"MIT","licenseUrl":"https://github.com/microsoft/vscode/blob/main/LICENSE.txt","serverLicenseUrl":"https://github.com/microsoft/vscode/blob/main/LICENSE.txt","serverGreeting":[],"serverLicense":[],"serverLicensePrompt":"","serverApplicationName":"code-server-oss","serverDataFolderName":".vscode-server-oss","tunnelApplicationName":"code-tunnel-oss","win32DirName":"Microsoft Code OSS","win32NameVersion":"Microsoft Code OSS","win32RegValueName":"CodeOSS","win32x64AppId":"{{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}","win32arm64AppId":"{{D1ACE434-89C5-48D1-88D3-E2991DF85475}","win32x64UserAppId":"{{CC6B787D-37A0-49E8-AE24-8559A032BE0C}","win32arm64UserAppId":"{{3AEBF0C8-F733-4AD4-BADE-FDB816D53D7B}","win32AppUserModelId":"Microsoft.CodeOSS","win32ShellNameShort":"C&ode - OSS","win32TunnelServiceMutex":"vscodeoss-tunnelservice","win32TunnelMutex":"vscodeoss-tunnel","darwinBundleIdentifier":"com.visualstudio.code.oss","darwinProfileUUID":"47827DD9-4734-49A0-AF80-7E19B11495CC","darwinProfilePayloadUUID":"CF808BE7-53F3-46C6-A7E2-7EDB98A5E959","linuxIconName":"code-oss","licenseFileName":"LICENSE.txt","reportIssueUrl":"https://github.com/microsoft/vscode/issues/new","nodejsArtifactFeed":"","electronArtifactFeed":"","urlProtocol":"code-oss","agentsTelemetryAppName":"agents","webviewContentExternalBaseUrlTemplate":"https://{{uuid}}.vscode-cdn.net/insider/ef65ac1ba57f57f2a3961bfe94aa20481caca4c6/out/vs/workbench/contrib/webview/browser/pre/","builtInExtensions":[{"name":"ms-vscode.js-debug-companion","version":"1.1.3","sha256":"7380a890787452f14b2db7835dfa94de538caf358ebc263f9d46dd68ac52de93","repo":"https://github.com/microsoft/vscode-js-debug-companion","metadata":{"id":"99cb0b7f-7354-4278-b8da-6cc79972169d","publisherId":{"publisherId":"5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee","publisherName":"ms-vscode","displayName":"Microsoft","flags":"verified"},"publisherDisplayName":"Microsoft"}},{"name":"ms-vscode.js-debug","version":"1.117.0","sha256":"854eeb8a785b1f41ba2bd02d7ccd4fdbe10021b61473293973c7e96d036c7fb8","repo":"https://github.com/microsoft/vscode-js-debug","metadata":{"id":"25629058-ddac-4e17-abba-74678e126c5d","publisherId":{"publisherId":"5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee","publisherName":"ms-vscode","displayName":"Microsoft","flags":"verified"},"publisherDisplayName":"Microsoft"}},{"name":"ms-vscode.vscode-js-profile-table","version":"1.0.11","sha256":"a962a1e6a3baf74c9354b7f47fa96e6d6f0423a63bff55d7f976b6134a748ae9","repo":"https://github.com/microsoft/vscode-js-profile-visualizer","metadata":{"id":"7e52b41b-71ad-457b-ab7e-0620f1fc4feb","publisherId":{"publisherId":"5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee","publisherName":"ms-vscode","displayName":"Microsoft","flags":"verified"},"publisherDisplayName":"Microsoft"}}],"defaultChatAgent":{"extensionId":"","chatExtensionId":"volter-ai-dev.supercode-frontend-vscode","icon":"chat-sparkle","provider":{"default":{"id":"","name":""},"enterprise":{"id":"","name":""}},"providerScopes":[]},"trustedExtensionAuthAccess":{"github":["GitHub.copilot-chat"],"github-enterprise":["GitHub.copilot-chat"],"microsoft":["vscode.github-authentication"]},"onboardingKeymaps":[{"id":"vscode","label":"VS Code","description":"Default keyboard mapping"},{"id":"sublime","label":"Sublime Text","extensionId":"ms-vscode.sublime-keybindings","description":"Keyboard mapping from Sublime Text"},{"id":"intellij","label":"IntelliJ / JetBrains","extensionId":"k--kato.intellij-idea-keybindings","description":"Keyboard mapping from IntelliJ IDEA"},{"id":"vim","label":"Vim","extensionId":"vscodevim.vim","description":"Vim modal editing"},{"id":"eclipse","label":"Eclipse","extensionId":"alphabotsec.vscode-eclipse-keybindings","description":"Keyboard mapping from Eclipse"},{"id":"notepadpp","label":"Notepad++","extensionId":"ms-vscode.notepadplusplus-keybindings","description":"Keyboard mapping from Notepad++"}],"onboardingThemes":[{"id":"dark-2026","label":"Dark 2026","themeId":"Dark 2026","type":"dark"},{"id":"hc-dark","label":"Dark High Contrast","themeId":"Default High Contrast","type":"hcDark"},{"id":"solarized-dark","label":"Solarized Dark","themeId":"Solarized Dark","type":"dark"},{"id":"light-2026","label":"Light 2026","themeId":"Light 2026","type":"light"},{"id":"hc-light","label":"Light High Contrast","themeId":"Default High Contrast Light","type":"hcLight"},{"id":"solarized-light","label":"Solarized Light","themeId":"Solarized Light","type":"light"}],"builtInExtensionsEnabledWithAutoUpdates":["GitHub.copilot-chat"],"sessionsWindowAllowedExtensions":[],"voiceWsUrl":"wss://falcon-caas.mai.microsoft.com/voice-code/api/v1/realtime/voice","vsdaEnabled":false,"extensionEnabledApiProposals":{"volter-ai-dev.supercode-frontend-vscode":["defaultChatParticipant","chatParticipantPrivate","chatParticipantAdditions","chatSessionsProvider","chatProvider"],"openai.chatgpt":["chatSessionsProvider","languageModelProxy"]},"trustedExtensionPublishers":["openai"],"extensionsGallery":{"serviceUrl":"https://open-vsx.org/vscode/gallery","itemUrl":"https://open-vsx.org/vscode/item","resourceUrlTemplate":"https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}","extensionUrlTemplate":"https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest"}});
		// VOLTER END source product configuration
	}
}

export default product;
