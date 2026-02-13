
import { Color, Point } from './types';

export interface LevelConfig {
  level: number;
  objectives: { color: Color; target: number }[];
  gridFill: number;
  lockedTileChance?: number; // Probability of a tile being locked (level 5+)
}

export const GRID_SIZE = 8;

export const SHAPES: Point[][] = [
  // Tetromino I
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }],

  // Tetromino O (all rotations are equivalent)
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],

  // Tetromino T (4 rotations)
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }],

  // Tetromino L (4 rotations)
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],

  // Tetromino J (4 rotations)
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],

  // Tetromino S (2 unique rotations)
  [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],

  // Tetromino Z (2 unique rotations)
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }],
];

export const COLORS = [
  Color.BLUE,
  Color.GREEN,
  Color.PURPLE,
  Color.YELLOW,
  Color.ORANGE
];

// Level definitions with objectives
// Level 1: 2 colors, Level 2: 3 colors, Level 3+: 4 colors
// All targets fixed at 15 per color
export const LEVELS: LevelConfig[] = [
  {
    level: 1,
    objectives: [
      { color: Color.ORANGE, target: 15 },
      { color: Color.BLUE, target: 15 }
    ],
    gridFill: 0.25
  },
  {
    level: 2,
    objectives: [
      { color: Color.ORANGE, target: 15 },
      { color: Color.BLUE, target: 15 },
      { color: Color.GREEN, target: 15 }
    ],
    gridFill: 0.28
  },
  {
    level: 3,
    objectives: [
      { color: Color.ORANGE, target: 15 },
      { color: Color.BLUE, target: 15 },
      { color: Color.GREEN, target: 15 },
      { color: Color.YELLOW, target: 15 }
    ],
    gridFill: 0.30
  },
  {
    level: 4,
    objectives: [
      { color: Color.ORANGE, target: 15 },
      { color: Color.BLUE, target: 15 },
      { color: Color.GREEN, target: 15 },
      { color: Color.YELLOW, target: 15 }
    ],
    gridFill: 0.32
  },
  {
    level: 5,
    objectives: [
      { color: Color.ORANGE, target: 15 },
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
