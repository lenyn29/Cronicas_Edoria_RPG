import { EnemyKind } from './types';

export type BestiaryMobId =
  | 'rat'
  | 'bat'
  | 'slime'
  | 'wild_dog'
  | 'goblin'
  | 'young_wolf'
  | 'spider'
  | 'skeleton'
  | 'elite_goblin'
  | 'shadow_wolf'
  | 'small_golem'
  | 'ghost'
  | 'medium_golem'
  | 'specter'
  | 'zombie'
  | 'fallen_knight'
  | 'lesser_demon'
  | 'ruin_guardian'
  | 'young_dragon';

export type SpawnZoneId =
  | 'north_plains'
  | 'south_plains'
  | 'east_woods'
  | 'west_hills'
  | 'forest_edge'
  | 'mid_forest'
  | 'deep_forest'
  | 'rocky_hills'
  | 'swamp'
  | 'ancient_ruins';

export interface BestiaryVariant {
  variantIndex: 0 | 1 | 2;
  level: number;
  hp: number;
  damage: number;
  speed: number;
  xp: number;
  color: string;
  scaleMult: number;
}

export interface BestiaryEntry {
  id: BestiaryMobId;
  name: string;
  baseLevel: number;
  visualKind: EnemyKind;
  zones: SpawnZoneId[];
  distanceRange: [number, number];
  aggroRange: number;
  attackRange: number;
  radius: number;
  plateHeight: number;
  variants: [BestiaryVariant, BestiaryVariant, BestiaryVariant];
}

function makeVariants(
  baseLevel: number,
  baseHp: number,
  baseDmg: number,
  baseSpd: number,
  colors: [string, string, string]
): [BestiaryVariant, BestiaryVariant, BestiaryVariant] {
  const v0: BestiaryVariant = {
    variantIndex: 0,
    level: baseLevel,
    hp: baseHp,
    damage: baseDmg,
    speed: Number(baseSpd.toFixed(2)),
    xp: Math.round(16 + baseLevel * 8),
    color: colors[0],
    scaleMult: 0.94,
  };
  const v1: BestiaryVariant = {
    variantIndex: 1,
    level: baseLevel + 1,
    hp: Math.round(baseHp * 1.5),
    damage: Math.round(baseDmg * 1.55 + 1),
    speed: Number((baseSpd + 0.18).toFixed(2)),
    xp: Math.round(16 + (baseLevel + 1) * 9),
    color: colors[1],
    scaleMult: 1.0,
  };
  const v2: BestiaryVariant = {
    variantIndex: 2,
    level: Math.min(20, baseLevel + 2),
    hp: Math.round(baseHp * 2.15),
    damage: Math.round(baseDmg * 2.1 + 2),
    speed: Number((baseSpd + 0.36).toFixed(2)),
    xp: Math.round(16 + Math.min(20, baseLevel + 2) * 10),
    color: colors[2],
    scaleMult: 1.1,
  };
  return [v0, v1, v2];
}

