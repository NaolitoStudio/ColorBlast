
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
  const config = getLevelConfig(level);
  const lockedTileChance = config.lockedTileChance ?? 0;

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
          const isLocked = lockedTileChance > 0 && Math.random() < lockedTileChance;
          grid[y][x] = {
            color,
            id: `init-${x}-${y}-${Math.random()}`,
            ...(isLocked && { locked: true })
          };
        }
      }
    }
  }
  return grid;
};

export interface AddedBlock {
  x: number;
  y: number;
  color: Color;
  id: string;
}

/**
 * Check if placing a color at position would make that tile part of a match
 */
const wouldTileBeInMatch = (grid: (TileData | null)[][], x: number, y: number, color: Color): boolean => {
  // Temporarily place the tile
  const testGrid = grid.map(row => [...row]);
  testGrid[y][x] = { color, id: 'test' };

  // Check if this tile is part of any match group
  const matches = findMatchGroups(testGrid);

  // Check if any match group contains this position
  for (const group of matches) {
    if (group.some(p => p.x === x && p.y === y)) {
      return true;
    }
  }
  return false;
};

/**
 * Add random blocks to empty cells in the grid
 * @param grid The current grid
 * @param count Number of blocks to add
 * @param level Current level (for color selection)
 * @param boosterPositions Array of {x, y} positions where boosters exist
 * @returns Object with modified grid and info about added blocks
 */
export const addRandomBlocks = (
  grid: (TileData | null)[][],
  count: number,
  level: number,
  boosterPositions: Point[] = []
): { grid: (TileData | null)[][]; addedBlocks: AddedBlock[] } => {
  const newGrid = grid.map(row => [...row]);
  const levelColors = getColorsForLevel(level);
  const config = getLevelConfig(level);
  const lockedTileChance = config.lockedTileChance ?? 0;
  const addedBlocks: AddedBlock[] = [];

  // Create a set of booster positions for fast lookup
  const boosterSet = new Set(boosterPositions.map(p => `${p.x},${p.y}`));

  // Find all empty cells (excluding booster positions)
  const emptyCells: Point[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (newGrid[y][x] === null && !boosterSet.has(`${x},${y}`)) {
        emptyCells.push({ x, y });
      }
    }
  }

  // Shuffle empty cells and pick 'count' of them
  const shuffled = emptyCells.sort(() => Math.random() - 0.5);
  const cellsToFill = shuffled.slice(0, Math.min(count, emptyCells.length));

  for (const { x, y } of cellsToFill) {
    // Find colors that won't make this tile part of a match
    const safeColors = levelColors.filter(color => !wouldTileBeInMatch(newGrid, x, y, color));

    // If no safe colors, skip this cell
    if (safeColors.length === 0) continue;

    const color = safeColors[Math.floor(Math.random() * safeColors.length)];
    const isLocked = lockedTileChance > 0 && Math.random() < lockedTileChance;
    const id = `added-${x}-${y}-${Date.now()}-${Math.random()}`;
    newGrid[y][x] = {
      color,
      id,
      ...(isLocked && { locked: true })
    };
    addedBlocks.push({ x, y, color, id });
  }

  return { grid: newGrid, addedBlocks };
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
 * Simulate placing a piece and check if it creates any match (group of 3+)
 */
export const wouldCreateMatch = (
  grid: (TileData | null)[][],
  piece: PieceData,
  x: number,
  y: number
): boolean => {
  // Create a temporary grid with the piece placed
  const tempGrid = grid.map(row => [...row]);

  for (let i = 0; i < piece.shape.length; i++) {
    const point = piece.shape[i];
    const targetX = x + point.x;
    const targetY = y + point.y;
    tempGrid[targetY][targetX] = {
      color: piece.colors[i],
      id: `temp-${i}`
    };
  }

  // Check if any matches exist
  const matches = findMatchGroups(tempGrid);
  return matches.length > 0;
};

