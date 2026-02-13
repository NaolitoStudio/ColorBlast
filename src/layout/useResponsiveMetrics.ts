import { RefObject, useEffect, useRef, useState } from 'react';
import { solveProportionalStack } from './panelStack';
import { estimateNineSliceBaseBorderWidth, resolveNineSliceDensityFactor } from '../theme/nineSliceMath';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type ResponsiveMetrics = {
  densityFactor: number;
  layoutGap: number;
  layoutPadding: number;
  contentScale: number;
  boardWidthPercent: number;
  boardInnerPadding: number;
  boardCellGap: number;
  rackWidthPercent: number;
  boardMaxHeight: number;
  rackMaxHeight: number;
  rackPaddingX: number;
  rackSlotGap: number;
  rackSlotAspectRatio: number;
  rackSlotWidth: number;
  rackSlotHeight: number;
  rackPieceSize: number;
  powerupRowWidth: number;
  powerupGap: number;
  powerupButtonSize: number;
  powerupIconSize: number;
  powerupBadgeSize: number;
  powerupBadgeFontSize: number;
  powerupBottomOffset: number;
  powerupTopPadding: number;
  powerupBottomPadding: number;
  reservedBottomSpace: number;
  viewportHeight: number;
  isViewportStable: boolean;
};

type UseResponsiveMetricsArgs = {
  layoutRef: RefObject<HTMLDivElement | null>;
  headerRef: RefObject<HTMLDivElement | null>;
  powerupCount?: number;
  minTouchTarget?: number;
  boardAspect?: number;
  rackAspect?: number;
  boardPanelScale?: number;
  boardPanelScaleMode?: 'density' | 'none';
  boardPanelDprReference?: number;
  boardPanelDprMinFactor?: number;
  boardPanelDprMaxFactor?: number;
  rackSlotAspect?: number;
};

type MetricInput = {
  layoutWidth: number;
  layoutHeight: number;
  headerHeight: number;
  powerupCount: number;
  minTouchTarget: number;
  boardAspect: number;
  rackAspect: number;
  boardPanelScale: number;
  boardPanelScaleMode: 'density' | 'none';
  boardPanelDprReference: number;
  boardPanelDprMinFactor: number;
  boardPanelDprMaxFactor: number;
  rackSlotAspect: number;
  isViewportStable: boolean;
};

const readViewportBottomInset = (): number => {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  const vv = window.visualViewport;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
};

const readDensityFactor = (): number => {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  return clamp(dpr / 2, 0.8, 1.25);
};

