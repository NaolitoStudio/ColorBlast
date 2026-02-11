
import { Color, Point, LevelConfig } from './types';

export const GRID_SIZE = 8;

export const SHAPES: Point[][] = [
  // Single blocks
  [{ x: 0, y: 0 }], // Single Dot

  // Lines of 2
  [{ x: 0, y: 0 }, { x: 1, y: 0 }], // Horizontal Line 2
  [{ x: 0, y: 0 }, { x: 0, y: 1 }], // Vertical Line 2

  // Lines of 3
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], // Horizontal Line 3
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }], // Vertical Line 3

  // Small L - all 4 rotations
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], // L rotation 0 (top-left corner)
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], // L rotation 1 (top-right corner)
  [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }], // L rotation 2 (bottom-right corner)
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // L rotation 3 (bottom-left corner)

  // Square 2x2
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
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
      { color: Color.RED, target: 20 },
      { color: Color.BLUE, target: 20 },
      { color: Color.GREEN, target: 15 }
    ],
    gridFill: 0.28
  },
  {
    level: 3,
    objectives: [
      { color: Color.RED, target: 25 },
      { color: Color.BLUE, target: 25 },
      { color: Color.GREEN, target: 20 },
      { color: Color.YELLOW, target: 15 }
    ],
    gridFill: 0.30
  }
];

// Get level config - levels beyond 3 scale up with 4 colors
export const getLevelConfig = (level: number): LevelConfig => {
  if (level <= LEVELS.length) {
    return LEVELS[level - 1];
  }
  // For levels beyond 3, scale up with 4 colors
  const baseLevel = LEVELS[LEVELS.length - 1];
  const multiplier = 1 + (level - LEVELS.length) * 0.15;
  return {
    level,
    objectives: baseLevel.objectives.map(obj => ({
      color: obj.color,
      target: Math.round(obj.target * multiplier)
    })),
    gridFill: Math.min(baseLevel.gridFill + (level - LEVELS.length) * 0.02, 0.40)
  };
};
