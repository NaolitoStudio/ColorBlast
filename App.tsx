
import React, { useState, useEffect, useRef } from 'react';
import { GameState, PieceData, Point, Color, LevelObjective, Booster, BoosterType } from './types';
import { createRandomGrid, generatePiece, generateValidHand, canPlacePiece, findMatchGroups, findGroupCenter, getBombExplosionPoints, isGameOver, calculateScore, initializeObjectives, getAdjacentToMatches } from './utils/gameLogic';
import { GRID_SIZE, getLevelConfig } from './constants';
import { ICONS, UI_ASSETS } from './assets';

// Since Color enum values are already icon paths, we don't need a separate mapping
// Just check if the color value looks like an icon path (starts with '/icons/')
const isIconPath = (color: string) => color.startsWith('/icons/');

const DRAG_OFFSET_Y = 25; // How much the piece is lifted above the finger/cursor

// Helper to get particle color from icon path
const getParticleColor = (iconPath: string): string => {
  if (iconPath.includes('blue')) return '#3b82f6'; // Blue
  if (iconPath.includes('green')) return '#22c55e'; // Green
  if (iconPath.includes('purple')) return '#a855f7'; // Purple
  if (iconPath.includes('yellow')) return '#eab308'; // Yellow
  if (iconPath.includes('orange')) return '#f97316'; // Orange
  return '#888888'; // Fallback
};

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  scale: number;
  color: string;
}

