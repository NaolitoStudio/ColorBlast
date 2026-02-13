import { Booster, BoosterType, Color, Point, TileData } from '../../../types';
import {
  ActiveEffect,
  DestructionCommit,
  DestructionRequest,
  DestructionRuntimeState,
  DestructionSnapshot,
  DestructionSource,
  DestructionVisualTarget
} from './types';
import { getDestructionTiming } from './timings';
import {
  buildVisualTargets,
  collectBoosterTargetPoints,
  collectDirectTargetPoints,
  toCellSet
} from './targeting';

let requestCounter = 0;
let effectCounter = 0;

const createRequestId = (): string => {
  requestCounter += 1;
  return `destruction-request-${Date.now()}-${requestCounter}`;
};

const createEffectId = (): string => {
  effectCounter += 1;
  return `destruction-effect-${Date.now()}-${effectCounter}`;
};

export const createDestructionRequest = (
  request: Omit<DestructionRequest, 'requestId' | 'requestedAt'>
): DestructionRequest => ({
  ...request,
  requestId: createRequestId(),
  requestedAt: Date.now()
});

export const createEmptyCommit = (): DestructionCommit => ({
  removeTileIds: [],
  unlockTileIds: [],
  removeBoosterIds: [],
  triggerBoosterIds: [],
  scoreDelta: 0,
  objectiveDeltas: {},
  clearingTileIds: []
});

const getBoosterScoreMultiplier = (boosterType: BoosterType | undefined): number => {
  if (boosterType === 'color_ball') return 3;
  if (boosterType === 'bomb') return 2;
  if (boosterType === 'line_bomb') return 1.5;
  return 1;
};

const addObjectiveDelta = (
  deltas: Partial<Record<Color, number>>,
  color: Color,
  amount: number
) => {
  deltas[color] = (deltas[color] ?? 0) + amount;
};

const boostersByPosition = (boosters: Booster[]): Map<string, Booster> => {
  const map = new Map<string, Booster>();
  for (const booster of boosters) {
    map.set(`${booster.x},${booster.y}`, booster);
  }
  return map;
};

const collectBoosterCommit = (
  booster: Booster,
  snapshot: DestructionSnapshot
): DestructionCommit => {
  const commit = createEmptyCommit();
  const targets = collectBoosterTargetPoints(snapshot.grid, booster);
  const boostersAtPoint = boostersByPosition(snapshot.boosters);

  const removeTileIdSet = new Set<string>();
  const unlockTileIdSet = new Set<string>();
  const triggerBoosterIdSet = new Set<string>();

  for (const target of targets) {
    const tile = snapshot.grid[target.y]?.[target.x] ?? null;
    if (tile) {
      if (tile.locked) {
        unlockTileIdSet.add(tile.id);
      } else {
        removeTileIdSet.add(tile.id);
        addObjectiveDelta(commit.objectiveDeltas, tile.color, 1);
      }
    }

    const hitBooster = boostersAtPoint.get(`${target.x},${target.y}`);
    if (hitBooster && hitBooster.id !== booster.id) {
      triggerBoosterIdSet.add(hitBooster.id);
    }
  }

  const scoreBase = removeTileIdSet.size * 15;
  commit.scoreDelta = Math.round(scoreBase * getBoosterScoreMultiplier(booster.type));
  commit.removeTileIds = Array.from(removeTileIdSet);
  commit.unlockTileIds = Array.from(unlockTileIdSet);
  commit.clearingTileIds = Array.from(removeTileIdSet);
  commit.removeBoosterIds = [booster.id];
  commit.triggerBoosterIds = Array.from(triggerBoosterIdSet);

  return commit;
};

const buildTileIdIndex = (grid: DestructionSnapshot['grid']): Map<string, TileData & { x: number; y: number }> => {
  const byId = new Map<string, TileData & { x: number; y: number }>();
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const tile = grid[y][x];
      if (!tile) continue;
      byId.set(tile.id, { ...tile, x, y });
    }
  }
  return byId;
};

