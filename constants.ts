
import { Color, Point } from './types';

export interface LevelConfig {
  level: number;
  objectives: { color: Color; target: number }[];
  gridFill: number;
  lockedTileChance?: number; // Probability of a tile being locked (level 5+)
}

export const GRID_SIZE = 8;

export const SHAPES: Point[][] = [
  // === BASIC SHAPES ===

  // Single dot
  [{ x: 0, y: 0 }],

  // Lines of 2
  [{ x: 0, y: 0 }, { x: 1, y: 0 }], // Horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }], // Vertical

  // Lines of 3
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], // Horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }], // Vertical

  // Square 2x2 (O piece)
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],

  // === SMALL L (3 blocks) ===
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], // ┘
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], // └
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // ┌
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // ┐

  // === TETRIS I (4 blocks) ===
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], // Horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }], // Vertical

  // === TETRIS T (4 blocks) ===
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }], // T down
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }], // T right
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // T up
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }], // T left

  // === TETRIS L (4 blocks) ===
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }], // L
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }], // L rotated 90
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }], // L rotated 180
  [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // L rotated 270

  // === TETRIS J (4 blocks) - mirror of L ===
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }], // J
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // J rotated 90
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }], // J rotated 180
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }], // J rotated 270

  // === TETRIS Z (4 blocks) ===
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // Z horizontal
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }], // Z vertical

  // === TETRIS S (4 blocks) - mirror of Z ===
  [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // S horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }], // S vertical
];

export const COLORS = [
  Color.RED,
  Color.BLUE,
  Color.GREEN,
  Color.YELLOW,
  Color.PURPLE,
  Color.ORANGE
];

// Level definitions with objectives
// Level 1: 2 colors, Level 2: 3 colors, Level 3+: 4 colors
// All targets fixed at 15 per color
export const LEVELS: LevelConfig[] = [
  {
    level: 1,
    objectives: [
      { color: Color.RED, target: 15 },
      { color: Color.BLUE, target: 15 }
    ],
    gridFill: 0.25
  },
  {
    level: 2,
    objectives: [
      { color: Color.RED, target: 15 },
      { color: Color.BLUE, target: 15 },
      { color: Color.GREEN, target: 15 }
    ],
    gridFill: 0.28
  },
  {
    level: 3,
    objectives: [
      { color: Color.RED, target: 15 },
      { color: Color.BLUE, target: 15 },
      { color: Color.GREEN, target: 15 },
      { color: Color.YELLOW, target: 15 }
    ],
    gridFill: 0.30
  },
  {
    level: 4,
    objectives: [
      { color: Color.RED, target: 15 },
      { color: Color.BLUE, target: 15 },
      { color: Color.GREEN, target: 15 },
      { color: Color.YELLOW, target: 15 }
    ],
    gridFill: 0.32
  },
  {
    level: 5,
    objectives: [
      { color: Color.RED, target: 15 },
      { color: Color.BLUE, target: 15 },
      { color: Color.GREEN, target: 15 },
      { color: Color.YELLOW, target: 15 }
    ],
    gridFill: 0.50,
    lockedTileChance: 0.25
  }
];

// Get level config - levels beyond 5 keep same objectives, increase difficulty via grid/locked tiles
export const getLevelConfig = (level: number): LevelConfig => {
  if (level <= LEVELS.length) {
    return LEVELS[level - 1];
  }
  // For levels beyond 5, keep targets at 15, increase grid fill and locked tile chance
  const baseLevel = LEVELS[LEVELS.length - 1];
  return {
    level,
    objectives: baseLevel.objectives.map(obj => ({
      color: obj.color,
      target: 15
    })),
    gridFill: Math.min(baseLevel.gridFill + (level - LEVELS.length) * 0.02, 0.55),
    lockedTileChance: Math.min((baseLevel.lockedTileChance ?? 0) + (level - LEVELS.length) * 0.05, 0.40)
  };
};
