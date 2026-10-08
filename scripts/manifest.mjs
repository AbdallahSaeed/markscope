/**
 * Generates manifest.json per browser target. Content-script match patterns
 * come from src/shared/urls.ts so detection logic and manifest never drift.
 */
import { markdownMatchPatterns } from '../src/shared/urls.ts'

export function createManifest({ version, target }) {
  const manifest = {
    manifest_version: 3,
    name: '__MSG_extName__',
    short_name: 'Markscope',
    description: '__MSG_extDescription__',
    version,
    default_locale: 'en',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'Markscope',
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
    },
    options_ui: { page: 'options.html', open_in_tab: true },
    background: { service_worker: 'js/background.js', type: 'module' },
    permissions: ['storage', 'contextMenus', 'activeTab', 'scripting'],
    // Host access beyond *.md URLs (live reload from servers without CORS,
    // user URL patterns, AI endpoints) is requested at runtime, per origin.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    content_scripts: [
      {
        matches: markdownMatchPatterns(),
        js: ['js/content.js'],
        run_at: 'document_end',
        all_frames: false,
      },
    ],
    web_accessible_resources: [],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; default-src 'self'; style-src 'self' 'unsafe-inline'; img-src * data: blob: file:; media-src * data: blob: file:; font-src 'self' data:; connect-src * data: blob: file:; worker-src 'self'",
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Open the Markscope popup',
      },
      'open-home': {
        suggested_key: { default: 'Alt+Shift+O' },
        description: 'Open the Markscope start page',
      },
    },
    minimum_chrome_version: '116',
  }

  if (target === 'firefox') {
    manifest.background = { scripts: ['js/background.js'], type: 'module' }
    manifest.browser_specific_settings = {
      gecko: {
        id: 'markscope@markscope.dev',
        // data_collection_permissions is understood from Firefox 140.
        strict_min_version: '140.0',
        // Nothing is collected. The optional AI assistant sends document text
        // to the user's own provider, so it asks for this at runtime.
        data_collection_permissions: { required: ['none'], optional: ['websiteContent'] },
      },
      // Same key on Android is understood from 142.
      gecko_android: { strict_min_version: '142.0' },
    }
    delete manifest.minimum_chrome_version
    delete manifest.web_accessible_resources
  }
  return manifest
}
