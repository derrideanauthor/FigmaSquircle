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

// Startup ping to prove plugin -> UI bridge is alive.
figma.ui.postMessage({ type: 'live-update', managedCount: watcher.watchedCount } as PluginToUIMessage);

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

function reportStartupError(stage: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  figma.notify(`Squirclify! error (${stage}): ${message}`, { timeout: 4000 });
  figma.ui.postMessage({ type: 'action-result', success: false, message: `Startup error (${stage}): ${message}` } as PluginToUIMessage);
}

// Handle messages from the UI as early as possible so diagnostics requests can still work.
figma.ui.onmessage = (rawMsg: unknown) => {
  try {
    const msg = rawMsg as UIToPluginMessage;
    handleUIMessage(msg, watcher);
  } catch (err) {
    reportStartupError('ui-message', err);
  }
};

try {
  initWatcher();
} catch (err) {
  reportStartupError('init-watcher', err);
}

try {
  sendSelectionStatus();
} catch (err) {
  reportStartupError('initial-status', err);
}

// Poll selection status as a fallback in case selectionchange events are missed.
const selectionPollTimer = setInterval(() => {
  sendSelectionStatus();
}, 1000);

// Listen for selection changes
figma.on('selectionchange', () => {
  sendSelectionStatus();
});

// Listen for document changes (dimension updates)
figma.on('documentchange', ({ documentChanges }) => {
  watcher.handleDocumentChange(documentChanges);
});

// Clean up on close
figma.on('close', () => {
  clearInterval(selectionPollTimer);
  watcher.clear();
});
