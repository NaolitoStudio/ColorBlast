
export enum Color {
  RED = '#ef4444',
  BLUE = '#3b82f6',
  GREEN = '#22c55e',
  YELLOW = '#eab308',
  EMPTY = 'transparent'
}

export type Point = {
  x: number;
  y: number;
};

export type BoosterType = 'line' | 'group' | 'rainbow';

export interface TileData {
  color: Color;
  id: string;
  isBooster?: boolean;
  boosterType?: BoosterType;
  rainbowTargetColor?: Color; // Color the rainbow booster has transformed into
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
  currentLevel: number | null;
  rngSeed: string | null;
  isWinning?: boolean;
  showLevelComplete?: boolean;
  wonStars?: number;
}

export interface SaveData {
  unlockedLevel: number;
  stars: Record<number, number>;
  totalStars: number;
}
