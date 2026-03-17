import type {
  ComputeInput,
  ComputeResult,
  FixedSettings,
  AdaptiveSettings,
  SmartAdaptiveSettings,
  CornerRadii,
  FrameDimensions,
  ConstraintParams,
} from './types';
import { applyConstraints } from './constraints';

// ─── Size basis helpers ───────────────────────────────────────────────────────

function getSizeBasisValue(dimensions: FrameDimensions, basis: AdaptiveSettings['sizeBasis']): number {
  const { width: W, height: H } = dimensions;
  switch (basis) {
    case 'shortSide': return Math.min(W, H);
    case 'mean': return (W + H) / 2;
    case 'width': return W;
    case 'height': return H;
  }
}

// ─── Model algorithms ─────────────────────────────────────────────────────────

function computeFixed(
  settings: FixedSettings,
  dimensions: FrameDimensions,
  constraints: ConstraintParams,
): ComputeResult {
  const { width: W, height: H } = dimensions;
  const S = Math.min(W, H);

  const rawRadii = settings.baseRadii.map((base, i) => {
    if (settings.radiusMode === 'proportional') {
      return S * settings.radiusFactor[i];
    }
    return base;
  }) as CornerRadii;

  // If corners are linked, use index 0 for all
  const linkedRadii: CornerRadii = settings.cornersLinked
    ? [rawRadii[0], rawRadii[0], rawRadii[0], rawRadii[0]]
    : rawRadii;

  return applyConstraints(linkedRadii, settings.baseSmoothing, dimensions, constraints);
}

function computeAdaptive(
  settings: AdaptiveSettings,
  dimensions: FrameDimensions,
  constraints: ConstraintParams,
): ComputeResult {
  const { width: W, height: H } = dimensions;
  const S = Math.min(W, H);
  const L = Math.max(W, H);
  const AR = S > 0 ? L / S : 1;

  const sizeBasisValue = getSizeBasisValue(dimensions, settings.sizeBasis);
  const base = sizeBasisValue * settings.radiusScale;

  const rawRadii = settings.cornerWeights.map((w) => base * w) as CornerRadii;

  const aspectPenalty = Math.max(0, (AR - 1) * settings.aspectSensitivity);
  const rawSmoothing = settings.targetSmoothing - aspectPenalty;

  return applyConstraints(rawRadii, rawSmoothing, dimensions, constraints);
}

function computeSmartAdaptive(
  settings: SmartAdaptiveSettings,
  dimensions: FrameDimensions,
  constraints: ConstraintParams,
): ComputeResult {
  const { width: W, height: H } = dimensions;
  const S = Math.min(W, H);
  const L = Math.max(W, H);
  const AR = S > 0 ? L / S : 1;

  const sizeFactor = Math.pow(S / settings.referenceSize, settings.responseStrength);
  const aspectComp = 1 / Math.pow(AR, settings.aspectSensitivity);

  const designRadii = settings.cornersLinked
    ? ([settings.designRadii[0], settings.designRadii[0], settings.designRadii[0], settings.designRadii[0]] as CornerRadii)
    : settings.designRadii;

  const rawRadii = designRadii.map((r) => r * sizeFactor * aspectComp) as CornerRadii;

  const aspectPenalty = Math.max(0, (AR - 1) * settings.aspectSensitivity * 0.2);
  const rawSmoothing = settings.designSmoothing - aspectPenalty;

  return applyConstraints(rawRadii, rawSmoothing, dimensions, constraints);
}

// ─── Public compute entry point ───────────────────────────────────────────────

/**
 * Pure compute function. Takes model inputs and returns corner radii + smoothing.
 * No side effects.
 */
export function computeSquircle(input: ComputeInput): ComputeResult {
  const { dimensions, model, settings, constraints } = input;

  switch (model) {
    case 'fixed':
      return computeFixed(settings as FixedSettings, dimensions, constraints);
    case 'adaptive':
      return computeAdaptive(settings as AdaptiveSettings, dimensions, constraints);
    case 'smartAdaptive':
      return computeSmartAdaptive(settings as SmartAdaptiveSettings, dimensions, constraints);
  }
}
