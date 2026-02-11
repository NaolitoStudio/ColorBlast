
import { GRID_SIZE, SHAPES, getLevelConfig } from '../constants';
import { Color, PieceData, Point, TileData, LevelObjective } from '../types';

export const createEmptyGrid = () =>
  Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

/**
 * Get available colors based on current level's objectives
 */
export const getColorsForLevel = (level: number): Color[] => {
  const config = getLevelConfig(level);
  return config.objectives.map(obj => obj.color);
};

/**
 * Initialize objectives for a level
 */
export const initializeObjectives = (level: number): LevelObjective[] => {
  const config = getLevelConfig(level);
  return config.objectives.map(obj => ({
    color: obj.color,
    target: obj.target,
    current: 0
  }));
};

export const createRandomGrid = (fillProbability: number = 0.3, level: number = 1): (TileData | null)[][] => {
  const grid: (TileData | null)[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
  const levelColors = getColorsForLevel(level);

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

        const availableColors = levelColors.filter(c => !forbiddenColors.has(c));

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

/**
 * Check if a piece can be placed anywhere on the grid
 */
export const canPieceFitAnywhere = (grid: (TileData | null)[][], piece: PieceData): boolean => {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (canPlacePiece(grid, piece, x, y)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Generate a piece that can definitely be placed on the grid
 * Tries random pieces first, then systematically finds one that fits
 */
export const generatePiece = (grid?: (TileData | null)[][], level: number = 1): PieceData => {
  const levelColors = getColorsForLevel(level);

  const createPieceFromShape = (shape: Point[]): PieceData => ({
    id: Math.random().toString(36).substr(2, 9),
    shape: [...shape],
    colors: shape.map(() => levelColors[Math.floor(Math.random() * levelColors.length)])
  });

  // If no grid provided, just return random piece (for initial load)
  if (!grid) {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    return createPieceFromShape(shape);
  }

  // Shuffle shapes for randomness
  const shuffledShapes = [...SHAPES].sort(() => Math.random() - 0.5);

  // Try each shape until we find one that fits
  for (const shape of shuffledShapes) {
    const piece = createPieceFromShape(shape);
    if (canPieceFitAnywhere(grid, piece)) {
      return piece;
    }
  }

  // Fallback: return single dot (always fits if there's any empty space)
  return createPieceFromShape(SHAPES[0]);
};

/**
 * Generate a hand of 3 pieces that can all be placed on the grid
 */
export const generateValidHand = (grid: (TileData | null)[][], level: number = 1): PieceData[] => {
  const hand: PieceData[] = [];
  let workingGrid = grid.map(row => [...row]);

  for (let i = 0; i < 3; i++) {
    const piece = generatePiece(workingGrid, level);
    hand.push(piece);

    // Simulate placing this piece to ensure next pieces also have room
    // Find first valid position and "reserve" it
    outer: for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (canPlacePiece(workingGrid, piece, x, y)) {
          // Mark these cells as occupied for next piece generation
          for (const point of piece.shape) {
            workingGrid[y + point.y][x + point.x] = {
              color: piece.colors[0],
              id: `temp-${i}-${x}-${y}`
            };
          }
          break outer;
        }
      }
    }
  }

  return hand;
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

/**
 * Get all 8 neighbors (including diagonals) around a point
 */
export const getAllNeighbors = (p: Point): Point[] => [
  { x: p.x - 1, y: p.y - 1 }, { x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y - 1 },
  { x: p.x - 1, y: p.y },                              { x: p.x + 1, y: p.y },
  { x: p.x - 1, y: p.y + 1 }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }
];

/**
 * Find the most centered point in a group
 */
export const findGroupCenter = (group: Point[]): Point => {
  const avgX = group.reduce((sum, p) => sum + p.x, 0) / group.length;
  const avgY = group.reduce((sum, p) => sum + p.y, 0) / group.length;

  // Find the point closest to the center
  let closest = group[0];
  let minDist = Infinity;

  group.forEach(p => {
    const dist = Math.abs(p.x - avgX) + Math.abs(p.y - avgY);
    if (dist < minDist) {
      minDist = dist;
      closest = p;
    }
  });

  return closest;
};

/**
 * Get explosion radius points for a bomb
 */
export const getBombExplosionPoints = (
  center: Point,
  layers: number,
  grid: (TileData | null)[][]
): Point[] => {
  const points: Point[] = [];
  const visited = new Set<string>();
  visited.add(`${center.x},${center.y}`);

  let currentLayer = [center];

  for (let layer = 0; layer < layers; layer++) {
    const nextLayer: Point[] = [];

    currentLayer.forEach(p => {
      const neighbors = getAllNeighbors(p);
      neighbors.forEach(n => {
        const key = `${n.x},${n.y}`;
        if (
          n.x >= 0 && n.x < GRID_SIZE &&
          n.y >= 0 && n.y < GRID_SIZE &&
          !visited.has(key)
        ) {
          visited.add(key);
          nextLayer.push(n);
          // Only add if there's a tile there (not empty, not the bomb itself)
          if (grid[n.y][n.x] !== null) {
            points.push(n);
          }
        }
      });
    });

    currentLayer = nextLayer;
  }

  return points;
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
