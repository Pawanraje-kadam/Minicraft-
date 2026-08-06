import { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from './game/engine';
import { GameState, ALL_BLOCK_TYPES } from './game/types';
import { World } from './game/world';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    isPaused: false,
    isStartScreen: true,
    isGameOver: false,
    score: 0,
    blocksPlaced: 0,
    blocksRemoved: 0,
    selectedBlockIndex: 0,
    gravityEnabled: false,
    fps: 60,
  });
  const [highScores, setHighScores] = useState<number[]>(World.getHighScores());
  const [showHelp, setShowHelp] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => setNotification(null), 2000);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;
    
    engine.onStateChange = (state) => {
      setGameState({ ...state });
    };

    engine.start();

    return () => {
      engine.stop();
    };
  }, []);

  const handleStartNew = () => {
    engineRef.current?.startGame(false);
  };

  const handleLoadSave = () => {
    engineRef.current?.startGame(true);
  };

  const handleResume = () => {
    if (engineRef.current) {
      engineRef.current.state.isPaused = false;
      engineRef.current.onStateChange?.(engineRef.current.state);
      canvasRef.current?.requestPointerLock();
    }
  };

  const handleSave = () => {
    engineRef.current?.saveWorld();
    showNotif('💾 World saved!');
  };

  const handleClear = () => {
    engineRef.current?.clearWorld();
    showNotif('🗑️ World cleared!');
  };

  const handleSelectBlock = (idx: number) => {
    if (engineRef.current) {
      engineRef.current.state.selectedBlockIndex = idx;
      engineRef.current.onStateChange?.(engineRef.current.state);
    }
  };

  const handleMobilePlace = () => {
    engineRef.current?.placeBlock();
  };

  const handleMobileRemove = () => {
    engineRef.current?.removeTargetBlock();
  };

  const hasSave = typeof window !== 'undefined' && localStorage.getItem('minicraft_world') !== null;
  const isMobile = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const selectedBlock = ALL_BLOCK_TYPES[gameState.selectedBlockIndex];

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* ======== START SCREEN ======== */}
      {gameState.isStartScreen && (
        <div className="absolute inset-0 flex items-center justify-center z-50">
          {/* Background overlay with gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/80" />
          
          <div className="relative text-center px-6 max-w-lg w-full">
            {/* Title */}
            <div className="mb-10">
              <div className="inline-block mb-3 animate-bounce" style={{ animationDuration: '2s' }}>
                <span className="text-5xl">⛏️</span>
              </div>
              <h1 
                className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight mb-3 leading-none"
                style={{
                  background: 'linear-gradient(180deg, #7BC74D 0%, #4A8C2A 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(3px 4px 0 #2a5c10)',
                }}
              >
                MINICRAFT
              </h1>
              <p className="text-gray-400 text-base sm:text-lg tracking-wide">
                3D Block Building Sandbox
              </p>
            </div>

            {/* Buttons */}
            <div className="space-y-3 mb-8">
              <button
                onClick={handleStartNew}
                className="group w-full py-4 px-8 bg-gradient-to-b from-green-500 to-green-700 hover:from-green-400 hover:to-green-600 text-white font-bold text-lg sm:text-xl rounded-xl transition-all duration-150 hover:scale-[1.03] active:scale-95 shadow-lg shadow-green-900/60 border border-green-400/30"
              >
                <span className="mr-2">🌍</span> New World
              </button>
              {hasSave && (
                <button
                  onClick={handleLoadSave}
                  className="w-full py-4 px-8 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white font-bold text-lg sm:text-xl rounded-xl transition-all duration-150 hover:scale-[1.03] active:scale-95 shadow-lg shadow-blue-900/60 border border-blue-400/30"
                >
                  <span className="mr-2">📂</span> Load Save
                </button>
              )}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="w-full py-3 px-8 bg-white/10 hover:bg-white/20 text-gray-300 font-semibold text-base rounded-xl transition-all duration-150 border border-white/10"
              >
                <span className="mr-2">{showHelp ? '✕' : '❓'}</span> {showHelp ? 'Hide' : 'Controls'}
              </button>
            </div>

            {/* Controls Help */}
            {showHelp && (
              <div className="bg-black/60 backdrop-blur-md rounded-xl p-5 text-left text-sm text-gray-300 mb-6 border border-white/10 max-h-52 overflow-y-auto">
                <h3 className="font-bold text-white mb-3 text-base">🎮 Controls</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">WASD</span><span>Move</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">Mouse</span><span>Look around</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">Space</span><span>Fly up</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">Shift</span><span>Fly down</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">LClick</span><span>Break block</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">RClick</span><span>Place block</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">1-9</span><span>Select block</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">Scroll</span><span>Cycle blocks</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">G</span><span>Toggle gravity</span>
                  <span className="text-gray-500 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">Esc</span><span>Pause</span>
                </div>
                {isMobile && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <h4 className="font-bold text-white mb-2">📱 Mobile</h4>
                    <p>Left half: drag to move • Right half: drag to look</p>
                    <p>Use on-screen buttons to place/break blocks</p>
                  </div>
                )}
              </div>
            )}

            {/* High Scores */}
            {highScores.length > 0 && (
              <div className="bg-black/40 backdrop-blur-sm rounded-xl p-4 border border-yellow-400/20">
                <h3 className="text-yellow-400 font-bold mb-2 text-sm">🏆 Best Sessions</h3>
                <div className="flex flex-wrap gap-2 justify-center">
                  {highScores.slice(0, 5).map((score, i) => (
                    <span key={i} className={`px-3 py-1 rounded-lg text-sm font-mono ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-white/5 text-gray-400'
                    }`}>
                      #{i + 1} {score}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-gray-600 text-xs mt-6">Click to capture mouse • Built with Three.js</p>
          </div>
        </div>
      )}

      {/* ======== PAUSE MENU ======== */}
      {gameState.isPaused && !gameState.isStartScreen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="text-center px-6 max-w-md w-full">
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-2">⏸ PAUSED</h2>
            <div className="flex justify-center gap-4 mb-6 text-sm text-gray-400">
              <span>⭐ {gameState.score}</span>
              <span>🔨 {gameState.blocksPlaced}</span>
              <span>⛏ {gameState.blocksRemoved}</span>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleResume}
                className="w-full py-3.5 px-8 bg-gradient-to-b from-green-500 to-green-700 hover:from-green-400 hover:to-green-600 text-white font-bold text-lg rounded-xl transition-all hover:scale-[1.03] active:scale-95 shadow-lg border border-green-400/30"
              >
                ▶️ Resume
              </button>
              <button
                onClick={handleSave}
                className="w-full py-3 px-8 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white font-bold text-lg rounded-xl transition-all hover:scale-[1.03] active:scale-95 shadow-lg border border-blue-400/30"
              >
                💾 Save World
              </button>
              <button
                onClick={handleClear}
                className="w-full py-3 px-8 bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 text-white font-bold text-lg rounded-xl transition-all hover:scale-[1.03] active:scale-95 shadow-lg border border-red-400/30"
              >
                🗑️ Clear World
              </button>
              <button
                onClick={() => {
                  if (engineRef.current) {
                    World.saveHighScore(gameState.score);
                    setHighScores(World.getHighScores());
                    engineRef.current.state.isStartScreen = true;
                    engineRef.current.state.isPaused = false;
                    engineRef.current.onStateChange?.(engineRef.current.state);
                  }
                }}
                className="w-full py-3 px-8 bg-white/10 hover:bg-white/20 text-gray-300 font-semibold text-base rounded-xl transition-all border border-white/10"
              >
                🏠 Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======== IN-GAME HUD ======== */}
      {!gameState.isStartScreen && !gameState.isPaused && (
        <>
          {/* Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <svg width="24" height="24" viewBox="0 0 24 24" className="opacity-70">
              <line x1="12" y1="4" x2="12" y2="10" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="14" x2="12" y2="20" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="4" y1="12" x2="10" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="14" y1="12" x2="20" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="1.5" fill="white" />
            </svg>
          </div>

          {/* Top-left HUD */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-md rounded-xl px-4 py-3 text-white space-y-1 border border-white/5">
              <div className="text-yellow-300 font-bold text-lg leading-tight">⭐ {gameState.score}</div>
              <div className="text-xs text-gray-400 flex items-center gap-3">
                <span>🧱 {engineRef.current?.world.getBlockCount() || 0}</span>
                <span className="text-gray-600">|</span>
                <span>{gameState.fps} FPS</span>
              </div>
              <div className={`text-xs font-medium ${gameState.gravityEnabled ? 'text-orange-400' : 'text-cyan-400'}`}>
                {gameState.gravityEnabled ? '🚶 Gravity' : '🕊️ Flying'} <span className="text-gray-500 font-normal">[G]</span>
              </div>
            </div>
          </div>

          {/* Top right actions */}
          <div className="absolute top-3 right-3 z-20 flex gap-2 pointer-events-auto">
            <button
              onClick={handleSave}
              className="bg-black/40 backdrop-blur-md text-white px-3 py-2 rounded-lg text-xs hover:bg-black/60 transition-colors border border-white/10"
            >
              💾
            </button>
            <button
              onClick={() => {
                if (engineRef.current) {
                  engineRef.current.state.isPaused = true;
                  engineRef.current.onStateChange?.(engineRef.current.state);
                  document.exitPointerLock();
                }
              }}
              className="bg-black/40 backdrop-blur-md text-white px-3 py-2 rounded-lg text-xs hover:bg-black/60 transition-colors border border-white/10"
            >
              ⏸
            </button>
          </div>

          {/* Selected block name */}
          <div className="absolute bottom-[88px] sm:bottom-[96px] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-md rounded-lg px-4 py-1.5 text-white text-sm font-medium border border-white/5">
              {selectedBlock.emoji} {selectedBlock.name}
            </div>
          </div>

          {/* Hotbar */}
          <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
            <div className="flex gap-0.5 sm:gap-1 bg-black/60 backdrop-blur-md rounded-xl p-1 sm:p-1.5 border border-white/10">
              {ALL_BLOCK_TYPES.map((block, idx) => {
                const isSelected = idx === gameState.selectedBlockIndex;
                return (
                  <button
                    key={block.type}
                    onClick={() => handleSelectBlock(idx)}
                    className={`
                      relative flex items-center justify-center rounded-lg transition-all duration-100
                      ${isSelected
                        ? 'scale-110 z-10'
                        : 'hover:bg-white/10'
                      }
                    `}
                    style={{
                      width: window.innerWidth < 640 ? '40px' : '48px',
                      height: window.innerWidth < 640 ? '40px' : '48px',
                    }}
                    title={`${block.name} (${idx + 1})`}
                  >
                    {isSelected && (
                      <div className="absolute inset-0 rounded-lg border-2 border-white bg-white/15 shadow-[0_0_12px_rgba(255,255,255,0.25)]" />
                    )}
                    <div
                      className="rounded relative z-10"
                      style={{
                        width: window.innerWidth < 640 ? '28px' : '34px',
                        height: window.innerWidth < 640 ? '28px' : '34px',
                        background: `linear-gradient(135deg, #${block.color.toString(16).padStart(6, '0')} 0%, #${block.sideColor.toString(16).padStart(6, '0')} 60%, #${block.bottomColor.toString(16).padStart(6, '0')} 100%)`,
                        opacity: block.opacity < 1 ? 0.65 : 1,
                        border: '1px solid rgba(255,255,255,0.18)',
                        boxShadow: isSelected
                          ? 'inset 0 -3px 5px rgba(0,0,0,0.35), inset 0 2px 4px rgba(255,255,255,0.12), 0 0 8px rgba(255,255,255,0.15)'
                          : 'inset 0 -2px 4px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.06)',
                      }}
                    />
                    {idx < 9 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-black/60 text-gray-500 text-[9px] w-3.5 h-3.5 rounded flex items-center justify-center font-mono z-20">
                        {idx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile Controls */}
          {isMobile && (
            <>
              {/* Place/Break buttons */}
              <div className="absolute bottom-28 right-3 z-20 flex flex-col gap-2.5 pointer-events-auto">
                <button
                  onTouchStart={(e) => { e.preventDefault(); handleMobilePlace(); }}
                  className="w-14 h-14 rounded-2xl bg-green-500/70 backdrop-blur-sm text-white text-xl font-bold flex items-center justify-center active:scale-90 active:bg-green-400/80 transition-all shadow-lg border border-green-400/30"
                >
                  ➕
                </button>
                <button
                  onTouchStart={(e) => { e.preventDefault(); handleMobileRemove(); }}
                  className="w-14 h-14 rounded-2xl bg-red-500/70 backdrop-blur-sm text-white text-xl font-bold flex items-center justify-center active:scale-90 active:bg-red-400/80 transition-all shadow-lg border border-red-400/30"
                >
                  ⛏️
                </button>
              </div>
              
              {/* Fly up/down */}
              <div className="absolute bottom-28 left-3 z-20 flex flex-col gap-2.5 pointer-events-auto">
                <button
                  onTouchStart={(e) => { e.preventDefault(); engineRef.current?.player.keys.add(' '); }}
                  onTouchEnd={() => engineRef.current?.player.keys.delete(' ')}
                  className="w-12 h-12 rounded-2xl bg-cyan-500/50 backdrop-blur-sm text-white text-lg flex items-center justify-center active:scale-90 transition-all border border-cyan-400/20"
                >
                  ▲
                </button>
                <button
                  onTouchStart={(e) => { e.preventDefault(); engineRef.current?.player.keys.add('shift'); }}
                  onTouchEnd={() => engineRef.current?.player.keys.delete('shift')}
                  className="w-12 h-12 rounded-2xl bg-cyan-500/50 backdrop-blur-sm text-white text-lg flex items-center justify-center active:scale-90 transition-all border border-cyan-400/20"
                >
                  ▼
                </button>
              </div>

              {/* Touch joystick overlay hint */}
              <div className="absolute bottom-1 left-3 z-10 pointer-events-none">
                <span className="text-white/20 text-[10px]">← Drag to move</span>
              </div>
              <div className="absolute bottom-1 right-3 z-10 pointer-events-none">
                <span className="text-white/20 text-[10px]">Drag to look →</span>
              </div>
            </>
          )}

          {/* Notification toast */}
          {notification && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none" style={{
              animation: 'slideDown 0.3s ease-out'
            }}>
              <div className="bg-emerald-600/90 backdrop-blur-md text-white px-6 py-2.5 rounded-full font-bold shadow-xl border border-emerald-400/30 text-sm">
                {notification}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
