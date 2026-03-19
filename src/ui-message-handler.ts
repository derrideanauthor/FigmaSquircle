import type { UIToPluginMessage, PluginToUIMessage, NodePluginData } from './types';
import { computeSquircle } from './compute';
import { readNodeData, writeNodeData, clearNodeData, updateLastComputed } from './storage';
import { getSupportedNodes, getManagedNodes, getSelectionStatus, getManagedNodesOnPage } from './selection';
import { applyResultToNode } from './watcher';
import type { Watcher } from './watcher';
import type { FrameDimensions } from './types';

function sendToUI(msg: PluginToUIMessage): void {
  figma.ui.postMessage(msg);
}

export function handleUIMessage(msg: UIToPluginMessage, watcher: Watcher): void {
  switch (msg.type) {
    case 'get-remove-confirm-skip-pref': {
      figma.clientStorage.getAsync('removeConfirmSkipPref').then((value) => {
        sendToUI({ type: 'remove-confirm-skip-pref', skip: value === true });
      }).catch(() => {
        sendToUI({ type: 'remove-confirm-skip-pref', skip: false });
      });
      break;
    }

    case 'set-remove-confirm-skip-pref': {
      figma.clientStorage.setAsync('removeConfirmSkipPref', msg.skip).catch(() => {
        // Ignore persistence failures; UI still maintains in-memory state.
      });
      break;
    }

    case 'get-selection-status': {
      const status = getSelectionStatus(figma.currentPage.selection);
      sendToUI({ type: 'selection-status', status });
      break;
    }

    case 'apply':
    case 'apply-live': {
      const isLiveApply = msg.type === 'apply-live';
      const supported = getSupportedNodes(figma.currentPage.selection);
      if (supported.length === 0) {
        if (!isLiveApply) {
          sendToUI({ type: 'action-result', success: false, message: 'No supported frames selected.' });
        }
        return;
      }

      let appliedCount = 0;
      for (const node of supported) {
        const dimensions: FrameDimensions = { width: node.width, height: node.height };
        const result = computeSquircle({ dimensions, model: msg.model, settings: msg.settings, constraints: msg.constraints });

        applyResultToNode(node, result);

        const data: NodePluginData = {
          version: 1,
          managed: true,
          model: msg.model,
          preset: msg.preset,
          settings: msg.settings,
          constraints: msg.constraints,
          lastComputed: {
            width: dimensions.width,
            height: dimensions.height,
            radii: result.radii,
            smoothing: result.smoothing,
            timestamp: Date.now(),
          },
        };
        writeNodeData(node, data);
        watcher.watch(node);
        appliedCount++;
      }

      if (!isLiveApply) {
        sendToUI({ type: 'action-result', success: true, message: `Applied to ${appliedCount} frame${appliedCount !== 1 ? 's' : ''}.` });
      }
      sendToUI({ type: 'live-update', managedCount: watcher.watchedCount });
      break;
    }

    case 'refresh-selection': {
      const managed = getManagedNodes(figma.currentPage.selection);
      if (managed.length === 0) {
        sendToUI({ type: 'action-result', success: false, message: 'No managed frames in selection.' });
        return;
      }
      const count = refreshNodes(managed, watcher);
      sendToUI({ type: 'action-result', success: true, message: `Refreshed ${count} frame${count !== 1 ? 's' : ''}.` });
      sendToUI({ type: 'live-update', managedCount: watcher.watchedCount });
      break;
    }

    case 'refresh-page': {
      const allManaged = getManagedNodesOnPage();
      const count = refreshNodes(allManaged, watcher);
      sendToUI({ type: 'action-result', success: true, message: `Refreshed ${count} managed frame${count !== 1 ? 's' : ''} on page.` });
      sendToUI({ type: 'live-update', managedCount: watcher.watchedCount });
      break;
    }

    case 'remove-management': {
      const managed = getManagedNodes(figma.currentPage.selection);
      if (managed.length === 0) {
        sendToUI({ type: 'action-result', success: false, message: 'No managed frames in selection.' });
        return;
      }
      for (const node of managed) {
        clearNodeData(node);
        watcher.unwatch(node.id);
      }
      sendToUI({ type: 'action-result', success: true, message: `Removed management from ${managed.length} frame${managed.length !== 1 ? 's' : ''}.` });
      sendToUI({ type: 'live-update', managedCount: watcher.watchedCount });
      sendToUI({ type: 'selection-status', status: getSelectionStatus(figma.currentPage.selection) });
      break;
    }
  }
}

function refreshNodes(nodes: FrameNode[], watcher: Watcher): number {
  let count = 0;
  for (const node of nodes) {
    const data = readNodeData(node);
    if (!data) continue;

    const dimensions: FrameDimensions = { width: node.width, height: node.height };
    const result = computeSquircle({ dimensions, model: data.model, settings: data.settings, constraints: data.constraints });

    applyResultToNode(node, result);
    updateLastComputed(node, data, dimensions, result);
    watcher.watch(node);
    count++;
  }
  return count;
}
