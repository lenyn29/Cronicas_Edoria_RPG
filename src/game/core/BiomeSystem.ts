import * as THREE from 'three';
import { BiomeId, EnemyKind } from '../types';
import {
  BIOME_CLIMATE_CENTERS,
  ChunkBiomeEntry,
  getBiomeWeights as sampleWorldBiomeWeights,
  getChunkBiomeMix,
} from '../worldMath';
import { PALETTE_ACTOR } from './PaletteActor';
import { PALETTE_ENVIRONMENT, PALETTE_SKY } from './PaletteEnvironment';

export type BiomeShapeKind =
  | 'leaf'
  | 'mushroom'
  | 'trunk'
  | 'rock'
  | 'crystal'
  | 'flame'
  | 'star';

export interface BiomeParticleProfile {
  primaryColor: number;
  secondaryColor: number;
  behavior: 'spores_leaves' | 'ash_sparks' | 'snow_wind' | 'ruins_wisps' | 'village_calm';
  rateMultiplier: number;
}

export interface BiomeGrassPalette {
  base: number;
  shadow: number;
  highlight: number;
}

export interface BiomeTreePalette {
  canopyBase: number;
  canopyShadow: number;
  canopyHighlight: number;
  trunkBase: number;
  trunkShadow: number;
}

export interface BiomeGroundPalette {
  base: number;
  shadow: number;
}

export interface BiomeEnemyEntry {
  type: EnemyKind;
  name: string;
  weight: number;
}

export interface BiomeDefinition {
  id: BiomeId;
  key: 'dawn_forest' | 'deep_forest' | 'ash_caves' | 'broken_peak' | 'snow_ruins';
  name: string;
  heat: number;
  moisture: number;
  levelRange: [number, number];
  enemyRoster: BiomeEnemyEntry[];
  palette: number[];
  grassPalette: BiomeGrassPalette;
  treePalette: BiomeTreePalette;
  groundPalette: BiomeGroundPalette;
  windStrength: number;
  grassDensity: number;
  treeDensity: number;
  lightDir: THREE.Vector3;
  ambientTint: THREE.Color;
  skyColor: number;
  fogColor: number;
  allowedShapes: BiomeShapeKind[];
  particles: BiomeParticleProfile;
  ambientAudioHook: string;
}

export const VILLAGE_BIOME_PROFILE = {
  key: 'piedrablanca_village',
  name: 'Pueblo de Piedrablanca',
  palette: [
    PALETTE_ENVIRONMENT.GRASS_BASE,
    PALETTE_ENVIRONMENT.GROUND_BASE,
    PALETTE_ENVIRONMENT.TREE_BASE,
    PALETTE_ENVIRONMENT.TRUNK_BASE,
  ],
  lightDir: new THREE.Vector3(0.45, 0.85, 0.35).normalize(),
  ambientTint: new THREE.Color(0xfff6e8),
  particles: {
    primaryColor: PALETTE_ACTOR.WARM_WHITE,
    secondaryColor: PALETTE_ACTOR.ORO,
    behavior: 'village_calm' as const,
    rateMultiplier: 1.0,
  },
  ambientAudioHook: 'amb_village_piedrablanca',
};

