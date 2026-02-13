
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { GameState, PieceData, Point, Color, LevelObjective, Booster, BoosterType } from './types';
import { createRandomGrid, generatePiece, generateValidHand, canPlacePiece, findMatchGroups, findGroupCenter, getBombExplosionPoints, isGameOver, calculateScore, initializeObjectives, getAdjacentToMatches, addRandomBlocks, AddedBlock, getColorsForLevel, getPieceShapeSignature } from './utils/gameLogic';
import { GRID_SIZE, getLevelConfig } from './constants';
import { ICONS, UI_ASSETS, UI_ASSET_ASPECT_RATIOS } from './assets';
import { useAudio } from './utils/useAudio';
import { useTheme, NineSlice, ResponsiveNineSlicePanel } from './src/theme';
import { useResponsiveMetrics } from './src/layout/useResponsiveMetrics';

// Since Color enum values are already icon paths, we don't need a separate mapping
// Just check if the color value looks like an icon path (starts with '/icons/')
const isIconPath = (color: string) => color.startsWith('/icons/');

// How much the piece is lifted above the finger/cursor (8% of viewport height)
const getDragOffsetY = () => Math.max(50, window.innerHeight * 0.08);

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

// Lightning rays component for superball animation
const LightningRays: React.FC<{
  booster: Booster;
  affectedCells: Set<string>;
  boardRef: React.RefObject<HTMLDivElement>;
  phase: 'buildup' | 'explode';
}> = ({ booster, affectedCells, boardRef, phase }) => {
  const [tick, setTick] = useState(0);

  // Refresh rays at a moderate pace to avoid over-chaotic flicker
  useEffect(() => {
    if (phase !== 'buildup') return;
    const interval = setInterval(() => setTick(t => t + 1), 70);
    return () => clearInterval(interval);
  }, [phase]);

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

  const generateDetailedBolt = (x1: number, y1: number, x2: number, y2: number) => {
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
      const chaos = (Math.random() - 0.5) * 2 * maxOffset * centerBias;
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
        Math.max(2, Math.floor(Math.random() * (maxAnchorIndex - 1)) + 2)
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
      const branchSign = Math.random() < 0.5 ? -1 : 1;
      const branchAngle = branchSign * (0.35 + Math.random() * 0.55); // ~20deg to ~51deg
      const branchDirX = localDirX * Math.cos(branchAngle) - localDirY * Math.sin(branchAngle);
      const branchDirY = localDirX * Math.sin(branchAngle) + localDirY * Math.cos(branchAngle);
      const branchPerpX = -branchDirY;
      const branchPerpY = branchDirX;

      const branchLength = dist * (0.08 + Math.random() * 0.10);
      const branchSegments = 2 + (Math.random() < 0.45 ? 1 : 0);
      const branchPoints: Point[] = [{ x: anchor.x, y: anchor.y }];

      for (let s = 1; s <= branchSegments; s++) {
        const t = s / branchSegments;
        const len = branchLength * t;
        const jitter = (Math.random() - 0.5) * maxOffset * (0.1 + t * 0.05);
        const x = anchor.x + branchDirX * len + branchPerpX * jitter;
        const y = anchor.y + branchDirY * len + branchPerpY * jitter;
        branchPoints.push({ x, y });
      }

      branchPaths.push(toPath(branchPoints));

      // Secondary branching: 1-2 forks with their own zig-zag.
      if (branchPoints.length > 2 && Math.random() < 0.9) {
        const forkCount = 1 + (Math.random() < 0.45 ? 1 : 0);
        for (let f = 0; f < forkCount; f++) {
          const forkAnchorIndex = 1 + Math.floor(Math.random() * (branchPoints.length - 2));
          const forkAnchor = branchPoints[forkAnchorIndex];
          const forkSign = Math.random() < 0.5 ? -1 : 1;
          const forkAngle = forkSign * (0.38 + Math.random() * 0.4); // ~22deg to ~45deg from branch
          const forkDirX = branchDirX * Math.cos(forkAngle) - branchDirY * Math.sin(forkAngle);
          const forkDirY = branchDirX * Math.sin(forkAngle) + branchDirY * Math.cos(forkAngle);
          const forkPerpX = -forkDirY;
          const forkPerpY = forkDirX;
          const forkLen = branchLength * (0.28 + Math.random() * 0.24);
          const forkSegments = 2 + (Math.random() < 0.4 ? 1 : 0);
          const forkPoints: Point[] = [{ x: forkAnchor.x, y: forkAnchor.y }];

          for (let s = 1; s <= forkSegments; s++) {
            const t = s / forkSegments;
            const len = forkLen * t;
            const jitter = (Math.random() - 0.5) * maxOffset * (0.08 + t * 0.05);
            forkPoints.push({
              x: forkAnchor.x + forkDirX * len + forkPerpX * jitter,
              y: forkAnchor.y + forkDirY * len + forkPerpY * jitter
            });
          }

          branchPaths.push(toPath(forkPoints));

          // Occasional tertiary twig from a secondary fork.
          if (forkPoints.length > 2 && Math.random() < 0.45) {
            const twigAnchorIndex = 1 + Math.floor(Math.random() * (forkPoints.length - 2));
            const twigAnchor = forkPoints[twigAnchorIndex];
            const twigSign = Math.random() < 0.5 ? -1 : 1;
            const twigAngle = twigSign * (0.45 + Math.random() * 0.35); // ~26deg to ~46deg
            const twigDirX = forkDirX * Math.cos(twigAngle) - forkDirY * Math.sin(twigAngle);
            const twigDirY = forkDirX * Math.sin(twigAngle) + forkDirY * Math.cos(twigAngle);
            const twigLen = forkLen * (0.38 + Math.random() * 0.22);
            const twigEndX = twigAnchor.x + twigDirX * twigLen + forkPerpX * ((Math.random() - 0.5) * maxOffset * 0.05);
            const twigEndY = twigAnchor.y + twigDirY * twigLen + forkPerpY * ((Math.random() - 0.5) * maxOffset * 0.05);
            branchPaths.push(`M ${twigAnchor.x} ${twigAnchor.y} L ${twigEndX} ${twigEndY}`);
          }
        }
      }
    }

    return {
      mainPath: toPath(points),
      branchPaths,
      intensity: 0.72 + Math.random() * 0.2,
      thickness: 1.5 + Math.random() * 0.45
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

        const targetMetrics = getBoardCellMetrics(board, cx, cy);
        const cellCenterX = targetMetrics.centerX;
        const cellCenterY = targetMetrics.centerY;
        const targetCellSize = targetMetrics.width;
        const sourceX = boosterX + ((Math.random() - 0.5) * 3.2);
        const sourceY = boosterY + ((Math.random() - 0.5) * 3.2);

        // Some targets get one strike, others get 2-4 simultaneous strikes.
        const roll = Math.random();
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
          : [...impactSlots]
              .sort(() => Math.random() - 0.5)
              .slice(0, boltCount);

        const landingPoints = selectedSlots.map(slot => ({
          x: cellCenterX + (slot.x * targetCellSize) + ((Math.random() - 0.5) * targetCellSize * 0.06),
          y: cellCenterY + (slot.y * targetCellSize) + ((Math.random() - 0.5) * targetCellSize * 0.06)
        }));

        return (
          <g key={`${cellKey}-${tick}`} style={{ mixBlendMode: 'screen' }}>
            {landingPoints.map((landing, boltIndex) => {
              const bolt = generateDetailedBolt(sourceX, sourceY, landing.x, landing.y);
              const widthScale = 0.78 + (Math.random() * 0.72);
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
};

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

const App: React.FC = () => {
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
    const initialBoosters: Booster[] = [
      { id: 'test-superball-1', type: 'color_ball', x: 3, y: 3, color: Color.BLUE },
      { id: 'test-superball-2', type: 'color_ball', x: 4, y: 4, color: Color.ORANGE }
    ];
    const initialGrid = removeTilesAtPoints(
      createRandomGrid(levelConfig.gridFill, initialLevel),
      initialBoosters.map(booster => ({ x: booster.x, y: booster.y }))
    );
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
      levelComplete: false
    };
  });

  const [hoveredCell, setHoveredCell] = useState<Point | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number } | null>(null);
  const [dragCellSize, setDragCellSize] = useState<number>(40);
  const [dragVelocity, setDragVelocity] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const lastDragPos = useRef<{ x: number, y: number, time: number } | null>(null);
  
  // Effects State
  const [particles, setParticles] = useState<Particle[]>([]);
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
  const [superballAnimation, setSuperballAnimation] = useState<SuperballAnimationState | null>(null);
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
  } | null>(null);
  const introRequestIdRef = useRef(0);
  const bootIntroQueuedRef = useRef(false);
  const pendingIncomingBlocksRef = useRef<AddedBlock[] | null>(null);

  const layoutRef = useRef<HTMLDivElement>(null);
  const headerCardRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const boardPanelConfig = theme.config('panel_main');
  const rackPanelConfig = theme.config('container_next_main');
  const headerPanelConfig = { ...boardPanelConfig, aspectRatio: 5 / 1.5 };
  const boardAspect = boardPanelConfig.aspectRatio ?? 1;
  const rackAspect = rackPanelConfig.aspectRatio ?? (3 / 2);
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
    boardAspect,
    rackAspect,
    boardPanelScale: boardPanelConfig.scale ?? 1,
    boardPanelScaleMode: boardPanelConfig.scaleMode ?? 'density',
    boardPanelDprReference: boardPanelConfig.dprReference ?? 2,
    boardPanelDprMinFactor: boardPanelConfig.dprMinFactor ?? 0.8,
    boardPanelDprMaxFactor: boardPanelConfig.dprMaxFactor ?? 1.25,
    rackSlotAspect: UI_ASSET_ASPECT_RATIOS.CONTAINER_NEXT_PIECE
  });

  const queueLevelIntro = useCallback((
    grid: GameState['grid'],
    boosters: Booster[] = [],
    minLoadingMs = 650
  ) => {
    const requestId = ++introRequestIdRef.current;
    setShowLoadingScreen(true);
    setIsInteractionLocked(true);
    setIntroRequest({
      id: requestId,
      blocks: collectGridBlocksForIntro(grid, boosters),
      boosters: boosters.map(booster => ({ ...booster })),
      minLoadingMs
    });
  }, []);

  useEffect(() => {
    bootIntroQueuedRef.current = false;
    introRequestIdRef.current = 0;
    pendingIncomingBlocksRef.current = null;
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
      await preloadAudio('blocksIncoming');
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

  // Animation Loop
  useEffect(() => {
    let animationFrameId: number;
    const updateEffects = () => {
      setParticles(prev => {
        if (prev.length === 0) return prev;
        return prev.map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.5, // Gravity
          life: p.life - 1
        })).filter(p => p.life > 0);
      });

      setFloatingTexts(prev => {
        if (prev.length === 0) return prev;
        return prev.map(t => ({
          ...t,
          y: t.y - 1.5, // Float up
          life: t.life - 1
        })).filter(t => t.life > 0);
      });

      // Update returning piece animation
      setReturningPiece(prev => {
        if (!prev) return prev;
        const newProgress = prev.progress + 0.12; // Fast animation
        if (newProgress >= 1) {
          return null; // Animation complete
        }
        return { ...prev, progress: newProgress };
      });

      animationFrameId = requestAnimationFrame(updateEffects);
    };
    animationFrameId = requestAnimationFrame(updateEffects);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Sync high score
  useEffect(() => {
    if (gameState.score > gameState.highScore) {
      setGameState(prev => ({ ...prev, highScore: prev.score }));
      localStorage.setItem('highScore', gameState.score.toString());
    }
  }, [gameState.score, gameState.highScore]);

  // Start celebration when level is complete
  useEffect(() => {
    if (gameState.levelComplete && !celebrating && !showLevelPopup) {
      // Small delay before starting celebration
      setTimeout(() => startCelebration(), 500);
    }
  }, [gameState.levelComplete]);

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

  // Handle case when only boosters remain - spawn new tiles if objectives not complete
  const handleOnlyBoostersLeft = () => {
    setGameState(prev => {
      if (prev.levelComplete) return prev;

      // Regenerate tiles around boosters, avoiding booster positions
      const boosterPositions = new Set(prev.boosters.map(b => `${b.x},${b.y}`));
      const levelConfig = getLevelConfig(prev.level);
      const levelColors = getColorsForLevel(prev.level);

      const newGrid: (typeof prev.grid) = prev.grid.map(row => [...row]);

      // Fill empty cells (not occupied by boosters) with new tiles
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (newGrid[y][x] === null && !boosterPositions.has(`${x},${y}`)) {
            if (Math.random() < levelConfig.gridFill) {
              newGrid[y][x] = {
                color: levelColors[Math.floor(Math.random() * levelColors.length)],
                id: `regen-${Date.now()}-${x}-${y}`
              };
            }
          }
        }
      }

      // Ensure we spawned at least some tiles
      let tileCount = 0;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (newGrid[y][x] !== null) tileCount++;
        }
      }

      // If too few tiles, force spawn more
      if (tileCount < 10) {
        const emptyPositions: { x: number; y: number }[] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            if (newGrid[y][x] === null && !boosterPositions.has(`${x},${y}`)) {
              emptyPositions.push({ x, y });
            }
          }
        }
        // Shuffle and fill first 15 positions
        emptyPositions.sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(15, emptyPositions.length); i++) {
          const pos = emptyPositions[i];
          newGrid[pos.y][pos.x] = {
            color: levelColors[Math.floor(Math.random() * levelColors.length)],
            id: `regen-${Date.now()}-${pos.x}-${pos.y}`
          };
        }
      }

      const newHand = generateValidHand(newGrid, prev.level);

      return {
        ...prev,
        grid: newGrid,
        hand: newHand
      };
    });
  };

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

  // Get cells that would be affected by a booster
  const getBoosterAffectedCells = (booster: Booster): Set<string> => {
    const affected = new Set<string>();
    const grid = gameState.grid;

    if (booster.type === 'rocket_h') {
      // Entire row only
      for (let i = 0; i < GRID_SIZE; i++) {
        affected.add(`${i},${booster.y}`);
      }
    } else if (booster.type === 'rocket_v') {
      // Entire column only
      for (let i = 0; i < GRID_SIZE; i++) {
        affected.add(`${booster.x},${i}`);
      }
    } else if (booster.type === 'line_bomb') {
      // Entire row and column
      for (let i = 0; i < GRID_SIZE; i++) {
        affected.add(`${i},${booster.y}`); // Row
        affected.add(`${booster.x},${i}`); // Column
      }
    } else if (booster.type === 'bomb') {
      // 1 layer around (8 neighbors + center)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = booster.x + dx;
          const ny = booster.y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
            affected.add(`${nx},${ny}`);
          }
        }
      }
    } else if (booster.type === 'color_ball') {
      // Prefer booster color; if unavailable, fallback to the most abundant color on board.
      const targetColor = resolveSuperballTargetColor(grid, booster.color);
      if (targetColor) {
        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x]?.color === targetColor) {
              affected.add(`${x},${y}`);
            }
          }
        }
      }
      // Also include the booster position
      affected.add(`${booster.x},${booster.y}`);
    }

    return affected;
  };

  // Chain explosion celebration when level is complete
  const startCelebration = () => {
    setCelebrating(true);
    audio.play('levelComplete');

    const boosters = [...gameState.boosters];
    const boosterDelay = 400; // ms between booster activations

    // Phase 1: Activate all boosters first
    if (boosters.length > 0) {
      boosters.forEach((booster, index) => {
        setTimeout(() => {
          // Trigger booster explosion visually
          celebrationBoosterExplosion(booster);

          // After last booster, start phase 2
          if (index === boosters.length - 1) {
            setTimeout(() => {
              explodeRemainingBlocks();
            }, 500);
          }
        }, index * boosterDelay);
      });
    } else {
      // No boosters, go directly to phase 2
      explodeRemainingBlocks();
    }
  };

  // Explode a booster during celebration (simplified version)
  const celebrationBoosterExplosion = (booster: Booster) => {
    // Use getBoosterAffectedCells to get the affected points
    const affectedSet = getBoosterAffectedCells(booster);
    const affectedPoints: Point[] = Array.from(affectedSet).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });

    // Show indicator
    const previewCells = new Set(affectedPoints.map(p => `${p.x},${p.y}`));
    const previewColor = booster.type === 'rocket_h' || booster.type === 'rocket_v' ? 'rgba(239, 68, 68, 0.3)'
      : booster.type === 'line_bomb' ? 'rgba(59, 130, 246, 0.3)'
      : booster.type === 'bomb' ? 'rgba(249, 115, 22, 0.3)'
      : 'rgba(168, 85, 247, 0.3)';

    setAffectedCells(previewCells);
    setAffectedColor(previewColor);

    // Spawn particles and clear affected cells
    if (boardRef.current) {
      setGameState(prev => {
        const newGrid = prev.grid.map(row => [...row]);
        let scoreBonus = 0;

        affectedPoints.forEach(p => {
          const cell = newGrid[p.y]?.[p.x];
          if (cell) {
            const metrics = getCellMetrics(p.x, p.y);
            if (metrics) {
              spawnParticles(metrics.centerX, metrics.centerY, cell.color, 6);
            }
            newGrid[p.y][p.x] = null;
            scoreBonus += 10;
          }
        });

        // Remove the booster
        const newBoosters = prev.boosters.filter(b => b.id !== booster.id);

        return {
          ...prev,
          grid: newGrid,
          boosters: newBoosters,
          score: prev.score + scoreBonus
        };
      });
    }

    triggerShake();

    // Clear indicator
    setTimeout(() => {
      setAffectedCells(new Set());
      setAffectedColor('transparent');
    }, 300);
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
        // No blocks left, show popup
        setTimeout(() => {
          setCelebrating(false);
          setShowLevelPopup(true);
        }, 300);
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
            }, 300);
          }
        }, index * delay);
      });

      return prev;
    });
  };

  const handleRestart = () => {
    const initialLevel = 1;
    const levelConfig = getLevelConfig(initialLevel);
    const initialGrid = createRandomGrid(levelConfig.gridFill, initialLevel);
    setGameState({
      grid: initialGrid,
      boosters: [],
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
    setFloatingTexts([]);
    setCelebrating(false);
    setShowLevelPopup(false);
    setShowAllClear(false);
    setShowOutOfMovesPopup(false);
    setTrashUses(1);
    setShuffleUses(3);
    setDeleteBlockUses(3);
    setWildcardUses(3);
    queueLevelIntro(initialGrid, [], 650);
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
    setFloatingTexts([]);
    setCelebrating(false);
    setShowLevelPopup(false);
    setShowAllClear(false);
    setShowOutOfMovesPopup(false);
    setTrashUses(1);
    setShuffleUses(3);
    setDeleteBlockUses(3);
    setWildcardUses(3);
    queueLevelIntro(newGrid, [], 650);
  };

  // Handle deleting a single block from the board
  const handleDeleteBlock = (x: number, y: number) => {
    const tile = gameState.grid[y][x];
    if (!tile) return;

    setDeleteBlockMode(false);
    setDeleteBlockUses(prev => prev - 1);

    // Spawn particles at the tile position
    if (boardRef.current) {
      const metrics = getCellMetrics(x, y);
      if (metrics) {
        spawnParticles(metrics.centerX, metrics.centerY, tile.color, 8);

        // Show floating text
        setFloatingTexts(prev => [...prev, {
          id: `delete-${Date.now()}`,
          text: '+15',
          x: metrics.centerX,
          y: metrics.centerY,
          color: tile.color
        }]);
      }
    }

    triggerShake();
    audio.play('match');

    // Add to clearing tiles for animation
    setGameState(prev => {
      const newObjectives = prev.objectives.map(obj =>
        obj.color === tile.color
          ? { ...obj, current: Math.min(obj.target, obj.current + 1) }
          : obj
      );
      const isLevelComplete = newObjectives.slice(0, 2).every(obj => obj.current >= obj.target);

      return {
        ...prev,
        clearingTiles: [tile.id],
        score: prev.score + 15,
        objectives: newObjectives,
        levelComplete: isLevelComplete
      };
    });

    // Remove tile after animation
    setTimeout(() => {
      setGameState(prev => {
        const newGrid = prev.grid.map(row => [...row]);
        newGrid[y][x] = null;
        return {
          ...prev,
          grid: newGrid,
          clearingTiles: []
        };
      });
    }, 200);
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

    // Play wildcard sound
    audio.play('createBooster');

    // Spawn particles at the tile position
    if (boardRef.current) {
      const metrics = getCellMetrics(x, y);
      if (metrics) {
        spawnParticles(metrics.centerX, metrics.centerY, bestColor, 6);
      }
    }

    // Update the tile color and check for matches
    const newGrid = gameState.grid.map(row => [...row]);
    newGrid[y][x] = { ...tile, color: bestColor };

    // Check for matches after color change
    const matchGroups = findMatchGroups(newGrid);

    if (matchGroups.length > 0) {
      // Collect all cleared points
      let allClearedPoints: Point[] = [];
      matchGroups.forEach(group => {
        group.forEach(p => {
          if (!allClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
            allClearedPoints.push(p);
          }
        });
      });

      // Count colors for objectives
      const colorCounts: Record<string, number> = {};
      allClearedPoints.forEach(p => {
        const cell = newGrid[p.y][p.x];
        if (cell) {
          colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1;
        }
      });

      // Update objectives
      const newObjectives = gameState.objectives.map(obj => ({
        ...obj,
        current: Math.min(obj.target, obj.current + (colorCounts[obj.color] || 0))
      }));

      const isLevelComplete = newObjectives.slice(0, 2).every(obj => obj.current >= obj.target);
      const matchingIds = allClearedPoints.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

      // Spawn particles for cleared blocks
      if (boardRef.current) {
        allClearedPoints.forEach(p => {
          const cell = newGrid[p.y][p.x];
          if (cell) {
            const metrics = getCellMetrics(p.x, p.y);
            if (metrics) {
              spawnParticles(metrics.centerX, metrics.centerY, cell.color, 6);
            }
          }
        });
      }

      triggerShake();
      audio.play('match');

      setGameState(prev => ({
        ...prev,
        grid: newGrid,
        clearingTiles: matchingIds,
        objectives: newObjectives,
        levelComplete: isLevelComplete
      }));

      // Clear tiles after animation
      setTimeout(() => {
        setGameState(prev => {
          let finalGrid = prev.grid.map(row =>
            row.map(cell => cell && matchingIds.includes(cell.id) ? null : cell)
          );

          // Add random blocks to maintain coverage
          const levelConfig = getLevelConfig(prev.level);
          const totalCells = GRID_SIZE * GRID_SIZE;
          const targetTiles = Math.floor(totalCells * levelConfig.gridFill);
          const currentTiles = finalGrid.flat().filter(cell => cell !== null).length;
          const blocksToAdd = Math.max(1, Math.min(3, targetTiles - currentTiles));
          const boosterPositions = prev.boosters.map(b => ({ x: b.x, y: b.y }));
          const result = addRandomBlocks(finalGrid, blocksToAdd, prev.level, boosterPositions);
          finalGrid = result.grid;

          if (result.addedBlocks.length > 0) {
            pendingIncomingBlocksRef.current = result.addedBlocks;
          }

          return {
            ...prev,
            grid: finalGrid,
            clearingTiles: []
          };
        });
      }, 400);
    } else {
      // No match, just update color
      setGameState(prev => ({
        ...prev,
        grid: newGrid
      }));
    }
  };

  // Handle clicking on a booster to activate it
  const activateBooster = (booster: Booster) => {
    if (isInteractionLocked) return;
    if (celebrating || showLevelPopup || showAllClear || gameState.gameOver) return;
    if (affectedCells.size > 0 || superballAnimation) return; // Already activating

    // Special animation for color_ball (superball)
    if (booster.type === 'color_ball') {
      const affected = getBoosterAffectedCells(booster);
      setSuperballAnimation({ booster, affectedCells: affected, phase: 'buildup' });
      audio.play('superballCharge', undefined, 0.8);

      // After buildup animation (1.5s), explode
      setTimeout(() => {
        setSuperballAnimation(null);
        audio.play('superball', 0.25);
        executeBoosterExplosion(booster);
      }, 1500);
      return;
    }

    // Calculate affected cells for visual indicator
    const previewCells = getBoosterAffectedCells(booster);
    const previewColor = booster.type === 'rocket_h' || booster.type === 'rocket_v' ? 'rgba(239, 68, 68, 0.3)'
      : booster.type === 'line_bomb' ? 'rgba(59, 130, 246, 0.3)'
      : booster.type === 'bomb' ? 'rgba(249, 115, 22, 0.3)'
      : 'rgba(168, 85, 247, 0.3)';

    // Show affected area indicator (will fade out via CSS)
    setAffectedCells(previewCells);
    setAffectedColor(previewColor);

    // Clear indicator after fade animation
    setTimeout(() => {
      setAffectedCells(new Set());
      setAffectedColor('transparent');
    }, 400);

    // Execute explosion immediately (simultaneous with indicator)
    audio.play('activateBooster', 0.15);
    executeBoosterExplosion(booster);
  };

  // Get points affected by a booster explosion
  const getBoosterExplosionPoints = (booster: Booster, grid: (typeof gameState.grid)): Point[] => {
    const points: Point[] = [];
    if (booster.type === 'rocket_h') {
      // Entire row
      for (let i = 0; i < GRID_SIZE; i++) {
        points.push({ x: i, y: booster.y });
      }
    } else if (booster.type === 'rocket_v') {
      // Entire column
      for (let i = 0; i < GRID_SIZE; i++) {
        points.push({ x: booster.x, y: i });
      }
    } else if (booster.type === 'line_bomb') {
      for (let i = 0; i < GRID_SIZE; i++) {
        points.push({ x: i, y: booster.y }); // Row
        if (i !== booster.y) points.push({ x: booster.x, y: i }); // Column
      }
    } else if (booster.type === 'bomb') {
      // 8 neighbors + center
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = booster.x + dx;
          const ny = booster.y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
            points.push({ x: nx, y: ny });
          }
        }
      }
    } else if (booster.type === 'color_ball') {
      const targetColor = resolveSuperballTargetColor(grid, booster.color);
      if (targetColor) {
        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x]?.color === targetColor) {
              points.push({ x, y });
            }
          }
        }
      }
      points.push({ x: booster.x, y: booster.y }); // Include booster position
    }
    return points;
  };

  // Execute the actual booster explosion with CHAIN REACTIONS
  const executeBoosterExplosion = (initialBooster: Booster) => {
    const newGrid = gameState.grid.map(row => [...row]);
    let currentBoosters = [...gameState.boosters];
    let allPointsToRemove: Point[] = [];
    let totalScore = 0;
    let chainCount = 0;

    // Queue of boosters to explode
    const boosterQueue: Booster[] = [initialBooster];
    const explodedBoosterIds = new Set<string>();

    while (boosterQueue.length > 0) {
      const booster = boosterQueue.shift()!;
      if (explodedBoosterIds.has(booster.id)) continue;
      explodedBoosterIds.add(booster.id);
      chainCount++;

      let effectText = '';
      let bonusMultiplier = 1;

      if (booster.type === 'line_bomb') {
        effectText = '💣 LINE BLAST!';
        bonusMultiplier = 1.5;
      } else if (booster.type === 'bomb') {
        effectText = '💥 BOOM!';
        bonusMultiplier = 2;
      } else if (booster.type === 'color_ball') {
        effectText = '⚡ COLOR BLAST!';
        bonusMultiplier = 3;
      }

      const pointsFromThisBooster = getBoosterExplosionPoints(booster, newGrid);

      // Spawn visuals for this booster
      if (boardRef.current) {
        const boosterMetrics = getCellMetrics(booster.x, booster.y);
        if (!boosterMetrics) continue;
        const boosterCenterX = boosterMetrics.centerX;
        const boosterCenterY = boosterMetrics.centerY;

        // Particles for the booster itself (5 colors burst for superball)
        if (booster.type === 'color_ball') {
          const gameColors = ['#3b82f6', '#22c55e', '#a855f7', '#eab308', '#f97316']; // Blue, Green, Purple, Yellow, Orange
          for (let i = 0; i < 4; i++) {
            setTimeout(() => {
              gameColors.forEach(color => {
                spawnParticles(boosterCenterX, boosterCenterY, color, 6, 0.5);
              });
            }, i * 40);
          }
        }

        // Particles for each exploded block
        pointsFromThisBooster.forEach(p => {
          const tile = newGrid[p.y]?.[p.x];
          if (tile) {
            const metrics = getCellMetrics(p.x, p.y);
            if (metrics) {
              spawnParticles(metrics.centerX, metrics.centerY, tile.color, 8);
            }
          }
        });

        spawnFloatingText(boosterCenterX, boosterCenterY - 20, effectText);
        if (chainCount > 1) {
          spawnFloatingText(boosterCenterX, boosterCenterY + 30, `CHAIN x${chainCount}!`);
        }
      }

      // Check for OTHER boosters in the explosion radius
      pointsFromThisBooster.forEach(p => {
        const hitBooster = currentBoosters.find(b => b.x === p.x && b.y === p.y && !explodedBoosterIds.has(b.id));
        if (hitBooster) {
          boosterQueue.push(hitBooster);
        }
      });

      // Collect points - unlock locked tiles, remove unlocked ones
      let tilesCleared = 0;
      pointsFromThisBooster.forEach(p => {
        const tile = newGrid[p.y]?.[p.x];
        if (tile) {
          if (tile.locked) {
            // Unlock the tile instead of removing it
            newGrid[p.y][p.x] = { ...tile, locked: false };
            // Spawn unlock visual
            if (boardRef.current) {
              const metrics = getCellMetrics(p.x, p.y);
              if (metrics) {
                spawnFloatingText(metrics.centerX, metrics.centerY, '🔓');
              }
            }
          } else {
            // Remove unlocked tile
            if (!allPointsToRemove.some(cp => cp.x === p.x && cp.y === p.y)) {
              allPointsToRemove.push(p);
              tilesCleared++;
            }
          }
        }
      });

      totalScore += Math.round(tilesCleared * 15 * bonusMultiplier);

      // Remove booster from list
      currentBoosters = currentBoosters.filter(b => b.id !== booster.id);
    }

    // Count colors for objectives
    const colorCounts: Record<string, number> = {};
    allPointsToRemove.forEach(p => {
      const tile = newGrid[p.y][p.x];
      if (tile) {
        colorCounts[tile.color] = (colorCounts[tile.color] || 0) + 1;
      }
    });

    // Update objectives
    const newObjectives = gameState.objectives.map(obj => ({
      ...obj,
      current: Math.min(obj.target, obj.current + (colorCounts[obj.color] || 0))
    }));

    const isLevelComplete = newObjectives.slice(0, 2).every(obj => obj.current >= obj.target);

    // Collect IDs for animation
    const matchingIds = allPointsToRemove.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

    // Show total score
    if (boardRef.current && allPointsToRemove.length > 0) {
      const avgX = allPointsToRemove.reduce((acc, p) => acc + p.x, 0) / allPointsToRemove.length;
      const avgY = allPointsToRemove.reduce((acc, p) => acc + p.y, 0) / allPointsToRemove.length;
      const board = boardRef.current;
      const centerMetrics = getBoardCellMetrics(board, avgX, avgY);
      spawnFloatingText(centerMetrics.centerX, centerMetrics.centerY, `+${totalScore}`);
    }

    triggerShake();

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      boosters: currentBoosters,
      score: prev.score + totalScore,
      clearingTiles: matchingIds,
      objectives: newObjectives,
      levelComplete: isLevelComplete
    }));

    // Remove tiles after animation
    setTimeout(() => {
      setGameState(prev => {
        let finalGrid = prev.grid.map(row => [...row]);
        allPointsToRemove.forEach(p => {
          finalGrid[p.y][p.x] = null;
        });

        // Check for ALL CLEAR
        if (isGridEmpty(finalGrid, prev.boosters)) {
          setTimeout(() => handleAllClear(), 100);
          return {
            ...prev,
            grid: finalGrid,
            clearingTiles: []
          };
        }

        // Check if only boosters remain - spawn new tiles if objectives not complete
        if (hasOnlyBoostersLeft(finalGrid, prev.boosters) && !prev.levelComplete) {
          setTimeout(() => handleOnlyBoostersLeft(), 100);
          return { ...prev, grid: finalGrid, clearingTiles: [] };
        }

        // Booster counts as "match" - no new blocks added
        const lost = !prev.levelComplete && isGameOver(finalGrid, prev.hand, prev.boosters);
        return {
          ...prev,
          grid: finalGrid,
          clearingTiles: [],
          gameOver: lost
        };
      });
    }, 400);
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

  const canPieceCreateMatchWithBoosters = (
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
        const createsOwnMatch = groups.some(group =>
          group.some(point => placedKeys.has(`${point.x},${point.y}`))
        );
        if (createsOwnMatch) {
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
      if (canPieceCreateMatchWithBoosters(grid, candidate, boosters)) {
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
    if (isInteractionLocked) return;
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
    if (isInteractionLocked) return;
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

    // Collect all cleared points
    const pointsToClear: { x: number; y: number; color: Color }[] = [];
    matchGroups.forEach(group => {
      group.forEach(p => {
        if (!pointsToClear.some(cp => cp.x === p.x && cp.y === p.y)) {
          const tile = newGrid[p.y][p.x];
          if (tile) {
            pointsToClear.push({ x: p.x, y: p.y, color: tile.color });
          }
        }
      });
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
      const avgX = pointsToClear.reduce((acc, p) => acc + p.x, 0) / pointsToClear.length;
      const avgY = pointsToClear.reduce((acc, p) => acc + p.y, 0) / pointsToClear.length;
      const centerMetrics = getBoardCellMetrics(boardRef.current, avgX, avgY);
      spawnFloatingText(centerMetrics.centerX, centerMetrics.centerY, `+${totalScore}`);
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
        grid: newGrid,
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

        const lost = !prev.levelComplete && isGameOver(finalGrid, prev.hand, prev.boosters);
        return { ...prev, grid: finalGrid, clearingTiles: [], gameOver: lost };
      });
    }, 400);
  };

  // Auto-resolve matches generated by system actions (level formation/spawn/shuffle)
  // so they don't require an extra user move to trigger.
  useEffect(() => {
    if (isInteractionLocked || showLoadingScreen || isIntroArrivalActive || introRequest) return;
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
    isInteractionLocked,
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
    if (isInteractionLocked || showLoadingScreen || isIntroArrivalActive || introRequest) return;
    if (gameState.gameOver || gameState.levelComplete) return;
    if (gameState.clearingTiles.length > 0) return;
    if (shuffleAnimations.length > 0 || shufflePhase || superballAnimation) return;
    if (celebrating || showLevelPopup || showAllClear || showOutOfMovesPopup) return;

    const noValidPlacements = isGameOver(gameState.grid, gameState.hand, gameState.boosters);
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
    isInteractionLocked,
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
    if (isInteractionLocked) return;
    if (gameState.hand[index] === null || gameState.gameOver || celebrating || showLevelPopup || showAllClear || trashingAllPieces) return;

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
    if (isInteractionLocked) return;
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
      const visualY = e.clientY - getDragOffsetY();

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
    if (isInteractionLocked) return;
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
          fromY: dragPosition.y - getDragOffsetY(),
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

        // Determine booster based on TOTAL blocks cleared (sum of all colors)
        const boostersToCreate: Booster[] = [];
        const totalForBooster = allClearedPoints.length;

        // Count unique colors in cleared points
        const clearedColorSet = new Set<Color>();
        allClearedPoints.forEach(p => {
          const cell = newGrid[p.y][p.x];
          if (cell) clearedColorSet.add(cell.color);
        });
        const uniqueColorsCleared = clearedColorSet.size;

        if (totalForBooster >= 4) {
          // Find center of ALL cleared points for booster placement
          const avgX = allClearedPoints.reduce((acc, p) => acc + p.x, 0) / totalForBooster;
          const avgY = allClearedPoints.reduce((acc, p) => acc + p.y, 0) / totalForBooster;

          // Find the actual point closest to center
          let centerPoint = allClearedPoints[0];
          let minDist = Infinity;
          allClearedPoints.forEach(p => {
            const dist = Math.abs(p.x - avgX) + Math.abs(p.y - avgY);
            if (dist < minDist) {
              minDist = dist;
              centerPoint = p;
            }
          });

          const centerCell = newGrid[centerPoint.y][centerPoint.x];

          if (totalForBooster >= 6 && uniqueColorsCleared >= 2 && centerCell) {
            // Superball - 6+ blocks with 2+ colors: eliminates all of most common color on grid
            const gridColorCounts: Record<string, number> = {};
            const clearedSet = new Set(allClearedPoints.map(p => `${p.x},${p.y}`));
            for (let gy = 0; gy < GRID_SIZE; gy++) {
              for (let gx = 0; gx < GRID_SIZE; gx++) {
                const cell = newGrid[gy][gx];
                if (cell && !clearedSet.has(`${gx},${gy}`)) {
                  gridColorCounts[cell.color] = (gridColorCounts[cell.color] || 0) + 1;
                }
              }
            }
            const mostCommonGridColor = Object.entries(gridColorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as Color || centerCell.color;

            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'color_ball',
              x: centerPoint.x,
              y: centerPoint.y,
              color: mostCommonGridColor
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          } else if (totalForBooster >= 6 && centerCell) {
            // Bomb - 6+ blocks (single color): eliminates 1 layer around
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'bomb',
              x: centerPoint.x,
              y: centerPoint.y,
              color: centerCell.color
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          } else if (totalForBooster === 5 && centerCell) {
            // Line bomb - 5 blocks: eliminates row + column
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'line_bomb',
              x: centerPoint.x,
              y: centerPoint.y,
              color: centerCell.color
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          } else if (totalForBooster === 4 && centerCell) {
            // Rocket - 4 blocks: eliminates one direction (random H or V)
            const isHorizontal = Math.random() < 0.5;
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: isHorizontal ? 'rocket_h' : 'rocket_v',
              x: centerPoint.x,
              y: centerPoint.y,
              color: centerCell.color
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          }
        }

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

            const lost = !prev.levelComplete && isGameOver(finalGrid, prev.hand, prev.boosters);
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

        const noValidMoves = isGameOver(gridWithNewBlocks, newHand, gameState.boosters);

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
  const fallbackLayoutWidth = typeof window === 'undefined'
    ? 390
    : Math.min(window.innerWidth, window.innerHeight * (9 / 16));
  const layoutWidthPx = layoutRef.current?.clientWidth ?? fallbackLayoutWidth;
  const headerPanelWidthPx = Math.max(1, layoutWidthPx * (responsive.boardWidthPercent / 100));
  const headerPanelAspectRatio = headerPanelConfig.aspectRatio ?? (5 / 1.5);
  const headerPanelHeightPx = headerPanelWidthPx / Math.max(0.1, headerPanelAspectRatio);
  const headerPanelPaddingY = Math.max(6, headerPanelHeightPx * 0.11);
  const headerPanelPaddingX = Math.max(10, headerPanelWidthPx * 0.045);
  const headerBadgeFontSize = Math.max(12, headerPanelHeightPx * 0.23);
  const headerBadgePadX = Math.max(9, headerPanelHeightPx * 0.18);
  const headerBadgePadY = Math.max(5, headerPanelHeightPx * 0.08);
  const headerMovesValueSize = Math.max(18, headerPanelHeightPx * 0.32);
  const headerMovesLabelSize = Math.max(8, headerPanelHeightPx * 0.11);
  const headerAudioButtonSize = Math.max(30, headerPanelHeightPx * 0.34);
  const headerAudioIconSize = Math.max(14, headerPanelHeightPx * 0.14);
  const headerTopRowGap = Math.max(6, headerPanelHeightPx * 0.08);
  const objectiveIconSize = Math.max(15, headerPanelHeightPx * 0.21);
  const objectiveBarHeight = objectiveIconSize;
  const objectiveBarWidth = Math.max(72, headerPanelWidthPx * 0.26);
  const objectiveRowGap = Math.max(8, headerPanelWidthPx * 0.025);
  const objectiveGroupGap = Math.max(6, headerPanelWidthPx * 0.014);
  const objectiveTrackSource = gameState.objectives[1]?.color ?? gameState.objectives[0]?.color ?? '#3b82f6';
  const objectiveTrackColor = isIconPath(objectiveTrackSource)
    ? getParticleColor(objectiveTrackSource)
    : objectiveTrackSource;
  const headerVolumeBg = toRgba(objectiveTrackColor, 0.32);
  const headerVolumeBorder = toRgba(objectiveTrackColor, 0.45);
  const headerVolumeIconColor = musicEnabled ? 'rgba(255, 255, 255, 0.92)' : 'rgba(226, 232, 240, 0.62)';

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
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%',
          paddingLeft: `${responsive.layoutPadding}px`,
          paddingRight: `${responsive.layoutPadding}px`,
          paddingBottom: `${responsive.layoutPadding}px`,
          paddingTop: `calc(${responsive.layoutPadding + (responsive.layoutGap * 2.8)}px + env(safe-area-inset-top, 0px))`
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
              borderRadius: '4px',
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
        widthPercent={responsive.boardWidthPercent}
        className="relative shadow-xl overflow-hidden"
        style={{
          marginBottom: `${responsive.layoutGap}px`,
          padding: `${headerPanelPaddingY}px ${headerPanelPaddingX}px`
        }}
      >
        {/* Top row: Level left, Moves centered to panel width, Audio right */}
        <div
          className="grid grid-cols-[1fr_auto_1fr] items-center"
          style={{ marginBottom: `${headerTopRowGap}px` }}
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

        {/* Objectives - only show first 2 */}
        <div className="flex justify-center" style={{ gap: `${objectiveRowGap}px` }}>
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
                        className={`font-bold leading-none ${isComplete ? 'text-green-100' : 'text-white'}`}
                        style={{ fontSize: `${Math.max(11, Math.round(objectiveIconSize * 0.58))}px` }}
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
      </ResponsiveNineSlicePanel>

      <div className="flex flex-1 w-full min-h-0 flex-col items-center justify-center">
        {/* Game Board Container */}
        <ResponsiveNineSlicePanel
          ref={boardRef}
          src={boardPanelSrc}
          {...boardPanelConfig}
          widthPercent={responsive.boardWidthPercent}
          className={`relative shadow-2xl ${isShaking ? 'shake-animation' : ''}`}
          style={{
            padding: `${responsive.boardInnerPadding}px`,
            marginBottom: `${responsive.layoutGap}px`,
            zIndex: deleteBlockMode || wildcardMode ? 60 : (shufflePhase || superballAnimation ? 40 : undefined)
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
              const isSuperballTarget = superballAnimation && superballAnimation.affectedCells.has(`${x},${y}`) && !(booster?.type === 'color_ball');

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
                    if (isInteractionLocked) return;
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
                    ${booster && !hideStaticForIntro && !isBoosterFlying && !shufflePhase && !deleteBlockMode && !wildcardMode && !superballAnimation ? 'cursor-pointer active:scale-95' : ''}
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
                        <img
                          src={UI_ASSETS.SUPERBALL}
                          alt="Superball"
                          className={`w-[85%] h-[85%] object-contain ${superballAnimation?.booster.id === booster.id ? 'superball-buildup' : ''}`}
                          style={{
                            visibility: superballAnimation?.phase === 'buildup' && superballAnimation.booster.id === booster.id ? 'hidden' : 'visible',
                            filter: 'none',
                            animation: superballAnimation?.booster.id === booster.id
                              ? 'superballBuildup 1.5s ease-in forwards'
                              : 'none'
                          }}
                        />
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
            top: dragPosition.y - getDragOffsetY()
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
          {gameState.hand.map((piece, index) => (
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
                onPointerDown={(e) => startDragging(e, index)}
                className="flex items-center justify-center w-full h-full touch-none cursor-grab"
                style={{ transform: 'scale(0.95)' }}
              >
                {piece && gameState.selectedPieceIndex !== index && returningPiece?.index !== index && (
                  <PiecePreview piece={piece} active={false} containerSize={responsive.rackPieceSize * 0.82} />
                )}
              </div>
            </div>
          ))}
        </div>
        </ResponsiveNineSlicePanel>
      </div>

      {/* Reserve bottom space in normal flow so fixed powerups never overlap content */}
      <div style={{ height: `${responsive.reservedBottomSpace}px`, flexShrink: 0 }} />

      {/* Powerup Buttons - Fixed at bottom */}
      <div
        className="fixed left-1/2 z-20 flex -translate-x-1/2 justify-center"
        style={{
          pointerEvents: isEndGameModalVisible ? 'none' : undefined,
          bottom: `${responsive.powerupBottomOffset}px`,
          width: `${responsive.powerupRowWidth}px`,
          gap: `${responsive.powerupGap}px`,
          paddingTop: `${responsive.powerupTopPadding}px`,
          paddingBottom: `${responsive.powerupBottomPadding}px`
        }}
      >
        {/* Delete Block Button */}
        <button
          onClick={() => !isInteractionLocked && deleteBlockUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && setDeleteBlockMode(true)}
          disabled={isInteractionLocked || deleteBlockUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${deleteBlockUses > 0 && !deleteBlockMode && !wildcardMode ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${responsive.powerupButtonSize}px`, height: `${responsive.powerupButtonSize}px` }}
        >
          <i className="fa-solid fa-crosshairs text-white" style={{ fontSize: `${responsive.powerupIconSize}px` }}></i>
          {deleteBlockUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${responsive.powerupBadgeSize}px`,
                height: `${responsive.powerupBadgeSize}px`,
                top: `${-responsive.powerupBadgeSize * 0.22}px`,
                right: `${-responsive.powerupBadgeSize * 0.22}px`,
                fontSize: `${responsive.powerupBadgeFontSize}px`
              }}
            >
              {deleteBlockUses}
            </div>
          )}
        </button>

        {/* Wildcard Button */}
        <button
          onClick={() => !isInteractionLocked && wildcardUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && setWildcardMode(true)}
          disabled={isInteractionLocked || wildcardUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${wildcardUses > 0 && !wildcardMode && !deleteBlockMode ? 'bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg shadow-yellow-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${responsive.powerupButtonSize}px`, height: `${responsive.powerupButtonSize}px` }}
        >
          <i className="fa-solid fa-wand-magic-sparkles text-white" style={{ fontSize: `${responsive.powerupIconSize}px` }}></i>
          {wildcardUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${responsive.powerupBadgeSize}px`,
                height: `${responsive.powerupBadgeSize}px`,
                top: `${-responsive.powerupBadgeSize * 0.22}px`,
                right: `${-responsive.powerupBadgeSize * 0.22}px`,
                fontSize: `${responsive.powerupBadgeFontSize}px`
              }}
            >
              {wildcardUses}
            </div>
          )}
        </button>

        {/* Shuffle Button */}
        <button
          onClick={() => !isInteractionLocked && shuffleUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && activateShuffle()}
          disabled={isInteractionLocked || shuffleUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${shuffleUses > 0 && !shufflePhase && !deleteBlockMode && !wildcardMode ? 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${responsive.powerupButtonSize}px`, height: `${responsive.powerupButtonSize}px` }}
        >
          <i className="fa-solid fa-shuffle text-white" style={{ fontSize: `${responsive.powerupIconSize}px` }}></i>
          {shuffleUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${responsive.powerupBadgeSize}px`,
                height: `${responsive.powerupBadgeSize}px`,
                top: `${-responsive.powerupBadgeSize * 0.22}px`,
                right: `${-responsive.powerupBadgeSize * 0.22}px`,
                fontSize: `${responsive.powerupBadgeFontSize}px`
              }}
            >
              {shuffleUses}
            </div>
          )}
        </button>

        {/* Refresh Button (was Trash) */}
        <button
          onClick={() => !isInteractionLocked && trashUses > 0 && !shufflePhase && !trashingAllPieces && !deleteBlockMode && !wildcardMode && activateTrash()}
          disabled={isInteractionLocked || trashUses <= 0 || !!shufflePhase || trashingAllPieces || deleteBlockMode || wildcardMode}
          className={`
            rounded-full flex items-center justify-center relative
            transition-all duration-200 active:scale-95
            ${trashUses > 0 && !trashingAllPieces && !deleteBlockMode && !wildcardMode ? 'bg-gradient-to-br from-red-500 to-orange-600 shadow-lg shadow-red-500/30' : 'bg-slate-700 opacity-50'}
          `}
          style={{ width: `${responsive.powerupButtonSize}px`, height: `${responsive.powerupButtonSize}px` }}
        >
          <i className="fa-solid fa-rotate text-white" style={{ fontSize: `${responsive.powerupIconSize}px` }}></i>
          {trashUses > 0 && (
            <div
              className="absolute bg-yellow-400 rounded-full flex items-center justify-center font-bold text-black"
              style={{
                width: `${responsive.powerupBadgeSize}px`,
                height: `${responsive.powerupBadgeSize}px`,
                top: `${-responsive.powerupBadgeSize * 0.22}px`,
                right: `${-responsive.powerupBadgeSize * 0.22}px`,
                fontSize: `${responsive.powerupBadgeFontSize}px`
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
      {superballAnimation?.phase === 'buildup' && (
        <>
          <PowerupDarkOverlay opacity={0.7} zIndex={30} pointerEvents="none" />
          <LightningRays
            booster={superballAnimation.booster}
            affectedCells={superballAnimation.affectedCells}
            boardRef={boardRef}
            phase={superballAnimation.phase}
          />
          <SuperballForeground
            superballAnimation={superballAnimation}
            boardRef={boardRef}
          />
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
            {...theme.config('panel_main')}
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

export default App;
