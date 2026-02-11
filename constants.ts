
import { Color, Point } from './types';

export const GRID_SIZE = 8;

export const SHAPES: Point[][] = [
  // 2 horizontally
  [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  // 2 vertically
  [{ x: 0, y: 0 }, { x: 0, y: 1 }],
  // 3 in an L shape, 4 rotations
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  // 3 in line horizontal
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
  // 3 in line vertical
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
  // 4 in a square
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
];

export const COLORS = [
  Color.RED,
  Color.BLUE,
  Color.GREEN,
  Color.YELLOW
];