// Configuración por datos de los 5 biomas con PaletteEnvironment + PaletteSky
export const BIOME_CONFIGS: Record<BiomeId, BiomeDefinition> = {
  0: {
    id: 0,
    key: 'dawn_forest',
    name: 'Pradera Esmeralda',
    heat: BIOME_CLIMATE_CENTERS[0].heat,
    moisture: BIOME_CLIMATE_CENTERS[0].moisture,
    levelRange: [1, 5],
    enemyRoster: [
      { type: 'slime', name: 'Slime Verde', weight: 0.45 },
      { type: 'rat', name: 'Rata Salvaje', weight: 0.33 },
      { type: 'rabbit', name: 'Conejo Guerrero', weight: 0.22 },
    ],
    palette: [
      PALETTE_ENVIRONMENT.GRASS_BASE,
      PALETTE_ENVIRONMENT.GRASS_HIGHLIGHT,
      PALETTE_ENVIRONMENT.TREE_BASE,
      PALETTE_ENVIRONMENT.TRUNK_BASE,
      PALETTE_ENVIRONMENT.GROUND_BASE,
    ],
    grassPalette: {
      base: PALETTE_ENVIRONMENT.GRASS_BASE,
      shadow: PALETTE_ENVIRONMENT.GRASS_SHADOW,
      highlight: PALETTE_ENVIRONMENT.GRASS_HIGHLIGHT,
    },
    treePalette: {
      canopyBase: PALETTE_ENVIRONMENT.TREE_BASE,
      canopyShadow: PALETTE_ENVIRONMENT.TREE_SHADOW,
      canopyHighlight: PALETTE_ENVIRONMENT.TREE_HIGHLIGHT,
      trunkBase: PALETTE_ENVIRONMENT.TRUNK_BASE,
      trunkShadow: PALETTE_ENVIRONMENT.TRUNK_SHADOW,
    },
    groundPalette: {
      base: PALETTE_ENVIRONMENT.GRASS_BASE,
      shadow: PALETTE_ENVIRONMENT.GROUND_BASE,
    },
    windStrength: 0.22,
    grassDensity: 260,
    treeDensity: 0.55,
    lightDir: new THREE.Vector3(0.32, 0.90, 0.28).normalize(),
    ambientTint: new THREE.Color(0xf4ffe8),
    skyColor: PALETTE_SKY.DAY_SKY,
    fogColor: PALETTE_SKY.FOG_MEADOW,
    allowedShapes: ['leaf', 'mushroom', 'trunk'],
    particles: {
      primaryColor: PALETTE_ACTOR.ORO,
      secondaryColor: PALETTE_ENVIRONMENT.GRASS_HIGHLIGHT,
      behavior: 'spores_leaves',
      rateMultiplier: 1.0,
    },
    ambientAudioHook: 'amb_dawn_meadow',
  },
  1: {
    id: 1,
    key: 'deep_forest',
    name: 'Bosque Ancestral',
    heat: BIOME_CLIMATE_CENTERS[1].heat,
    moisture: BIOME_CLIMATE_CENTERS[1].moisture,
    levelRange: [5, 12],
    enemyRoster: [
      { type: 'goblin', name: 'Goblin Saqueador', weight: 0.42 },
      { type: 'rabbit', name: 'Conejo Guerrero', weight: 0.28 },
      { type: 'ent', name: 'Ent Guardián', weight: 0.30 },
    ],
    palette: [
      PALETTE_ENVIRONMENT.FOREST_GRASS_BASE,
      PALETTE_ENVIRONMENT.FOREST_TREE_BASE,
      PALETTE_ENVIRONMENT.TRUNK_BASE,
      PALETTE_ENVIRONMENT.FOREST_GROUND,
    ],
    grassPalette: {
      base: PALETTE_ENVIRONMENT.FOREST_GRASS_BASE,
      shadow: PALETTE_ENVIRONMENT.FOREST_GRASS_SHADOW,
      highlight: PALETTE_ENVIRONMENT.FOREST_GRASS_HIGHLIGHT,
    },
    treePalette: {
      canopyBase: PALETTE_ENVIRONMENT.FOREST_TREE_BASE,
      canopyShadow: PALETTE_ENVIRONMENT.FOREST_TREE_SHADOW,
      canopyHighlight: PALETTE_ENVIRONMENT.FOREST_TREE_HIGHLIGHT,
      trunkBase: PALETTE_ENVIRONMENT.TRUNK_BASE,
      trunkShadow: PALETTE_ENVIRONMENT.TRUNK_SHADOW,
    },
    groundPalette: {
      base: PALETTE_ENVIRONMENT.FOREST_GROUND,
      shadow: PALETTE_ENVIRONMENT.GROUND_SHADOW,
    },
    windStrength: 0.14,
    grassDensity: 280,
    treeDensity: 0.85,
    lightDir: new THREE.Vector3(0.18, 0.94, 0.25).normalize(),
    ambientTint: new THREE.Color(0xdefaf0),
    skyColor: PALETTE_SKY.FOG_FOREST,
    fogColor: PALETTE_SKY.FOG_FOREST,
    allowedShapes: ['leaf', 'mushroom', 'trunk', 'crystal'],
    particles: {
      primaryColor: PALETTE_ACTOR.ESPECTRO_VERDE,
      secondaryColor: PALETTE_ACTOR.ORO,
      behavior: 'ruins_wisps',
      rateMultiplier: 1.25,
    },
    ambientAudioHook: 'amb_ancestral_forest',
  },
  2: {
    id: 2,
    key: 'ash_caves',
    name: 'Tierras Volcánicas',
    heat: BIOME_CLIMATE_CENTERS[2].heat,
    moisture: BIOME_CLIMATE_CENTERS[2].moisture,
    levelRange: [15, 25],
    enemyRoster: [
      { type: 'knight', name: 'Caballero de Ceniza', weight: 0.36 },
      { type: 'mage', name: 'Piromante Oscuro', weight: 0.30 },
      { type: 'lava_golem', name: 'Gólem de Lava', weight: 0.34 },
    ],
    palette: [
      PALETTE_ENVIRONMENT.VOLCANIC_GROUND,
      PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_BASE,
      PALETTE_ENVIRONMENT.VOLCANIC_EMBER_BASE,
    ],
    grassPalette: {
      base: PALETTE_ENVIRONMENT.VOLCANIC_GROUND,
      shadow: PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW,
      highlight: PALETTE_ENVIRONMENT.VOLCANIC_EMBER_BASE,
    },
    treePalette: {
      canopyBase: PALETTE_ENVIRONMENT.VOLCANIC_EMBER_BASE,
      canopyShadow: PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW,
      canopyHighlight: PALETTE_ENVIRONMENT.VOLCANIC_EMBER_HIGHLIGHT,
      trunkBase: PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_BASE,
      trunkShadow: PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW,
    },
    groundPalette: {
      base: PALETTE_ENVIRONMENT.VOLCANIC_GROUND,
      shadow: PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW,
    },
    windStrength: 0.34,
    grassDensity: 0,
    treeDensity: 0.45,
    lightDir: new THREE.Vector3(0.45, -0.52, 0.42).normalize(),
    ambientTint: new THREE.Color(0xffd4c2),
    skyColor: PALETTE_SKY.FOG_VOLCANIC,
    fogColor: PALETTE_SKY.FOG_VOLCANIC,
    allowedShapes: ['flame', 'rock', 'crystal'],
    particles: {
      primaryColor: PALETTE_ACTOR.FIRE_EMBER,
      secondaryColor: PALETTE_ACTOR.LAVA_RED,
      behavior: 'ash_sparks',
      rateMultiplier: 1.4,
    },
    ambientAudioHook: 'amb_ash_caves',
  },
  3: {
    id: 3,
    key: 'broken_peak',
    name: 'Tierras Rocosas',
    heat: BIOME_CLIMATE_CENTERS[3].heat,
    moisture: BIOME_CLIMATE_CENTERS[3].moisture,
    levelRange: [10, 18],
    enemyRoster: [
      { type: 'wolf', name: 'Lobo de Cañón', weight: 0.38 },
      { type: 'bat', name: 'Murciélago Sombrío', weight: 0.30 },
      { type: 'rock_golem', name: 'Gólem de Roca', weight: 0.32 },
    ],
    palette: [
      PALETTE_ENVIRONMENT.ROCKY_GROUND,
      PALETTE_ENVIRONMENT.ROCKY_STONE,
      PALETTE_ENVIRONMENT.ROCKY_GRASS_BASE,
      PALETTE_ENVIRONMENT.ROCKY_TREE_BASE,
    ],
    grassPalette: {
      base: PALETTE_ENVIRONMENT.ROCKY_GRASS_BASE,
      shadow: PALETTE_ENVIRONMENT.ROCKY_GRASS_SHADOW,
      highlight: PALETTE_ENVIRONMENT.ROCKY_GRASS_HIGHLIGHT,
    },
    treePalette: {
      canopyBase: PALETTE_ENVIRONMENT.ROCKY_TREE_BASE,
      canopyShadow: PALETTE_ENVIRONMENT.ROCKY_TREE_SHADOW,
      canopyHighlight: PALETTE_ENVIRONMENT.ROCKY_TREE_HIGHLIGHT,
      trunkBase: PALETTE_ENVIRONMENT.TRUNK_BASE,
      trunkShadow: PALETTE_ENVIRONMENT.TRUNK_SHADOW,
    },
    groundPalette: {
      base: PALETTE_ENVIRONMENT.ROCKY_GROUND,
      shadow: PALETTE_ENVIRONMENT.GROUND_SHADOW,
    },
    windStrength: 0.38,
    grassDensity: 75,
    treeDensity: 0.35,
    lightDir: new THREE.Vector3(0.84, 0.46, 0.28).normalize(),
    ambientTint: new THREE.Color(0xf7eee4),
    skyColor: PALETTE_SKY.FOG_ROCKY,
    fogColor: PALETTE_SKY.FOG_ROCKY,
    allowedShapes: ['rock', 'crystal', 'trunk'],
    particles: {
      primaryColor: PALETTE_ENVIRONMENT.ROCKY_STONE,
      secondaryColor: PALETTE_ENVIRONMENT.GROUND_BASE,
      behavior: 'snow_wind',
      rateMultiplier: 0.9,
    },
    ambientAudioHook: 'amb_broken_peaks',
  },
  4: {
    id: 4,
    key: 'snow_ruins',
    name: 'Tierras Nevadas',
    heat: BIOME_CLIMATE_CENTERS[4].heat,
    moisture: BIOME_CLIMATE_CENTERS[4].moisture,
    levelRange: [12, 20],
    enemyRoster: [
      { type: 'gray_wolf', name: 'Lobo Gris', weight: 0.38 },
      { type: 'polar_bear', name: 'Oso Polar', weight: 0.32 },
      { type: 'ice_golem', name: 'Gólem de Hielo', weight: 0.30 },
    ],
    palette: [
      PALETTE_ENVIRONMENT.SNOW_GROUND,
      PALETTE_ENVIRONMENT.SNOW_STONE,
      PALETTE_ENVIRONMENT.SNOW_TREE_BASE,
      PALETTE_ENVIRONMENT.SNOW_TREE_HIGHLIGHT,
    ],
    grassPalette: {
      base: PALETTE_ENVIRONMENT.SNOW_GROUND,
      shadow: PALETTE_ENVIRONMENT.SNOW_STONE,
      highlight: PALETTE_SKY.HORIZON_WHITE,
    },
    treePalette: {
      canopyBase: PALETTE_ENVIRONMENT.SNOW_TREE_BASE,
      canopyShadow: PALETTE_ENVIRONMENT.SNOW_TREE_SHADOW,
      canopyHighlight: PALETTE_ENVIRONMENT.SNOW_TREE_HIGHLIGHT,
      trunkBase: PALETTE_ENVIRONMENT.TRUNK_BASE,
      trunkShadow: PALETTE_ENVIRONMENT.TRUNK_SHADOW,
    },
    groundPalette: {
      base: PALETTE_ENVIRONMENT.SNOW_GROUND,
      shadow: PALETTE_ENVIRONMENT.SNOW_STONE,
    },
    windStrength: 0.44,
    grassDensity: 0,
    treeDensity: 0.55,
    lightDir: new THREE.Vector3(0.35, 0.86, 0.36).normalize(),
    ambientTint: new THREE.Color(0xe6f4ff),
    skyColor: PALETTE_SKY.FOG_SNOW,
    fogColor: PALETTE_SKY.FOG_SNOW,
    allowedShapes: ['crystal', 'rock', 'star'],
    particles: {
      primaryColor: PALETTE_ACTOR.WARM_WHITE,
      secondaryColor: PALETTE_ACTOR.ICE_CRYSTAL,
      behavior: 'snow_wind',
      rateMultiplier: 1.45,
    },
    ambientAudioHook: 'amb_frost_peaks',
  },
};

