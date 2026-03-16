import { computeSquircle } from './compute';
import { readNodeData, updateLastComputed } from './storage';
import { isSupportedNode } from './selection';
import type { FrameDimensions, ComputeResult } from './types';

interface WatchedFrame {
  nodeId: string;
  lastWidth: number;
  lastHeight: number;
}

type LiveUpdateCallback = (managedCount: number) => void;

export class Watcher {
  private watched = new Map<string, WatchedFrame>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private onUpdate: LiveUpdateCallback;
  private debounceMs: number;

  constructor(onUpdate: LiveUpdateCallback, debounceMs = 100) {
    this.onUpdate = onUpdate;
    this.debounceMs = debounceMs;
  }

  /** Register a managed node for watching. */
  watch(node: FrameNode): void {
    this.watched.set(node.id, {
      nodeId: node.id,
      lastWidth: node.width,
      lastHeight: node.height,
    });
  }

  /** Unwatch a node. */
  unwatch(nodeId: string): void {
    this.watched.delete(nodeId);
    const timer = this.timers.get(nodeId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(nodeId);
    }
  }

  /** Clear all watched nodes. */
  clear(): void {
    for (const id of this.timers.keys()) {
      const timer = this.timers.get(id);
      if (timer !== undefined) clearTimeout(timer);
    }
    this.timers.clear();
    this.watched.clear();
  }

  get watchedCount(): number {
    return this.watched.size;
  }

  /**
   * Call this from the document change handler.
   * Checks all watched nodes for dimension changes and debounces recalculation.
   */
  handleDocumentChange(changes: readonly DocumentChange[]): void {
    const changedNodeIds = new Set<string>();

    for (const change of changes) {
      if (
        change.type === 'PROPERTY_CHANGE' &&
        'nodeId' in change &&
        (change.properties.includes('width') || change.properties.includes('height'))
      ) {
        changedNodeIds.add((change as { nodeId: string }).nodeId);
      }
    }

    for (const nodeId of changedNodeIds) {
      if (this.watched.has(nodeId)) {
        this.scheduleRecalc(nodeId);
      }
    }
  }

  private scheduleRecalc(nodeId: string): void {
    const existing = this.timers.get(nodeId);
    if (existing !== undefined) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(nodeId);
      this.recalcNode(nodeId);
    }, this.debounceMs);

    this.timers.set(nodeId, timer);
  }

  private recalcNode(nodeId: string): void {
    const watched = this.watched.get(nodeId);
    if (!watched) return;

    const node = figma.getNodeById(nodeId);
    if (!node || !isSupportedNode(node as SceneNode)) {
      this.unwatch(nodeId);
      return;
    }

    const frame = node as FrameNode;
    const data = readNodeData(frame);
    if (!data) {
      this.unwatch(nodeId);
      return;
    }

    const dimensions: FrameDimensions = { width: frame.width, height: frame.height };

    // Skip if dimensions haven't changed
    if (dimensions.width === watched.lastWidth && dimensions.height === watched.lastHeight) return;

    watched.lastWidth = dimensions.width;
    watched.lastHeight = dimensions.height;

    const result: ComputeResult = computeSquircle({
      dimensions,
      model: data.model,
      settings: data.settings,
      constraints: data.constraints,
    });

    applyResultToNode(frame, result);
    updateLastComputed(frame, data, dimensions, result);

    this.onUpdate(this.watched.size);
  }
}

/** Apply a compute result to a Figma frame node. */
export function applyResultToNode(node: FrameNode, result: ComputeResult): void {
  const [tl, tr, br, bl] = result.radii;

  // Only write if changed to reduce Figma undo history noise
  if (node.topLeftRadius !== tl) node.topLeftRadius = tl;
  if (node.topRightRadius !== tr) node.topRightRadius = tr;
  if (node.bottomRightRadius !== br) node.bottomRightRadius = br;
  if (node.bottomLeftRadius !== bl) node.bottomLeftRadius = bl;
  if (node.cornerSmoothing !== result.smoothing) node.cornerSmoothing = result.smoothing;
}
