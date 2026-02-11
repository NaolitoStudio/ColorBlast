
export interface LevelData {
  id: number;
  name: string;
  seed: string;
  maxStartingColors?: number;
}

export const LEVELS: LevelData[] = [
  { id: 1, name: "Level 1", seed: "level-1-seed-9823", maxStartingColors: 2 },
  { id: 2, name: "Level 2", seed: "level-2-seed-1142", maxStartingColors: 3 },
  { id: 3, name: "Level 3", seed: "level-3-seed-5561", maxStartingColors: 3 },
  { id: 4, name: "Level 4", seed: "level-4-seed-8820", maxStartingColors: 3 },
  { id: 5, name: "Level 5", seed: "level-5-seed-3319", maxStartingColors: 3 },
  { id: 6, name: "Level 6", seed: "level-6-seed-7742", maxStartingColors: 4 },
  { id: 7, name: "Level 7", seed: "level-7-seed-1209" },
  { id: 8, name: "Level 8", seed: "level-8-seed-4431" },
  { id: 9, name: "Level 9", seed: "level-9-seed-6652" },
  { id: 10, name: "Level 10", seed: "level-10-seed-2291" },
  { id: 11, name: "Level 11", seed: "level-11-seed-0012" },
  { id: 12, name: "Level 12", seed: "level-12-seed-9938" },
  { id: 13, name: "Level 13", seed: "level-13-seed-4475" },
  { id: 14, name: "Level 14", seed: "level-14-seed-2210" },
  { id: 15, name: "Level 15", seed: "level-15-seed-8863" },
];
