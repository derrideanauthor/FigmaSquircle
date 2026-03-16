// Core domain types for Squircle Frame plugin

export type ModelType = 'fixed' | 'adaptive' | 'smartAdaptive';
export type PresetName = 'Subtle' | 'Balanced' | 'Bold' | 'Pill Adaptive';
export type SizeBasis = 'shortSide' | 'mean' | 'width' | 'height';
export type RadiusMode = 'absolute' | 'proportional';

/** Four corner radii [topLeft, topRight, bottomRight, bottomLeft] */
export type CornerRadii = [number, number, number, number];

// ─── Per-model settings ──────────────────────────────────────────────────────

export interface FixedSettings {
  cornersLinked: boolean;
  /** Base radius. When linked, only [0] is used. */
  baseRadii: CornerRadii;
  baseSmoothing: number;
  radiusMode: RadiusMode;
  /** Used when radiusMode === 'proportional' */
  radiusFactor: CornerRadii;
}

export interface AdaptiveSettings {
  radiusScale: number;
  targetSmoothing: number;
  aspectSensitivity: number;
  sizeBasis: SizeBasis;
  /** Per-corner weight multipliers. Defaults to [1,1,1,1]. */
  cornerWeights: CornerRadii;
}

export interface SmartAdaptiveSettings {
  cornersLinked: boolean;
  /** Design-time radius. When linked, only [0] is used. */
  designRadii: CornerRadii;
  designSmoothing: number;
  referenceSize: number;
  responseStrength: number;
  aspectSensitivity: number;
}

export type ModelSettings = FixedSettings | AdaptiveSettings | SmartAdaptiveSettings;

// ─── Shared constraint parameters ────────────────────────────────────────────

export interface ConstraintParams {
  minRadius: number;
  maxRadius: number;
  minSmoothing: number;
  maxSmoothing: number;
  minFrameSize: number;
  aspectGuard: number;
  roundingStep: number;
  smoothingStep: number;
}

// ─── Compute input / output ───────────────────────────────────────────────────

export interface FrameDimensions {
  width: number;
  height: number;
}

export interface ComputeInput {
  dimensions: FrameDimensions;
  model: ModelType;
  settings: ModelSettings;
  constraints: ConstraintParams;
}

export interface ComputeResult {
  radii: CornerRadii;
  smoothing: number;
}

// ─── Plugin node data ─────────────────────────────────────────────────────────

export interface LastComputed {
  width: number;
  height: number;
  radii: CornerRadii;
  smoothing: number;
  timestamp: number;
}

export interface NodePluginData {
  version: 1;
  managed: true;
  model: ModelType;
  preset: PresetName | null;
  settings: ModelSettings;
  constraints: ConstraintParams;
  lastComputed: LastComputed | null;
}

// ─── UI <-> Plugin messages ───────────────────────────────────────────────────

export interface SelectionStatus {
  supportedCount: number;
  managedCount: number;
  unsupportedCount: number;
  /** Settings from the first managed frame (for UI pre-fill) */
  firstManagedData: NodePluginData | null;
}

export type UIToPluginMessage =
  | { type: 'apply'; model: ModelType; preset: PresetName | null; settings: ModelSettings; constraints: ConstraintParams }
  | { type: 'refresh-selection' }
  | { type: 'refresh-page' }
  | { type: 'remove-management' }
  | { type: 'get-selection-status' };

export type PluginToUIMessage =
  | { type: 'selection-status'; status: SelectionStatus }
  | { type: 'action-result'; success: boolean; message: string }
  | { type: 'live-update'; managedCount: number };
