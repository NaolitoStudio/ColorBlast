import { Booster, BoosterType, Color, LevelObjective, Point, TileData } from '../../../types';

export type DestructionRequestKind = 'booster' | 'direct';

export type DestructionSource =
  | 'click'
  | 'chain'
  | 'target'
  | 'wildcard'
  | 'celebration'
  | 'system';

export type DestructionPhase = 'telegraph' | 'commit' | 'done';

export type DestructionVisualTarget = {
  x: number;
  y: number;
  tileId?: string;
  boosterId?: string;
};

export type DestructionRequest = {
  requestId: string;
  kind: DestructionRequestKind;
  source: DestructionSource;
  boosterId?: string;
  tileIds?: string[];
  tilePoints?: Point[];
  scorePerTile?: number;
  requestedAt: number;
};

export type ActiveEffect = {
  effectId: string;
  requestId: string;
  boosterId?: string;
  boosterType?: BoosterType;
  source: DestructionSource;
  phase: DestructionPhase;
  startedAt: number;
  commitAt: number;
  visualTargets: DestructionVisualTarget[];
  request: DestructionRequest;
};

export type DestructionCommit = {
  removeTileIds: string[];
  unlockTileIds: string[];
  removeBoosterIds: string[];
  triggerBoosterIds: string[];
  scoreDelta: number;
  objectiveDeltas: Partial<Record<Color, number>>;
  clearingTileIds: string[];
};

export type DestructionRuntimeState = {
  pendingRequests: DestructionRequest[];
  activeEffects: ActiveEffect[];
  destructionLock: boolean;
  frameNow: number;
};

export type DestructionSnapshot = {
  grid: (TileData | null)[][];
  boosters: Booster[];
  objectives: LevelObjective[];
};

export type DestructionTiming = {
  telegraphMs: number;
};