const createMetrics = ({
  layoutWidth,
  layoutHeight,
  headerHeight,
  powerupCount,
  minTouchTarget,
  boardAspect,
  rackAspect,
  boardPanelScale,
  boardPanelScaleMode,
  boardPanelDprReference,
  boardPanelDprMinFactor,
  boardPanelDprMaxFactor,
  rackSlotAspect,
  isViewportStable,
}: MetricInput): ResponsiveMetrics => {
  const safeWidth = Math.max(1, layoutWidth);
  const safeHeight = Math.max(1, layoutHeight);
  const minDim = Math.min(safeWidth, safeHeight);
  const densityFactor = readDensityFactor();
  const densityCompensation = clamp(1 / densityFactor, 0.9, 1.1);

  const layoutGap = clamp(minDim * 0.022 * densityCompensation, minDim * 0.014, minDim * 0.04);
  const layoutPadding = clamp(minDim * 0.028 * densityCompensation, minDim * 0.018, minDim * 0.055);

  const powerupRowWidth = safeWidth * 0.94;
  const bottomSafeInset = readViewportBottomInset();
  const powerupBottomOffset = Math.max(layoutGap * 0.7, bottomSafeInset + (layoutGap * 0.45));
  const powerupTopPadding = layoutGap * 0.35;

  const baseButton = powerupRowWidth / (powerupCount + ((powerupCount - 1) * 0.22));
  let powerupButtonSize = Math.max(minTouchTarget, baseButton * 0.5);
  powerupButtonSize = Math.min(powerupButtonSize, safeWidth * 0.105);

  const preferredGap = clamp(powerupButtonSize * 0.22, layoutGap * 0.5, layoutGap * 1.15);
  const maxGapByWidth = powerupCount > 1
    ? Math.max(0, (powerupRowWidth - (powerupButtonSize * powerupCount)) / (powerupCount - 1))
    : 0;
  const powerupGap = powerupCount > 1 ? Math.min(preferredGap, maxGapByWidth) : 0;

  const powerupIconSize = clamp(powerupButtonSize * 0.43, minDim * 0.045, powerupButtonSize * 0.56);
  const powerupBottomPadding = powerupIconSize * 0.5;
  const powerupBadgeSize = clamp(powerupButtonSize * 0.34, powerupButtonSize * 0.28, powerupButtonSize * 0.42);
  const powerupBadgeFontSize = clamp(powerupBadgeSize * 0.46, powerupBadgeSize * 0.36, powerupBadgeSize * 0.58);

  const reservedBottomSpace =
    powerupBottomOffset +
    powerupTopPadding +
    powerupBottomPadding +
    powerupButtonSize +
    (layoutGap * 0.8);

  const availableForMainContent = Math.max(
    0,
    safeHeight - Math.max(0, headerHeight) - reservedBottomSpace - (layoutGap * 2.2)
  );

  const stack = solveProportionalStack({
    containerWidth: safeWidth,
    availableHeight: availableForMainContent,
    gap: layoutGap,
    minScale: 0.35,
    maxScale: 1,
    panels: [
      { id: 'board', aspectRatio: Math.max(0.0001, boardAspect), widthRatio: 1 },
      { id: 'rack', aspectRatio: Math.max(0.0001, rackAspect), widthRatio: 1 },
    ],
  });

  const boardFrame = stack.frames.board ?? {
    id: 'board',
    width: safeWidth * stack.scale,
    height: (safeWidth * stack.scale) / Math.max(0.0001, boardAspect),
    widthRatio: stack.scale,
    heightRatio: stack.scale / Math.max(0.0001, boardAspect),
  };
  const rackFrame = stack.frames.rack ?? {
    id: 'rack',
    width: safeWidth * stack.scale,
    height: (safeWidth * stack.scale) / Math.max(0.0001, rackAspect),
    widthRatio: stack.scale,
    heightRatio: stack.scale / Math.max(0.0001, rackAspect),
  };
  const boardPanelDensityFactor = resolveNineSliceDensityFactor({
    scaleMode: boardPanelScaleMode,
    dprReference: boardPanelDprReference,
    dprMinFactor: boardPanelDprMinFactor,
    dprMaxFactor: boardPanelDprMaxFactor,
  });
  const boardPanelEffectiveScale = boardPanelScale * boardPanelDensityFactor;
  const boardEstimatedBorder = estimateNineSliceBaseBorderWidth(safeWidth, safeHeight) * boardPanelEffectiveScale;
  const boardMinInset = boardFrame.width * 0.0144;
  const boardMaxInset = boardFrame.width * 0.047;
  const boardInnerPadding = clamp(
    Math.max(boardMinInset, boardEstimatedBorder * 0.434),
    boardMinInset,
    boardMaxInset
  );
  const boardCellGap = clamp(
    boardFrame.width * 0.0035,
    boardFrame.width * 0.002,
    boardFrame.width * 0.006
  );

  const rackScaledWidth = rackFrame.width;
  const rackPaddingX = clamp(rackScaledWidth * 0.045, rackScaledWidth * 0.02, rackScaledWidth * 0.09);
  const rackSlotGap = clamp(rackScaledWidth * 0.01, rackScaledWidth * 0.004, rackScaledWidth * 0.022);
  const rackSlotAspectRatio = Math.max(0.1, rackSlotAspect);
  const slotWidthByRack = Math.max(1, (rackScaledWidth - (rackPaddingX * 2) - (rackSlotGap * 2)) / 3);
  const rackVerticalPadding = layoutGap * 0.35;
  const slotHeightByRack = Math.max(1, rackFrame.height - rackVerticalPadding);
  const slotWidthByHeight = slotHeightByRack * rackSlotAspectRatio;
  const rackSlotWidth = Math.max(minDim * 0.08, Math.min(slotWidthByRack, slotWidthByHeight));
  const rackSlotHeight = rackSlotWidth / rackSlotAspectRatio;
  const rackPieceSize = Math.min(rackSlotWidth, rackSlotHeight) * 0.82;

  return {
    densityFactor,
    layoutGap,
    layoutPadding,
    contentScale: stack.scale,
    boardWidthPercent: (boardFrame.width / safeWidth) * 100,
    boardInnerPadding,
    boardCellGap,
    rackWidthPercent: (rackFrame.width / safeWidth) * 100,
    boardMaxHeight: boardFrame.height,
    rackMaxHeight: rackFrame.height,
    rackPaddingX,
    rackSlotGap,
    rackSlotAspectRatio,
    rackSlotWidth,
    rackSlotHeight,
    rackPieceSize,
    powerupRowWidth,
    powerupGap,
    powerupButtonSize,
    powerupIconSize,
    powerupBadgeSize,
    powerupBadgeFontSize,
    powerupBottomOffset,
    powerupTopPadding,
    powerupBottomPadding,
    reservedBottomSpace,
    viewportHeight: safeHeight,
    isViewportStable,
  };
};

