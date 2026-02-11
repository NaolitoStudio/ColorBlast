import { GRID_SIZE, SHAPES, COLORS } from '../constants';
import { Color, PieceData, Point, TileData } from '../types';
import { Random } from './random';

export const createEmptyGrid = () => 
  Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

export const createRandomGrid = (rng: Random, maxColors: number = COLORS.length, fillProbability: number = 0.3): (TileData | null)[][] => {
  const grid: (TileData | null)[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
  
  // Select a subset of colors if maxColors is specified
  const startingColors = COLORS.slice(0, Math.min(maxColors, COLORS.length));

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (rng.next() < fillProbability) {
        const forbiddenColors = new Set<Color>();

        // Check horizontal neighbors to prevent immediate match-3
        if (x >= 2 && grid[y][x-1] && grid[y][x-2] && grid[y][x-1]!.color === grid[y][x-2]!.color) {
          forbiddenColors.add(grid[y][x-1]!.color);
        }

        // Check vertical neighbors to prevent immediate match-3
        if (y >= 2 && grid[y-1][x] && grid[y-2][x] && grid[y-1][x]!.color === grid[y-2][x]!.color) {
          forbiddenColors.add(grid[y-1][x]!.color);
        }

        const availableColors = startingColors.filter(c => !forbiddenColors.has(c));
        
        if (availableColors.length > 0) {
          const color = availableColors[Math.floor(rng.next() * availableColors.length)];
          grid[y][x] = {
            color,
            id: `init-${x}-${y}-${rng.next()}`
          };
        }
      }
    }
  }
  return grid;
};

export const generatePiece = (rng: Random, grid: (TileData | null)[][], availableColors: Color[] = COLORS): PieceData => {
  const sourceColors = (availableColors && availableColors.length > 0) ? availableColors : COLORS;

  // Attempt to find a shape that fits somewhere
  const shuffledShapes = [...SHAPES].sort(() => rng.next() - 0.5);
  
  for (const shape of shuffledShapes) {
    const piece: PieceData = {
      id: rng.next().toString(36).substr(2, 9),
      shape: [...shape],
      colors: shape.map(() => sourceColors[Math.floor(rng.next() * sourceColors.length)])
    };

    // Check if it fits anywhere
    let fits = false;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (canPlacePiece(grid, piece, x, y)) {
          fits = true;
          break;
        }
      }
      if (fits) break;
    }
    
    if (fits) return piece;
  }

  // Fallback to first shape if nothing fits (unlikely on 8x8)
  const fallbackShape = SHAPES[0];
  return {
    id: rng.next().toString(36).substr(2, 9),
    shape: [...fallbackShape],
    colors: fallbackShape.map(() => sourceColors[Math.floor(rng.next() * sourceColors.length)])
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

export const checkWinCondition = (grid: (TileData | null)[][], hand: (PieceData | null)[]): { isWin: boolean, solution?: { pieceIndex: number, x: number, y: number } } => {
  const remainingTiles = grid.flat().filter(t => t !== null && !t.isBooster);
  if (remainingTiles.length === 0) return { isWin: false };

  const uniqueColors = new Set(remainingTiles.map(t => t!.color));
  if (uniqueColors.size !== 1) return { isWin: false };

  // Only 1 color remains. Now check if any piece in hand can clear the remaining tiles.
  // We need to find if placing a piece would result in a match that covers ALL remaining tiles.
  const targetColor = Array.from(uniqueColors)[0];
  const activePieces = hand.map((p, i) => ({ p, i })).filter(item => item.p !== null);

  for (const { p, i } of activePieces) {
    if (!p) continue;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (canPlacePiece(grid, p, x, y)) {
          // Check if this placement clears everything
          const tempGrid = grid.map(r => [...r]);
          p.shape.forEach((q, idx) => {
            tempGrid[y + q.y][x + q.x] = { color: p.colors[idx], id: 'temp' };
          });
          
          const groups = findMatchGroups(tempGrid);
          const clearedPoints = new Set<string>();
          groups.forEach(group => group.forEach(pt => clearedPoints.add(`${pt.x},${pt.y}`)));

          // Does it clear all existing tiles?
          const allExistingCleared = remainingTiles.every(t => {
            // Find where this tile is
            for (let ty = 0; ty < GRID_SIZE; ty++) {
              for (let tx = 0; tx < GRID_SIZE; tx++) {
                if (grid[ty][tx]?.id === t!.id) {
                  return clearedPoints.has(`${tx},${ty}`);
                }
              }
            }
            return false;
          });

          if (allExistingCleared) {
            // Also need to check if it leaves the board blank (all new pieces cleared too)
            const totalTilesInTemp = tempGrid.flat().filter(t => t !== null && !t.isBooster).length;
            if (clearedPoints.size === totalTilesInTemp) {
              return { isWin: true, solution: { pieceIndex: i, x, y } };
            }
          }
        }
      }
    }
  }

  return { isWin: false };
};