const _tmpCol = new THREE.Color();

// Devuelve los biomas ponderados para un chunk (cx, cz): dominante + hasta 2 secundarios
export function getBiomeWeights(chunkX: number, chunkZ: number, seed: number): ChunkBiomeEntry[] {
  return getChunkBiomeMix(chunkX, chunkZ, seed);
}

// Interpola sin GC la dirección de luz y el tinte ambiental según la posición exacta del mundo
export function computeBiomeLightingAt(
  x: number,
  z: number,
  seed: number,
  outLightDir: THREE.Vector3,
  outAmbientTint: THREE.Color
): void {
  const w = sampleWorldBiomeWeights(x, z, seed);
  const wArr = [w.meadow, w.forest, w.volcanic, w.rocky, w.snow];
  outLightDir.set(0, 0, 0);
  outAmbientTint.setRGB(0, 0, 0);

  for (let i = 0; i < 5; i++) {
    const weight = wArr[i];
    if (weight <= 0.001) continue;
    const cfg = BIOME_CONFIGS[i as BiomeId];
    outLightDir.addScaledVector(cfg.lightDir, weight);
    outAmbientTint.r += cfg.ambientTint.r * weight;
    outAmbientTint.g += cfg.ambientTint.g * weight;
    outAmbientTint.b += cfg.ambientTint.b * weight;
  }

  if (outLightDir.lengthSq() < 0.001) outLightDir.set(0.5, 0.8, 0.3);
  outLightDir.normalize();
}