const collectDirectCommit = (
  request: DestructionRequest,
  snapshot: DestructionSnapshot
): DestructionCommit => {
  const commit = createEmptyCommit();
  const scorePerTile = request.scorePerTile ?? 15;
  const targetPoints = collectDirectTargetPoints(snapshot, request.tileIds, request.tilePoints);
  const boostersAtPoint = boostersByPosition(snapshot.boosters);

  const removeTileIdSet = new Set<string>();
  const triggerBoosterIdSet = new Set<string>();

  for (const target of targetPoints) {
    const tile = snapshot.grid[target.y]?.[target.x] ?? null;
    if (tile) {
      removeTileIdSet.add(tile.id);
      addObjectiveDelta(commit.objectiveDeltas, tile.color, 1);
    }

    const hitBooster = boostersAtPoint.get(`${target.x},${target.y}`);
    if (hitBooster) {
      triggerBoosterIdSet.add(hitBooster.id);
    }
  }

  commit.removeTileIds = Array.from(removeTileIdSet);
  commit.clearingTileIds = Array.from(removeTileIdSet);
  commit.triggerBoosterIds = Array.from(triggerBoosterIdSet);
  commit.scoreDelta = commit.removeTileIds.length * scorePerTile;

  return commit;
};

export const createActiveEffect = (
  request: DestructionRequest,
  snapshot: DestructionSnapshot,
  startedAt = Date.now()
): ActiveEffect | null => {
  let boosterType: BoosterType | undefined;
  let visualTargets: DestructionVisualTarget[] = [];

  if (request.kind === 'booster') {
    if (!request.boosterId) return null;
    const booster = snapshot.boosters.find((entry) => entry.id === request.boosterId);
    if (!booster || !booster.type) return null;

    boosterType = booster.type;
    const targetPoints = collectBoosterTargetPoints(snapshot.grid, booster);
    visualTargets = buildVisualTargets(snapshot, targetPoints);
  } else {
    const directPoints = collectDirectTargetPoints(snapshot, request.tileIds, request.tilePoints);
    if (directPoints.length === 0) return null;
    visualTargets = buildVisualTargets(snapshot, directPoints);
  }

  const timing = getDestructionTiming(request.kind, boosterType);

  return {
    effectId: createEffectId(),
    requestId: request.requestId,
    boosterId: request.boosterId,
    boosterType,
    source: request.source,
    phase: 'telegraph',
    startedAt,
    commitAt: startedAt + timing.telegraphMs,
    visualTargets,
    request
  };
};

const mergeObjectiveDeltas = (
  base: Partial<Record<Color, number>>,
  next: Partial<Record<Color, number>>
): Partial<Record<Color, number>> => {
  const merged: Partial<Record<Color, number>> = { ...base };

  for (const [color, count] of Object.entries(next)) {
    const typedColor = color as Color;
    merged[typedColor] = (merged[typedColor] ?? 0) + (count ?? 0);
  }

  return merged;
};

export const mergeCommits = (commits: DestructionCommit[]): DestructionCommit => {
  if (commits.length === 0) return createEmptyCommit();

  const merged = createEmptyCommit();
  const removeTileIds = new Set<string>();
  const unlockTileIds = new Set<string>();
  const removeBoosterIds = new Set<string>();
  const triggerBoosterIds = new Set<string>();

  for (const commit of commits) {
    commit.removeTileIds.forEach((id) => removeTileIds.add(id));
    commit.unlockTileIds.forEach((id) => unlockTileIds.add(id));
    commit.removeBoosterIds.forEach((id) => removeBoosterIds.add(id));
    commit.triggerBoosterIds.forEach((id) => triggerBoosterIds.add(id));
    merged.scoreDelta += commit.scoreDelta;
    merged.objectiveDeltas = mergeObjectiveDeltas(merged.objectiveDeltas, commit.objectiveDeltas);
  }

  for (const tileId of removeTileIds) {
    unlockTileIds.delete(tileId);
  }

  merged.removeTileIds = Array.from(removeTileIds);
  merged.clearingTileIds = Array.from(removeTileIds);
  merged.unlockTileIds = Array.from(unlockTileIds);
  merged.removeBoosterIds = Array.from(removeBoosterIds);
  merged.triggerBoosterIds = Array.from(triggerBoosterIds).filter((id) => !removeBoosterIds.has(id));

  return merged;
};

