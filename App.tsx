
import React, { useState, useEffect, useRef } from 'react';
import { GameState, PieceData, Point, PowerupType, Color, TileData } from './types';
import { createRandomGrid, generatePiece, canPlacePiece, findMatchGroups, isGameOver, calculateScore, resolvePowerupChain, getPowerupForMatch, createEmptyGrid } from './utils/gameLogic';
import { GRID_SIZE, COLOR_SYMBOLS, COLORS } from './constants';
import { LEVELS } from './utils/levels';

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

interface PowerupEffect {
  id: number;
  type: PowerupType;
  x: number; // Grid X (optional, kept for ref)
  y: number; // Grid Y
  screenX: number;
  screenY: number;
}

const App: React.FC = () => {
  const [currentLevel, setCurrentLevel] = useState(0);
  const [levelProgress, setLevelProgress] = useState<Record<string, number>>({});

  const [gameState, setGameState] = useState<GameState>(() => {
    // Initial Level Setup
    const levelInd = 0; // Start at Level 1 (index 0)
    const level = LEVELS[levelInd];
    const initialGrid = createEmptyGrid();
    level.pattern(initialGrid);

    const initialHand = [
      generatePiece(initialGrid, level.availableColors),
      generatePiece(initialGrid, level.availableColors),
      generatePiece(initialGrid, level.availableColors)
    ];
    return {
      grid: initialGrid,
      score: 0,
      highScore: Number(localStorage.getItem('highScore')) || 0,
      hand: initialHand,
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1
    };
  });

  const [hoveredCell, setHoveredCell] = useState<Point | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number } | null>(null);

  // Effects State
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [powerupEffects, setPowerupEffects] = useState<PowerupEffect[]>([]);
  const [isShaking, setIsShaking] = useState(false);

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

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  };

  const addPowerupEffect = (type: PowerupType, x: number, y: number, screenX: number, screenY: number) => {
    const id = Date.now() + Math.random();
    setPowerupEffects(prev => [...prev, { id, type, x, y, screenX, screenY }]);
    setTimeout(() => {
      setPowerupEffects(prev => prev.filter(e => e.id !== id));
    }, 1000); // Effect duration
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
        vy: Math.sin(angle) * speed - 2,
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

  const handleRestart = () => {
    const levelInd = 0;
    setCurrentLevel(levelInd);
    setLevelProgress({});

    const level = LEVELS[levelInd];
    const newGrid = createEmptyGrid();
    level.pattern(newGrid);

    setGameState({
      grid: newGrid,
      score: 0,
      highScore: Number(localStorage.getItem('highScore')) || 0,
      hand: [
        generatePiece(newGrid, level.availableColors),
        generatePiece(newGrid, level.availableColors),
        generatePiece(newGrid, level.availableColors)
      ],
      gameOver: false,
      selectedPieceIndex: null,
      clearingTiles: [],
      combo: 1
    });
    setParticles([]);
    setFloatingTexts([]);
  };

  const startDragging = (e: React.PointerEvent, index: number) => {
    if (gameState.hand[index] === null || gameState.gameOver) return;

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

      const visualX = e.clientX;
      const visualY = e.clientY - DRAG_OFFSET_Y;

      const minX = Math.min(...piece.shape.map(p => p.x));
      const maxX = Math.max(...piece.shape.map(p => p.x));
      const minY = Math.min(...piece.shape.map(p => p.y));
      const maxY = Math.max(...piece.shape.map(p => p.y));

      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

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
    try {
      const { selectedPieceIndex, hand, grid, score, combo } = gameState;
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

        const level = LEVELS[currentLevel];
        if (newHand.every(p => p === null)) {
          newHand[0] = generatePiece(newGrid, level.availableColors);
          newHand[1] = generatePiece(newGrid, level.availableColors);
          newHand[2] = generatePiece(newGrid, level.availableColors);
        }

        const matchGroups = findMatchGroups(newGrid);

        // Determine Powerups to Create
        const powerupsToCreate = new Map<string, PowerupType>();
        const initialMatchPoints: Point[] = [];

        matchGroups.forEach(group => {
          const powerupType = getPowerupForMatch(group.length);
          if (powerupType) {
            // Find pivot: check if any point in group matches placement x,y
            const placedPoints = piece.shape.map(p => ({ x: x + p.x, y: y + p.y }));
            let pivot = group.find(gp => placedPoints.some(pp => pp.x === gp.x && pp.y === gp.y));
            if (!pivot) pivot = group[0]; // Fallback

            powerupsToCreate.set(`${pivot.x},${pivot.y}`, powerupType);
          }
          initialMatchPoints.push(...group);
        });

        if (initialMatchPoints.length > 0) {
          // Resolve Chain (Powerups exploding)
          const allClearedPoints = resolvePowerupChain(newGrid, initialMatchPoints);
          const totalCleared = allClearedPoints.length;
          const newCombo = combo + 1;

          const { score: moveScore, text, multiplier } = calculateScore(totalCleared, newCombo);
          const newScore = score + moveScore;

          // Spawn Powerup Effects
          if (boardRef.current) {
            const rect = boardRef.current.getBoundingClientRect();
            const cellSize = rect.width / GRID_SIZE;

            allClearedPoints.forEach(p => {
              const cell = newGrid[p.y][p.x];
              if (cell && cell.powerup) {
                const screenX = rect.left + (p.x * cellSize) + (cellSize / 2);
                const screenY = rect.top + (p.y * cellSize) + (cellSize / 2);
                addPowerupEffect(cell.powerup, p.x, p.y, screenX, screenY);
              }
            });
          }

          const matchingIds = allClearedPoints
            .map(p => newGrid[p.y][p.x])
            .filter((cell): cell is TileData => cell !== null)
            .map(cell => cell.id);

          // Update Level Progress
          const progressUpdate = { ...levelProgress };

          allClearedPoints.forEach(p => {
            const cell = newGrid[p.y][p.x];
            if (cell && level.availableColors.includes(cell.color)) {
              progressUpdate[cell.color] = (progressUpdate[cell.color] || 0) + 1;
            }
          });
          setLevelProgress(progressUpdate);

          const isLevelComplete = level.availableColors.every(c => (progressUpdate[c] || 0) >= level.targetClears);

          // Spawn Visuals
          if (boardRef.current) {
            const rect = boardRef.current.getBoundingClientRect();
            const cellSize = rect.width / GRID_SIZE;

            allClearedPoints.forEach(p => {
              const cellCenterX = rect.left + (p.x * cellSize) + (cellSize / 2);
              const cellCenterY = rect.top + (p.y * cellSize) + (cellSize / 2);
              const cell = newGrid[p.y][p.x];
              if (cell) {
                spawnParticles(cellCenterX, cellCenterY, cell.color, 6);
              }
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
            combo: newCombo
          }));

          setTimeout(() => {
            if (isLevelComplete) {
              const nextLevelInd = (currentLevel + 1) % LEVELS.length;
              setCurrentLevel(nextLevelInd);
              setLevelProgress({});

              const nextLevel = LEVELS[nextLevelInd];
              const nextGrid = createEmptyGrid();
              nextLevel.pattern(nextGrid);

              setGameState(prev => ({
                ...prev,
                grid: nextGrid,
                clearingTiles: [],
                hand: [
                  generatePiece(nextGrid, nextLevel.availableColors),
                  generatePiece(nextGrid, nextLevel.availableColors),
                  generatePiece(nextGrid, nextLevel.availableColors)
                ],
                gameOver: false
              }));
              spawnFloatingText(window.innerWidth / 2, window.innerHeight / 2, "LEVEL COMPLETED!");

            } else {
              setGameState(prev => {
                const finalGrid = prev.grid.map((row, y) =>
                  row.map((cell, x) => {
                    // Check if clearing
                    if (cell && matchingIds.includes(cell.id)) {
                      // Check if we should spawn a powerup here
                      const key = `${x},${y}`;
                      if (powerupsToCreate.has(key)) {
                        return {
                          color: cell.color,
                          id: `powerup-${Date.now()}-${x}-${y}`,
                          powerup: powerupsToCreate.get(key)
                        };
                      }
                      return null;
                    }
                    return cell;
                  })
                );

                const lost = isGameOver(finalGrid, prev.hand);
                return {
                  ...prev,
                  grid: finalGrid,
                  clearingTiles: [],
                  gameOver: lost
                };
              });
            }
          }, 400);

        } else {
          const lost = isGameOver(newGrid, newHand);
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
    } catch (e) {
      console.error("Error in placePieceAt:", e);
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
        {powerupEffects.map(e => (
          <React.Fragment key={e.id}>
            {e.type === PowerupType.ROCKET && (
              <div style={{ position: 'absolute', left: e.screenX, top: e.screenY }}>
                <div className="absolute bg-white h-1 w-[200vw] -translate-x-1/2 -translate-y-1/2 opacity-75 animate-ping" />
                <div className="absolute bg-white w-1 h-[200vh] -translate-x-1/2 -translate-y-1/2 opacity-75 animate-ping" />
              </div>
            )}
            {e.type === PowerupType.BOMB && (
              <div
                style={{ position: 'absolute', left: e.screenX, top: e.screenY }}
                className="w-48 h-48 bg-gradient-to-r from-orange-500 to-red-600 rounded-full -translate-x-1/2 -translate-y-1/2 animate-ping opacity-50 blur-xl pointer-events-none"
              />
            )}
            {e.type === PowerupType.LIGHTNING && (
              <div className="fixed inset-0 bg-yellow-100/30 animate-pulse z-[100] pointer-events-none" />
            )}
          </React.Fragment>
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
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Level {currentLevel + 1}</div>
          <div className="text-2xl font-black text-yellow-500 leading-none">{gameState.highScore}</div>
        </div>
      </div>

      {/* Main Score Card */}
      <div className="bg-slate-900 rounded-3xl p-5 mb-4 flex justify-between items-center shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600 opacity-50"></div>
        <div className="flex flex-col">
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

      {/* Level Progress */}
      <div className="flex justify-center flex-wrap gap-3 mb-6">
        {LEVELS[currentLevel].availableColors.map(color => {
          const count = levelProgress[color] || 0;
          const target = LEVELS[currentLevel].targetClears;
          const isDone = count >= target;
          return (
            <div
              key={color}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm transition-all ${isDone ? 'ring-2 ring-green-400 scale-105' : 'opacity-90'}`}
              style={{ backgroundColor: color, borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <i className={`fa-solid ${COLOR_SYMBOLS[color]} text-white drop-shadow-md text-sm`}></i>
              <span className="text-white font-black text-xs drop-shadow-md">{count} / {target}</span>
            </div>
          );
        })}
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
              return (
                <div
                  key={`${x}-${y}`}
                  className={`
                    relative rounded-lg transition-all duration-300
                    ${cell ? 'shadow-[0_4px_10px_rgba(0,0,0,0.3)]' : 'bg-slate-800/30 border border-white/5'}
                  `}
                  style={{
                    backgroundColor: cell?.color || (ghost ? ghost.color : 'rgba(30, 41, 59, 0.3)'),
                    opacity: ghost ? (ghost.isValid ? 0.7 : 0.15) : 1,
                    transform: gameState.clearingTiles.includes(cell?.id || '')
                      ? 'scale(0) rotate(90deg)'
                      : (ghost && ghost.isValid ? 'scale(0.95)' : 'scale(1)'),
                    boxShadow: cell ? `inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.4)` : 'none'
                  }}
                >
                  {cell && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-lg pointer-events-none" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {cell.powerup ? (
                          <i className={`fa-solid text-white text-xl drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] animate-pulse
                             ${cell.powerup === PowerupType.ROCKET ? 'fa-rocket' :
                              cell.powerup === PowerupType.BOMB ? 'fa-bomb' : 'fa-cloud-bolt'} // Lightning
                           `}></i>
                        ) : (
                          <i className={`fa-solid ${COLOR_SYMBOLS[cell.color]} text-black/25 text-xl drop-shadow-sm transform transition-transform duration-300`}></i>
                        )}
                      </div>
                    </>
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

        {/* Game Over Screen */}
        {gameState.gameOver && (
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
            className={`${boxSize} rounded-lg transition-all duration-200 ${inShape ? 'shadow-md relative flex items-center justify-center' : 'bg-transparent'}`}
            style={{
              backgroundColor: inShape ? piece.colors[indexInShape] : 'transparent',
              boxShadow: inShape ? 'inset 0 1px 3px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)' : 'none'
            }}
          >
            {inShape && (
              <i className={`fa-solid ${COLOR_SYMBOLS[piece.colors[indexInShape]]} text-black/25 ${size === 'large' ? 'text-lg' : 'text-[10px]'} drop-shadow-sm`}></i>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default App;