// Calcula la paleta de pasto, viento y color de cielo/niebla objetivo para interpolación suave entre biomas
export function computeBiomeEnvironmentTargetAt(
  x: number,
  z: number,
  seed: number,
  outGrassBase: THREE.Color,
  outGrassShadow: THREE.Color,
  outGrassHighlight: THREE.Color,
  outSkyColor: THREE.Color
): number {
  const w = sampleWorldBiomeWeights(x, z, seed);
  const wArr = [w.meadow, w.forest, w.volcanic, w.rocky, w.snow];
  outGrassBase.setRGB(0, 0, 0);
  outGrassShadow.setRGB(0, 0, 0);
  outGrassHighlight.setRGB(0, 0, 0);
  outSkyColor.setRGB(0, 0, 0);
  let wind = 0;

  for (let i = 0; i < 5; i++) {
    const weight = wArr[i];
    if (weight <= 0.001) continue;
    const cfg = BIOME_CONFIGS[i as BiomeId];
    wind += cfg.windStrength * weight;

    _tmpCol.setHex(cfg.grassPalette.base);
    outGrassBase.r += _tmpCol.r * weight;
    outGrassBase.g += _tmpCol.g * weight;
    outGrassBase.b += _tmpCol.b * weight;

    _tmpCol.setHex(cfg.grassPalette.shadow);
    outGrassShadow.r += _tmpCol.r * weight;
    outGrassShadow.g += _tmpCol.g * weight;
    outGrassShadow.b += _tmpCol.b * weight;

    _tmpCol.setHex(cfg.grassPalette.highlight);
    outGrassHighlight.r += _tmpCol.r * weight;
    outGrassHighlight.g += _tmpCol.g * weight;
    outGrassHighlight.b += _tmpCol.b * weight;

    _tmpCol.setHex(cfg.skyColor);
    outSkyColor.r += _tmpCol.r * weight;
    outSkyColor.g += _tmpCol.g * weight;
    outSkyColor.b += _tmpCol.b * weight;
  }
  return wind;
}
