import {
  DEFAULT_HERO_CONFIG,
  GAME_SAVE_STORAGE_KEY,
  HeroConfig,
  migrateHeroConfig,
} from './Constants';
import { DEFAULT_WORLD_SEED } from './worldMath';

export type GameFlowState = 'WELCOME' | 'CHARACTER_CREATOR' | 'GAMEPLAY';

export interface FullscreenLandscapeResult {
  fullscreen: boolean;
  orientationLocked: boolean;
  isPortrait: boolean;
}

export interface SavedHeroPreview {
  hasSave: boolean;
  heroName: string;
  seed: string;
  heroConfig: HeroConfig;
}

type FullscreenDocumentElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type OrientationWithLock = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait' | 'landscape-primary' | 'landscape-secondary') => Promise<void>;
};

/**
 * Solicita pantalla completa y bloqueo de orientación horizontal.
 * Debe ejecutarse estrictamente dentro del handler de gesto del usuario ("Comenzar").
 * Si el navegador o el entorno iframe bloquean alguna de las APIs, continúa sin romper la experiencia.
 */
export async function enterFullscreenLandscape(): Promise<FullscreenLandscapeResult> {
  let fullscreen = false;
  let orientationLocked = false;

  if (typeof document !== 'undefined') {
    const el = document.documentElement as FullscreenDocumentElement;
    try {
      if (document.fullscreenElement) {
        fullscreen = true;
      } else if (typeof el.requestFullscreen === 'function') {
        await el.requestFullscreen();
        fullscreen = Boolean(document.fullscreenElement);
      } else if (typeof el.webkitRequestFullscreen === 'function') {
        await el.webkitRequestFullscreen();
        fullscreen = true;
      }
    } catch (err) {
      console.warn('Fullscreen no disponible:', err);
    }
  }

  if (typeof screen !== 'undefined') {
    const orientation = screen.orientation as OrientationWithLock | undefined;
    if (orientation && typeof orientation.lock === 'function') {
      try {
        await orientation.lock('landscape');
        orientationLocked = true;
      } catch (err) {
        console.warn('Orientation lock no soportado:', err);
      }
    }
  }

  const isPortrait =
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false;

  return { fullscreen, orientationLocked, isPortrait };
}

export function hasSavedAdventure(): boolean {
  try {
    return Boolean(localStorage.getItem(GAME_SAVE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function readSavedHeroPreview(): SavedHeroPreview {
  try {
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    if (!raw) {
      return {
        hasSave: false,
        heroName: 'Aelion',
        seed: DEFAULT_WORLD_SEED,
        heroConfig: { ...DEFAULT_HERO_CONFIG },
      };
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return {
        hasSave: false,
        heroName: 'Aelion',
        seed: DEFAULT_WORLD_SEED,
        heroConfig: { ...DEFAULT_HERO_CONFIG },
      };
    }
    return {
      hasSave: true,
      heroName: typeof data.heroName === 'string' && data.heroName.trim() ? data.heroName : 'Aelion',
      seed: typeof data.seed === 'string' && data.seed.trim() ? data.seed : DEFAULT_WORLD_SEED,
      heroConfig: migrateHeroConfig(data.heroConfig),
    };
  } catch {
    return {
      hasSave: false,
      heroName: 'Aelion',
      seed: DEFAULT_WORLD_SEED,
      heroConfig: { ...DEFAULT_HERO_CONFIG },
    };
  }
}

/**
 * Secuencia estricta de estados del flujo del juego:
 * WELCOME -> CHARACTER_CREATOR -> GAMEPLAY
 * Cada estado bloquea el avance hacia el siguiente hasta completarse.
 */
export class GameFlowManager {
  private state: GameFlowState = 'WELCOME';
  private listeners = new Set<(state: GameFlowState) => void>();

  constructor(initialState: GameFlowState = 'WELCOME') {
    this.state = initialState;
  }

  public getState(): GameFlowState {
    return this.state;
  }

  public canEnterCharacterCreator(): boolean {
    return this.state === 'WELCOME';
  }

  public canEnterGameplay(): boolean {
    return this.state === 'CHARACTER_CREATOR';
  }

  public advanceToCharacterCreator(): boolean {
    if (this.state !== 'WELCOME') return false;
    this.state = 'CHARACTER_CREATOR';
    this.notify();
    return true;
  }

  public advanceToGameplay(): boolean {
    if (this.state !== 'CHARACTER_CREATOR') return false;
    this.state = 'GAMEPLAY';
    this.notify();
    return true;
  }

  public subscribe(listener: (state: GameFlowState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
