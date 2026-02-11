import { ICONS } from './assets';

export enum Color {
  BLUE = ICONS.BLUE,
  GREEN = ICONS.GREEN,
  PURPLE = ICONS.PURPLE,
  YELLOW = ICONS.YELLOW,
  ORANGE = ICONS.ORANGE,
  EMPTY = 'transparent'
}

export type Point = {
  x: number;
  y: number;
};

export interface TileData {
  color: Color;
  id: string;
}

export interface PieceData {
  id: string;
  shape: Point[]; // Relative coordinates
  colors: Color[]; // Color for each point in shape
}

export interface GameState {
  grid: (TileData | null)[][];
  score: number;
  highScore: number;
  hand: (PieceData | null)[];
  gameOver: boolean;
  selectedPieceIndex: number | null;
  clearingTiles: string[]; // IDs of tiles currently animating out
  combo: number;
}
