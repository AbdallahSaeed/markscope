export const VSCODE_ENGINE: string
export const PREVIEW_VIEW_TYPE: string
export function createVscodeManifest(options: { version: string; publisher: string }): {
  name: string
  version: string
  publisher: string
  engines: { vscode: string }
  main: string
  activationEvents: string[]
  capabilities: Record<string, unknown>
  contributes: {
    commands: { command: string }[]
    menus: {
      'editor/title': { command: string }[]
      commandPalette: { command: string }[]
    }
    keybindings: { command: string }[]
    customEditors: {
      viewType: string
      priority: string
      selector: { filenamePattern: string }[]
    }[]
    configuration: { properties: Record<string, Record<string, unknown>> }
  }
}
export function markdownFileGlob(): string
