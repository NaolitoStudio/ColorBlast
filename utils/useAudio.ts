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
  preload: (sound: SoundName | SoundName[]) => Promise<void>;
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
  const preloadPromises = useRef<Map<string, Promise<void>>>(new Map());
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxVolumeRef = useRef(0.5);
  const musicVolumeRef = useRef(0.15);
  const musicPlayingRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  const pendingBlockedRef = useRef<Array<{
    sound: SoundName;
    volume?: number;
    playbackRate?: number;
    requestedAt: number;
  }>>([]);

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

  useEffect(() => {
    const MAX_REPLAY_AGE_MS = 1200;

    const replayPending = () => {
      audioUnlockedRef.current = true;
      if (pendingBlockedRef.current.length === 0) return;

      const now = Date.now();
      const pending = pendingBlockedRef.current;
      pendingBlockedRef.current = [];

      pending
        .filter((entry) => (now - entry.requestedAt) <= MAX_REPLAY_AGE_MS)
        .forEach((entry) => {
          const path = SOUNDS[entry.sound];
          if (!path || entry.sound === 'bgMusic') return;
          const base = audioCache.current.get(path);
          if (!base) return;

          const targetVolume = entry.volume ?? sfxVolumeRef.current;
          const clone = base.cloneNode() as HTMLAudioElement;
          clone.volume = targetVolume;
          if (entry.playbackRate) clone.playbackRate = entry.playbackRate;
          clone.play().catch(() => {});
        });
    };

    window.addEventListener('pointerdown', replayPending, { passive: true });
    window.addEventListener('keydown', replayPending, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', replayPending);
      window.removeEventListener('keydown', replayPending);
    };
  }, []);

  const ensureSoundReady = useCallback((sound: SoundName): Promise<void> => {
    const path = SOUNDS[sound];
    if (!path || sound === 'bgMusic') return Promise.resolve();

    const existing = preloadPromises.current.get(path);
    if (existing) return existing;

    const promise = new Promise<void>((resolve) => {
      let base = audioCache.current.get(path);
      if (!base) {
        base = new Audio(path);
        base.preload = 'auto';
        audioCache.current.set(path, base);
      }

      if (base.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
        return;
      }

      const finish = () => resolve();
      base.addEventListener('canplaythrough', finish, { once: true });
      base.addEventListener('loadeddata', finish, { once: true });
      base.addEventListener('error', finish, { once: true });
      base.load();
    });

    preloadPromises.current.set(path, promise);
    return promise;
  }, []);

  const preload = useCallback(async (sound: SoundName | SoundName[]) => {
    const sounds = Array.isArray(sound) ? sound : [sound];
    await Promise.all(sounds.map((name) => ensureSoundReady(name)));
  }, [ensureSoundReady]);

  const play = useCallback((sound: SoundName, volume?: number, playbackRate?: number) => {
    const path = SOUNDS[sound];
    if (!path || sound === 'bgMusic') return;

    // DEBUG: Log sound being played
    console.log(`🔊 [AUDIO] Playing: "${sound}" -> ${path.split('/').pop()}`);

    // Clone audio for overlapping sounds.
    let base = audioCache.current.get(path);
    if (!base) {
      base = new Audio(path);
      base.preload = 'auto';
      audioCache.current.set(path, base);
    }

    // Prevent very-late delayed playback when the media is still loading.
    // Callers that need guaranteed timing should preload first.
    if (base.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      void ensureSoundReady(sound);
      return;
    }

    const targetVolume = volume ?? sfxVolumeRef.current;

    // Use clones for consistent overlap behavior across all SFX.
    const clone = base.cloneNode() as HTMLAudioElement;
    clone.volume = targetVolume;
    if (playbackRate) clone.playbackRate = playbackRate;
    clone.play()
      .then(() => {
        audioUnlockedRef.current = true;
      })
      .catch((error: unknown) => {
        const errName = typeof error === 'object' && error !== null && 'name' in error
          ? String((error as { name?: string }).name)
          : '';
        const errMsg = typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : '';
        const blockedByAutoplay = errName === 'NotAllowedError' || /notallowed/i.test(errMsg);

        if (blockedByAutoplay && !audioUnlockedRef.current) {
          pendingBlockedRef.current.push({
            sound,
            volume,
            playbackRate,
            requestedAt: Date.now()
          });
          return;
        }
      });
  }, [ensureSoundReady]);

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
    preload,
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