export const BESTIARY: Record<BestiaryMobId, BestiaryEntry> = {
  rat: {
    id: 'rat',
    name: 'Rata',
    baseLevel: 1,
    visualKind: 'rat',
    zones: ['north_plains'],
    distanceRange: [30, 50],
    aggroRange: 7.5,
    attackRange: 1.35,
    radius: 0.48,
    plateHeight: 1.45,
    variants: makeVariants(1, 30, 5, 2.8, ['#8a7a5a', '#685940', '#4a3d29']),
  },
  wild_dog: {
    id: 'wild_dog',
    name: 'Perro Salvaje',
    baseLevel: 1,
    visualKind: 'wild_dog',
    zones: ['south_plains'],
    distanceRange: [30, 50],
    aggroRange: 7.5,
    attackRange: 1.45,
    radius: 0.52,
    plateHeight: 1.55,
    variants: makeVariants(1, 34, 6, 3.25, ['#9b6d43', '#7a512e', '#56361b']),
  },
  bat: {
    id: 'bat',
    name: 'Murciélago',
    baseLevel: 2,
    visualKind: 'bat',
    zones: ['east_woods'],
    distanceRange: [35, 55],
    aggroRange: 8,
    attackRange: 1.55,
    radius: 0.52,
    plateHeight: 1.85,
    variants: makeVariants(2, 42, 7, 3.35, ['#5a486e', '#433256', '#2a1c3a']),
  },
  slime: {
    id: 'slime',
    name: 'Slime',
    baseLevel: 1,
    visualKind: 'slime',
    zones: ['west_hills'],
    distanceRange: [30, 50],
    aggroRange: 7.5,
    attackRange: 1.4,
    radius: 0.55,
    plateHeight: 1.45,
    variants: makeVariants(1, 38, 6, 2.45, ['#5cb85c', '#3d8f44', '#266931']),
  },
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    baseLevel: 4,
    visualKind: 'goblin',
    zones: ['forest_edge'],
    distanceRange: [52, 74],
    aggroRange: 8,
    attackRange: 1.65,
    radius: 0.56,
    plateHeight: 1.85,
    variants: makeVariants(4, 74, 11, 3.15, ['#4f8a4b', '#3e733b', '#2b5429']),
  },
  young_wolf: {
    id: 'young_wolf',
    name: 'Lobo Joven',
    baseLevel: 5,
    visualKind: 'wolf',
    zones: ['mid_forest'],
    distanceRange: [65, 82],
    aggroRange: 8,
    attackRange: 1.7,
    radius: 0.6,
    plateHeight: 1.85,
    variants: makeVariants(5, 92, 13, 3.85, ['#8c6d53', '#73563f', '#573f2d']),
  },
  spider: {
    id: 'spider',
    name: 'Araña',
    baseLevel: 6,
    visualKind: 'rat',
    zones: ['mid_forest'],
    distanceRange: [75, 95],
    aggroRange: 8,
    attackRange: 1.6,
    radius: 0.54,
    plateHeight: 1.65,
    variants: makeVariants(6, 108, 15, 3.95, ['#3d3547', '#2b2436', '#1e1629']),
  },
  skeleton: {
    id: 'skeleton',
    name: 'Esqueleto',
    baseLevel: 7,
    visualKind: 'knight',
    zones: ['deep_forest'],
    distanceRange: [90, 110],
    aggroRange: 8,
    attackRange: 1.85,
    radius: 0.62,
    plateHeight: 2.1,
    variants: makeVariants(7, 130, 18, 3.2, ['#d8d0c0', '#bdb39f', '#9e927c']),
  },
  elite_goblin: {
    id: 'elite_goblin',
    name: 'Goblin Élite',
    baseLevel: 8,
    visualKind: 'goblin',
    zones: ['deep_forest'],
    distanceRange: [102, 125],
    aggroRange: 8,
    attackRange: 1.75,
    radius: 0.6,
    plateHeight: 1.95,
    variants: makeVariants(8, 150, 21, 3.45, ['#7a5230', '#633f22', '#4a2b14']),
  },
  shadow_wolf: {
    id: 'shadow_wolf',
    name: 'Lobo Sombra',
    baseLevel: 9,
    visualKind: 'gray_wolf',
    zones: ['rocky_hills'],
    distanceRange: [120, 145],
    aggroRange: 8,
    attackRange: 1.8,
    radius: 0.64,
    plateHeight: 1.95,
    variants: makeVariants(9, 175, 24, 4.15, ['#484d5e', '#343847', '#212430']),
  },
  small_golem: {
    id: 'small_golem',
    name: 'Gólem Pequeño',
    baseLevel: 10,
    visualKind: 'rock_golem',
    zones: ['rocky_hills'],
    distanceRange: [135, 160],
    aggroRange: 8,
    attackRange: 2.05,
    radius: 0.82,
    plateHeight: 2.45,
    variants: makeVariants(10, 215, 27, 2.1, ['#8d8273', '#756a5c', '#5c5144']),
  },
  ghost: {
    id: 'ghost',
    name: 'Fantasma',
    baseLevel: 11,
    visualKind: 'ghost',
    zones: ['swamp'],
    distanceRange: [155, 182],
    aggroRange: 8,
    attackRange: 1.8,
    radius: 0.58,
    plateHeight: 2.05,
    variants: makeVariants(11, 210, 30, 3.65, ['#8ecae6', '#6fb3d2', '#4d92b5']),
  },
  medium_golem: {
    id: 'medium_golem',
    name: 'Gólem Mediano',
    baseLevel: 12,
    visualKind: 'ice_golem',
    zones: ['swamp'],
    distanceRange: [170, 200],
    aggroRange: 8,
    attackRange: 2.2,
    radius: 0.88,
    plateHeight: 2.6,
    variants: makeVariants(12, 270, 33, 2.2, ['#738594', '#5b6c7a', '#435361']),
  },
  specter: {
    id: 'specter',
    name: 'Espectro',
    baseLevel: 13,
    visualKind: 'mage',
    zones: ['ancient_ruins'],
    distanceRange: [195, 222],
    aggroRange: 12,
    attackRange: 7.5,
    radius: 0.62,
    plateHeight: 2.15,
    variants: makeVariants(13, 255, 36, 2.65, ['#5a4f7a', '#473c63', '#34294d']),
  },
  zombie: {
    id: 'zombie',
    name: 'Zombi',
    baseLevel: 14,
    visualKind: 'ent',
    zones: ['ancient_ruins'],
    distanceRange: [204, 230],
    aggroRange: 12,
    attackRange: 2.0,
    radius: 0.74,
    plateHeight: 2.35,
    variants: makeVariants(14, 315, 39, 2.3, ['#5c704f', '#48593d', '#34422b']),
  },
  fallen_knight: {
    id: 'fallen_knight',
    name: 'Caballero Caído',
    baseLevel: 15,
    visualKind: 'knight',
    zones: ['ancient_ruins'],
    distanceRange: [212, 238],
    aggroRange: 12,
    attackRange: 1.95,
    radius: 0.66,
    plateHeight: 2.2,
    variants: makeVariants(15, 355, 42, 3.3, ['#4b4554', '#383240', '#25202b']),
  },
  lesser_demon: {
    id: 'lesser_demon',
    name: 'Demonio Menor',
    baseLevel: 16,
    visualKind: 'mage',
    zones: ['ancient_ruins'],
    distanceRange: [220, 244],
    aggroRange: 12,
    attackRange: 7.8,
    radius: 0.66,
    plateHeight: 2.25,
    variants: makeVariants(16, 385, 45, 2.9, ['#9e3a32', '#7d2822', '#5c1814']),
  },
  ruin_guardian: {
    id: 'ruin_guardian',
    name: 'Guardián de Ruinas',
    baseLevel: 17,
    visualKind: 'lava_golem',
    zones: ['ancient_ruins'],
    distanceRange: [228, 248],
    aggroRange: 12,
    attackRange: 2.3,
    radius: 0.9,
    plateHeight: 2.7,
    variants: makeVariants(17, 450, 49, 2.35, ['#786958', '#5e5143', '#42372c']),
  },
  young_dragon: {
    id: 'young_dragon',
    name: 'Dragón Joven',
    baseLevel: 18,
    visualKind: 'lava_golem',
    zones: ['ancient_ruins'],
    distanceRange: [234, 250],
    aggroRange: 12,
    attackRange: 2.4,
    radius: 0.94,
    plateHeight: 2.8,
    variants: makeVariants(18, 520, 54, 2.7, ['#b33f2b', '#8f2c1c', '#691b0f']),
  },
};

export const BESTIARY_LIST: BestiaryEntry[] = Object.values(BESTIARY);

export function getBestiaryEntry(id: BestiaryMobId): BestiaryEntry {
  return BESTIARY[id];
}

export function hexStringToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
