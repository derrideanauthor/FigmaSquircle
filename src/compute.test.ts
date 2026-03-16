import { computeSquircle } from './compute';
import { DEFAULT_CONSTRAINTS } from './models';
import type { ComputeInput } from './types';

const C = DEFAULT_CONSTRAINTS;

describe('computeSquircle – fixed model', () => {
  it('returns clamped absolute radii for a square frame', () => {
    const input: ComputeInput = {
      dimensions: { width: 200, height: 200 },
      model: 'fixed',
      settings: {
        cornersLinked: true,
        baseRadii: [24, 24, 24, 24],
        baseSmoothing: 0.6,
        radiusMode: 'absolute',
        radiusFactor: [0.12, 0.12, 0.12, 0.12],
      },
      constraints: C,
    };
    const result = computeSquircle(input);
    expect(result.radii).toEqual([24, 24, 24, 24]);
    expect(result.smoothing).toBeCloseTo(0.6, 2);
  });

  it('clamps radius to half the short side', () => {
    const input: ComputeInput = {
      dimensions: { width: 40, height: 40 },
      model: 'fixed',
      settings: {
        cornersLinked: true,
        baseRadii: [999, 999, 999, 999],
        baseSmoothing: 0.5,
        radiusMode: 'absolute',
        radiusFactor: [0.12, 0.12, 0.12, 0.12],
      },
      constraints: C,
    };
    const result = computeSquircle(input);
    // max radius = min(999, 40/2) = 20
    expect(result.radii[0]).toBeLessThanOrEqual(20);
  });

  it('applies proportional radius mode', () => {
    const input: ComputeInput = {
      dimensions: { width: 200, height: 100 },
      model: 'fixed',
      settings: {
        cornersLinked: true,
        baseRadii: [0, 0, 0, 0],
        baseSmoothing: 0.6,
        radiusMode: 'proportional',
        radiusFactor: [0.1, 0.1, 0.1, 0.1],
      },
      constraints: C,
    };
    // S = min(200,100) = 100; radius = 100 * 0.1 = 10
    const result = computeSquircle(input);
    expect(result.radii[0]).toBe(10);
  });

  it('smoothing is capped at 0.95', () => {
    const input: ComputeInput = {
      dimensions: { width: 100, height: 100 },
      model: 'fixed',
      settings: {
        cornersLinked: true,
        baseRadii: [10, 10, 10, 10],
        baseSmoothing: 1.0,
        radiusMode: 'absolute',
        radiusFactor: [0.1, 0.1, 0.1, 0.1],
      },
      constraints: C,
    };
    const result = computeSquircle(input);
    expect(result.smoothing).toBeLessThanOrEqual(0.95);
  });
});

describe('computeSquircle – adaptive model', () => {
  it('scales radius by radiusScale * shortSide', () => {
    const input: ComputeInput = {
      dimensions: { width: 200, height: 100 },
      model: 'adaptive',
      settings: {
        radiusScale: 0.1,
        targetSmoothing: 0.6,
        aspectSensitivity: 0,
        sizeBasis: 'shortSide',
        cornerWeights: [1, 1, 1, 1],
      },
      constraints: C,
    };
    // S = 100; base = 100 * 0.1 = 10
    const result = computeSquircle(input);
    expect(result.radii[0]).toBe(10);
  });

  it('reduces smoothing for wide aspect ratio', () => {
    const narrow: ComputeInput = {
      dimensions: { width: 100, height: 100 },
      model: 'adaptive',
      settings: {
        radiusScale: 0.1,
        targetSmoothing: 0.6,
        aspectSensitivity: 0.2,
        sizeBasis: 'shortSide',
        cornerWeights: [1, 1, 1, 1],
      },
      constraints: C,
    };
    const wide: ComputeInput = {
      ...narrow,
      dimensions: { width: 400, height: 100 },
    };
    const narrowResult = computeSquircle(narrow);
    const wideResult = computeSquircle(wide);
    expect(wideResult.smoothing).toBeLessThan(narrowResult.smoothing);
  });

  it('applies corner weights', () => {
    const input: ComputeInput = {
      dimensions: { width: 200, height: 200 },
      model: 'adaptive',
      settings: {
        radiusScale: 0.1,
        targetSmoothing: 0.6,
        aspectSensitivity: 0,
        sizeBasis: 'shortSide',
        cornerWeights: [1, 2, 1, 0.5],
      },
      constraints: C,
    };
    const result = computeSquircle(input);
    expect(result.radii[1]).toBeGreaterThan(result.radii[0]);
    expect(result.radii[3]).toBeLessThan(result.radii[0]);
  });
});