export const computeCommitForEffect = (
  effect: ActiveEffect,
  snapshot: DestructionSnapshot
): DestructionCommit => {
  if (effect.request.kind === 'booster') {
    if (!effect.boosterId) return createEmptyCommit();
    const booster = snapshot.boosters.find((entry) => entry.id === effect.boosterId);
    if (!booster) return createEmptyCommit();
    return collectBoosterCommit(booster, snapshot);
  }

  return collectDirectCommit(effect.request, snapshot);
};

export const resolveEffectVisualTargets = (
  effect: ActiveEffect,
  snapshot: DestructionSnapshot
): DestructionVisualTarget[] => {
  if (effect.request.kind === 'booster') {
    if (!effect.boosterId) return [];
    const booster = snapshot.boosters.find((entry) => entry.id === effect.boosterId);
    if (!booster) return [];
    const points = collectBoosterTargetPoints(snapshot.grid, booster);
    return buildVisualTargets(snapshot, points);
  }

  const points = collectDirectTargetPoints(snapshot, effect.request.tileIds, effect.request.tilePoints);
  return buildVisualTargets(snapshot, points);
};

export const applyCommitToSnapshot = (
  snapshot: DestructionSnapshot,
  commit: DestructionCommit
): DestructionSnapshot => {
  if (
    commit.removeTileIds.length === 0
    && commit.unlockTileIds.length === 0
    && commit.removeBoosterIds.length === 0
  ) {
    return snapshot;
  }

  const removeTileIdSet = new Set(commit.removeTileIds);
  const unlockTileIdSet = new Set(commit.unlockTileIds);
  const removeBoosterIdSet = new Set(commit.removeBoosterIds);

  const nextGrid = snapshot.grid.map((row) => row.map((tile) => {
    if (!tile) return null;
    if (removeTileIdSet.has(tile.id)) return null;
    if (unlockTileIdSet.has(tile.id) && tile.locked) return { ...tile, locked: false };
    return tile;
  }));

  const nextBoosters = snapshot.boosters.filter((booster) => !removeBoosterIdSet.has(booster.id));

  return {
    ...snapshot,
    grid: nextGrid,
    boosters: nextBoosters
  };
};

export const toRuntimeState = (
  pendingRequests: DestructionRequest[],
  activeEffects: ActiveEffect[],
  frameNow = Date.now()
): DestructionRuntimeState => ({
  pendingRequests,
  activeEffects,
  destructionLock: pendingRequests.length > 0 || activeEffects.length > 0,
  frameNow
});

export const isRuntimeIdle = (runtime: DestructionRuntimeState): boolean => (
  runtime.pendingRequests.length === 0 && runtime.activeEffects.length === 0
);

export const getBoosterPreviewColor = (boosterType: BoosterType | undefined): string => {
  if (boosterType === 'rocket_h' || boosterType === 'rocket_v') return 'rgba(239, 68, 68, 0.3)';
  if (boosterType === 'line_bomb') return 'rgba(59, 130, 246, 0.3)';
  if (boosterType === 'bomb') return 'rgba(249, 115, 22, 0.3)';
  if (boosterType === 'color_ball') return 'rgba(168, 85, 247, 0.3)';
  return 'rgba(168, 85, 247, 0.25)';
};

export const toCellKeys = (targets: DestructionVisualTarget[]): Set<string> => toCellSet(targets);

export const buildTileLookup = (grid: DestructionSnapshot['grid']): Map<string, Point> => {
  const byId = new Map<string, Point>();

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const tile = grid[y][x];
      if (!tile) continue;
      byId.set(tile.id, { x, y });
    }
  }

  return byId;
};

export const getLiveTilePoints = (
  grid: DestructionSnapshot['grid'],
  tileIds: string[]
): Point[] => {
  const lookup = buildTileLookup(grid);
  const points: Point[] = [];
  const seen = new Set<string>();

  for (const tileId of tileIds) {
    const point = lookup.get(tileId);
    if (!point) continue;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(point);
  }

  return points;
};

export const sourceLabel = (source: DestructionSource): string => source;
