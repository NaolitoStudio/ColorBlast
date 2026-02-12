
import { Color, Point } from './types';

export const GRID_SIZE = 8;

export const SHAPES: Point[][] = [
  // I-Piece
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], // Horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }], // Vertical

  // O-Piece
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],

  // T-Piece
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // Up
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }], // Right
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }], // Down
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }], // Left

  // S-Piece
  [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // Horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }], // Vertical

  // Z-Piece
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // Horizontal
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }], // Vertical

  // J-Piece
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // Up
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }], // Right
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }], // Down
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }], // Left

  // L-Piece
  [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // Up
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }], // Right
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }], // Down
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }], // Left

  // 1x1 Dot
  [{ x: 0, y: 0 }],

  // 2-Piece Line
  [{ x: 0, y: 0 }, { x: 1, y: 0 }], // Horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }], // Vertical

  // 3-Piece Line
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], // Horizontal
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }], // Vertical

  // Small-L (Corner)
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], // Top-Left
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], // Top-Right
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // Bottom-Right
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], // Bottom-Left
];

export const COLORS = [
  Color.RED,
  Color.BLUE,
  Color.GREEN,
  Color.YELLOW,
  Color.PURPLE,
  Color.ORANGE
];

export const COLOR_SYMBOLS: Record<Color, string> = {
  [Color.RED]: 'fa-fire',
  [Color.BLUE]: 'fa-trophy',
  [Color.GREEN]: 'fa-square',
  [Color.YELLOW]: 'fa-bolt',
  [Color.PURPLE]: 'fa-crown',
  [Color.ORANGE]: 'fa-star',
  [Color.EMPTY]: ''
};
