
import { GRID_SIZE, SHAPES, COLORS } from '../constants';
import { Color, PieceData, Point, TileData } from '../types';

export const createEmptyGrid = () => 
  Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

export const createRandomGrid = (fillProbability: number = 0.3): (TileData | null)[][] => {
  const grid: (TileData | null)[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (Math.random() < fillProbability) {
        const forbiddenColors = new Set<Color>();

        // Check horizontal neighbors to prevent immediate match-3
        if (x >= 2 && grid[y][x-1] && grid[y][x-2] && grid[y][x-1]!.color === grid[y][x-2]!.color) {
          forbiddenColors.add(grid[y][x-1]!.color);
        }

        // Check vertical neighbors to prevent immediate match-3
        if (y >= 2 && grid[y-1][x] && grid[y-2][x] && grid[y-1][x]!.color === grid[y-2][x]!.color) {
          forbiddenColors.add(grid[y-1][x]!.color);
        }

        const availableColors = COLORS.filter(c => !forbiddenColors.has(c));
        
        if (availableColors.length > 0) {
          const color = availableColors[Math.floor(Math.random() * availableColors.length)];
          grid[y][x] = {
            color,
            id: `init-${x}-${y}-${Math.random()}`
          };
        }
      }
    }
  }
  return grid;
};

export const generatePiece = (availableColors: Color[] = COLORS): PieceData => {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  
  // Use provided colors, fallback to all colors if none provided
  const sourceColors = availableColors.length > 0 ? availableColors : COLORS;

  return {
    id: Math.random().toString(36).substr(2, 9),
    shape: [...shape],
    // Assign a random color to each tile in the piece
    colors: shape.map(() => sourceColors[Math.floor(Math.random() * sourceColors.length)])
  };
};

export const canPlacePiece = (
  grid: (TileData | null)[][],
  piece: PieceData,
  x: number,
  y: number
): boolean => {
  for (const point of piece.shape) {
    const targetX = x + point.x;
    const targetY = y + point.y;
    
    if (
      targetX < 0 || targetX >= GRID_SIZE ||
      targetY < 0 || targetY >= GRID_SIZE ||
      grid[targetY][targetX] !== null
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Returns an array of groups, where each group is an array of Points.
 * This allows for combo scoring and staggered animations.
 */
export const findMatchGroups = (grid: (TileData | null)[][]): Point[][] => {
  const allGroups: Point[][] = [];
  const visited = new Set<string>();

  const getNeighbors = (p: Point) => [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 }
  ];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x];
      if (!tile || visited.has(`${x},${y}`)) continue;

      const group: Point[] = [];
      const queue: Point[] = [{ x, y }];
      visited.add(`${x},${y}`);

      while (queue.length > 0) {
        const current = queue.shift()!;
        group.push(current);

        for (const neighbor of getNeighbors(current)) {
          const key = `${neighbor.x},${neighbor.y}`;
          if (
            neighbor.x >= 0 && neighbor.x < GRID_SIZE &&
            neighbor.y >= 0 && neighbor.y < GRID_SIZE &&
            !visited.has(key) &&
            grid[neighbor.y][neighbor.x]?.color === tile.color
          ) {
            visited.add(key);
            queue.push(neighbor);
          }
        }
      }

      if (group.length >= 3) {
        allGroups.push(group);
      }
    }
  }

  return allGroups;
};

export const isGameOver = (grid: (TileData | null)[][], hand: (PieceData | null)[]): boolean => {
  const activePieces = hand.filter(p => p !== null);
  if (activePieces.length === 0) return false;

  for (const piece of activePieces) {
    if (!piece) continue;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (canPlacePiece(grid, piece, x, y)) {
          return false;
        }
      }
    }
  }
  return true;
};

export const calculateScore = (totalCleared: number, combo: number): { score: number, text: string, multiplier: number } => {
  let blockMultiplier = 0; // Starts at 0 for 3 blocks (since 1.5x for 4 blocks implies +0.5 per step or similar)
  let text = '';

  // Scaling based on "4 Blocks, 1.5x modifier" target at combo 1
  if (totalCleared >= 9) { blockMultiplier = 3.0; text = 'UNREAL!'; }
  else if (totalCleared === 8) { blockMultiplier = 2.5; text = 'Incredible!'; }
  else if (totalCleared === 7) { blockMultiplier = 2.0; text = 'Spectacular!'; }
  else if (totalCleared === 6) { blockMultiplier = 1.5; text = 'Amazing!'; }
  else if (totalCleared === 5) { blockMultiplier = 1.0; text = 'Awesome!'; }
  else if (totalCleared === 4) { blockMultiplier = 0.5; text = 'Nice!'; }
  else { blockMultiplier = 0; } // 3 blocks

  // Score formula: (blocks * 10) * (combo + blockMultiplier)
  const totalMultiplier = combo + blockMultiplier;
  const score = Math.round((totalCleared * 10) * totalMultiplier);
  
  return { score, text, multiplier: totalMultiplier };
};
