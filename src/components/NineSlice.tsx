import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NineSliceConfig, DEFAULT_NINESLICE_CONFIG } from '../theme/types';
import { estimateNineSliceBaseBorderWidth, resolveNineSliceDensityFactor } from '../theme/nineSliceMath';

type Dimensions = { width: number; height: number };
type Slices = { left: number; right: number; top: number; bottom: number };
type RepeatMode = Required<NineSliceConfig>['repeat'];

const IMAGE_CACHE = new Map<string, HTMLImageElement>();
const IMAGE_DIMENSION_CACHE = new Map<string, Dimensions>();
const IMAGE_PROMISE_CACHE = new Map<string, Promise<HTMLImageElement>>();

interface NineSliceProps extends NineSliceConfig {
  /** URL del asset */
  src: string;
  /** Clases CSS adicionales */
  className?: string;
  /** Estilos inline adicionales */
  style?: React.CSSProperties;
  /** Contenido hijo */
  children?: React.ReactNode;
  /** Evento click */
  onClick?: (e: React.MouseEvent) => void;
  /** Aspect ratio fijo (ancho/alto). Ej: 1 = cuadrado, 3 = 3:1. undefined = libre */
  aspectRatio?: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const reducePairToMax = (a: number, b: number, maxTotal: number): [number, number] => {
  if (a + b <= maxTotal) return [a, b];

  const overflow = a + b - maxTotal;
  const total = a + b;
  const aShare = total > 0 ? a / total : 0.5;
  const aReduction = Math.min(a, Math.round(overflow * aShare));
  let nextA = a - aReduction;
  let nextB = Math.max(0, b - (overflow - aReduction));

  if (nextA + nextB > maxTotal) {
    const pending = nextA + nextB - maxTotal;
    if (nextA >= nextB) nextA = Math.max(0, nextA - pending);
    else nextB = Math.max(0, nextB - pending);
  }

  return [nextA, nextB];
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  const cached = IMAGE_CACHE.get(src);
  if (cached) return Promise.resolve(cached);

  const inFlight = IMAGE_PROMISE_CACHE.get(src);
  if (inFlight) return inFlight;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      IMAGE_CACHE.set(src, image);
      IMAGE_DIMENSION_CACHE.set(src, {
        width: image.naturalWidth || 0,
        height: image.naturalHeight || 0
      });
      IMAGE_PROMISE_CACHE.delete(src);
      resolve(image);
    };
    image.onerror = () => {
      IMAGE_PROMISE_CACHE.delete(src);
      reject(new Error(`Failed to load image: ${src}`));
    };
    image.src = src;
  });

  IMAGE_PROMISE_CACHE.set(src, promise);
  return promise;
};

/**
 * Nine-slice robusto:
 * - Mantiene input en % (division/range/offset)
 * - Redondea slices de source a px enteros
 * - Dibuja en canvas para evitar seams de border-image
 */