const App: React.FC = () => {
  // Unique ID counter for particles and other elements
  const particleIdCounter = useRef(0);

  const [gameState, setGameState] = useState<GameState>(() => {
    const initialLevel = 1;
    const levelConfig = getLevelConfig(initialLevel);
    const initialGrid = createRandomGrid(levelConfig.gridFill, initialLevel);
    const initialHand = generateValidHand(initialGrid, initialLevel);
    return {
      grid: initialGrid,
      boosters: [],
      score: 0,
      highScore: Number(localStorage.getItem('highScore')) || 0,
      hand: initialHand,
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1,
      level: initialLevel,
      objectives: initializeObjectives(initialLevel),
      levelComplete: false
    };
  });

  const [hoveredCell, setHoveredCell] = useState<Point | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number } | null>(null);
  const [dragCellSize, setDragCellSize] = useState<number>(40);
  const [dragVelocity, setDragVelocity] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const lastDragPos = useRef<{ x: number, y: number, time: number } | null>(null);
  
  // Effects State
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showLevelPopup, setShowLevelPopup] = useState(false);
  const [showAllClear, setShowAllClear] = useState(false);
  const [affectedCells, setAffectedCells] = useState<Set<string>>(new Set());
  const [affectedColor, setAffectedColor] = useState<string>('transparent');

  // Powerup uses (reset each level)
  const [trashUses, setTrashUses] = useState(1);
  const [shuffleUses, setShuffleUses] = useState(3);
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [pendingTrashIndex, setPendingTrashIndex] = useState<number | null>(null);
  const [watchingAd, setWatchingAd] = useState(false);
  const [trashingPieceIndex, setTrashingPieceIndex] = useState<number | null>(null);
  const [trashSelectMode, setTrashSelectMode] = useState(false);
  const [shufflePhase, setShufflePhase] = useState<'darkening' | 'levitating' | 'scrambling' | 'landing' | null>(null);
  const [shuffleAnimations, setShuffleAnimations] = useState<Array<{
    tile: { color: Color; id: string };
    fromPx: { x: number; y: number };
    toPx: { x: number; y: number };
    progress: number;
    cellSize: number;
  }>>([]);
  const [fadingBoxIndex, setFadingBoxIndex] = useState<{ index: number; fading: boolean } | null>(null);
  const [fadingInPieces, setFadingInPieces] = useState<boolean>(false);
  const [returningPiece, setReturningPiece] = useState<{
    piece: PieceData;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    index: number;
    progress: number;
  } | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  // Animation Loop
  useEffect(() => {
    let animationFrameId: number;
    const updateEffects = () => {
      setParticles(prev => {
        if (prev.length === 0) return prev;
        return prev.map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.5, // Gravity
          life: p.life - 1
        })).filter(p => p.life > 0);
      });

      setFloatingTexts(prev => {
        if (prev.length === 0) return prev;
        return prev.map(t => ({
          ...t,
          y: t.y - 1.5, // Float up
          life: t.life - 1
        })).filter(t => t.life > 0);
      });

      // Update returning piece animation
      setReturningPiece(prev => {
        if (!prev) return prev;
        const newProgress = prev.progress + 0.12; // Fast animation
        if (newProgress >= 1) {
          return null; // Animation complete
        }
        return { ...prev, progress: newProgress };
      });

      animationFrameId = requestAnimationFrame(updateEffects);
    };
    animationFrameId = requestAnimationFrame(updateEffects);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Sync high score
  useEffect(() => {
    if (gameState.score > gameState.highScore) {
      setGameState(prev => ({ ...prev, highScore: prev.score }));
      localStorage.setItem('highScore', gameState.score.toString());
    }
  }, [gameState.score, gameState.highScore]);

  // Start celebration when level is complete
  useEffect(() => {
    if (gameState.levelComplete && !celebrating && !showLevelPopup) {
      // Small delay before starting celebration
      setTimeout(() => startCelebration(), 500);
    }
  }, [gameState.levelComplete]);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  };

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    // Convert icon path to actual color for particles
    const particleColor = isIconPath(color) ? getParticleColor(color) : color;

    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      newParticles.push({
        id: ++particleIdCounter.current,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // Slight upward bias
        color: particleColor,
        life: 40 + Math.random() * 20,
        maxLife: 60,
        size: Math.random() * 6 + 4
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  const spawnFloatingText = (x: number, y: number, text: string) => {
    setFloatingTexts(prev => [...prev, {
      id: ++particleIdCounter.current,
      x,
      y,
      text,
      life: 60,
      maxLife: 60,
      scale: 1,
      color: '#fff'
    }]);
  };

  // Check if grid is completely empty (no tiles and no boosters)
  const isGridEmpty = (grid: (typeof gameState.grid), boosters: Booster[]): boolean => {
    if (boosters.length > 0) return false;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x] !== null) return false;
      }
    }
    return true;
  };

  // Check if only boosters remain (no regular tiles)
  const hasOnlyBoostersLeft = (grid: (typeof gameState.grid), boosters: Booster[]): boolean => {
    if (boosters.length === 0) return false;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x] !== null) return false;
      }
    }
    return true; // No tiles but boosters exist
  };

  // Handle case when only boosters remain - spawn new tiles if objectives not complete
  const handleOnlyBoostersLeft = () => {
    setGameState(prev => {
      if (prev.levelComplete) return prev;

      // Regenerate tiles around boosters, avoiding booster positions
      const boosterPositions = new Set(prev.boosters.map(b => `${b.x},${b.y}`));
      const levelConfig = getLevelConfig(prev.level);
      const levelColors = getColorsForLevel(prev.level);

      const newGrid: (typeof prev.grid) = prev.grid.map(row => [...row]);

      // Fill empty cells (not occupied by boosters) with new tiles
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (newGrid[y][x] === null && !boosterPositions.has(`${x},${y}`)) {
            if (Math.random() < levelConfig.gridFill) {
              newGrid[y][x] = {
                color: levelColors[Math.floor(Math.random() * levelColors.length)],
                id: `regen-${Date.now()}-${x}-${y}`
              };
            }
          }
        }
      }

      // Ensure we spawned at least some tiles
      let tileCount = 0;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (newGrid[y][x] !== null) tileCount++;
        }
      }

      // If too few tiles, force spawn more
      if (tileCount < 10) {
        const emptyPositions: { x: number; y: number }[] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            if (newGrid[y][x] === null && !boosterPositions.has(`${x},${y}`)) {
              emptyPositions.push({ x, y });
            }
          }
        }
        // Shuffle and fill first 15 positions
        emptyPositions.sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(15, emptyPositions.length); i++) {
          const pos = emptyPositions[i];
          newGrid[pos.y][pos.x] = {
            color: levelColors[Math.floor(Math.random() * levelColors.length)],
            id: `regen-${Date.now()}-${pos.x}-${pos.y}`
          };
        }
      }

      const newHand = generateValidHand(newGrid, prev.level);

      return {
        ...prev,
        grid: newGrid,
        hand: newHand
      };
    });
  };

  // Handle ALL CLEAR - regenerate grid if objectives not complete
  const handleAllClear = () => {
    setShowAllClear(true);
    triggerShake();

    // Spawn celebration particles across the board
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
      for (let i = 0; i < 50; i++) {
        const x = rect.left + Math.random() * rect.width;
        const y = rect.top + Math.random() * rect.height;
        spawnParticles(x, y, colors[Math.floor(Math.random() * colors.length)], 3);
      }
    }

    // Bonus score for ALL CLEAR
    setGameState(prev => ({ ...prev, score: prev.score + 500 }));

    setTimeout(() => {
      setShowAllClear(false);

      // Check if level complete, if not regenerate grid
      setGameState(prev => {
        if (prev.levelComplete) {
          return prev; // Let level complete celebration handle it
        }

        // Regenerate grid with current level config
        const levelConfig = getLevelConfig(prev.level);
        const newGrid = createRandomGrid(levelConfig.gridFill, prev.level);
        const newHand = generateValidHand(newGrid, prev.level);

        return {
          ...prev,
          grid: newGrid,
          boosters: [],
          hand: newHand,
          combo: prev.combo + 1 // Bonus combo for all clear
        };
      });
    }, 1500);
  };

  // Get cells that would be affected by a booster
  const getBoosterAffectedCells = (booster: Booster): Set<string> => {
    const affected = new Set<string>();
    const grid = gameState.grid;

    if (booster.type === 'rocket_h') {
      // Entire row only
      for (let i = 0; i < GRID_SIZE; i++) {
        affected.add(`${i},${booster.y}`);
      }
    } else if (booster.type === 'rocket_v') {
      // Entire column only
      for (let i = 0; i < GRID_SIZE; i++) {
        affected.add(`${booster.x},${i}`);
      }
    } else if (booster.type === 'line_bomb') {
      // Entire row and column
      for (let i = 0; i < GRID_SIZE; i++) {
        affected.add(`${i},${booster.y}`); // Row
        affected.add(`${booster.x},${i}`); // Column
      }
    } else if (booster.type === 'bomb') {
      // 1 layer around (8 neighbors + center)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = booster.x + dx;
          const ny = booster.y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
            affected.add(`${nx},${ny}`);
          }
        }
      }
    } else if (booster.type === 'color_ball') {
      // All tiles of the same color
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (grid[y][x]?.color === booster.color) {
            affected.add(`${x},${y}`);
          }
        }
      }
      // Also include the booster position
      affected.add(`${booster.x},${booster.y}`);
    }

    return affected;
  };

  // Chain explosion celebration when level is complete
  const startCelebration = () => {
    setCelebrating(true);

    const boosters = [...gameState.boosters];
    const boosterDelay = 400; // ms between booster activations

    // Phase 1: Activate all boosters first
    if (boosters.length > 0) {
      boosters.forEach((booster, index) => {
        setTimeout(() => {
          // Trigger booster explosion visually
          celebrationBoosterExplosion(booster);

          // After last booster, start phase 2
          if (index === boosters.length - 1) {
            setTimeout(() => {
              explodeRemainingBlocks();
            }, 500);
          }
        }, index * boosterDelay);
      });
    } else {
      // No boosters, go directly to phase 2
      explodeRemainingBlocks();
    }
  };

  // Explode a booster during celebration (simplified version)
  const celebrationBoosterExplosion = (booster: Booster) => {
    // Use getBoosterAffectedCells to get the affected points
    const affectedSet = getBoosterAffectedCells(booster);
    const affectedPoints: Point[] = Array.from(affectedSet).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });

    // Show indicator
    const previewCells = new Set(affectedPoints.map(p => `${p.x},${p.y}`));
    const previewColor = booster.type === 'rocket_h' || booster.type === 'rocket_v' ? 'rgba(239, 68, 68, 0.3)'
      : booster.type === 'line_bomb' ? 'rgba(59, 130, 246, 0.3)'
      : booster.type === 'bomb' ? 'rgba(249, 115, 22, 0.3)'
      : 'rgba(168, 85, 247, 0.3)';

    setAffectedCells(previewCells);
    setAffectedColor(previewColor);

    // Spawn particles and clear affected cells
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / GRID_SIZE;

      setGameState(prev => {
        const newGrid = prev.grid.map(row => [...row]);
        let scoreBonus = 0;

        affectedPoints.forEach(p => {
          const cell = newGrid[p.y]?.[p.x];
          if (cell) {
            const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
            const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
            spawnParticles(cellCenterX, cellCenterY, cell.color, 6);
            newGrid[p.y][p.x] = null;
            scoreBonus += 10;
          }
        });

        // Remove the booster
        const newBoosters = prev.boosters.filter(b => b.id !== booster.id);

        return {
          ...prev,
          grid: newGrid,
          boosters: newBoosters,
          score: prev.score + scoreBonus
        };
      });
    }

    triggerShake();

    // Clear indicator
    setTimeout(() => {
      setAffectedCells(new Set());
      setAffectedColor('transparent');
    }, 300);
  };

  // Phase 2: Explode remaining blocks one by one
  const explodeRemainingBlocks = () => {
    setGameState(prev => {
      const blocks: { x: number; y: number; color: string; id: string }[] = [];
      prev.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell) {
            blocks.push({ x, y, color: cell.color, id: cell.id });
          }
        });
      });

      // Shuffle blocks for random explosion order
      const shuffled = blocks.sort(() => Math.random() - 0.5);

      if (shuffled.length === 0) {
        // No blocks left, show popup
        setTimeout(() => {
          setCelebrating(false);
          setShowLevelPopup(true);
        }, 300);
        return prev;
      }

      // Explode each block one by one
      const delay = 60;
      shuffled.forEach((block, index) => {
        setTimeout(() => {
          if (boardRef.current) {
            const rect = boardRef.current.getBoundingClientRect();
            const cellSize = rect.width / GRID_SIZE;
            const cellCenterX = rect.left + (block.x * cellSize) + (cellSize / 2);
            const cellCenterY = rect.top + (block.y * cellSize) + (cellSize / 2);
            spawnParticles(cellCenterX, cellCenterY, block.color, 8);
          }

          setGameState(p => {
            const newGrid = p.grid.map(row => [...row]);
            newGrid[block.y][block.x] = null;
            return { ...p, grid: newGrid, score: p.score + 5 };
          });

          if (index % 3 === 0) triggerShake();

          if (index === shuffled.length - 1) {
            setTimeout(() => {
              setCelebrating(false);
              setShowLevelPopup(true);
            }, 300);
          }
        }, index * delay);
      });

      return prev;
    });
  };

  const handleRestart = () => {
    const initialLevel = 1;
    const levelConfig = getLevelConfig(initialLevel);
    const initialGrid = createRandomGrid(levelConfig.gridFill, initialLevel);
    setGameState({
      grid: initialGrid,
      boosters: [],
      score: 0,
      highScore: Number(localStorage.getItem('highScore')) || 0,
      hand: generateValidHand(initialGrid, initialLevel),
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1,
      level: initialLevel,
      objectives: initializeObjectives(initialLevel),
      levelComplete: false
    });
    setParticles([]);
    setFloatingTexts([]);
    setCelebrating(false);
    setShowLevelPopup(false);
    setShowAllClear(false);
    setTrashUses(1);
    setShuffleUses(3);
  };

  const handleNextLevel = () => {
    const nextLevel = gameState.level + 1;
    const levelConfig = getLevelConfig(nextLevel);
    const newGrid = createRandomGrid(levelConfig.gridFill, nextLevel);
    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      boosters: [],
      hand: generateValidHand(newGrid, nextLevel),
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1,
      level: nextLevel,
      objectives: initializeObjectives(nextLevel),
      levelComplete: false
    }));
    setParticles([]);
    setFloatingTexts([]);
    setCelebrating(false);
    setShowLevelPopup(false);
    setShowAllClear(false);
    setTrashUses(1);
    setShuffleUses(3);
  };

  // Handle clicking on a booster to activate it
  const activateBooster = (booster: Booster) => {
    if (celebrating || showLevelPopup || showAllClear || gameState.gameOver) return;
    if (affectedCells.size > 0) return; // Already activating

    // Calculate affected cells for visual indicator
    const previewCells = getBoosterAffectedCells(booster);
    const previewColor = booster.type === 'rocket_h' || booster.type === 'rocket_v' ? 'rgba(239, 68, 68, 0.3)'
      : booster.type === 'line_bomb' ? 'rgba(59, 130, 246, 0.3)'
      : booster.type === 'bomb' ? 'rgba(249, 115, 22, 0.3)'
      : 'rgba(168, 85, 247, 0.3)';

    // Show affected area indicator (will fade out via CSS)
    setAffectedCells(previewCells);
    setAffectedColor(previewColor);

    // Clear indicator after fade animation
    setTimeout(() => {
      setAffectedCells(new Set());
      setAffectedColor('transparent');
    }, 400);

    // Execute explosion immediately (simultaneous with indicator)
    executeBoosterExplosion(booster);
  };

  // Get points affected by a booster explosion
  const getBoosterExplosionPoints = (booster: Booster, grid: (typeof gameState.grid)): Point[] => {
    const points: Point[] = [];
    if (booster.type === 'rocket_h') {
      // Entire row
      for (let i = 0; i < GRID_SIZE; i++) {
        points.push({ x: i, y: booster.y });
      }
    } else if (booster.type === 'rocket_v') {
      // Entire column
      for (let i = 0; i < GRID_SIZE; i++) {
        points.push({ x: booster.x, y: i });
      }
    } else if (booster.type === 'line_bomb') {
      for (let i = 0; i < GRID_SIZE; i++) {
        points.push({ x: i, y: booster.y }); // Row
        if (i !== booster.y) points.push({ x: booster.x, y: i }); // Column
      }
    } else if (booster.type === 'bomb') {
      // 8 neighbors + center
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = booster.x + dx;
          const ny = booster.y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
            points.push({ x: nx, y: ny });
          }
        }
      }
    } else if (booster.type === 'color_ball') {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (grid[y][x]?.color === booster.color) {
            points.push({ x, y });
          }
        }
      }
      points.push({ x: booster.x, y: booster.y }); // Include booster position
    }
    return points;
  };

  // Execute the actual booster explosion with CHAIN REACTIONS
  const executeBoosterExplosion = (initialBooster: Booster) => {
    const newGrid = gameState.grid.map(row => [...row]);
    let currentBoosters = [...gameState.boosters];
    let allPointsToRemove: Point[] = [];
    let totalScore = 0;
    let chainCount = 0;

    // Queue of boosters to explode
    const boosterQueue: Booster[] = [initialBooster];
    const explodedBoosterIds = new Set<string>();

    while (boosterQueue.length > 0) {
      const booster = boosterQueue.shift()!;
      if (explodedBoosterIds.has(booster.id)) continue;
      explodedBoosterIds.add(booster.id);
      chainCount++;

      let effectText = '';
      let bonusMultiplier = 1;

      if (booster.type === 'line_bomb') {
        effectText = '💣 LINE BLAST!';
        bonusMultiplier = 1.5;
      } else if (booster.type === 'bomb') {
        effectText = '💥 BOOM!';
        bonusMultiplier = 2;
      } else if (booster.type === 'color_ball') {
        effectText = '⚡ COLOR BLAST!';
        bonusMultiplier = 3;
      }

      const pointsFromThisBooster = getBoosterExplosionPoints(booster, newGrid);

      // Spawn visuals for this booster
      if (boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const cellSize = rect.width / GRID_SIZE;
        const boosterCenterX = rect.left + (booster.x * cellSize) + (cellSize / 2);
        const boosterCenterY = rect.top + (booster.y * cellSize) + (cellSize / 2);

        // Particles for each exploded block
        pointsFromThisBooster.forEach(p => {
          const tile = newGrid[p.y]?.[p.x];
          if (tile) {
            const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
            const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
            spawnParticles(cellCenterX, cellCenterY, tile.color, 8);
          }
        });

        spawnFloatingText(boosterCenterX, boosterCenterY - 20, effectText);
        if (chainCount > 1) {
          spawnFloatingText(boosterCenterX, boosterCenterY + 30, `CHAIN x${chainCount}!`);
        }
      }

      // Check for OTHER boosters in the explosion radius
      pointsFromThisBooster.forEach(p => {
        const hitBooster = currentBoosters.find(b => b.x === p.x && b.y === p.y && !explodedBoosterIds.has(b.id));
        if (hitBooster) {
          boosterQueue.push(hitBooster);
        }
      });

      // Collect points - unlock locked tiles, remove unlocked ones
      let tilesCleared = 0;
      pointsFromThisBooster.forEach(p => {
        const tile = newGrid[p.y]?.[p.x];
        if (tile) {
          if (tile.locked) {
            // Unlock the tile instead of removing it
            newGrid[p.y][p.x] = { ...tile, locked: false };
            // Spawn unlock visual
            if (boardRef.current) {
              const rect = boardRef.current.getBoundingClientRect();
              const cellSize = rect.width / GRID_SIZE;
              const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
              const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
              spawnFloatingText(cellCenterX, cellCenterY, '🔓');
            }
          } else {
            // Remove unlocked tile
            if (!allPointsToRemove.some(cp => cp.x === p.x && cp.y === p.y)) {
              allPointsToRemove.push(p);
              tilesCleared++;
            }
          }
        }
      });

      totalScore += Math.round(tilesCleared * 15 * bonusMultiplier);

      // Remove booster from list
      currentBoosters = currentBoosters.filter(b => b.id !== booster.id);
    }

    // Count colors for objectives
    const colorCounts: Record<string, number> = {};
    allPointsToRemove.forEach(p => {
      const tile = newGrid[p.y][p.x];
      if (tile) {
        colorCounts[tile.color] = (colorCounts[tile.color] || 0) + 1;
      }
    });

    // Update objectives
    const newObjectives = gameState.objectives.map(obj => ({
      ...obj,
      current: Math.min(obj.target, obj.current + (colorCounts[obj.color] || 0))
    }));

    const isLevelComplete = newObjectives.every(obj => obj.current >= obj.target);

    // Collect IDs for animation
    const matchingIds = allPointsToRemove.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

    // Show total score
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / GRID_SIZE;
      const avgX = allPointsToRemove.reduce((acc, p) => acc + p.x, 0) / allPointsToRemove.length;
      const avgY = allPointsToRemove.reduce((acc, p) => acc + p.y, 0) / allPointsToRemove.length;
      spawnFloatingText(rect.left + avgX * cellSize, rect.top + avgY * cellSize, `+${totalScore}`);
    }

    triggerShake();

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      boosters: currentBoosters,
      score: prev.score + totalScore,
      clearingTiles: matchingIds,
      objectives: newObjectives,
      levelComplete: isLevelComplete
    }));

    // Remove tiles after animation
    setTimeout(() => {
      setGameState(prev => {
        const finalGrid = prev.grid.map(row => [...row]);
        allPointsToRemove.forEach(p => {
          finalGrid[p.y][p.x] = null;
        });

        // Check for ALL CLEAR
        if (isGridEmpty(finalGrid, prev.boosters)) {
          setTimeout(() => handleAllClear(), 100);
          return {
            ...prev,
            grid: finalGrid,
            clearingTiles: []
          };
        }

        // Check if only boosters remain - spawn new tiles if objectives not complete
        if (hasOnlyBoostersLeft(finalGrid, prev.boosters) && !prev.levelComplete) {
          setTimeout(() => handleOnlyBoostersLeft(), 100);
          return { ...prev, grid: finalGrid, clearingTiles: [] };
        }

        const lost = !prev.levelComplete && isGameOver(finalGrid, prev.hand);
        return {
          ...prev,
          grid: finalGrid,
          clearingTiles: [],
          gameOver: lost
        };
      });
    }, 400);
  };

  // Execute trash with shake + explode animation
  const executeTrash = (index: number) => {
    const piece = gameState.hand[index];
    if (!piece) return;

    // Start shake animation
    setTrashingPieceIndex(index);

    // After 1 second, explode and remove
    setTimeout(() => {
      // Spawn explosion particles at piece location
      const pieceEl = pieceRefs.current[index];
      if (pieceEl) {
        const rect = pieceEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Spawn particles for each color in the piece
        piece.colors.forEach((color, i) => {
          const offsetX = (Math.random() - 0.5) * rect.width * 0.5;
          const offsetY = (Math.random() - 0.5) * rect.height * 0.5;
          spawnParticles(centerX + offsetX, centerY + offsetY, color, 8);
        });
      }

      triggerShake();
      setTrashingPieceIndex(null);

      // Remove piece from hand
      setGameState(prev => {
        const newHand = [...prev.hand];
        newHand[index] = null;

        if (newHand.every(p => p === null)) {
          return {
            ...prev,
            hand: generateValidHand(prev.grid, prev.level),
            selectedPieceIndex: null
          };
        }

        return { ...prev, hand: newHand, selectedPieceIndex: null };
      });
    }, 800); // Shake for 800ms then explode
  };

  // Trash a piece (when dropped on trash)
  const trashPiece = (index: number) => {
    if (trashUses > 0) {
      setTrashUses(prev => prev - 1);
      executeTrash(index);
    } else {
      // Show ad popup - deselect piece first
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
      setPendingTrashIndex(index);
      setShowAdPopup(true);
    }
  };

  // Handle watching ad
  const handleWatchAd = () => {
    setWatchingAd(true);
    // Simulate watching an ad (in real app, this would show actual ad)
    setTimeout(() => {
      if (pendingTrashIndex !== null) {
        executeTrash(pendingTrashIndex);
      }
      setShowAdPopup(false);
      setPendingTrashIndex(null);
      setWatchingAd(false);
    }, 1500); // Simulate 1.5s ad
  };

  const handleCancelAd = () => {
    setShowAdPopup(false);
    setPendingTrashIndex(null);
  };

  // Handle trash select mode
  const handleTrashSelect = (index: number) => {
    setTrashSelectMode(false);
    trashPiece(index);
  };

  // Handle shuffle powerup
  const activateShuffle = () => {
    if (shuffleUses <= 0 || shufflePhase || !boardRef.current) return;
    setShuffleUses(prev => prev - 1);

    // Read cell positions BEFORE any transforms are applied
    const boardRect = boardRef.current.getBoundingClientRect();
    const gridElement = boardRef.current.querySelector('.board-grid');
    if (!gridElement) return;

    const cellElements = gridElement.children;
    const cellPositions: { x: number; y: number; width: number }[] = [];

    for (let i = 0; i < cellElements.length; i++) {
      const cellRect = cellElements[i].getBoundingClientRect();
      cellPositions.push({
        x: cellRect.left - boardRect.left,
        y: cellRect.top - boardRect.top,
        width: cellRect.width
      });
    }

    // Start shuffle animation sequence
    setShufflePhase('darkening');

    setTimeout(() => {
      setShufflePhase('levitating');

      setTimeout(() => {
        // Calculate and start the shuffle animation with pre-captured positions
        performShuffle(cellPositions);
        setShufflePhase('scrambling');
      }, 400);
    }, 300);
  };

  // Perform the shuffle using pre-captured cell positions (before transforms)
  const performShuffle = (cellPositions: { x: number; y: number; width: number }[]) => {
    const { grid, boosters } = gameState;

    // Collect all tiles with their original positions
    const originalTiles: { tile: { color: Color; id: string }; gridX: number; gridY: number; pxPos: { x: number; y: number }; cellSize: number }[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x]) {
          const cellIndex = y * GRID_SIZE + x;
          const pos = cellPositions[cellIndex];
          originalTiles.push({
            tile: { color: grid[y][x]!.color, id: grid[y][x]!.id },
            gridX: x,
            gridY: y,
            pxPos: { x: pos.x, y: pos.y },
            cellSize: pos.width
          });
        }
      }
    }

    // Collect all boosters with their original positions
    const originalBoosters: { booster: Booster; pxPos: { x: number; y: number }; cellSize: number }[] = [];
    boosters.forEach(b => {
      const cellIndex = b.y * GRID_SIZE + b.x;
      const pos = cellPositions[cellIndex];
      originalBoosters.push({
        booster: { ...b },
        pxPos: { x: pos.x, y: pos.y },
        cellSize: pos.width
      });
    });

    const totalItems = originalTiles.length + originalBoosters.length;
    if (totalItems < 2) return;

    // Get ALL available positions (entire grid)
    const allAvailablePositions: { x: number; y: number }[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        allAvailablePositions.push({ x, y });
      }
    }

    // Try shuffling until we get 1-3 matches (max 50 attempts)
    let shuffledTilePositions: { x: number; y: number }[] = [];
    let shuffledBoosterPositions: { x: number; y: number }[] = [];
    let matchCount = 0;
    let attempts = 0;

    do {
      // Shuffle ALL available positions
      const shuffledPositions = [...allAvailablePositions].sort(() => Math.random() - 0.5);

      // First N positions go to boosters, rest go to tiles
      shuffledBoosterPositions = shuffledPositions.slice(0, originalBoosters.length);
      shuffledTilePositions = shuffledPositions.slice(originalBoosters.length, originalBoosters.length + originalTiles.length);

      // Create test grid to check matches (only tiles matter for matches)
      const testGrid: (typeof grid[0][0])[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
      originalTiles.forEach((t, i) => {
        const newPos = shuffledTilePositions[i];
        testGrid[newPos.y][newPos.x] = { color: t.tile.color, id: t.tile.id };
      });

      const matches = findMatchGroups(testGrid);
      matchCount = matches.length;
      attempts++;
    } while ((matchCount < 1 || matchCount > 3) && attempts < 50);

    // If no matches found after 50 attempts, try to cluster tiles or force a match
    if (matchCount === 0) {
      // Group tiles by color
      const colorGroups: Map<Color, number[]> = new Map();
      originalTiles.forEach((t, i) => {
        const color = t.tile.color;
        if (!colorGroups.has(color)) colorGroups.set(color, []);
        colorGroups.get(color)!.push(i);
      });

      // Find the color with most tiles
      let bestColor: Color | null = null;
      let bestIndices: number[] = [];
      for (const [color, indices] of colorGroups) {
        if (indices.length > bestIndices.length) {
          bestColor = color;
          bestIndices = indices;
        }
      }

      // Create set of booster positions to avoid
      const boosterPosSet = new Set(shuffledBoosterPositions.map(p => `${p.x},${p.y}`));

      // Try to cluster tiles of the same color together
      if (bestColor && bestIndices.length >= 2) {
        // Find a good center position (middle of the grid)
        const centerX = Math.floor(GRID_SIZE / 2);
        const centerY = Math.floor(GRID_SIZE / 2);

        // Get positions near center, sorted by distance (excluding booster positions)
        const positionsByDistance = allAvailablePositions
          .filter(p => !boosterPosSet.has(`${p.x},${p.y}`))
          .map(p => ({ ...p, dist: Math.abs(p.x - centerX) + Math.abs(p.y - centerY) }))
          .sort((a, b) => a.dist - b.dist);

        // If we have 3+ of same color, place them adjacent for a match
        if (bestIndices.length >= 3) {
          // Find 3 adjacent positions near center
          let foundMatch = false;
          for (const startPos of positionsByDistance) {
            const directions = [
              [{ x: startPos.x, y: startPos.y }, { x: startPos.x + 1, y: startPos.y }, { x: startPos.x + 2, y: startPos.y }],
              [{ x: startPos.x, y: startPos.y }, { x: startPos.x, y: startPos.y + 1 }, { x: startPos.x, y: startPos.y + 2 }],
              [{ x: startPos.x, y: startPos.y }, { x: startPos.x + 1, y: startPos.y }, { x: startPos.x, y: startPos.y + 1 }],
            ];

            for (const positions of directions) {
              const allValid = positions.every(p =>
                p.x >= 0 && p.x < GRID_SIZE && p.y >= 0 && p.y < GRID_SIZE &&
                !boosterPosSet.has(`${p.x},${p.y}`)
              );

              if (allValid) {
                // Place the 3 same-color tiles at these positions
                const usedPositions = new Set<string>();
                for (let i = 0; i < 3; i++) {
                  shuffledTilePositions[bestIndices[i]] = positions[i];
                  usedPositions.add(`${positions[i].x},${positions[i].y}`);
                }

                // Redistribute other tiles to remaining positions
                const remainingPositions = allAvailablePositions
                  .filter(p => !usedPositions.has(`${p.x},${p.y}`) && !boosterPosSet.has(`${p.x},${p.y}`))
                  .sort(() => Math.random() - 0.5);

                let posIdx = 0;
                for (let i = 0; i < originalTiles.length; i++) {
                  if (!bestIndices.slice(0, 3).includes(i)) {
                    shuffledTilePositions[i] = remainingPositions[posIdx++];
                  }
                }
                foundMatch = true;
                break;
              }
            }
            if (foundMatch) break;
          }
        } else {
          // Less than 3 of any color - just cluster all tiles near center
          for (let i = 0; i < originalTiles.length; i++) {
            shuffledTilePositions[i] = positionsByDistance[i];
          }
        }
      }
    }

    // Create animation data with PIXEL positions read from DOM (tiles)
    const tileAnimations = originalTiles.map((t, i) => {
      const targetGridPos = shuffledTilePositions[i];
      const targetCellIndex = targetGridPos.y * GRID_SIZE + targetGridPos.x;
      const targetPxPos = cellPositions[targetCellIndex];

      return {
        tile: t.tile,
        fromPx: t.pxPos,
        toPx: { x: targetPxPos.x, y: targetPxPos.y },
        progress: 0,
        cellSize: t.cellSize,
        isBooster: false as const
      };
    });

    // Create animation data for boosters
    const boosterAnimations = originalBoosters.map((b, i) => {
      const targetGridPos = shuffledBoosterPositions[i];
      const targetCellIndex = targetGridPos.y * GRID_SIZE + targetGridPos.x;
      const targetPxPos = cellPositions[targetCellIndex];

      return {
        tile: { color: b.booster.color, id: b.booster.id },
        fromPx: b.pxPos,
        toPx: { x: targetPxPos.x, y: targetPxPos.y },
        progress: 0,
        cellSize: b.cellSize,
        isBooster: true as const,
        boosterType: b.booster.type
      };
    });

    const animations = [...tileAnimations, ...boosterAnimations];
    setShuffleAnimations(animations);

    // Start animation loop
    const animationDuration = 800; // ms
    const startTime = Date.now();

    const animateFrame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Ease out cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setShuffleAnimations(prev => prev.map(a => ({ ...a, progress: easedProgress })));

      if (progress < 1) {
        requestAnimationFrame(animateFrame);
      } else {
        // Animation complete - update grid and boosters, then transition to landing
        const newGrid: (typeof grid[0][0])[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
        originalTiles.forEach((t, i) => {
          const newPos = shuffledTilePositions[i];
          newGrid[newPos.y][newPos.x] = { color: t.tile.color, id: `shuffle-${Date.now()}-${i}` };
        });

        // Update booster positions
        const newBoosters = originalBoosters.map((b, i) => {
          const newPos = shuffledBoosterPositions[i];
          return { ...b.booster, x: newPos.x, y: newPos.y };
        });

        // Update grid and boosters, remove flying tiles and transition to landing
        setGameState(prev => ({ ...prev, grid: newGrid, boosters: newBoosters }));
        setShuffleAnimations([]);
        setShufflePhase('landing');

        // End landing and process matches with the new grid directly
        setTimeout(() => {
          setShufflePhase(null);
          processShuffleMatches(newGrid);
        }, 300);
      }
    };

    requestAnimationFrame(animateFrame);
  };

  // Process matches after shuffle - takes the new grid directly to avoid closure issues
  const processShuffleMatches = (newGrid: (TileData | null)[][]) => {
    const matchGroups = findMatchGroups(newGrid);
    if (matchGroups.length === 0) return;

    // Collect all cleared points
    const pointsToClear: { x: number; y: number; color: Color }[] = [];
    matchGroups.forEach(group => {
      group.forEach(p => {
        if (!pointsToClear.some(cp => cp.x === p.x && cp.y === p.y)) {
          const tile = newGrid[p.y][p.x];
          if (tile) {
            pointsToClear.push({ x: p.x, y: p.y, color: tile.color });
          }
        }
      });
    });

    // Calculate score
    const comboMultiplier = 1 + (gameState.combo - 1) * 0.1;
    const totalScore = Math.round(pointsToClear.length * 15 * comboMultiplier);

    // Count colors for objectives
    const colorCounts: Record<string, number> = {};
    pointsToClear.forEach(p => {
      colorCounts[p.color] = (colorCounts[p.color] || 0) + 1;
    });

    // Get matching IDs
    const matchingIds = pointsToClear.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

    // Spawn particles IMMEDIATELY (like piece placement does)
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / GRID_SIZE;

      pointsToClear.forEach(p => {
        const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
        const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
        spawnParticles(cellCenterX, cellCenterY, p.color, 6);
      });

      // Floating score text
      const avgX = pointsToClear.reduce((acc, p) => acc + p.x, 0) / pointsToClear.length;
      const avgY = pointsToClear.reduce((acc, p) => acc + p.y, 0) / pointsToClear.length;
      spawnFloatingText(rect.left + avgX * cellSize, rect.top + avgY * cellSize, `+${totalScore}`);
    }

    triggerShake();

    // Update state with clearingTiles for animation
    setGameState(prev => {
      const newObjectives = prev.objectives.map(obj => ({
        ...obj,
        current: Math.min(obj.target, obj.current + (colorCounts[obj.color] || 0))
      }));
      const isLevelComplete = newObjectives.every(obj => obj.current >= obj.target);

      return {
        ...prev,
        grid: newGrid,
        score: prev.score + totalScore,
        clearingTiles: matchingIds,
        objectives: newObjectives,
        levelComplete: isLevelComplete,
        combo: prev.combo + 1
      };
    });

    // Remove tiles after animation
    setTimeout(() => {
      setGameState(prev => {
        const finalGrid = prev.grid.map(row => [...row]);
        pointsToClear.forEach(p => {
          finalGrid[p.y][p.x] = null;
        });

        if (isGridEmpty(finalGrid, prev.boosters)) {
          setTimeout(() => handleAllClear(), 100);
          return { ...prev, grid: finalGrid, clearingTiles: [] };
        }

        // Check if only boosters remain
        if (hasOnlyBoostersLeft(finalGrid, prev.boosters) && !prev.levelComplete) {
          setTimeout(() => handleOnlyBoostersLeft(), 100);
          return { ...prev, grid: finalGrid, clearingTiles: [] };
        }

        const lost = !prev.levelComplete && isGameOver(finalGrid, prev.hand);
        return { ...prev, grid: finalGrid, clearingTiles: [], gameOver: lost };
      });
    }, 400);
  };

  const startDragging = (e: React.PointerEvent, index: number) => {
    if (gameState.hand[index] === null || gameState.gameOver || celebrating || showLevelPopup || showAllClear || trashingPieceIndex !== null) return;

    // Calculate cell size based on actual board dimensions
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const padding = 16; // p-4 = 1rem = 16px
      const gap = 2; // gap-0.5 = 2px
      const gridWidth = rect.width - (padding * 2);
      const totalGaps = (GRID_SIZE - 1) * gap;
      const cellSize = (gridWidth - totalGaps) / GRID_SIZE;
      setDragCellSize(cellSize);
    }

    setGameState(prev => ({ ...prev, selectedPieceIndex: index }));
    setDragPosition({ x: e.clientX, y: e.clientY });
    setDragVelocity({ x: 0, y: 0 });
    lastDragPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (gameState.selectedPieceIndex === null || gameState.gameOver) return;

    // Calculate velocity for jelly effect - use raw delta, more responsive
    if (lastDragPos.current) {
      const dx = e.clientX - lastDragPos.current.x;
      const dy = e.clientY - lastDragPos.current.y;
      // Direct velocity from movement delta
      setDragVelocity({ x: dx, y: dy });
    }
    lastDragPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };

    setDragPosition({ x: e.clientX, y: e.clientY });

    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();

      // Account for padding (p-4 = 1rem = 16px in Tailwind)
      const padding = 16;
      const gridWidth = rect.width - (padding * 2);
      const cellSize = gridWidth / GRID_SIZE;

      const piece = gameState.hand[gameState.selectedPieceIndex];
      if (!piece) return;

      // Calculate the visual center of the dragged piece
      const visualX = e.clientX;
      const visualY = e.clientY - DRAG_OFFSET_Y;

      // We want the piece's (0,0) tile to be aligned.
      const minX = Math.min(...piece.shape.map(p => p.x));
      const maxX = Math.max(...piece.shape.map(p => p.x));
      const minY = Math.min(...piece.shape.map(p => p.y));
      const maxY = Math.max(...piece.shape.map(p => p.y));

      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      // Target grid coordinates for the anchor (0,0) tile, accounting for padding
      const x = Math.round((visualX - rect.left - padding) / cellSize - midX - 0.5);
      const y = Math.round((visualY - rect.top - padding) / cellSize - midY - 0.5);

      if (x >= -2 && x < GRID_SIZE && y >= -2 && y < GRID_SIZE) {
        setHoveredCell({ x, y });
      } else {
        setHoveredCell(null);
      }
    }
  };

  const stopDragging = (e: React.PointerEvent) => {
    if (gameState.selectedPieceIndex === null) return;

    const pieceIndex = gameState.selectedPieceIndex;
    const piece = gameState.hand[pieceIndex];

    if (hoveredCell && piece && canPlacePiece(gameState.grid, piece, hoveredCell.x, hoveredCell.y)) {
      placePieceAt(hoveredCell.x, hoveredCell.y);
      setDragPosition(null);
      setHoveredCell(null);
            setDragVelocity({ x: 0, y: 0 });
      lastDragPos.current = null;
    } else if (piece && dragPosition) {
      // Invalid drop - animate piece returning to box
      const pieceBox = pieceRefs.current[pieceIndex];
      if (pieceBox) {
        const boxRect = pieceBox.getBoundingClientRect();
        const targetX = boxRect.left + boxRect.width / 2;
        const targetY = boxRect.top + boxRect.height / 2;

        setReturningPiece({
          piece,
          fromX: dragPosition.x,
          fromY: dragPosition.y - DRAG_OFFSET_Y,
          toX: targetX,
          toY: targetY,
          index: pieceIndex,
          progress: 0
        });
      }
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
      setDragPosition(null);
      setHoveredCell(null);
            setDragVelocity({ x: 0, y: 0 });
      lastDragPos.current = null;
    } else {
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
      setDragPosition(null);
      setHoveredCell(null);
            setDragVelocity({ x: 0, y: 0 });
      lastDragPos.current = null;
    }
  };

  const placePieceAt = (x: number, y: number) => {
    const { selectedPieceIndex, hand, grid, score, combo, level, objectives } = gameState;
    const piece = hand[selectedPieceIndex!];

    if (piece && canPlacePiece(grid, piece, x, y)) {
      // Fade out the box (but not if it's the last piece)
      const remainingPieces = hand.filter((p, i) => p !== null && i !== selectedPieceIndex).length;
      if (remainingPieces > 0) {
        setFadingBoxIndex({ index: selectedPieceIndex!, fading: false });
        requestAnimationFrame(() => {
          setFadingBoxIndex(prev => prev ? { ...prev, fading: true } : null);
        });
        setTimeout(() => setFadingBoxIndex(null), 350);
      }

      const newGrid = grid.map(row => [...row]);
      piece.shape.forEach((point, i) => {
        newGrid[y + point.y][x + point.x] = {
          color: piece.colors[i],
          id: `${Date.now()}-${Math.random()}`
        };
      });

      let newHand = [...hand];
      newHand[selectedPieceIndex!] = null;

      // When all pieces are used, generate new hand (same level)
      if (newHand.every(p => p === null)) {
        const validHand = generateValidHand(newGrid, level);
        newHand = validHand;
        // Trigger fade-in for new pieces
        setFadingInPieces(true);
        requestAnimationFrame(() => setFadingInPieces(false));
      }

      const matchGroups = findMatchGroups(newGrid);

      // Calculate Score & Effects
      if (matchGroups.length > 0) {
        const newCombo = combo + 1;

        // Collect ALL cleared points from ALL match groups
        let allClearedPoints: Point[] = [];
        matchGroups.forEach(group => {
          group.forEach(p => {
            if (!allClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
              allClearedPoints.push(p);
            }
          });
        });

        // Determine booster based on TOTAL blocks cleared (sum of all colors)
        const boostersToCreate: Booster[] = [];
        const totalForBooster = allClearedPoints.length;

        // Count unique colors in cleared points
        const clearedColorSet = new Set<Color>();
        allClearedPoints.forEach(p => {
          const cell = newGrid[p.y][p.x];
          if (cell) clearedColorSet.add(cell.color);
        });
        const uniqueColorsCleared = clearedColorSet.size;

        if (totalForBooster >= 4) {
          // Find center of ALL cleared points for booster placement
          const avgX = allClearedPoints.reduce((acc, p) => acc + p.x, 0) / totalForBooster;
          const avgY = allClearedPoints.reduce((acc, p) => acc + p.y, 0) / totalForBooster;

          // Find the actual point closest to center
          let centerPoint = allClearedPoints[0];
          let minDist = Infinity;
          allClearedPoints.forEach(p => {
            const dist = Math.abs(p.x - avgX) + Math.abs(p.y - avgY);
            if (dist < minDist) {
              minDist = dist;
              centerPoint = p;
            }
          });

          const centerCell = newGrid[centerPoint.y][centerPoint.x];

          if (totalForBooster >= 6 && uniqueColorsCleared >= 2 && centerCell) {
            // Superball - 6+ blocks with 2+ colors: eliminates all of most common color on grid
            const gridColorCounts: Record<string, number> = {};
            const clearedSet = new Set(allClearedPoints.map(p => `${p.x},${p.y}`));
            for (let gy = 0; gy < GRID_SIZE; gy++) {
              for (let gx = 0; gx < GRID_SIZE; gx++) {
                const cell = newGrid[gy][gx];
                if (cell && !clearedSet.has(`${gx},${gy}`)) {
                  gridColorCounts[cell.color] = (gridColorCounts[cell.color] || 0) + 1;
                }
              }
            }
            const mostCommonGridColor = Object.entries(gridColorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as Color || centerCell.color;

            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'color_ball',
              x: centerPoint.x,
              y: centerPoint.y,
              color: mostCommonGridColor
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          } else if (totalForBooster >= 6 && centerCell) {
            // Bomb - 6+ blocks (single color): eliminates 1 layer around
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'bomb',
              x: centerPoint.x,
              y: centerPoint.y,
              color: centerCell.color
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          } else if (totalForBooster === 5 && centerCell) {
            // Line bomb - 5 blocks: eliminates row + column
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'line_bomb',
              x: centerPoint.x,
              y: centerPoint.y,
              color: centerCell.color
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          } else if (totalForBooster === 4 && centerCell) {
            // Rocket - 4 blocks: eliminates one direction (random H or V)
            const isHorizontal = Math.random() < 0.5;
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: isHorizontal ? 'rocket_h' : 'rocket_v',
              x: centerPoint.x,
              y: centerPoint.y,
              color: centerCell.color
            });
            allClearedPoints = allClearedPoints.filter(p => p.x !== centerPoint.x || p.y !== centerPoint.y);
          }
        }

        const totalCleared = allClearedPoints.length;

        // Count cleared blocks by color for objectives
        const colorCounts: Record<string, number> = {};
        allClearedPoints.forEach(p => {
          const cell = newGrid[p.y][p.x];
          if (cell) {
            colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1;
          }
        });

        // Update objectives
        const newObjectives = objectives.map(obj => ({
          ...obj,
          current: Math.min(obj.target, obj.current + (colorCounts[obj.color] || 0))
        }));

        // Check if level complete
        const isLevelComplete = newObjectives.every(obj => obj.current >= obj.target);

        // Calculate score
        const { score: moveScore, text, multiplier } = calculateScore(totalCleared, newCombo);
        const newScore = score + moveScore;
        const matchingIds = allClearedPoints.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

        // Spawn Visuals
        if (boardRef.current) {
          const rect = boardRef.current.getBoundingClientRect();
          const cellSize = rect.width / GRID_SIZE;

          // Particles for cleared blocks
          allClearedPoints.forEach(p => {
            const cell = newGrid[p.y][p.x];
            if (cell) {
              const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
              const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
              spawnParticles(cellCenterX, cellCenterY, cell.color, 6);
            }
          });

          // Floating text for score
          if (text && totalCleared > 0) {
            const avgX = allClearedPoints.reduce((acc, p) => acc + p.x, 0) / totalCleared;
            const avgY = allClearedPoints.reduce((acc, p) => acc + p.y, 0) / totalCleared;
            const screenX = rect.left + (avgX * cellSize) + (cellSize / 2);
            const screenY = rect.top + (avgY * cellSize) + (cellSize / 2);
            spawnFloatingText(screenX, screenY, `${text} x${multiplier}`);
          }

          // Show booster creation text
          boostersToCreate.forEach(booster => {
            const screenX = rect.left + (booster.x * cellSize) + (cellSize / 2);
            const screenY = rect.top + (booster.y * cellSize) + (cellSize / 2);
            const boosterText = booster.type === 'color_ball' ? '⚡ SUPERBALL!' :
                               booster.type === 'bomb' ? '💥 BOMB!' :
                               booster.type === 'line_bomb' ? '💣 LINE!' :
                               booster.type === 'rocket_h' ? '🚀 ROCKET!' :
                               booster.type === 'rocket_v' ? '🚀 ROCKET!' : '💣 LINE!';
            spawnFloatingText(screenX, screenY - 20, boosterText);
          });
        }

        // Clear the center cells where boosters will be placed
        boostersToCreate.forEach(booster => {
          newGrid[booster.y][booster.x] = null;
        });

        // Merge new boosters with existing ones
        const newBoosters = [...gameState.boosters, ...boostersToCreate];

        triggerShake();

        setGameState(prev => ({
          ...prev,
          grid: newGrid,
          boosters: newBoosters,
          score: newScore,
          hand: newHand,
          selectedPieceIndex: null,
          clearingTiles: matchingIds,
          combo: newCombo,
          objectives: newObjectives,
          levelComplete: isLevelComplete
        }));

        setTimeout(() => {
          setGameState(prev => {
            let finalGrid = prev.grid.map(row =>
              row.map(cell => cell && matchingIds.includes(cell.id) ? null : cell)
            );

            // Find locked tiles adjacent to cleared tiles and unlock them
            const adjacentLockedTiles = getAdjacentToMatches(finalGrid, allClearedPoints);
            if (adjacentLockedTiles.length > 0) {
              adjacentLockedTiles.forEach(p => {
                const tile = finalGrid[p.y][p.x];
                if (tile && tile.locked) {
                  finalGrid[p.y][p.x] = { ...tile, locked: false };
                }
              });

              // Check for new matches after unlocking (chain reaction)
              const processChainReactions = (currentGrid: typeof finalGrid): typeof finalGrid => {
                const newMatchGroups = findMatchGroups(currentGrid);
                if (newMatchGroups.length === 0) return currentGrid;

                // Collect all points to clear
                let chainClearedPoints: Point[] = [];
                newMatchGroups.forEach(group => {
                  group.forEach(p => {
                    if (!chainClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
                      chainClearedPoints.push(p);
                    }
                  });
                });

                // Spawn particles for chain reaction
                if (boardRef.current) {
                  const rect = boardRef.current.getBoundingClientRect();
                  const cellSize = rect.width / GRID_SIZE;
                  chainClearedPoints.forEach(p => {
                    const cell = currentGrid[p.y][p.x];
                    if (cell) {
                      const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
                      const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
                      spawnParticles(cellCenterX, cellCenterY, cell.color, 6);
                    }
                  });
                }

                // Clear the matched tiles
                let updatedGrid = currentGrid.map(row => [...row]);
                chainClearedPoints.forEach(p => {
                  updatedGrid[p.y][p.x] = null;
                });

                // Unlock adjacent locked tiles for this chain
                const moreLockedTiles = getAdjacentToMatches(updatedGrid, chainClearedPoints);
                moreLockedTiles.forEach(p => {
                  const tile = updatedGrid[p.y][p.x];
                  if (tile && tile.locked) {
                    updatedGrid[p.y][p.x] = { ...tile, locked: false };
                  }
                });

                // Recursively process more chain reactions
                return processChainReactions(updatedGrid);
              };

              finalGrid = processChainReactions(finalGrid);
            }

            // Check for ALL CLEAR
            if (isGridEmpty(finalGrid, prev.boosters)) {
              // Trigger ALL CLEAR after a short delay
              setTimeout(() => handleAllClear(), 100);
              return {
                ...prev,
                grid: finalGrid,
                clearingTiles: []
              };
            }

            // Check if only boosters remain
            if (hasOnlyBoostersLeft(finalGrid, prev.boosters) && !prev.levelComplete) {
              setTimeout(() => handleOnlyBoostersLeft(), 100);
              return { ...prev, grid: finalGrid, clearingTiles: [] };
            }

            const lost = !prev.levelComplete && isGameOver(finalGrid, prev.hand);
            return {
              ...prev,
              grid: finalGrid,
              clearingTiles: [],
              gameOver: lost
            };
          });
        }, 400);

      } else {
        // No Match - Reset Combo
        const lost = isGameOver(newGrid, newHand);
        // Base score for placing pieces is piece size * 10
        const placementScore = piece.shape.length * 10;

        setGameState(prev => ({
          ...prev,
          grid: newGrid,
          score: score + placementScore,
          hand: newHand,
          selectedPieceIndex: null,
          gameOver: lost,
          combo: 1
        }));
      }
    } else {
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
    }
  };

  const isGhostCell = (x: number, y: number) => {
    if (gameState.selectedPieceIndex === null || !hoveredCell) return null;
    const piece = gameState.hand[gameState.selectedPieceIndex];
    if (!piece) return null;
    
    const ghostPointIndex = piece.shape.findIndex(p => hoveredCell.x + p.x === x && hoveredCell.y + p.y === y);
    if (ghostPointIndex !== -1) {
      const isValid = canPlacePiece(gameState.grid, piece, hoveredCell.x, hoveredCell.y);
      return { color: piece.colors[ghostPointIndex], isValid };
    }
    return null;
  };

  return (
    <div
      className="flex flex-col h-screen w-full max-w-md mx-auto p-4 select-none overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      style={{
        backgroundImage: `url(${UI_ASSETS.BACKGROUND})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <style>{`
        .board-grid {
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          grid-template-rows: repeat(8, minmax(0, 1fr));
        }
        .piece-preview-grid {
          display: grid;
        }
        .drag-preview {
          position: fixed;
          pointer-events: none;
          z-index: 1000;
          transform: translate(-50%, -50%);
          filter: drop-shadow(0 15px 25px rgba(0,0,0,0.5));
        }
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          10% { transform: translate(-1px, -2px) rotate(-1deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); }
          30% { transform: translate(3px, 2px) rotate(0deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 2px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(3px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(1px, 2px) rotate(0deg); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
        .shake-animation {
          animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: inherit; }
          50% { transform: scale(1.05); }
        }
        @keyframes fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-fade-out {
          animation: fade-out 0.3s ease-out forwards;
        }
        @keyframes bomb-glow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.3); }
        }
        @keyframes adProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes superballGlow {
          0%, 100% {
            filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.7)) drop-shadow(0 0 8px rgba(251, 191, 36, 0.4));
          }
          50% {
            filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.85)) drop-shadow(0 0 8px rgba(251, 191, 36, 0.55));
          }
        }
        @keyframes superballPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes piece-shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-4px, -2px) rotate(-3deg); }
          20% { transform: translate(4px, 2px) rotate(3deg); }
          30% { transform: translate(-4px, 2px) rotate(-2deg); }
          40% { transform: translate(4px, -2px) rotate(2deg); }
          50% { transform: translate(-3px, 3px) rotate(-3deg); }
          60% { transform: translate(3px, -3px) rotate(3deg); }
          70% { transform: translate(-2px, 2px) rotate(-2deg); }
          80% { transform: translate(2px, -2px) rotate(2deg); }
          90% { transform: translate(-1px, 1px) rotate(-1deg); }
        }
        .piece-trashing {
          animation: piece-shake 0.15s ease-in-out infinite;
          filter: saturate(1.5) brightness(1.2);
        }
      `}</style>

      {/* Effects Layer */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {particles.filter(p => p.life > 0).map(p => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: '4px',
              opacity: Math.max(0, p.life / p.maxLife),
              transform: `translate(-50%, -50%) rotate(${p.life * 10}deg)`,
              willChange: 'transform, opacity'
            }}
          />
        ))}
        {floatingTexts.map(t => (
          <div
            key={t.id}
            className="font-black text-2xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            style={{
              position: 'absolute',
              left: t.x,
              top: t.y,
              opacity: t.life / 20, // fade out faster at end
              transform: `translate(-50%, -50%) scale(${1 + (t.maxLife - t.life) * 0.01})`,
              zIndex: 2000
            }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Level & Score Card */}
      <div className="bg-slate-900 rounded-3xl p-4 mb-4 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600 opacity-50"></div>

        {/* Top row: Level, Score, Combo, Restart */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <div className={`text-xl font-black px-3 py-1 rounded-xl ${gameState.level <= 1 ? 'bg-blue-500/20 text-blue-400' : gameState.level === 2 ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/20 text-purple-400'}`}>
              Level {gameState.level}
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black text-white">{gameState.score}</span>
              <span className="text-[8px] text-slate-500 uppercase font-bold">Score</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <div className={`text-lg font-black transition-all ${gameState.combo > 1 ? 'text-yellow-400' : 'text-slate-700'}`}>
                x{gameState.combo}
              </div>
              <span className="text-[8px] uppercase font-bold text-slate-600">Combo</span>
            </div>
            <button
              onClick={handleRestart}
              className="bg-slate-800 hover:bg-slate-700 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 border border-slate-700"
            >
              <i className="fa-solid fa-rotate-right text-lg text-blue-400"></i>
            </button>
          </div>
        </div>

        {/* Objectives */}
        <div className="flex gap-2 justify-center">
          {gameState.objectives.map((obj, i) => {
            const progress = Math.min(100, (obj.current / obj.target) * 100);
            const isComplete = obj.current >= obj.target;
            return (
              <div key={i} className="flex-1 max-w-[100px]">
                <div className="flex items-center justify-between mb-1">
                  <div
                    className="w-4 h-4 rounded-md shadow-inner"
                    style={{ backgroundColor: obj.color }}
                  />
                  <span className={`text-xs font-bold ${isComplete ? 'text-green-400' : 'text-white'}`}>
                    {obj.current}/{obj.target}
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${isComplete ? 'bg-green-500' : ''}`}
                    style={{
                      width: `${progress}%`,
                      backgroundColor: isComplete ? undefined : obj.color
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Game Board Container */}
      <div
        ref={boardRef}
        className={`relative aspect-square p-4 shadow-2xl ${isShaking ? 'shake-animation' : ''}`}
        style={{
          aspectRatio: '1 / 1',
          width: '100%',
          maxWidth: '100%',
          flexShrink: 0,
          backgroundImage: `url(${UI_ASSETS.CONTAINER})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: shufflePhase ? 40 : undefined
        }}
      >
        <div className="board-grid w-full h-full gap-0.5">
          {gameState.grid.map((row, y) =>
            row.map((cell, x) => {
              const ghost = isGhostCell(x, y);
              const booster = gameState.boosters.find(b => b.x === x && b.y === y);
              const isAffected = affectedCells.has(`${x},${y}`);

              // Determine if we should use an image
              const cellColor = cell?.color;
              const ghostColor = ghost?.color;
              const cellHasImage = cellColor && isIconPath(cellColor);
              const ghostHasImage = ghostColor && isIconPath(ghostColor);

              // Calculate background
              let bgColor = 'transparent'; // empty cell
              let bgImage = `url(${UI_ASSETS.SLOT})`; // empty cells show slot
              let cellOpacity = 0.5; // default for empty slots

              if (booster) {
                bgColor = 'transparent';
                bgImage = 'none';
                cellOpacity = 1;
              } else if (cell) {
                if (cellHasImage) {
                  bgColor = 'transparent';
                  bgImage = `url(${cellColor})`;
                } else {
                  bgColor = cellColor;
                  bgImage = 'none';
                }
                // Hide cells only during scrambling phase (flying tiles visible)
                cellOpacity = shufflePhase === 'scrambling' ? 0 : 1;
              } else if (ghost) {
                if (ghostHasImage) {
                  bgColor = 'transparent';
                  bgImage = `url(${ghostColor})`;
                } else {
                  bgColor = ghostColor;
                  bgImage = 'none';
                }
                cellOpacity = ghost.isValid ? 0.7 : 0.15;
              }

              // Shuffle animation transforms
              const getShuffleTransform = () => {
                if (!cell) return '';
                if (shufflePhase === 'levitating') return 'scale(1.1) translateY(-4px)';
                // During scrambling, cells are hidden (flying tiles shown instead)
                if (shufflePhase === 'scrambling') return 'scale(1)';
                if (shufflePhase === 'landing') return 'scale(1) translateY(0)';
                return '';
              };

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => booster && !shufflePhase && activateBooster(booster)}
                  className={`
                    relative
                    ${booster && !shufflePhase ? 'cursor-pointer active:scale-95' : ''}
                    ${shufflePhase === 'levitating' && cell ? 'z-20 shadow-lg' : ''}
                  `}
                  style={{
                    backgroundColor: bgColor,
                    backgroundImage: bgImage,
                    backgroundSize: '100% 100%',
                    transition: shufflePhase ? 'transform 0.3s, box-shadow 0.3s' : 'all 0.2s',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    opacity: cellOpacity,
                    transform: gameState.clearingTiles.includes(cell?.id || '')
                      ? 'scale(0) rotate(90deg)'
                      : shufflePhase && cell
                      ? getShuffleTransform()
                      : (ghost && ghost.isValid ? 'scale(0.95)' : 'scale(1)'),
                    boxShadow: cell
                      ? (shufflePhase === 'levitating'
                        ? '0 8px 20px rgba(0,0,0,0.5)'
                        : '0 4px 8px rgba(0,0,0,0.3)')
                      : undefined
                  }}
                >
                  {/* Affected area indicator - shows during booster activation with fade */}
                  {isAffected && !booster && (
                    <div
                      className="absolute inset-0 pointer-events-none z-10 animate-fade-out"
                      style={{
                        backgroundColor: affectedColor
                      }}
                    />
                  )}
                  {/* Locked tile overlay - frozen appearance */}
                  {cell?.locked && !booster && (
                    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center bg-slate-900/60">
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-slate-300/80" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      {/* Ice/frost pattern overlay */}
                      <div className="absolute inset-0 opacity-30" style={{
                        background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(148, 163, 184, 0.3) 2px, rgba(148, 163, 184, 0.3) 4px)'
                      }} />
                    </div>
                  )}
                  {booster && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={booster.type === 'color_ball' ? {} : { animation: 'pulse 1s ease-in-out infinite' }}
                    >
                      {booster.type === 'color_ball' ? (
                        <img
                          src={UI_ASSETS.SUPERBALL}
                          alt="Superball"
                          className="w-[85%] h-[85%] object-contain"
                          style={{
                            filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.8)) drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))',
                            animation: 'superballGlow 2s ease-in-out infinite, superballPulse 2s ease-in-out infinite'
                          }}
                        />
                      ) : (
                        <div
                          className="w-[85%] h-[85%] rounded-xl flex items-center justify-center"
                          style={{
                            background: booster.type === 'bomb'
                              ? 'linear-gradient(135deg, #ef4444, #f97316)'
                              : booster.type === 'line_bomb'
                              ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                              : booster.type === 'rocket_h'
                              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                              : booster.type === 'rocket_v'
                              ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                              : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.3)'
                          }}
                        >
                          <span
                            className="text-2xl drop-shadow-lg"
                            style={{
                              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                              transform: booster.type === 'rocket_h' ? 'rotate(45deg)' : booster.type === 'rocket_v' ? 'rotate(-45deg)' : 'none'
                            }}
                          >
                            {booster.type === 'bomb' ? '💥' : booster.type === 'line_bomb' ? '💣' : (booster.type === 'rocket_h' || booster.type === 'rocket_v') ? '🚀' : '💣'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {ghost && !ghost.isValid && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full opacity-60"></div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Flying tiles during shuffle */}
        {shuffleAnimations.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-40">
            {shuffleAnimations.map((anim, i) => {
              // Cap movement progress at 1 (tiles stay at destination)
              const moveProgress = Math.min(anim.progress, 1);

              // Interpolate position with an arc using actual pixel positions
              const dx = anim.toPx.x - anim.fromPx.x;
              const dy = anim.toPx.y - anim.fromPx.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // Add arc height based on distance (more distance = higher arc)
              const arcHeight = Math.min(distance * 0.3, 80);
              const arcOffset = Math.sin(moveProgress * Math.PI) * arcHeight;

              const currentX = anim.fromPx.x + dx * moveProgress;
              const currentY = anim.fromPx.y + dy * moveProgress - arcOffset;

              const boxShadowStyle = moveProgress < 0.7
                ? '0 6px 20px rgba(0,0,0,0.4)'
                : `0 ${6 - 2 * ((moveProgress - 0.7) / 0.3)}px ${20 - 12 * ((moveProgress - 0.7) / 0.3)}px rgba(0,0,0,${0.4 - 0.1 * ((moveProgress - 0.7) / 0.3)})`;

              // Render booster differently
              if ((anim as any).isBooster) {
                const boosterType = (anim as any).boosterType;
                return (
                  <div
                    key={`fly-booster-${anim.tile.id}-${i}`}
                    className="absolute flex items-center justify-center"
                    style={{
                      width: anim.cellSize,
                      height: anim.cellSize,
                      left: currentX,
                      top: currentY,
                      boxShadow: boxShadowStyle,
                      zIndex: 40
                    }}
                  >
                    {boosterType === 'color_ball' ? (
                      <img
                        src={UI_ASSETS.SUPERBALL}
                        alt="Superball"
                        className="w-[85%] h-[85%] object-contain"
                        style={{
                          filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.8)) drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))'
                        }}
                      />
                    ) : (
                      <div
                        className="w-[85%] h-[85%] rounded-xl flex items-center justify-center"
                        style={{
                          background: boosterType === 'bomb'
                            ? 'linear-gradient(135deg, #ef4444, #f97316)'
                            : boosterType === 'line_bomb'
                            ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                            : boosterType === 'rocket_h'
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : boosterType === 'rocket_v'
                            ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.3)'
                        }}
                      >
                        <span
                          className="text-2xl drop-shadow-lg"
                          style={{
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                            transform: boosterType === 'rocket_h' ? 'rotate(45deg)' : boosterType === 'rocket_v' ? 'rotate(-45deg)' : 'none'
                          }}
                        >
                          {boosterType === 'bomb' ? '💥' : boosterType === 'line_bomb' ? '💣' : (boosterType === 'rocket_h' || boosterType === 'rocket_v') ? '🚀' : '💣'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }

              // Render regular tile
              return (
                <div
                  key={`fly-${anim.tile.id}-${i}`}
                  className="absolute"
                  style={{
                    width: anim.cellSize,
                    height: anim.cellSize,
                    left: currentX,
                    top: currentY,
                    backgroundImage: isIconPath(anim.tile.color) ? `url(${anim.tile.color})` : 'none',
                    backgroundColor: isIconPath(anim.tile.color) ? 'transparent' : anim.tile.color,
                    backgroundSize: '100% 100%',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    boxShadow: boxShadowStyle,
                    zIndex: 40
                  }}
                />
              );
            })}
          </div>
        )}

        {/* ALL CLEAR Screen */}
        {showAllClear && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-8 text-center z-50">
            <div className="text-7xl mb-4 animate-bounce">✨</div>
            <h2
              className="text-4xl font-black mb-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent"
              style={{
                animation: 'pulse 0.5s ease-in-out infinite',
                textShadow: '0 0 30px rgba(251, 191, 36, 0.5)'
              }}
            >
              ALL CLEAR!!!
            </h2>
            <p className="text-yellow-300 text-lg font-bold mb-2">+500 BONUS</p>
            <p className="text-slate-400 text-sm font-medium">Generating new blocks...</p>
          </div>
        )}

        {/* Level Complete Screen */}
        {showLevelPopup && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center z-50">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-black mb-1 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
              LEVEL {gameState.level} COMPLETE!
            </h2>
            <p className="text-slate-400 text-sm mb-6 font-medium">All objectives cleared!</p>
            <div className="bg-slate-900 rounded-2xl p-4 w-full mb-6 border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block mb-2">Score</span>
              <span className="text-4xl font-black text-white">{gameState.score}</span>
            </div>
            <button
              onClick={handleNextLevel}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 px-12 rounded-2xl transition-all active:scale-95 shadow-lg"
            >
              NEXT LEVEL →
            </button>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState.gameOver && !gameState.levelComplete && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center z-50">
            <h2 className="text-4xl font-black mb-1 text-white">GAME OVER</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium">No valid moves left!</p>
            <div className="bg-slate-900 rounded-2xl p-6 w-full mb-8 border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block mb-2">Final Score</span>
              <span className="text-5xl font-black text-white">{gameState.score}</span>
            </div>
            <button
              onClick={handleRestart}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black py-4 px-12 rounded-2xl transition-all active:scale-95"
            >
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>


      {/* Drag Preview */}
      {dragPosition && gameState.selectedPieceIndex !== null && (
        <div
          className="drag-preview"
          style={{
            left: dragPosition.x,
            top: dragPosition.y - DRAG_OFFSET_Y
          }}
        >
          <PiecePreview piece={gameState.hand[gameState.selectedPieceIndex]!} active={true} cellSize={dragCellSize} velocity={dragVelocity} />
        </div>
      )}

      {/* Returning Piece Animation */}
      {returningPiece && (() => {
        // Ease out cubic for smooth deceleration
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        const t = easeOut(returningPiece.progress);

        // Interpolate position
        const currentX = returningPiece.fromX + (returningPiece.toX - returningPiece.fromX) * t;
        const currentY = returningPiece.fromY + (returningPiece.toY - returningPiece.fromY) * t;

        // Calculate velocity for squash and stretch
        const dx = returningPiece.toX - returningPiece.fromX;
        const dy = returningPiece.toY - returningPiece.fromY;
        const speed = Math.sqrt(dx * dx + dy * dy);
        const velocityFactor = Math.min(speed / 100, 3) * (1 - t); // Decreases as we approach target

        // Squash and stretch based on direction
        const angle = Math.atan2(dy, dx);
        const stretchX = 1 + velocityFactor * 0.15 * Math.abs(Math.cos(angle));
        const stretchY = 1 + velocityFactor * 0.15 * Math.abs(Math.sin(angle));
        const squashX = 1 / stretchY;
        const squashY = 1 / stretchX;

        // Scale down as it approaches the box
        const scale = 1 - t * 0.5;

        return (
          <div
            className="fixed pointer-events-none z-[200]"
            style={{
              left: currentX,
              top: currentY,
              transform: `translate(-50%, -50%) scaleX(${stretchX * squashX * scale}) scaleY(${stretchY * squashY * scale})`
            }}
          >
            <PiecePreview piece={returningPiece.piece} active={true} cellSize={dragCellSize} />
          </div>
        );
      })()}

      {/* Piece Selection Rack */}
      <div className="mt-4">
        <div
          className="flex justify-center items-center px-6"
          style={{
            backgroundImage: `url(${UI_ASSETS.CONTAINER_NEXT_MAIN})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            height: '140px'
          }}
        >
          {/* Pieces Container */}
          <div className="flex justify-around items-center gap-1 w-full">
            {gameState.hand.map((piece, index) => (
              <div
                key={piece?.id || `empty-${index}`}
                ref={el => pieceRefs.current[index] = el}
                onClick={() => trashSelectMode && piece && handleTrashSelect(index)}
                className={`
                  flex items-center justify-center
                  relative transition-all duration-300
                  ${piece === null && fadingBoxIndex?.index !== index ? 'opacity-0 pointer-events-none' : ''}
                  ${fadingBoxIndex?.index === index && fadingBoxIndex.fading ? 'opacity-0' : ''}
                  ${fadingInPieces ? 'opacity-0' : ''}
                  ${trashingPieceIndex === index ? 'piece-trashing' : ''}
                  ${trashSelectMode && piece ? 'cursor-pointer z-50 hover:scale-110 hover:brightness-125' : ''}
                  ${trashSelectMode && !piece ? 'opacity-30' : ''}
                `}
                style={{
                  backgroundImage: `url(${UI_ASSETS.CONTAINER_NEXT_PIECE})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  width: '115px',
                  height: '115px'
                }}
              >
                {/* Piece (draggable area) */}
                <div
                  onPointerDown={(e) => !trashSelectMode && startDragging(e, index)}
                  className={`flex items-center justify-center p-1 w-full h-full ${trashSelectMode ? '' : 'touch-none cursor-grab'}`}
                  style={{ transform: 'scale(0.95)' }}
                >
                  {piece && gameState.selectedPieceIndex !== index && returningPiece?.index !== index && (
                    <PiecePreview piece={piece} active={false} containerSize={95} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Powerup Buttons */}
        <div className="flex justify-center gap-6 mt-4">
          {/* Shuffle Button */}
          <button
            onClick={() => shuffleUses > 0 && !shufflePhase && !trashSelectMode && activateShuffle()}
            disabled={shuffleUses <= 0 || !!shufflePhase || trashSelectMode}
            className={`
              w-16 h-16 rounded-full flex items-center justify-center relative
              transition-all duration-200 active:scale-95
              ${shuffleUses > 0 && !shufflePhase ? 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30' : 'bg-slate-700 opacity-50'}
            `}
          >
            <i className="fa-solid fa-shuffle text-2xl text-white"></i>
            {shuffleUses > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] font-bold text-black">
                {shuffleUses}
              </div>
            )}
          </button>

          {/* Trash Button */}
          <button
            onClick={() => trashUses > 0 && !shufflePhase && !trashSelectMode && setTrashSelectMode(true)}
            disabled={trashUses <= 0 || !!shufflePhase || trashSelectMode}
            className={`
              w-16 h-16 rounded-full flex items-center justify-center relative
              transition-all duration-200 active:scale-95
              ${trashUses > 0 && !trashSelectMode ? 'bg-gradient-to-br from-red-500 to-orange-600 shadow-lg shadow-red-500/30' : 'bg-slate-700 opacity-50'}
            `}
          >
            <i className="fa-solid fa-trash text-2xl text-white"></i>
            {trashUses > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] font-bold text-black">
                {trashUses}
              </div>
            )}
          </button>
        </div>

        {/* Trash Select Overlay */}
        {trashSelectMode && (
          <div
            className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center"
            onClick={() => setTrashSelectMode(false)}
          >
            <div className="text-center text-white pointer-events-none">
              <p className="text-xl font-bold mb-2">Select a piece to discard</p>
              <p className="text-sm text-slate-400">Tap a piece box or anywhere to cancel</p>
            </div>
          </div>
        )}

        {/* Shuffle Overlay */}
        {shufflePhase && (
          <div className="fixed inset-0 bg-black/50 z-30 pointer-events-none" />
        )}
      </div>

      {/* Ad Popup Modal */}
      {showAdPopup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-slate-900 rounded-3xl p-6 mx-4 max-w-sm w-full border border-slate-700 shadow-2xl">
            {watchingAd ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4 animate-pulse">📺</div>
                <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full"
                    style={{ animation: 'adProgress 1.5s linear forwards' }}></div>
                </div>
                <p className="text-slate-400 text-sm font-medium">Playing ad...</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-5xl mb-4">🗑️</div>
                <h3 className="text-xl font-black text-white mb-2">Discard Piece?</h3>
                <p className="text-slate-400 text-sm mb-6">
                  You've used your free discard for this level.
                  Watch a short ad to use it again!
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleWatchAd}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500
                      text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-play"></i>
                    Watch Ad
                  </button>
                  <button
                    onClick={handleCancelAd}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold py-3 rounded-2xl transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PiecePreview: React.FC<{ piece: PieceData, active: boolean, cellSize?: number, containerSize?: number, velocity?: { x: number, y: number } }> = ({ piece, active, cellSize, containerSize, velocity }) => {
  const minX = Math.min(...piece.shape.map(p => p.x));
  const maxX = Math.max(...piece.shape.map(p => p.x));
  const minY = Math.min(...piece.shape.map(p => p.y));
  const maxY = Math.max(...piece.shape.map(p => p.y));

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  // Center of the piece for jelly effect calculation
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Calculate optimal cell size based on piece dimensions and container
  let finalCellSize: number;
  const maxCellSize = 28; // Limit max size (between 2x2 and 3x3 feel)
  if (cellSize !== undefined) {
    // Explicit cell size (used for drag preview to match board)
    finalCellSize = cellSize;
  } else if (containerSize !== undefined) {
    // Fit piece to container - use the larger dimension to constrain
    const maxDimension = Math.max(width, height);
    const gap = 2; // gap-0.5 = 2px
    const totalGaps = (maxDimension - 1) * gap;
    finalCellSize = Math.min(maxCellSize, Math.floor((containerSize - totalGaps) / maxDimension));
  } else {
    // Default fallback
    finalCellSize = 20;
  }

  // Squash & stretch for the whole piece based on velocity
  let containerTransform = '';
  if (velocity) {
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    const stretchAmount = Math.min(speed * 0.015, 0.25); // Cap the stretch

    if (speed > 1) {
      const vxNorm = velocity.x / speed;
      const vyNorm = velocity.y / speed;
      // Stretch along velocity, squash perpendicular
      const scaleX = 1 + stretchAmount * Math.abs(vxNorm) - stretchAmount * 0.5 * Math.abs(vyNorm);
      const scaleY = 1 + stretchAmount * Math.abs(vyNorm) - stretchAmount * 0.5 * Math.abs(vxNorm);
      containerTransform = `scale(${scaleX}, ${scaleY})`;
    }
  }

  return (
    <div
      className="piece-preview-grid gap-0.5"
      style={{
        gridTemplateColumns: `repeat(${width}, 1fr)`,
        gridTemplateRows: `repeat(${height}, 1fr)`,
        width: 'auto',
        maxHeight: '100%',
        maxWidth: '100%',
        transform: containerTransform,
        transition: 'transform 0.08s ease-out'
      }}
    >
      {Array.from({ length: width * height }).map((_, i) => {
        const x = minX + (i % width);
        const y = minY + Math.floor(i / width);
        const indexInShape = piece.shape.findIndex(p => p.x === x && p.y === y);
        const inShape = indexInShape !== -1;

        const color = inShape ? piece.colors[indexInShape] : undefined;
        const hasImage = color && isIconPath(color);

        // Jelly effect: cells behind in movement direction lag, cells ahead lead
        let jellyTransform = '';
        if (velocity && inShape) {
          const relX = x - centerX;
          const relY = y - centerY;
          // Project cell position onto velocity direction
          // Cells "behind" (negative projection) lag, cells "ahead" (positive) lead
          const factor = 0; // Disabled for testing squash & stretch
          // Moving right (vx>0): right cells (relX>0) go ahead, left cells (relX<0) lag
          const offsetX = relX * velocity.x * factor;
          const offsetY = relY * velocity.y * factor;
          jellyTransform = `translate(${offsetX}px, ${offsetY}px)`;
        }

        return (
          <div
            key={i}
            style={{
              width: `${finalCellSize}px`,
              height: `${finalCellSize}px`,
              backgroundColor: hasImage ? 'transparent' : (inShape ? color : 'transparent'),
              backgroundImage: hasImage ? `url(${color})` : 'none',
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              transform: jellyTransform,
              transition: 'transform 0.1s ease-out'
            }}
          />
        );
      })}
    </div>
  );
};

export default App;
