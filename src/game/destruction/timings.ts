import { BoosterType } from '../../../types';
import { DestructionRequestKind, DestructionTiming } from './types';

const BOOSTER_TELEGRAPH_MS: Record<NonNullable<BoosterType>, number> = {
  color_ball: 1500,
  line_bomb: 0,
  bomb: 0,
  rocket_h: 0,
  rocket_v: 0,
};

const DIRECT_TELEGRAPH_MS = 0;

export const getBoosterTelegraphMs = (boosterType: BoosterType | undefined): number => {
  if (!boosterType) return DIRECT_TELEGRAPH_MS;
  return BOOSTER_TELEGRAPH_MS[boosterType] ?? DIRECT_TELEGRAPH_MS;
};

export const getDestructionTiming = (
  kind: DestructionRequestKind,
  boosterType?: BoosterType
): DestructionTiming => {
  if (kind === 'booster') {
    return { telegraphMs: getBoosterTelegraphMs(boosterType) };
  }

  return { telegraphMs: DIRECT_TELEGRAPH_MS };
};
