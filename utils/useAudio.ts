import { useRef, useCallback, useEffect } from 'react';

// Sound paths
const SOUNDS = {
  // UI
  click: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Click sound 36.wav',
  selectPiece: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Click sound 36.wav',

  // Whooshes
  pieceReturn: '/Assets/Sound/SFX/Other/742832__sadiquecat__woosh-metal-tea-strainer-1.wav',
  blocksIncoming: '/Assets/Sound/SFX/Other/742832__sadiquecat__woosh-metal-tea-strainer-1.wav',

  // Gameplay
  placePiece: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Pop sound 3.wav',
  match: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Pop sound 8.wav',

  // Combos (all use same pop sound)
  combo2: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Pop sound 8.wav',
  combo3: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Pop sound 8.wav',
  combo4: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Pop sound 8.wav',
  combo5: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Pop sound 8.wav',

  // Boosters
  createBooster: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Powerup upgrade 8.wav',
  activateBooster: '/Assets/Sound/SFX/Other/477162__sieuamthanh__beam-8.wav',
  superballCharge: '/Assets/Sound/SFX/Other/588242__magnuswaker__laser-charge-up.wav',
  superball: '/Assets/Sound/SFX/Other/477162__sieuamthanh__beam-8.wav',

  // Game states
  levelComplete: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Win sound 5.wav',
  gameOver: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Lost sound 8.wav',
  allClear: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Win sound 12.wav',

  // Misc
  unlock: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Coins 8.wav',
  trash: '/Assets/Sound/SFX/Ui & Item Sounds - HD Remake/Debuff Downgrade 20.wav',

  // Music
  bgMusic: '/Assets/Sound/Music/MouseTowerCards.mp3',
} as const;

type SoundName = keyof typeof SOUNDS;

interface AudioManager {
  play: (sound: SoundName, volume?: number) => void;
  playCombo: (comboLevel: number) => void;
  startMusic: () => void;
  stopMusic: () => void;
  toggleMusic: () => boolean;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  isMusicPlaying: () => boolean;
}

export function useAudio(): AudioManager {
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxVolumeRef = useRef(0.5);
  const musicVolumeRef = useRef(0.15);
  const musicPlayingRef = useRef(false);

  // Preload sounds
  useEffect(() => {
    Object.entries(SOUNDS).forEach(([key, path]) => {
      if (key !== 'bgMusic') {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audioCache.current.set(path, audio);
      }
    });

    // Setup music
    musicRef.current = new Audio(SOUNDS.bgMusic);
    musicRef.current.loop = true;
    musicRef.current.volume = musicVolumeRef.current;

    return () => {
      musicRef.current?.pause();
      audioCache.current.clear();
    };
  }, []);

  const play = useCallback((sound: SoundName, volume?: number, playbackRate?: number) => {
    const path = SOUNDS[sound];
    if (!path || sound === 'bgMusic') return;

    // DEBUG: Log sound being played
    console.log(`🔊 [AUDIO] Playing: "${sound}" -> ${path.split('/').pop()}`);

    // Clone audio for overlapping sounds
    const cached = audioCache.current.get(path);
    if (cached) {
      const audio = cached.cloneNode() as HTMLAudioElement;
      audio.volume = volume ?? sfxVolumeRef.current;
      if (playbackRate) audio.playbackRate = playbackRate;
      audio.play().catch(() => {});
    }
  }, []);

  const playCombo = useCallback((comboLevel: number) => {
    if (comboLevel <= 1) {
      play('match');
    } else if (comboLevel === 2) {
      play('combo2');
    } else if (comboLevel === 3) {
      play('combo3');
    } else if (comboLevel === 4) {
      play('combo4');
    } else {
      play('combo5');
    }
  }, [play]);

  const startMusic = useCallback(() => {
    if (musicRef.current && !musicPlayingRef.current) {
      musicRef.current.volume = musicVolumeRef.current;
      musicRef.current.play().catch(() => {});
      musicPlayingRef.current = true;
    }
  }, []);

  const stopMusic = useCallback(() => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
      musicPlayingRef.current = false;
    }
  }, []);

  const toggleMusic = useCallback(() => {
    if (musicPlayingRef.current) {
      stopMusic();
    } else {
      startMusic();
    }
    return musicPlayingRef.current;
  }, [startMusic, stopMusic]);

  const setMusicVolume = useCallback((volume: number) => {
    musicVolumeRef.current = Math.max(0, Math.min(1, volume));
    if (musicRef.current) {
      musicRef.current.volume = musicVolumeRef.current;
    }
  }, []);

  const setSfxVolume = useCallback((volume: number) => {
    sfxVolumeRef.current = Math.max(0, Math.min(1, volume));
  }, []);

  const isMusicPlaying = useCallback(() => musicPlayingRef.current, []);

  return {
    play,
    playCombo,
    startMusic,
    stopMusic,
    toggleMusic,
    setMusicVolume,
    setSfxVolume,
    isMusicPlaying,
  };
}

export type { SoundName, AudioManager };
