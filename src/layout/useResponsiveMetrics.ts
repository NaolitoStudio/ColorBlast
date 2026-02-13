import { RefObject, useEffect, useRef, useState } from 'react';
import { GRID_SIZE } from '../../constants';
import { solveProportionalStack } from './panelStack';
import { resolveNineSliceDensityFactor } from '../theme/nineSliceMath';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const STACK_MIN_SCALE = 0.12;
const PASS_COUNT = 4;
const STABILITY_EPSILON = 0.5;
const DEFAULT_SPACER_HEADER_BOARD_ASPECT = 28;
const DEFAULT_SPACER_BOARD_RACK_ASPECT = 24;

export type ResponsiveMetrics = {
  densityFactor: number;
  layoutGap: number;
  layoutPadding: number;
  contentScale: number;
  panelBorderBasePx: number;
  boardPanelWidthPx: number;
  boardCellSize: number;
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
  headerRef?: RefObject<HTMLDivElement | null>;
  powerupCount?: number;
  minTouchTarget?: number;
  headerAspect?: number;
  boardAspect?: number;
  rackAspect?: number;
  spacerHeaderBoardAspect?: number;
  spacerBoardRackAspect?: number;
  boardPanelScale?: number;
  boardPanelScaleMode?: 'density' | 'none';
  boardPanelDprReference?: number;
  boardPanelDprMinFactor?: number;
  boardPanelDprMaxFactor?: number;
  boardPaddingMultiplier?: number;
  rackSlotAspect?: number;
};

