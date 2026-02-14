
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { GameState, PieceData, Point, Color, LevelObjective, Booster, BoosterType, TileData } from '../../types';
import { createRandomGrid, generatePiece, generateValidHand, canPlacePiece, findMatchGroups, findGroupCenter, getBombExplosionPoints, isGameOver, calculateScore, initializeObjectives, getAdjacentToMatches, addRandomBlocks, AddedBlock, getColorsForLevel, getPieceShapeSignature } from '../../utils/gameLogic';
import { GRID_SIZE, getLevelConfig } from '../../constants';
import { ICONS, UI_ASSETS, UI_ASSET_ASPECT_RATIOS } from '../../assets';
import { useAudio } from '../../utils/useAudio';
import { useTheme, NineSlice, ResponsiveNineSlicePanel } from '../theme';
import { useResponsiveMetrics } from '../layout/useResponsiveMetrics';
import { LayoutDebugPanel, LayoutDebugCopyStatus } from './LayoutDebugPanel';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import { createSeededRandom, hashStringToSeed, RandomFn, shuffleWithRandom } from '../utils/stableRandom';
import {
  ActiveEffect,
  DestructionRequest,
  DestructionRuntimeState
} from '../game/destruction/types';
import {
  applyCommitToSnapshot,
  computeCommitForEffect,
  createActiveEffect,
  createDestructionRequest,
  getBoosterPreviewColor,
  resolveEffectVisualTargets,
  toCellKeys,
  toRuntimeState
} from '../game/destruction/engine';

// Since Color enum values are already icon paths, we don't need a separate mapping
// Just check if the color value looks like an icon path (starts with '/icons/')
const isIconPath = (color: string) => color.startsWith('/icons/');

// Helper to get particle color from icon path
const getParticleColor = (iconPath: string): string => {
  if (iconPath.includes('blue')) return '#3b82f6'; // Blue
  if (iconPath.includes('green')) return '#22c55e'; // Green
  if (iconPath.includes('purple')) return '#a855f7'; // Purple
  if (iconPath.includes('yellow')) return '#eab308'; // Yellow
  if (iconPath.includes('orange')) return '#f97316'; // Orange
  return '#888888'; // Fallback
};

const toRgba = (color: string, alpha: number): string => {
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((char) => `${char}${char}`).join('');
    }
    if (hex.length === 6) {
      const numeric = Number.parseInt(hex, 16);
      if (!Number.isNaN(numeric)) {
        const r = (numeric >> 16) & 255;
        const g = (numeric >> 8) & 255;
        const b = numeric & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
  }
  return color;
};

const LAYOUT_DEBUG_ENABLED_KEY = 'colorblast_layout_debug_enabled';
const LAYOUT_DEBUG_OVERRIDES_KEY = 'colorblast_layout_debug_overrides_v1';
const LAYOUT_DEBUG_MIN_ASPECT = 8;
const LAYOUT_DEBUG_MAX_ASPECT = 80;
const NINESLICE_SCALE_MULTIPLIER_MIN = 0.6;
const NINESLICE_SCALE_MULTIPLIER_MAX = 3;
const NINESLICE_SCALE_MULTIPLIER_STEP = 0.01;
const BOARD_PADDING_MULTIPLIER_MIN = 0.5;
const BOARD_PADDING_MULTIPLIER_MAX = 4;
const BOARD_PADDING_MULTIPLIER_STEP = 0.01;
const POWERUP_SIZE_MULTIPLIER_MIN = 0.5;
const POWERUP_SIZE_MULTIPLIER_MAX = 2;
const POWERUP_SIZE_MULTIPLIER_STEP = 0.01;
const POWERUP_BUBBLE_SIZE_MULTIPLIER_MIN = 0.5;
const POWERUP_BUBBLE_SIZE_MULTIPLIER_MAX = 2;
const POWERUP_BUBBLE_SIZE_MULTIPLIER_STEP = 0.01;
const POWERUP_GAP_MULTIPLIER_MIN = 0.5;
const POWERUP_GAP_MULTIPLIER_MAX = 2;
const POWERUP_GAP_MULTIPLIER_STEP = 0.01;
const HEADER_ASPECT_RATIO_MIN = 3;
const HEADER_ASPECT_RATIO_MAX = 7;
const HEADER_ASPECT_RATIO_STEP = 0.05;
const SUBHEADER_ASPECT_RATIO_MIN = 4;
const SUBHEADER_ASPECT_RATIO_MAX = 20;
const SUBHEADER_ASPECT_RATIO_STEP = 0.1;
const SUBHEADER_PADDING_OFFSET_MIN = -20;
const SUBHEADER_PADDING_OFFSET_MAX = 20;
const SUBHEADER_PADDING_OFFSET_STEP = 1;
const SUBHEADER_CONTAINER_OPACITY_MIN = 0;
const SUBHEADER_CONTAINER_OPACITY_MAX = 1;
const SUBHEADER_CONTAINER_OPACITY_STEP = 0.01;
const FRAME_MS_60FPS = 1000 / 60;
const POST_DESTRUCTION_ALL_CLEAR_DELAY_MS = 650;
const BOOSTER_WAVE_STEP_MS = 200;
const CELEBRATION_BOOSTER_STAGGER_MS = 100;

const isWaveBoosterType = (type: BoosterType | undefined): type is 'line_bomb' | 'rocket_h' | 'rocket_v' => (
  type === 'line_bomb' || type === 'rocket_h' || type === 'rocket_v'
);

const buildBoosterWaveSteps = (booster: Booster): Point[][] => {
  if (!isWaveBoosterType(booster.type)) return [];

  const steps: Point[][] = [];

  for (let distance = 1; distance < GRID_SIZE; distance++) {
    const points: Point[] = [];

    if (booster.type === 'line_bomb' || booster.type === 'rocket_h') {
      const leftX = booster.x - distance;
      const rightX = booster.x + distance;
      if (leftX >= 0) points.push({ x: leftX, y: booster.y });
      if (rightX < GRID_SIZE) points.push({ x: rightX, y: booster.y });
    }

    if (booster.type === 'line_bomb' || booster.type === 'rocket_v') {
      const upY = booster.y - distance;
      const downY = booster.y + distance;
      if (upY >= 0) points.push({ x: booster.x, y: upY });
      if (downY < GRID_SIZE) points.push({ x: booster.x, y: downY });
    }

    if (points.length > 0) {
      steps.push(points);
    }
  }

  return steps;
};

type LayoutDebugOverrides = {
  spacerAspect: number;
  headerAspectRatio: number;
  subheaderAspectRatio: number;
  subheaderActive: boolean;
  subheaderPaddingOffset: number;
  subheaderContainerOpacity: number;
  subheaderShowContent: boolean;
  nineSliceScaleMultiplier: number;
  boardPaddingMultiplier: number;
  powerupSizeMultiplier: number;
  powerupBubbleSizeMultiplier: number;
  powerupGapMultiplier: number;
};

const DEFAULT_LAYOUT_DEBUG_OVERRIDES: LayoutDebugOverrides = {
  spacerAspect: 8,
  headerAspectRatio: 7,
  subheaderAspectRatio: 10,
  subheaderActive: true,
  subheaderPaddingOffset: -20,
  subheaderContainerOpacity: 0,
  subheaderShowContent: true,
  nineSliceScaleMultiplier: 1.1,
  boardPaddingMultiplier: 0.67,
  powerupSizeMultiplier: 0.74,
  powerupBubbleSizeMultiplier: 1.17,
  powerupGapMultiplier: 1.62,
};

const sanitizeLayoutAspect = (value: number): number => {
  if (!Number.isFinite(value)) return LAYOUT_DEBUG_MIN_ASPECT;
  return Math.max(LAYOUT_DEBUG_MIN_ASPECT, Math.min(LAYOUT_DEBUG_MAX_ASPECT, Math.round(value)));
};

// Internal spacer layout works with aspect-ratio semantics:
// higher aspect => less physical gap. We invert the UI control so a higher
// slider value means "more separation" (more intuitive for tuning).
const mapSpacerControlToAspect = (value: number): number => {
  const normalized = sanitizeLayoutAspect(value);
  return (LAYOUT_DEBUG_MIN_ASPECT + LAYOUT_DEBUG_MAX_ASPECT) - normalized;
};

const sanitizeNineSliceScaleMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.nineSliceScaleMultiplier;
  const clamped = Math.max(
    NINESLICE_SCALE_MULTIPLIER_MIN,
    Math.min(NINESLICE_SCALE_MULTIPLIER_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizeBoardPaddingMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.boardPaddingMultiplier;
  const clamped = Math.max(
    BOARD_PADDING_MULTIPLIER_MIN,
    Math.min(BOARD_PADDING_MULTIPLIER_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizePowerupSizeMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.powerupSizeMultiplier;
  const clamped = Math.max(
    POWERUP_SIZE_MULTIPLIER_MIN,
    Math.min(POWERUP_SIZE_MULTIPLIER_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizePowerupBubbleSizeMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.powerupBubbleSizeMultiplier;
  const clamped = Math.max(
    POWERUP_BUBBLE_SIZE_MULTIPLIER_MIN,
    Math.min(POWERUP_BUBBLE_SIZE_MULTIPLIER_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizePowerupGapMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.powerupGapMultiplier;
  const clamped = Math.max(
    POWERUP_GAP_MULTIPLIER_MIN,
    Math.min(POWERUP_GAP_MULTIPLIER_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizeHeaderAspectRatio = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.headerAspectRatio;
  const clamped = Math.max(
    HEADER_ASPECT_RATIO_MIN,
    Math.min(HEADER_ASPECT_RATIO_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizeSubheaderAspectRatio = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderAspectRatio;
  const clamped = Math.max(
    SUBHEADER_ASPECT_RATIO_MIN,
    Math.min(SUBHEADER_ASPECT_RATIO_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizeSubheaderPaddingOffset = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderPaddingOffset;
  const clamped = Math.max(
    SUBHEADER_PADDING_OFFSET_MIN,
    Math.min(SUBHEADER_PADDING_OFFSET_MAX, value)
  );
  return Math.round(clamped);
};

const sanitizeSubheaderContainerOpacity = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderContainerOpacity;
  const clamped = Math.max(
    SUBHEADER_CONTAINER_OPACITY_MIN,
    Math.min(SUBHEADER_CONTAINER_OPACITY_MAX, value)
  );
  return Math.round(clamped * 100) / 100;
};

const sanitizeLayoutDebugOverrides = (
  value: Partial<LayoutDebugOverrides> | null | undefined
): LayoutDebugOverrides | null => {
  if (!value) return null;
  const spacerAspect = value.spacerAspect;
  const headerAspectRatio = value.headerAspectRatio;
  const subheaderAspectRatio = value.subheaderAspectRatio;
  const subheaderActive = value.subheaderActive;
  const subheaderPaddingOffset = value.subheaderPaddingOffset;
  const subheaderContainerOpacity = value.subheaderContainerOpacity;
  const subheaderShowContent = value.subheaderShowContent;
  const nineSliceScaleMultiplier = value.nineSliceScaleMultiplier;
  const boardPaddingMultiplier = value.boardPaddingMultiplier;
  const powerupSizeMultiplier = value.powerupSizeMultiplier;
  const powerupBubbleSizeMultiplier = value.powerupBubbleSizeMultiplier;
  const powerupGapMultiplier = value.powerupGapMultiplier;
  if (typeof spacerAspect !== 'number' || typeof nineSliceScaleMultiplier !== 'number') return null;
  return {
    spacerAspect: sanitizeLayoutAspect(spacerAspect),
    headerAspectRatio: sanitizeHeaderAspectRatio(
      typeof headerAspectRatio === 'number'
        ? headerAspectRatio
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.headerAspectRatio
    ),
    subheaderAspectRatio: sanitizeSubheaderAspectRatio(
      typeof subheaderAspectRatio === 'number'
        ? subheaderAspectRatio
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderAspectRatio
    ),
    subheaderActive: typeof subheaderActive === 'boolean'
      ? subheaderActive
      : DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderActive,
    subheaderPaddingOffset: sanitizeSubheaderPaddingOffset(
      typeof subheaderPaddingOffset === 'number'
        ? subheaderPaddingOffset
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderPaddingOffset
    ),
    subheaderContainerOpacity: sanitizeSubheaderContainerOpacity(
      typeof subheaderContainerOpacity === 'number'
        ? subheaderContainerOpacity
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderContainerOpacity
    ),
    subheaderShowContent: typeof subheaderShowContent === 'boolean'
      ? subheaderShowContent
      : DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderShowContent,
    nineSliceScaleMultiplier: sanitizeNineSliceScaleMultiplier(nineSliceScaleMultiplier),
    boardPaddingMultiplier: sanitizeBoardPaddingMultiplier(
      typeof boardPaddingMultiplier === 'number'
        ? boardPaddingMultiplier
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.boardPaddingMultiplier
    ),
    powerupSizeMultiplier: sanitizePowerupSizeMultiplier(
      typeof powerupSizeMultiplier === 'number'
        ? powerupSizeMultiplier
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.powerupSizeMultiplier
    ),
    powerupBubbleSizeMultiplier: sanitizePowerupBubbleSizeMultiplier(
      typeof powerupBubbleSizeMultiplier === 'number'
        ? powerupBubbleSizeMultiplier
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.powerupBubbleSizeMultiplier
    ),
    powerupGapMultiplier: sanitizePowerupGapMultiplier(
      typeof powerupGapMultiplier === 'number'
        ? powerupGapMultiplier
        : DEFAULT_LAYOUT_DEBUG_OVERRIDES.powerupGapMultiplier
    ),
  };
};

const readLayoutDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('layoutDebug') === '1';
    const fromStorage = window.localStorage.getItem(LAYOUT_DEBUG_ENABLED_KEY) === '1';
    return fromQuery || fromStorage;
  } catch {
    return false;
  }
};

const readLayoutDebugOverrides = (): LayoutDebugOverrides | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAYOUT_DEBUG_OVERRIDES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LayoutDebugOverrides>;
    return sanitizeLayoutDebugOverrides(parsed);
  } catch {
    return null;
  }
};

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
};

const IMAGE_PRELOAD_CACHE = new Map<string, Promise<void>>();

const preloadImage = (src: string): Promise<void> => {
  if (!src) return Promise.resolve();
  const cached = IMAGE_PRELOAD_CACHE.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to preload image: ${src}`));
    image.src = src;
  });

  IMAGE_PRELOAD_CACHE.set(src, promise);
  return promise;
};

const preloadImages = async (sources: string[]): Promise<void> => {
  const uniqueSources = Array.from(new Set(sources.filter(Boolean)));
  if (uniqueSources.length === 0) return;
  await Promise.allSettled(uniqueSources.map(preloadImage));
};

const removeTilesAtPoints = (grid: GameState['grid'], points: Point[]): GameState['grid'] => {
  if (points.length === 0) return grid;
  const maskedGrid = grid.map(row => [...row]);
  for (const point of points) {
    if (point.x < 0 || point.x >= GRID_SIZE || point.y < 0 || point.y >= GRID_SIZE) continue;
    maskedGrid[point.y][point.x] = null;
  }
  return maskedGrid;
};

const seedLevelOneInitialSixMatch = (
  grid: GameState['grid'],
  level: number,
  boosters: Booster[]
): GameState['grid'] => {
  if (level !== 1) return grid;

  const seededGrid = grid.map((row) => [...row]);
  const boosterCells = new Set(boosters.map((booster) => `${booster.x},${booster.y}`));
  const rowY = 0;
  const startX = 0;
  const forcedColor = Color.BLUE;

  for (let offset = 0; offset < 6; offset++) {
    const x = startX + offset;
    if (x < 0 || x >= GRID_SIZE) continue;
    if (boosterCells.has(`${x},${rowY}`)) continue;

    seededGrid[rowY][x] = {
      color: forcedColor,
      id: `lvl1-seed-${Date.now()}-${offset}-${Math.random()}`
    };
  }

  return seededGrid;
};

const collectGridBlocksForIntro = (
  grid: GameState['grid'],
  boosters: Booster[] = []
): AddedBlock[] => {
  const boosterSet = new Set(boosters.map(booster => `${booster.x},${booster.y}`));
  const blocks: AddedBlock[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (boosterSet.has(`${x},${y}`)) continue;
      const cell = grid[y][x];
      if (!cell) continue;
      blocks.push({
        id: cell.id,
        x,
        y,
        color: cell.color
      });
    }
  }
  return blocks;
};

const collectUniqueMatchPoints = (points: Point[]): Point[] => {
  const unique = new Map<string, Point>();
  for (const point of points) {
    unique.set(`${point.x},${point.y}`, point);
  }
  return Array.from(unique.values());
};

const resolveMatchBoosterOutcome = (
  grid: GameState['grid'],
  matchPointsInput: Point[]
): { pointsToClear: Point[]; boostersToCreate: Booster[] } => {
  const matchPoints = collectUniqueMatchPoints(matchPointsInput);
  const pointsToClear = [...matchPoints];
  const boostersToCreate: Booster[] = [];
  const totalForBooster = matchPoints.length;

  if (totalForBooster < 4) {
    return { pointsToClear, boostersToCreate };
  }

  const clearedColorSet = new Set<Color>();
  matchPoints.forEach((point) => {
    const cell = grid[point.y]?.[point.x];
    if (cell) clearedColorSet.add(cell.color);
  });
  const uniqueColorsCleared = clearedColorSet.size;

  const avgX = matchPoints.reduce((acc, point) => acc + point.x, 0) / totalForBooster;
  const avgY = matchPoints.reduce((acc, point) => acc + point.y, 0) / totalForBooster;

  let centerPoint = matchPoints[0];
  let minDist = Infinity;
  matchPoints.forEach((point) => {
    const dist = Math.abs(point.x - avgX) + Math.abs(point.y - avgY);
    if (dist < minDist) {
      minDist = dist;
      centerPoint = point;
    }
  });

  const centerCell = grid[centerPoint.y]?.[centerPoint.x];
  if (!centerCell) {
    return { pointsToClear, boostersToCreate };
  }

  const removeCenterPoint = () => {
    const index = pointsToClear.findIndex(
      (point) => point.x === centerPoint.x && point.y === centerPoint.y
    );
    if (index >= 0) pointsToClear.splice(index, 1);
  };

  if (totalForBooster >= 6 && uniqueColorsCleared >= 2) {
    const clearedSet = new Set(matchPoints.map((point) => `${point.x},${point.y}`));
    const gridColorCounts = new Map<Color, number>();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = grid[y][x];
        if (!cell || clearedSet.has(`${x},${y}`)) continue;
        gridColorCounts.set(cell.color, (gridColorCounts.get(cell.color) ?? 0) + 1);
      }
    }

    let mostCommonGridColor: Color | null = null;
    let maxCount = -1;
    gridColorCounts.forEach((count, color) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonGridColor = color;
      }
    });

    boostersToCreate.push({
      id: `booster-${Date.now()}-${Math.random()}`,
      type: 'color_ball',
      x: centerPoint.x,
      y: centerPoint.y,
      color: mostCommonGridColor ?? centerCell.color
    });
    removeCenterPoint();
    return { pointsToClear, boostersToCreate };
  }

  if (totalForBooster >= 6) {
    boostersToCreate.push({
      id: `booster-${Date.now()}-${Math.random()}`,
      type: 'bomb',
      x: centerPoint.x,
      y: centerPoint.y,
      color: centerCell.color
    });
    removeCenterPoint();
    return { pointsToClear, boostersToCreate };
  }

  if (totalForBooster === 5) {
    boostersToCreate.push({
      id: `booster-${Date.now()}-${Math.random()}`,
      type: 'line_bomb',
      x: centerPoint.x,
      y: centerPoint.y,
      color: centerCell.color
    });
    removeCenterPoint();
    return { pointsToClear, boostersToCreate };
  }

  const isHorizontal = Math.random() < 0.5;
  boostersToCreate.push({
    id: `booster-${Date.now()}-${Math.random()}`,
    type: isHorizontal ? 'rocket_h' : 'rocket_v',
    x: centerPoint.x,
    y: centerPoint.y,
    color: centerCell.color
  });
  removeCenterPoint();
  return { pointsToClear, boostersToCreate };
};

const resolveSuperballTargetColor = (
  grid: GameState['grid'],
  preferredColor: Color
): Color | null => {
  let preferredCount = 0;
  const counts = new Map<Color, number>();

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x];
      if (!tile) continue;

      const color = tile.color;
      counts.set(color, (counts.get(color) ?? 0) + 1);
      if (color === preferredColor) preferredCount++;
    }
  }

  if (preferredCount > 0) return preferredColor;
  if (counts.size === 0) return null;

  let topColor: Color | null = null;
  let topCount = -1;
  counts.forEach((count, color) => {
    if (count > topCount) {
      topCount = count;
      topColor = color;
    }
  });

  return topColor;
};

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  shape: 'circle' | 'square' | 'triangle';
  life: number;
  maxLife: number;
  size: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  scale: number;
  color: string;
}

interface ExplosionSprite {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

type SuperballAnimationState = {
  booster: Booster;
  affectedCells: Set<string>;
  phase: 'buildup' | 'explode';
};

type BoardGridMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  cellSize: number;
  gapX: number;
  gapY: number;
};

const getBoardGridMetrics = (board: HTMLDivElement): BoardGridMetrics | null => {
  const gridEl = board.querySelector<HTMLDivElement>('.board-grid');
  if (!gridEl) return null;

  const rect = gridEl.getBoundingClientRect();
  const styles = window.getComputedStyle(gridEl);
  const gapX = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
  const gapY = Number.parseFloat(styles.rowGap || styles.gap || '0') || 0;
  const cellSize = (rect.width - (gapX * (GRID_SIZE - 1))) / GRID_SIZE;
  if (!Number.isFinite(cellSize) || cellSize <= 0) return null;

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    cellSize,
    gapX,
    gapY
  };
};

const getBoardCellMetrics = (board: HTMLDivElement, x: number, y: number) => {
  const cellEl = board.querySelector<HTMLDivElement>(`[data-cell="${x},${y}"]`);
  if (cellEl) {
    const r = cellEl.getBoundingClientRect();
    return {
      centerX: r.left + (r.width / 2),
      centerY: r.top + (r.height / 2),
      width: r.width,
      height: r.height
    };
  }

  const grid = getBoardGridMetrics(board);
  if (grid) {
    return {
      centerX: grid.left + (x * (grid.cellSize + grid.gapX)) + (grid.cellSize / 2),
      centerY: grid.top + (y * (grid.cellSize + grid.gapY)) + (grid.cellSize / 2),
      width: grid.cellSize,
      height: grid.cellSize
    };
  }

  const rect = board.getBoundingClientRect();
  const cellSize = rect.width / GRID_SIZE;
  return {
    centerX: rect.left + (x * cellSize) + (cellSize / 2),
    centerY: rect.top + (y * cellSize) + (cellSize / 2),
    width: cellSize,
    height: cellSize
  };
};

type LightningRaysProps = {
  booster: Booster;
  affectedCells: Set<string>;
  boardRef: React.RefObject<HTMLDivElement>;
  phase: 'buildup' | 'explode';
};
const LIGHTNING_TICK_MS = 70;

// Lightning rays component for superball animation.
// Memoized so unrelated parent re-renders do not increase perceived flicker speed.
const LightningRays = React.memo(({
  booster,
  affectedCells,
  boardRef,
  phase
}: LightningRaysProps) => {
  const [tick, setTick] = useState(0);

  // Keep a stable tick timeline, independent from parent re-renders.
  useEffect(() => {
    if (phase !== 'buildup') return;
    setTick(0);
  }, [phase, booster.id]);

  useAnimationFrame(
    ({ elapsedMs }) => {
      const nextTick = Math.floor(elapsedMs / LIGHTNING_TICK_MS);
      setTick(prev => (prev === nextTick ? prev : nextTick));
    },
    {
      active: phase === 'buildup',
      resetKey: booster.id,
      maxDeltaMs: 50
    }
  );

  const board = boardRef.current;
  if (phase !== 'buildup' || !board) return null;

  const boosterMetrics = getBoardCellMetrics(board, booster.x, booster.y);
  const boosterX = boosterMetrics.centerX;
  const boosterY = boosterMetrics.centerY;

  const toPath = (points: Point[]) => {
    if (points.length === 0) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  };

  const generateDetailedBolt = (x1: number, y1: number, x2: number, y2: number, rng: RandomFn) => {
    const secondaryBranchesEnabled = false;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) {
      return {
        mainPath: `M ${x1} ${y1}`,
        branchPaths: [] as string[],
        intensity: 1,
        thickness: 1
      };
    }

    const normalX = dx / dist;
    const normalY = dy / dist;
    const perpX = -normalY;
    const perpY = normalX;
    const segments = Math.max(6, Math.floor(dist / 15));
    const maxOffset = Math.min(11, 3 + dist * 0.055);
    const points: Point[] = [{ x: x1, y: y1 }];

    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const baseX = x1 + dx * t;
      const baseY = y1 + dy * t;
      const centerBias = 0.7 + Math.sin(Math.PI * t) * 0.25;
      const chaos = (rng() - 0.5) * 2 * maxOffset * centerBias;
      const wave = Math.sin((t * Math.PI * 2) + (tick * 0.25)) * maxOffset * 0.05;

      points.push({
        x: baseX + perpX * (chaos + wave),
        y: baseY + perpY * (chaos + wave)
      });
    }
    points.push({ x: x2, y: y2 });

    const branchCount = secondaryBranchesEnabled
      ? Math.min(2, Math.max(1, Math.floor(dist / 140) + 1))
      : 0;
    const branchPaths: string[] = [];
    for (let b = 0; b < branchCount; b++) {
      const maxAnchorIndex = points.length - 3;
      const anchorIndex = Math.min(
        maxAnchorIndex,
        Math.max(2, Math.floor(rng() * (maxAnchorIndex - 1)) + 2)
      );
      const anchor = points[anchorIndex];
      const prev = points[Math.max(0, anchorIndex - 1)];
      const next = points[Math.min(points.length - 1, anchorIndex + 1)];
      const localDx = next.x - prev.x;
      const localDy = next.y - prev.y;
      const localDist = Math.sqrt(localDx * localDx + localDy * localDy) || 1;
      const localDirX = localDx / localDist;
      const localDirY = localDy / localDist;

      // Branches should keep moving forward-ish, then diverge (not perpendicular spikes).
      const branchSign = rng() < 0.5 ? -1 : 1;
      const branchAngle = branchSign * (0.35 + rng() * 0.55); // ~20deg to ~51deg
      const branchDirX = localDirX * Math.cos(branchAngle) - localDirY * Math.sin(branchAngle);
      const branchDirY = localDirX * Math.sin(branchAngle) + localDirY * Math.cos(branchAngle);
      const branchPerpX = -branchDirY;
      const branchPerpY = branchDirX;

      const branchLength = dist * (0.08 + rng() * 0.10);
      const branchSegments = 2 + (rng() < 0.45 ? 1 : 0);
      const branchPoints: Point[] = [{ x: anchor.x, y: anchor.y }];

      for (let s = 1; s <= branchSegments; s++) {
        const t = s / branchSegments;
        const len = branchLength * t;
        const jitter = (rng() - 0.5) * maxOffset * (0.1 + t * 0.05);
        const x = anchor.x + branchDirX * len + branchPerpX * jitter;
        const y = anchor.y + branchDirY * len + branchPerpY * jitter;
        branchPoints.push({ x, y });
      }

      branchPaths.push(toPath(branchPoints));

      // Secondary branching: 1-2 forks with their own zig-zag.
      if (branchPoints.length > 2 && rng() < 0.9) {
        const forkCount = 1 + (rng() < 0.45 ? 1 : 0);
        for (let f = 0; f < forkCount; f++) {
          const forkAnchorIndex = 1 + Math.floor(rng() * (branchPoints.length - 2));
          const forkAnchor = branchPoints[forkAnchorIndex];
          const forkSign = rng() < 0.5 ? -1 : 1;
          const forkAngle = forkSign * (0.38 + rng() * 0.4); // ~22deg to ~45deg from branch
          const forkDirX = branchDirX * Math.cos(forkAngle) - branchDirY * Math.sin(forkAngle);
          const forkDirY = branchDirX * Math.sin(forkAngle) + branchDirY * Math.cos(forkAngle);
          const forkPerpX = -forkDirY;
          const forkPerpY = forkDirX;
          const forkLen = branchLength * (0.28 + rng() * 0.24);
          const forkSegments = 2 + (rng() < 0.4 ? 1 : 0);
          const forkPoints: Point[] = [{ x: forkAnchor.x, y: forkAnchor.y }];

          for (let s = 1; s <= forkSegments; s++) {
            const t = s / forkSegments;
            const len = forkLen * t;
            const jitter = (rng() - 0.5) * maxOffset * (0.08 + t * 0.05);
            forkPoints.push({
              x: forkAnchor.x + forkDirX * len + forkPerpX * jitter,
              y: forkAnchor.y + forkDirY * len + forkPerpY * jitter
            });
          }

          branchPaths.push(toPath(forkPoints));

          // Occasional tertiary twig from a secondary fork.
          if (forkPoints.length > 2 && rng() < 0.45) {
            const twigAnchorIndex = 1 + Math.floor(rng() * (forkPoints.length - 2));
            const twigAnchor = forkPoints[twigAnchorIndex];
            const twigSign = rng() < 0.5 ? -1 : 1;
            const twigAngle = twigSign * (0.45 + rng() * 0.35); // ~26deg to ~46deg
            const twigDirX = forkDirX * Math.cos(twigAngle) - forkDirY * Math.sin(twigAngle);
            const twigDirY = forkDirX * Math.sin(twigAngle) + forkDirY * Math.cos(twigAngle);
            const twigLen = forkLen * (0.38 + rng() * 0.22);
            const twigEndX = twigAnchor.x + twigDirX * twigLen + forkPerpX * ((rng() - 0.5) * maxOffset * 0.05);
            const twigEndY = twigAnchor.y + twigDirY * twigLen + forkPerpY * ((rng() - 0.5) * maxOffset * 0.05);
            branchPaths.push(`M ${twigAnchor.x} ${twigAnchor.y} L ${twigEndX} ${twigEndY}`);
          }
        }
      }
    }

    return {
      mainPath: toPath(points),
      branchPaths,
      intensity: 0.72 + rng() * 0.2,
      thickness: 1.5 + rng() * 0.45
    };
  };

  return (
    <svg
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 65, width: '100vw', height: '100vh' }}
    >
      {Array.from(affectedCells).map((cellKey, targetIndex) => {
        const [cx, cy] = cellKey.split(',').map(Number);
        if (cx === booster.x && cy === booster.y) return null;
        const cellSeed = hashStringToSeed(`${booster.id}:${cellKey}:${targetIndex}:${tick}`);
        const cellRandom = createSeededRandom(cellSeed);

        const targetMetrics = getBoardCellMetrics(board, cx, cy);
        const cellCenterX = targetMetrics.centerX;
        const cellCenterY = targetMetrics.centerY;
        const targetCellSize = targetMetrics.width;
        const sourceX = boosterX + ((cellRandom() - 0.5) * 3.2);
        const sourceY = boosterY + ((cellRandom() - 0.5) * 3.2);

        // Some targets get one strike, others get 2-4 simultaneous strikes.
        const roll = cellRandom();
        const boltCount = roll < 0.55 ? 1 : roll < 0.8 ? 2 : roll < 0.94 ? 3 : 4;

        // Distinct landing zones inside a tile so multi-strikes don't hit the same exact point.
        const impactSlots = [
          { x: -0.26, y: -0.2 },
          { x: 0.26, y: -0.18 },
          { x: -0.22, y: 0.24 },
          { x: 0.24, y: 0.22 },
          { x: 0, y: -0.28 },
          { x: 0, y: 0.28 },
          { x: -0.3, y: 0 },
          { x: 0.3, y: 0 },
          { x: 0, y: 0 }
        ];

        const selectedSlots = boltCount === 1
          ? [{ x: 0, y: 0 }]
          : shuffleWithRandom(impactSlots, cellRandom).slice(0, boltCount);

        const landingPoints = selectedSlots.map(slot => ({
          x: cellCenterX + (slot.x * targetCellSize) + ((cellRandom() - 0.5) * targetCellSize * 0.06),
          y: cellCenterY + (slot.y * targetCellSize) + ((cellRandom() - 0.5) * targetCellSize * 0.06)
        }));

        return (
          <g key={`${cellKey}-${tick}`} style={{ mixBlendMode: 'screen' }}>
            {landingPoints.map((landing, boltIndex) => {
              const boltSeed = hashStringToSeed(`${booster.id}:${cellKey}:${tick}:${boltIndex}`);
              const boltRandom = createSeededRandom(boltSeed);
              const bolt = generateDetailedBolt(sourceX, sourceY, landing.x, landing.y, boltRandom);
              const widthScale = 0.78 + (boltRandom() * 0.72);
              return (
                <g key={`${cellKey}-${tick}-${boltIndex}`}>
                  <path
                    d={bolt.mainPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={bolt.thickness * 8 * widthScale}
                    opacity={0.2 * bolt.intensity}
                    style={{ filter: 'blur(8px)' }}
                  />
                  <path
                    d={bolt.mainPath}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth={bolt.thickness * 3.6 * widthScale}
                    opacity={0.45 * bolt.intensity}
                    style={{ filter: 'blur(2px)' }}
                  />
                  <path
                    d={bolt.mainPath}
                    fill="none"
                    stroke="#fef9c3"
                    strokeWidth={bolt.thickness * 1.7 * widthScale}
                    opacity={0.9 * bolt.intensity}
                  />
                  <path
                    d={bolt.mainPath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={bolt.thickness * 0.8 * widthScale}
                    opacity={0.95 * bolt.intensity}
                  />
                  <circle cx={landing.x} cy={landing.y} r={5.5} fill="#fde68a" opacity={0.24} />
                  <circle cx={landing.x} cy={landing.y} r={2.2} fill="#ffffff" opacity={0.8} />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}, (prevProps, nextProps) => (
  prevProps.phase === nextProps.phase
  && prevProps.booster.id === nextProps.booster.id
  && prevProps.affectedCells === nextProps.affectedCells
  && prevProps.boardRef === nextProps.boardRef
));

const SuperballForeground: React.FC<{
  superballAnimation: SuperballAnimationState | null;
  boardRef: React.RefObject<HTMLDivElement>;
}> = ({ superballAnimation, boardRef }) => {
  if (!superballAnimation || superballAnimation.phase !== 'buildup' || !boardRef.current) return null;

  const metrics = getBoardCellMetrics(
    boardRef.current,
    superballAnimation.booster.x,
    superballAnimation.booster.y
  );

  return (
    <div
      className="fixed pointer-events-none"
      style={{
        left: metrics.centerX,
        top: metrics.centerY,
        width: metrics.width,
        height: metrics.height,
        transform: 'translate(-50%, -50%)',
        zIndex: 75,
        filter: 'drop-shadow(1px -1px 0 rgba(255, 255, 255, 0.72)) drop-shadow(-1px 1px 0 rgba(254, 240, 138, 0.64)) drop-shadow(1px 1px 0 rgba(250, 204, 21, 0.6)) drop-shadow(0 0 12px rgba(251, 191, 36, 0.9)) drop-shadow(0 0 8px rgba(251, 191, 36, 0.22))'
      }}
    >
      <img
        src={UI_ASSETS.SUPERBALL}
        alt="Superball"
        className="w-[85%] h-[85%] object-contain superball-buildup"
        style={{
          margin: '7.5%',
          filter: 'drop-shadow(1px -1px 0 rgba(255, 255, 255, 0.8)) drop-shadow(-2px 1px 0 rgba(254, 240, 138, 0.78)) drop-shadow(2px 0 0 rgba(250, 204, 21, 0.7)) drop-shadow(0 0 4px rgba(251, 191, 36, 0.78)) drop-shadow(0 0 8px rgba(251, 191, 36, 0.52))',
          animation: 'superballBuildup 1.5s ease-in forwards'
        }}
      />
    </div>
  );
};

const PowerupDarkOverlay: React.FC<{
  opacity?: number;
  zIndex?: number;
  pointerEvents?: 'none' | 'auto';
  onClick?: () => void;
}> = ({
  opacity = 0.7,
  zIndex = 30,
  pointerEvents = 'none',
  onClick
}) => (
  <div
    className="fixed inset-0 powerup-dark-overlay"
    style={{
      backgroundColor: `rgba(0, 0, 0, ${opacity})`,
      zIndex,
      pointerEvents
    }}
    onClick={onClick}
  />
);

const createLevelOneTestBoosters = (): Booster[] => ([
  { id: 'test-superball-left', type: 'color_ball', x: 2, y: 3, color: Color.BLUE },
  { id: 'test-line-bomb-center', type: 'line_bomb', x: 3, y: 3, color: Color.ORANGE },
  { id: 'test-superball-right', type: 'color_ball', x: 4, y: 3, color: Color.ORANGE }
]);

export const Game: React.FC = () => {
  // Audio system
  const audio = useAudio();
  const playAudio = audio.play;
  const preloadAudio = audio.preload;

  // Theme system
  const theme = useTheme();

  // Unique ID counter for particles and other elements
  const particleIdCounter = useRef(0);

  const [gameState, setGameState] = useState<GameState>(() => {
    const initialLevel = 1;
    const levelConfig = getLevelConfig(initialLevel);
    const initialBoosters = createLevelOneTestBoosters();
    const baseInitialGrid = removeTilesAtPoints(
      createRandomGrid(levelConfig.gridFill, initialLevel),
      initialBoosters.map(booster => ({ x: booster.x, y: booster.y }))
    );
    const initialGrid = seedLevelOneInitialSixMatch(baseInitialGrid, initialLevel, initialBoosters);
    const initialHand = generateValidHand(initialGrid, initialLevel);
    return {
      grid: initialGrid,
      boosters: initialBoosters,
      score: 0,
      highScore: Number(localStorage.getItem('highScore')) || 0,
      moves: 20,
      hand: initialHand,
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1,
      level: initialLevel,
      objectives: initializeObjectives(initialLevel),
      levelComplete: false,
      lives: 5,
      coins: 100,
      stars: 0
    };
  });
  const gameStateRef = useRef(gameState);

  const [hoveredCell, setHoveredCell] = useState<Point | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number } | null>(null);
  const [dragCellSize, setDragCellSize] = useState<number>(40);
  const [dragVelocity, setDragVelocity] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const lastDragPos = useRef<{ x: number, y: number, time: number } | null>(null);
  
  // Effects State
  const [particles, setParticles] = useState<Particle[]>([]);
  const [explosionSprites, setExplosionSprites] = useState<ExplosionSprite[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showLevelPopup, setShowLevelPopup] = useState(false);
  const [showAllClear, setShowAllClear] = useState(false);
  const [affectedCells, setAffectedCells] = useState<Set<string>>(new Set());
  const [affectedColor, setAffectedColor] = useState<string>('transparent');

  // Powerup uses (reset each level)
  const [trashUses, setTrashUses] = useState(1);
  const [shuffleUses, setShuffleUses] = useState(3);
  const [deleteBlockUses, setDeleteBlockUses] = useState(3);
  const [deleteBlockMode, setDeleteBlockMode] = useState(false);
  const [wildcardUses, setWildcardUses] = useState(3);
  const [wildcardMode, setWildcardMode] = useState(false);
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [showOutOfMovesPopup, setShowOutOfMovesPopup] = useState(false);
  const [watchingMovesAd, setWatchingMovesAd] = useState(false);
  const [trashingAllPieces, setTrashingAllPieces] = useState(false);
  const [superballAnimations, setSuperballAnimations] = useState<SuperballAnimationState[]>([]);
  const [destructionRuntime, setDestructionRuntime] = useState<DestructionRuntimeState>(() => (
    toRuntimeState([], [])
  ));
  const destructionQueueRef = useRef<DestructionRequest[]>([]);
  const activeDestructionEffectsRef = useRef<Map<string, ActiveEffect>>(new Map());
  const destructionCommitTimersRef = useRef<Map<string, number>>(new Map());
  const destructionWaveTimersRef = useRef<Map<string, number[]>>(new Map());
  const engineIdleCallbacksRef = useRef<Array<() => void>>([]);
  const [shufflePhase, setShufflePhase] = useState<'darkening' | 'levitating' | 'scrambling' | 'landing' | null>(null);
  const [shuffleAnimations, setShuffleAnimations] = useState<Array<{
    tile: { color: Color; id: string };
    fromPx: { x: number; y: number };
    toPx: { x: number; y: number };
    progress: number;
    cellSize: number;
    isBooster?: boolean;
    boosterType?: BoosterType;
  }>>([]);
  const [fadingBoxIndex, setFadingBoxIndex] = useState<{ index: number; fading: boolean } | null>(null);
  const [fadingInPieceIndex, setFadingInPieceIndex] = useState<number | null>(null);
  const [returningPiece, setReturningPiece] = useState<{
    piece: PieceData;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    index: number;
    progress: number;
  } | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [isCriticalAssetsReady, setIsCriticalAssetsReady] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [isInteractionLocked, setIsInteractionLocked] = useState(true);
  const [isIntroArrivalActive, setIsIntroArrivalActive] = useState(false);
  const [introRequest, setIntroRequest] = useState<{
    id: number;
    blocks: AddedBlock[];
    boosters: Booster[];
    minLoadingMs: number;
    showLoadingOverlay: boolean;
  } | null>(null);
  const introRequestIdRef = useRef(0);
  const bootIntroQueuedRef = useRef(false);
  const pendingIncomingBlocksRef = useRef<AddedBlock[] | null>(null);
  const pendingAllClearIntroRef = useRef<{
    grid: GameState['grid'];
    boosters: Booster[];
    minLoadingMs: number;
    showLoadingOverlay: boolean;
  } | null>(null);
  const onlyBoostersRefillInProgressRef = useRef(false);
  const pendingAllClearAfterDestructionRef = useRef(false);
  const pendingOnlyBoostersAfterDestructionRef = useRef(false);
  const isGameplayInputLocked = isInteractionLocked || destructionRuntime.destructionLock;
  const superballAnimation = superballAnimations[0] ?? null;

  const layoutRef = useRef<HTMLDivElement>(null);
  const headerCardRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const boardPanelThemeConfig = theme.config('panel_main');
  const rackPanelThemeConfig = theme.config('container_next_main');
  const layoutThemeConfig = theme.layout();
  const [isLayoutDebugVisible, setIsLayoutDebugVisible] = useState<boolean>(() => readLayoutDebugEnabled());
  const [layoutDebugOverrides, setLayoutDebugOverrides] = useState<LayoutDebugOverrides | null>(() => readLayoutDebugOverrides());
  const [layoutDebugCopyStatus, setLayoutDebugCopyStatus] = useState<LayoutDebugCopyStatus>('idle');
  const themeSpacerBaseAspect = useMemo(() => (
    (layoutThemeConfig.spacerHeaderBoardAspect + layoutThemeConfig.spacerBoardRackAspect) / 2
  ), [layoutThemeConfig.spacerBoardRackAspect, layoutThemeConfig.spacerHeaderBoardAspect]);

  const appliedLayoutDebugOverrides = useMemo<LayoutDebugOverrides>(() => ({
    spacerAspect: sanitizeLayoutAspect(
      layoutDebugOverrides?.spacerAspect ?? layoutThemeConfig.layoutDebugSpacerAspect
    ),
    headerAspectRatio: sanitizeHeaderAspectRatio(
      layoutDebugOverrides?.headerAspectRatio ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.headerAspectRatio
    ),
    subheaderAspectRatio: sanitizeSubheaderAspectRatio(
      layoutDebugOverrides?.subheaderAspectRatio ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderAspectRatio
    ),
    subheaderActive: layoutDebugOverrides?.subheaderActive ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderActive,
    subheaderPaddingOffset: sanitizeSubheaderPaddingOffset(
      layoutDebugOverrides?.subheaderPaddingOffset ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderPaddingOffset
    ),
    subheaderContainerOpacity: sanitizeSubheaderContainerOpacity(
      layoutDebugOverrides?.subheaderContainerOpacity ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderContainerOpacity
    ),
    subheaderShowContent: layoutDebugOverrides?.subheaderShowContent ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderShowContent,
    nineSliceScaleMultiplier: sanitizeNineSliceScaleMultiplier(
      layoutDebugOverrides?.nineSliceScaleMultiplier ?? layoutThemeConfig.layoutDebugNineSliceScaleMultiplier
    ),
    boardPaddingMultiplier: sanitizeBoardPaddingMultiplier(
      layoutDebugOverrides?.boardPaddingMultiplier ?? layoutThemeConfig.layoutDebugBoardPaddingMultiplier
    ),
    powerupSizeMultiplier: sanitizePowerupSizeMultiplier(
      layoutDebugOverrides?.powerupSizeMultiplier ?? layoutThemeConfig.layoutDebugPowerupSizeMultiplier
    ),
    powerupBubbleSizeMultiplier: sanitizePowerupBubbleSizeMultiplier(
      layoutDebugOverrides?.powerupBubbleSizeMultiplier ?? layoutThemeConfig.layoutDebugPowerupBubbleSizeMultiplier
    ),
    powerupGapMultiplier: sanitizePowerupGapMultiplier(
      layoutDebugOverrides?.powerupGapMultiplier ?? layoutThemeConfig.layoutDebugPowerupGapMultiplier
    ),
  }), [
    layoutDebugOverrides,
    layoutThemeConfig.layoutDebugBoardPaddingMultiplier,
    layoutThemeConfig.layoutDebugNineSliceScaleMultiplier,
    layoutThemeConfig.layoutDebugPowerupBubbleSizeMultiplier,
    layoutThemeConfig.layoutDebugPowerupGapMultiplier,
    layoutThemeConfig.layoutDebugPowerupSizeMultiplier,
    layoutThemeConfig.layoutDebugSpacerAspect,
  ]);

  const effectiveSpacerHeaderBoardAspect = useMemo(() => {
    const safeBase = Math.max(0.0001, themeSpacerBaseAspect);
    const ratio = layoutThemeConfig.spacerHeaderBoardAspect / safeBase;
    const mappedBaseAspect = mapSpacerControlToAspect(appliedLayoutDebugOverrides.spacerAspect);
    return sanitizeLayoutAspect(mappedBaseAspect * ratio);
  }, [
    appliedLayoutDebugOverrides.spacerAspect,
    layoutThemeConfig.spacerHeaderBoardAspect,
    themeSpacerBaseAspect,
  ]);

  const effectiveSpacerBoardRackAspect = useMemo(() => {
    const safeBase = Math.max(0.0001, themeSpacerBaseAspect);
    const ratio = layoutThemeConfig.spacerBoardRackAspect / safeBase;
    const mappedBaseAspect = mapSpacerControlToAspect(appliedLayoutDebugOverrides.spacerAspect);
    return sanitizeLayoutAspect(mappedBaseAspect * ratio);
  }, [
    appliedLayoutDebugOverrides.spacerAspect,
    layoutThemeConfig.spacerBoardRackAspect,
    themeSpacerBaseAspect,
  ]);

  const nineSliceScaleMultiplier = appliedLayoutDebugOverrides.nineSliceScaleMultiplier;
  const powerupSizeMultiplier = appliedLayoutDebugOverrides.powerupSizeMultiplier;
  const powerupBubbleSizeMultiplier = appliedLayoutDebugOverrides.powerupBubbleSizeMultiplier;
  const powerupGapMultiplier = appliedLayoutDebugOverrides.powerupGapMultiplier;

  const boardPanelConfig = useMemo(() => ({
    ...boardPanelThemeConfig,
    scale: (boardPanelThemeConfig.scale ?? 1) * nineSliceScaleMultiplier,
  }), [boardPanelThemeConfig, nineSliceScaleMultiplier]);

  const rackPanelConfig = useMemo(() => ({
    ...rackPanelThemeConfig,
    scale: (rackPanelThemeConfig.scale ?? 1) * nineSliceScaleMultiplier,
  }), [rackPanelThemeConfig, nineSliceScaleMultiplier]);

  const headerPanelConfig = useMemo(() => ({
    ...boardPanelConfig,
    aspectRatio: appliedLayoutDebugOverrides.headerAspectRatio,
  }), [appliedLayoutDebugOverrides.headerAspectRatio, boardPanelConfig]);

  const subheaderPanelConfig = useMemo(() => ({
    ...boardPanelConfig,
    aspectRatio: appliedLayoutDebugOverrides.subheaderAspectRatio,
  }), [appliedLayoutDebugOverrides.subheaderAspectRatio, boardPanelConfig]);

  const boardAspect = boardPanelConfig.aspectRatio ?? 1;
  const rackAspect = rackPanelConfig.aspectRatio ?? (3 / 2);

  const updateLayoutDebugOverride = useCallback((patch: Partial<LayoutDebugOverrides>) => {
    setLayoutDebugOverrides((prev) => {
      const base = prev ?? appliedLayoutDebugOverrides;
      return sanitizeLayoutDebugOverrides({ ...base, ...patch });
    });
    setLayoutDebugCopyStatus('idle');
  }, [appliedLayoutDebugOverrides]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LAYOUT_DEBUG_ENABLED_KEY, isLayoutDebugVisible ? '1' : '0');
    } catch {
      // Ignore persistence errors
    }
  }, [isLayoutDebugVisible]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!layoutDebugOverrides) {
        window.localStorage.removeItem(LAYOUT_DEBUG_OVERRIDES_KEY);
        return;
      }
      window.localStorage.setItem(LAYOUT_DEBUG_OVERRIDES_KEY, JSON.stringify(layoutDebugOverrides));
    } catch {
      // Ignore persistence errors
    }
  }, [layoutDebugOverrides]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey)
        && event.shiftKey
        && event.key.toLowerCase() === 'l';
      if (!isShortcut) return;
      event.preventDefault();
      setIsLayoutDebugVisible((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const backgroundImageSrc = theme.background('bg_game');
  const boardPanelSrc = theme.panel('panel_main');
  const rackPanelSrc = theme.panel('panel_main');
  const popupPanelSrc = theme.panel('panel_popup');
  const primaryButtonPanelSrc = theme.panel('button_primary');
  const secondaryButtonPanelSrc = theme.panel('button_secondary');
  const cancelButtonPanelSrc = theme.panel('button_cancel');
  const loadingLevelTemplateSrc = theme.template('loading_level');
  const loadingSplashTemplateSrc = theme.template('splash_loading');

  const responsive = useResponsiveMetrics({
    layoutRef,
    headerRef: headerCardRef,
    powerupCount: 4,
    minTouchTarget: 44,
    headerAspect: headerPanelConfig.aspectRatio ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.headerAspectRatio,
    subheaderActive: appliedLayoutDebugOverrides.subheaderActive,
    subheaderAspect: subheaderPanelConfig.aspectRatio ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderAspectRatio,
    boardAspect,
    rackAspect,
    spacerHeaderBoardAspect: effectiveSpacerHeaderBoardAspect,
    spacerBoardRackAspect: effectiveSpacerBoardRackAspect,
    boardPanelScale: boardPanelConfig.scale ?? 1,
    boardPanelScaleMode: boardPanelConfig.scaleMode ?? 'density',
    boardPanelDprReference: boardPanelConfig.dprReference ?? 2,
    boardPanelDprMinFactor: boardPanelConfig.dprMinFactor ?? 0.8,
    boardPanelDprMaxFactor: boardPanelConfig.dprMaxFactor ?? 1.25,
    boardPaddingMultiplier: appliedLayoutDebugOverrides.boardPaddingMultiplier,
    rackSlotAspect: UI_ASSET_ASPECT_RATIOS.CONTAINER_NEXT_PIECE
  });

  const dragOffsetY = useMemo(() => {
    const isCoarsePointer = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    const viewportOffset = responsive.viewportHeight * (isCoarsePointer ? 0.17 : 0.11);
    const cellOffset = responsive.boardCellSize * (isCoarsePointer ? 3.2 : 2.2);
    return Math.max(viewportOffset, cellOffset);
  }, [responsive.boardCellSize, responsive.viewportHeight]);

  const queueLevelIntro = useCallback((
    grid: GameState['grid'],
    boosters: Booster[] = [],
    minLoadingMs = 650,
    options?: {
      showLoadingOverlay?: boolean;
    }
  ) => {
    const showLoadingOverlay = options?.showLoadingOverlay ?? true;
    const requestId = ++introRequestIdRef.current;
    setShowLoadingScreen(showLoadingOverlay);
    setIsInteractionLocked(true);
    // If no loading overlay is shown, keep board slots visible (hide static tiles)
    // until incoming animation starts.
    setIsIntroArrivalActive(!showLoadingOverlay);
    setIntroRequest({
      id: requestId,
      blocks: collectGridBlocksForIntro(grid, boosters),
      boosters: boosters.map(booster => ({ ...booster })),
      minLoadingMs,
      showLoadingOverlay
    });
  }, []);

  useEffect(() => {
    bootIntroQueuedRef.current = false;
    introRequestIdRef.current = 0;
    pendingIncomingBlocksRef.current = null;
    pendingAllClearIntroRef.current = null;
    setIsInteractionLocked(true);
    setShowLoadingScreen(true);
    setIsIntroArrivalActive(false);
    setIntroRequest(null);
  }, [theme.themeName]);

  const getCellMetrics = useCallback((x: number, y: number) => {
    if (!boardRef.current) return null;
    return getBoardCellMetrics(boardRef.current, x, y);
  }, []);

  const getBoardPlacementMetrics = useCallback(() => {
    if (!boardRef.current) return null;
    const grid = getBoardGridMetrics(boardRef.current);
    if (grid) {
      return {
        left: grid.left,
        top: grid.top,
        cellSize: grid.cellSize,
        gapX: grid.gapX,
        gapY: grid.gapY
      };
    }

    const rect = boardRef.current.getBoundingClientRect();
    const cellSize = rect.width / GRID_SIZE;
    return {
      left: rect.left,
      top: rect.top,
      cellSize,
      gapX: 0,
      gapY: 0
    };
  }, []);

  const activeIncomingIds = useMemo(() => {
    const tileIds = new Set<string>();
    const boosterIds = new Set<string>();
    for (const anim of shuffleAnimations) {
      if (anim.isBooster) {
        boosterIds.add(anim.tile.id);
      } else {
        tileIds.add(anim.tile.id);
      }
    }
    return { tileIds, boosterIds };
  }, [shuffleAnimations]);


  // Preload all critical assets before exposing gameplay.
  useEffect(() => {
    let cancelled = false;

    if (!theme.isReady) {
      setIsCriticalAssetsReady(false);
      setShowLoadingScreen(true);
      return;
    }

    setIsCriticalAssetsReady(false);
    setShowLoadingScreen(true);

    const bootstrapAssets = async () => {
      await preloadAudio(['blocksIncoming', 'boosterWave', 'match']);
      await preloadImages([
        backgroundImageSrc,
        loadingLevelTemplateSrc,
        loadingSplashTemplateSrc,
        boardPanelSrc,
        rackPanelSrc,
        popupPanelSrc,
        primaryButtonPanelSrc,
        secondaryButtonPanelSrc,
        cancelButtonPanelSrc,
        UI_ASSETS.SLOT,
        UI_ASSETS.CONTAINER_NEXT_PIECE,
        UI_ASSETS.SUPERBALL,
        ICONS.BLUE,
        ICONS.GREEN,
        ICONS.PURPLE,
        ICONS.YELLOW,
        ICONS.ORANGE
      ]);

      if (cancelled) return;
      setIsCriticalAssetsReady(true);
    };

    bootstrapAssets();

    return () => {
      cancelled = true;
    };
  }, [
    cancelButtonPanelSrc,
    backgroundImageSrc,
    boardPanelSrc,
    primaryButtonPanelSrc,
    loadingLevelTemplateSrc,
    loadingSplashTemplateSrc,
    popupPanelSrc,
    rackPanelSrc,
    secondaryButtonPanelSrc,
    preloadAudio,
    theme.isReady,
    theme.themeName
  ]);

  // Initial level entry sequence after theme + assets are fully loaded.
  useEffect(() => {
    if (!theme.isReady || !isCriticalAssetsReady || bootIntroQueuedRef.current) return;
    bootIntroQueuedRef.current = true;
    queueLevelIntro(gameState.grid, gameState.boosters, 700);
  }, [gameState.boosters, gameState.grid, isCriticalAssetsReady, queueLevelIntro, theme.isReady]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Hard lock gameplay interactions while loading/intro is active.
  useEffect(() => {
    if (!isInteractionLocked) return;
    setDeleteBlockMode(false);
    setWildcardMode(false);
    setDragPosition(null);
    setHoveredCell(null);
    setDragVelocity({ x: 0, y: 0 });
    lastDragPos.current = null;
    setGameState(prev => (
      prev.selectedPieceIndex === null
        ? prev
        : { ...prev, selectedPieceIndex: null }
    ));
  }, [isInteractionLocked]);

  // Shared transient-effects loop using delta-time to keep animation speed stable.
  useAnimationFrame(({ deltaMs }) => {
    const frameScale = deltaMs / FRAME_MS_60FPS;
    if (!Number.isFinite(frameScale) || frameScale <= 0) return;

    setParticles(prev => {
      if (prev.length === 0) return prev;
      return prev.map(p => ({
        ...p,
        x: p.x + (p.vx * frameScale),
        y: p.y + (p.vy * frameScale),
        vy: p.vy + (0.5 * frameScale), // Gravity
        life: p.life - frameScale
      })).filter(p => p.life > 0);
    });

    setExplosionSprites(prev => {
      if (prev.length === 0) return prev;
      return prev.map(sprite => ({
        ...sprite,
        life: sprite.life - frameScale
      })).filter(sprite => sprite.life > 0);
    });

    setFloatingTexts(prev => {
      if (prev.length === 0) return prev;
      return prev.map(t => ({
        ...t,
        y: t.y - (1.5 * frameScale), // Float up
        life: t.life - frameScale
      })).filter(t => t.life > 0);
    });

    setReturningPiece(prev => {
      if (!prev) return prev;
      const newProgress = prev.progress + (0.12 * frameScale); // Fast animation
      if (newProgress >= 1) {
        return null; // Animation complete
      }
      return { ...prev, progress: newProgress };
    });
  }, { active: true });

  // Sync high score
  useEffect(() => {
    if (gameState.score > gameState.highScore) {
      setGameState(prev => ({ ...prev, highScore: prev.score }));
      localStorage.setItem('highScore', gameState.score.toString());
    }
  }, [gameState.score, gameState.highScore]);

  // Start celebration when level is complete
  useEffect(() => {
    if (!gameState.levelComplete || celebrating || showLevelPopup) return;

    const timerId = window.setTimeout(() => {
      startCelebration();
    }, 500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [celebrating, gameState.levelComplete, showLevelPopup]);

  // Auto-start music on load (fallback to first interaction if blocked)
  const musicStartedRef = useRef(false);
  useEffect(() => {
    if (!musicEnabled || musicStartedRef.current) return;

    // Try to start immediately
    audio.startMusic();
    musicStartedRef.current = true;
  }, [musicEnabled, audio]);

  // Toggle background music
  const toggleMusic = () => {
    const isPlaying = audio.toggleMusic();
    setMusicEnabled(isPlaying);
    musicStartedRef.current = isPlaying;
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  };

  const spawnParticles = (x: number, y: number, color: string, count: number, sizeMultiplier: number = 1) => {
    // Convert icon path to actual color for particles
    const particleColor = isIconPath(color) ? getParticleColor(color) : color;
    const shapes: Array<Particle['shape']> = ['circle', 'square', 'triangle'];

    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      newParticles.push({
        id: ++particleIdCounter.current,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // Slight upward bias
        color: particleColor,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        life: 40 + Math.random() * 20,
        maxLife: 60,
        size: (Math.random() * 6 + 4) * sizeMultiplier
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  const spawnFloatingText = (x: number, y: number, text: string) => {
    setFloatingTexts(prev => [...prev, {
      id: ++particleIdCounter.current,
      x,
      y,
      text,
      life: 60,
      maxLife: 60,
      scale: 1,
      color: '#fff'
    }]);
  };

  const spawnExplosionSprite = (x: number, y: number, color: string, sizeMultiplier: number = 1) => {
    const spriteColor = isIconPath(color) ? getParticleColor(color) : color;
    const baseSize = 34 * sizeMultiplier;

    setExplosionSprites(prev => [...prev, {
      id: ++particleIdCounter.current,
      x,
      y,
      color: spriteColor,
      size: baseSize,
      life: 12,
      maxLife: 12
    }]);
  };

  // Check if grid is completely empty (no tiles and no boosters)
  const isGridEmpty = (grid: (typeof gameState.grid), boosters: Booster[]): boolean => {
    if (boosters.length > 0) return false;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x] !== null) return false;
      }
    }
    return true;
  };

  // Check if only boosters remain (no regular tiles)
  const hasOnlyBoostersLeft = (grid: (typeof gameState.grid), boosters: Booster[]): boolean => {
    if (boosters.length === 0) return false;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x] !== null) return false;
      }
    }
    return true; // No tiles but boosters exist
  };

  const shouldTriggerNoValidMovesGameOver = (
    grid: GameState['grid'],
    hand: GameState['hand'],
    boosters: Booster[]
  ): boolean => {
    if (boosters.length > 0) return false;
    return isGameOver(grid, hand, boosters);
  };

  // Handle case when only boosters remain using the same ALL CLEAR cadence:
  // show feedback, wait, then refill through incoming animation (no instant pop-in).
  const handleOnlyBoostersLeft = useCallback(() => {
    if (onlyBoostersRefillInProgressRef.current) return;
    onlyBoostersRefillInProgressRef.current = true;

    setShowAllClear(true);
    triggerShake();
    audio.play('allClear');

    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
      for (let i = 0; i < 20; i++) {
        const x = rect.left + Math.random() * rect.width;
        const y = rect.top + Math.random() * rect.height;
        spawnParticles(x, y, colors[Math.floor(Math.random() * colors.length)], 2);
      }
    }

    window.setTimeout(() => {
      setShowAllClear(false);
      setGameState(prev => {
        if (prev.levelComplete) {
          onlyBoostersRefillInProgressRef.current = false;
          return prev;
        }

        // Use the same refill curve as new-level generation and then carve booster cells out.
        const levelConfig = getLevelConfig(prev.level);
        const boosterPoints = prev.boosters.map((booster) => ({ x: booster.x, y: booster.y }));
        const newGrid = removeTilesAtPoints(
          createRandomGrid(levelConfig.gridFill, prev.level),
          boosterPoints
        );
        const addedBlocks: AddedBlock[] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            const tile = newGrid[y][x];
            if (!tile) continue;
            addedBlocks.push({ x, y, color: tile.color, id: tile.id });
          }
        }

        const newHand = generateValidHand(newGrid, prev.level);
        if (addedBlocks.length > 0) {
          pendingIncomingBlocksRef.current = addedBlocks;
        }

        onlyBoostersRefillInProgressRef.current = false;
        return {
          ...prev,
          grid: newGrid,
          hand: newHand,
          combo: prev.combo + 1,
          gameOver: false
        };
      });
    }, 1500);
  }, [audio, triggerShake]);

  // Handle ALL CLEAR - regenerate grid if objectives not complete
  const handleAllClear = () => {
    setShowAllClear(true);
    triggerShake();
    audio.play('allClear');

    // Spawn celebration particles across the board
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
      for (let i = 0; i < 24; i++) {
        const x = rect.left + Math.random() * rect.width;
        const y = rect.top + Math.random() * rect.height;
        spawnParticles(x, y, colors[Math.floor(Math.random() * colors.length)], 3);
      }
    }

    // Bonus score for ALL CLEAR
    setGameState(prev => ({ ...prev, score: prev.score + 500 }));

    setTimeout(() => {
      setShowAllClear(false);

      // Check if level complete, if not regenerate grid
      setGameState(prev => {
        if (prev.levelComplete) {
          return prev; // Let level complete celebration handle it
        }

        // Regenerate grid with current level config
        const levelConfig = getLevelConfig(prev.level);
        const newGrid = createRandomGrid(levelConfig.gridFill, prev.level);
        const newHand = generateValidHand(newGrid, prev.level);
        pendingAllClearIntroRef.current = {
          grid: newGrid,
          boosters: [],
          minLoadingMs: 50,
          showLoadingOverlay: false
        };

        return {
          ...prev,
          grid: newGrid,
          boosters: [],
          hand: newHand,
          combo: prev.combo + 1 // Bonus combo for all clear
        };
      });
    }, 1500);
  };

  const syncDestructionRuntime = useCallback(() => {
    const pendingRequests = [...destructionQueueRef.current];
    const activeEffects = Array.from(activeDestructionEffectsRef.current.values())
      .sort((a, b) => a.startedAt - b.startedAt);
    setDestructionRuntime(toRuntimeState(pendingRequests, activeEffects));
  }, []);

  const resolvePendingPostDestruction = useCallback(() => {
    if (destructionQueueRef.current.length > 0 || activeDestructionEffectsRef.current.size > 0) return;

    if (pendingAllClearAfterDestructionRef.current) {
      pendingAllClearAfterDestructionRef.current = false;
      pendingOnlyBoostersAfterDestructionRef.current = false;
      setTimeout(() => handleAllClear(), POST_DESTRUCTION_ALL_CLEAR_DELAY_MS);
      return;
    }

    if (pendingOnlyBoostersAfterDestructionRef.current) {
      pendingOnlyBoostersAfterDestructionRef.current = false;
      setTimeout(() => handleOnlyBoostersLeft(), POST_DESTRUCTION_ALL_CLEAR_DELAY_MS);
    }
  }, [handleAllClear, handleOnlyBoostersLeft]);

  const flushEngineIdleCallbacks = useCallback(() => {
    if (destructionQueueRef.current.length > 0) return;
    if (activeDestructionEffectsRef.current.size > 0) return;
    resolvePendingPostDestruction();
    if (engineIdleCallbacksRef.current.length === 0) return;

    const callbacks = [...engineIdleCallbacksRef.current];
    engineIdleCallbacksRef.current = [];
    callbacks.forEach((callback) => callback());
  }, [resolvePendingPostDestruction]);

  const onDestructionEngineIdle = useCallback((callback: () => void) => {
    if (destructionQueueRef.current.length === 0 && activeDestructionEffectsRef.current.size === 0) {
      callback();
      return;
    }
    engineIdleCallbacksRef.current.push(callback);
  }, []);

  const getDestructionSnapshot = useCallback(() => {
    const snapshot = gameStateRef.current;
    return {
      grid: snapshot.grid,
      boosters: snapshot.boosters,
      objectives: snapshot.objectives
    };
  }, []);

  const processDestructionQueueRef = useRef<() => void>(() => {});
  const commitDestructionEffectRef = useRef<(effectId: string) => void>(() => {});

  const enqueueChainBoosters = useCallback((boosterIds: string[]) => {
    if (boosterIds.length === 0) return;

    const activeBoosterIds = new Set(
      Array.from(activeDestructionEffectsRef.current.values())
        .map((effect) => effect.boosterId)
        .filter((id): id is string => Boolean(id))
    );
    const queuedBoosterIds = new Set(
      destructionQueueRef.current
        .map((request) => request.boosterId)
        .filter((id): id is string => Boolean(id))
    );
    const liveBoosters = new Set(gameStateRef.current.boosters.map((booster) => booster.id));

    for (const boosterId of boosterIds) {
      if (!liveBoosters.has(boosterId)) continue;
      if (activeBoosterIds.has(boosterId)) continue;
      if (queuedBoosterIds.has(boosterId)) continue;

      destructionQueueRef.current.push(createDestructionRequest({
        kind: 'booster',
        source: 'chain',
        boosterId
      }));
      queuedBoosterIds.add(boosterId);
    }
  }, []);

  const finalizeDestructionEffect = useCallback((effectId: string) => {
    const commitTimer = destructionCommitTimersRef.current.get(effectId);
    if (commitTimer !== undefined) {
      window.clearTimeout(commitTimer);
      destructionCommitTimersRef.current.delete(effectId);
    }

    const waveTimers = destructionWaveTimersRef.current.get(effectId);
    if (waveTimers && waveTimers.length > 0) {
      waveTimers.forEach((timerId) => window.clearTimeout(timerId));
      destructionWaveTimersRef.current.delete(effectId);
    }

    activeDestructionEffectsRef.current.delete(effectId);
    syncDestructionRuntime();
    processDestructionQueueRef.current();
    flushEngineIdleCallbacks();
  }, [flushEngineIdleCallbacks, syncDestructionRuntime]);

  const runWaveBoosterCommit = useCallback((
    effect: ActiveEffect,
    snapshotBefore: {
      grid: (TileData | null)[][];
      boosters: Booster[];
      objectives: LevelObjective[];
    }
  ) => {
    if (!effect.boosterId || !isWaveBoosterType(effect.boosterType)) {
      finalizeDestructionEffect(effect.effectId);
      return;
    }

    const booster = snapshotBefore.boosters.find((entry) => entry.id === effect.boosterId);
    if (!booster) {
      finalizeDestructionEffect(effect.effectId);
      return;
    }

    const waveSteps = buildBoosterWaveSteps(booster);
    const scoreMultiplier = booster.type === 'line_bomb' ? 1.5 : 1;
    const objectiveDeltas: Partial<Record<Color, number>> = {};
    let removedTileCount = 0;

    const removeBoosterNow = () => {
      const currentState = gameStateRef.current;
      if (!currentState.boosters.some((entry) => entry.id === booster.id)) return;
      const nextState: GameState = {
        ...currentState,
        boosters: currentState.boosters.filter((entry) => entry.id !== booster.id)
      };
      gameStateRef.current = nextState;
      setGameState(nextState);
    };

    const finalizeWaveCommit = () => {
      if (!activeDestructionEffectsRef.current.has(effect.effectId)) return;

      const scoreDelta = Math.round(removedTileCount * 15 * scoreMultiplier);
      const hasObjectiveDeltas = Object.keys(objectiveDeltas).length > 0;

      if (scoreDelta > 0 || hasObjectiveDeltas) {
        const currentState = gameStateRef.current;
        const updatedObjectives = currentState.objectives.map((objective) => ({
          ...objective,
          current: Math.min(
            objective.target,
            objective.current + (objectiveDeltas[objective.color] ?? 0)
          )
        }));
        const isLevelComplete = updatedObjectives.slice(0, 2).every((objective) => objective.current >= objective.target);

        const nextState: GameState = {
          ...currentState,
          score: currentState.score + scoreDelta,
          objectives: updatedObjectives,
          levelComplete: isLevelComplete,
          clearingTiles: [],
          gameOver: false
        };

        if (!isLevelComplete) {
          if (isGridEmpty(nextState.grid, nextState.boosters)) {
            pendingAllClearAfterDestructionRef.current = true;
            pendingOnlyBoostersAfterDestructionRef.current = false;
          } else if (hasOnlyBoostersLeft(nextState.grid, nextState.boosters)) {
            pendingOnlyBoostersAfterDestructionRef.current = true;
          } else {
            pendingAllClearAfterDestructionRef.current = false;
            pendingOnlyBoostersAfterDestructionRef.current = false;
            nextState.gameOver = shouldTriggerNoValidMovesGameOver(
              nextState.grid,
              nextState.hand,
              nextState.boosters
            );
          }
        } else {
          pendingAllClearAfterDestructionRef.current = false;
          pendingOnlyBoostersAfterDestructionRef.current = false;
        }

        gameStateRef.current = nextState;
        setGameState(nextState);
      }

      finalizeDestructionEffect(effect.effectId);
    };

    removeBoosterNow();

    if (waveSteps.length === 0) {
      finalizeWaveCommit();
      return;
    }

    const scheduledTimers: number[] = [];
    destructionWaveTimersRef.current.set(effect.effectId, scheduledTimers);

    waveSteps.forEach((stepPoints, stepIndex) => {
      const timerId = window.setTimeout(() => {
        if (!activeDestructionEffectsRef.current.has(effect.effectId)) return;
        if (stepPoints.length > 0) {
          audio.play('boosterWave', 0.25);
        }

        const currentState = gameStateRef.current;
        const nextGrid = currentState.grid.map((row) => [...row]);
        const chainBoosters: string[] = [];
        let stepRemovedCount = 0;
        let stepUnlockedCount = 0;

        stepPoints.forEach((point) => {
          const metrics = getCellMetrics(point.x, point.y);
          if (metrics) {
            spawnExplosionSprite(metrics.centerX, metrics.centerY, '#fde047', 0.95);
          }

          const hitBooster = currentState.boosters.find(
            (entry) => entry.x === point.x && entry.y === point.y && entry.id !== booster.id
          );
          if (hitBooster) {
            chainBoosters.push(hitBooster.id);
          }

          const tile = nextGrid[point.y]?.[point.x];
          if (!tile) return;

          if (tile.locked) {
            nextGrid[point.y][point.x] = { ...tile, locked: false };
            stepUnlockedCount += 1;
            if (metrics) {
              spawnFloatingText(metrics.centerX, metrics.centerY, '🔓');
            }
            return;
          }

          nextGrid[point.y][point.x] = null;
          stepRemovedCount += 1;
          removedTileCount += 1;
          objectiveDeltas[tile.color] = (objectiveDeltas[tile.color] ?? 0) + 1;
          if (metrics) {
            spawnParticles(metrics.centerX, metrics.centerY, tile.color, 8);
          }
        });

        if (stepRemovedCount > 0 || stepUnlockedCount > 0) {
          const nextState: GameState = {
            ...currentState,
            grid: nextGrid
          };
          gameStateRef.current = nextState;
          setGameState(nextState);
        }

        if (stepRemovedCount > 0 || stepUnlockedCount > 0) {
          triggerShake();
        }

        if (chainBoosters.length > 0) {
          enqueueChainBoosters(chainBoosters);
          processDestructionQueueRef.current();
        }

        if (stepIndex === waveSteps.length - 1) {
          finalizeWaveCommit();
        }
      }, stepIndex * BOOSTER_WAVE_STEP_MS);

      scheduledTimers.push(timerId);
    });
  }, [
    audio,
    enqueueChainBoosters,
    finalizeDestructionEffect,
    hasOnlyBoostersLeft,
    isGridEmpty
  ]);

  const commitDestructionEffect = useCallback((effectId: string) => {
    const effect = activeDestructionEffectsRef.current.get(effectId);
    if (!effect) return;

    activeDestructionEffectsRef.current.set(effectId, { ...effect, phase: 'commit' });
    syncDestructionRuntime();

    const snapshotBefore = getDestructionSnapshot();
    if (effect.request.kind === 'booster' && isWaveBoosterType(effect.boosterType)) {
      runWaveBoosterCommit(effect, snapshotBefore);
      return;
    }

    const commit = computeCommitForEffect(effect, snapshotBefore);
    const hasRemovedTiles = commit.removeTileIds.length > 0;

    if (effect.request.kind === 'booster' && effect.boosterType === 'color_ball') {
      audio.play('superball', 0.25);

      // Superball should burst visually at its own position before disappearing.
      if (effect.boosterId) {
        const sourceBooster = snapshotBefore.boosters.find((entry) => entry.id === effect.boosterId);
        if (sourceBooster) {
          const metrics = getCellMetrics(sourceBooster.x, sourceBooster.y);
          if (metrics) {
            const burstColors = [
              '#2f6df6', // electric blue
              '#5b34d9', // deep violet
              '#e23d8f', // magenta
              '#ef4444', // red
              '#f59e0b', // orange
              '#facc15'  // yellow
            ];
            burstColors.forEach((color, index) => {
              const count = index === 0 ? 14 : 8;
              spawnParticles(metrics.centerX, metrics.centerY, color, count, 1.2);
            });
            spawnExplosionSprite(metrics.centerX, metrics.centerY, '#fde68a', 1.35);
          }
        }
      }
    }

    // Booster-driven destruction should always include the tile-destroy SFX
    // when tiles are actually removed.
    if (hasRemovedTiles) {
      if (effect.request.kind === 'booster') {
        audio.play('match');
      } else if (effect.request.kind === 'direct') {
        audio.play('match');
      }
    } else if (effect.request.kind === 'direct') {
      audio.play('match');
    }

    const hasCommitMutations = (
      commit.removeTileIds.length > 0
      || commit.unlockTileIds.length > 0
      || commit.removeBoosterIds.length > 0
    );

    if (boardRef.current && hasCommitMutations) {
      const tileToCell = new Map<string, { x: number; y: number; tile: TileData }>();
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const tile = snapshotBefore.grid[y][x];
          if (!tile) continue;
          tileToCell.set(tile.id, { x, y, tile });
        }
      }

      for (const tileId of commit.removeTileIds) {
        const entry = tileToCell.get(tileId);
        if (!entry) continue;
        const metrics = getCellMetrics(entry.x, entry.y);
        if (!metrics) continue;
        spawnParticles(metrics.centerX, metrics.centerY, entry.tile.color, 8);
      }

      for (const tileId of commit.unlockTileIds) {
        const entry = tileToCell.get(tileId);
        if (!entry) continue;
        const metrics = getCellMetrics(entry.x, entry.y);
        if (!metrics) continue;
        spawnFloatingText(metrics.centerX, metrics.centerY, '🔓');
      }

      if (commit.scoreDelta > 0 && commit.removeTileIds.length > 0) {
        const points = commit.removeTileIds
          .map((tileId) => tileToCell.get(tileId))
          .filter((entry): entry is { x: number; y: number; tile: TileData } => Boolean(entry));
        if (points.length > 0) {
          const avgX = points.reduce((acc, entry) => acc + entry.x, 0) / points.length;
          const avgY = points.reduce((acc, entry) => acc + entry.y, 0) / points.length;
          const centerMetrics = getBoardCellMetrics(boardRef.current, avgX, avgY);
          spawnFloatingText(centerMetrics.centerX, centerMetrics.centerY, `+${commit.scoreDelta}`);
        }
      }
    }

    if (hasCommitMutations) {
      triggerShake();
    }

    if (hasCommitMutations || Object.keys(commit.objectiveDeltas).length > 0 || commit.scoreDelta > 0) {
      const updatedSnapshot = applyCommitToSnapshot(snapshotBefore, commit);
      const updatedObjectives = snapshotBefore.objectives.map((objective) => ({
        ...objective,
        current: Math.min(
          objective.target,
          objective.current + (commit.objectiveDeltas[objective.color] ?? 0)
        )
      }));
      const isLevelComplete = updatedObjectives.slice(0, 2).every((objective) => objective.current >= objective.target);

      const nextState: GameState = {
        ...gameStateRef.current,
        grid: updatedSnapshot.grid,
        boosters: updatedSnapshot.boosters,
        score: gameStateRef.current.score + commit.scoreDelta,
        objectives: updatedObjectives,
        levelComplete: isLevelComplete,
        clearingTiles: [],
        gameOver: false
      };

      if (!isLevelComplete) {
        if (isGridEmpty(nextState.grid, nextState.boosters)) {
          pendingAllClearAfterDestructionRef.current = true;
          pendingOnlyBoostersAfterDestructionRef.current = false;
        } else if (hasOnlyBoostersLeft(nextState.grid, nextState.boosters)) {
          pendingOnlyBoostersAfterDestructionRef.current = true;
        } else {
          pendingAllClearAfterDestructionRef.current = false;
          pendingOnlyBoostersAfterDestructionRef.current = false;
          nextState.gameOver = shouldTriggerNoValidMovesGameOver(
            nextState.grid,
            nextState.hand,
            nextState.boosters
          );
        }
      } else {
        pendingAllClearAfterDestructionRef.current = false;
        pendingOnlyBoostersAfterDestructionRef.current = false;
      }

      gameStateRef.current = nextState;
      setGameState(nextState);
    }

    enqueueChainBoosters(commit.triggerBoosterIds);
    finalizeDestructionEffect(effectId);
  }, [
    audio,
    enqueueChainBoosters,
    finalizeDestructionEffect,
    getDestructionSnapshot,
    isGridEmpty,
    hasOnlyBoostersLeft,
    runWaveBoosterCommit,
    syncDestructionRuntime
  ]);

  commitDestructionEffectRef.current = commitDestructionEffect;

  const processDestructionQueue = useCallback(() => {
    if (destructionQueueRef.current.length === 0) {
      syncDestructionRuntime();
      flushEngineIdleCallbacks();
      return;
    }

    const snapshot = getDestructionSnapshot();
    const startedAt = Date.now();
    const batch = destructionQueueRef.current.splice(0, destructionQueueRef.current.length);

    const activeBoosterIds = new Set(
      Array.from(activeDestructionEffectsRef.current.values())
        .map((effect) => effect.boosterId)
        .filter((id): id is string => Boolean(id))
    );

    let hasStartedAny = false;
    for (const request of batch) {
      if (request.kind === 'booster' && request.boosterId && activeBoosterIds.has(request.boosterId)) {
        continue;
      }

      const effect = createActiveEffect(request, snapshot, startedAt);
      if (!effect) continue;

      activeDestructionEffectsRef.current.set(effect.effectId, effect);
      if (effect.boosterId) {
        activeBoosterIds.add(effect.boosterId);
      }

      if (effect.request.kind === 'booster' && effect.boosterType === 'color_ball') {
        audio.play('superballCharge', undefined, 0.8);
      } else if (effect.request.kind === 'booster' && !isWaveBoosterType(effect.boosterType)) {
        audio.play('activateBooster', 0.15);
      }

      const timeoutMs = Math.max(0, effect.commitAt - Date.now());
      const timerId = window.setTimeout(() => {
        commitDestructionEffectRef.current(effect.effectId);
      }, timeoutMs);
      destructionCommitTimersRef.current.set(effect.effectId, timerId);
      hasStartedAny = true;
    }

    if (!hasStartedAny && destructionQueueRef.current.length > 0) {
      processDestructionQueueRef.current();
      return;
    }

    syncDestructionRuntime();
    flushEngineIdleCallbacks();
  }, [audio, flushEngineIdleCallbacks, getDestructionSnapshot, syncDestructionRuntime]);

  processDestructionQueueRef.current = processDestructionQueue;

  const dispatchDestructionRequest = useCallback((
    requestInput: Omit<DestructionRequest, 'requestId' | 'requestedAt'>
  ) => {
    destructionQueueRef.current.push(createDestructionRequest(requestInput));
    syncDestructionRuntime();
    processDestructionQueueRef.current();
  }, [syncDestructionRuntime]);

  useEffect(() => {
    return () => {
      destructionCommitTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      destructionCommitTimersRef.current.clear();
      destructionWaveTimersRef.current.forEach((timerIds) => {
        timerIds.forEach((timerId) => window.clearTimeout(timerId));
      });
      destructionWaveTimersRef.current.clear();
      activeDestructionEffectsRef.current.clear();
      destructionQueueRef.current = [];
      engineIdleCallbacksRef.current = [];
      pendingAllClearAfterDestructionRef.current = false;
      pendingOnlyBoostersAfterDestructionRef.current = false;
    };
  }, []);

  useEffect(() => {
    const telegraphEffects = destructionRuntime.activeEffects
      .filter((effect) => effect.phase === 'telegraph');
    const snapshot = getDestructionSnapshot();

    const nonSuperballEffect = telegraphEffects.find((effect) => effect.boosterType !== 'color_ball');
    if (nonSuperballEffect) {
      const visualTargets = resolveEffectVisualTargets(nonSuperballEffect, snapshot);
      setAffectedCells(toCellKeys(visualTargets));
      setAffectedColor(getBoosterPreviewColor(nonSuperballEffect.boosterType));
    } else {
      setAffectedCells(new Set());
      setAffectedColor('transparent');
    }

    const nextSuperballAnimations: SuperballAnimationState[] = [];
    telegraphEffects
      .filter((effect) => effect.boosterType === 'color_ball' && effect.boosterId)
      .forEach((effect) => {
        const booster = snapshot.boosters.find((entry) => entry.id === effect.boosterId);
        if (!booster) return;

        const visualTargets = resolveEffectVisualTargets(effect, snapshot);
        nextSuperballAnimations.push({
          booster,
          affectedCells: toCellKeys(visualTargets),
          phase: 'buildup'
        });
      });

    setSuperballAnimations(nextSuperballAnimations);
  }, [destructionRuntime.activeEffects, gameState.grid, gameState.boosters, getDestructionSnapshot]);

  const dispatchCelebrationBoostersStaggered = (boosterIds: string[]) => {
    boosterIds.forEach((boosterId, index) => {
      window.setTimeout(() => {
        const boosterExists = gameStateRef.current.boosters.some((booster) => booster.id === boosterId);
        if (!boosterExists) return;

        dispatchDestructionRequest({
          kind: 'booster',
          source: 'celebration',
          boosterId
        });
      }, index * CELEBRATION_BOOSTER_STAGGER_MS);
    });
  };

  // Chain explosion celebration when level is complete
  const startCelebration = () => {
    if (celebrating || showLevelPopup) return;

    setCelebrating(true);
    audio.play('levelComplete');

    const startRemainingBlocksPhase = () => {
      explodeRemainingBlocks();
    };

    onDestructionEngineIdle(() => {
      const boosterIds = [...gameStateRef.current.boosters]
        .sort((a, b) => (a.y - b.y) || (a.x - b.x))
        .map((booster) => booster.id);

      if (boosterIds.length === 0) {
        startRemainingBlocksPhase();
        return;
      }

      dispatchCelebrationBoostersStaggered(boosterIds);

      const waitForAllBoostersDispatchMs = boosterIds.length * CELEBRATION_BOOSTER_STAGGER_MS;
      window.setTimeout(() => {
        onDestructionEngineIdle(startRemainingBlocksPhase);
      }, waitForAllBoostersDispatchMs);
    });
  };

  // Phase 2: Explode remaining blocks one by one
  const explodeRemainingBlocks = () => {
    setGameState(prev => {
      const blocks: { x: number; y: number; color: string; id: string }[] = [];
      prev.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell) {
            blocks.push({ x, y, color: cell.color, id: cell.id });
          }
        });
      });

      // Shuffle blocks for random explosion order
      const shuffled = blocks.sort(() => Math.random() - 0.5);

      if (shuffled.length === 0) {
        // No blocks left, show popup after the same calm-down delay used by all-clear.
        setTimeout(() => {
          setCelebrating(false);
          setShowLevelPopup(true);
        }, POST_DESTRUCTION_ALL_CLEAR_DELAY_MS);
        return prev;
      }

      // Explode each block one by one
      const delay = 60;
      shuffled.forEach((block, index) => {
        setTimeout(() => {
          // Play sound every 3-4 blocks for popcorn effect
          if (index % 3 === 0 || index % 7 === 0) audio.play('match');
          if (boardRef.current) {
            const metrics = getCellMetrics(block.x, block.y);
            if (metrics) {
              spawnParticles(metrics.centerX, metrics.centerY, block.color, 8);
            }
          }

          setGameState(p => {
            const newGrid = p.grid.map(row => [...row]);
            newGrid[block.y][block.x] = null;
            return { ...p, grid: newGrid, score: p.score + 5 };
          });

          if (index % 3 === 0) triggerShake();

          if (index === shuffled.length - 1) {
            setTimeout(() => {
              setCelebrating(false);
              setShowLevelPopup(true);
            }, POST_DESTRUCTION_ALL_CLEAR_DELAY_MS);
          }
        }, index * delay);
      });

      return prev;
    });
  };

  const handleRestart = () => {
    const initialLevel = 1;
    const levelConfig = getLevelConfig(initialLevel);
    const initialBoosters = createLevelOneTestBoosters();
    const baseInitialGrid = removeTilesAtPoints(
      createRandomGrid(levelConfig.gridFill, initialLevel),
      initialBoosters.map(booster => ({ x: booster.x, y: booster.y }))
    );
    const initialGrid = seedLevelOneInitialSixMatch(baseInitialGrid, initialLevel, initialBoosters);
    setGameState({
      grid: initialGrid,
      boosters: initialBoosters,
      score: 0,
      highScore: Number(localStorage.getItem('highScore')) || 0,
      moves: 20,
      hand: generateValidHand(initialGrid, initialLevel),
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1,
      level: initialLevel,
      objectives: initializeObjectives(initialLevel),
      levelComplete: false
    });
    setParticles([]);
    setExplosionSprites([]);
    setFloatingTexts([]);
    setCelebrating(false);
    setShowLevelPopup(false);
    setShowAllClear(false);
    setShowOutOfMovesPopup(false);
    setTrashUses(1);
    setShuffleUses(3);
    setDeleteBlockUses(3);
    setWildcardUses(3);
    destructionQueueRef.current = [];
    activeDestructionEffectsRef.current.clear();
    destructionCommitTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    destructionCommitTimersRef.current.clear();
    destructionWaveTimersRef.current.forEach((timerIds) => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
    });
    destructionWaveTimersRef.current.clear();
    engineIdleCallbacksRef.current = [];
    pendingAllClearAfterDestructionRef.current = false;
    pendingOnlyBoostersAfterDestructionRef.current = false;
    syncDestructionRuntime();
    queueLevelIntro(initialGrid, initialBoosters, 650);
  };

  const handleNextLevel = () => {
    const nextLevel = gameState.level + 1;
    const levelConfig = getLevelConfig(nextLevel);
    const newGrid = createRandomGrid(levelConfig.gridFill, nextLevel);
    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      boosters: [],
      moves: 20,
      hand: generateValidHand(newGrid, nextLevel),
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1,
      level: nextLevel,
      objectives: initializeObjectives(nextLevel),
      levelComplete: false
    }));
    setParticles([]);
    setExplosionSprites([]);
    setFloatingTexts([]);
    setCelebrating(false);
    setShowLevelPopup(false);
    setShowAllClear(false);
    setShowOutOfMovesPopup(false);
    setTrashUses(1);
    setShuffleUses(3);
    setDeleteBlockUses(3);
    setWildcardUses(3);
    destructionQueueRef.current = [];
    activeDestructionEffectsRef.current.clear();
    destructionCommitTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    destructionCommitTimersRef.current.clear();
    destructionWaveTimersRef.current.forEach((timerIds) => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
    });
    destructionWaveTimersRef.current.clear();
    engineIdleCallbacksRef.current = [];
    pendingAllClearAfterDestructionRef.current = false;
    pendingOnlyBoostersAfterDestructionRef.current = false;
    syncDestructionRuntime();
    queueLevelIntro(newGrid, [], 650);
  };

  // Handle deleting a single block from the board
  const handleDeleteBlock = (x: number, y: number) => {
    const tile = gameState.grid[y][x];
    if (!tile) return;

    setDeleteBlockMode(false);
    setDeleteBlockUses(prev => prev - 1);

    dispatchDestructionRequest({
      kind: 'direct',
      source: 'target',
      tileIds: [tile.id],
      scorePerTile: 15
    });
  };

  // Handle wildcard: change block color to create the best possible match
  const handleWildcard = (x: number, y: number) => {
    const tile = gameState.grid[y][x];
    if (!tile) return;

    setWildcardMode(false);
    setWildcardUses(prev => prev - 1);

    const levelColors = getColorsForLevel(gameState.level);
    let bestColor = tile.color;
    let bestMatchSize = 0;

    // Try each color and find which creates the largest match
    for (const testColor of levelColors) {
      if (testColor === tile.color) continue;

      // Create a test grid with the new color
      const testGrid = gameState.grid.map(row => [...row]);
      testGrid[y][x] = { ...tile, color: testColor };

      // Find matches in the test grid
      const matches = findMatchGroups(testGrid);

      // Count tiles in matches that include this cell
      let matchSize = 0;
      for (const group of matches) {
        if (group.some(p => p.x === x && p.y === y)) {
          matchSize += group.length;
        }
      }

      if (matchSize > bestMatchSize) {
        bestMatchSize = matchSize;
        bestColor = testColor;
      }
    }

    // If no match found, just pick a random different color
    if (bestMatchSize === 0) {
      const otherColors = levelColors.filter(c => c !== tile.color);
      bestColor = otherColors[Math.floor(Math.random() * otherColors.length)];
    }

    audio.play('createBooster');

    const recoloredGrid = gameState.grid.map(row => [...row]);
    recoloredGrid[y][x] = { ...tile, color: bestColor };

    setGameState(prev => ({ ...prev, grid: recoloredGrid }));
    gameStateRef.current = { ...gameStateRef.current, grid: recoloredGrid };

    const matchGroups = findMatchGroups(recoloredGrid);
    if (matchGroups.length === 0) return;

    const matchingIds = new Set<string>();
    matchGroups.forEach(group => {
      group.forEach(point => {
        const cell = recoloredGrid[point.y][point.x];
        if (cell) matchingIds.add(cell.id);
      });
    });

    if (matchingIds.size === 0) return;

    dispatchDestructionRequest({
      kind: 'direct',
      source: 'wildcard',
      tileIds: Array.from(matchingIds),
      scorePerTile: 15
    });
  };

  // Handle clicking on a booster to activate it
  const activateBooster = (booster: Booster) => {
    if (isGameplayInputLocked) return;
    if (celebrating || showLevelPopup || showAllClear || gameState.gameOver) return;
    dispatchDestructionRequest({
      kind: 'booster',
      source: 'click',
      boosterId: booster.id
    });
  };

  // Execute trash - refresh all 3 pieces with shake + explode animation
  const canPieceFitWithBoosters = (
    grid: GameState['grid'],
    piece: PieceData,
    boosters: Booster[]
  ): boolean => {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (canPlacePiece(grid, piece, x, y, boosters)) return true;
      }
    }
    return false;
  };

  const canPieceCreateExternalMatchWithBoosters = (
    grid: GameState['grid'],
    piece: PieceData,
    boosters: Booster[]
  ): boolean => {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!canPlacePiece(grid, piece, x, y, boosters)) continue;

        const testGrid = grid.map(row => [...row]);
        const placedKeys = new Set<string>();
        piece.shape.forEach((point, index) => {
          const tx = x + point.x;
          const ty = y + point.y;
          placedKeys.add(`${tx},${ty}`);
          testGrid[ty][tx] = {
            color: piece.colors[index],
            id: `trash-test-${index}`
          };
        });

        const groups = findMatchGroups(testGrid);
        const createsExternalMatch = groups.some((group) => {
          let hasPlacedTile = false;
          let hasPreexistingTile = false;

          for (const point of group) {
            const key = `${point.x},${point.y}`;
            if (placedKeys.has(key)) {
              hasPlacedTile = true;
            } else if (grid[point.y][point.x] !== null) {
              hasPreexistingTile = true;
            }

            if (hasPlacedTile && hasPreexistingTile) {
              return true;
            }
          }

          return false;
        });

        if (createsExternalMatch) {
          return true;
        }
      }
    }
    return false;
  };

  const generateTrashMatchReadyHand = (
    grid: GameState['grid'],
    level: number,
    boosters: Booster[]
  ): PieceData[] => {
    const hand: PieceData[] = [];
    const usedShapeSignatures = new Set<string>();
    let attempts = 0;
    const maxAttempts = 520;

    while (hand.length < 3 && attempts < maxAttempts) {
      const candidate = generatePiece(grid, level, { excludedShapeSignatures: usedShapeSignatures });
      if (canPieceCreateExternalMatchWithBoosters(grid, candidate, boosters)) {
        hand.push(candidate);
        usedShapeSignatures.add(getPieceShapeSignature(candidate));
      }
      attempts++;
    }

    // Fallback only if current board state makes strict generation infeasible.
    while (hand.length < 3) {
      const fallback = generatePiece(grid, level, { excludedShapeSignatures: usedShapeSignatures });
      if (canPieceFitWithBoosters(grid, fallback, boosters)) {
        hand.push(fallback);
        usedShapeSignatures.add(getPieceShapeSignature(fallback));
      } else {
        break;
      }
    }

    return hand.length === 3 ? hand : generateValidHand(grid, level);
  };

  const handInteractionState = useMemo(() => (
    gameState.hand.map((piece) => {
      if (!piece) {
        return {
          canFit: false,
          canCreateExternalMatch: false,
          isBlocked: false
        };
      }

      const canFit = canPieceFitWithBoosters(gameState.grid, piece, gameState.boosters);
      const canCreateExternalMatch = canPieceCreateExternalMatchWithBoosters(gameState.grid, piece, gameState.boosters);
      return {
        canFit,
        canCreateExternalMatch,
        isBlocked: !canCreateExternalMatch && !canFit
      };
    })
  ), [gameState.boosters, gameState.grid, gameState.hand]);

  const executeTrash = () => {
    // Start shake animation for all pieces
    setTrashingAllPieces(true);
    audio.play('trash');

    // After 800ms, explode all and replace with new pieces
    setTimeout(() => {
      // Spawn explosion particles for each piece
      gameState.hand.forEach((piece, index) => {
        if (piece) {
          const pieceEl = pieceRefs.current[index];
          if (pieceEl) {
            const rect = pieceEl.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Spawn particles for each color in the piece
            piece.colors.forEach((color) => {
              const offsetX = (Math.random() - 0.5) * rect.width * 0.5;
              const offsetY = (Math.random() - 0.5) * rect.height * 0.5;
              spawnParticles(centerX + offsetX, centerY + offsetY, color, 8);
            });
          }
        }
      });

      setTrashingAllPieces(false);

      // Replace all pieces with new hand
      setGameState(prev => ({
        ...prev,
        hand: generateTrashMatchReadyHand(prev.grid, prev.level, prev.boosters),
        selectedPieceIndex: null
      }));
    }, 800); // Shake for 800ms then explode
  };

  // Activate trash powerup
  const activateTrash = () => {
    if (isGameplayInputLocked) return;
    if (trashUses > 0) {
      setTrashUses(prev => prev - 1);
      executeTrash();
    } else {
      // Show ad popup
      setShowAdPopup(true);
    }
  };

  // Handle watching ad
  const handleWatchAd = () => {
    setWatchingAd(true);
    // Simulate watching an ad (in real app, this would show actual ad)
    setTimeout(() => {
      executeTrash();
      setShowAdPopup(false);
      setWatchingAd(false);
    }, 1500); // Simulate 1.5s ad
  };

  const handleCancelAd = () => {
    setShowAdPopup(false);
  };

  // Handle out of moves popup
  const handleWatchMovesAd = () => {
    setWatchingMovesAd(true);
    // Simulate watching an ad
    setTimeout(() => {
      setGameState(prev => ({ ...prev, moves: 5 })); // Give 5 more moves
      setShowOutOfMovesPopup(false);
      setWatchingMovesAd(false);
    }, 1500);
  };

  const handleGameOverFromMoves = () => {
    setShowOutOfMovesPopup(false);
    audio.play('gameOver');
    setGameState(prev => ({ ...prev, gameOver: true }));
  };

  // Trigger animation for incoming blocks flying from edges (reuses shuffle animation system)
  const triggerIncomingBlockAnimation = useCallback((
    addedBlocks: AddedBlock[],
    options: {
      durationMs?: number;
      playSound?: boolean;
      incomingBoosters?: Booster[];
      onComplete?: () => void;
    } = {}
  ): boolean => {
    if (!boardRef.current) return false;
    if (options.playSound !== false) {
      playAudio('blocksIncoming');
    }

    const gridElement = boardRef.current.querySelector('.board-grid');
    if (!gridElement) return false;
    const gridRect = gridElement.getBoundingClientRect();

    const cellElements = gridElement.children;
    const cellPositions: { x: number; y: number; width: number }[] = [];

    for (let i = 0; i < cellElements.length; i++) {
      const cellRect = cellElements[i].getBoundingClientRect();
      cellPositions.push({
        x: cellRect.left - gridRect.left,
        y: cellRect.top - gridRect.top,
        width: cellRect.width
      });
    }

    const boardWidth = gridRect.width;
    const boardHeight = gridRect.height;

    // Create animations for each added block
    const tileAnimations = addedBlocks.map((block) => {
      const cellIndex = block.y * GRID_SIZE + block.x;
      const targetPos = cellPositions[cellIndex];
      if (!targetPos) return null;

      // Determine which edge to fly from based on position
      const edges = ['top', 'bottom', 'left', 'right'];
      let edge: string;

      if (block.y <= 2) edge = 'top';
      else if (block.y >= GRID_SIZE - 3) edge = 'bottom';
      else if (block.x <= 2) edge = 'left';
      else if (block.x >= GRID_SIZE - 3) edge = 'right';
      else edge = edges[Math.floor(Math.random() * edges.length)];

      // Calculate starting position outside the board
      let fromX: number, fromY: number;

      switch (edge) {
        case 'top':
          fromX = targetPos.x + (Math.random() - 0.5) * 100;
          fromY = -targetPos.width - 50;
          break;
        case 'bottom':
          fromX = targetPos.x + (Math.random() - 0.5) * 100;
          fromY = boardHeight + 50;
          break;
        case 'left':
          fromX = -targetPos.width - 50;
          fromY = targetPos.y + (Math.random() - 0.5) * 100;
          break;
        case 'right':
        default:
          fromX = boardWidth + 50;
          fromY = targetPos.y + (Math.random() - 0.5) * 100;
          break;
      }

      return {
        tile: { color: block.color, id: block.id },
        fromPx: { x: fromX, y: fromY },
        toPx: { x: targetPos.x, y: targetPos.y },
        progress: 0,
        cellSize: targetPos.width,
        isBooster: false as const
      };
    }).filter((a): a is NonNullable<typeof a> => a !== null);

    const incomingBoosters = options.incomingBoosters ?? [];
    const boosterAnimations = incomingBoosters.map((booster) => {
      const cellIndex = booster.y * GRID_SIZE + booster.x;
      const targetPos = cellPositions[cellIndex];
      if (!targetPos) return null;

      const edges = ['top', 'bottom', 'left', 'right'] as const;
      const edge = edges[Math.floor(Math.random() * edges.length)];
      let fromX: number;
      let fromY: number;

      switch (edge) {
        case 'top':
          fromX = targetPos.x + (Math.random() - 0.5) * 100;
          fromY = -targetPos.width - 50;
          break;
        case 'bottom':
          fromX = targetPos.x + (Math.random() - 0.5) * 100;
          fromY = boardHeight + 50;
          break;
        case 'left':
          fromX = -targetPos.width - 50;
          fromY = targetPos.y + (Math.random() - 0.5) * 100;
          break;
        case 'right':
        default:
          fromX = boardWidth + 50;
          fromY = targetPos.y + (Math.random() - 0.5) * 100;
          break;
      }

      return {
        tile: { color: booster.color, id: booster.id },
        fromPx: { x: fromX, y: fromY },
        toPx: { x: targetPos.x, y: targetPos.y },
        progress: 0,
        cellSize: targetPos.width,
        isBooster: true as const,
        boosterType: booster.type
      };
    }).filter((a): a is NonNullable<typeof a> => a !== null);

    const animations = [...tileAnimations, ...boosterAnimations];

    if (animations.length === 0) {
      options.onComplete?.();
      return false;
    }

    // Use the same animation system as shuffle
    setShuffleAnimations(animations);

    // Animate with requestAnimationFrame
    const animationDuration = Math.max(1, options.durationMs ?? 600); // ms
    const startTime = Date.now();

    const animateFrame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Ease out cubic for smooth landing
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setShuffleAnimations(prev => prev.map(a => ({ ...a, progress: easedProgress })));

      if (progress < 1) {
        requestAnimationFrame(animateFrame);
      } else {
        // Animation complete - clear animations
        setShuffleAnimations([]);
        options.onComplete?.();
      }
    };

    requestAnimationFrame(animateFrame);
    return true;
  }, [playAudio]);

  // Run queued spawn animations right after grid commit, before paint.
  // This prevents a frame where spawned tiles appear statically first.
  useLayoutEffect(() => {
    const pending = pendingIncomingBlocksRef.current;
    if (!pending || pending.length === 0) return;
    pendingIncomingBlocksRef.current = null;
    triggerIncomingBlockAnimation(pending);
  }, [gameState.grid, triggerIncomingBlockAnimation]);

  // Run queued ALL CLEAR intro right after grid commit and before paint.
  useLayoutEffect(() => {
    const pending = pendingAllClearIntroRef.current;
    if (!pending) return;
    pendingAllClearIntroRef.current = null;
    queueLevelIntro(pending.grid, pending.boosters, pending.minLoadingMs, {
      showLoadingOverlay: pending.showLoadingOverlay
    });
  }, [gameState.grid, queueLevelIntro]);

  const waitForBoardGridReady = useCallback(async (maxFrames = 24): Promise<void> => {
    for (let frame = 0; frame < maxFrames; frame++) {
      const board = boardRef.current;
      const grid = board?.querySelector('.board-grid');
      if (grid && grid.children.length >= GRID_SIZE * GRID_SIZE) return;

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  }, []);

  // Execute queued level intro: keep loading screen visible, then show empty board + flying tiles.
  useEffect(() => {
    if (!theme.isReady || !isCriticalAssetsReady || !introRequest) return;

    let cancelled = false;
    let unlockTimeoutId: number | null = null;
    const { id, blocks, boosters, minLoadingMs } = introRequest;

    const runIntro = async () => {
      const startedAt = performance.now();
      await waitForBoardGridReady();

      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, minLoadingMs - elapsed);
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, remaining);
        });
      }

      if (cancelled || introRequestIdRef.current !== id) return;

      const hasIncomingElements = blocks.length > 0 || boosters.length > 0;

      flushSync(() => {
        setIsIntroArrivalActive(hasIncomingElements);
        setShowLoadingScreen(false);
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 250);
      });

      if (cancelled || introRequestIdRef.current !== id) return;

      let unlocked = false;
      const unlockGameplay = () => {
        if (cancelled || introRequestIdRef.current !== id || unlocked) return;
        unlocked = true;
        if (unlockTimeoutId !== null) {
          window.clearTimeout(unlockTimeoutId);
          unlockTimeoutId = null;
        }
        setIsIntroArrivalActive(false);
        setIsInteractionLocked(false);
        setIntroRequest(prev => (prev?.id === id ? null : prev));
      };

      unlockTimeoutId = window.setTimeout(() => {
        unlockGameplay();
      }, 1500);

      const started = triggerIncomingBlockAnimation(blocks, {
        durationMs: 680,
        playSound: hasIncomingElements,
        incomingBoosters: boosters,
        onComplete: unlockGameplay
      });

      if (!started || !hasIncomingElements) {
        setIsIntroArrivalActive(false);
        unlockGameplay();
      }
    };

    runIntro();

    return () => {
      cancelled = true;
      if (unlockTimeoutId !== null) {
        window.clearTimeout(unlockTimeoutId);
      }
    };
  }, [
    introRequest,
    isCriticalAssetsReady,
    theme.isReady,
    triggerIncomingBlockAnimation,
    waitForBoardGridReady
  ]);

  // Handle shuffle powerup
  const activateShuffle = () => {
    if (isGameplayInputLocked) return;
    if (shuffleUses <= 0 || shufflePhase || !boardRef.current) return;
    setShuffleUses(prev => prev - 1);

    // Read cell positions BEFORE any transforms are applied
    const gridElement = boardRef.current.querySelector('.board-grid');
    if (!gridElement) return;
    const gridRect = gridElement.getBoundingClientRect();

    const cellElements = gridElement.children;
    const cellPositions: { x: number; y: number; width: number }[] = [];

    for (let i = 0; i < cellElements.length; i++) {
      const cellRect = cellElements[i].getBoundingClientRect();
      cellPositions.push({
        x: cellRect.left - gridRect.left,
        y: cellRect.top - gridRect.top,
        width: cellRect.width
      });
    }

    // Start shuffle animation sequence
    setShufflePhase('darkening');

    setTimeout(() => {
      setShufflePhase('levitating');

      setTimeout(() => {
        // Calculate and start the shuffle animation with pre-captured positions
        audio.play('blocksIncoming');
        performShuffle(cellPositions);
        setShufflePhase('scrambling');
      }, 400);
    }, 300);
  };

  // Perform the shuffle using pre-captured cell positions (before transforms)
  const performShuffle = (cellPositions: { x: number; y: number; width: number }[]) => {
    const { grid, boosters } = gameState;

    // Collect all tiles with their original positions
    const originalTiles: { tile: { color: Color; id: string }; gridX: number; gridY: number; pxPos: { x: number; y: number }; cellSize: number }[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x]) {
          const cellIndex = y * GRID_SIZE + x;
          const pos = cellPositions[cellIndex];
          originalTiles.push({
            tile: { color: grid[y][x]!.color, id: grid[y][x]!.id },
            gridX: x,
            gridY: y,
            pxPos: { x: pos.x, y: pos.y },
            cellSize: pos.width
          });
        }
      }
    }

    // Collect all boosters with their original positions
    const originalBoosters: { booster: Booster; pxPos: { x: number; y: number }; cellSize: number }[] = [];
    boosters.forEach(b => {
      const cellIndex = b.y * GRID_SIZE + b.x;
      const pos = cellPositions[cellIndex];
      originalBoosters.push({
        booster: { ...b },
        pxPos: { x: pos.x, y: pos.y },
        cellSize: pos.width
      });
    });

    const totalItems = originalTiles.length + originalBoosters.length;
    if (totalItems < 2) return;

    // Get ALL available positions (entire grid)
    const allAvailablePositions: { x: number; y: number }[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        allAvailablePositions.push({ x, y });
      }
    }

    // Try shuffling until we get 1-3 matches (max 50 attempts)
    let shuffledTilePositions: { x: number; y: number }[] = [];
    let shuffledBoosterPositions: { x: number; y: number }[] = [];
    let matchCount = 0;
    let attempts = 0;

    do {
      // Shuffle ALL available positions
      const shuffledPositions = [...allAvailablePositions].sort(() => Math.random() - 0.5);

      // First N positions go to boosters, rest go to tiles
      shuffledBoosterPositions = shuffledPositions.slice(0, originalBoosters.length);
      shuffledTilePositions = shuffledPositions.slice(originalBoosters.length, originalBoosters.length + originalTiles.length);

      // Create test grid to check matches (only tiles matter for matches)
      const testGrid: (typeof grid[0][0])[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
      originalTiles.forEach((t, i) => {
        const newPos = shuffledTilePositions[i];
        testGrid[newPos.y][newPos.x] = { color: t.tile.color, id: t.tile.id };
      });

      const matches = findMatchGroups(testGrid);
      matchCount = matches.length;
      attempts++;
    } while ((matchCount < 1 || matchCount > 3) && attempts < 50);

    // If no matches found after 50 attempts, try to cluster tiles or force a match
    if (matchCount === 0) {
      // Group tiles by color
      const colorGroups: Map<Color, number[]> = new Map();
      originalTiles.forEach((t, i) => {
        const color = t.tile.color;
        if (!colorGroups.has(color)) colorGroups.set(color, []);
        colorGroups.get(color)!.push(i);
      });

      // Find the color with most tiles
      let bestColor: Color | null = null;
      let bestIndices: number[] = [];
      for (const [color, indices] of colorGroups) {
        if (indices.length > bestIndices.length) {
          bestColor = color;
          bestIndices = indices;
        }
      }

      // Create set of booster positions to avoid
      const boosterPosSet = new Set(shuffledBoosterPositions.map(p => `${p.x},${p.y}`));

      // Try to cluster tiles of the same color together
      if (bestColor && bestIndices.length >= 2) {
        // Find a good center position (middle of the grid)
        const centerX = Math.floor(GRID_SIZE / 2);
        const centerY = Math.floor(GRID_SIZE / 2);

        // Get positions near center, sorted by distance (excluding booster positions)
        const positionsByDistance = allAvailablePositions
          .filter(p => !boosterPosSet.has(`${p.x},${p.y}`))
          .map(p => ({ ...p, dist: Math.abs(p.x - centerX) + Math.abs(p.y - centerY) }))
          .sort((a, b) => a.dist - b.dist);

        // If we have 3+ of same color, place them adjacent for a match
        if (bestIndices.length >= 3) {
          // Find 3 adjacent positions near center
          let foundMatch = false;
          for (const startPos of positionsByDistance) {
            const directions = [
              [{ x: startPos.x, y: startPos.y }, { x: startPos.x + 1, y: startPos.y }, { x: startPos.x + 2, y: startPos.y }],
              [{ x: startPos.x, y: startPos.y }, { x: startPos.x, y: startPos.y + 1 }, { x: startPos.x, y: startPos.y + 2 }],
              [{ x: startPos.x, y: startPos.y }, { x: startPos.x + 1, y: startPos.y }, { x: startPos.x, y: startPos.y + 1 }],
            ];

            for (const positions of directions) {
              const allValid = positions.every(p =>
                p.x >= 0 && p.x < GRID_SIZE && p.y >= 0 && p.y < GRID_SIZE &&
                !boosterPosSet.has(`${p.x},${p.y}`)
              );

              if (allValid) {
                // Place the 3 same-color tiles at these positions
                const usedPositions = new Set<string>();
                for (let i = 0; i < 3; i++) {
                  shuffledTilePositions[bestIndices[i]] = positions[i];
                  usedPositions.add(`${positions[i].x},${positions[i].y}`);
                }

                // Redistribute other tiles to remaining positions
                const remainingPositions = allAvailablePositions
                  .filter(p => !usedPositions.has(`${p.x},${p.y}`) && !boosterPosSet.has(`${p.x},${p.y}`))
                  .sort(() => Math.random() - 0.5);

                let posIdx = 0;
                for (let i = 0; i < originalTiles.length; i++) {
                  if (!bestIndices.slice(0, 3).includes(i)) {
                    shuffledTilePositions[i] = remainingPositions[posIdx++];
                  }
                }
                foundMatch = true;
                break;
              }
            }
            if (foundMatch) break;
          }
        } else {
          // Less than 3 of any color - just cluster all tiles near center
          for (let i = 0; i < originalTiles.length; i++) {
            shuffledTilePositions[i] = positionsByDistance[i];
          }
        }
      }
    }

    // Create animation data with PIXEL positions read from DOM (tiles)
    const tileAnimations = originalTiles.map((t, i) => {
      const targetGridPos = shuffledTilePositions[i];
      const targetCellIndex = targetGridPos.y * GRID_SIZE + targetGridPos.x;
      const targetPxPos = cellPositions[targetCellIndex];

      return {
        tile: t.tile,
        fromPx: t.pxPos,
        toPx: { x: targetPxPos.x, y: targetPxPos.y },
        progress: 0,
        cellSize: t.cellSize,
        isBooster: false as const
      };
    });

    // Create animation data for boosters
    const boosterAnimations = originalBoosters.map((b, i) => {
      const targetGridPos = shuffledBoosterPositions[i];
      const targetCellIndex = targetGridPos.y * GRID_SIZE + targetGridPos.x;
      const targetPxPos = cellPositions[targetCellIndex];

      return {
        tile: { color: b.booster.color, id: b.booster.id },
        fromPx: b.pxPos,
        toPx: { x: targetPxPos.x, y: targetPxPos.y },
        progress: 0,
        cellSize: b.cellSize,
        isBooster: true as const,
        boosterType: b.booster.type
      };
    });

    const animations = [...tileAnimations, ...boosterAnimations];
    setShuffleAnimations(animations);

    // Start animation loop
    const animationDuration = 800; // ms
    const startTime = Date.now();

    const animateFrame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Ease out cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setShuffleAnimations(prev => prev.map(a => ({ ...a, progress: easedProgress })));

      if (progress < 1) {
        requestAnimationFrame(animateFrame);
      } else {
        // Animation complete - update grid and boosters, then transition to landing
        const newGrid: (typeof grid[0][0])[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
        originalTiles.forEach((t, i) => {
          const newPos = shuffledTilePositions[i];
          newGrid[newPos.y][newPos.x] = { color: t.tile.color, id: `shuffle-${Date.now()}-${i}` };
        });

        // Update booster positions
        const newBoosters = originalBoosters.map((b, i) => {
          const newPos = shuffledBoosterPositions[i];
          return { ...b.booster, x: newPos.x, y: newPos.y };
        });

        // Update grid and boosters, remove flying tiles and transition to landing
        setGameState(prev => ({ ...prev, grid: newGrid, boosters: newBoosters }));
        setShuffleAnimations([]);
        setShufflePhase('landing');

        // End landing and process matches with the new grid directly
        setTimeout(() => {
          setShufflePhase(null);
          processShuffleMatches(newGrid);
        }, 300);
      }
    };

    requestAnimationFrame(animateFrame);
  };

  // Process matches after shuffle - takes the new grid directly to avoid closure issues
  const processShuffleMatches = (newGrid: (TileData | null)[][]) => {
    const matchGroups = findMatchGroups(newGrid);
    if (matchGroups.length === 0) return;

    // Collect all matched points first, then resolve booster outcome using the same
    // rules as manual placement.
    const matchedPoints: Point[] = [];
    matchGroups.forEach(group => {
      group.forEach(p => {
        if (!matchedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
          matchedPoints.push({ x: p.x, y: p.y });
        }
      });
    });

    const boosterOutcome = resolveMatchBoosterOutcome(newGrid, matchedPoints);
    const pointsToClear = boosterOutcome.pointsToClear
      .map((point) => {
        const tile = newGrid[point.y][point.x];
        if (!tile) return null;
        return { x: point.x, y: point.y, color: tile.color };
      })
      .filter((point): point is { x: number; y: number; color: Color } => Boolean(point));
    const boostersToCreate = boosterOutcome.boostersToCreate;

    const resolvedGrid = newGrid.map(row => [...row]);
    boostersToCreate.forEach((booster) => {
      resolvedGrid[booster.y][booster.x] = null;
    });

    // Calculate score
    const comboMultiplier = 1 + (gameState.combo - 1) * 0.1;
    const totalScore = Math.round(pointsToClear.length * 15 * comboMultiplier);

    // Count colors for objectives
    const colorCounts: Record<string, number> = {};
    pointsToClear.forEach(p => {
      colorCounts[p.color] = (colorCounts[p.color] || 0) + 1;
    });

    // Get matching IDs
    const matchingIds = pointsToClear.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

    // Spawn particles IMMEDIATELY (like piece placement does)
    if (boardRef.current) {
      pointsToClear.forEach(p => {
        const metrics = getCellMetrics(p.x, p.y);
        if (metrics) {
          spawnParticles(metrics.centerX, metrics.centerY, p.color, 6);
        }
      });

      // Floating score text
      if (pointsToClear.length > 0) {
        const avgX = pointsToClear.reduce((acc, p) => acc + p.x, 0) / pointsToClear.length;
        const avgY = pointsToClear.reduce((acc, p) => acc + p.y, 0) / pointsToClear.length;
        const centerMetrics = getBoardCellMetrics(boardRef.current, avgX, avgY);
        spawnFloatingText(centerMetrics.centerX, centerMetrics.centerY, `+${totalScore}`);
      }

      boostersToCreate.forEach((booster) => {
        const metrics = getCellMetrics(booster.x, booster.y);
        if (!metrics) return;
        const boosterText = booster.type === 'color_ball' ? '⚡ SUPERBALL!' :
                           booster.type === 'bomb' ? '💥 BOMB!' :
                           booster.type === 'line_bomb' ? '💣 LINE!' :
                           booster.type === 'rocket_h' ? '🚀 ROCKET!' :
                           booster.type === 'rocket_v' ? '🚀 ROCKET!' : '💣 LINE!';
        spawnFloatingText(metrics.centerX, metrics.centerY - 20, boosterText);
        audio.play('createBooster');
      });
    }

    triggerShake();
    audio.play('match');

    // Update state with clearingTiles for animation
    setGameState(prev => {
      const newObjectives = prev.objectives.map(obj => ({
        ...obj,
        current: Math.min(obj.target, obj.current + (colorCounts[obj.color] || 0))
      }));
      const isLevelComplete = newObjectives.slice(0, 2).every(obj => obj.current >= obj.target);

      return {
        ...prev,
        grid: resolvedGrid,
        boosters: [...prev.boosters, ...boostersToCreate],
        score: prev.score + totalScore,
        clearingTiles: matchingIds,
        objectives: newObjectives,
        levelComplete: isLevelComplete,
        combo: prev.combo + 1
      };
    });

    // Remove tiles after animation
    setTimeout(() => {
      setGameState(prev => {
        const finalGrid = prev.grid.map(row => [...row]);
        pointsToClear.forEach(p => {
          finalGrid[p.y][p.x] = null;
        });

        if (isGridEmpty(finalGrid, prev.boosters)) {
          setTimeout(() => handleAllClear(), 100);
          return { ...prev, grid: finalGrid, clearingTiles: [] };
        }

        // Check if only boosters remain
        if (hasOnlyBoostersLeft(finalGrid, prev.boosters) && !prev.levelComplete) {
          setTimeout(() => handleOnlyBoostersLeft(), 100);
          return { ...prev, grid: finalGrid, clearingTiles: [] };
        }

        const lost = !prev.levelComplete && shouldTriggerNoValidMovesGameOver(
          finalGrid,
          prev.hand,
          prev.boosters
        );
        return { ...prev, grid: finalGrid, clearingTiles: [], gameOver: lost };
      });
    }, 400);
  };

  // Auto-resolve matches generated by system actions (level formation/spawn/shuffle)
  // so they don't require an extra user move to trigger.
  useEffect(() => {
    if (isGameplayInputLocked || showLoadingScreen || isIntroArrivalActive || introRequest) return;
    if (gameState.gameOver || gameState.levelComplete) return;
    if (gameState.clearingTiles.length > 0) return;
    if (shuffleAnimations.length > 0 || shufflePhase || superballAnimation) return;
    if (celebrating || showLevelPopup || showAllClear) return;

    const matchGroups = findMatchGroups(gameState.grid);
    if (matchGroups.length === 0) return;

    const frameId = requestAnimationFrame(() => {
      const snapshotGrid = gameState.grid.map(row => [...row]);
      processShuffleMatches(snapshotGrid);
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    celebrating,
    gameState.clearingTiles,
    gameState.gameOver,
    gameState.grid,
    gameState.levelComplete,
    introRequest,
    isGameplayInputLocked,
    isIntroArrivalActive,
    showAllClear,
    showLevelPopup,
    showLoadingScreen,
    shuffleAnimations.length,
    shufflePhase,
    superballAnimation
  ]);

  // Keep game-over state in sync with the real board/hand state.
  // This prevents stale states where no piece fits but game-over is not shown
  // until the next user interaction.
  useEffect(() => {
    if (isGameplayInputLocked || showLoadingScreen || isIntroArrivalActive || introRequest) return;
    if (gameState.gameOver || gameState.levelComplete) return;
    if (gameState.clearingTiles.length > 0) return;
    if (shuffleAnimations.length > 0 || shufflePhase || superballAnimation) return;
    if (celebrating || showLevelPopup || showAllClear || showOutOfMovesPopup) return;

    const noValidPlacements = shouldTriggerNoValidMovesGameOver(
      gameState.grid,
      gameState.hand,
      gameState.boosters
    );
    if (!noValidPlacements) return;

    setGameState(prev => (
      prev.gameOver || prev.levelComplete
        ? prev
        : { ...prev, gameOver: true }
    ));
  }, [
    celebrating,
    gameState.boosters,
    gameState.clearingTiles.length,
    gameState.gameOver,
    gameState.grid,
    gameState.hand,
    gameState.levelComplete,
    introRequest,
    isGameplayInputLocked,
    isIntroArrivalActive,
    showAllClear,
    showLevelPopup,
    showLoadingScreen,
    showOutOfMovesPopup,
    shuffleAnimations.length,
    shufflePhase,
    superballAnimation
  ]);

  const startDragging = (e: React.PointerEvent, index: number) => {
    if (isGameplayInputLocked) return;
    if (gameState.hand[index] === null || gameState.gameOver || celebrating || showLevelPopup || showAllClear || trashingAllPieces) return;
    if (handInteractionState[index]?.isBlocked) return;

    // Calculate cell size based on actual board dimensions
    const placement = getBoardPlacementMetrics();
    if (placement) {
      setDragCellSize(placement.cellSize);
    }

    setGameState(prev => ({ ...prev, selectedPieceIndex: index }));
    setDragPosition({ x: e.clientX, y: e.clientY });
    setDragVelocity({ x: 0, y: 0 });
    lastDragPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    audio.play('selectPiece');

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isGameplayInputLocked) return;
    if (gameState.selectedPieceIndex === null || gameState.gameOver) return;

    // Calculate velocity for jelly effect - use raw delta, more responsive
    if (lastDragPos.current) {
      const dx = e.clientX - lastDragPos.current.x;
      const dy = e.clientY - lastDragPos.current.y;
      // Direct velocity from movement delta
      setDragVelocity({ x: dx, y: dy });
    }
    lastDragPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };

    setDragPosition({ x: e.clientX, y: e.clientY });

    const placement = getBoardPlacementMetrics();
    if (placement) {
      const piece = gameState.hand[gameState.selectedPieceIndex];
      if (!piece) return;

      // Calculate the visual center of the dragged piece
      const visualX = e.clientX;
      const visualY = e.clientY - dragOffsetY;

      // We want the piece's (0,0) tile to be aligned.
      const minX = Math.min(...piece.shape.map(p => p.x));
      const maxX = Math.max(...piece.shape.map(p => p.x));
      const minY = Math.min(...piece.shape.map(p => p.y));
      const maxY = Math.max(...piece.shape.map(p => p.y));

      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      // Target grid coordinates for the anchor (0,0) tile, accounting for padding
      const pitchX = placement.cellSize + placement.gapX;
      const pitchY = placement.cellSize + placement.gapY;
      const x = Math.round((visualX - placement.left) / pitchX - midX - 0.5);
      const y = Math.round((visualY - placement.top) / pitchY - midY - 0.5);

      if (x >= -2 && x < GRID_SIZE && y >= -2 && y < GRID_SIZE) {
        setHoveredCell({ x, y });
      } else {
        setHoveredCell(null);
      }
    }
  };

  const stopDragging = (e: React.PointerEvent) => {
    if (isGameplayInputLocked) return;
    if (gameState.selectedPieceIndex === null) return;

    const pieceIndex = gameState.selectedPieceIndex;
    const piece = gameState.hand[pieceIndex];

    if (hoveredCell && piece && canPlacePiece(gameState.grid, piece, hoveredCell.x, hoveredCell.y, gameState.boosters)) {
      placePieceAt(hoveredCell.x, hoveredCell.y);
      setDragPosition(null);
      setHoveredCell(null);
            setDragVelocity({ x: 0, y: 0 });
      lastDragPos.current = null;
    } else if (piece && dragPosition) {
      // Invalid drop - animate piece returning to box
      audio.play('pieceReturn');
      const pieceBox = pieceRefs.current[pieceIndex];
      if (pieceBox) {
        const boxRect = pieceBox.getBoundingClientRect();
        const targetX = boxRect.left + boxRect.width / 2;
        const targetY = boxRect.top + boxRect.height / 2;

        setReturningPiece({
          piece,
          fromX: dragPosition.x,
          fromY: dragPosition.y - dragOffsetY,
          toX: targetX,
          toY: targetY,
          index: pieceIndex,
          progress: 0
        });
      }
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
      setDragPosition(null);
      setHoveredCell(null);
            setDragVelocity({ x: 0, y: 0 });
      lastDragPos.current = null;
    } else {
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
      setDragPosition(null);
      setHoveredCell(null);
            setDragVelocity({ x: 0, y: 0 });
      lastDragPos.current = null;
    }
  };

  const placePieceAt = (x: number, y: number) => {
    const { selectedPieceIndex, hand, grid, score, combo, level, objectives, boosters } = gameState;
    const piece = hand[selectedPieceIndex!];

    if (piece && canPlacePiece(grid, piece, x, y, gameState.boosters)) {
      // Fade out the box (but not if it's the last piece)
      const remainingPieces = hand.filter((p, i) => p !== null && i !== selectedPieceIndex).length;
      if (remainingPieces > 0) {
        setFadingBoxIndex({ index: selectedPieceIndex!, fading: false });
        requestAnimationFrame(() => {
          setFadingBoxIndex(prev => prev ? { ...prev, fading: true } : null);
        });
        setTimeout(() => setFadingBoxIndex(null), 350);
      }

      let newGrid = grid.map(row => [...row]);
      piece.shape.forEach((point, i) => {
        newGrid[y + point.y][x + point.x] = {
          color: piece.colors[i],
          id: `${Date.now()}-${Math.random()}`
        };
      });

      // Generate a new piece for the used slot immediately
      let newHand = [...hand];
      const excludedShapeSignatures = new Set(
        newHand
          .filter((entry, index): entry is PieceData => Boolean(entry) && index !== selectedPieceIndex)
          .map(entry => getPieceShapeSignature(entry))
      );
      newHand[selectedPieceIndex!] = generatePiece(newGrid, level, { excludedShapeSignatures });
      // Trigger fade-in for the new piece
      setFadingInPieceIndex(selectedPieceIndex);
      requestAnimationFrame(() => setFadingInPieceIndex(null));

      const matchGroups = findMatchGroups(newGrid);

      // Calculate Score & Effects
      if (matchGroups.length > 0) {
        const newCombo = combo + 1;
        audio.playCombo(newCombo);

        // Collect ALL cleared points from ALL match groups
        let allClearedPoints: Point[] = [];
        matchGroups.forEach(group => {
          group.forEach(p => {
            if (!allClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
              allClearedPoints.push(p);
            }
          });
        });

        const boosterOutcome = resolveMatchBoosterOutcome(newGrid, allClearedPoints);
        const boostersToCreate = boosterOutcome.boostersToCreate;
        allClearedPoints = boosterOutcome.pointsToClear;

        const totalCleared = allClearedPoints.length;

        // Count cleared blocks by color for objectives
        const colorCounts: Record<string, number> = {};
        allClearedPoints.forEach(p => {
          const cell = newGrid[p.y][p.x];
          if (cell) {
            colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1;
          }
        });

        // Update objectives
        const newObjectives = objectives.map(obj => ({
          ...obj,
          current: Math.min(obj.target, obj.current + (colorCounts[obj.color] || 0))
        }));

        // Check if level complete
        const isLevelComplete = newObjectives.slice(0, 2).every(obj => obj.current >= obj.target);

        // Calculate score
        const { score: moveScore, text, multiplier } = calculateScore(totalCleared, newCombo);
        const newScore = score + moveScore;
        const matchingIds = allClearedPoints.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

        // Spawn Visuals
        if (boardRef.current) {
          // Particles for cleared blocks
          allClearedPoints.forEach(p => {
            const cell = newGrid[p.y][p.x];
            if (cell) {
              const metrics = getCellMetrics(p.x, p.y);
              if (metrics) {
                spawnParticles(metrics.centerX, metrics.centerY, cell.color, 6);
              }
            }
          });

          // Floating text for score
          if (text && totalCleared > 0) {
            const avgX = allClearedPoints.reduce((acc, p) => acc + p.x, 0) / totalCleared;
            const avgY = allClearedPoints.reduce((acc, p) => acc + p.y, 0) / totalCleared;
            const centerMetrics = getBoardCellMetrics(boardRef.current, avgX, avgY);
            spawnFloatingText(centerMetrics.centerX, centerMetrics.centerY, `${text} x${multiplier}`);
          }

          // Show booster creation text
          boostersToCreate.forEach(booster => {
            const metrics = getCellMetrics(booster.x, booster.y);
            if (!metrics) return;
            const boosterText = booster.type === 'color_ball' ? '⚡ SUPERBALL!' :
                               booster.type === 'bomb' ? '💥 BOMB!' :
                               booster.type === 'line_bomb' ? '💣 LINE!' :
                               booster.type === 'rocket_h' ? '🚀 ROCKET!' :
                               booster.type === 'rocket_v' ? '🚀 ROCKET!' : '💣 LINE!';
            spawnFloatingText(metrics.centerX, metrics.centerY - 20, boosterText);
            audio.play('createBooster');
          });
        }

        // Clear the center cells where boosters will be placed
        boostersToCreate.forEach(booster => {
          newGrid[booster.y][booster.x] = null;
        });

        // Merge new boosters with existing ones
        const newBoosters = [...gameState.boosters, ...boostersToCreate];

        triggerShake();

        const newMoves = gameState.moves - 1;
        const outOfMoves = newMoves <= 0 && !isLevelComplete;

        setGameState(prev => ({
          ...prev,
          grid: newGrid,
          boosters: newBoosters,
          score: newScore,
          moves: newMoves,
          hand: newHand,
          selectedPieceIndex: null,
          clearingTiles: matchingIds,
          combo: newCombo,
          objectives: newObjectives,
          levelComplete: isLevelComplete
        }));

        // Show popup if out of moves
        if (outOfMoves) {
          setTimeout(() => setShowOutOfMovesPopup(true), 500);
        }

        setTimeout(() => {
          setGameState(prev => {
            let finalGrid = prev.grid.map(row =>
              row.map(cell => cell && matchingIds.includes(cell.id) ? null : cell)
            );

            // Find locked tiles adjacent to cleared tiles and unlock them
            const adjacentLockedTiles = getAdjacentToMatches(finalGrid, allClearedPoints);
            if (adjacentLockedTiles.length > 0) {
              adjacentLockedTiles.forEach(p => {
                const tile = finalGrid[p.y][p.x];
                if (tile && tile.locked) {
                  finalGrid[p.y][p.x] = { ...tile, locked: false };
                }
              });

              // Check for new matches after unlocking (chain reaction)
              const processChainReactions = (currentGrid: typeof finalGrid): typeof finalGrid => {
                const newMatchGroups = findMatchGroups(currentGrid);
                if (newMatchGroups.length === 0) return currentGrid;

                // Collect all points to clear
                let chainClearedPoints: Point[] = [];
                newMatchGroups.forEach(group => {
                  group.forEach(p => {
                    if (!chainClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
                      chainClearedPoints.push(p);
                    }
                  });
                });

                // Spawn particles for chain reaction
                if (boardRef.current) {
                  chainClearedPoints.forEach(p => {
                    const cell = currentGrid[p.y][p.x];
                    if (cell) {
                      const metrics = getCellMetrics(p.x, p.y);
                      if (metrics) {
                        spawnParticles(metrics.centerX, metrics.centerY, cell.color, 6);
                      }
                    }
                  });
                }

                // Clear the matched tiles
                let updatedGrid = currentGrid.map(row => [...row]);
                chainClearedPoints.forEach(p => {
                  updatedGrid[p.y][p.x] = null;
                });

                // Unlock adjacent locked tiles for this chain
                const moreLockedTiles = getAdjacentToMatches(updatedGrid, chainClearedPoints);
                moreLockedTiles.forEach(p => {
                  const tile = updatedGrid[p.y][p.x];
                  if (tile && tile.locked) {
                    updatedGrid[p.y][p.x] = { ...tile, locked: false };
                  }
                });

                // Recursively process more chain reactions
                return processChainReactions(updatedGrid);
              };

              finalGrid = processChainReactions(finalGrid);
            }

            // Check for ALL CLEAR
            if (isGridEmpty(finalGrid, prev.boosters)) {
              // Trigger ALL CLEAR after a short delay
              setTimeout(() => handleAllClear(), 100);
              return {
                ...prev,
                grid: finalGrid,
                clearingTiles: []
              };
            }

            // Check if only boosters remain
            if (hasOnlyBoostersLeft(finalGrid, prev.boosters) && !prev.levelComplete) {
              setTimeout(() => handleOnlyBoostersLeft(), 100);
              return { ...prev, grid: finalGrid, clearingTiles: [] };
            }

            const lost = !prev.levelComplete && shouldTriggerNoValidMovesGameOver(
              finalGrid,
              prev.hand,
              prev.boosters
            );
            return {
              ...prev,
              grid: finalGrid,
              clearingTiles: [],
              gameOver: lost
            };
          });
        }, 400);

      } else {
        // No Match - Reset Combo AND add random blocks as penalty
        const newMoves = gameState.moves - 1;
        const outOfMoves = newMoves <= 0;
        // Base score for placing pieces is piece size * 10
        const placementScore = piece.shape.length * 10;

        // Add random blocks when no match is made
        const levelConfig = getLevelConfig(gameState.level);
        const totalCells = GRID_SIZE * GRID_SIZE;
        const targetTiles = Math.floor(totalCells * levelConfig.gridFill);
        const currentTiles = newGrid.flat().filter(cell => cell !== null).length;
        const blocksToAdd = Math.max(1, Math.min(3, targetTiles - currentTiles));
        const boosterPositions = gameState.boosters.map(b => ({ x: b.x, y: b.y }));
        const result = addRandomBlocks(newGrid, blocksToAdd, gameState.level, boosterPositions);
        const gridWithNewBlocks = result.grid;

        // Queue flying animation for new blocks; it will start in a layout effect
        // right after the grid commit to avoid a static flash on spawn.
        if (result.addedBlocks.length > 0) {
          pendingIncomingBlocksRef.current = result.addedBlocks;
        }

        const noValidMoves = shouldTriggerNoValidMovesGameOver(
          gridWithNewBlocks,
          newHand,
          gameState.boosters
        );

        setGameState(prev => ({
          ...prev,
          grid: gridWithNewBlocks,
          score: score + placementScore,
          moves: newMoves,
          hand: newHand,
          selectedPieceIndex: null,
          gameOver: noValidMoves, // Only immediate game over if no valid moves
          combo: 1
        }));

        // Show popup if out of moves (but still have valid moves)
        if (outOfMoves && !noValidMoves) {
          setTimeout(() => setShowOutOfMovesPopup(true), 300);
        }
      }
    } else {
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
    }
  };

  const isGhostCell = (x: number, y: number) => {
    if (gameState.selectedPieceIndex === null || !hoveredCell) return null;
    const piece = gameState.hand[gameState.selectedPieceIndex];
    if (!piece) return null;
    
    const ghostPointIndex = piece.shape.findIndex(p => hoveredCell.x + p.x === x && hoveredCell.y + p.y === y);
    if (ghostPointIndex !== -1) {
      const isValid = canPlacePiece(gameState.grid, piece, hoveredCell.x, hoveredCell.y, gameState.boosters);
      return { color: piece.colors[ghostPointIndex], isValid };
    }
    return null;
  };

  const isEndGameModalVisible = showLevelPopup || (gameState.gameOver && !gameState.levelComplete);
  const clampHeaderValue = (value: number, min: number, max: number) => (
    Math.max(min, Math.min(max, value))
  );
  const headerPanelWidthPx = Math.max(1, responsive.boardPanelWidthPx);
  const headerAspectRatio = Math.max(
    0.0001,
    headerPanelConfig.aspectRatio ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.headerAspectRatio
  );
  const headerPanelHeightPx = headerPanelWidthPx / headerAspectRatio;
  const uiUnit = Math.max(1, responsive.boardCellSize);
  const headerPanelPaddingY = clampHeaderValue(headerPanelHeightPx * 0.16, 3, 18);
  const headerPanelPaddingX = clampHeaderValue(headerPanelWidthPx * 0.035, 8, 28);
  const headerBadgeFontSize = clampHeaderValue(headerPanelHeightPx * 0.3, 10, 24);
  const headerBadgePadX = clampHeaderValue(headerPanelHeightPx * 0.2, 7, 18);
  const headerBadgePadY = clampHeaderValue(headerPanelHeightPx * 0.1, 3, 8);
  const headerMovesValueSize = clampHeaderValue(headerPanelHeightPx * 0.38, 14, 36);
  const headerMovesLabelSize = clampHeaderValue(headerPanelHeightPx * 0.14, 7, 13);
  const headerAudioButtonSize = clampHeaderValue(headerPanelHeightPx * 0.46, 24, 46);
  const headerAudioIconSize = clampHeaderValue(headerAudioButtonSize * 0.44, 11, 20);
  const subheaderActive = appliedLayoutDebugOverrides.subheaderActive;
  const subheaderPaddingOffset = appliedLayoutDebugOverrides.subheaderPaddingOffset;
  const subheaderContainerOpacity = appliedLayoutDebugOverrides.subheaderContainerOpacity;
  const subheaderShowContent = appliedLayoutDebugOverrides.subheaderShowContent;
  const subheaderAspectRatio = Math.max(
    0.0001,
    subheaderPanelConfig.aspectRatio ?? DEFAULT_LAYOUT_DEBUG_OVERRIDES.subheaderAspectRatio
  );
  const subheaderPanelWidthPx = headerPanelWidthPx;
  const subheaderPanelHeightPx = subheaderPanelWidthPx / subheaderAspectRatio;
  const globalPaddingOffset = (
    (appliedLayoutDebugOverrides.boardPaddingMultiplier - DEFAULT_LAYOUT_DEBUG_OVERRIDES.boardPaddingMultiplier) * 10
  );
  const combinedSubheaderPaddingOffset = Math.min(0, globalPaddingOffset + subheaderPaddingOffset);
  const subheaderPanelPaddingY = clampHeaderValue(
    (subheaderPanelHeightPx * 0.18) + combinedSubheaderPaddingOffset,
    0,
    14
  );
  const subheaderPanelPaddingX = clampHeaderValue(
    (subheaderPanelWidthPx * 0.03) + combinedSubheaderPaddingOffset,
    0,
    20
  );
  const subheaderContentHeightPx = Math.max(1, subheaderPanelHeightPx - (subheaderPanelPaddingY * 2));
  const objectiveCount = Math.max(1, Math.min(2, gameState.objectives.length));
  const objectiveRowGap = clampHeaderValue(subheaderPanelWidthPx * 0.02, 4, 20);
  const objectiveIconSize = clampHeaderValue(subheaderContentHeightPx * 0.72, 10, 34);
  const objectiveBarHeight = objectiveIconSize;
  const objectiveGroupGap = clampHeaderValue(subheaderContentHeightPx * 0.2, 4, 12);
  const objectiveAvailableWidthPerItem = Math.max(
    1,
    (subheaderPanelWidthPx - (objectiveRowGap * Math.max(0, objectiveCount - 1))) / objectiveCount
  );
  const objectiveBarWidth = clampHeaderValue(
    objectiveAvailableWidthPerItem - objectiveIconSize - objectiveGroupGap,
    40,
    subheaderPanelWidthPx * 0.34
  );
  const powerupButtonCount = 4;
  const effectivePowerupButtonSize = responsive.powerupButtonSize * powerupSizeMultiplier;
  const effectivePowerupGap = responsive.powerupGap * powerupGapMultiplier;
  const effectivePowerupRowWidth = (effectivePowerupButtonSize * powerupButtonCount)
    + (effectivePowerupGap * Math.max(0, powerupButtonCount - 1));
  const effectivePowerupIconSize = responsive.powerupIconSize * powerupSizeMultiplier;
  const effectivePowerupBadgeSize = responsive.powerupBadgeSize * powerupBubbleSizeMultiplier;
  const effectivePowerupBadgeFontSize = responsive.powerupBadgeFontSize * powerupBubbleSizeMultiplier;
  const effectiveReservedBottomSpace = responsive.reservedBottomSpace
    + Math.max(0, effectivePowerupButtonSize - responsive.powerupButtonSize);
  const objectiveTrackSource = gameState.objectives[1]?.color ?? gameState.objectives[0]?.color ?? '#3b82f6';
  const objectiveTrackColor = isIconPath(objectiveTrackSource)
    ? getParticleColor(objectiveTrackSource)
    : objectiveTrackSource;
  const objectiveCounterTextColor = '#1f3e78';
  const headerBottomGap = subheaderActive
    ? Math.max(4, responsive.layoutGap * 0.24)
    : responsive.layoutGap;
  const headerVolumeBg = toRgba(objectiveTrackColor, 0.32);
  const headerVolumeBorder = toRgba(objectiveTrackColor, 0.45);
  const headerVolumeIconColor = musicEnabled ? 'rgba(255, 255, 255, 0.92)' : 'rgba(226, 232, 240, 0.62)';
  const objectiveProgressContent = (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex justify-center w-full" style={{ gap: `${objectiveRowGap}px` }}>
      {gameState.objectives.slice(0, 2).map((obj, i) => {
        const progress = Math.min(100, (obj.current / obj.target) * 100);
        const isComplete = obj.current >= obj.target;
        const barColor = isIconPath(obj.color) ? getParticleColor(obj.color) : obj.color;

        return (
          <div key={i} className="flex-1 flex justify-center">
            <div className="flex items-center justify-center" style={{ gap: `${objectiveGroupGap}px` }}>
              {isIconPath(obj.color) ? (
                <img
                  src={obj.color}
                  alt=""
                  style={{ width: `${objectiveIconSize}px`, height: `${objectiveIconSize}px` }}
                />
              ) : (
                <div
                  className="rounded-md shadow-inner"
                  style={{
                    width: `${objectiveIconSize}px`,
                    height: `${objectiveIconSize}px`,
                    backgroundColor: obj.color
                  }}
                />
              )}
              <div
                className="relative overflow-hidden rounded-full"
                style={{
                  width: `${objectiveBarWidth}px`,
                  height: `${objectiveBarHeight}px`,
                  backgroundColor: toRgba(objectiveTrackColor, 0.32),
                  boxShadow: `inset 0 0 0 1px ${toRgba(objectiveTrackColor, 0.45)}`
                }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: isComplete ? '#22c55e' : barColor
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span
                    className="font-bold leading-none"
                    style={{
                      fontSize: `${clampHeaderValue(objectiveIconSize * 0.58, 9, 18)}px`,
                      color: objectiveCounterTextColor
                    }}
                  >
                    {obj.current}/{obj.target}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
  const layoutDebugSnapshot = useMemo(() => ({
    theme: theme.themeName,
    overrides: appliedLayoutDebugOverrides,
    effectiveSpacerAspects: {
      headerBoard: effectiveSpacerHeaderBoardAspect,
      boardRack: effectiveSpacerBoardRackAspect,
    },
    effectiveNineSliceScaleMultiplier: nineSliceScaleMultiplier,
    themeLayoutDefaults: layoutThemeConfig,
    metrics: {
      layoutPadding: Number(responsive.layoutPadding.toFixed(2)),
      layoutGap: Number(responsive.layoutGap.toFixed(2)),
      boardCellSize: Number(responsive.boardCellSize.toFixed(2)),
      boardInnerPadding: Number(responsive.boardInnerPadding.toFixed(2)),
      boardInnerPaddingInCells: Number((responsive.boardInnerPadding / Math.max(1, responsive.boardCellSize)).toFixed(3)),
      boardInnerPaddingRatio: Number((responsive.boardInnerPadding / Math.max(1, responsive.boardPanelWidthPx)).toFixed(4)),
      panelBorderBasePx: Number(responsive.panelBorderBasePx.toFixed(2)),
      boardPanelWidthPx: Number(responsive.boardPanelWidthPx.toFixed(2)),
      boardWidthPercent: Number(responsive.boardWidthPercent.toFixed(2)),
      rackWidthPercent: Number(responsive.rackWidthPercent.toFixed(2)),
      powerupButtonSize: Number(responsive.powerupButtonSize.toFixed(2)),
      powerupGap: Number(responsive.powerupGap.toFixed(2)),
      effectivePowerupButtonSize: Number(effectivePowerupButtonSize.toFixed(2)),
      effectivePowerupGap: Number(effectivePowerupGap.toFixed(2)),
      effectivePowerupBadgeSize: Number(effectivePowerupBadgeSize.toFixed(2)),
      effectivePowerupRowWidth: Number(effectivePowerupRowWidth.toFixed(2)),
      reservedBottomSpace: Number(responsive.reservedBottomSpace.toFixed(2)),
      effectiveReservedBottomSpace: Number(effectiveReservedBottomSpace.toFixed(2)),
      viewportHeight: Number(responsive.viewportHeight.toFixed(2)),
      isViewportStable: responsive.isViewportStable,
    },
  }), [
    appliedLayoutDebugOverrides,
    effectiveSpacerBoardRackAspect,
    effectiveSpacerHeaderBoardAspect,
    layoutThemeConfig,
    nineSliceScaleMultiplier,
    responsive.boardCellSize,
    responsive.boardInnerPadding,
    responsive.panelBorderBasePx,
    responsive.boardPanelWidthPx,
    responsive.boardWidthPercent,
    responsive.isViewportStable,
    responsive.layoutGap,
    responsive.layoutPadding,
    responsive.powerupButtonSize,
    responsive.powerupGap,
    responsive.rackWidthPercent,
    responsive.reservedBottomSpace,
    responsive.viewportHeight,
    effectivePowerupBadgeSize,
    effectivePowerupButtonSize,
    effectivePowerupGap,
    effectivePowerupRowWidth,
    effectiveReservedBottomSpace,
    theme.themeName,
  ]);
  const layoutDebugText = useMemo(
    () => JSON.stringify(layoutDebugSnapshot, null, 2),
    [layoutDebugSnapshot]
  );

  const handleCopyLayoutDebug = useCallback(async () => {
    const copied = await copyTextToClipboard(layoutDebugText);
    setLayoutDebugCopyStatus(copied ? 'copied' : 'error');
  }, [layoutDebugText]);

  const handleResetLayoutDebug = useCallback(() => {
    setLayoutDebugOverrides(null);
    setLayoutDebugCopyStatus('idle');
  }, []);

  return (
    <div
      className="flex justify-center items-center w-full select-none overflow-hidden"
      style={{
        height: '100dvh',
        minHeight: '100vh',
        backgroundImage: `url(${backgroundImageSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div
        ref={layoutRef}
        className="flex flex-col"
        style={{
          width: '100%',
          height: responsive.viewportHeight ? `${responsive.viewportHeight}px` : '100%',
          maxHeight: '100%',
          maxWidth: '100%',
          paddingLeft: `${responsive.layoutPadding}px`,
          paddingRight: `${responsive.layoutPadding}px`,
          paddingBottom: `${responsive.layoutPadding}px`,
          paddingTop: `calc(${responsive.layoutPadding}px + env(safe-area-inset-top, 0px))`
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
      >
      <style>{`
        .board-grid {
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          grid-template-rows: repeat(8, minmax(0, 1fr));
        }
        .piece-preview-grid {
          display: grid;
        }
        .drag-preview {
          position: fixed;
          pointer-events: none;
          z-index: 1000;
          transform: translate(-50%, -50%);
          filter: drop-shadow(0 15px 25px rgba(0,0,0,0.5));
        }
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          10% { transform: translate(-1px, -2px) rotate(-1deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); }
          30% { transform: translate(3px, 2px) rotate(0deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 2px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(3px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(1px, 2px) rotate(0deg); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
        .shake-animation {
          animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: inherit; }
          50% { transform: scale(1.05); }
        }
        @keyframes fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-fade-out {
          animation: fade-out 0.3s ease-out forwards;
        }
        @keyframes bomb-glow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.3); }
        }
        @keyframes adProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes powerupOverlayFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .powerup-dark-overlay {
          animation: powerupOverlayFadeIn 220ms ease-out both;
        }
        @keyframes superballGlow {
          0%, 100% {
            filter:
              drop-shadow(1px -1px 0 rgba(255, 255, 255, 0.75))
              drop-shadow(-2px 1px 0 rgba(254, 240, 138, 0.72))
              drop-shadow(2px 1px 0 rgba(250, 204, 21, 0.62))
              drop-shadow(0 0 4px rgba(251, 191, 36, 0.72))
              drop-shadow(0 0 7px rgba(251, 191, 36, 0.45));
          }
          25% {
            filter:
              drop-shadow(-1px -1px 0 rgba(255, 255, 255, 0.78))
              drop-shadow(2px 0px 0 rgba(254, 240, 138, 0.75))
              drop-shadow(-2px 2px 0 rgba(250, 204, 21, 0.66))
              drop-shadow(0 0 4px rgba(251, 191, 36, 0.76))
              drop-shadow(0 0 7px rgba(251, 191, 36, 0.5));
          }
          50% {
            filter:
              drop-shadow(0px -2px 0 rgba(255, 255, 255, 0.82))
              drop-shadow(-2px 1px 0 rgba(254, 240, 138, 0.8))
              drop-shadow(2px -1px 0 rgba(250, 204, 21, 0.7))
              drop-shadow(0 0 4px rgba(251, 191, 36, 0.8))
              drop-shadow(0 0 8px rgba(251, 191, 36, 0.55));
          }
          75% {
            filter:
              drop-shadow(1px 0px 0 rgba(255, 255, 255, 0.78))
              drop-shadow(-1px -2px 0 rgba(254, 240, 138, 0.77))
              drop-shadow(2px 2px 0 rgba(250, 204, 21, 0.67))
              drop-shadow(0 0 4px rgba(251, 191, 36, 0.78))
              drop-shadow(0 0 7px rgba(251, 191, 36, 0.52));
          }
        }
        @keyframes superballPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes superballBuildup {
          0% {
            transform: translate(0, 0) rotate(0deg);
            filter:
              drop-shadow(1px -1px 0 rgba(255, 255, 255, 0.75))
              drop-shadow(-2px 1px 0 rgba(254, 240, 138, 0.72))
              drop-shadow(2px 1px 0 rgba(250, 204, 21, 0.62))
              drop-shadow(0 0 4px rgba(251, 191, 36, 0.72))
              drop-shadow(0 0 7px rgba(251, 191, 36, 0.45));
          }
          10% {
            transform: translate(-0.12px, 0.06px) rotate(-0.18deg);
            filter:
              drop-shadow(-1px -1px 0 rgba(255, 255, 255, 0.78))
              drop-shadow(2px 0px 0 rgba(254, 240, 138, 0.75))
              drop-shadow(-2px 2px 0 rgba(250, 204, 21, 0.66))
              drop-shadow(0 0 4px rgba(251, 191, 36, 0.76))
              drop-shadow(0 0 7px rgba(251, 191, 36, 0.5));
          }
          20% {
            transform: translate(0.2px, -0.12px) rotate(0.32deg);
            filter:
              drop-shadow(0px -2px 0 rgba(255, 255, 255, 0.8))
              drop-shadow(-2px 1px 0 rgba(254, 240, 138, 0.79))
              drop-shadow(2px -1px 0 rgba(250, 204, 21, 0.69))
              drop-shadow(0 0 4px rgba(251, 191, 36, 0.8))
              drop-shadow(0 0 8px rgba(251, 191, 36, 0.56));
          }
          30% {
            transform: translate(-0.32px, 0.18px) rotate(-0.52deg);
            filter:
              drop-shadow(1px 0px 0 rgba(255, 255, 255, 0.82))
              drop-shadow(-1px -2px 0 rgba(254, 240, 138, 0.8))
              drop-shadow(2px 2px 0 rgba(250, 204, 21, 0.72))
              drop-shadow(0 0 5px rgba(251, 191, 36, 0.84))
              drop-shadow(0 0 8px rgba(251, 191, 36, 0.6));
          }
          40% {
            transform: translate(0.46px, -0.24px) rotate(0.76deg);
            filter:
              drop-shadow(-1px 1px 0 rgba(255, 255, 255, 0.85))
              drop-shadow(2px -1px 0 rgba(254, 240, 138, 0.83))
              drop-shadow(-2px 2px 0 rgba(250, 204, 21, 0.75))
              drop-shadow(0 0 5px rgba(251, 191, 36, 0.88))
              drop-shadow(0 0 9px rgba(251, 191, 36, 0.65));
          }
          50% {
            transform: translate(-0.62px, 0.34px) rotate(-1deg);
            filter:
              drop-shadow(0px -2px 0 rgba(255, 255, 255, 0.88))
              drop-shadow(-2px 1px 0 rgba(254, 240, 138, 0.86))
              drop-shadow(2px 0px 0 rgba(250, 204, 21, 0.78))
              drop-shadow(0 0 5px rgba(251, 191, 36, 0.92))
              drop-shadow(0 0 9px rgba(251, 191, 36, 0.7));
          }
          60% {
            transform: translate(0.78px, -0.42px) rotate(1.28deg);
            filter:
              drop-shadow(1px -1px 0 rgba(255, 255, 255, 0.9))
              drop-shadow(-2px 0px 0 rgba(254, 240, 138, 0.88))
              drop-shadow(2px 1px 0 rgba(250, 204, 21, 0.8))
              drop-shadow(0 0 6px rgba(251, 191, 36, 0.95))
              drop-shadow(0 0 10px rgba(251, 191, 36, 0.74));
          }
          70% {
            transform: translate(-0.92px, 0.5px) rotate(-1.56deg);
            filter:
              drop-shadow(-1px -1px 0 rgba(255, 255, 255, 0.94))
              drop-shadow(2px -1px 0 rgba(254, 240, 138, 0.9))
              drop-shadow(-2px 1px 0 rgba(250, 204, 21, 0.82))
              drop-shadow(0 0 6px rgba(251, 191, 36, 0.98))
              drop-shadow(0 0 10px rgba(251, 191, 36, 0.78));
          }
          80% {
            transform: translate(1.08px, -0.6px) rotate(1.84deg);
            filter:
              drop-shadow(1px 1px 0 rgba(255, 255, 255, 0.97))
              drop-shadow(-2px 0px 0 rgba(254, 240, 138, 0.93))
              drop-shadow(2px -1px 0 rgba(250, 204, 21, 0.84))
              drop-shadow(0 0 6px rgba(251, 191, 36, 1))
              drop-shadow(0 0 11px rgba(251, 191, 36, 0.82));
          }
          90% {
            transform: translate(-1.22px, 0.68px) rotate(-2.08deg);
            filter:
              drop-shadow(0px -2px 0 rgba(255, 255, 255, 1))
              drop-shadow(2px 0px 0 rgba(254, 240, 138, 0.96))
              drop-shadow(-2px 1px 0 rgba(250, 204, 21, 0.87))
              drop-shadow(0 0 6px rgba(251, 191, 36, 1))
              drop-shadow(0 0 11px rgba(251, 191, 36, 0.87));
          }
          100% {
            transform: translate(0, 0) rotate(0deg);
            filter:
              drop-shadow(1px -1px 0 rgba(255, 255, 255, 1))
              drop-shadow(-2px 1px 0 rgba(254, 240, 138, 0.98))
              drop-shadow(2px 0px 0 rgba(250, 204, 21, 0.9))
              drop-shadow(0 0 6px rgba(251, 191, 36, 1))
              drop-shadow(0 0 12px rgba(251, 191, 36, 0.9));
          }
        }
        @keyframes cellShakeBuildup {
          0% { transform: translate(0, 0) rotate(0deg); }
          4% { transform: translate(-0.12px, 0.05px) rotate(-0.05deg); }
          8% { transform: translate(0.14px, -0.06px) rotate(0.06deg); }
          12% { transform: translate(-0.16px, 0.07px) rotate(-0.07deg); }
          16% { transform: translate(0.18px, -0.08px) rotate(0.08deg); }
          20% { transform: translate(-0.2px, 0.09px) rotate(-0.09deg); }
          24% { transform: translate(0.22px, -0.1px) rotate(0.1deg); }
          28% { transform: translate(-0.24px, 0.11px) rotate(-0.11deg); }
          32% { transform: translate(0.26px, -0.12px) rotate(0.12deg); }
          36% { transform: translate(-0.3px, 0.13px) rotate(-0.13deg); }
          40% { transform: translate(0.34px, -0.15px) rotate(0.15deg); }
          44% { transform: translate(-0.38px, 0.17px) rotate(-0.17deg); }
          48% { transform: translate(0.42px, -0.19px) rotate(0.19deg); }
          52% { transform: translate(-0.46px, 0.21px) rotate(-0.21deg); }
          56% { transform: translate(0.5px, -0.23px) rotate(0.23deg); }
          60% { transform: translate(-0.54px, 0.25px) rotate(-0.25deg); }
          64% { transform: translate(0.74px, -0.34px) rotate(0.34deg); }
          68% { transform: translate(-0.82px, 0.38px) rotate(-0.38deg); }
          72% { transform: translate(1px, -0.46px) rotate(0.46deg); }
          76% { transform: translate(-1.16px, 0.53px) rotate(-0.53deg); }
          80% { transform: translate(1.34px, -0.61px) rotate(0.61deg); }
          84% { transform: translate(-1.52px, 0.7px) rotate(-0.7deg); }
          88% { transform: translate(1.7px, -0.78px) rotate(0.78deg); }
          92% { transform: translate(-1.88px, 0.86px) rotate(-0.86deg); }
          96% { transform: translate(2.06px, -0.94px) rotate(0.94deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @keyframes cellBrightnessBuildup {
          0% {
            filter: brightness(1) saturate(1);
          }
          40% {
            filter: brightness(1.08) saturate(1.05);
          }
          75% {
            filter: brightness(1.18) saturate(1.1);
          }
          100% {
            filter: brightness(1.28) saturate(1.14);
          }
        }
        .superball-buildup {
          animation: superballBuildup 1.5s ease-in forwards;
          z-index: 100;
        }
        .cell-shake-buildup {
          animation: cellShakeBuildup 1.5s linear forwards, cellBrightnessBuildup 1.5s ease-in forwards;
        }
        @keyframes piece-shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-4px, -2px) rotate(-3deg); }
          20% { transform: translate(4px, 2px) rotate(3deg); }
          30% { transform: translate(-4px, 2px) rotate(-2deg); }
          40% { transform: translate(4px, -2px) rotate(2deg); }
          50% { transform: translate(-3px, 3px) rotate(-3deg); }
          60% { transform: translate(3px, -3px) rotate(3deg); }
          70% { transform: translate(-2px, 2px) rotate(-2deg); }
          80% { transform: translate(2px, -2px) rotate(2deg); }
          90% { transform: translate(-1px, 1px) rotate(-1deg); }
        }
        .piece-trashing {
          animation: piece-shake 0.15s ease-in-out infinite;
          filter: saturate(1.5) brightness(1.2);
        }
      `}</style>

      {/* Effects Layer */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {explosionSprites.filter(sprite => sprite.life > 0).map(sprite => {
          const progress = 1 - (sprite.life / sprite.maxLife);
          const scale = 0.72 + (progress * 0.9);
          const opacity = Math.max(0, sprite.life / sprite.maxLife);
          return (
            <div
              key={sprite.id}
              style={{
                position: 'absolute',
                left: sprite.x,
                top: sprite.y,
                width: sprite.size,
                height: sprite.size,
                borderRadius: '9999px',
                opacity,
                transform: `translate(-50%, -50%) scale(${scale}) rotate(${progress * 120}deg)`,
                background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${toRgba(sprite.color, 0.95)} 26%, ${toRgba(sprite.color, 0.4)} 58%, rgba(255,255,255,0) 78%)`,
                boxShadow: `0 0 ${sprite.size * 0.55}px ${toRgba(sprite.color, 0.75)}`,
                mixBlendMode: 'screen',
                willChange: 'transform, opacity'
              }}
            />
          );
        })}
        {particles.filter(p => p.life > 0).map(p => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.shape === 'circle' ? '9999px' : '3px',
              clipPath: p.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
              opacity: Math.max(0, p.life / p.maxLife),
              transform: `translate(-50%, -50%) rotate(${p.life * 10}deg)`,
              willChange: 'transform, opacity'
            }}
          />
        ))}
        {floatingTexts.map(t => (
          <div
            key={t.id}
            className="font-black text-2xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            style={{
              position: 'absolute',
              left: t.x,
              top: t.y,
              opacity: t.life / 20, // fade out faster at end
              transform: `translate(-50%, -50%) scale(${1 + (t.maxLife - t.life) * 0.01})`,
              zIndex: 2000
            }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Level & Score Card */}
      <ResponsiveNineSlicePanel
        ref={headerCardRef}
        src={boardPanelSrc}
        {...headerPanelConfig}
        baseBorderWidthPx={responsive.panelBorderBasePx}
        widthPercent={responsive.boardWidthPercent}
        className="relative overflow-hidden"
        style={{
          marginBottom: `${headerBottomGap}px`,
          padding: `${headerPanelPaddingY}px ${headerPanelPaddingX}px`
        }}
      >
        {/* Top row: Level left, Moves centered to panel width, Audio right */}
        <div className="h-full flex items-center">
          <div
            className="w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
          >
            <div
              className={`justify-self-start font-black rounded-xl ${gameState.level <= 1 ? 'bg-blue-500/20 text-blue-400' : gameState.level === 2 ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/20 text-purple-400'}`}
              style={{
                fontSize: `${headerBadgeFontSize}px`,
                paddingLeft: `${headerBadgePadX}px`,
                paddingRight: `${headerBadgePadX}px`,
                paddingTop: `${headerBadgePadY}px`,
                paddingBottom: `${headerBadgePadY}px`,
                lineHeight: 1
              }}
            >
              Level {gameState.level}
            </div>
            <div className="flex flex-col items-center justify-self-center">
              <span
                className={`font-black ${gameState.moves <= 5 ? 'text-red-400' : 'text-white'}`}
                style={{ fontSize: `${headerMovesValueSize}px`, lineHeight: 1 }}
              >
                {gameState.moves}
              </span>
              <span
                className="text-slate-500 uppercase font-bold"
                style={{ fontSize: `${headerMovesLabelSize}px`, lineHeight: 1.05 }}
              >
                Moves
              </span>
            </div>
            {/* Music Toggle Button */}
            <button
              onClick={toggleMusic}
              className={`
                justify-self-end
                rounded-full flex items-center justify-center
                transition-all duration-200 active:scale-95
              `}
              style={{
                width: `${headerAudioButtonSize}px`,
                height: `${headerAudioButtonSize}px`,
                backgroundColor: headerVolumeBg,
                boxShadow: `inset 0 0 0 1px ${headerVolumeBorder}`
              }}
            >
              <i
                className={`fa-solid ${musicEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}
                style={{ fontSize: `${headerAudioIconSize}px`, color: headerVolumeIconColor }}
              ></i>
            </button>
          </div>
        </div>
      </ResponsiveNineSlicePanel>

      {subheaderActive && (
        <div
          className="w-full flex justify-center"
          style={{ marginBottom: `${responsive.layoutGap}px` }}
        >
          <div
            className="relative"
            style={{
              width: `${responsive.boardWidthPercent}%`,
              aspectRatio: `${subheaderAspectRatio}`
            }}
          >
            {subheaderContainerOpacity > 0 && (
              <ResponsiveNineSlicePanel
                src={boardPanelSrc}
                {...subheaderPanelConfig}
                baseBorderWidthPx={responsive.panelBorderBasePx}
                widthPercent={100}
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ opacity: subheaderContainerOpacity }}
              />
            )}
            {subheaderShowContent && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  padding: `${subheaderPanelPaddingY}px ${subheaderPanelPaddingX}px`
                }}
              >
                {objectiveProgressContent}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 w-full min-h-0 flex-col items-center justify-center">
        {/* Game Board Container */}
        <ResponsiveNineSlicePanel
          ref={boardRef}
          src={boardPanelSrc}
          {...boardPanelConfig}
          baseBorderWidthPx={responsive.panelBorderBasePx}
          widthPercent={responsive.boardWidthPercent}
          className={`relative ${isShaking ? 'shake-animation' : ''}`}
          style={{
            padding: `${responsive.boardInnerPadding}px`,
            marginBottom: `${responsive.layoutGap}px`,
            zIndex: deleteBlockMode || wildcardMode ? 60 : (shufflePhase || superballAnimations.length > 0 ? 40 : undefined)
          }}
        >
        <div
          className="board-grid w-full h-full"
          style={{ gap: `${responsive.boardCellGap}px` }}
        >
          {gameState.grid.map((row, y) =>
            row.map((cell, x) => {
              const ghost = isGhostCell(x, y);
              const booster = gameState.boosters.find(b => b.x === x && b.y === y);
              const isAffected = affectedCells.has(`${x},${y}`);
              const isSuperballTarget = superballAnimations.some(
                (animation) => animation.affectedCells.has(`${x},${y}`)
              ) && !(booster?.type === 'color_ball');

              // Determine if we should use an image
              const cellColor = cell?.color;
              const ghostColor = ghost?.color;
              const cellHasImage = cellColor && isIconPath(cellColor);
              const ghostHasImage = ghostColor && isIconPath(ghostColor);

              // Check if this cell is being animated (flying in) - use ref for synchronous check
              const isFlying = cell && activeIncomingIds.tileIds.has(cell.id);
              const isBoosterFlying = booster && activeIncomingIds.boosterIds.has(booster.id);
              const hideStaticForIntro = isIntroArrivalActive;

              // Calculate background
              let bgColor = 'transparent'; // empty cell
              let bgImage = `url(${UI_ASSETS.SLOT})`; // empty cells show slot
              let cellOpacity = 0.5; // default for empty slots

              if (hideStaticForIntro || isFlying || isBoosterFlying) {
                // Hide cell while it's flying - show empty slot
                bgColor = 'transparent';
                bgImage = `url(${UI_ASSETS.SLOT})`;
                cellOpacity = 0.5;
              } else if (booster) {
                bgColor = 'transparent';
                // During scrambling, show slot at full opacity; otherwise hide it
                bgImage = shufflePhase === 'scrambling' ? `url(${UI_ASSETS.SLOT})` : 'none';
                cellOpacity = shufflePhase === 'scrambling' ? 0.5 : 1;
              } else if (cell) {
                if (shufflePhase === 'scrambling') {
                  // During scrambling, show slot at full opacity instead of tile
                  bgColor = 'transparent';
                  bgImage = `url(${UI_ASSETS.SLOT})`;
                  cellOpacity = 0.5;
                } else {
                  if (cellHasImage) {
                    bgColor = 'transparent';
                    bgImage = `url(${cellColor})`;
                  } else {
                    bgColor = cellColor;
                    bgImage = 'none';
                  }
                  cellOpacity = 1;
                }
              } else if (ghost) {
                if (ghostHasImage) {
                  bgColor = 'transparent';
                  bgImage = `url(${ghostColor})`;
                } else {
                  bgColor = ghostColor;
                  bgImage = 'none';
                }
                cellOpacity = ghost.isValid ? 0.7 : 0.15;
              }

              // Shuffle animation transforms
              const getShuffleTransform = () => {
                if (!cell) return '';
                if (shufflePhase === 'levitating') return 'scale(1.1) translateY(-4px)';
                // During scrambling, cells are hidden (flying tiles shown instead)
                if (shufflePhase === 'scrambling') return 'scale(1)';
                if (shufflePhase === 'landing') return 'scale(1) translateY(0)';
                return '';
              };

              return (
                <div
                  key={`${x}-${y}`}
                  data-cell={`${x},${y}`}
                  onClick={() => {
                    if (isGameplayInputLocked) return;
                    if (deleteBlockMode && cell && !booster) {
                      handleDeleteBlock(x, y);
                    } else if (wildcardMode && cell && !booster) {
                      handleWildcard(x, y);
                    } else if (booster && !hideStaticForIntro && !isBoosterFlying && !shufflePhase && !deleteBlockMode && !wildcardMode) {
                      activateBooster(booster);
                    }
                  }}
                  className={`
                    relative
                    ${booster && !hideStaticForIntro && !isBoosterFlying && !shufflePhase && !deleteBlockMode && !wildcardMode && superballAnimations.length === 0 ? 'cursor-pointer active:scale-95' : ''}
                    ${deleteBlockMode && cell && !booster ? 'cursor-pointer z-50 hover:scale-110 hover:brightness-125' : ''}
                    ${wildcardMode && cell && !booster ? 'cursor-pointer z-50 hover:scale-110 hover:brightness-125' : ''}
                    ${shufflePhase === 'levitating' && cell ? 'z-20 shadow-lg' : ''}
                    ${isSuperballTarget ? 'cell-shake-buildup' : ''}
                  `}
                  style={{
                    backgroundColor: bgColor,
                    backgroundImage: bgImage,
                    backgroundSize: '100% 100%',
                    transition: (isIntroArrivalActive || shuffleAnimations.length > 0)
                      ? 'none'
                      : 'transform 0.2s, box-shadow 0.2s',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    opacity: cellOpacity,
                    transform: gameState.clearingTiles.includes(cell?.id || '')
                      ? 'scale(0) rotate(90deg)'
                      : shufflePhase && cell
                      ? getShuffleTransform()
                      : (ghost && ghost.isValid ? 'scale(0.95)' : 'scale(1)'),
                    boxShadow: cell
                      ? (shufflePhase === 'levitating'
                        ? '0 8px 20px rgba(0,0,0,0.5)'
                        : '0 4px 8px rgba(0,0,0,0.3)')
                      : undefined,
                    animationDelay: isSuperballTarget ? `${((x + y * 7) % 10) * 0.02}s` : undefined
                  }}
                >
                  {/* Affected area indicator - shows during booster activation with fade */}
                  {isAffected && !booster && (
                    <div
                      className="absolute inset-0 pointer-events-none z-10 animate-fade-out"
                      style={{
                        backgroundColor: affectedColor
                      }}
                    />
                  )}
                  {/* Locked tile overlay - frozen appearance */}
                  {cell?.locked && !booster && (
                    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center bg-slate-900/60">
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-slate-300/80" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      {/* Ice/frost pattern overlay */}
                      <div className="absolute inset-0 opacity-30" style={{
                        background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(148, 163, 184, 0.3) 2px, rgba(148, 163, 184, 0.3) 4px)'
                      }} />
                    </div>
                  )}
                  {booster && !hideStaticForIntro && !isBoosterFlying && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={booster.type === 'color_ball' ? {} : { animation: 'pulse 1s ease-in-out infinite' }}
                    >
                      {booster.type === 'color_ball' ? (
                        (() => {
                          const activeAnimation = superballAnimations.find(
                            (animation) => animation.booster.id === booster.id
                          );
                          return (
                            <img
                              src={UI_ASSETS.SUPERBALL}
                              alt="Superball"
                              className={`w-[85%] h-[85%] object-contain ${activeAnimation ? 'superball-buildup' : ''}`}
                              style={{
                                visibility: activeAnimation ? 'hidden' : 'visible',
                                filter: 'none',
                                animation: activeAnimation
                                  ? 'superballBuildup 1.5s ease-in forwards'
                                  : 'none'
                              }}
                            />
                          );
                        })()
                      ) : (
                        <div
                          className="w-[85%] h-[85%] rounded-xl flex items-center justify-center"
                          style={{
                            background: booster.type === 'bomb'
                              ? 'linear-gradient(135deg, #ef4444, #f97316)'
                              : booster.type === 'line_bomb'
                              ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                              : booster.type === 'rocket_h'
                              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                              : booster.type === 'rocket_v'
                              ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                              : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.3)'
                          }}
                        >
                          <span
                            className="text-2xl drop-shadow-lg"
                            style={{
                              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                              transform: booster.type === 'rocket_h' ? 'rotate(45deg)' : booster.type === 'rocket_v' ? 'rotate(-45deg)' : 'none'
                            }}
                          >
                            {booster.type === 'bomb' ? '💥' : booster.type === 'line_bomb' ? '💣' : (booster.type === 'rocket_h' || booster.type === 'rocket_v') ? '🚀' : '💣'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {ghost && !ghost.isValid && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full opacity-60"></div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Flying tiles during shuffle */}
        {shuffleAnimations.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-40">
            {shuffleAnimations.map((anim, i) => {
              // Cap movement progress at 1 (tiles stay at destination)
              const moveProgress = Math.min(anim.progress, 1);

              // Interpolate position with an arc using actual pixel positions
              const dx = anim.toPx.x - anim.fromPx.x;
              const dy = anim.toPx.y - anim.fromPx.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // Add arc height based on distance (more distance = higher arc)
              const arcHeight = Math.min(distance * 0.3, 80);
              const arcOffset = Math.sin(moveProgress * Math.PI) * arcHeight;

              const currentX = anim.fromPx.x + dx * moveProgress;
              const currentY = anim.fromPx.y + dy * moveProgress - arcOffset;

              const boxShadowStyle = moveProgress < 0.7
                ? '0 6px 20px rgba(0,0,0,0.4)'
                : `0 ${6 - 2 * ((moveProgress - 0.7) / 0.3)}px ${20 - 12 * ((moveProgress - 0.7) / 0.3)}px rgba(0,0,0,${0.4 - 0.1 * ((moveProgress - 0.7) / 0.3)})`;

              // Render booster differently
              if (anim.isBooster) {
                const boosterType = anim.boosterType;
                return (
                  <div
                    key={`fly-booster-${anim.tile.id}-${i}`}
                    className="absolute flex items-center justify-center"
                    style={{
                      width: anim.cellSize,
                      height: anim.cellSize,
                      left: currentX,
                      top: currentY,
                      boxShadow: boxShadowStyle,
                      zIndex: 40
                    }}
                  >
                    {boosterType === 'color_ball' ? (
                      <img
                        src={UI_ASSETS.SUPERBALL}
                        alt="Superball"
                        className="w-[85%] h-[85%] object-contain"
                        style={{
                          filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.8)) drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))'
                        }}
                      />
                    ) : (
                      <div
                        className="w-[85%] h-[85%] rounded-xl flex items-center justify-center"
                        style={{
                          background: boosterType === 'bomb'
                            ? 'linear-gradient(135deg, #ef4444, #f97316)'
                            : boosterType === 'line_bomb'
                            ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                            : boosterType === 'rocket_h'
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : boosterType === 'rocket_v'
                            ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.3)'
                        }}
                      >
                        <span
                          className="text-2xl drop-shadow-lg"
                          style={{
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                            transform: boosterType === 'rocket_h' ? 'rotate(45deg)' : boosterType === 'rocket_v' ? 'rotate(-45deg)' : 'none'
                          }}
                        >
                          {boosterType === 'bomb' ? '💥' : boosterType === 'line_bomb' ? '💣' : (boosterType === 'rocket_h' || boosterType === 'rocket_v') ? '🚀' : '💣'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }

              // Render regular tile
              return (
                <div
                  key={`fly-${anim.tile.id}-${i}`}
                  className="absolute"
                  style={{
                    width: anim.cellSize,
                    height: anim.cellSize,
                    left: currentX,
                    top: currentY,
                    backgroundImage: isIconPath(anim.tile.color) ? `url(${anim.tile.color})` : 'none',
                    backgroundColor: isIconPath(anim.tile.color) ? 'transparent' : anim.tile.color,
                    backgroundSize: '100% 100%',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    boxShadow: boxShadowStyle,
                    zIndex: 40
                  }}
                />
              );
            })}
          </div>
        )}

        {/* ALL CLEAR Screen */}
        {showAllClear && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-8 text-center z-50" onClick={(e) => e.stopPropagation()}>
            <div className="text-7xl mb-4 animate-bounce">✨</div>
            <h2
              className="text-4xl font-black mb-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent"
              style={{
                animation: 'pulse 0.5s ease-in-out infinite',
                textShadow: '0 0 30px rgba(251, 191, 36, 0.5)'
              }}
            >
              ALL CLEAR!!!
            </h2>
            <p className="text-yellow-300 text-lg font-bold mb-2">+500 BONUS</p>
            <p className="text-slate-400 text-sm font-medium">Generating new blocks...</p>
          </div>
        )}

        </ResponsiveNineSlicePanel>


      {/* Drag Preview */}
      {dragPosition && gameState.selectedPieceIndex !== null && (
        <div
          className="drag-preview"
          style={{
            left: dragPosition.x,
            top: dragPosition.y - dragOffsetY
          }}
        >
          <PiecePreview piece={gameState.hand[gameState.selectedPieceIndex]!} active={true} cellSize={dragCellSize} velocity={dragVelocity} />
        </div>
      )}

      {/* Returning Piece Animation */}
      {returningPiece && (() => {
        // Ease out cubic for smooth deceleration
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        const t = easeOut(returningPiece.progress);

        // Interpolate position
        const currentX = returningPiece.fromX + (returningPiece.toX - returningPiece.fromX) * t;
        const currentY = returningPiece.fromY + (returningPiece.toY - returningPiece.fromY) * t;

        // Calculate velocity for squash and stretch
        const dx = returningPiece.toX - returningPiece.fromX;
        const dy = returningPiece.toY - returningPiece.fromY;
        const speed = Math.sqrt(dx * dx + dy * dy);
        const velocityFactor = Math.min(speed / 100, 3) * (1 - t); // Decreases as we approach target

        // Squash and stretch based on direction
        const angle = Math.atan2(dy, dx);
        const stretchX = 1 + velocityFactor * 0.15 * Math.abs(Math.cos(angle));
        const stretchY = 1 + velocityFactor * 0.15 * Math.abs(Math.sin(angle));
        const squashX = 1 / stretchY;
        const squashY = 1 / stretchX;

        // Scale down as it approaches the box
        const scale = 1 - t * 0.5;

        return (
          <div
            className="fixed pointer-events-none z-[200]"
            style={{
              left: currentX,
              top: currentY,
              transform: `translate(-50%, -50%) scaleX(${stretchX * squashX * scale}) scaleY(${stretchY * squashY * scale})`
            }}
          >
            <PiecePreview piece={returningPiece.piece} active={true} cellSize={dragCellSize} />
          </div>
        );
      })()}

        {/* Piece Selection Rack */}
        <ResponsiveNineSlicePanel
          src={rackPanelSrc}
          {...rackPanelConfig}
          baseBorderWidthPx={responsive.panelBorderBasePx}
          widthPercent={responsive.rackWidthPercent}
          className="w-full flex justify-center items-center"
          style={{
            pointerEvents: isEndGameModalVisible ? 'none' : undefined,
            paddingLeft: `${responsive.rackPaddingX}px`,
            paddingRight: `${responsive.rackPaddingX}px`,
            paddingTop: `${responsive.layoutGap * 0.35}px`,
            paddingBottom: `${responsive.layoutGap * 0.35}px`
          }}
        >
        {/* Pieces Container */}
        <div
          className="flex justify-around items-center w-full h-full"
          style={{ gap: `${responsive.rackSlotGap}px` }}
        >
          {gameState.hand.map((piece, index) => {
            const interactionState = handInteractionState[index];
            const isBlocked = Boolean(piece) && Boolean(interactionState?.isBlocked);
            const isSelectable = Boolean(piece) && !isBlocked;

            return (
              <div
                key={piece?.id || `empty-${index}`}
                ref={el => pieceRefs.current[index] = el}
                className={`
                  flex items-center justify-center
                  relative transition-all duration-300
                  ${piece === null && fadingBoxIndex?.index !== index ? 'opacity-0 pointer-events-none' : ''}
                  ${fadingBoxIndex?.index === index && fadingBoxIndex.fading ? 'opacity-0' : ''}
                  ${fadingInPieceIndex === index ? 'opacity-0' : ''}
                  ${trashingAllPieces && piece ? 'piece-trashing' : ''}
                `}
                style={{
                  width: `${responsive.rackSlotWidth}px`,
                  aspectRatio: `${responsive.rackSlotAspectRatio}`,
                  animationDelay: trashingAllPieces ? `${index * 0.05}s` : undefined
                }}
              >
                <img
                  src={UI_ASSETS.CONTAINER_NEXT_PIECE}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
                {/* Piece (draggable area) */}
                <div
                  onPointerDown={(e) => {
                    if (!isSelectable) return;
                    startDragging(e, index);
                  }}
                  className={`
                    flex items-center justify-center w-full h-full touch-none
                    ${isSelectable ? 'cursor-grab' : (piece ? 'cursor-not-allowed' : 'cursor-default')}
                  `}
                  style={{
                    transform: 'scale(0.95)',
                    opacity: isBlocked ? 0.45 : 1
                  }}
                >
                  {piece && gameState.selectedPieceIndex !== index && returningPiece?.index !== index && (
                    <PiecePreview piece={piece} active={false} containerSize={responsive.rackPieceSize * 0.82} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </ResponsiveNineSlicePanel>
      </div>

      {/* Reserve bottom space in normal flow so fixed powerups never overlap content */}
      <div style={{ height: `${effectiveReservedBottomSpace}px`, flexShrink: 0 }} />

      {/* Powerup Buttons - Fixed at bottom */}
      <div
        className="fixed left-1/2 z-20 flex -translate-x-1/2 justify-center transition-opacity duration-150"
        style={{
          pointerEvents: isEndGameModalVisible ? 'none' : undefined,
          bottom: `${responsive.powerupBottomOffset}px`,
          width: `${effectivePowerupRowWidth}px`,
          gap: `${effectivePowerupGap}px`,
          paddingTop: `${responsive.powerupTopPadding}px`,
          paddingBottom: `${responsive.powerupBottomPadding}px`,
          opacity: responsive.isViewportStable ? 1 : 0.85
        }}
      >
        {/* Delete Block Button */}
        <button
          onClick={() => !isGameplayInputLocked && deleteBlockUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && setDeleteBlockMode(true)}
          disabled={isGameplayInputLocked || deleteBlockUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${deleteBlockUses > 0 && !deleteBlockMode && !wildcardMode ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${effectivePowerupButtonSize}px`, height: `${effectivePowerupButtonSize}px` }}
        >
          <i className="fa-solid fa-crosshairs text-white" style={{ fontSize: `${effectivePowerupIconSize}px` }}></i>
          {deleteBlockUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${effectivePowerupBadgeSize}px`,
                height: `${effectivePowerupBadgeSize}px`,
                top: `${-effectivePowerupBadgeSize * 0.22}px`,
                right: `${-effectivePowerupBadgeSize * 0.22}px`,
                fontSize: `${effectivePowerupBadgeFontSize}px`
              }}
            >
              {deleteBlockUses}
            </div>
          )}
        </button>

        {/* Wildcard Button */}
        <button
          onClick={() => !isGameplayInputLocked && wildcardUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && setWildcardMode(true)}
          disabled={isGameplayInputLocked || wildcardUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${wildcardUses > 0 && !wildcardMode && !deleteBlockMode ? 'bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg shadow-yellow-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${effectivePowerupButtonSize}px`, height: `${effectivePowerupButtonSize}px` }}
        >
          <i className="fa-solid fa-wand-magic-sparkles text-white" style={{ fontSize: `${effectivePowerupIconSize}px` }}></i>
          {wildcardUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${effectivePowerupBadgeSize}px`,
                height: `${effectivePowerupBadgeSize}px`,
                top: `${-effectivePowerupBadgeSize * 0.22}px`,
                right: `${-effectivePowerupBadgeSize * 0.22}px`,
                fontSize: `${effectivePowerupBadgeFontSize}px`
              }}
            >
              {wildcardUses}
            </div>
          )}
        </button>

        {/* Shuffle Button */}
        <button
          onClick={() => !isGameplayInputLocked && shuffleUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && activateShuffle()}
          disabled={isGameplayInputLocked || shuffleUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${shuffleUses > 0 && !shufflePhase && !deleteBlockMode && !wildcardMode ? 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${effectivePowerupButtonSize}px`, height: `${effectivePowerupButtonSize}px` }}
        >
          <i className="fa-solid fa-shuffle text-white" style={{ fontSize: `${effectivePowerupIconSize}px` }}></i>
          {shuffleUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${effectivePowerupBadgeSize}px`,
                height: `${effectivePowerupBadgeSize}px`,
                top: `${-effectivePowerupBadgeSize * 0.22}px`,
                right: `${-effectivePowerupBadgeSize * 0.22}px`,
                fontSize: `${effectivePowerupBadgeFontSize}px`
              }}
            >
              {shuffleUses}
            </div>
          )}
        </button>

        {/* Refresh Button (was Trash) */}
        <button
          onClick={() => !isGameplayInputLocked && trashUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && activateTrash()}
          disabled={isGameplayInputLocked || trashUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${trashUses > 0 && !trashingAllPieces && !deleteBlockMode && !wildcardMode ? 'bg-gradient-to-br from-red-500 to-orange-600 shadow-lg shadow-red-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${effectivePowerupButtonSize}px`, height: `${effectivePowerupButtonSize}px` }}
        >
          <i className="fa-solid fa-rotate text-white" style={{ fontSize: `${effectivePowerupIconSize}px` }}></i>
          {trashUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${effectivePowerupBadgeSize}px`,
                height: `${effectivePowerupBadgeSize}px`,
                top: `${-effectivePowerupBadgeSize * 0.22}px`,
                right: `${-effectivePowerupBadgeSize * 0.22}px`,
                fontSize: `${effectivePowerupBadgeFontSize}px`
              }}
            >
              {trashUses}
            </div>
          )}
        </button>

      </div>

      {/* Target Overlay (Delete/Wildcard) */}
      {(deleteBlockMode || wildcardMode) && (
        <>
          <PowerupDarkOverlay
            opacity={0.7}
            zIndex={40}
            pointerEvents="auto"
            onClick={() => {
              setDeleteBlockMode(false);
              setWildcardMode(false);
            }}
          />
          <div className="fixed top-8 left-0 right-0 text-center text-white pointer-events-none z-[65]">
            <p className="text-xl font-bold mb-2">
              {deleteBlockMode ? 'Select a block to destroy' : 'Select a block to recolor'}
            </p>
            <p className="text-sm text-slate-400">Tap a block or anywhere to cancel</p>
          </div>
        </>
      )}

      {/* Superball Animation Overlay with Lightning Rays */}
      {superballAnimations.length > 0 && (
        <>
          <PowerupDarkOverlay opacity={0.7} zIndex={30} pointerEvents="none" />
          {superballAnimations.map((animation) => (
            <React.Fragment key={`superball-overlay-${animation.booster.id}`}>
              <LightningRays
                key={`lightning-${animation.booster.id}-${animation.phase}`}
                booster={animation.booster}
                affectedCells={animation.affectedCells}
                boardRef={boardRef}
                phase={animation.phase}
              />
              <SuperballForeground
                superballAnimation={animation}
                boardRef={boardRef}
              />
            </React.Fragment>
          ))}
        </>
      )}

      {/* Shuffle Overlay */}
      {shufflePhase && (
        <PowerupDarkOverlay opacity={0.5} zIndex={30} pointerEvents="none" />
      )}

      {/* Ad Popup Modal */}
      {showAdPopup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]" onClick={(e) => e.stopPropagation()}>
          <div className="bg-slate-900 rounded-3xl p-6 mx-4 max-w-sm w-full border border-slate-700 shadow-2xl">
            {watchingAd ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4 animate-pulse">📺</div>
                <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full"
                    style={{ animation: 'adProgress 1.5s linear forwards' }}></div>
                </div>
                <p className="text-slate-400 text-sm font-medium">Playing ad...</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-5xl mb-4">🗑️</div>
                <h3 className="text-xl font-black text-white mb-2">Discard Piece?</h3>
                <p className="text-slate-400 text-sm mb-6">
                  You've used your free discard for this level.
                  Watch a short ad to use it again!
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleWatchAd}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500
                      text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-play"></i>
                    Watch Ad
                  </button>
                  <button
                    onClick={handleCancelAd}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold py-3 rounded-2xl transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Out of Moves Popup */}
      {showOutOfMovesPopup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]" onClick={(e) => e.stopPropagation()}>
          <div className="bg-slate-900 rounded-3xl p-6 mx-4 max-w-sm w-full border border-slate-700 shadow-2xl">
            {watchingMovesAd ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4 animate-pulse">📺</div>
                <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full"
                    style={{ animation: 'adProgress 1.5s linear forwards' }}></div>
                </div>
                <p className="text-slate-400 text-sm font-medium">Playing ad...</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-5xl mb-4">⏰</div>
                <h3 className="text-2xl font-black text-white mb-2">Out of Moves!</h3>
                <p className="text-slate-400 text-sm mb-6">
                  Watch an ad to get 5 more moves and keep playing!
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleWatchMovesAd}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500
                      text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-play"></i>
                    Continue (+5 Moves)
                  </button>
                  <button
                    onClick={handleGameOverFromMoves}
                    className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-2xl transition-all active:scale-95"
                  >
                    Game Over
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Level Complete Screen */}
      {showLevelPopup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[210]" onClick={(e) => e.stopPropagation()}>
          <NineSlice
            src={theme.panel('panel_main')}
            {...boardPanelConfig}
            className="p-6 mx-4 max-w-sm w-full text-center"
          >
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-black mb-1 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
              LEVEL {gameState.level} COMPLETE!
            </h2>
            <p className="text-slate-400 text-sm mb-6 font-medium">All objectives cleared!</p>
            <div className="bg-slate-800/50 rounded-2xl p-4 w-full mb-6">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest block mb-2">Score</span>
              <span className="text-4xl font-black text-white">{gameState.score}</span>
            </div>
            <button
              onClick={handleNextLevel}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 px-12 rounded-2xl transition-all active:scale-95 shadow-lg"
            >
              NEXT LEVEL →
            </button>
          </NineSlice>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.gameOver && !gameState.levelComplete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[210]" onClick={(e) => e.stopPropagation()}>
          <div className="bg-slate-900 rounded-3xl p-6 mx-4 max-w-sm w-full border border-slate-700 shadow-2xl text-center">
            <h2 className="text-4xl font-black mb-1 text-white">GAME OVER</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium">
              {gameState.moves <= 0 ? 'Out of moves!' : 'No valid moves left!'}
            </p>
            <div className="bg-slate-800 rounded-2xl p-6 w-full mb-8 border border-slate-700">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block mb-2">Final Score</span>
              <span className="text-5xl font-black text-white">{gameState.score}</span>
            </div>
            <button
              onClick={handleRestart}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 px-12 rounded-2xl transition-all active:scale-95"
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      {!isLayoutDebugVisible && (
        <button
          onClick={() => setIsLayoutDebugVisible(true)}
          aria-label="Abrir Layout Debug"
          title="Abrir Layout Debug"
          className="fixed right-3 top-3 z-[230] flex h-7 w-7 items-center justify-center rounded-full border border-slate-300/35 bg-slate-950/95 text-sm font-black text-white shadow-lg hover:bg-slate-900"
        >
          -
        </button>
      )}

      <LayoutDebugPanel
        visible={isLayoutDebugVisible}
        minAspect={LAYOUT_DEBUG_MIN_ASPECT}
        maxAspect={LAYOUT_DEBUG_MAX_ASPECT}
        spacerAspect={appliedLayoutDebugOverrides.spacerAspect}
        minHeaderAspectRatio={HEADER_ASPECT_RATIO_MIN}
        maxHeaderAspectRatio={HEADER_ASPECT_RATIO_MAX}
        headerAspectRatioStep={HEADER_ASPECT_RATIO_STEP}
        headerAspectRatio={appliedLayoutDebugOverrides.headerAspectRatio}
        minSubheaderAspectRatio={SUBHEADER_ASPECT_RATIO_MIN}
        maxSubheaderAspectRatio={SUBHEADER_ASPECT_RATIO_MAX}
        subheaderAspectRatioStep={SUBHEADER_ASPECT_RATIO_STEP}
        subheaderAspectRatio={appliedLayoutDebugOverrides.subheaderAspectRatio}
        subheaderActive={appliedLayoutDebugOverrides.subheaderActive}
        minSubheaderPaddingOffset={SUBHEADER_PADDING_OFFSET_MIN}
        maxSubheaderPaddingOffset={SUBHEADER_PADDING_OFFSET_MAX}
        subheaderPaddingOffsetStep={SUBHEADER_PADDING_OFFSET_STEP}
        subheaderPaddingOffset={appliedLayoutDebugOverrides.subheaderPaddingOffset}
        minSubheaderContainerOpacity={SUBHEADER_CONTAINER_OPACITY_MIN}
        maxSubheaderContainerOpacity={SUBHEADER_CONTAINER_OPACITY_MAX}
        subheaderContainerOpacityStep={SUBHEADER_CONTAINER_OPACITY_STEP}
        subheaderContainerOpacity={appliedLayoutDebugOverrides.subheaderContainerOpacity}
        subheaderShowContent={appliedLayoutDebugOverrides.subheaderShowContent}
        minScaleMultiplier={NINESLICE_SCALE_MULTIPLIER_MIN}
        maxScaleMultiplier={NINESLICE_SCALE_MULTIPLIER_MAX}
        scaleMultiplierStep={NINESLICE_SCALE_MULTIPLIER_STEP}
        nineSliceScaleMultiplier={appliedLayoutDebugOverrides.nineSliceScaleMultiplier}
        minPaddingMultiplier={BOARD_PADDING_MULTIPLIER_MIN}
        maxPaddingMultiplier={BOARD_PADDING_MULTIPLIER_MAX}
        paddingMultiplierStep={BOARD_PADDING_MULTIPLIER_STEP}
        boardPaddingMultiplier={appliedLayoutDebugOverrides.boardPaddingMultiplier}
        minPowerupSizeMultiplier={POWERUP_SIZE_MULTIPLIER_MIN}
        maxPowerupSizeMultiplier={POWERUP_SIZE_MULTIPLIER_MAX}
        powerupSizeMultiplierStep={POWERUP_SIZE_MULTIPLIER_STEP}
        powerupSizeMultiplier={appliedLayoutDebugOverrides.powerupSizeMultiplier}
        minPowerupBubbleSizeMultiplier={POWERUP_BUBBLE_SIZE_MULTIPLIER_MIN}
        maxPowerupBubbleSizeMultiplier={POWERUP_BUBBLE_SIZE_MULTIPLIER_MAX}
        powerupBubbleSizeMultiplierStep={POWERUP_BUBBLE_SIZE_MULTIPLIER_STEP}
        powerupBubbleSizeMultiplier={appliedLayoutDebugOverrides.powerupBubbleSizeMultiplier}
        minPowerupGapMultiplier={POWERUP_GAP_MULTIPLIER_MIN}
        maxPowerupGapMultiplier={POWERUP_GAP_MULTIPLIER_MAX}
        powerupGapMultiplierStep={POWERUP_GAP_MULTIPLIER_STEP}
        powerupGapMultiplier={appliedLayoutDebugOverrides.powerupGapMultiplier}
        copyStatus={layoutDebugCopyStatus}
        debugText={layoutDebugText}
        onChangeSpacerAspect={(value) => updateLayoutDebugOverride({ spacerAspect: value })}
        onChangeHeaderAspectRatio={(value) => updateLayoutDebugOverride({ headerAspectRatio: value })}
        onChangeSubheaderAspectRatio={(value) => updateLayoutDebugOverride({ subheaderAspectRatio: value })}
        onChangeSubheaderActive={(value) => updateLayoutDebugOverride({ subheaderActive: value })}
        onChangeSubheaderPaddingOffset={(value) => updateLayoutDebugOverride({ subheaderPaddingOffset: value })}
        onChangeSubheaderContainerOpacity={(value) => updateLayoutDebugOverride({ subheaderContainerOpacity: value })}
        onChangeSubheaderShowContent={(value) => updateLayoutDebugOverride({ subheaderShowContent: value })}
        onChangeNineSliceScaleMultiplier={(value) => updateLayoutDebugOverride({ nineSliceScaleMultiplier: value })}
        onChangeBoardPaddingMultiplier={(value) => updateLayoutDebugOverride({ boardPaddingMultiplier: value })}
        onChangePowerupSizeMultiplier={(value) => updateLayoutDebugOverride({ powerupSizeMultiplier: value })}
        onChangePowerupBubbleSizeMultiplier={(value) => updateLayoutDebugOverride({ powerupBubbleSizeMultiplier: value })}
        onChangePowerupGapMultiplier={(value) => updateLayoutDebugOverride({ powerupGapMultiplier: value })}
        onCopy={handleCopyLayoutDebug}
        onReset={handleResetLayoutDebug}
        onHide={() => setIsLayoutDebugVisible(false)}
      />
      </div>

      {showLoadingScreen && (
        <div
          className="fixed inset-0 z-[220]"
          style={{
            backgroundImage: `url(${loadingLevelTemplateSrc}), url(${loadingSplashTemplateSrc}), url(${backgroundImageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            pointerEvents: 'auto'
          }}
        />
      )}
    </div>
  );
};

const PiecePreview: React.FC<{ piece: PieceData, active: boolean, cellSize?: number, containerSize?: number, velocity?: { x: number, y: number } }> = ({ piece, active, cellSize, containerSize, velocity }) => {
  const minX = Math.min(...piece.shape.map(p => p.x));
  const maxX = Math.max(...piece.shape.map(p => p.x));
  const minY = Math.min(...piece.shape.map(p => p.y));
  const maxY = Math.max(...piece.shape.map(p => p.y));

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  // Center of the piece for jelly effect calculation
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Calculate optimal cell size based on piece dimensions and container
  let finalCellSize: number;
  const previewGapRatio = 0.08;
  const maxCellSize = 28; // Limit max size (between 2x2 and 3x3 feel)
  if (cellSize !== undefined) {
    // Explicit cell size (used for drag preview to match board)
    finalCellSize = cellSize;
  } else if (containerSize !== undefined) {
    // Fit piece to container - use the larger dimension to constrain
    const maxDimension = Math.max(width, height);
    const denominator = maxDimension + ((maxDimension - 1) * previewGapRatio);
    finalCellSize = Math.min(maxCellSize, Math.floor(containerSize / Math.max(1, denominator)));
  } else {
    // Default fallback
    finalCellSize = 20;
  }
  const previewCellGap = Math.max(1, Math.round(finalCellSize * previewGapRatio));

  // Squash & stretch for the whole piece based on velocity
  let containerTransform = '';
  if (velocity) {
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    const stretchAmount = Math.min(speed * 0.015, 0.25); // Cap the stretch

    if (speed > 1) {
      const vxNorm = velocity.x / speed;
      const vyNorm = velocity.y / speed;
      // Stretch along velocity, squash perpendicular
      const scaleX = 1 + stretchAmount * Math.abs(vxNorm) - stretchAmount * 0.5 * Math.abs(vyNorm);
      const scaleY = 1 + stretchAmount * Math.abs(vyNorm) - stretchAmount * 0.5 * Math.abs(vxNorm);
      containerTransform = `scale(${scaleX}, ${scaleY})`;
    }
  }

  return (
    <div
      className="piece-preview-grid"
      style={{
        gridTemplateColumns: `repeat(${width}, 1fr)`,
        gridTemplateRows: `repeat(${height}, 1fr)`,
        gap: `${previewCellGap}px`,
        width: 'auto',
        maxHeight: '100%',
        maxWidth: '100%',
        transform: containerTransform,
        transition: 'transform 0.08s ease-out'
      }}
    >
      {Array.from({ length: width * height }).map((_, i) => {
        const x = minX + (i % width);
        const y = minY + Math.floor(i / width);
        const indexInShape = piece.shape.findIndex(p => p.x === x && p.y === y);
        const inShape = indexInShape !== -1;

        const color = inShape ? piece.colors[indexInShape] : undefined;
        const hasImage = color && isIconPath(color);

        // Jelly effect: cells behind in movement direction lag, cells ahead lead
        let jellyTransform = '';
        if (velocity && inShape) {
          const relX = x - centerX;
          const relY = y - centerY;
          // Project cell position onto velocity direction
          // Cells "behind" (negative projection) lag, cells "ahead" (positive) lead
          const factor = 0; // Disabled for testing squash & stretch
          // Moving right (vx>0): right cells (relX>0) go ahead, left cells (relX<0) lag
          const offsetX = relX * velocity.x * factor;
          const offsetY = relY * velocity.y * factor;
          jellyTransform = `translate(${offsetX}px, ${offsetY}px)`;
        }

        return (
          <div
            key={i}
            style={{
              width: `${finalCellSize}px`,
              height: `${finalCellSize}px`,
              backgroundColor: hasImage ? 'transparent' : (inShape ? color : 'transparent'),
              backgroundImage: hasImage ? `url(${color})` : 'none',
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              transform: jellyTransform,
              transition: 'transform 0.1s ease-out'
            }}
          />
        );
      })}
    </div>
  );
};
