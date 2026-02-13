import React, { useState } from 'react';
import { MainMenu } from './src/components/MainMenu';
import { Game } from './src/components/Game';

type Screen = 'menu' | 'game';

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('menu');
  
  // These would typically come from a global state or localStorage
  const [stats, setStats] = useState({
    lives: 5,
    coins: 100,
    stars: 25
  });

  const handlePlay = () => {
    setScreen('game');
  };

  const handleBackToMenu = () => {
    setScreen('menu');
  };

  return (
    <div className="w-full h-full">
      {screen === 'menu' ? (
        <MainMenu 
          onPlay={handlePlay} 
          lives={stats.lives} 
          coins={stats.coins} 
          stars={stats.stars} 
        />
      ) : (
        <Game />
      )}
    </div>
  );
};

export default App;