/**
 * Check if a piece can create a valid match anywhere on the grid
 */
export const canPieceCreateMatch = (grid: (TileData | null)[][], piece: PieceData): boolean => {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (canPlacePiece(grid, piece, x, y) && wouldCreateMatch(grid, piece, x, y)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Generate a piece that can create valid color combinations on the grid
 * Tries to assign colors that will allow matches
 */
export const generatePiece = (grid?: (TileData | null)[][], level: number = 1): PieceData => {
  const levelColors = getColorsForLevel(level);

  const createPieceFromShape = (shape: Point[], colors?: Color[]): PieceData => ({
    id: Math.random().toString(36).substr(2, 9),
    shape: [...shape],
    colors: colors || shape.map(() => levelColors[Math.floor(Math.random() * levelColors.length)])
  });

  // If no grid provided, just return random piece (for initial load)
  if (!grid) {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    return createPieceFromShape(shape);
  }

  // Shuffle shapes for randomness
  const shuffledShapes = [...SHAPES].sort(() => Math.random() - 0.5);

  // Try each shape until we find one that can create a match
  for (const shape of shuffledShapes) {
    // First check if the shape fits anywhere
    const testPiece = createPieceFromShape(shape);
    if (!canPieceFitAnywhere(grid, testPiece)) continue;

    // Try multiple color combinations to find one that creates a match
    for (let attempt = 0; attempt < 15; attempt++) {
      const piece = createPieceFromShape(shape);
      if (canPieceCreateMatch(grid, piece)) {
        return piece;
      }
    }

    // Try strategic coloring: find adjacent colors on the grid and use them
    const strategicPiece = createStrategicColoredPiece(grid, shape, levelColors);
    if (strategicPiece && canPieceCreateMatch(grid, strategicPiece)) {
      return strategicPiece;
    }
  }

  // Fallback: return a piece that at least fits (may not create match immediately)
  for (const shape of shuffledShapes) {
    const piece = createPieceFromShape(shape);
    if (canPieceFitAnywhere(grid, piece)) {
      return piece;
    }
  }

  return createPieceFromShape(shuffledShapes[0]);
};

/**
 * Create a piece with colors strategically chosen to match adjacent grid colors
 */
const createStrategicColoredPiece = (
  grid: (TileData | null)[][],
  shape: Point[],
  levelColors: Color[]
): PieceData | null => {
  // Find all positions where this shape could fit
  const validPositions: { x: number; y: number }[] = [];
  const tempPiece: PieceData = {
    id: 'temp',
    shape: [...shape],
    colors: shape.map(() => levelColors[0])
  };

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (canPlacePiece(grid, tempPiece, x, y)) {
        validPositions.push({ x, y });
      }
    }
  }

  if (validPositions.length === 0) return null;

  // For each valid position, find adjacent colors and try to use them
  for (const pos of validPositions) {
    const adjacentColors = new Map<Color, number>();

    // Check each cell of the piece placement for adjacent existing tiles
    for (const point of shape) {
      const px = pos.x + point.x;
      const py = pos.y + point.y;

      // Check 4 neighbors
      const neighbors = [
        { x: px - 1, y: py },
        { x: px + 1, y: py },
        { x: px, y: py - 1 },
        { x: px, y: py + 1 }
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < GRID_SIZE && n.y >= 0 && n.y < GRID_SIZE) {
          const tile = grid[n.y][n.x];
          if (tile && !tile.locked) {
            adjacentColors.set(tile.color, (adjacentColors.get(tile.color) || 0) + 1);
          }
        }
      }
    }

    // Use the most common adjacent color for better match chances
    if (adjacentColors.size > 0) {
      const sortedColors = [...adjacentColors.entries()].sort((a, b) => b[1] - a[1]);
      const dominantColor = sortedColors[0][0];

      // Create piece with mix of dominant color and random colors
      const colors = shape.map(() => {
        return Math.random() < 0.6 ? dominantColor : levelColors[Math.floor(Math.random() * levelColors.length)];
      });

      return {
        id: Math.random().toString(36).substr(2, 9),
        shape: [...shape],
        colors
      };
    }
  }

  return null;
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
 * Locked tiles are skipped and do not participate in matches.
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
      // Skip locked tiles - they don't participate in matches
      if (!tile || tile.locked || visited.has(`${x},${y}`)) continue;

      const group: Point[] = [];
      const queue: Point[] = [{ x, y }];
      visited.add(`${x},${y}`);

      while (queue.length > 0) {
        const current = queue.shift()!;
        group.push(current);

        for (const neighbor of getNeighbors(current)) {
          const key = `${neighbor.x},${neighbor.y}`;
          const neighborTile = grid[neighbor.y]?.[neighbor.x];
          if (
            neighbor.x >= 0 && neighbor.x < GRID_SIZE &&
            neighbor.y >= 0 && neighbor.y < GRID_SIZE &&
            !visited.has(key) &&
            neighborTile?.color === tile.color &&
            !neighborTile?.locked // Skip locked neighbors
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
 * Get all locked tiles that are adjacent (4-directional) to any of the matched points.
 * Used to unlock tiles when matches occur nearby.
 */
export const getAdjacentToMatches = (
  grid: (TileData | null)[][],
  matchedPoints: Point[]
): Point[] => {
  const lockedAdjacent: Point[] = [];
  const seen = new Set<string>();
  const matchedSet = new Set(matchedPoints.map(p => `${p.x},${p.y}`));

  const get4Neighbors = (p: Point) => [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 }
  ];

  for (const point of matchedPoints) {
    for (const neighbor of get4Neighbors(point)) {
      const key = `${neighbor.x},${neighbor.y}`;
      // Skip if out of bounds, already seen, or is a matched point itself
      if (
        neighbor.x < 0 || neighbor.x >= GRID_SIZE ||
        neighbor.y < 0 || neighbor.y >= GRID_SIZE ||
        seen.has(key) ||
        matchedSet.has(key)
      ) {
        continue;
      }
      seen.add(key);

      const tile = grid[neighbor.y][neighbor.x];
      if (tile?.locked) {
        lockedAdjacent.push(neighbor);
      }
    }
  }

  return lockedAdjacent;
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
 * Rotate a piece shape 90 degrees around its center
 * @param shape - The piece shape to rotate
 * @param clockwise - true for clockwise, false for counter-clockwise
 * @returns Normalized rotated shape
 */
export const rotatePieceShape = (shape: Point[], clockwise: boolean): Point[] => {
  // Calculate the center of the piece
  const centerX = shape.reduce((sum, p) => sum + p.x, 0) / shape.length;
  const centerY = shape.reduce((sum, p) => sum + p.y, 0) / shape.length;

  // Rotate around center
  // Clockwise 90°:        (x, y) -> (y, -x) relative to center
  // Counter-clockwise 90°: (x, y) -> (-y, x) relative to center
  const rotated = shape.map(p => {
    // Translate to origin (center at 0,0)
    const dx = p.x - centerX;
    const dy = p.y - centerY;

    // Apply rotation (Y increases downward in screen coordinates)
    let newDx: number, newDy: number;
    if (clockwise) {
      // Clockwise: (dx, dy) -> (-dy, dx)
      newDx = -dy;
      newDy = dx;
    } else {
      // Counter-clockwise: (dx, dy) -> (dy, -dx)
      newDx = dy;
      newDy = -dx;
    }

    // Translate back and round to integers
    return {
      x: Math.round(centerX + newDx),
      y: Math.round(centerY + newDy)
    };
  });

  // Normalize to ensure all coordinates are >= 0
  const minX = Math.min(...rotated.map(p => p.x));
  const minY = Math.min(...rotated.map(p => p.y));

  return rotated.map(p => ({
    x: p.x - minX,
    y: p.y - minY
  }));
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
