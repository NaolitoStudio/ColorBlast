import { Booster, Color, Point } from '../../../types';
import { GRID_SIZE } from '../../../constants';
import { DestructionSnapshot, DestructionVisualTarget } from './types';

const pointKey = (point: Point): string => `${point.x},${point.y}`;

const isInBounds = (x: number, y: number): boolean => (
  x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE
);

const dedupePoints = (points: Point[]): Point[] => {
  const seen = new Set<string>();
  const result: Point[] = [];

  for (const point of points) {
    if (!isInBounds(point.x, point.y)) continue;
    const key = pointKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }

  return result;
};

export const resolveSuperballTargetColor = (
  grid: DestructionSnapshot['grid'],
  preferredColor: Color
): Color | null => {
  let preferredCount = 0;
  const counts = new Map<Color, number>();

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x];
      if (!tile) continue;

      counts.set(tile.color, (counts.get(tile.color) ?? 0) + 1);
      if (tile.color === preferredColor) preferredCount++;
    }
  }

  if (preferredCount > 0) return preferredColor;
  if (counts.size === 0) return null;

  let topColor: Color | null = null;
  let topCount = -1;

  counts.forEach((count, color) => {
    if (count > topCount) {
      topCount = count;
      topColor = color;
    }
  });

  return topColor;
};

export const collectBoosterTargetPoints = (
  grid: DestructionSnapshot['grid'],
  booster: Booster
): Point[] => {
  const points: Point[] = [];

  if (booster.type === 'rocket_h') {
    for (let x = 0; x < GRID_SIZE; x++) {
      points.push({ x, y: booster.y });
    }
  } else if (booster.type === 'rocket_v') {
    for (let y = 0; y < GRID_SIZE; y++) {
      points.push({ x: booster.x, y });
    }
  } else if (booster.type === 'line_bomb') {
    for (let i = 0; i < GRID_SIZE; i++) {
      points.push({ x: i, y: booster.y });
      points.push({ x: booster.x, y: i });
    }
  } else if (booster.type === 'bomb') {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        points.push({ x: booster.x + dx, y: booster.y + dy });
      }
    }
  } else if (booster.type === 'color_ball') {
    const targetColor = resolveSuperballTargetColor(grid, booster.color);
    if (targetColor) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (grid[y][x]?.color === targetColor) {
            points.push({ x, y });
          }
        }
      }
    }
    points.push({ x: booster.x, y: booster.y });
  }

  return dedupePoints(points);
};

const buildTileIdIndex = (grid: DestructionSnapshot['grid']): Map<string, Point> => {
  const byId = new Map<string, Point>();

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x];
      if (!tile) continue;
      byId.set(tile.id, { x, y });
    }
  }

  return byId;
};

export const collectPointsFromTileIds = (
  grid: DestructionSnapshot['grid'],
  tileIds: string[]
): Point[] => {
  if (tileIds.length === 0) return [];
  const tileIndex = buildTileIdIndex(grid);
  const points: Point[] = [];

  for (const tileId of tileIds) {
    const point = tileIndex.get(tileId);
    if (!point) continue;
    points.push(point);
  }

  return dedupePoints(points);
};

export const buildVisualTargets = (
  snapshot: DestructionSnapshot,
  points: Point[]
): DestructionVisualTarget[] => {
  const boostersByPosition = new Map<string, Booster>();
  for (const booster of snapshot.boosters) {
    boostersByPosition.set(pointKey(booster), booster);
  }

  return dedupePoints(points).map((point) => {
    const tile = snapshot.grid[point.y]?.[point.x] ?? null;
    const booster = boostersByPosition.get(pointKey(point));

    return {
      x: point.x,
      y: point.y,
      tileId: tile?.id,
      boosterId: booster?.id
    };
  });
};

export const collectDirectTargetPoints = (
  snapshot: DestructionSnapshot,
  tileIds: string[] | undefined,
  tilePoints: Point[] | undefined
): Point[] => {
  const fromIds = tileIds ? collectPointsFromTileIds(snapshot.grid, tileIds) : [];
  const fromPoints = tilePoints ?? [];
  return dedupePoints([...fromIds, ...fromPoints]);
};

export const toCellSet = (targets: DestructionVisualTarget[]): Set<string> => {
  return new Set(targets.map((target) => `${target.x},${target.y}`));
};
