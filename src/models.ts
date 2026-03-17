import type {
  FixedSettings,
  AdaptiveSettings,
  SmartAdaptiveSettings,
  ConstraintParams,
  ModelType,
  PresetName,
  ModelSettings,
} from './types';

// ─── Default constraint params ────────────────────────────────────────────────

export const DEFAULT_CONSTRAINTS: ConstraintParams = {
  minRadius: 2,
  maxRadius: 999,
  minSmoothing: 0,
  maxSmoothing: 0.95,
  minFrameSize: 16,
  aspectGuard: 6,
  roundingStep: 1,
  smoothingStep: 0.01,
};

// ─── Default settings per model ───────────────────────────────────────────────

export const DEFAULT_FIXED: FixedSettings = {
  cornersLinked: true,
  baseRadii: [24, 24, 24, 24],
  baseSmoothing: 0.6,
  radiusMode: 'absolute',
  radiusFactor: [0.12, 0.12, 0.12, 0.12],
};

export const DEFAULT_ADAPTIVE: AdaptiveSettings = {
  radiusScale: 0.12,
  targetSmoothing: 0.6,
  aspectSensitivity: 0.15,
  sizeBasis: 'shortSide',
  cornerWeights: [1, 1, 1, 1],
};

export const DEFAULT_SMART_ADAPTIVE: SmartAdaptiveSettings = {
  cornersLinked: true,
  designRadii: [24, 24, 24, 24],
  designSmoothing: 0.6,
  referenceSize: 200,
  responseStrength: 0.35,
  aspectSensitivity: 0.15,
};

export function defaultSettingsForModel(model: ModelType): ModelSettings {
  switch (model) {
    case 'fixed':
      return { ...DEFAULT_FIXED, baseRadii: [...DEFAULT_FIXED.baseRadii] as [number, number, number, number], radiusFactor: [...DEFAULT_FIXED.radiusFactor] as [number, number, number, number] };
    case 'adaptive':
      return { ...DEFAULT_ADAPTIVE, cornerWeights: [...DEFAULT_ADAPTIVE.cornerWeights] as [number, number, number, number] };
    case 'smartAdaptive':
      return { ...DEFAULT_SMART_ADAPTIVE, designRadii: [...DEFAULT_SMART_ADAPTIVE.designRadii] as [number, number, number, number] };
  }
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export interface Preset {
  name: PresetName;
  model: ModelType;
  settings: ModelSettings;
  constraints: Partial<ConstraintParams>;
}

export const PRESETS: Record<PresetName, Preset> = {
  Subtle: {
    name: 'Subtle',
    model: 'smartAdaptive',
    settings: {
      cornersLinked: true,
      designRadii: [12, 12, 12, 12],
      designSmoothing: 0.4,
      referenceSize: 200,
      responseStrength: 0.2,
      aspectSensitivity: 0.1,
    } as SmartAdaptiveSettings,
    constraints: {},
  },
  Balanced: {
    name: 'Balanced',
    model: 'smartAdaptive',
    settings: {
      cornersLinked: true,
      designRadii: [24, 24, 24, 24],
      designSmoothing: 0.6,
      referenceSize: 200,
      responseStrength: 0.35,
      aspectSensitivity: 0.15,
    } as SmartAdaptiveSettings,
    constraints: {},
  },
  Bold: {
    name: 'Bold',
    model: 'smartAdaptive',
    settings: {
      cornersLinked: true,
      designRadii: [40, 40, 40, 40],
      designSmoothing: 0.8,
      referenceSize: 200,
      responseStrength: 0.5,
      aspectSensitivity: 0.2,
    } as SmartAdaptiveSettings,
    constraints: {},
  },
  'Pill Adaptive': {
    name: 'Pill Adaptive',
    model: 'adaptive',
    settings: {
      radiusScale: 0.5,
      targetSmoothing: 0.75,
      aspectSensitivity: 0.4,
      sizeBasis: 'shortSide',
      cornerWeights: [1, 1, 1, 1],
    } as AdaptiveSettings,
    constraints: {},
  },
};
