import type { NodePluginData, ComputeResult, FrameDimensions } from './types';

const PLUGIN_DATA_KEY = 'squircleFrame';

/** Attempt to parse and validate plugin data from a node. Returns null if invalid. */
export function readNodeData(node: BaseNode): NodePluginData | null {
  try {
    const raw = node.getPluginData(PLUGIN_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NodePluginData>;
    if (parsed.version !== 1 || !parsed.managed) return null;
    return parsed as NodePluginData;
  } catch {
    return null;
  }
}

/** Write plugin data to a node. */
export function writeNodeData(node: BaseNode, data: NodePluginData): void {
  node.setPluginData(PLUGIN_DATA_KEY, JSON.stringify(data));
}

/** Remove plugin data from a node. */
export function clearNodeData(node: BaseNode): void {
  node.setPluginData(PLUGIN_DATA_KEY, '');
}

/** Update the lastComputed field on stored data. */
export function updateLastComputed(
  node: BaseNode,
  existing: NodePluginData,
  dimensions: FrameDimensions,
  result: ComputeResult,
): void {
  const updated: NodePluginData = {
    ...existing,
    lastComputed: {
      width: dimensions.width,
      height: dimensions.height,
      radii: result.radii,
      smoothing: result.smoothing,
      timestamp: Date.now(),
    },
  };
  writeNodeData(node, updated);
}
