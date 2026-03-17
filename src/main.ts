import { Watcher } from './watcher';
import { handleUIMessage } from './ui-message-handler';
import { getSelectionStatus, getManagedNodesOnPage } from './selection';
import type { UIToPluginMessage, PluginToUIMessage } from './types';

// Open the plugin UI (300x520 pixels)
figma.showUI(__html__, { width: 300, height: 520, themeColors: true });

const watcher = new Watcher((managedCount) => {
  const msg: PluginToUIMessage = { type: 'live-update', managedCount };
  figma.ui.postMessage(msg);
});

// On startup: scan selection and send initial status
function sendSelectionStatus(): void {
  const status = getSelectionStatus(figma.currentPage.selection);
  const msg: PluginToUIMessage = { type: 'selection-status', status };
  figma.ui.postMessage(msg);
}

// Watch all managed nodes already on page on startup
function initWatcher(): void {
  const managed = getManagedNodesOnPage();
  for (const node of managed) {
    watcher.watch(node);
  }
}

initWatcher();
sendSelectionStatus();

// Listen for selection changes
figma.on('selectionchange', () => {
  sendSelectionStatus();
});

// Listen for document changes (dimension updates)
figma.on('documentchange', ({ documentChanges }) => {
  watcher.handleDocumentChange(documentChanges);
});

// Handle messages from the UI
figma.ui.onmessage = (rawMsg: unknown) => {
  const msg = rawMsg as UIToPluginMessage;
  handleUIMessage(msg, watcher);
};

// Clean up on close
figma.on('close', () => {
  watcher.clear();
});
