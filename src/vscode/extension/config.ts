import * as vscode from 'vscode'
import type { Settings } from '@/shared/settings'
import {
  CONFIG_SECTION,
  previewOptionsFromConfig,
  settingsFromConfig,
  type PreviewOptions,
} from '../config-schema'

const section = (resource?: vscode.Uri) =>
  vscode.workspace.getConfiguration(CONFIG_SECTION, resource)

/** The configured settings, whether or not the workspace is trusted (for choosing a key's origin). */
export function readConfiguredSettings(resource?: vscode.Uri): Settings {
  const cfg = section(resource)
  return settingsFromConfig(key => cfg.get(key))
}

/**
 * Validated settings for a document. In an untrusted workspace the AI assistant is
 * forced off: nothing may send document text anywhere until the user trusts the folder.
 */
export function readSettings(resource?: vscode.Uri): Settings {
  const settings = readConfiguredSettings(resource)
  return vscode.workspace.isTrusted
    ? settings
    : { ...settings, ai: { ...settings.ai, enabled: false } }
}

export function readPreviewOptions(resource?: vscode.Uri): PreviewOptions {
  const cfg = section(resource)
  return previewOptionsFromConfig(key => cfg.get(key))
}
