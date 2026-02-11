
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

export interface TileData {
  color: Color;
  id: string;
}

export interface PieceData {
  id: string;
  shape: Point[]; // Relative coordinates
  colors: Color[]; // Color for each point in shape
}

export interface LevelObjective {
  color: Color;
  target: number;
  current: number;
}

export interface LevelConfig {
  level: number;
  objectives: { color: Color; target: number }[];
  gridFill: number; // Initial grid fill probability
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
  level: number;
  objectives: LevelObjective[];
  levelComplete: boolean;
}