type MetricInput = {
  layoutWidth: number;
  layoutHeight: number;
  powerupCount: number;
  minTouchTarget: number;
  headerAspect: number;
  boardAspect: number;
  rackAspect: number;
  spacerHeaderBoardAspect: number;
  spacerBoardRackAspect: number;
  boardPanelScale: number;
  boardPanelScaleMode: 'density' | 'none';
  boardPanelDprReference: number;
  boardPanelDprMinFactor: number;
  boardPanelDprMaxFactor: number;
  boardPaddingMultiplier: number;
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

const createFallbackFrame = (
  id: string,
  containerWidth: number,
  aspectRatio: number,
  scale: number
) => {
  const width = containerWidth * scale;
  const height = width / Math.max(0.0001, aspectRatio);
  return {
    id,
    width,
    height,
    widthRatio: scale,
    heightRatio: height / Math.max(1, containerWidth),
  };
};

const createMetrics = ({
  layoutWidth,
  layoutHeight,
  powerupCount,
  minTouchTarget,
  headerAspect,
  boardAspect,
  rackAspect,
  spacerHeaderBoardAspect,
  spacerBoardRackAspect,
  boardPanelScale,
  boardPanelScaleMode,
  boardPanelDprReference,
  boardPanelDprMinFactor,
  boardPanelDprMaxFactor,
  boardPaddingMultiplier,
  rackSlotAspect,
  isViewportStable,
}: MetricInput): ResponsiveMetrics => {
  const safeWidth = Math.max(1, layoutWidth);
  const safeHeight = Math.max(1, layoutHeight);
  const minDim = Math.min(safeWidth, safeHeight);
  const densityFactor = readDensityFactor();
  const densityCompensation = clamp(1 / densityFactor, 0.9, 1.1);
  const safePowerupCount = Math.max(1, powerupCount);
  const bottomSafeInset = readViewportBottomInset();
  const boardPanelDensityFactor = resolveNineSliceDensityFactor({
    scaleMode: boardPanelScaleMode,
    dprReference: boardPanelDprReference,
    dprMinFactor: boardPanelDprMinFactor,
    dprMaxFactor: boardPanelDprMaxFactor,
  });
  const boardPanelEffectiveScale = boardPanelScale * boardPanelDensityFactor;
  const safeBoardPaddingMultiplier = clamp(boardPaddingMultiplier, 0.5, 4);

  let layoutPadding = clamp(minDim * 0.018 * densityCompensation, 8, 26);
  let layoutGap = clamp(minDim * 0.019 * densityCompensation, 8, 24);
  let reservedBottomSpace = Math.max(minTouchTarget * 1.9, safeHeight * 0.14);

  let stackScale = 1;
  let contentWidth = Math.max(1, safeWidth - (layoutPadding * 2));
  let boardFrame = createFallbackFrame('board', contentWidth, boardAspect, 1);
  let rackFrame = createFallbackFrame('rack', contentWidth, rackAspect, 1);
  let panelBorderBasePx = 16;
  let boardInnerPadding = 0;
  let boardCellGap = 0;
  let boardCellSize = 1;
  let rackPaddingX = 0;
  let rackSlotGap = 0;
  let rackSlotAspectRatio = Math.max(0.1, rackSlotAspect);
  let rackSlotWidth = 1;
  let rackSlotHeight = 1;
  let rackPieceSize = 1;
  let powerupRowWidth = 1;
  let powerupGap = 0;
  let powerupButtonSize = minTouchTarget;
  let powerupIconSize = minTouchTarget * 0.45;
  let powerupBadgeSize = minTouchTarget * 0.33;
  let powerupBadgeFontSize = powerupBadgeSize * 0.46;
  let powerupBottomOffset = Math.max(layoutPadding * 0.4, bottomSafeInset);
  let powerupTopPadding = layoutGap * 0.2;
  let powerupBottomPadding = layoutGap * 0.18;

  for (let pass = 0; pass < PASS_COUNT; pass++) {
    contentWidth = Math.max(1, safeWidth - (layoutPadding * 2));
    const availableForStack = Math.max(0, safeHeight - (layoutPadding * 2) - reservedBottomSpace);
    const stack = solveProportionalStack({
      containerWidth: contentWidth,
      availableHeight: availableForStack,
      gap: 0,
      minScale: STACK_MIN_SCALE,
      maxScale: 1,
      panels: [
        { id: 'header', aspectRatio: Math.max(0.0001, headerAspect), widthRatio: 1 },
        { id: 'space_header_board', aspectRatio: Math.max(0.0001, spacerHeaderBoardAspect), widthRatio: 1 },
        { id: 'board', aspectRatio: Math.max(0.0001, boardAspect), widthRatio: 1 },
        { id: 'space_board_rack', aspectRatio: Math.max(0.0001, spacerBoardRackAspect), widthRatio: 1 },
        { id: 'rack', aspectRatio: Math.max(0.0001, rackAspect), widthRatio: 1 },
      ],
    });
    stackScale = stack.scale;

    boardFrame = stack.frames.board
      ?? createFallbackFrame('board', contentWidth, boardAspect, stack.scale);
    rackFrame = stack.frames.rack
      ?? createFallbackFrame('rack', contentWidth, rackAspect, stack.scale);
    const headerBoardSpacer = stack.frames.space_header_board
      ?? createFallbackFrame('space_header_board', contentWidth, spacerHeaderBoardAspect, stack.scale);
    const boardRackSpacer = stack.frames.space_board_rack
      ?? createFallbackFrame('space_board_rack', contentWidth, spacerBoardRackAspect, stack.scale);

    const boardNominalCellSize = Math.max(1, boardFrame.width / GRID_SIZE);
    const boardScaleUnit = boardNominalCellSize;
    const safePanelDensityFactor = Math.max(0.0001, boardPanelDensityFactor);
    panelBorderBasePx = clamp((boardScaleUnit * 0.46) / safePanelDensityFactor, 6, 40);
    // Grid-driven padding only: same visual proportion across devices.
    const boardMinInset = boardScaleUnit * 0.18;
    const boardMaxInset = boardScaleUnit * 2.4;
    const boardResolvedInset = (boardScaleUnit * 0.36) * safeBoardPaddingMultiplier;
    boardInnerPadding = clamp(
      boardResolvedInset,
      boardMinInset,
      boardMaxInset
    );

    const boardGridWidth = Math.max(1, boardFrame.width - (boardInnerPadding * 2));
    boardCellGap = clamp(
      boardGridWidth * 0.004,
      1,
      boardGridWidth * 0.01
    );
    boardCellSize = Math.max(
      1,
      (boardGridWidth - (boardCellGap * (GRID_SIZE - 1))) / GRID_SIZE
    );

    const nextLayoutPadding = clamp(boardScaleUnit * 0.34, 8, 26);
    const gapFromCell = clamp(boardScaleUnit * 0.28, 8, boardScaleUnit * 0.58);
    const gapFromSpacerPanels = (headerBoardSpacer.height + boardRackSpacer.height) * 0.5;
    const nextLayoutGap = (gapFromCell + gapFromSpacerPanels) * 0.5;

    const minPowerupGap = Math.max(4, boardScaleUnit * 0.08);
    const maxButtonByWidth = Math.max(
      28,
      (contentWidth - (Math.max(0, safePowerupCount - 1) * minPowerupGap)) / safePowerupCount
    );
    const effectiveMinTouch = Math.min(minTouchTarget, maxButtonByWidth);
    const powerupTargetButton = clamp(boardScaleUnit * 1.32, effectiveMinTouch, boardScaleUnit * 1.7);
    powerupButtonSize = clamp(
      powerupTargetButton,
      Math.max(32, effectiveMinTouch),
      maxButtonByWidth
    );

    const preferredGap = clamp(powerupButtonSize * 0.22, minPowerupGap, boardScaleUnit * 0.45);
    const maxGapByWidth = safePowerupCount > 1
      ? Math.max(0, (contentWidth - (powerupButtonSize * safePowerupCount)) / (safePowerupCount - 1))
      : 0;
    powerupGap = safePowerupCount > 1 ? Math.min(preferredGap, maxGapByWidth) : 0;

    powerupRowWidth = (powerupButtonSize * safePowerupCount) + (powerupGap * Math.max(0, safePowerupCount - 1));
    powerupIconSize = clamp(powerupButtonSize * 0.45, boardScaleUnit * 0.56, powerupButtonSize * 0.58);
    powerupBadgeSize = clamp(powerupButtonSize * 0.33, boardScaleUnit * 0.44, powerupButtonSize * 0.43);
    powerupBadgeFontSize = clamp(powerupBadgeSize * 0.46, boardScaleUnit * 0.18, powerupBadgeSize * 0.58);
    powerupTopPadding = Math.max(nextLayoutGap * 0.2, boardScaleUnit * 0.16);
    powerupBottomPadding = Math.max(nextLayoutGap * 0.18, boardScaleUnit * 0.14);
    powerupBottomOffset = Math.max(nextLayoutPadding * 0.4, bottomSafeInset + (boardScaleUnit * 0.14));

    const nextReservedBottomSpace =
      powerupBottomOffset +
      powerupTopPadding +
      powerupBottomPadding +
      powerupButtonSize +
      (nextLayoutGap * 0.62);

    const rackScaledWidth = rackFrame.width;
    rackPaddingX = clamp(boardScaleUnit * 0.62, rackScaledWidth * 0.02, rackScaledWidth * 0.09);
    rackSlotGap = clamp(boardScaleUnit * 0.22, rackScaledWidth * 0.004, rackScaledWidth * 0.028);
    rackSlotAspectRatio = Math.max(0.1, rackSlotAspect);
    const slotWidthByRack = Math.max(1, (rackScaledWidth - (rackPaddingX * 2) - (rackSlotGap * 2)) / 3);
    const rackVerticalPadding = Math.max(nextLayoutGap * 0.28, boardScaleUnit * 0.2);
    const slotHeightByRack = Math.max(1, rackFrame.height - rackVerticalPadding);
    const slotWidthByHeight = slotHeightByRack * rackSlotAspectRatio;
    const maxRackSlotWidth = Math.max(1, Math.min(slotWidthByRack, slotWidthByHeight));
    const minRackSlotWidth = Math.max(1, Math.min(boardScaleUnit * 1.35, maxRackSlotWidth));
    rackSlotWidth = clamp(boardScaleUnit * 2.05, minRackSlotWidth, maxRackSlotWidth);
    rackSlotHeight = rackSlotWidth / rackSlotAspectRatio;
    rackPieceSize = Math.min(rackSlotWidth, rackSlotHeight) * 0.82;

    const hasSettled = Math.abs(nextReservedBottomSpace - reservedBottomSpace) < STABILITY_EPSILON
      && Math.abs(nextLayoutGap - layoutGap) < STABILITY_EPSILON
      && Math.abs(nextLayoutPadding - layoutPadding) < STABILITY_EPSILON;

    layoutPadding = nextLayoutPadding;
    layoutGap = nextLayoutGap;
    reservedBottomSpace = nextReservedBottomSpace;

    if (hasSettled && pass > 0) break;
  }

  const safeContentWidth = Math.max(1, safeWidth - (layoutPadding * 2));
  const boardWidthPercent = clamp((boardFrame.width / safeContentWidth) * 100, 0, 100);
  const rackWidthPercent = clamp((rackFrame.width / safeContentWidth) * 100, 0, 100);

  return {
    densityFactor,
    layoutGap,
    layoutPadding,
    contentScale: stackScale,
    panelBorderBasePx,
    boardPanelWidthPx: boardFrame.width,
    boardCellSize,
    boardWidthPercent,
    boardInnerPadding,
    boardCellGap,
    rackWidthPercent,
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
  const viewportWidth = Math.max(1, vv?.width ?? window.innerWidth);
  const viewportHeight = Math.max(1, vv?.height ?? window.innerHeight);
  return {
    width: viewportWidth,
    height: viewportHeight,
  };
};

export const useResponsiveMetrics = ({
  layoutRef,
  headerRef,
  powerupCount = 4,
  minTouchTarget = 44,
  headerAspect = 5 / 1.5,
  boardAspect = 1,
  rackAspect = 3 / 2,
  spacerHeaderBoardAspect = DEFAULT_SPACER_HEADER_BOARD_ASPECT,
  spacerBoardRackAspect = DEFAULT_SPACER_BOARD_RACK_ASPECT,
  boardPanelScale = 1,
  boardPanelScaleMode = 'density',
  boardPanelDprReference = 2,
  boardPanelDprMinFactor = 0.8,
  boardPanelDprMaxFactor = 1.25,
  boardPaddingMultiplier = 1,
  rackSlotAspect = 1,
}: UseResponsiveMetricsArgs): ResponsiveMetrics => {
  const [metrics, setMetrics] = useState<ResponsiveMetrics>(() => {
    const initialLayout = inferInitialLayoutSize();
    return createMetrics({
      layoutWidth: initialLayout.width,
      layoutHeight: initialLayout.height,
      powerupCount,
      minTouchTarget,
      headerAspect,
      boardAspect,
      rackAspect,
      spacerHeaderBoardAspect,
      spacerBoardRackAspect,
      boardPanelScale,
      boardPanelScaleMode,
      boardPanelDprReference,
      boardPanelDprMinFactor,
      boardPanelDprMaxFactor,
      boardPaddingMultiplier,
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

      setMetrics((prev) => createMetrics({
        layoutWidth,
        layoutHeight,
        powerupCount,
        minTouchTarget,
        headerAspect,
        boardAspect,
        rackAspect,
        spacerHeaderBoardAspect,
        spacerBoardRackAspect,
        boardPanelScale,
        boardPanelScaleMode,
        boardPanelDprReference,
        boardPanelDprMinFactor,
        boardPanelDprMaxFactor,
        boardPaddingMultiplier,
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
      requestAnimationFrame(() => compute());
    });

    if (layoutRef.current) observer.observe(layoutRef.current);
    if (headerRef?.current) observer.observe(headerRef.current);

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
    boardPaddingMultiplier,
    headerAspect,
    headerRef,
    layoutRef,
    minTouchTarget,
    powerupCount,
    spacerBoardRackAspect,
    spacerHeaderBoardAspect,
    rackSlotAspect,
    rackAspect
  ]);

  return metrics;
};