const inferInitialLayoutSize = (): { width: number; height: number } => {
  if (typeof window === 'undefined') {
    return { width: 1, height: 1 };
  }

  const vv = window.visualViewport;
  const viewportWidth = vv?.width ?? window.innerWidth;
  const viewportHeight = vv?.height ?? window.innerHeight;
  const gameAspect = 9 / 16;
  return {
    width: Math.min(viewportWidth, viewportHeight * gameAspect),
    height: Math.min(viewportHeight, viewportWidth / gameAspect),
  };
};

export const useResponsiveMetrics = ({
  layoutRef,
  headerRef,
  powerupCount = 4,
  minTouchTarget = 44,
  boardAspect = 1,
  rackAspect = 3 / 2,
  boardPanelScale = 1,
  boardPanelScaleMode = 'density',
  boardPanelDprReference = 2,
  boardPanelDprMinFactor = 0.8,
  boardPanelDprMaxFactor = 1.25,
  rackSlotAspect = 1,
}: UseResponsiveMetricsArgs): ResponsiveMetrics => {
  const [metrics, setMetrics] = useState<ResponsiveMetrics>(() => {
    const initialLayout = inferInitialLayoutSize();
    return createMetrics({
      layoutWidth: initialLayout.width,
      layoutHeight: initialLayout.height,
      headerHeight: initialLayout.height * 0.18,
      powerupCount,
      minTouchTarget,
      boardAspect,
      rackAspect,
      boardPanelScale,
      boardPanelScaleMode,
      boardPanelDprReference,
      boardPanelDprMinFactor,
      boardPanelDprMaxFactor,
      rackSlotAspect,
      isViewportStable: true,
    });
  });

  const stabilityTimerRef = useRef<number | null>(null);
  const lastHeightRef = useRef<number | null>(null);
  const isCheckingStabilityRef = useRef(false);

  useEffect(() => {
    const compute = (overrideStable?: boolean) => {
      const layoutNode = layoutRef.current;
      // We prioritize the visual viewport, then window inner dimensions.
      // We only use layoutNode.clientDims as a last resort fallback,
      // avoiding the feedback loop where setting height on the node locks the measurement.
      const vv = window.visualViewport;

      const layoutWidth = vv ? Math.round(vv.width) : (window.innerWidth || layoutNode?.clientWidth || 0);
      const layoutHeight = vv ? Math.round(vv.height) : (window.innerHeight || layoutNode?.clientHeight || 0);

      if (layoutWidth <= 0 || layoutHeight <= 0) return;

      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      setMetrics((prev) => createMetrics({
        layoutWidth,
        layoutHeight,
        headerHeight,
        powerupCount,
        minTouchTarget,
        boardAspect,
        rackAspect,
        boardPanelScale,
        boardPanelScaleMode,
        boardPanelDprReference,
        boardPanelDprMinFactor,
        boardPanelDprMaxFactor,
        rackSlotAspect,
        isViewportStable: overrideStable !== undefined ? overrideStable : prev.isViewportStable,
      }));
    };

    const checkStability = () => {
      const vv = window.visualViewport;
      if (!vv) {
        isCheckingStabilityRef.current = false;
        return;
      }

      const currentHeight = vv.height;
      const lastHeight = lastHeightRef.current;

      if (lastHeight !== null && Math.abs(currentHeight - lastHeight) > 1) {
        // Viewport cambiando - marcar como inestable y recalcular
        compute(false);

        // Limpiar timer existente
        if (stabilityTimerRef.current !== null) {
          clearTimeout(stabilityTimerRef.current);
        }

        // Timer para marcar como estable después de 300ms sin cambios
        stabilityTimerRef.current = window.setTimeout(() => {
          compute(true); // Cálculo final cuando está estable
          isCheckingStabilityRef.current = false;
        }, 300);
      }

      lastHeightRef.current = currentHeight;

      // Continuar verificando mientras isCheckingStabilityRef sea true
      if (isCheckingStabilityRef.current) {
        requestAnimationFrame(checkStability);
      }
    };

    compute();

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(compute);
    });

    if (layoutRef.current) observer.observe(layoutRef.current);
    if (headerRef.current) observer.observe(headerRef.current);

    const onResize = () => {
      compute(false);
      isCheckingStabilityRef.current = true;
      requestAnimationFrame(checkStability);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
      if (stabilityTimerRef.current !== null) {
        clearTimeout(stabilityTimerRef.current);
      }
    };
  }, [
    boardAspect,
    boardPanelDprMaxFactor,
    boardPanelDprMinFactor,
    boardPanelDprReference,
    boardPanelScale,
    boardPanelScaleMode,
    headerRef,
    layoutRef,
    minTouchTarget,
    powerupCount,
    rackSlotAspect,
    rackAspect
  ]);

  return metrics;
};
