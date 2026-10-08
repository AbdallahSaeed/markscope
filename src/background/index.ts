/**
 * Service worker entry: wires browser events to the pure modules. Kept thin
 * so the logic stays unit-testable.
 */
import { errorMessage, log } from '@/shared/errors'
import { chromeArea } from '@/storage/area'
import { secretsStore, settingsStore } from '@/storage'
import { createAIService } from './ai-service'
import { syncUserPatterns } from './content-scripts'
import { createMenus, menuTargetUrl } from './context-menus'
import { createHandoffStore } from './handoff'
import { readTabDocument } from './read-tab'
import { createRouter } from './router'

const viewerBase = chrome.runtime.getURL('viewer.html')
const extensionOrigin = chrome.runtime.getURL('')
const settings = settingsStore()
const secrets = secretsStore()

const router = createRouter({
  handoff: createHandoffStore(chromeArea('session')),
  runtimeId: chrome.runtime.id,
  viewerBase,
  extensionOrigin,
  tabs: chrome.tabs,
  readTab: tabId => readTabDocument(tabId, chrome.scripting),
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router
    .handle(message, sender)
    .then(sendResponse)
    .catch(error => {
      log.error('message failed', error)
      sendResponse({ ok: false, error: errorMessage(error) })
    })
  return true
})

const ai = createAIService({
  loadSettings: () => settings.load(),
  getApiKey: origin => secrets.getApiKey(origin),
  extensionOrigin,
})
chrome.runtime.onConnect.addListener(port => ai.onConnect(port))

chrome.contextMenus.onClicked.addListener(info => {
  const url = menuTargetUrl(info, viewerBase)
  if (url) void chrome.tabs.create({ url })
})

chrome.commands.onCommand.addListener(command => {
  if (command === 'open-home') void chrome.tabs.create({ url: viewerBase })
})

async function resyncPatterns(): Promise<void> {
  try {
    const s = await settings.load()
    await syncUserPatterns(s.urlPatterns, chrome)
  } catch (error) {
    log.warn('could not sync URL patterns', error)
  }
}

// Secrets and history live in storage.local; content scripts never need it.
chrome.storage.local
  .setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
  .catch(error => log.warn('storage access level', error))

chrome.runtime.onInstalled.addListener(details => {
  void createMenus(chrome.contextMenus)
  void resyncPatterns()
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: `${viewerBase}?welcome=1` })
  }
})

settings.subscribe(() => void resyncPatterns())
chrome.permissions.onAdded.addListener(() => void resyncPatterns())
chrome.permissions.onRemoved.addListener(() => void resyncPatterns())
