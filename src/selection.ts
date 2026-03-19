import type { NodePluginData } from './types';
import type { SelectionStatus } from './types';
import { readNodeData } from './storage';

/** Returns true if a node is a supported target (FrameNode). */
export function isSupportedNode(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME';
}

function nearestSupportedAncestor(node: BaseNode | null): FrameNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'FRAME') return current;
    current = current.parent;
  }
  return null;
}

/** Returns true if a node is managed (has valid plugin data). */
export function isManagedNode(node: SceneNode): boolean {
  if (!isSupportedNode(node)) return false;
  return readNodeData(node) !== null;
}

/** Filter the current selection to only supported nodes. */
export function getSupportedNodes(nodes: readonly SceneNode[]): FrameNode[] {
  const supportedById = new Map<string, FrameNode>();

  for (const node of nodes) {
    const resolved = isSupportedNode(node) ? node : nearestSupportedAncestor(node);
    if (resolved) {
      supportedById.set(resolved.id, resolved);
    }
  }

  return Array.from(supportedById.values());
}

/** Filter the current selection to only managed nodes. */
export function getManagedNodes(nodes: readonly SceneNode[]): Array<FrameNode & { pluginData: NodePluginData }> {
  return getSupportedNodes(nodes).filter((n) => isManagedNode(n)) as Array<FrameNode & { pluginData: NodePluginData }>;
}

/** Build SelectionStatus from current selection. */
export function getSelectionStatus(nodes: readonly SceneNode[]): SelectionStatus {
  const supported = getSupportedNodes(nodes);
  const managed = supported.filter((n) => isManagedNode(n));
  const unsupportedCount = nodes.filter((node) => {
    const resolved = isSupportedNode(node) ? node : nearestSupportedAncestor(node);
    return resolved === null;
  }).length;

  let firstManagedData: NodePluginData | null = null;
  let firstManagedNodeId: string | null = null;
  if (managed.length > 0) {
    firstManagedNodeId = managed[0].id;
    firstManagedData = readNodeData(managed[0]);
  }

  return {
    supportedCount: supported.length,
    managedCount: managed.length,
    unsupportedCount,
    firstManagedData,
    firstManagedNodeId,
  };
}

/**
 * Collect all managed FrameNodes on the current page.
 * Walks the entire page node tree.
 */
export function getManagedNodesOnPage(): FrameNode[] {
  const results: FrameNode[] = [];
  function walk(node: BaseNode): void {
    if (node.type === 'FRAME' && readNodeData(node) !== null) {
      results.push(node as FrameNode);
    }
    if ('children' in node) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  walk(figma.currentPage);
  return results;
}
