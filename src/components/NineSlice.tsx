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
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height)
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
    const dpr = window.devicePixelRatio || 1;
    
    // Canvas dimensions in physical pixels
    const physWidth = Math.max(1, Math.round(hostSize.width * dpr));
    const physHeight = Math.max(1, Math.round(hostSize.height * dpr));

    canvas.width = physWidth;
    canvas.height = physHeight;

    const context = canvas.getContext('2d');
    if (!context) return;
    
    // Reset transform to draw in physical pixels
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.clearRect(0, 0, physWidth, physHeight);

    // Snap destination slices to physical pixels
    let destLeft = Math.round(destinationSlices.left * dpr);
    let destRight = Math.round(destinationSlices.right * dpr);
    let destTop = Math.round(destinationSlices.top * dpr);
    let destBottom = Math.round(destinationSlices.bottom * dpr);

    // Ensure snapped slices fit within physical canvas dimensions
    [destLeft, destRight] = reducePairToMax(destLeft, destRight, Math.max(1, physWidth - 1));
    [destTop, destBottom] = reducePairToMax(destTop, destBottom, Math.max(1, physHeight - 1));

    const srcCenterWidth = Math.max(1, sourceSize.width - sourceSlices.left - sourceSlices.right);
    const srcCenterHeight = Math.max(1, sourceSize.height - sourceSlices.top - sourceSlices.bottom);
    
    const dstCenterWidth = Math.max(1, physWidth - destLeft - destRight);
    const dstCenterHeight = Math.max(1, physHeight - destTop - destBottom);

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

      // Pixel-perfect tiling loop
      for (let i = 0; i < count; i++) {
        // Calculate integer start/end positions based on the float tileWidth
        const xStart = Math.round(dx + i * tileWidth);
        const xEnd = i === count - 1 ? (dx + dw) : Math.round(dx + (i + 1) * tileWidth);
        const currentWidth = xEnd - xStart;
        
        if (currentWidth <= 0) continue;

        // Calculate corresponding source width
        const ratio = currentWidth / tileWidth;
        // For the last tile or slight variations, we adjust the source width slightly
        // effectively stretching/shrinking the source texture by a subpixel amount
        // to fit the integer pixel grid.
        const sourceWidth = currentWidth >= Math.floor(tileWidth) 
            ? sw 
            : Math.max(1, Math.round(sw * ratio));

        draw(sx, sy, sourceWidth, sh, xStart, dy, currentWidth, dh);
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

      // Pixel-perfect tiling loop
      for (let i = 0; i < count; i++) {
        const yStart = Math.round(dy + i * tileHeight);
        const yEnd = i === count - 1 ? (dy + dh) : Math.round(dy + (i + 1) * tileHeight);
        const currentHeight = yEnd - yStart;

        if (currentHeight <= 0) continue;

        const ratio = currentHeight / tileHeight;
        const sourceHeight = currentHeight >= Math.floor(tileHeight)
            ? sh
            : Math.max(1, Math.round(sh * ratio));

        draw(sx, sy, sw, sourceHeight, dx, yStart, dw, currentHeight);
      }
    };

    // 4 corners
    draw(
      0, 0, sourceSlices.left, sourceSlices.top,
      0, 0, destLeft, destTop
    );
    draw(
      sourceSize.width - sourceSlices.right, 0, sourceSlices.right, sourceSlices.top,
      physWidth - destRight, 0, destRight, destTop
    );
    draw(
      0, sourceSize.height - sourceSlices.bottom, sourceSlices.left, sourceSlices.bottom,
      0, physHeight - destBottom, destLeft, destBottom
    );
    draw(
      sourceSize.width - sourceSlices.right,
      sourceSize.height - sourceSlices.bottom,
      sourceSlices.right,
      sourceSlices.bottom,
      physWidth - destRight,
      physHeight - destBottom,
      destRight,
      destBottom
    );

    // 4 edges
    drawHorizontalEdge(
      sourceSlices.left,
      0,
      srcCenterWidth,
      sourceSlices.top,
      destLeft,
      0,
      dstCenterWidth,
      destTop,
      repeat
    );
    drawHorizontalEdge(
      sourceSlices.left,
      sourceSize.height - sourceSlices.bottom,
      srcCenterWidth,
      sourceSlices.bottom,
      destLeft,
      physHeight - destBottom,
      dstCenterWidth,
      destBottom,
      repeat
    );
    drawVerticalEdge(
      0,
      sourceSlices.top,
      sourceSlices.left,
      srcCenterHeight,
      0,
      destTop,
      destLeft,
      dstCenterHeight,
      repeat
    );
    drawVerticalEdge(
      sourceSize.width - sourceSlices.right,
      sourceSlices.top,
      sourceSlices.right,
      srcCenterHeight,
      physWidth - destRight,
      destTop,
      destRight,
      dstCenterHeight,
      repeat
    );

    // Center
    draw(
      sourceSlices.left,
      sourceSlices.top,
      srcCenterWidth,
      srcCenterHeight,
      destLeft,
      destTop,
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
