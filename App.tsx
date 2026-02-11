
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Color, GameState, PieceData, Point, TileData } from './types';
import { createRandomGrid, generatePiece, canPlacePiece, findMatchGroups, isGameOver, calculateScore } from './utils/gameLogic';
import { COLORS, GRID_SIZE, OBJECTIVE_TARGET } from './constants';

const DRAG_OFFSET_Y = 100; // How much the piece is lifted above the finger/cursor

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

interface AlignMoveSprite {
  id: string;
  color: Color;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  size: number;
}

const getObjectiveColorCount = (level: number): number => {
  if (level <= 2) return 2;
  if (level <= 4) return 3;
  return 4;
};

const getLevelObjectiveColors = (level: number): Color[] => {
  const shuffled = [...COLORS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, getObjectiveColorCount(level));
};

const createClearedTracker = (objectiveColors: Color[]): Partial<Record<Color, number>> => {
  const tracker: Partial<Record<Color, number>> = {};
  objectiveColors.forEach(color => {
    tracker[color] = 0;
  });
  return tracker;
};

const getInitialMovesForLevel = (level: number, objectiveTarget: number): number => {
  const objectiveColorCount = getObjectiveColorCount(level);
  const baseByColorCount = objectiveColorCount === 2
    ? Math.round(objectiveTarget * 1.4)
    : objectiveColorCount === 3
      ? Math.round(objectiveTarget * 1.95)
      : Math.round(objectiveTarget * 2.5);
  const levelPenalty = Math.floor((level - 1) / 3);
  return Math.max(28, baseByColorCount - levelPenalty);
};

const createLevelState = (level: number, score: number, highScore: number): GameState => {
  const objectiveColors = getLevelObjectiveColors(level);
  const moves = getInitialMovesForLevel(level, OBJECTIVE_TARGET);
  return {
    grid: createRandomGrid(0.3, objectiveColors),
    score,
    highScore,
    hand: [generatePiece(objectiveColors), generatePiece(objectiveColors), generatePiece(objectiveColors)],
    level,
    objectiveColors,
    clearedByColor: createClearedTracker(objectiveColors),
    objectiveTarget: OBJECTIVE_TARGET,
    movesLeft: moves,
    movesTotal: moves,
    levelComplete: false,
    gameOver: false,
    selectedPieceIndex: null,
    clearingTiles: [],
    combo: 1
  };
};

const getSpecialFromComboSize = (size: number): TileData['special'] | null => {
  if (size >= 7) return 'rainbow';
  if (size === 6) return 'paint';
  if (size === 5) return 'bomb';
  return null;
};

