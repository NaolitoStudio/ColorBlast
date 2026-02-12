
import { GRID_SIZE, SHAPES, COLORS } from '../constants';
import { Color, PieceData, Point, TileData, PowerupType } from '../types';

export const createEmptyGrid = () =>
  Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

export const createRandomGrid = (fillProbability: number = 0.3): (TileData | null)[][] => {
  const grid: (TileData | null)[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (Math.random() < fillProbability) {
        const forbiddenColors = new Set<Color>();

        // Check horizontal neighbors to prevent immediate match-3
        if (x >= 2 && grid[y][x - 1] && grid[y][x - 2] && grid[y][x - 1]!.color === grid[y][x - 2]!.color) {
          forbiddenColors.add(grid[y][x - 1]!.color);
        }

        // Check vertical neighbors to prevent immediate match-3
        if (y >= 2 && grid[y - 1][x] && grid[y - 2][x] && grid[y - 1][x]!.color === grid[y - 2][x]!.color) {
          forbiddenColors.add(grid[y - 1][x]!.color);
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

export const generatePiece = (grid: (TileData | null)[][], availableColors: Color[] = COLORS): PieceData => {
  // 1. Filter shapes that can physically fit on the current grid
  const validShapes = SHAPES.filter(shape => {
    // Try to find AT LEAST ONE valid position for this shape
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        // Construct a temporary piece data to reuse canPlacePiece logic
        const tempPiece: PieceData = {
          id: 'temp',
          shape: shape,
          colors: [] // Colors don't matter for placement check
        };

        if (canPlacePiece(grid, tempPiece, x, y)) {
          return true;
        }
      }
    }
    return false;
  });

  // 2. Select a shape
  // If no shapes fit (game essentially over), fallback to 1x1 dot [SHAPES[15] is 1x1 based on index, but let's find it dynamically or just pick random]
  // Safer to pick from all SHAPES if validShapes is empty to avoid crashing, though game over check should handle this.
  const pool = validShapes.length > 0 ? validShapes : SHAPES;
  const shape = pool[Math.floor(Math.random() * pool.length)];

  return {
    id: Math.random().toString(36).substr(2, 9),
    shape: [...shape],
    // Assign a random color to each tile in the piece
    colors: shape.map(() => availableColors[Math.floor(Math.random() * availableColors.length)])
  };
};

export const getPowerupForMatch = (size: number): PowerupType | undefined => {
  if (size >= 6) return PowerupType.LIGHTNING;
  if (size === 5) return PowerupType.BOMB;
  if (size === 4) return PowerupType.ROCKET;
  return undefined;
};

export const resolvePowerupChain = (grid: (TileData | null)[][], initialPoints: Point[]): Point[] => {
  const pointsToClear = new Set<string>(initialPoints.map(p => `${p.x},${p.y}`));
  const queue = [...initialPoints];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const p = queue.shift()!;
    const key = `${p.x},${p.y}`;
    if (processed.has(key)) continue;
    processed.add(key);

    if (!grid[p.y] || !grid[p.y][p.x]) continue; // Safety check

    const tile = grid[p.y][p.x];
    if (tile && tile.powerup) {
      // Trigger Powerup
      let newPoints: Point[] = [];
      try {
        switch (tile.powerup) {
          case PowerupType.ROCKET: // Cross
            for (let i = 0; i < GRID_SIZE; i++) {
              newPoints.push({ x: p.x, y: i });
              newPoints.push({ x: i, y: p.y });
            }
            break;
          case PowerupType.BOMB: // 3x3
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = p.x + dx;
                const ny = p.y + dy;
                if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                  newPoints.push({ x: nx, y: ny });
                }
              }
            }
            break;
          case PowerupType.LIGHTNING: // All of most common color
            const counts: Record<string, number> = {};
            let maxCount = 0;
            let maxColor: Color | null = null;

            grid.forEach(row => row.forEach(t => {
              if (t) {
                const c = t.color;
                counts[c] = (counts[c] || 0) + 1;
                if (counts[c] > maxCount) {
                  maxCount = counts[c];
                  maxColor = c as Color;
                }
              }
            }));

            if (maxColor) {
              grid.forEach((row, y) => row.forEach((t, x) => {
                if (t && t.color === maxColor) {
                  newPoints.push({ x, y });
                }
              }));
            }
            break;
        }
      } catch (e) {
        console.error("Error calculating powerup effect:", e);
      }

      for (const np of newPoints) {
        const nKey = `${np.x},${np.y}`;
        if (!pointsToClear.has(nKey) && np.x >= 0 && np.x < GRID_SIZE && np.y >= 0 && np.y < GRID_SIZE) {
          pointsToClear.add(nKey);
          queue.push(np);
        }
      }
    }
  }

  return Array.from(pointsToClear).map(s => {
    const [x, y] = s.split(',').map(Number);
    return { x, y };
  });
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

  // Scaling based on clearer thresholds for smaller pieces
  if (totalCleared >= 9) { blockMultiplier = 3.0; text = 'UNREAL!'; }
  else if (totalCleared >= 7) { blockMultiplier = 2.5; text = 'Spectacular!'; }
  else if (totalCleared >= 6) { blockMultiplier = 2.0; text = 'Amazing!'; }
  else if (totalCleared >= 5) { blockMultiplier = 1.5; text = 'Awesome!'; }
  else if (totalCleared >= 4) { blockMultiplier = 1.0; text = 'Nice!'; }
  else if (totalCleared >= 3) { blockMultiplier = 0.5; text = 'Good'; }
  else { blockMultiplier = 0; }

  // Score formula: (blocks * 10) * (combo + blockMultiplier)
  const totalMultiplier = combo + blockMultiplier;
  const score = Math.round((totalCleared * 10) * totalMultiplier);

  return { score, text, multiplier: totalMultiplier };
};
