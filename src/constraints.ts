import type { ComputeResult, ConstraintParams, CornerRadii, FrameDimensions } from './types';

const HARD_CAP_SMOOTHING = 0.95;

/** Round a value to the nearest step */
function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/**
 * Apply shared constraints to a raw compute result.
 * Ensures radii and smoothing stay within safe bounds.
 */
export function applyConstraints(
  rawRadii: CornerRadii,
  rawSmoothing: number,
  dimensions: FrameDimensions,
  params: ConstraintParams,
): ComputeResult {
  const W = dimensions.width;
  const H = dimensions.height;
  const S = Math.min(W, H);
  const L = Math.max(W, H);
  const AR = S > 0 ? L / S : 1;

  // Max radius cannot exceed half the short side
  const halfShort = S / 2;

  // Per-corner clamp
  const radii = rawRadii.map((r) => {
    const clamped = Math.max(params.minRadius, Math.min(r, params.maxRadius, halfShort));
    return Math.max(0, roundToStep(clamped, params.roundingStep));
  }) as CornerRadii;

  // Smoothing: aspect guard reduction
  let smoothing = rawSmoothing;
  if (AR > params.aspectGuard) {
    const excess = AR - params.aspectGuard;
    smoothing = rawSmoothing - excess * 0.05;
  }

  smoothing = Math.min(smoothing, HARD_CAP_SMOOTHING, params.maxSmoothing);
  smoothing = Math.max(smoothing, params.minSmoothing);
  smoothing = roundToStep(smoothing, params.smoothingStep);
  // Re-clamp after rounding to guard against floating-point overshoot
  smoothing = Math.min(smoothing, HARD_CAP_SMOOTHING, params.maxSmoothing);

  // If frame is very small, clamp radii further
  if (S < params.minFrameSize) {
    const safeFactor = Math.max(0, S / params.minFrameSize);
    for (let i = 0; i < 4; i++) {
      radii[i] = Math.max(0, Math.min(radii[i], halfShort * safeFactor));
      radii[i] = roundToStep(radii[i], params.roundingStep);
    }
  }

  return { radii, smoothing };
}