const getClosestPointToCenter = (points: Point[]): Point => {
  const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.reduce((closest, current) => {
    const closestDistance = (closest.x - centerX) ** 2 + (closest.y - centerY) ** 2;
    const currentDistance = (current.x - centerX) ** 2 + (current.y - centerY) ** 2;
    return currentDistance < closestDistance ? current : closest;
  });
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => {
    const highScore = Number(localStorage.getItem('highScore')) || 0;
    return createLevelState(1, 0, highScore);
  });

  const [hoveredCell, setHoveredCell] = useState<Point | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number } | null>(null);
  
  // Effects State
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [alignBoosterArmed, setAlignBoosterArmed] = useState(false);
  const [sameColorActive, setSameColorActive] = useState(false);
  const [sameColorForcedColor, setSameColorForcedColor] = useState<Color | null>(null);
  const [sameColorEndsAt, setSameColorEndsAt] = useState<number | null>(null);
  const [sameColorRemainingMs, setSameColorRemainingMs] = useState(0);
  const [alignAnimating, setAlignAnimating] = useState(false);
  const [alignMoveSprites, setAlignMoveSprites] = useState<AlignMoveSprite[]>([]);
  const [alignAnimationStarted, setAlignAnimationStarted] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const alignSwipeStartRef = useRef<Point | null>(null);
  const sameColorTimerRef = useRef<number | null>(null);
  const sameColorRafRef = useRef<number | null>(null);

  // Animation Loop
  useEffect(() => {
    let animationFrameId: number;
    const updateEffects = () => {
      setParticles(prev => {
        if (prev.length === 0) return prev;
        return prev.filter(p => p.life > 0).map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.5, // Gravity
          life: p.life - 1
        }));
      });
      
      setFloatingTexts(prev => {
        if (prev.length === 0) return prev;
        return prev.filter(t => t.life > 0).map(t => ({
          ...t,
          y: t.y - 1.5, // Float up
          life: t.life - 1
        }));
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

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  };

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      newParticles.push({
        id: Date.now() + Math.random(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // Slight upward bias
        color,
        life: 40 + Math.random() * 20,
        maxLife: 60,
        size: Math.random() * 6 + 4
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  const spawnFloatingText = (x: number, y: number, text: string) => {
    setFloatingTexts(prev => [...prev, {
      id: Date.now() + Math.random(),
      x,
      y,
      text,
      life: 60,
      maxLife: 60,
      scale: 1,
      color: '#fff'
    }]);
  };

  useEffect(() => {
    return () => {
      if (sameColorTimerRef.current !== null) {
        window.clearTimeout(sameColorTimerRef.current);
      }
      if (sameColorRafRef.current !== null) {
        window.cancelAnimationFrame(sameColorRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!sameColorActive || sameColorEndsAt === null) {
      setSameColorRemainingMs(0);
      if (sameColorRafRef.current !== null) {
        window.cancelAnimationFrame(sameColorRafRef.current);
        sameColorRafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, sameColorEndsAt - Date.now());
      setSameColorRemainingMs(remaining);
      if (remaining > 0) {
        sameColorRafRef.current = window.requestAnimationFrame(tick);
      } else {
        sameColorRafRef.current = null;
      }
    };

    sameColorRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (sameColorRafRef.current !== null) {
        window.cancelAnimationFrame(sameColorRafRef.current);
        sameColorRafRef.current = null;
      }
    };
  }, [sameColorActive, sameColorEndsAt]);

  const resolveBoardAfterAction = (
    newGrid: (typeof gameState.grid),
    newHand: (typeof gameState.hand),
    baseScore: number,
    baseCombo: number,
    noMatchScore: number,
    resetComboOnNoMatch: boolean,
    moveCost: number
  ) => {
    const matchGroups = findMatchGroups(newGrid);
    const { objectiveColors } = gameState;

    if (matchGroups.length > 0) {
      const specialSpawns: Array<{ x: number; y: number; special: NonNullable<TileData['special']>; color: Color }> = [];
      matchGroups.forEach(group => {
        const specialType = getSpecialFromComboSize(group.length);
        if (!specialType) return;
        const spawnPoint = getClosestPointToCenter(group);
        const sourceTile = newGrid[spawnPoint.y][spawnPoint.x];
        if (!sourceTile) return;
        specialSpawns.push({
          x: spawnPoint.x,
          y: spawnPoint.y,
          special: specialType,
          color: sourceTile.color
        });
      });

      const allClearedPoints = matchGroups.flat();
      const totalCleared = allClearedPoints.length;
      const newCombo = baseCombo + 1;
      const { score: moveScore, text, multiplier } = calculateScore(totalCleared, newCombo);
      const newScore = baseScore + moveScore;
      const matchingIds = allClearedPoints.map(p => newGrid[p.y][p.x]!.id);
      const moveClearedByColor: Partial<Record<Color, number>> = {};
      allClearedPoints.forEach(p => {
        const color = newGrid[p.y][p.x]!.color;
        if (objectiveColors.includes(color)) {
          moveClearedByColor[color] = (moveClearedByColor[color] || 0) + 1;
        }
      });

      if (boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const cellSize = rect.width / GRID_SIZE;
        allClearedPoints.forEach(p => {
          const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
          const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
          const color = newGrid[p.y][p.x]!.color;
          spawnParticles(cellCenterX, cellCenterY, color, 6);
        });
        if (text) {
          const avgX = allClearedPoints.reduce((acc, p) => acc + p.x, 0) / totalCleared;
          const avgY = allClearedPoints.reduce((acc, p) => acc + p.y, 0) / totalCleared;
          const screenX = rect.left + (avgX * cellSize) + (cellSize / 2);
          const screenY = rect.top + (avgY * cellSize) + (cellSize / 2);
          spawnFloatingText(screenX, screenY, `${text} x${multiplier}`);
        }
      }

      triggerShake();

      setGameState(prev => ({
        ...prev,
        grid: newGrid,
        score: newScore,
        hand: newHand,
        selectedPieceIndex: null,
        clearingTiles: matchingIds,
        combo: newCombo,
        movesLeft: Math.max(0, prev.movesLeft - moveCost)
      }));

      window.setTimeout(() => {
        setGameState(prev => {
          const finalGrid = prev.grid.map(row =>
            row.map(cell => cell && matchingIds.includes(cell.id) ? null : cell)
          );
          specialSpawns.forEach(spawn => {
            finalGrid[spawn.y][spawn.x] = {
              id: `special-${Date.now()}-${Math.random()}`,
              color: spawn.color,
              special: spawn.special
            };
          });
          const updatedClearedByColor = { ...prev.clearedByColor };
          prev.objectiveColors.forEach(color => {
            updatedClearedByColor[color] = Math.min(
              prev.objectiveTarget,
              (updatedClearedByColor[color] || 0) + (moveClearedByColor[color] || 0)
            );
          });
          const levelComplete = prev.objectiveColors.every(
            color => (updatedClearedByColor[color] || 0) >= prev.objectiveTarget
          );
          const lost = !levelComplete && (prev.movesLeft <= 0 || isGameOver(finalGrid, prev.hand));
          return {
            ...prev,
            grid: finalGrid,
            clearedByColor: updatedClearedByColor,
            levelComplete,
            clearingTiles: [],
            gameOver: lost
          };
        });
      }, 400);
      return;
    }

    setGameState(prev => {
      const levelComplete = prev.objectiveColors.every(
        color => (prev.clearedByColor[color] || 0) >= prev.objectiveTarget
      );
      const nextMoves = Math.max(0, prev.movesLeft - moveCost);
      const lost = !levelComplete && (nextMoves <= 0 || isGameOver(newGrid, newHand));
      return {
        ...prev,
        grid: newGrid,
        score: baseScore + noMatchScore,
        hand: newHand,
        selectedPieceIndex: null,
        combo: resetComboOnNoMatch ? 1 : prev.combo,
        levelComplete,
        gameOver: lost,
        movesLeft: nextMoves
      };
    });
  };

  const activateSpecialAt = (x: number, y: number) => {
    if (
      alignAnimating ||
      alignBoosterArmed ||
      gameState.selectedPieceIndex !== null ||
      gameState.gameOver ||
      gameState.levelComplete ||
      gameState.clearingTiles.length > 0
    ) {
      return;
    }

    const tile = gameState.grid[y][x];
    if (!tile?.special) return;

    const updatedGrid = gameState.grid.map(row => [...row]);
    const clearedTiles: Array<{ tile: TileData; point: Point }> = [];
    const clearCell = (cx: number, cy: number) => {
      if (cx < 0 || cx >= GRID_SIZE || cy < 0 || cy >= GRID_SIZE) return;
      const current = updatedGrid[cy][cx];
      if (!current) return;
      clearedTiles.push({ tile: current, point: { x: cx, y: cy } });
      updatedGrid[cy][cx] = null;
    };

    if (tile.special === 'bomb') {
      clearCell(x, y);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          clearCell(x + ox, y + oy);
        }
      }
    }

    if (tile.special === 'paint') {
      clearCell(x, y);
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const tx = x + ox;
          const ty = y + oy;
          if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) continue;
          const current = updatedGrid[ty][tx];
          if (!current) continue;
          updatedGrid[ty][tx] = { ...current, color: tile.color };
        }
      }
    }

    if (tile.special === 'rainbow') {
      const availableColors = updatedGrid
        .flat()
        .filter((c): c is TileData => c !== null)
        .map(c => c.color);
      clearCell(x, y);
      if (availableColors.length > 0) {
        const targetColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        for (let row = 0; row < GRID_SIZE; row++) {
          for (let col = 0; col < GRID_SIZE; col++) {
            const current = updatedGrid[row][col];
            if (current && current.color === targetColor) {
              clearCell(col, row);
            }
          }
        }
      }
    }

    if (clearedTiles.length > 0 && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / GRID_SIZE;
      clearedTiles.forEach(({ tile: cleared, point }) => {
        const cellCenterX = rect.left + (point.x * cellSize) + (cellSize / 2);
        const cellCenterY = rect.top + (point.y * cellSize) + (cellSize / 2);
        spawnParticles(cellCenterX, cellCenterY, cleared.color, 5);
      });
    }

    const directClearedByColor: Partial<Record<Color, number>> = {};
    clearedTiles.forEach(({ tile: cleared }) => {
      if (gameState.objectiveColors.includes(cleared.color)) {
        directClearedByColor[cleared.color] = (directClearedByColor[cleared.color] || 0) + 1;
      }
    });

    const directScore = clearedTiles.length * 10;
    setGameState(prev => {
      const updatedClearedByColor = { ...prev.clearedByColor };
      prev.objectiveColors.forEach(color => {
        updatedClearedByColor[color] = Math.min(
          prev.objectiveTarget,
          (updatedClearedByColor[color] || 0) + (directClearedByColor[color] || 0)
        );
      });
      return {
        ...prev,
        grid: updatedGrid,
        score: prev.score + directScore,
        clearedByColor: updatedClearedByColor
      };
    });

    resolveBoardAfterAction(updatedGrid, [...gameState.hand], gameState.score + directScore, gameState.combo, 0, false, 0);
  };

  const shiftTiles = (direction: 'left' | 'right' | 'up' | 'down', grid: (typeof gameState.grid)) => {
    const shifted: (typeof gameState.grid) = Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => null)
    );

    if (direction === 'left' || direction === 'right') {
      for (let y = 0; y < GRID_SIZE; y++) {
        const tiles = grid[y].filter(Boolean) as NonNullable<(typeof grid)[number][number]>[];
        if (direction === 'left') {
          tiles.forEach((tile, idx) => {
            shifted[y][idx] = tile;
          });
        } else {
          tiles.forEach((tile, idx) => {
            shifted[y][GRID_SIZE - tiles.length + idx] = tile;
          });
        }
      }
    } else {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tiles: NonNullable<(typeof grid)[number][number]>[] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
          const tile = grid[y][x];
          if (tile) tiles.push(tile);
        }
        if (direction === 'up') {
          tiles.forEach((tile, idx) => {
            shifted[idx][x] = tile;
          });
        } else {
          tiles.forEach((tile, idx) => {
            shifted[GRID_SIZE - tiles.length + idx][x] = tile;
          });
        }
      }
    }

    return shifted;
  };

  const buildAlignMoveSprites = (shiftedGrid: (typeof gameState.grid)): AlignMoveSprite[] => {
    if (!boardRef.current) return [];
    const boardRect = boardRef.current.getBoundingClientRect();
    const nextPositions = new Map<string, { x: number; y: number }>();
    const sprites: AlignMoveSprite[] = [];

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = shiftedGrid[y][x];
        if (tile) {
          nextPositions.set(tile.id, { x, y });
        }
      }
    }

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = gameState.grid[y][x];
        if (!tile) continue;
        const next = nextPositions.get(tile.id);
        if (!next) continue;
        if (next.x === x && next.y === y) continue;

        const fromCell = boardRef.current.querySelector(`[data-cell="${x}-${y}"]`) as HTMLDivElement | null;
        const toCell = boardRef.current.querySelector(`[data-cell="${next.x}-${next.y}"]`) as HTMLDivElement | null;
        if (!fromCell || !toCell) continue;

        const fromRect = fromCell.getBoundingClientRect();
        const toRect = toCell.getBoundingClientRect();
        sprites.push({
          id: tile.id,
          color: tile.color,
          fromLeft: fromRect.left - boardRect.left,
          fromTop: fromRect.top - boardRect.top,
          toLeft: toRect.left - boardRect.left,
          toTop: toRect.top - boardRect.top,
          size: fromRect.width
        });
      }
    }

    return sprites;
  };

  const applyAlignBooster = (direction: 'left' | 'right' | 'up' | 'down') => {
    if (!alignBoosterArmed || alignAnimating || gameState.gameOver || gameState.levelComplete) return;
    const shiftedGrid = shiftTiles(direction, gameState.grid);
    const sprites = buildAlignMoveSprites(shiftedGrid);
    setAlignBoosterArmed(false);
    if (sprites.length === 0) {
      resolveBoardAfterAction(shiftedGrid, [...gameState.hand], gameState.score, gameState.combo, 0, false, 0);
      return;
    }

    setAlignAnimating(true);
    setAlignMoveSprites(sprites);
    setAlignAnimationStarted(false);
    window.requestAnimationFrame(() => {
      setAlignAnimationStarted(true);
    });

    window.setTimeout(() => {
      setAlignAnimating(false);
      setAlignMoveSprites([]);
      setAlignAnimationStarted(false);
      resolveBoardAfterAction(shiftedGrid, [...gameState.hand], gameState.score, gameState.combo, 0, false, 0);
    }, 240);
  };

  const activateSameColorBooster = () => {
    if (alignAnimating || gameState.gameOver || gameState.levelComplete || sameColorActive) return;
    const forcedColor = gameState.objectiveColors[Math.floor(Math.random() * gameState.objectiveColors.length)];
    const endsAt = Date.now() + 5000;
    setAlignBoosterArmed(false);
    setSameColorActive(true);
    setSameColorForcedColor(forcedColor);
    setSameColorEndsAt(endsAt);
    setSameColorRemainingMs(5000);
    setGameState(prev => ({
      ...prev,
      grid: prev.grid.map(row => row.map(cell => cell ? { ...cell, color: forcedColor } : null)),
      hand: prev.hand.map(piece =>
        piece ? { ...piece, colors: piece.colors.map(() => forcedColor) } : null
      )
    }));

    if (sameColorTimerRef.current !== null) {
      window.clearTimeout(sameColorTimerRef.current);
    }

    sameColorTimerRef.current = window.setTimeout(() => {
      setGameState(prev => ({
        ...prev,
        grid: prev.grid.map(row => row.map(cell =>
          cell
            ? { ...cell, color: prev.objectiveColors[Math.floor(Math.random() * prev.objectiveColors.length)] }
            : null
        )),
        hand: prev.hand.map(piece =>
          piece
            ? {
                ...piece,
                colors: piece.colors.map(
                  () => prev.objectiveColors[Math.floor(Math.random() * prev.objectiveColors.length)]
                )
              }
            : null
        )
      }));
      setSameColorActive(false);
      setSameColorForcedColor(null);
      setSameColorEndsAt(null);
      setSameColorRemainingMs(0);
      sameColorTimerRef.current = null;
    }, 5000);
  };

  const handleBoardPointerDown = (e: React.PointerEvent) => {
    if (!alignBoosterArmed || alignAnimating || gameState.selectedPieceIndex !== null || gameState.gameOver || gameState.levelComplete) return;
    alignSwipeStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleBoardPointerUp = (e: React.PointerEvent) => {
    if (!alignBoosterArmed || alignAnimating || !alignSwipeStartRef.current || gameState.selectedPieceIndex !== null) return;
    const start = alignSwipeStartRef.current;
    alignSwipeStartRef.current = null;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const threshold = 24;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
      applyAlignBooster(dx > 0 ? 'right' : 'left');
    } else {
      applyAlignBooster(dy > 0 ? 'down' : 'up');
    }
  };

  const handleRestart = () => {
    if (sameColorTimerRef.current !== null) {
      window.clearTimeout(sameColorTimerRef.current);
      sameColorTimerRef.current = null;
    }
    if (sameColorRafRef.current !== null) {
      window.cancelAnimationFrame(sameColorRafRef.current);
      sameColorRafRef.current = null;
    }
    setAlignBoosterArmed(false);
    setAlignAnimating(false);
    setAlignMoveSprites([]);
    setAlignAnimationStarted(false);
    setSameColorActive(false);
    setSameColorForcedColor(null);
    setSameColorEndsAt(null);
    setSameColorRemainingMs(0);
    const highScore = Number(localStorage.getItem('highScore')) || 0;
    setGameState(createLevelState(1, 0, highScore));
    setHoveredCell(null);
    setDragPosition(null);
    setIsShaking(false);
    setParticles([]);
    setFloatingTexts([]);
  };

  const handleNextLevel = () => {
    if (sameColorTimerRef.current !== null) {
      window.clearTimeout(sameColorTimerRef.current);
      sameColorTimerRef.current = null;
    }
    if (sameColorRafRef.current !== null) {
      window.cancelAnimationFrame(sameColorRafRef.current);
      sameColorRafRef.current = null;
    }
    setAlignBoosterArmed(false);
    setAlignAnimating(false);
    setAlignMoveSprites([]);
    setAlignAnimationStarted(false);
    setSameColorActive(false);
    setSameColorForcedColor(null);
    setSameColorEndsAt(null);
    setSameColorRemainingMs(0);
    setGameState(prev => createLevelState(prev.level + 1, prev.score, prev.highScore));
    setHoveredCell(null);
    setDragPosition(null);
    setIsShaking(false);
    setParticles([]);
    setFloatingTexts([]);
  };

  const startDragging = (e: React.PointerEvent, index: number) => {
    if (alignAnimating || gameState.hand[index] === null || gameState.gameOver || gameState.levelComplete) return;
    
    setGameState(prev => ({ ...prev, selectedPieceIndex: index }));
    setDragPosition({ x: e.clientX, y: e.clientY });
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (alignAnimating || gameState.selectedPieceIndex === null || gameState.gameOver || gameState.levelComplete) return;

    setDragPosition({ x: e.clientX, y: e.clientY });

    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / GRID_SIZE;
      
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

      // Target grid coordinates for the anchor (0,0) tile
      const x = Math.round((visualX - rect.left) / cellSize - midX - 0.5);
      const y = Math.round((visualY - rect.top) / cellSize - midY - 0.5);

      if (x >= -2 && x < GRID_SIZE && y >= -2 && y < GRID_SIZE) {
        setHoveredCell({ x, y });
      } else {
        setHoveredCell(null);
      }
    }
  };

  const stopDragging = (e: React.PointerEvent) => {
    if (alignAnimating || gameState.levelComplete) return;
    if (gameState.selectedPieceIndex === null) return;

    if (hoveredCell) {
      placePieceAt(hoveredCell.x, hoveredCell.y);
    } else {
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
    }
    
    setDragPosition(null);
    setHoveredCell(null);
  };

  const placePieceAt = (x: number, y: number) => {
    const { selectedPieceIndex, hand, grid, score, combo, objectiveColors } = gameState;
    const piece = hand[selectedPieceIndex!];
    
    if (piece && canPlacePiece(grid, piece, x, y)) {
      const newGrid = grid.map(row => [...row]);
      piece.shape.forEach((point, i) => {
        newGrid[y + point.y][x + point.x] = {
          color: piece.colors[i],
          id: `${Date.now()}-${Math.random()}`
        };
      });

      const newHand = [...hand];
      newHand[selectedPieceIndex!] = null;

      if (newHand.every(p => p === null)) {
        const palette = sameColorActive && sameColorForcedColor ? [sameColorForcedColor] : objectiveColors;
        newHand[0] = generatePiece(palette);
        newHand[1] = generatePiece(palette);
        newHand[2] = generatePiece(palette);
      }
      const placementScore = piece.shape.length * 10;
      resolveBoardAfterAction(newGrid, newHand, score, combo, placementScore, true, 1);
    } else {
      setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
    }
  };

  const isGhostCell = (x: number, y: number) => {
    if (alignAnimating || gameState.levelComplete || gameState.selectedPieceIndex === null || !hoveredCell) return null;
    const piece = gameState.hand[gameState.selectedPieceIndex];
    if (!piece) return null;
    
    const ghostPointIndex = piece.shape.findIndex(p => hoveredCell.x + p.x === x && hoveredCell.y + p.y === y);
    if (ghostPointIndex !== -1) {
      const isValid = canPlacePiece(gameState.grid, piece, hoveredCell.x, hoveredCell.y);
      return { color: piece.colors[ghostPointIndex], isValid };
    }
    return null;
  };

  const projectedMatchKeys = useMemo(() => {
    if (
      alignAnimating ||
      gameState.gameOver ||
      gameState.levelComplete ||
      gameState.selectedPieceIndex === null ||
      !hoveredCell
    ) {
      return new Set<string>();
    }

    const piece = gameState.hand[gameState.selectedPieceIndex];
    if (!piece) return new Set<string>();
    if (!canPlacePiece(gameState.grid, piece, hoveredCell.x, hoveredCell.y)) return new Set<string>();

    const projectedGrid = gameState.grid.map(row => [...row]);
    piece.shape.forEach((point, i) => {
      projectedGrid[hoveredCell.y + point.y][hoveredCell.x + point.x] = {
        color: piece.colors[i],
        id: `projected-${i}`
      };
    });

    const groups = findMatchGroups(projectedGrid);
    const keys = new Set<string>();
    groups.forEach(group => {
      group.forEach(p => keys.add(`${p.x}-${p.y}`));
    });
    return keys;
  }, [
    alignAnimating,
    gameState.gameOver,
    gameState.levelComplete,
    gameState.selectedPieceIndex,
    gameState.hand,
    gameState.grid,
    hoveredCell
  ]);

  return (
    <div 
      className="flex flex-col h-screen w-full max-w-md mx-auto p-4 select-none bg-slate-950 overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
    >
      <style>{`
        .board-grid {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          grid-template-rows: repeat(8, 1fr);
        }
        .piece-preview-grid {
          display: grid;
        }
        .drag-preview {
          position: fixed;
          pointer-events: none;
          z-index: 1000;
          transform: translate(-50%, -50%) scale(1.1);
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
        @keyframes comboPulse {
          0% { transform: scale(0.9); opacity: 0.55; }
          50% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.55; }
        }
        .combo-preview-ring {
          animation: comboPulse 0.9s ease-in-out infinite;
        }
      `}</style>

      {/* Effects Layer */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {particles.map(p => (
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
              opacity: p.life / p.maxLife,
              transform: `translate(-50%, -50%) rotate(${p.life * 10}deg)`
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

      {/* Main Score Card */}
      <div className="bg-slate-900 rounded-3xl p-5 mb-4 flex justify-between items-center shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600 opacity-50"></div>
        <div className="flex flex-col">
          <span className="text-blue-400 text-[10px] uppercase font-bold tracking-widest mb-1">Level {gameState.level}</span>
          <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Score</span>
          <span className="text-5xl font-black text-white tracking-tight">{gameState.score}</span>
        </div>
        <div className="flex flex-col items-end">
          <div className={`text-xl font-black transition-all ${gameState.combo > 1 ? 'text-yellow-400 scale-110' : 'text-slate-700'}`}>
            x{gameState.combo}
          </div>
          <span className="text-[8px] uppercase font-bold text-slate-600 tracking-wider">Combo</span>
        </div>
        <button 
          onClick={handleRestart}
          className="ml-4 bg-slate-800 hover:bg-slate-700 w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 border border-slate-700 shadow-lg"
        >
          <i className="fa-solid fa-rotate-right text-xl text-blue-400"></i>
        </button>
      </div>

      {/* Objectives */}
      <div className="bg-slate-900 rounded-3xl p-4 mb-4 border border-slate-800">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            {gameState.objectiveColors.map(color => {
              const remaining = Math.max(0, gameState.objectiveTarget - (gameState.clearedByColor[color] || 0));
              return (
                <div key={color} className="w-12 h-12 rounded-xl border border-slate-800 flex flex-col items-center justify-center" style={{ backgroundColor: color }}>
                  <span className="text-white text-xs font-black leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{remaining}</span>
                </div>
              );
            })}
          </div>
          <div className="w-12 h-12 rounded-xl border border-slate-700 bg-slate-950/70 flex flex-col items-center justify-center">
            <span className={`text-lg font-black leading-none ${gameState.movesLeft <= 5 ? 'text-rose-400' : 'text-cyan-300'}`}>
              {gameState.movesLeft}
            </span>
          </div>
        </div>
      </div>

      {/* Game Board Container */}
      <div 
        ref={boardRef}
        onPointerDown={handleBoardPointerDown}
        onPointerUp={handleBoardPointerUp}
        className={`relative aspect-square bg-slate-900 rounded-3xl p-1.5 shadow-2xl border border-slate-800 ${isShaking ? 'shake-animation' : ''}`}
      >
        {sameColorActive && (
          <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none">
            <div className="bg-slate-900/95 border border-amber-400/40 rounded-xl px-3 py-2">
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-75"
                  style={{ width: `${Math.max(0, (sameColorRemainingMs / 5000) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        <div className="board-grid w-full h-full gap-1.5">
          {gameState.grid.map((row, y) => 
            row.map((cell, x) => {
              const ghost = isGhostCell(x, y);
              const isProjectedComboCell = projectedMatchKeys.has(`${x}-${y}`);
              return (
                <div 
                  key={`${x}-${y}`}
                  data-cell={`${x}-${y}`}
                  onClick={() => activateSpecialAt(x, y)}
                  className={`
                    relative rounded-lg transition-all duration-300
                    ${cell ? 'shadow-[0_4px_10px_rgba(0,0,0,0.3)]' : 'bg-slate-800/30 border border-white/5'}
                  `}
                  style={{ 
                    backgroundColor: cell?.color || (ghost ? ghost.color : 'rgba(30, 41, 59, 0.3)'),
                    opacity: alignAnimating && cell ? 0 : (ghost ? (ghost.isValid ? 0.7 : 0.15) : 1),
                    transform: gameState.clearingTiles.includes(cell?.id || '') 
                      ? 'scale(0) rotate(90deg)' 
                      : (ghost && ghost.isValid ? 'scale(0.95)' : 'scale(1)'),
                    boxShadow: cell ? `inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.4)` : 'none'
                  }}
                >
                  {cell && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-lg pointer-events-none" />
                  )}
                  {isProjectedComboCell && (
                    <>
                      <div className="absolute inset-[2px] rounded-md border-2 border-yellow-300/90 combo-preview-ring pointer-events-none" />
                      <div className="absolute inset-0 rounded-lg shadow-[0_0_14px_rgba(250,204,21,0.85)] pointer-events-none" />
                    </>
                  )}
                  {cell?.special && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {cell.special === 'bomb' && <i className="fa-solid fa-bomb text-white text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"></i>}
                      {cell.special === 'paint' && <i className="fa-solid fa-fill-drip text-white text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"></i>}
                      {cell.special === 'rainbow' && <i className="fa-solid fa-star text-white text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"></i>}
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

        {/* Level Complete Screen */}
        {gameState.levelComplete && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center z-50">
            <h2 className="text-4xl font-black mb-1 text-white">LEVEL CLEAR</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium">Objectives complete for Level {gameState.level}.</p>
            <div className="bg-slate-900 rounded-2xl p-6 w-full mb-8 border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block mb-2">Current Score</span>
              <span className="text-5xl font-black text-white">{gameState.score}</span>
            </div>
            <button 
              onClick={handleNextLevel}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 px-12 rounded-2xl transition-all active:scale-95"
            >
              NEXT LEVEL
            </button>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState.gameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center z-50">
            <h2 className="text-4xl font-black mb-1 text-white">GAME OVER</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium">
              {gameState.movesLeft <= 0
                ? 'You ran out of moves before completing objectives.'
                : 'No valid moves left before objectives were completed.'}
            </p>
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

        {alignBoosterArmed && !gameState.gameOver && !gameState.levelComplete && (
          <div className="absolute inset-0 pointer-events-none rounded-3xl border-2 border-cyan-400/70 flex items-start justify-center pt-3">
            <div className="bg-cyan-500/20 rounded-full border border-cyan-300/40 w-8 h-8 flex items-center justify-center">
              <i className="fa-solid fa-arrows-left-right text-cyan-200 text-sm"></i>
            </div>
          </div>
        )}

        {alignAnimating && (
          <div className="absolute inset-0 pointer-events-none z-40">
            {alignMoveSprites.map(sprite => (
              <div
                key={sprite.id}
                className="absolute rounded-lg"
                style={{
                  left: sprite.fromLeft,
                  top: sprite.fromTop,
                  width: sprite.size,
                  height: sprite.size,
                  backgroundColor: sprite.color,
                  transform: alignAnimationStarted
                    ? `translate(${sprite.toLeft - sprite.fromLeft}px, ${sprite.toTop - sprite.fromTop}px)`
                    : 'translate(0px, 0px)',
                  transition: 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                  boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.4)'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-lg pointer-events-none" />
              </div>
            ))}
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
          <PiecePreview piece={gameState.hand[gameState.selectedPieceIndex]!} active={true} size="large" />
        </div>
      )}

      {/* Piece Selection Rack */}
      <div className="mt-4 flex flex-col gap-6">
        <div className="flex items-center justify-center gap-4">
          <div className="h-[1px] bg-slate-800 flex-1"></div>
          <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Next Shapes</h3>
          <div className="h-[1px] bg-slate-800 flex-1"></div>
        </div>
        
        <div className="flex justify-around items-center gap-3 h-24 sm:h-32">
          {gameState.hand.map((piece, index) => (
            <div 
              key={piece?.id || `empty-${index}`}
              onPointerDown={(e) => startDragging(e, index)}
              className={`
                flex-1 h-full bg-slate-900 rounded-3xl flex items-center justify-center p-3
                border-2 transition-all duration-300 relative touch-none
                ${gameState.selectedPieceIndex === index 
                  ? 'border-blue-500/50 bg-blue-500/5 opacity-30' 
                  : 'border-slate-800 hover:border-slate-700 cursor-grab'}
                ${piece === null ? 'opacity-0 scale-90 pointer-events-none' : ''}
              `}
            >
              {piece && <PiecePreview piece={piece} active={false} />}
            </div>
          ))}
        </div>

        {/* Booster Deck */}
        <div className="bg-slate-900 rounded-3xl border border-slate-800 p-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                if (alignAnimating || gameState.gameOver || gameState.levelComplete || sameColorActive) return;
                setAlignBoosterArmed(prev => !prev);
              }}
              className={`h-14 rounded-2xl border transition-all flex items-center justify-center ${
                alignBoosterArmed
                  ? 'border-cyan-400 bg-cyan-500/10'
                  : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'
              } ${(alignAnimating || gameState.gameOver || gameState.levelComplete || sameColorActive) ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={alignAnimating || gameState.gameOver || gameState.levelComplete || sameColorActive}
            >
              <i className="fa-solid fa-arrows-left-right text-cyan-300 text-xl"></i>
            </button>

            <button
              onClick={activateSameColorBooster}
              className={`h-14 rounded-2xl border transition-all flex items-center justify-center ${
                sameColorActive
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'
              } ${(alignAnimating || gameState.gameOver || gameState.levelComplete || sameColorActive) ? 'opacity-70' : ''}`}
              disabled={alignAnimating || gameState.gameOver || gameState.levelComplete || sameColorActive}
            >
              <i className="fa-solid fa-droplet text-amber-300 text-xl"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PiecePreview: React.FC<{ piece: PieceData, active: boolean, size?: 'small' | 'large' }> = ({ piece, active, size = 'small' }) => {
  const minX = Math.min(...piece.shape.map(p => p.x));
  const maxX = Math.max(...piece.shape.map(p => p.x));
  const minY = Math.min(...piece.shape.map(p => p.y));
  const maxY = Math.max(...piece.shape.map(p => p.y));
  
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  
  const boxSize = size === 'large' ? 'w-10 h-10' : 'w-4 h-4 sm:w-6 sm:h-6';
  
  return (
    <div 
      className="piece-preview-grid gap-1"
      style={{
        gridTemplateColumns: `repeat(${width}, 1fr)`,
        gridTemplateRows: `repeat(${height}, 1fr)`,
        width: 'auto',
        maxHeight: '100%',
        maxWidth: '100%'
      }}
    >
      {Array.from({ length: width * height }).map((_, i) => {
        const x = minX + (i % width);
        const y = minY + Math.floor(i / width);
        const indexInShape = piece.shape.findIndex(p => p.x === x && p.y === y);
        const inShape = indexInShape !== -1;
        
        return (
          <div 
            key={i}
            className={`${boxSize} rounded-lg transition-all duration-200 ${inShape ? 'shadow-md' : 'bg-transparent'}`}
            style={{ 
              backgroundColor: inShape ? piece.colors[indexInShape] : 'transparent',
              boxShadow: inShape ? 'inset 0 1px 3px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)' : 'none'
            }}
          />
        );
      })}
    </div>
  );
};

export default App;
