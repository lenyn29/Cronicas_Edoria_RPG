import {
  ClothColorId,
  HairColorId,
  HairStyleId,
  HeroGender,
  PALETTE_32,
  SkinToneId,
} from './core/Palette';
import { GearStyle } from './types';

// Configuración pura del héroe personalizable (compartida entre Creador y Mundo)
export interface HeroConfig {
  gender: HeroGender;
  skinTone: SkinToneId;
  hairColor: HairColorId;
  clothColor: ClothColorId;
  hairStyle: HairStyleId;
}

export const DEFAULT_HERO_CONFIG: HeroConfig = {
  gender: 'male',
  skinTone: 'medium',
  hairColor: 'brown',
  clothColor: 'green',
  hairStyle: 'messy',
};

export const HERO_SAVE_VERSION = 2;
export const GAME_SAVE_STORAGE_KEY = 'eldoria_save_v2';

// Migración segura de configuraciones antiguas de héroe en localStorage
export function migrateHeroConfig(saved?: Partial<HeroConfig> | null): HeroConfig {
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_HERO_CONFIG };
  const validGenders: HeroGender[] = ['male', 'female'];
  const validSkins: SkinToneId[] = ['light', 'medium', 'tan', 'brown', 'dark'];
  const validHairs: HairColorId[] = ['black', 'brown', 'blonde', 'red', 'white', 'blue'];
  const validCloths: ClothColorId[] = ['green', 'blue', 'red', 'purple', 'brown', 'gray'];
  const validStyles: HairStyleId[] = ['messy', 'short', 'long', 'bald'];

  return {
    gender: validGenders.includes(saved.gender as HeroGender) ? (saved.gender as HeroGender) : DEFAULT_HERO_CONFIG.gender,
    skinTone: validSkins.includes(saved.skinTone as SkinToneId)
      ? (saved.skinTone as SkinToneId)
      : DEFAULT_HERO_CONFIG.skinTone,
    hairColor: validHairs.includes(saved.hairColor as HairColorId)
      ? (saved.hairColor as HairColorId)
      : DEFAULT_HERO_CONFIG.hairColor,
    clothColor: validCloths.includes(saved.clothColor as ClothColorId)
      ? (saved.clothColor as ClothColorId)
      : DEFAULT_HERO_CONFIG.clothColor,
    hairStyle: validStyles.includes(saved.hairStyle as HairStyleId)
      ? (saved.hairStyle as HairStyleId)
      : DEFAULT_HERO_CONFIG.hairStyle,
  };
}

// Paleta por defecto para el Héroe Vagabundo procedural (Zelda clásico PaletteActor)
export const HERO_PALETTE = {
  SKIN_BASE: PALETTE_32.PIEL_MEDIA,
  SKIN_SHADOW: 0xc27f55,
  CLOTH_BASE: PALETTE_32.TELA_VERDE,
  CLOTH_SHADOW: 0x22784d,
  HAIR_BASE: 0x7a4424,
  HAIR_SHADOW: 0x4a2611,
  OUTLINE: 0x000000,
  DIRT: PALETTE_32.TIERRA,
  EYE_DARK: 0x000000,
} as const;

// Paletas procedurales para el equipo equipado sobre el esqueleto del héroe
export const GEAR_SHADER_PALETTES: Record<
  GearStyle,
  { base: number; shadow: number; trim: number; trimShadow: number; accent: number }
> = {
  basic: {
    base: PALETTE_32.ACERO_CLARO,
    shadow: PALETTE_32.ACERO_OSCURO,
    trim: PALETTE_32.CORTEZA,
    trimShadow: PALETTE_32.TIERRA,
    accent: PALETTE_32.BLANCO_CALIDO,
  },
  rock: {
    base: PALETTE_32.ROCA_CLARA,
    shadow: PALETTE_32.ROCA_OSCURA,
    trim: PALETTE_32.BRONCE,
    trimShadow: PALETTE_32.TIERRA,
    accent: PALETTE_32.BLANCO_CALIDO,
  },
  bronze: {
    base: PALETTE_32.BRONCE,
    shadow: PALETTE_32.CORTEZA,
    trim: PALETTE_32.ORO,
    trimShadow: PALETTE_32.HIERBA_SECA,
    accent: PALETTE_32.BLANCO_CALIDO,
  },
  crimson: {
    base: PALETTE_32.LAVA,
    shadow: PALETTE_32.TELA_ROJA,
    trim: PALETTE_32.ORO,
    trimShadow: PALETTE_32.BRONCE,
    accent: PALETTE_32.CRISTAL_ROSA,
  },
  glacial: {
    base: PALETTE_32.ARCANO_CIAN,
    shadow: PALETTE_32.TELA_AZUL,
    trim: PALETTE_32.HIELO,
    trimShadow: PALETTE_32.AGUA_CLARA,
    accent: PALETTE_32.BLANCO_CALIDO,
  },
  obsidian: {
    base: PALETTE_32.TELA_PURPURA,
    shadow: PALETTE_32.CENIZA_OSCURA,
    trim: PALETTE_32.BRASA,
    trimShadow: PALETTE_32.LAVA,
    accent: PALETTE_32.ORO,
  },
};

// Dimensiones anatómicas y de colisión del héroe (en unidades de mundo)
export const HERO_DIMENSIONS = {
  TOTAL_HEIGHT: 1.56,
  TORSO_WIDTH: 0.44,
  TORSO_HEIGHT: 0.48,
  TORSO_DEPTH: 0.17,
  HEAD_RADIUS_X: 0.21,
  HEAD_RADIUS_Y: 0.23,
  HEAD_DEPTH: 0.2,
  UPPER_ARM_LEN: 0.23,
  FOREARM_LEN: 0.22,
  THIGH_LEN: 0.25,
  CALF_LEN: 0.26,
  COLLIDER_HALF_W: 0.42,
  COLLIDER_HALF_H: 0.42,
  SHADOW_BASE_RADIUS: 0.68,
} as const;

// Velocidades y duraciones de animación procedural
export const HERO_SPEEDS = {
  IDLE_BREATH_FREQ: 1.5,
  IDLE_BREATH_AMP: 0.015,
  WALK_CYCLE_FREQ: 10.5,
  HURT_FLASH_DUR: 0.14,
  TRANSITION_SQUASH_DUR: 0.1,
  ATTACK_BASE_DUR: 0.24,
  CAST_BASE_DUR: 0.28,
  DUST_POOL_SIZE: 36,
} as const;

// Parámetros por defecto para el ShaderMaterial personalizado
export const HERO_SHADER_DEFAULTS = {
  LIGHT_DIR_X: 0.5,
  LIGHT_DIR_Y: 0.8,
  LIGHT_DIR_Z: 0.3,
  BASE_OUTLINE_WIDTH: 0.022,
  REFERENCE_VIEW_SIZE: 11.5,
  DIRT_OPACITY: 0.6,
} as const;

// Distancia máxima cámara -> entidad para mostrar barras de vida HTML (unidades de mundo)
export const HEALTH_BAR_MAX_DISTANCE = 15;

// Escala temporal del ciclo día/noche: 1 hora de juego = 10 min reales (24h = 4h reales)
export const TIME = {
  REAL_SECONDS_PER_GAME_HOUR: 600,
  GAME_HOURS_PER_DAY: 24,
  DAY_START_HOUR: 6,
} as const;

