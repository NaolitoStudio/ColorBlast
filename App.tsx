
import React, { useState, useEffect, useRef } from 'react';
import { GameState, PieceData, Point, Color, LevelObjective, Booster, BoosterType } from './types';
import { createRandomGrid, generatePiece, generateValidHand, canPlacePiece, findMatchGroups, findGroupCenter, getBombExplosionPoints, isGameOver, calculateScore, initializeObjectives } from './utils/gameLogic';
import { GRID_SIZE, getLevelConfig } from './constants';

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

const App: React.FC = () => {
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
  
  // Effects State
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showLevelPopup, setShowLevelPopup] = useState(false);
  const [showAllClear, setShowAllClear] = useState(false);
  const [affectedCells, setAffectedCells] = useState<Set<string>>(new Set());
  const [affectedColor, setAffectedColor] = useState<string>('transparent');

  const boardRef = useRef<HTMLDivElement>(null);

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

    if (booster.type === 'line_bomb') {
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
    const previewColor = booster.type === 'line_bomb' ? 'rgba(59, 130, 246, 0.3)'
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
  };

  // Handle clicking on a booster to activate it
  const activateBooster = (booster: Booster) => {
    if (celebrating || showLevelPopup || showAllClear || gameState.gameOver) return;
    if (affectedCells.size > 0) return; // Already activating

    // Calculate affected cells for visual indicator
    const previewCells = getBoosterAffectedCells(booster);
    const previewColor = booster.type === 'line_bomb' ? 'rgba(59, 130, 246, 0.3)'
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

  // Execute the actual booster explosion
  const executeBoosterExplosion = (booster: Booster) => {
    let pointsToRemove: Point[] = [];
    let effectText = '';
    let bonusMultiplier = 1;

    const newGrid = gameState.grid.map(row => [...row]);

    if (booster.type === 'line_bomb') {
      // Remove entire row AND column
      for (let i = 0; i < GRID_SIZE; i++) {
        if (newGrid[booster.y][i]) pointsToRemove.push({ x: i, y: booster.y });
        if (newGrid[i][booster.x] && i !== booster.y) pointsToRemove.push({ x: booster.x, y: i });
      }
      effectText = '💣 LINE BLAST!';
      bonusMultiplier = 1.5;
    } else if (booster.type === 'bomb') {
      // Remove 1 layer around (8 neighbors)
      pointsToRemove = getBombExplosionPoints({ x: booster.x, y: booster.y }, 1, newGrid);
      effectText = '💥 BOOM!';
      bonusMultiplier = 2;
    } else if (booster.type === 'color_ball') {
      // Remove ALL tiles of the booster's color
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (newGrid[y][x]?.color === booster.color) {
            pointsToRemove.push({ x, y });
          }
        }
      }
      effectText = '🌈 COLOR BLAST!';
      bonusMultiplier = 3;
    }

    // Count colors for objectives
    const colorCounts: Record<string, number> = {};
    pointsToRemove.forEach(p => {
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

    // Calculate score
    const totalCleared = pointsToRemove.length;
    const explosionScore = Math.round(totalCleared * 15 * bonusMultiplier);

    // Collect IDs for animation
    const matchingIds = pointsToRemove.map(p => newGrid[p.y][p.x]?.id).filter(Boolean) as string[];

    // Spawn visuals
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / GRID_SIZE;

      const boosterCenterX = rect.left + (booster.x * cellSize) + (cellSize / 2);
      const boosterCenterY = rect.top + (booster.y * cellSize) + (cellSize / 2);

      // Particles for each exploded block
      pointsToRemove.forEach(p => {
        const tile = newGrid[p.y][p.x];
        if (tile) {
          const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
          const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
          spawnParticles(cellCenterX, cellCenterY, tile.color, 8);
        }
      });

      spawnFloatingText(boosterCenterX, boosterCenterY - 20, effectText);
      spawnFloatingText(boosterCenterX, boosterCenterY + 10, `+${explosionScore}`);
    }

    triggerShake();

    // Remove the booster from the list
    const newBoosters = gameState.boosters.filter(b => b.id !== booster.id);

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      boosters: newBoosters,
      score: prev.score + explosionScore,
      clearingTiles: matchingIds,
      objectives: newObjectives,
      levelComplete: isLevelComplete
    }));

    // Remove tiles after animation
    setTimeout(() => {
      setGameState(prev => {
        const finalGrid = prev.grid.map(row => [...row]);
        pointsToRemove.forEach(p => {
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

  const startDragging = (e: React.PointerEvent, index: number) => {
    if (gameState.hand[index] === null || gameState.gameOver || celebrating || showLevelPopup || showAllClear) return;
    
    setGameState(prev => ({ ...prev, selectedPieceIndex: index }));
    setDragPosition({ x: e.clientX, y: e.clientY });
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (gameState.selectedPieceIndex === null || gameState.gameOver) return;

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
    const { selectedPieceIndex, hand, grid, score, combo, level, objectives } = gameState;
    const piece = hand[selectedPieceIndex!];

    if (piece && canPlacePiece(grid, piece, x, y)) {
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
      }

      const matchGroups = findMatchGroups(newGrid);

      // Calculate Score & Effects
      if (matchGroups.length > 0) {
        const newCombo = combo + 1;

        // Process matches - create boosters for 4+ matches
        let allClearedPoints: Point[] = [];
        const boostersToCreate: Booster[] = [];

        matchGroups.forEach(group => {
          const center = findGroupCenter(group);
          const centerCell = newGrid[center.y][center.x];

          if (group.length >= 6 && centerCell) {
            // Color ball - eliminates all of one color
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'color_ball',
              x: center.x,
              y: center.y,
              color: centerCell.color
            });
            // Clear all except center
            group.forEach(p => {
              if (p.x !== center.x || p.y !== center.y) {
                if (!allClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
                  allClearedPoints.push(p);
                }
              }
            });
          } else if (group.length === 5 && centerCell) {
            // Bomb - eliminates 1 layer around
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'bomb',
              x: center.x,
              y: center.y,
              color: centerCell.color
            });
            group.forEach(p => {
              if (p.x !== center.x || p.y !== center.y) {
                if (!allClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
                  allClearedPoints.push(p);
                }
              }
            });
          } else if (group.length === 4 && centerCell) {
            // Line bomb - eliminates row + column
            boostersToCreate.push({
              id: `booster-${Date.now()}-${Math.random()}`,
              type: 'line_bomb',
              x: center.x,
              y: center.y,
              color: centerCell.color
            });
            group.forEach(p => {
              if (p.x !== center.x || p.y !== center.y) {
                if (!allClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
                  allClearedPoints.push(p);
                }
              }
            });
          } else {
            // Normal match (3) - clear all
            group.forEach(p => {
              if (!allClearedPoints.some(cp => cp.x === p.x && cp.y === p.y)) {
                allClearedPoints.push(p);
              }
            });
          }
        });

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
            const boosterText = booster.type === 'color_ball' ? '🌈 COLOR!' :
                               booster.type === 'bomb' ? '💥 BOMB!' : '💣 LINE!';
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
            const finalGrid = prev.grid.map(row =>
              row.map(cell => cell && matchingIds.includes(cell.id) ? null : cell)
            );

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
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: inherit; }
          50% { transform: scale(1.05); }
        }
        @keyframes fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-fade-out {
          animation: fade-out 0.4s ease-out forwards;
        }
        @keyframes bomb-glow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.3); }
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

      {/* Header */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent italic tracking-tighter">
            COLORBLAST
          </h1>
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Strategy & Luck</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Top Score</div>
          <div className="text-2xl font-black text-yellow-500 leading-none">{gameState.highScore}</div>
        </div>
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
        className={`relative aspect-square bg-slate-900 rounded-3xl p-1.5 shadow-2xl border border-slate-800 ${isShaking ? 'shake-animation' : ''}`}
      >
        <div className="board-grid w-full h-full gap-1.5">
          {gameState.grid.map((row, y) =>
            row.map((cell, x) => {
              const ghost = isGhostCell(x, y);
              const booster = gameState.boosters.find(b => b.x === x && b.y === y);
              const isAffected = affectedCells.has(`${x},${y}`);

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => booster && activateBooster(booster)}
                  className={`
                    relative rounded-lg transition-all duration-200
                    ${cell ? 'shadow-[0_4px_10px_rgba(0,0,0,0.3)]' : 'bg-slate-800/30 border border-white/5'}
                    ${booster ? 'cursor-pointer active:scale-95' : ''}
                  `}
                  style={{
                    backgroundColor: booster ? 'transparent' : (cell?.color || (ghost ? ghost.color : 'rgba(30, 41, 59, 0.3)')),
                    opacity: ghost ? (ghost.isValid ? 0.7 : 0.15) : 1,
                    transform: gameState.clearingTiles.includes(cell?.id || '')
                      ? 'scale(0) rotate(90deg)'
                      : (ghost && ghost.isValid ? 'scale(0.95)' : 'scale(1)'),
                    boxShadow: cell && !booster ? `inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.4)` : 'none'
                  }}
                >
                  {/* Affected area indicator - shows during booster activation with fade */}
                  {isAffected && !booster && (
                    <div
                      className="absolute inset-0 rounded-lg pointer-events-none z-10 animate-fade-out"
                      style={{
                        backgroundColor: affectedColor
                      }}
                    />
                  )}
                  {cell && !booster && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-lg pointer-events-none" />
                  )}
                  {booster && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ animation: 'pulse 1s ease-in-out infinite' }}
                    >
                      <div
                        className="w-[85%] h-[85%] rounded-xl flex items-center justify-center"
                        style={{
                          background: booster.type === 'color_ball'
                            ? 'linear-gradient(135deg, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)'
                            : booster.type === 'bomb'
                            ? 'linear-gradient(135deg, #ef4444, #f97316)'
                            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.3)'
                        }}
                      >
                        <span className="text-2xl drop-shadow-lg" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                          {booster.type === 'color_ball' ? '🌈' : booster.type === 'bomb' ? '💥' : '💣'}
                        </span>
                      </div>
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