export const NineSlice = forwardRef<HTMLDivElement, NineSliceProps>(({
  src,
  divisionX = DEFAULT_NINESLICE_CONFIG.divisionX,
  divisionY = DEFAULT_NINESLICE_CONFIG.divisionY,
  rangeX = DEFAULT_NINESLICE_CONFIG.rangeX,
  rangeY = DEFAULT_NINESLICE_CONFIG.rangeY,
  offsetX = DEFAULT_NINESLICE_CONFIG.offsetX,
  offsetY = DEFAULT_NINESLICE_CONFIG.offsetY,
  scale = DEFAULT_NINESLICE_CONFIG.scale,
  scaleMode = DEFAULT_NINESLICE_CONFIG.scaleMode,
  dprReference = DEFAULT_NINESLICE_CONFIG.dprReference,
  dprMinFactor = DEFAULT_NINESLICE_CONFIG.dprMinFactor,
  dprMaxFactor = DEFAULT_NINESLICE_CONFIG.dprMaxFactor,
  repeat = DEFAULT_NINESLICE_CONFIG.repeat,
  aspectRatio,
  className = '',
  style,
  children,
  onClick,
}, ref) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hostSize, setHostSize] = useState<Dimensions>({ width: 0, height: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(() => IMAGE_CACHE.get(src) ?? null);
  const [sourceSize, setSourceSize] = useState<Dimensions | null>(() => IMAGE_DIMENSION_CACHE.get(src) ?? null);
  const densityFactor = useMemo(() => {
    return resolveNineSliceDensityFactor({
      scaleMode,
      dprReference,
      dprMinFactor,
      dprMaxFactor,
    });
  }, [dprMaxFactor, dprMinFactor, dprReference, scaleMode]);
  const effectiveScale = scale * densityFactor;

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;

    if (typeof ref === 'function') {
      ref(node);
      return;
    }
    if (ref) {
      ref.current = node;
    }
  }, [ref]);

  useEffect(() => {
    let cancelled = false;

    if (!src) {
      setImage(null);
      setSourceSize(null);
      return;
    }

    const cachedImage = IMAGE_CACHE.get(src) ?? null;
    const cachedDims = IMAGE_DIMENSION_CACHE.get(src) ?? null;
    if (cachedImage && cachedDims) {
      setImage(cachedImage);
      setSourceSize(cachedDims);
      return;
    }

    loadImage(src)
      .then((loaded) => {
        if (cancelled) return;
        setImage(loaded);
        setSourceSize({
          width: loaded.naturalWidth || 0,
          height: loaded.naturalHeight || 0
        });
      })
      .catch(() => {
        if (cancelled) return;
        setImage(null);
        setSourceSize(null);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setHostSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height))
      });
    };

    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  const ratios = useMemo(() => {
    const effectiveDivX = clamp(divisionX + offsetX, 0, 1);
    const effectiveDivY = clamp(divisionY + offsetY, 0, 1);
    const normalizedRangeX = clamp(rangeX, 0, 1);
    const normalizedRangeY = clamp(rangeY, 0, 1);

    return {
      left: Math.max(0, effectiveDivX - normalizedRangeX / 2),
      right: Math.max(0, 1 - effectiveDivX - normalizedRangeX / 2),
      top: Math.max(0, effectiveDivY - normalizedRangeY / 2),
      bottom: Math.max(0, 1 - effectiveDivY - normalizedRangeY / 2)
    };
  }, [divisionX, divisionY, offsetX, offsetY, rangeX, rangeY]);

  const fallbackSlice = `${ratios.top * 100}% ${ratios.right * 100}% ${ratios.bottom * 100}% ${ratios.left * 100}% fill`;

  const sourceSlices = useMemo<Slices | null>(() => {
    if (!sourceSize || sourceSize.width <= 0 || sourceSize.height <= 0) return null;

    let left = Math.round(ratios.left * sourceSize.width);
    let right = Math.round(ratios.right * sourceSize.width);
    let top = Math.round(ratios.top * sourceSize.height);
    let bottom = Math.round(ratios.bottom * sourceSize.height);

    [left, right] = reducePairToMax(left, right, Math.max(1, sourceSize.width - 1));
    [top, bottom] = reducePairToMax(top, bottom, Math.max(1, sourceSize.height - 1));

    return { left, right, top, bottom };
  }, [ratios.bottom, ratios.left, ratios.right, ratios.top, sourceSize]);

  const destinationSlices = useMemo<Slices | null>(() => {
    if (hostSize.width <= 0 || hostSize.height <= 0) return null;

    const baseBorderWidth = estimateNineSliceBaseBorderWidth();
    let left = Math.max(1, Math.round(baseBorderWidth * effectiveScale));
    let right = left;
    let top = left;
    let bottom = left;

    [left, right] = reducePairToMax(left, right, Math.max(1, hostSize.width - 1));
    [top, bottom] = reducePairToMax(top, bottom, Math.max(1, hostSize.height - 1));

    return { left, right, top, bottom };
  }, [effectiveScale, hostSize.height, hostSize.width]);

  const shouldUseCanvas = Boolean(
    image &&
    sourceSize &&
    sourceSlices &&
    destinationSlices &&
    hostSize.width > 0 &&
    hostSize.height > 0
  );

  const fallbackBorderWidthPx = useMemo(() => {
    const baseBorderWidth = estimateNineSliceBaseBorderWidth();
    return Math.max(1, Math.round(baseBorderWidth * effectiveScale));
  }, [effectiveScale, hostSize.height, hostSize.width]);

  useEffect(() => {
    if (!shouldUseCanvas || !image || !sourceSize || !sourceSlices || !destinationSlices || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const width = hostSize.width;
    const height = hostSize.height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.clearRect(0, 0, width, height);

    const srcCenterWidth = Math.max(1, sourceSize.width - sourceSlices.left - sourceSlices.right);
    const srcCenterHeight = Math.max(1, sourceSize.height - sourceSlices.top - sourceSlices.bottom);
    const dstCenterWidth = Math.max(1, width - destinationSlices.left - destinationSlices.right);
    const dstCenterHeight = Math.max(1, height - destinationSlices.top - destinationSlices.bottom);

    const draw = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
      context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    };

    const drawHorizontalEdge = (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
      mode: RepeatMode
    ) => {
      if (mode === 'stretch') {
        draw(sx, sy, sw, sh, dx, dy, dw, dh);
        return;
      }

      const naturalTileWidth = Math.max(1, Math.round((sw / Math.max(1, sh)) * dh));
      const count = mode === 'round'
        ? Math.max(1, Math.round(dw / naturalTileWidth))
        : Math.max(1, Math.ceil(dw / naturalTileWidth));
      const tileWidth = mode === 'round' ? dw / count : naturalTileWidth;

      let x = dx;
      for (let i = 0; i < count; i++) {
        const remaining = (dx + dw) - x;
        if (remaining <= 0) break;
        const currentWidth = i === count - 1 ? remaining : Math.min(tileWidth, remaining);
        const sourceWidth = currentWidth >= tileWidth ? sw : Math.max(1, Math.round(sw * (currentWidth / tileWidth)));
        draw(sx, sy, sourceWidth, sh, x, dy, currentWidth, dh);
        x += tileWidth;
      }
    };

    const drawVerticalEdge = (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
      mode: RepeatMode
    ) => {
      if (mode === 'stretch') {
        draw(sx, sy, sw, sh, dx, dy, dw, dh);
        return;
      }

      const naturalTileHeight = Math.max(1, Math.round((sh / Math.max(1, sw)) * dw));
      const count = mode === 'round'
        ? Math.max(1, Math.round(dh / naturalTileHeight))
        : Math.max(1, Math.ceil(dh / naturalTileHeight));
      const tileHeight = mode === 'round' ? dh / count : naturalTileHeight;

      let y = dy;
      for (let i = 0; i < count; i++) {
        const remaining = (dy + dh) - y;
        if (remaining <= 0) break;
        const currentHeight = i === count - 1 ? remaining : Math.min(tileHeight, remaining);
        const sourceHeight = currentHeight >= tileHeight ? sh : Math.max(1, Math.round(sh * (currentHeight / tileHeight)));
        draw(sx, sy, sw, sourceHeight, dx, y, dw, currentHeight);
        y += tileHeight;
      }
    };

    // 4 corners
    draw(
      0, 0, sourceSlices.left, sourceSlices.top,
      0, 0, destinationSlices.left, destinationSlices.top
    );
    draw(
      sourceSize.width - sourceSlices.right, 0, sourceSlices.right, sourceSlices.top,
      width - destinationSlices.right, 0, destinationSlices.right, destinationSlices.top
    );
    draw(
      0, sourceSize.height - sourceSlices.bottom, sourceSlices.left, sourceSlices.bottom,
      0, height - destinationSlices.bottom, destinationSlices.left, destinationSlices.bottom
    );
    draw(
      sourceSize.width - sourceSlices.right,
      sourceSize.height - sourceSlices.bottom,
      sourceSlices.right,
      sourceSlices.bottom,
      width - destinationSlices.right,
      height - destinationSlices.bottom,
      destinationSlices.right,
      destinationSlices.bottom
    );

    // 4 edges
    drawHorizontalEdge(
      sourceSlices.left,
      0,
      srcCenterWidth,
      sourceSlices.top,
      destinationSlices.left,
      0,
      dstCenterWidth,
      destinationSlices.top,
      repeat
    );
    drawHorizontalEdge(
      sourceSlices.left,
      sourceSize.height - sourceSlices.bottom,
      srcCenterWidth,
      sourceSlices.bottom,
      destinationSlices.left,
      height - destinationSlices.bottom,
      dstCenterWidth,
      destinationSlices.bottom,
      repeat
    );
    drawVerticalEdge(
      0,
      sourceSlices.top,
      sourceSlices.left,
      srcCenterHeight,
      0,
      destinationSlices.top,
      destinationSlices.left,
      dstCenterHeight,
      repeat
    );
    drawVerticalEdge(
      sourceSize.width - sourceSlices.right,
      sourceSlices.top,
      sourceSlices.right,
      srcCenterHeight,
      width - destinationSlices.right,
      destinationSlices.top,
      destinationSlices.right,
      dstCenterHeight,
      repeat
    );

    // Center
    draw(
      sourceSlices.left,
      sourceSlices.top,
      srcCenterWidth,
      srcCenterHeight,
      destinationSlices.left,
      destinationSlices.top,
      dstCenterWidth,
      dstCenterHeight
    );
  }, [
    destinationSlices,
    hostSize.height,
    hostSize.width,
    image,
    repeat,
    shouldUseCanvas,
    sourceSize,
    sourceSlices
  ]);

  return (
    <div
      ref={setRefs}
      className={className}
      style={{
        position: style?.position ?? 'relative',
        borderStyle: shouldUseCanvas ? undefined : 'solid',
        borderColor: shouldUseCanvas ? undefined : 'transparent',
        borderImageSource: shouldUseCanvas ? undefined : `url(${src})`,
        borderImageSlice: shouldUseCanvas ? undefined : fallbackSlice,
        borderImageWidth: shouldUseCanvas ? undefined : `${fallbackBorderWidthPx}px`,
        borderImageRepeat: shouldUseCanvas ? undefined : repeat,
        ...style,
        aspectRatio: aspectRatio !== undefined ? aspectRatio : style?.aspectRatio,
      }}
      onClick={onClick}
    >
      {shouldUseCanvas && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        />
      )}
      <div className="relative z-[1] w-full h-full">
        {children}
      </div>
    </div>
  );
});

NineSlice.displayName = 'NineSlice';

export default NineSlice;
