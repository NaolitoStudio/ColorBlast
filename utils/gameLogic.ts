
import { GRID_SIZE, SHAPES, COLORS } from '../constants';
import { Color, PieceData, Point, TileData } from '../types';

export const createEmptyGrid = () => 
  Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

export const createRandomGrid = (
  fillProbability: number = 0.3,
  palette: Color[] = COLORS
): (TileData | null)[][] => {
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

        const availableColors = palette.filter(c => !forbiddenColors.has(c));
        
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

export const generatePiece = (palette: Color[] = COLORS): PieceData => {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const getNeighbors = (index: number): number[] => {
    const p = shape[index];
    const neighbors: number[] = [];
    for (let i = 0; i < shape.length; i++) {
      if (i === index) continue;
      const q = shape[i];
      if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1) {
        neighbors.push(i);
      }
    }
    return neighbors;
  };

  const hasPrebuiltCombo = (colors: Color[]): boolean => {
    const visited = new Set<number>();

    for (let i = 0; i < shape.length; i++) {
      if (visited.has(i)) continue;

      const groupColor = colors[i];
      const queue = [i];
      visited.add(i);
      let groupSize = 0;

      while (queue.length > 0) {
        const current = queue.shift()!;
        groupSize++;
        const neighbors = getNeighbors(current);
        for (const n of neighbors) {
          if (!visited.has(n) && colors[n] === groupColor) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      if (groupSize >= 3) {
        return true;
      }
    }

    return false;
  };

  const randomColor = () => palette[Math.floor(Math.random() * palette.length)];
  const randomDifferentColor = (current: Color) => {
    const alternatives = palette.filter(c => c !== current);
    return alternatives[Math.floor(Math.random() * alternatives.length)];
  };

  // If palette has a single color (e.g. Same Color booster), combos are unavoidable by design.
  if (palette.length === 1) {
    return {
      id: Math.random().toString(36).substr(2, 9),
      shape: [...shape],
      colors: shape.map(() => palette[0])
    };
  }

  let colors = shape.map(() => randomColor());
  let attempts = 0;
  while (hasPrebuiltCombo(colors) && attempts < 50) {
    const randomIndex = Math.floor(Math.random() * shape.length);
    colors[randomIndex] = randomDifferentColor(colors[randomIndex]);
    attempts++;
  }
  
  return {
    id: Math.random().toString(36).substr(2, 9),
    shape: [...shape],
    // Avoid prebuilt 3+ connected same-color groups on the piece itself.
    colors
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
