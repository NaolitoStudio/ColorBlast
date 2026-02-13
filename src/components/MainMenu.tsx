import React from 'react';
import { useTheme, ResponsiveNineSlicePanel } from '../theme';

interface MainMenuProps {
  onPlay: () => void;
  lives: number;
  coins: number;
  stars: number;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onPlay, lives, coins, stars }) => {
  const theme = useTheme();
  const backgroundImageSrc = theme.background('bg_game');

  return (
    <div 
      className="fixed inset-0 flex flex-col items-center justify-between p-6 z-[150] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${backgroundImageSrc})` }}
    >
      {/* Top Bar */}
      <div className="w-full flex justify-between items-center gap-4 max-w-md">
        {/* Lives */}
        <div className="flex items-center gap-2 bg-black/40 rounded-full px-4 py-2 border border-white/20">
          <span className="text-xl">❤️</span>
          <span className="text-white font-black text-lg">{lives}</span>
        </div>

        {/* Coins */}
        <div className="flex items-center gap-2 bg-black/40 rounded-full px-4 py-2 border border-white/20">
          <span className="text-xl">💰</span>
          <span className="text-white font-black text-lg">{coins}</span>
        </div>

        {/* Stars */}
        <div className="flex items-center gap-2 bg-black/40 rounded-full px-4 py-2 border border-white/20">
          <span className="text-xl">⭐</span>
          <span className="text-white font-black text-lg">{stars}</span>
        </div>
      </div>

      {/* Middle Content (Logo/Title could go here) */}
      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-6xl font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] text-center">
          COLOR<br />BLAST
        </h1>
      </div>

      {/* Play Button at Bottom */}
      <div className="w-full max-w-xs mb-12">
        <button
          onClick={onPlay}
          className="w-full transition-transform active:scale-95"
        >
          <ResponsiveNineSlicePanel
            src={theme.panel('button_primary')}
            {...theme.config('button_primary')}
            widthPercent={100}
            className="py-6 flex items-center justify-center"
          >
            <span className="text-4xl font-black text-white uppercase tracking-wider drop-shadow-md">
              PLAY
            </span>
          </ResponsiveNineSlicePanel>
        </button>
      </div>
    </div>
  );
};
