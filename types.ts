
export enum Color {
  RED = '#ef4444',
  BLUE = '#3b82f6',
  GREEN = '#22c55e',
  YELLOW = '#eab308',
  PURPLE = '#a855f7',
  ORANGE = '#f97316',
  EMPTY = 'transparent'
}

export type Point = {
  x: number;
  y: number;
};

export enum PowerupType {
  ROCKET = 'ROCKET',
  BOMB = 'BOMB',
  LIGHTNING = 'LIGHTNING'
}

export interface TileData {
  color: Color;
  id: string;
  powerup?: PowerupType;
}

export interface LevelConfig {
  levelNumber: number;
  availableColors: Color[];
  pattern: (grid: (TileData | null)[][]) => void;
  targetClears: number; // Number of blocks to clear for EACH available color
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
