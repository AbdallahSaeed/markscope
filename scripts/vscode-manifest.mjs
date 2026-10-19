/**
 * Generates the VS Code extension's package.json. The configuration schema
 * and the Markdown file patterns come from src/ (config-schema.ts, urls.ts),
 * so the Settings UI and the runtime cannot drift apart.
 */
import { CONFIG_SECTION, configurationProperties } from '../src/vscode/config-schema.ts'
import { MARKDOWN_EXTENSIONS } from '../src/shared/urls.ts'

/** Oldest VS Code we support. @types/vscode in package.json is pinned to this. */
export const VSCODE_ENGINE = '^1.90.0'
export const PREVIEW_VIEW_TYPE = 'markscope.preview'

const isMarkdown = 'resourceLangId == markdown'
const inPreview = `activeWebviewPanelId == ${PREVIEW_VIEW_TYPE}`

export function createVscodeManifest({ version, publisher }) {
  const category = 'Markscope'
  return {
    name: 'markscope',
    displayName: 'Markscope: Markdown Reader, Diagrams & Doctor',
    description:
      'Fast, secure Markdown preview with Mermaid, Graphviz, KaTeX, an outline, and a documentation doctor in the Problems panel.',
    version,
    publisher,
    license: 'MIT',
    icon: 'icon.png',
    galleryBanner: { color: '#4b5ff0', theme: 'dark' },
    engines: { vscode: VSCODE_ENGINE },
    categories: ['Visualization', 'Linters', 'Other'],
    keywords: [
      'markdown',
      'preview',
      'mermaid',
      'graphviz',
      'katex',
      'diagram',
      'reader',
      'lint',
      'docs',
    ],
    repository: { type: 'git', url: 'https://github.com/AbdallahSaeed/markscope' },
    homepage: 'https://abdallahsaeed.github.io/markscope/',
    bugs: { url: 'https://github.com/AbdallahSaeed/markscope/issues' },
    main: './extension.js',
    activationEvents: [`onWebviewPanel:${PREVIEW_VIEW_TYPE}`],
    capabilities: {
      // A cloned repo's .vscode/settings.json must not widen what a document may do.
      untrustedWorkspaces: {
        supported: 'limited',
        description:
          'In an untrusted workspace the preview ignores workspace settings that enable raw HTML, diagrams or remote images.',
        restrictedConfigurations: [
          'markscope.markdown.html',
          'markscope.markdown.mermaid',
          'markscope.markdown.graphviz',
          'markscope.images.remote',
        ],
      },
      virtualWorkspaces: true,
    },
    contributes: {
      commands: [
        {
          command: 'markscope.openPreview',
          title: 'Open Preview',
          category,
          icon: '$(open-preview)',
        },
        {
          command: 'markscope.openPreviewToSide',
          title: 'Open Preview to the Side',
          category,
          icon: '$(open-preview)',
        },
        { command: 'markscope.toggleLock', title: 'Toggle Preview Lock', category },
        { command: 'markscope.find', title: 'Find in Preview', category },
        { command: 'markscope.toggleSidebar', title: 'Toggle Outline', category },
        { command: 'markscope.focusMode', title: 'Toggle Focus Mode', category },
        { command: 'markscope.runDoctor', title: 'Run Document Doctor', category },
      ],
      menus: {
        'editor/title': [
          {
            command: 'markscope.openPreviewToSide',
            when: isMarkdown,
            group: 'navigation',
          },
        ],
        commandPalette: [
          { command: 'markscope.openPreview', when: isMarkdown },
          { command: 'markscope.openPreviewToSide', when: isMarkdown },
          { command: 'markscope.toggleLock', when: inPreview },
          { command: 'markscope.find', when: inPreview },
          { command: 'markscope.toggleSidebar', when: inPreview },
          { command: 'markscope.focusMode', when: inPreview },
          { command: 'markscope.runDoctor', when: inPreview },
        ],
      },
      keybindings: [
        { command: 'markscope.find', key: 'ctrl+f', mac: 'cmd+f', when: inPreview },
      ],
      configuration: {
        title: 'Markscope',
        properties: configurationProperties(),
      },
    },
  }
}

/** Markdown file name globs, for hosts that need a selector (custom editor, later). */
export function markdownFileGlob() {
  return `*.{${MARKDOWN_EXTENSIONS.join(',')}}`
}

export { CONFIG_SECTION }