describe('computeSquircle – smartAdaptive model', () => {
  it('matches design radius at reference size', () => {
    const input: ComputeInput = {
      dimensions: { width: 200, height: 200 },
      model: 'smartAdaptive',
      settings: {
        cornersLinked: true,
        designRadii: [24, 24, 24, 24],
        designSmoothing: 0.6,
        referenceSize: 200,
        responseStrength: 0.35,
        aspectSensitivity: 0,
      },
      constraints: C,
    };
    // S = 200 = referenceSize, so sizeFactor = 1; AR = 1, so aspectComp = 1; radius = 24
    const result = computeSquircle(input);
    expect(result.radii[0]).toBe(24);
  });

  it('reduces radius for smaller frames', () => {
    const big: ComputeInput = {
      dimensions: { width: 400, height: 400 },
      model: 'smartAdaptive',
      settings: {
        cornersLinked: true,
        designRadii: [24, 24, 24, 24],
        designSmoothing: 0.6,
        referenceSize: 200,
        responseStrength: 0.5,
        aspectSensitivity: 0,
      },
      constraints: C,
    };
    const small: ComputeInput = {
      ...big,
      dimensions: { width: 100, height: 100 },
    };
    const bigResult = computeSquircle(big);
    const smallResult = computeSquircle(small);
    expect(bigResult.radii[0]).toBeGreaterThan(smallResult.radii[0]);
  });

  it('handles very small frames safely', () => {
    const input: ComputeInput = {
      dimensions: { width: 8, height: 8 },
      model: 'smartAdaptive',
      settings: {
        cornersLinked: true,
        designRadii: [24, 24, 24, 24],
        designSmoothing: 0.6,
        referenceSize: 200,
        responseStrength: 0.35,
        aspectSensitivity: 0,
      },
      constraints: C,
    };
    const result = computeSquircle(input);
    // radius must not exceed half the short side = 4
    expect(result.radii[0]).toBeLessThanOrEqual(4);
    expect(result.smoothing).toBeGreaterThanOrEqual(0);
  });
});

describe('constraints', () => {
  it('aspect guard reduces smoothing for extreme aspect ratios', () => {
    const normal: ComputeInput = {
      dimensions: { width: 100, height: 100 },
      model: 'fixed',
      settings: {
        cornersLinked: true,
        baseRadii: [8, 8, 8, 8],
        baseSmoothing: 0.6,
        radiusMode: 'absolute',
        radiusFactor: [0.08, 0.08, 0.08, 0.08],
      },
      constraints: { ...C, aspectGuard: 3 },
    };
    const extreme: ComputeInput = {
      ...normal,
      dimensions: { width: 1000, height: 100 },
    };
    const normalResult = computeSquircle(normal);
    const extremeResult = computeSquircle(extreme);
    expect(extremeResult.smoothing).toBeLessThanOrEqual(normalResult.smoothing);
  });

  it('minRadius is always respected', () => {
    const input: ComputeInput = {
      dimensions: { width: 200, height: 200 },
      model: 'fixed',
      settings: {
        cornersLinked: true,
        baseRadii: [0, 0, 0, 0],
        baseSmoothing: 0.5,
        radiusMode: 'absolute',
        radiusFactor: [0, 0, 0, 0],
      },
      constraints: { ...C, minRadius: 5 },
    };
    const result = computeSquircle(input);
    expect(result.radii[0]).toBeGreaterThanOrEqual(5);
  });
});
