export const NINESLICE_VIEWPORT_REFERENCE_MIN_DIM = 390;
export const NINESLICE_BORDER_REFERENCE_WIDTH = 16;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const resolveNineSliceDensityFactor = ({
  scaleMode,
  dprReference,
  dprMinFactor,
  dprMaxFactor,
  devicePixelRatio,
}: {
  scaleMode: 'density' | 'none';
  dprReference: number;
  dprMinFactor: number;
  dprMaxFactor: number;
  devicePixelRatio?: number;
}): number => {
  if (scaleMode !== 'density') return 1;
  const safeReference = dprReference > 0 ? dprReference : 2;
  const dpr = devicePixelRatio ?? (typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1));
  return clamp(dpr / safeReference, dprMinFactor, dprMaxFactor);
};

export const estimateNineSliceBaseBorderWidth = (
  viewportWidth?: number,
  viewportHeight?: number
): number => {
  const fallbackWidth = typeof window === 'undefined' ? NINESLICE_VIEWPORT_REFERENCE_MIN_DIM : window.innerWidth;
  const fallbackHeight = typeof window === 'undefined' ? NINESLICE_VIEWPORT_REFERENCE_MIN_DIM : window.innerHeight;

  const width = viewportWidth ?? fallbackWidth;
  const height = viewportHeight ?? fallbackHeight;
  const viewportMinDim = Math.max(1, Math.min(width, height));
  return (viewportMinDim / NINESLICE_VIEWPORT_REFERENCE_MIN_DIM) * NINESLICE_BORDER_REFERENCE_WIDTH;
};
