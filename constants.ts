
import { Color, Point } from './types';

export const GRID_SIZE = 8;

export const SHAPES: Point[][] = [
  [{ x: 0, y: 0 }], // Single Dot
  [{ x: 0, y: 0 }, { x: 1, y: 0 }], // Horizontal Line 2
  [{ x: 0, y: 0 }, { x: 0, y: 1 }], // Vertical Line 2
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], // Horizontal Line 3
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], // small L
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], // Square 2x2
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // Small L inverted
];

export const COLORS = [
  Color.RED,
  Color.BLUE,
  Color.GREEN,
  Color.YELLOW,
  Color.PURPLE,
  Color.ORANGE
];
