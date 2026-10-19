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

/** Validated settings for a document (resource-scoped values apply). */
export function readSettings(resource?: vscode.Uri): Settings {
  const cfg = section(resource)
  return settingsFromConfig(key => cfg.get(key))
}

export function readPreviewOptions(resource?: vscode.Uri): PreviewOptions {
  const cfg = section(resource)
  return previewOptionsFromConfig(key => cfg.get(key))
}
