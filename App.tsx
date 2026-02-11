
import React, { useState, useEffect, useRef } from 'react';
import { GameState, PieceData, Point, Color, TileData } from './types';
import { createRandomGrid, generatePiece, canPlacePiece, findMatchGroups, isGameOver, calculateScore } from './utils/gameLogic';
import { GRID_SIZE, COLORS } from './constants';
import { LEVELS } from './levels';
import { Random } from './utils/random';

const DRAG_OFFSET_Y = 100;

interface Particle { id: number; x: number; y: number; vx: number; vy: number; color: string; life: number; maxLife: number; size: number; }
interface FloatingText { id: number; x: number; y: number; text: string; life: number; maxLife: number; scale: number; color: string; }
interface FlyingSquare { id: number; startX: number; startY: number; endX: number; endY: number; color: string; progress: number; targetPoint: Point; }

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => ({ grid: [], score: 0, highScore: Number(localStorage.getItem('highScore')) || 0, hand: [], gameOver: false, selectedPieceIndex: null, clearingTiles: [], combo: 1, currentLevel: null, rngSeed: null }));
  const [hoveredCell, setHoveredCell] = useState<Point | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number } | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [flyingSquares, setFlyingSquares] = useState<FlyingSquare[]>([]);
  const [isShaking, setIsShaking] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    const updateEffects = () => {
      setParticles(prev => prev.filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.5, life: p.life - 1 })));
      setFloatingTexts(prev => prev.filter(t => t.life > 0).map(t => ({ ...t, y: t.y - 1.5, life: t.life - 1 })));
      setFlyingSquares(prev => prev.filter(s => s.progress < 1).map(s => ({ ...s, progress: Math.min(1, s.progress + 0.1) })));
      animationFrameId = requestAnimationFrame(updateEffects);
    };
    animationFrameId = requestAnimationFrame(updateEffects);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  useEffect(() => { if (gameState.score > gameState.highScore) { setGameState(prev => ({ ...prev, highScore: prev.score })); localStorage.setItem('highScore', gameState.score.toString()); } }, [gameState.score, gameState.highScore]);

  useEffect(() => {
    if (gameState.gameOver || gameState.clearingTiles.length > 0 || gameState.currentLevel === null || flyingSquares.length > 0) return;
    let bestBoosterMove: { boosterX: number, boosterY: number, targetX: number, targetY: number, color: Color, matchSize: number, type: 'line' | 'group' } | null = null;
    gameState.grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell && cell.isBooster) {
        if (cell.boosterType === 'group') {
          const testColor = cell.color; const groups = findGroupsOfTwo(gameState.grid, testColor);
          if (groups.length > 0) { if (!bestBoosterMove || bestBoosterMove.type === 'line') bestBoosterMove = { boosterX: x, boosterY: y, targetX: x, targetY: y, color: testColor, matchSize: groups.length * 3, type: 'group' }; }
          else if (!bestBoosterMove) bestBoosterMove = { boosterX: x, boosterY: y, targetX: x, targetY: y, color: cell.color, matchSize: 1, type: 'group' };
          return;
        }
        const checkPlacement = (tx: number, ty: number) => {
          for (const tc of COLORS) {
            const temp = gameState.grid.map(r => r.map(c => c ? { ...c } : null)); temp[ty][tx] = { color: tc, id: 'b-temp' }; if (tx !== x || ty !== y) temp[y][x] = null;
            const matches = findMatchGroups(temp); const boosterMatch = matches.find(g => g.some(p => p.x === tx && p.y === ty));
            if (boosterMatch && boosterMatch.length >= 3 && (!bestBoosterMove || bestBoosterMove.type === 'group' || boosterMatch.length > bestBoosterMove.matchSize)) bestBoosterMove = { boosterX: x, boosterY: y, targetX: tx, targetY: ty, color: tc, matchSize: boosterMatch.length, type: 'line' };
          }
        };
        checkPlacement(x, y); const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of directions) { let cx = x + dx, cy = y + dy; while (cx >= 0 && cx < GRID_SIZE && cy >= 0 && cy < GRID_SIZE) { if (!gameState.grid[cy][cx]) checkPlacement(cx, cy); cx += dx; cy += dy; } }
      }
    }));
    if (bestBoosterMove) { const t = setTimeout(() => { if (bestBoosterMove!.type === 'group') activateGroupBooster(bestBoosterMove!.boosterX, bestBoosterMove!.boosterY, bestBoosterMove!.color); else activateBooster(bestBoosterMove!.boosterX, bestBoosterMove!.boosterY, bestBoosterMove!.color, { x: bestBoosterMove!.targetX, y: bestBoosterMove!.targetY }); }, 300); return () => clearTimeout(t); }
  }, [gameState.grid, gameState.gameOver, gameState.clearingTiles.length, gameState.currentLevel, flyingSquares.length]);

  const triggerShake = () => { setIsShaking(true); setTimeout(() => setIsShaking(false), 300); };
  const spawnParticles = (x: number, y: number, color: string, count: number) => { const ps: Particle[] = []; for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 2; ps.push({ id: Date.now() + Math.random(), x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, color, life: 40 + Math.random() * 20, maxLife: 60, size: Math.random() * 6 + 4 }); } setParticles(prev => [...prev, ...ps]); };
  const spawnFloatingText = (x: number, y: number, text: string) => setFloatingTexts(prev => [...prev, { id: Date.now() + Math.random(), x, y, text, life: 60, maxLife: 60, scale: 1, color: '#fff' }]);

  const findGroupsOfTwo = (grid: (TileData | null)[][], color: Color): Point[][] => {
    const groups: Point[][] = [], visited = new Set<string>();
    const getNeighbors = (p: Point) => [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y + 1 }, { x: p.x - 1, y: p.y - 1 }, { x: p.x + 1, y: p.y - 1 }, { x: p.x - 1, y: p.y + 1 }];
    for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x]; if (!tile || tile.color !== color || visited.has(`${x},${y}`) || tile.isBooster) continue;
      const group: Point[] = [], queue: Point[] = [{ x, y }]; visited.add(`${x},${y}`);
      while (queue.length > 0) { const c = queue.shift()!; group.push(c); for (const n of getNeighbors(c)) { if (n.x >= 0 && n.x < GRID_SIZE && n.y >= 0 && n.y < GRID_SIZE && !visited.has(`${n.x},${n.y}`)) { const nt = grid[n.y][n.x]; if (nt && nt.color === color && !nt.isBooster) { visited.add(`${n.x},${n.y}`); queue.push(n); } } } }
      if (group.length === 2) groups.push(group);
    }
    return groups;
  };

  const activateGroupBooster = (x: number, y: number, color: Color) => {
    let targetColor = color;
    if (!gameState.grid.some(r => r.some(c => c && !c.isBooster && c.color === color))) {
      const counts: Record<string, number> = {}; gameState.grid.forEach(r => r.forEach(c => { if (c && !c.isBooster) counts[c.color] = (counts[c.color] || 0) + 1; }));
      const sorted = Object.entries(counts).sort((a, b) => a[1] - b[1]); if (sorted.length > 0) targetColor = sorted[0][0] as Color;
    }
    const groups = findGroupsOfTwo(gameState.grid, targetColor);
    const rect = boardRef.current?.getBoundingClientRect(); if (!rect) return;
    const cs = rect.width / GRID_SIZE, bx = rect.left + (x * cs) + (cs / 2), by = rect.top + (y * cs) + (cs / 2);
    const moves: { target: Point, color: Color }[] = [], used = new Set<string>();
    groups.forEach(g => {
      const adj: Point[] = [];
      g.forEach(p => {
        const ns = [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }];
        ns.forEach(n => { if (n.x >= 0 && n.x < GRID_SIZE && n.y >= 0 && n.y < GRID_SIZE && !gameState.grid[n.y][n.x] && !used.has(`${n.x},${n.y}`)) { const t = gameState.grid.map(r => [...r]); t[n.y][n.x] = { color: targetColor, id: 't' }; if (findMatchGroups(t).some(m => m.length >= 3 && m.some(gp => gp.x === n.x && gp.y === n.y))) adj.push(n); } });
      });
      if (adj.length > 0) { const s = adj[0]; moves.push({ target: s, color: targetColor }); used.add(`${s.x},${s.y}`); }
    });
    if (moves.length === 0) {
      const explode: Point[] = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ex = x + dx, ey = y + dy; if (ex >= 0 && ex < GRID_SIZE && ey >= 0 && ey < GRID_SIZE && gameState.grid[ey][ex]) explode.push({ x: ex, y: ey }); }
      setGameState(prev => { const grid = prev.grid.map(r => [...r]); grid[y][x] = null; const ids = explode.map(p => prev.grid[p.y][p.x]!.id); spawnParticles(bx, by, '#ffffff', 20); triggerShake(); setTimeout(() => { setGameState(s => { const fg = s.grid.map(r => r.map(c => c && ids.includes(c.id) ? null : c)); const ac = getAvailableColors(fg), uh = s.hand.map(p => p ? { ...p, colors: p.colors.map(c => ac.includes(c) ? c : (ac[Math.floor(Math.random() * ac.length)] || c)) } : null); return { ...s, grid: fg, hand: uh, score: s.score + explode.length * 20, clearingTiles: [], combo: s.combo + 1, gameOver: isGameOver(fg, uh) }; }); }, 200); return { ...prev, grid, clearingTiles: ids }; });
      return;
    }
    setFlyingSquares(moves.map((m, i) => ({ id: Date.now() + i, startX: bx, startY: by, endX: rect.left + (m.target.x * cs) + (cs / 2), endY: rect.top + (m.target.y * cs) + (cs / 2), color: m.color, progress: 0, targetPoint: m.target })));
    setTimeout(() => { setGameState(prev => { const grid = prev.grid.map(r => [...r]); grid[y][x] = null; moves.forEach(m => grid[m.target.y][m.target.x] = { color: m.color, id: `s-${Date.now()}-${Math.random()}` }); const ms = findMatchGroups(grid); if (ms.length > 0) { const cleared = ms.flat(), total = cleared.length, nc = prev.combo + 1, { score: sc, text: tx, multiplier: mu } = calculateScore(total, nc), ids = cleared.map(p => grid[p.y][p.x]!.id); triggerShake(); setTimeout(() => { setGameState(s => { const fg = s.grid.map(r => r.map(c => c && ids.includes(c.id) ? null : c)), ac = getAvailableColors(fg), uh = s.hand.map(p => p ? { ...p, colors: p.colors.map(c => ac.includes(c) ? c : (ac[Math.floor(Math.random() * ac.length)] || c)) } : null); return { ...s, grid: fg, hand: uh, score: s.score + sc, clearingTiles: [], combo: nc, gameOver: isGameOver(fg, uh) }; }); }, 200); return { ...prev, grid, clearingTiles: ids }; } return { ...prev, grid }; }); setFlyingSquares([]); }, 400);
  };

  const activateBooster = (x: number, y: number, color: Color, target: { x: number, y: number }) => {
    const tx = target.x, ty = target.y, tid = `b-p-${Date.now()}`;
    setGameState(prev => { const grid = prev.grid.map(r => [...r]); grid[y][x] = null; grid[ty][tx] = { color, id: tid }; return { ...prev, grid }; });
    if (boardRef.current) { const rect = boardRef.current.getBoundingClientRect(), cs = rect.width / GRID_SIZE; spawnParticles(rect.left + (tx * cs) + (cs / 2), rect.top + (ty * cs) + (cs / 2), color, 10); }
    setTimeout(() => { setGameState(prev => { const ms = findMatchGroups(prev.grid); if (ms.length > 0) { const cleared = ms.flat(), total = cleared.length, nc = prev.combo + 1, { score: sc, text: tx, multiplier: mu } = calculateScore(total, nc), ids = cleared.map(p => prev.grid[p.y][p.x]!.id); if (boardRef.current) { const rect = boardRef.current.getBoundingClientRect(), cs = rect.width / GRID_SIZE; cleared.forEach(p => spawnParticles(rect.left + (p.x * cs) + (cs / 2), rect.top + (p.y * cs) + (cs / 2), prev.grid[p.y][p.x]!.color, 6)); if (tx) spawnFloatingText(rect.left + (cleared.reduce((a, b) => a + b.x, 0) / total * cs) + (cs / 2), rect.top + (cleared.reduce((a, b) => a + b.y, 0) / total * cs) + (cs / 2), `${tx} x${mu}`); } triggerShake(); setTimeout(() => { setGameState(s => { const fg = s.grid.map(r => r.map(c => c && ids.includes(c.id) ? null : c)), ac = getAvailableColors(fg), uh = s.hand.map(p => p ? { ...p, colors: p.colors.map(c => ac.includes(c) ? c : (ac[Math.floor(Math.random() * ac.length)] || c)) } : null); return { ...s, grid: fg, hand: uh, score: s.score + sc, clearingTiles: [], combo: nc, gameOver: isGameOver(fg, uh) }; }); }, 200); return { ...prev, clearingTiles: ids }; } return prev; }); }, 250);
  };

  const startLevel = (id: number) => { const l = LEVELS.find(lv => lv.id === id); if (!l) return; const rng = new Random(l.seed), mc = l.maxStartingColors || COLORS.length, ic = COLORS.slice(0, Math.min(mc, COLORS.length)), ih = [generatePiece(rng, ic), generatePiece(rng, ic), generatePiece(rng, ic)]; setGameState(prev => ({ ...prev, grid: createRandomGrid(rng, mc, 0.3), score: 0, hand: ih, gameOver: false, selectedPieceIndex: null, clearingTiles: [], combo: 1, currentLevel: id, rngSeed: l.seed })); setParticles([]); setFloatingTexts([]); };
  const handleRestart = () => { if (gameState.currentLevel) startLevel(gameState.currentLevel); };
  const startDragging = (e: React.PointerEvent, i: number) => { if (gameState.hand[i] === null || gameState.gameOver) return; setGameState(prev => ({ ...prev, selectedPieceIndex: i })); setDragPosition({ x: e.clientX, y: e.clientY }); (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (gameState.selectedPieceIndex === null || gameState.gameOver) return; setDragPosition({ x: e.clientX, y: e.clientY });
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect(), cs = rect.width / GRID_SIZE, p = gameState.hand[gameState.selectedPieceIndex!]; if (!p) return;
      const vx = e.clientX, vy = e.clientY - DRAG_OFFSET_Y, minX = Math.min(...p.shape.map(q => q.x)), maxX = Math.max(...p.shape.map(q => q.x)), minY = Math.min(...p.shape.map(q => q.y)), maxY = Math.max(...p.shape.map(q => q.y)), mx = (minX + maxX) / 2, my = (minY + maxY) / 2, x = Math.round((vx - rect.left) / cs - mx - 0.5), y = Math.round((vy - rect.top) / cs - my - 0.5);
      if (x >= -2 && x < GRID_SIZE && y >= -2 && y < GRID_SIZE) setHoveredCell({ x, y }); else setHoveredCell(null);
    }
  };
  const stopDragging = (e: React.PointerEvent) => { if (gameState.selectedPieceIndex === null) return; if (hoveredCell) placePieceAt(hoveredCell.x, hoveredCell.y); else setGameState(prev => ({ ...prev, selectedPieceIndex: null })); setDragPosition(null); setHoveredCell(null); };
  const getAvailableColors = (g: (TileData | null)[][]): Color[] => { const pc = new Set<Color>(); g.forEach(r => r.forEach(c => { if (c && !c.isBooster) pc.add(c.color); })); const res = COLORS.filter(c => pc.has(c)); return res.length > 0 ? res : COLORS; };
  const isGhostCell = (x: number, y: number) => { if (gameState.selectedPieceIndex === null || !hoveredCell) return null; const p = gameState.hand[gameState.selectedPieceIndex]; if (!p) return null; const gi = p.shape.findIndex(q => hoveredCell.x + q.x === x && hoveredCell.y + q.y === y); if (gi !== -1) { const v = canPlacePiece(gameState.grid, p, hoveredCell.x, hoveredCell.y); return { color: p.colors[gi], isValid: v }; } return null; };
  const getIsOnBoosterLine = (x: number, y: number) => gameState.grid.some((r, ry) => r.some((c, rx) => c?.isBooster && c.boosterType !== 'group' && (rx === x || ry === y)));

  const placePieceAt = (x: number, y: number) => {
    const { selectedPieceIndex, hand, grid, score, combo, rngSeed } = gameState, p = hand[selectedPieceIndex!];
    if (p && canPlacePiece(grid, p, x, y)) {
      const ng = grid.map(r => [...r]); p.shape.forEach((q, i) => ng[y + q.y][x + q.x] = { color: p.colors[i], id: `${Date.now()}-${Math.random()}` });
      const nh = [...hand]; nh[selectedPieceIndex!] = null;
      if (nh.every(q => q === null)) { const ac = getAvailableColors(ng), rng = new Random(`${rngSeed}-${score}-${ng.flat().filter(c => c).length}`); nh[0] = generatePiece(rng, ac); nh[1] = generatePiece(rng, ac); nh[2] = generatePiece(rng, ac); }
      const ms = findMatchGroups(ng);
      if (ms.length > 0) {
        const cl = ms.flat(), tl = cl.length, nc = combo + 1, { score: sc, text: tx, multiplier: mu } = calculateScore(tl, nc), ids = cl.map(q => ng[q.y][q.x]!.id), bts: {x: number, y: number, color: Color}[] = [];
        ms.forEach(g => { if (g.length >= 4) { const q = g[Math.floor(Math.random() * g.length)]; bts.push({ x: q.x, y: q.y, color: ng[q.y][q.x]!.color }); } });
        if (boardRef.current) { const r = boardRef.current.getBoundingClientRect(), cs = r.width / GRID_SIZE; cl.forEach(q => spawnParticles(r.left + (q.x * cs) + (cs / 2), r.top + (q.y * cs) + (cs / 2), ng[q.y][q.x]!.color, 6)); if (tx) spawnFloatingText(r.left + (cl.reduce((a, b) => a + b.x, 0) / tl * cs) + (cs / 2), r.top + (cl.reduce((a, b) => a + b.y, 0) / tl * cs) + (cs / 2), `${tx} x${mu}`); }
        triggerShake(); setGameState(prev => ({ ...prev, grid: ng, score: score + sc, hand: nh, selectedPieceIndex: null, clearingTiles: ids.filter(id => !bts.map(bt => ng[bt.y][bt.x]!.id).includes(id)), combo: nc }));
        setTimeout(() => { setGameState(prev => { const fg = prev.grid.map((r, ry) => r.map((c, rx) => { if (!c) return null; const bt = bts.find(b => b.x === rx && b.y === ry); if (bt) return { ...c, isBooster: true, boosterType: tl >= 6 ? 'group' : 'line', id: `booster-${Date.now()}-${Math.random()}` }; return ids.includes(c.id) ? null : c; })); return { ...prev, grid: fg, clearingTiles: [], gameOver: isGameOver(fg, prev.hand) }; }); }, 200);
      } else setGameState(prev => ({ ...prev, grid: ng, score: score + p.shape.length * 10, hand: nh, selectedPieceIndex: null, gameOver: isGameOver(ng, nh), combo: 1 }));
    } else setGameState(prev => ({ ...prev, selectedPieceIndex: null }));
  };

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto p-4 select-none bg-slate-950 overflow-hidden" onPointerMove={handlePointerMove} onPointerUp={stopDragging}>
      {gameState.currentLevel === null ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <h1 className="text-4xl font-black text-center mb-8 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent italic tracking-tighter">LEVEL SELECT</h1>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar"><div className="flex flex-col-reverse gap-4 pb-8">{LEVELS.map(l => (<button key={l.id} onClick={() => startLevel(l.id)} className="bg-slate-900 hover:bg-slate-800 border-2 border-slate-800 p-8 rounded-3xl text-2xl font-black text-white transition-all active:scale-95 shadow-xl">{l.name}</button>))}</div></div>
        </div>
      ) : (
        <>
          <style>{`.board-grid { display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr); } .piece-preview-grid { display: grid; } .drag-preview { position: fixed; pointer-events: none; z-index: 1000; transform: translate(-50%, -50%) scale(1.1); filter: drop-shadow(0 15px 25px rgba(0,0,0,0.5)); } @keyframes shake { 0% { transform: translate(1px, 1px) rotate(0deg); } 10% { transform: translate(-1px, -2px) rotate(-1deg); } 20% { transform: translate(-3px, 0px) rotate(1deg); } 30% { transform: translate(3px, 2px) rotate(0deg); } 40% { transform: translate(1px, -1px) rotate(1deg); } 50% { transform: translate(-1px, 2px) rotate(-1deg); } 60% { transform: translate(-3px, 1px) rotate(0deg); } 70% { transform: translate(3px, 1px) rotate(-1deg); } 80% { transform: translate(-1px, -1px) rotate(1deg); } 90% { transform: translate(1px, 2px) rotate(0deg); } 100% { transform: translate(1px, -2px) rotate(-1deg); } } .shake-animation { animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both; } .custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }`}</style>
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {particles.map(p => (<div key={p.id} style={{ position: 'absolute', left: p.x, top: p.y, width: p.size, height: p.size, backgroundColor: p.color, borderRadius: '4px', opacity: p.life / p.maxLife, transform: `translate(-50%, -50%) rotate(${p.life * 10}deg)` }} />))}
            {floatingTexts.map(t => (<div key={t.id} className="font-black text-2xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ position: 'absolute', left: t.x, top: t.y, opacity: t.life / 20, transform: `translate(-50%, -50%) scale(${1 + (t.maxLife - t.life) * 0.01})`, zIndex: 2000 }}>{t.text}</div>))}
            {flyingSquares.map(s => (<div key={s.id} style={{ position: 'absolute', left: s.startX + (s.endX - s.startX) * s.progress, top: s.startY + (s.endY - s.startY) * s.progress, width: '30px', height: '30px', backgroundColor: s.color, borderRadius: '6px', boxShadow: '0 0 20px ' + s.color, zIndex: 3000, transform: 'translate(-50%, -50%) rotate(' + (s.progress * 360) + 'deg)' }} />))}
          </div>
          <div className="flex justify-between items-end mb-4">
            <div><h1 className="text-3xl font-black bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent italic tracking-tighter">COLORBLAST</h1><div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Level {gameState.currentLevel}</div></div>
            <div className="text-right"><div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Top Score</div><div className="text-2xl font-black text-yellow-500 leading-none">{gameState.highScore}</div></div>
          </div>
          <div className="bg-slate-900 rounded-3xl p-5 mb-6 flex justify-between items-center shadow-xl border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600 opacity-50"></div>
            <div className="flex flex-col"><span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Score</span><span className="text-5xl font-black text-white tracking-tight">{gameState.score}</span></div>
            <div className="flex flex-col items-end"><div className={`text-xl font-black transition-all ${gameState.combo > 1 ? 'text-yellow-400 scale-110' : 'text-slate-700'}`}>x{gameState.combo}</div><span className="text-[8px] uppercase font-bold text-slate-600 tracking-wider">Combo</span></div>
            <button onClick={handleRestart} className="ml-4 bg-slate-800 hover:bg-slate-700 w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 border border-slate-700 shadow-lg"><i className="fa-solid fa-rotate-right text-xl text-blue-400"></i></button>
          </div>
          <div ref={boardRef} className={`relative aspect-square bg-slate-900 rounded-3xl p-1.5 shadow-2xl border border-slate-800 ${isShaking ? 'shake-animation' : ''}`}>
            <div className="board-grid w-full h-full gap-1.5">{gameState.grid.map((row, y) => row.map((cell, x) => { const ghost = isGhostCell(x, y); const onLine = !cell && getIsOnBoosterLine(x, y); return (<div key={`${x}-${y}`} className={`relative rounded-lg transition-all duration-300 ${cell ? 'shadow-[0_4px_10px_rgba(0,0,0,0.3)]' : (onLine ? 'bg-slate-700/40' : 'bg-slate-800/30')} ${!cell ? 'border border-white/5' : ''}`} style={{ backgroundColor: cell?.isBooster ? '#475569' : (cell?.color || (ghost ? ghost.color : undefined)), opacity: ghost ? (ghost.isValid ? 0.7 : 0.15) : 1, transform: gameState.clearingTiles.includes(cell?.id || '') ? 'scale(0) rotate(90deg)' : (ghost && ghost.isValid ? 'scale(0.95)' : 'scale(1)'), boxShadow: cell ? `inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.4)` : 'none', border: cell?.isBooster ? (cell.boosterType === 'group' ? '3px solid #fbbf24' : '3px solid white') : undefined }}>{cell?.isBooster && (<div className="absolute inset-0 flex items-center justify-center animate-pulse"><i className={`fa-solid ${cell.boosterType === 'group' ? 'fa-wand-magic-sparkles text-yellow-400' : 'fa-bolt text-white'} text-xs sm:text-lg`}></i></div>)}{cell && (<div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-lg pointer-events-none" />)}{ghost && !ghost.isValid && (<div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-red-500 rounded-full opacity-60"></div></div>)}</div>); }))}</div>
            {gameState.gameOver && (<div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center z-50"><h2 className="text-4xl font-black mb-1 text-white">GAME OVER</h2><p className="text-slate-400 text-sm mb-8 font-medium">No valid moves left!</p><div className="bg-slate-900 rounded-2xl p-6 w-full mb-8 border border-slate-800"><span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block mb-2">Final Score</span><span className="text-5xl font-black text-white">{gameState.score}</span></div><button onClick={handleRestart} className="bg-blue-600 hover:bg-blue-500 text-white font-black py-4 px-12 rounded-2xl transition-all active:scale-95">PLAY AGAIN</button></div>)}
          </div>
          {dragPosition && gameState.selectedPieceIndex !== null && (<div className="drag-preview" style={{ left: dragPosition.x, top: dragPosition.y - DRAG_OFFSET_Y }}><PiecePreview piece={gameState.hand[gameState.selectedPieceIndex]!} active={true} size="large" /></div>)}
          <div className="mt-4 flex justify-center"><button onClick={() => setGameState(prev => ({ ...prev, currentLevel: null }))} className="bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-2xl text-xs font-bold text-slate-300 transition-all active:scale-95 border border-slate-700">BACK TO LEVELS</button></div>
          <div className="mt-4 flex flex-col gap-6">
            <div className="flex items-center justify-center gap-4"><div className="h-[1px] bg-slate-800 flex-1"></div><h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Next Shapes</h3><div className="h-[1px] bg-slate-800 flex-1"></div></div>
            <div className="flex justify-around items-center gap-3 h-24 sm:h-32">
              {gameState.hand.map((p, i) => (<div key={p?.id || `empty-${i}`} onPointerDown={e => startDragging(e, i)} className={`flex-1 h-full bg-slate-900 rounded-3xl flex items-center justify-center p-3 border-2 transition-all duration-300 relative touch-none ${gameState.selectedPieceIndex === i ? 'border-blue-500/50 bg-blue-500/5 opacity-30' : 'border-slate-800 hover:border-slate-700 cursor-grab'} ${p === null ? 'opacity-0 scale-90 pointer-events-none' : ''}`}>{p && <PiecePreview piece={p} active={false} />}</div>))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const PiecePreview: React.FC<{ piece: PieceData, active: boolean, size?: 'small' | 'large' }> = ({ piece, active, size = 'small' }) => {
  const minX = Math.min(...piece.shape.map(p => p.x)), maxX = Math.max(...piece.shape.map(p => p.x)), minY = Math.min(...piece.shape.map(p => p.y)), maxY = Math.max(...piece.shape.map(p => p.y)), w = maxX - minX + 1, h = maxY - minY + 1, b = size === 'large' ? 'w-10 h-10' : 'w-4 h-4 sm:w-6 sm:h-6';
  return (<div className="piece-preview-grid gap-1" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, gridTemplateRows: `repeat(${h}, 1fr)`, width: 'auto', maxHeight: '100%', maxWidth: '100%' }}>{Array.from({ length: w * h }).map((_, i) => { const x = minX + (i % w), y = minY + Math.floor(i / w), idx = piece.shape.findIndex(q => q.x === x && q.y === y); return (<div key={i} className={`${b} rounded-lg transition-all duration-200 ${idx !== -1 ? 'shadow-md' : 'bg-transparent'}`} style={{ backgroundColor: idx !== -1 ? piece.colors[idx] : 'transparent', boxShadow: idx !== -1 ? 'inset 0 1px 3px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)' : 'none' }} />); })}</div>);
};

export default App;
