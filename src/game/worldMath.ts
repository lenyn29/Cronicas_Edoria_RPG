import { BiomeId, TownLocation } from './types';

export const WORLD_SIZE = 620;
export const HALF_WORLD = WORLD_SIZE / 2;
export const PLAY_BOUND = 310; // Outer ocean clamp around the irregular continent
export const LAND_THRESHOLD = 0.3;
export const CONTINENT_ANCHOR_RADIUS = 178;
export const DEFAULT_WORLD_SEED = 'ELDORIA-77531';

export const LANDMARKS = {
  village: { x: 0, z: 16 },
  oakOutpost: { x: -116, z: -108 },
  frostOutpost: { x: 114, z: 108 },
  meadowArena: { x: 14, z: 120 },
  forestArena: { x: -154, z: -150 },
  rockyArena: { x: -162, z: 144 },
  snowArena: { x: 156, z: 148 },
  volcanicArena: { x: 168, z: -162 },
  crystalShrine: { x: 186, z: -180 },
} as const;

export interface ContinentAnchor {
  id: string;
  x: number;
  z: number;
  boost: number;
}

export function getContinentAnchors(seed: number): ContinentAnchor[] {
  const s = seed >>> 0;
  const jitter = (idx: number, span: number) =>
    ((hash2D(idx, 913, s) / 4294967295) - 0.5) * 2 * span;
  return [
    // Corazón del continente: siempre el anclaje con mayor elevación promedio (Aldea del Alba)
    { id: 'center', x: LANDMARKS.village.x, z: LANDMARKS.village.z, boost: 0.18 },
    { id: 'nw', x: -130 + jitter(1, 14), z: -124 + jitter(2, 14), boost: 0.06 },
    { id: 'ne', x: 138 + jitter(3, 14), z: -134 + jitter(4, 14), boost: 0.06 },
    { id: 'sw', x: -134 + jitter(5, 14), z: 120 + jitter(6, 14), boost: 0.06 },
    { id: 'se', x: 130 + jitter(7, 14), z: 124 + jitter(8, 14), boost: 0.06 },
  ];
}

export function getWorldTowns(_seed: number): TownLocation[] {
  return [
    {
      id: 'aldea_alba',
      name: 'Piedrablanca',
      x: LANDMARKS.village.x,
      z: LANDMARKS.village.z,
      radius: 26,
      isCapital: true,
    },
    {
      id: 'refugio_roble',
      name: 'Refugio del Roble',
      x: LANDMARKS.oakOutpost.x,
      z: LANDMARKS.oakOutpost.z,
      radius: 10,
    },
    {
      id: 'refugio_escarcha',
      name: 'Refugio Glacial',
      x: LANDMARKS.frostOutpost.x,
      z: LANDMARKS.frostOutpost.z,
      radius: 10,
    },
  ];
}

export function getNearestTownInfo(
  px: number,
  pz: number,
  towns: TownLocation[]
): { id: string; name: string; distance: number; angleDeg: number; inTown: boolean } {
  let nearest = towns[0];
  let bestDist = Infinity;
  for (let i = 0; i < towns.length; i++) {
    const t = towns[i];
    const d = Math.hypot(t.x - px, t.z - pz);
    if (d < bestDist) {
      bestDist = d;
      nearest = t;
    }
  }
  const dx = nearest.x - px;
  const dz = nearest.z - pz;
  // Cámara en +Z mirando hacia -Z: Norte en pantalla es -Z => angle = atan2(dx, -dz)
  const angleDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return {
    id: nearest.id,
    name: nearest.name,
    distance: Math.round(bestDist),
    angleDeg,
    inTown: bestDist <= nearest.radius,
  };
}

// Calibration parameters for Chunking & Performance
export const CHUNK_CONFIG = {
  CHUNK_SIZE: 32,          // World units per chunk edge (32x32 tiles)
  CHUNK_SEGMENTS: 32,      // Mesh grid resolution per chunk (32x32 quads = 1089 vertices)
  VIEW_RADIUS: 3,          // Active chunk radius around player (3 => 7x7 = 49 chunks cached)
  GRASS_CULL_DIST_SQ: (32 * 3.6) * (32 * 3.6), // Hide distant grass chunks > ~3.6 chunks away
  MAX_GRASS_PER_CHUNK: 260,// Pooled InstancedMesh grass cap per chunk (200-500 range)
  MAX_UPLOADS_PER_FRAME: 2 // Time-sliced GPU buffer uploads per frame
} as const;

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit string/number seed normalizer (strictly deterministic)
export function normalizeSeed(seed: string | number): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (seed | 0) >>> 0;
  }
  const str = String(seed).trim() || DEFAULT_WORLD_SEED;
  if (/^-?\d+$/.test(str)) {
    return (parseInt(str, 10) | 0) >>> 0;
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 77531;
}

// Pure stateless 2D integer coordinate hash parameterized by seed (zero global state)
export function hash2D(ix: number, iy: number, seed: number): number {
  let h = (seed ^ Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function hashChunkCoords(cx: number, cz: number, worldSeed: number): number {
  return hash2D(cx, cz, worldSeed);
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunk(x: number, z: number): { cx: number; cz: number } {
  return {
    cx: Math.floor((x + CHUNK_CONFIG.CHUNK_SIZE * 0.5) / CHUNK_CONFIG.CHUNK_SIZE),
    cz: Math.floor((z + CHUNK_CONFIG.CHUNK_SIZE * 0.5) / CHUNK_CONFIG.CHUNK_SIZE),
  };
}

export function ensureWorldSeed(seed: string | number): number {
  return normalizeSeed(seed);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

const GRADS = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Strictly stateless seed-based 2D gradient noise (explicit seed required, zero mutable tables)
export function noise2D(x: number, y: number, seed: number): number {
  const s = seed >>> 0;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const xf = x - ix;
  const yf = y - iy;
  const u = fade(xf);
  const v = fade(yf);

  const g00 = GRADS[hash2D(ix, iy, s) & 7];
  const g10 = GRADS[hash2D(ix + 1, iy, s) & 7];
  const g01 = GRADS[hash2D(ix, iy + 1, s) & 7];
  const g11 = GRADS[hash2D(ix + 1, iy + 1, s) & 7];

  const n00 = g00[0] * xf + g00[1] * yf;
  const n10 = g10[0] * (xf - 1) + g10[1] * yf;
  const n01 = g01[0] * xf + g01[1] * (yf - 1);
  const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);

  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

export function fbm(x: number, y: number, octaves: number, seed: number): number {
  const baseSeed = seed >>> 0;
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise2D(x * freq, y * freq, (baseSeed + Math.imul(i, 1013904223)) >>> 0);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1);
  // Subtle organic curve along trails so paths wind naturally instead of rigid straight lines
  const wave = Math.sin(t * Math.PI * 5) * 2.2 * Math.sin(t * Math.PI);
  const len = Math.sqrt(lenSq) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  return Math.hypot(px - (ax + t * dx + nx * wave), pz - (az + t * dz + nz * wave));
}

export function getPathFactor(x: number, z: number): number {
  const d1 = distToSegment(x, z, LANDMARKS.village.x, LANDMARKS.village.z, LANDMARKS.meadowArena.x, LANDMARKS.meadowArena.z);
  const d2 = distToSegment(x, z, LANDMARKS.village.x, LANDMARKS.village.z, LANDMARKS.forestArena.x, LANDMARKS.forestArena.z);
  const d3 = distToSegment(x, z, LANDMARKS.village.x, LANDMARKS.village.z, LANDMARKS.rockyArena.x, LANDMARKS.rockyArena.z);
  const d4 = distToSegment(x, z, LANDMARKS.village.x, LANDMARKS.village.z, LANDMARKS.snowArena.x, LANDMARKS.snowArena.z);
  const d5 = distToSegment(x, z, LANDMARKS.village.x, LANDMARKS.village.z, LANDMARKS.volcanicArena.x, LANDMARKS.volcanicArena.z);
  const d6 = distToSegment(x, z, LANDMARKS.volcanicArena.x, LANDMARKS.volcanicArena.z, LANDMARKS.crystalShrine.x, LANDMARKS.crystalShrine.z);
  const d = Math.min(d1, d2, d3, d4, d5, d6);
  return smoothstep(3.6, 1.35, d);
}

export interface BiomeWeights {
  meadow: number;
  forest: number;
  volcanic: number;
  rocky: number;
  snow: number;
}

export interface ChunkBiomeEntry {
  biome: BiomeId;
  weight: number;
}

export interface BiomeClimate {
  heat: number;
  moisture: number;
}

// Centroides de clima (heat, moisture) para mezcla orgánica tipo SquidSquad BlendedBiomeMapper
export const BIOME_CLIMATE_CENTERS: Record<BiomeId, BiomeClimate> = {
  0: { heat: 0.50, moisture: 0.56 }, // Pradera del Alba (templado equilibrado)
  1: { heat: 0.38, moisture: 0.86 }, // Bosque de Leren (fresco y húmedo)
  2: { heat: 0.88, moisture: 0.34 }, // Ciénaga de Ceniza / Tierras Volcánicas (cálido)
  3: { heat: 0.56, moisture: 0.16 }, // Colinas Rocosas (seco)
  4: { heat: 0.14, moisture: 0.48 }, // Picos Nevados (frío)
};

export function getBiomeClimate(x: number, z: number, seed: number): BiomeClimate {
  const s = seed >>> 0;
  const nx = clamp(x / PLAY_BOUND, -1, 1);
  const nz = clamp(z / PLAY_BOUND, -1, 1);

  // Dos capas Perlin fbm de baja frecuencia (~3.5-4.5 chunks por onda) con offsets y semillas distintas
  const heatNoise = fbm(x * 0.0072 + 17.3, z * 0.0072 - 11.8, 3, (s ^ 0x3b8a1d4f) >>> 0) * 0.52;
  const moistNoise = fbm(x * 0.0072 - 23.1, z * 0.0072 + 31.4, 3, (s ^ 0x7c2e9013) >>> 0) * 0.52;

  // Tendencia climática suave (sin cruces ni esquinas cuadradas):
  // - NE tiende a cálido (Ceniza/Volcánico)
  // - SE tiende a frío (Nieve)
  // - NW tiende a húmedo (Bosque)
  // - SW tiende a seco (Colinas Rocosas)
  const coldSE = smoothstep(-0.08, 0.72, nx) * smoothstep(-0.08, 0.72, nz);
  const warmNE = smoothstep(-0.08, 0.72, nx) * smoothstep(-0.08, 0.72, -nz);
  const drySW = smoothstep(-0.08, 0.72, -nx) * smoothstep(-0.08, 0.72, nz);
  const wetNW = smoothstep(-0.08, 0.72, -nx) * smoothstep(-0.08, 0.72, -nz);

  let baseHeat = 0.5 + warmNE * 0.44 - coldSE * 0.46 - wetNW * 0.12;
  let baseMoist = 0.56 + wetNW * 0.36 - drySW * 0.44 - warmNE * 0.22;

  // Ancla orgánica suave alrededor del Pueblo de Piedrablanca (pradera central-sur)
  const vDist = Math.hypot(x - LANDMARKS.village.x, z - LANDMARKS.village.z);
  const villagePull = smoothstep(82, 24, vDist);
  baseHeat = lerp(baseHeat, 0.50, villagePull * 0.85);
  baseMoist = lerp(baseMoist, 0.56, villagePull * 0.85);

  return {
    heat: clamp(baseHeat + heatNoise * (1 - villagePull * 0.65), 0, 1),
    moisture: clamp(baseMoist + moistNoise * (1 - villagePull * 0.65), 0, 1),
  };
}

export function getBiomeWeights(x: number, z: number, seed: number): BiomeWeights {
  const { heat, moisture } = getBiomeClimate(x, z, seed);
  const invTwoSigmaSq = 1 / (2 * 0.215 * 0.215);

  const d0 = (heat - 0.50) ** 2 + (moisture - 0.56) ** 2;
  const d1 = (heat - 0.38) ** 2 + (moisture - 0.86) ** 2;
  const d2 = (heat - 0.88) ** 2 + (moisture - 0.34) ** 2;
  const d3 = (heat - 0.56) ** 2 + (moisture - 0.16) ** 2;
  const d4 = (heat - 0.14) ** 2 + (moisture - 0.48) ** 2;

  const w0 = Math.exp(-d0 * invTwoSigmaSq);
  const w1 = Math.exp(-d1 * invTwoSigmaSq);
  const w2 = Math.exp(-d2 * invTwoSigmaSq);
  const w3 = Math.exp(-d3 * invTwoSigmaSq);
  const w4 = Math.exp(-d4 * invTwoSigmaSq);

  const sum = w0 + w1 + w2 + w3 + w4 || 1;
  return {
    meadow: w0 / sum,
    forest: w1 / sum,
    volcanic: w2 / sum,
    rocky: w3 / sum,
    snow: w4 / sum,
  };
}

function pickBiomeFromWeights(w: BiomeWeights): BiomeId {
  let best: BiomeId = 0;
  let bestW = w.meadow;
  if (w.forest > bestW) { best = 1; bestW = w.forest; }
  if (w.volcanic > bestW) { best = 2; bestW = w.volcanic; }
  if (w.rocky > bestW) { best = 3; bestW = w.rocky; }
  if (w.snow > bestW) { best = 4; }
  return best;
}

// Devuelve bioma dominante + hasta 2 biomas secundarios ponderados para un chunk (cx, cz)
export function getChunkBiomeMix(cx: number, cz: number, seed: number): ChunkBiomeEntry[] {
  const size = CHUNK_CONFIG.CHUNK_SIZE;
  const wx = cx * size;
  const wz = cz * size;
  const w = getBiomeWeights(wx, wz, seed);
  const list: ChunkBiomeEntry[] = [
    { biome: 0, weight: w.meadow },
    { biome: 1, weight: w.forest },
    { biome: 2, weight: w.volcanic },
    { biome: 3, weight: w.rocky },
    { biome: 4, weight: w.snow },
  ];
  list.sort((a, b) => b.weight - a.weight);
  const top = list.filter((e, idx) => idx === 0 || e.weight >= 0.08).slice(0, 3);
  const total = top.reduce((acc, e) => acc + e.weight, 0) || 1;
  return top.map((e) => ({ biome: e.biome, weight: e.weight / total }));
}

// 0 = Pradera Esmeralda, 1 = Bosque Ancestral, 2 = Tierras Volcánicas, 3 = Tierras Rocosas, 4 = Tierras Nevadas
export function getBiomeId(x: number, z: number, seed: number): BiomeId {
  return pickBiomeFromWeights(getBiomeWeights(x, z, seed));
}

export function getLandElevation(x: number, z: number, seed: number, pathFactor = 0): number {
  const s = seed >>> 0;
  const anchors = getContinentAnchors(s);
  let minDistSq = Infinity;
  let nearestBoost = 0;

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const dx = x - a.x;
    const dz = z - a.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      nearestBoost = a.boost;
    }
  }

  const rSq = CONTINENT_ANCHOR_RADIUS * CONTINENT_ANCHOR_RADIUS;
  const falloff = minDistSq / rSq;

  // Ruido Perlin multi-escala: capa continental + capa costera de mayor frecuencia para bahías, cabos y penínsulas
  const nMacro = fbm(x * 0.0085 + 7.1, z * 0.0085 - 5.3, 4, (s ^ 0x9e3779b9) >>> 0);
  const nCoast = fbm(x * 0.025 - 14.2, z * 0.025 + 19.7, 2, (s ^ 0x517cc1b7) >>> 0);
  const perlinContinent = 0.72 + nMacro * 0.56 + nCoast * 0.24;

  let e = perlinContinent + nearestBoost - falloff;

  // Garantizamos pasarelas naturales en senderos principales, refugios y arenas de jefe para evitar islas desconectadas
  const safeHub = Math.max(
    pathFactor,
    smoothstep(38, 25, Math.hypot(x - LANDMARKS.village.x, z - LANDMARKS.village.z)),
    smoothstep(16, 9, Math.hypot(x - LANDMARKS.oakOutpost.x, z - LANDMARKS.oakOutpost.z)),
    smoothstep(16, 9, Math.hypot(x - LANDMARKS.frostOutpost.x, z - LANDMARKS.frostOutpost.z)),
    smoothstep(22, 13, Math.hypot(x - LANDMARKS.meadowArena.x, z - LANDMARKS.meadowArena.z)),
    smoothstep(24, 14, Math.hypot(x - LANDMARKS.forestArena.x, z - LANDMARKS.forestArena.z)),
    smoothstep(24, 14, Math.hypot(x - LANDMARKS.rockyArena.x, z - LANDMARKS.rockyArena.z)),
    smoothstep(24, 14, Math.hypot(x - LANDMARKS.snowArena.x, z - LANDMARKS.snowArena.z)),
    smoothstep(26, 15, Math.hypot(x - LANDMARKS.volcanicArena.x, z - LANDMARKS.volcanicArena.z)),
    smoothstep(15, 8, Math.hypot(x - LANDMARKS.crystalShrine.x, z - LANDMARKS.crystalShrine.z))
  );
  if (safeHub > 0.01) {
    e = lerp(e, Math.max(e, 0.56), safeHub);
  }
  return e;
}

function computeTerrainHeightWithFactors(
  x: number,
  z: number,
  w: BiomeWeights,
  path: number,
  seed: number,
  landElev?: number
): number {
  const e = landElev ?? getLandElevation(x, z, seed, path);

  // Fuera del continente (E <= 0.3): fondo oceánico sumergido bajo la cota del agua (-0.34)
  if (e <= LAND_THRESHOLD) {
    const submerge = smoothstep(LAND_THRESHOLD, 0.08, e);
    return lerp(-0.34, -1.75, submerge);
  }

  const villageDist = Math.hypot(x - LANDMARKS.village.x, z - LANDMARKS.village.z);
  const oakOutpostDist = Math.hypot(x - LANDMARKS.oakOutpost.x, z - LANDMARKS.oakOutpost.z);
  const frostOutpostDist = Math.hypot(x - LANDMARKS.frostOutpost.x, z - LANDMARKS.frostOutpost.z);
  const meadowArenaDist = Math.hypot(x - LANDMARKS.meadowArena.x, z - LANDMARKS.meadowArena.z);
  const forestArenaDist = Math.hypot(x - LANDMARKS.forestArena.x, z - LANDMARKS.forestArena.z);
  const rockyArenaDist = Math.hypot(x - LANDMARKS.rockyArena.x, z - LANDMARKS.rockyArena.z);
  const snowArenaDist = Math.hypot(x - LANDMARKS.snowArena.x, z - LANDMARKS.snowArena.z);
  const bossDist = Math.hypot(x - LANDMARKS.volcanicArena.x, z - LANDMARKS.volcanicArena.z);
  const crystalDist = Math.hypot(x - LANDMARKS.crystalShrine.x, z - LANDMARKS.crystalShrine.z);

  let h = fbm(x * 0.035, z * 0.035, 4, seed) * 1.95 + (e - LAND_THRESHOLD) * 1.1;

  // Rocky highlands craggy elevation
  if (w.rocky > 0.35) {
    const crag = Math.abs(fbm(x * 0.055 + 9, z * 0.055 - 4, 2, seed));
    h += w.rocky * (0.45 + crag * 1.35);
  }

  // Snowy rolling drifts
  if (w.snow > 0.35) {
    const drift = fbm(x * 0.03 - 17, z * 0.03 + 21, 2, seed);
    h += w.snow * (0.25 + drift * 0.85);
  }

  // Lagunas interiores naturales lejos de la costa (water plane sits at y = -0.34)
  if (e > 0.48) {
    const lakeNoise = fbm(x * 0.024 + 31, z * 0.024 - 19, 3, seed);
    if (lakeNoise < -0.27 && w.volcanic < 0.18 && w.rocky < 0.35) {
      h -= (-0.27 - lakeNoise) * 6.2;
    }
  }

  // Volcanic fissures & raised basalt plateaus (lava plane sits at y = -0.31)
  if (w.volcanic > 0.45 && e > 0.42) {
    const ridge = Math.abs(noise2D(x * 0.06, z * 0.06, seed));
    if (ridge < 0.08) h -= (0.08 - ridge) * 8.2;
    else h += w.volcanic * 0.65;
  }

  // Flatten village, refuges, all 5 biome boss arenas, crystal shrine, and main roads
  const flat = Math.max(
    path,
    smoothstep(32, 26, villageDist),
    smoothstep(12, 6.5, oakOutpostDist),
    smoothstep(12, 6.5, frostOutpostDist),
    smoothstep(13, 8, meadowArenaDist),
    smoothstep(14, 8, forestArenaDist),
    smoothstep(14, 8, rockyArenaDist),
    smoothstep(14, 8, snowArenaDist),
    smoothstep(16, 10, bossDist),
    smoothstep(9, 4.5, crystalDist)
  );
  h = lerp(h, 0.14, flat);

  // Transición suave de playa/costa en el borde del continente (E entre 0.30 y 0.40)
  const coastBlend = smoothstep(LAND_THRESHOLD, LAND_THRESHOLD + 0.11, e);
  h = lerp(-0.28, Math.max(0.05, h), coastBlend);
  return h;
}

export function getTerrainHeight(x: number, z: number, seed: number): number {
  const s = seed >>> 0;
  const w = getBiomeWeights(x, z, s);
  const path = getPathFactor(x, z);
  return computeTerrainHeightWithFactors(x, z, w, path, s);
}

// Coincide exactamente con E <= 0.3 (océano) o lagunas/fisuras visibles (-0.34 agua / -0.31 lava)
export function isLiquidAt(x: number, z: number, seed: number): boolean {
  const s = seed >>> 0;
  const path = getPathFactor(x, z);
  const e = getLandElevation(x, z, s, path);
  if (e <= LAND_THRESHOLD) return true;
  const w = getBiomeWeights(x, z, s);
  const h = computeTerrainHeightWithFactors(x, z, w, path, s, e);
  const threshold = w.volcanic > 0.46 ? -0.3 : -0.33;
  return h < threshold;
}

// ============================================================================
// PURE DATA GENERATION FOR CHUNKS (SHARED BY MAIN THREAD & WEB WORKER)
// ============================================================================
export const PROP_STRIDE = 7;     // [kind (0=tree,1=rock), biome, x, y, z, scale, rotY]
export const COLLIDER_STRIDE = 3; // [x, z, r]

export interface ChunkDataPayload {
  cx: number;
  cz: number;
  seed: number;
  dominantBiome: BiomeId;
  biomeMix: ChunkBiomeEntry[];
  hasLiquid: boolean;
  hasLava: boolean;
  heights: Float32Array;        // (segs+1)*(segs+1)
  normals: Float32Array;        // (segs+1)*(segs+1)*3
  colors: Float32Array;         // (segs+1)*(segs+1)*3
  biomeMap: Uint8Array;         // (segs+1)*(segs+1) biome IDs (0..4)
  grassCount: number;
  grassMatrices: Float32Array;  // grassCount * 16
  grassColors: Float32Array;    // grassCount * 3
  grassColorVars: Float32Array; // grassCount
  propCount: number;
  propData: Float32Array;       // propCount * PROP_STRIDE
  colliderCount: number;
  colliderData: Float32Array;   // colliderCount * COLLIDER_STRIDE
}

// Linear RGB constants derived strictly from PaletteEnvironment (Zelda clásico)
const C_MEADOW = [0x65 / 255, 0xa8 / 255, 0x45 / 255];
const C_FOREST = [0x45 / 255, 0x7d / 255, 0x5a / 255];
const C_VOLCANIC = [0x52 / 255, 0x46 / 255, 0x48 / 255];
const C_ROCKY = [0x99 / 255, 0x8e / 255, 0x7e / 255];
const C_SNOW = [0xdc / 255, 0xeb / 255, 0xf7 / 255];
const C_PATH = [0xc9 / 255, 0xa6 / 255, 0x6b / 255];
const C_SAND = [0xa0 / 255, 0x80 / 255, 0x50 / 255];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const L_MEADOW = C_MEADOW.map(srgbToLinear);
const L_FOREST = C_FOREST.map(srgbToLinear);
const L_VOLCANIC = C_VOLCANIC.map(srgbToLinear);
const L_ROCKY = C_ROCKY.map(srgbToLinear);
const L_SNOW = C_SNOW.map(srgbToLinear);
const L_PATH = C_PATH.map(srgbToLinear);
const L_SAND = C_SAND.map(srgbToLinear);

// Reusable padded scratch buffers to eliminate intermediate allocations
const PADDED_SIDE = CHUNK_CONFIG.CHUNK_SEGMENTS + 3;
const SCRATCH_HEIGHTS = new Float32Array(PADDED_SIDE * PADDED_SIDE);
const SCRATCH_MEADOW = new Float32Array(PADDED_SIDE * PADDED_SIDE);
const SCRATCH_FOREST = new Float32Array(PADDED_SIDE * PADDED_SIDE);
const SCRATCH_VOLCANIC = new Float32Array(PADDED_SIDE * PADDED_SIDE);
const SCRATCH_ROCKY = new Float32Array(PADDED_SIDE * PADDED_SIDE);
const SCRATCH_SNOW = new Float32Array(PADDED_SIDE * PADDED_SIDE);
const SCRATCH_PATH = new Float32Array(PADDED_SIDE * PADDED_SIDE);
const SCRATCH_ELEV = new Float32Array(PADDED_SIDE * PADDED_SIDE);

export function generateChunkData(cx: number, cz: number, seed: number): ChunkDataPayload {
  const resolvedSeed = normalizeSeed(seed);
  const size = CHUNK_CONFIG.CHUNK_SIZE;
  const segs = CHUNK_CONFIG.CHUNK_SEGMENTS;
  const step = size / segs;
  const vertsPerSide = segs + 1;
  const vertCount = vertsPerSide * vertsPerSide;

  const heights = new Float32Array(vertCount);
  const normals = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const biomeMap = new Uint8Array(vertCount);

  const originX = cx * size;
  const originZ = cz * size;
  const half = size * 0.5;
  const biomeMix = getChunkBiomeMix(cx, cz, resolvedSeed);
  const dominantBiome = biomeMix[0]?.biome ?? 0;
  let hasLiquid = false;
  let hasLava = false;
  let hasLand = false;

  // 1. Sample padded grid strictly with resolvedSeed
  for (let gz = 0; gz < PADDED_SIDE; gz++) {
    const wz = originZ - half + (gz - 1) * step;
    for (let gx = 0; gx < PADDED_SIDE; gx++) {
      const wx = originX - half + (gx - 1) * step;
      const gIdx = gz * PADDED_SIDE + gx;
      const w = getBiomeWeights(wx, wz, resolvedSeed);
      const path = getPathFactor(wx, wz);
      const elev = getLandElevation(wx, wz, resolvedSeed, path);
      SCRATCH_MEADOW[gIdx] = w.meadow;
      SCRATCH_FOREST[gIdx] = w.forest;
      SCRATCH_VOLCANIC[gIdx] = w.volcanic;
      SCRATCH_ROCKY[gIdx] = w.rocky;
      SCRATCH_SNOW[gIdx] = w.snow;
      SCRATCH_PATH[gIdx] = path;
      SCRATCH_ELEV[gIdx] = elev;
      SCRATCH_HEIGHTS[gIdx] = computeTerrainHeightWithFactors(wx, wz, w, path, resolvedSeed, elev);
    }
  }

  // 2. Populate exact chunk vertex buffers, biomeMap & seamless cross-border normals
  const twoStep = 2 * step;
  for (let iz = 0; iz < vertsPerSide; iz++) {
    const gz = iz + 1;
    for (let ix = 0; ix < vertsPerSide; ix++) {
      const gx = ix + 1;
      const gIdx = gz * PADDED_SIDE + gx;
      const idx = iz * vertsPerSide + ix;

      const y = SCRATCH_HEIGHTS[gIdx];
      heights[idx] = y;
      if (y < -0.22) {
        hasLiquid = true;
        if (SCRATCH_ELEV[gIdx] > 0.42 && SCRATCH_VOLCANIC[gIdx] > 0.45) {
          hasLava = true;
        }
      }
      if (SCRATCH_ELEV[gIdx] > LAND_THRESHOLD) hasLand = true;

      const hL = SCRATCH_HEIGHTS[gIdx - 1];
      const hR = SCRATCH_HEIGHTS[gIdx + 1];
      const hD = SCRATCH_HEIGHTS[gIdx - PADDED_SIDE];
      const hU = SCRATCH_HEIGHTS[gIdx + PADDED_SIDE];
      const nx = hL - hR;
      const ny = twoStep;
      const nz = hD - hU;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      normals[idx * 3] = nx / nLen;
      normals[idx * 3 + 1] = ny / nLen;
      normals[idx * 3 + 2] = nz / nLen;

      const wm = SCRATCH_MEADOW[gIdx];
      const wf = SCRATCH_FOREST[gIdx];
      const wv = SCRATCH_VOLCANIC[gIdx];
      const wr = SCRATCH_ROCKY[gIdx];
      const ws = SCRATCH_SNOW[gIdx];
      const path = SCRATCH_PATH[gIdx];

      biomeMap[idx] = wv >= wf && wv >= wr && wv >= ws && wv >= wm ? 2
        : wf >= wr && wf >= ws && wf >= wm ? 1
        : wr >= ws && wr >= wm ? 3
        : ws >= wm ? 4 : 0;

      let r = L_MEADOW[0] * wm + L_FOREST[0] * wf + L_VOLCANIC[0] * wv + L_ROCKY[0] * wr + L_SNOW[0] * ws;
      let g = L_MEADOW[1] * wm + L_FOREST[1] * wf + L_VOLCANIC[1] * wv + L_ROCKY[1] * wr + L_SNOW[1] * ws;
      let b = L_MEADOW[2] * wm + L_FOREST[2] * wf + L_VOLCANIC[2] * wv + L_ROCKY[2] * wr + L_SNOW[2] * ws;

      if (y < -0.1) {
        const st = smoothstep(-0.1, -0.45, y);
        r = lerp(r, L_SAND[0], st);
        g = lerp(g, L_SAND[1], st);
        b = lerp(b, L_SAND[2], st);
      }
      if (path > 0.05) {
        const blend = path * 0.85;
        let pr = L_PATH[0];
        let pg = L_PATH[1];
        let pb = L_PATH[2];
        if (wv > 0.45) {
          pr = lerp(L_VOLCANIC[0], L_PATH[0], 0.35);
          pg = lerp(L_VOLCANIC[1], L_PATH[1], 0.35);
          pb = lerp(L_VOLCANIC[2], L_PATH[2], 0.35);
        } else if (ws > 0.45) {
          pr = lerp(L_SNOW[0], L_PATH[0], 0.48);
          pg = lerp(L_SNOW[1], L_PATH[1], 0.48);
          pb = lerp(L_SNOW[2], L_PATH[2], 0.48);
        }
        r = lerp(r, pr, blend);
        g = lerp(g, pg, blend);
        b = lerp(b, pb, blend);
      }

      colors[idx * 3] = r;
      colors[idx * 3 + 1] = g;
      colors[idx * 3 + 2] = b;
    }
  }

  // 3. Strictly deterministic per-chunk RNG seeded by (resolvedSeed, cx, cz)
  const rng = createRng(hashChunkCoords(cx, cz, resolvedSeed));
  const propAttempts = hasLand ? 42 : 0;
  const rawPropData = new Float32Array(Math.max(1, propAttempts) * PROP_STRIDE);
  const rawColliderData = new Float32Array(Math.max(1, propAttempts) * COLLIDER_STRIDE);
  let propCount = 0;
  let colliderCount = 0;

  for (let i = 0; i < propAttempts; i++) {
    const wx = originX + (rng() * 2 - 1) * (half - 1.2);
    const wz = originZ + (rng() * 2 - 1) * (half - 1.2);
    const rollType = rng();
    const rollBiomeSkip = rng();
    const rollScale = rng();
    const rollRot = rng();

    // Keep props strictly on dry continent land (E > 0.34), off roads, and clear of towns/arenas
    if (getPathFactor(wx, wz) > 0.12) continue;
    const landElev = getLandElevation(wx, wz, resolvedSeed, 0);
    if (landElev <= LAND_THRESHOLD + 0.04) continue;
    if (Math.hypot(wx - LANDMARKS.village.x, wz - LANDMARKS.village.z) < 31) continue;
    if (Math.hypot(wx - LANDMARKS.oakOutpost.x, wz - LANDMARKS.oakOutpost.z) < 10) continue;
    if (Math.hypot(wx - LANDMARKS.frostOutpost.x, wz - LANDMARKS.frostOutpost.z) < 10) continue;
    if (Math.hypot(wx - LANDMARKS.meadowArena.x, wz - LANDMARKS.meadowArena.z) < 12) continue;
    if (Math.hypot(wx - LANDMARKS.forestArena.x, wz - LANDMARKS.forestArena.z) < 13) continue;
    if (Math.hypot(wx - LANDMARKS.rockyArena.x, wz - LANDMARKS.rockyArena.z) < 13) continue;
    if (Math.hypot(wx - LANDMARKS.snowArena.x, wz - LANDMARKS.snowArena.z) < 13) continue;
    if (Math.hypot(wx - LANDMARKS.volcanicArena.x, wz - LANDMARKS.volcanicArena.z) < 16) continue;
    if (Math.hypot(wx - LANDMARKS.crystalShrine.x, wz - LANDMARKS.crystalShrine.z) < 7) continue;

    const w = getBiomeWeights(wx, wz, resolvedSeed);
    // En zonas de transición entre biomas mezclamos la probabilidad de especies de árbol según pesos locales
    let b: BiomeId = pickBiomeFromWeights(w);
    const secEntry = biomeMix[1];
    if (secEntry && rng() < secEntry.weight * 0.65) {
      b = secEntry.biome;
    }
    const y = computeTerrainHeightWithFactors(wx, wz, w, 0, resolvedSeed, landElev);
    if (y < -0.1) continue;

    // Prevent props from overlapping each other inside the chunk
    let tooClose = false;
    for (let j = 0; j < propCount; j++) {
      const pOff = j * PROP_STRIDE;
      const dx = rawPropData[pOff + 2] - wx;
      const dz = rawPropData[pOff + 4] - wz;
      if (dx * dx + dz * dz < 6.2) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    if (b === 0 && rollBiomeSkip > 0.44) continue;
    if (b === 2 && rollBiomeSkip > 0.42) continue;
    if (b === 3 && rollBiomeSkip > 0.62) continue;
    if (b === 4 && rollBiomeSkip > 0.54) continue;

    const pOff = propCount * PROP_STRIDE;
    const cOff = colliderCount * COLLIDER_STRIDE;
    const treeChance = b === 3 ? 0.34 : b === 2 ? 0.62 : b === 4 ? 0.72 : 0.78;

    if (rollType < treeChance) {
      const scale = 0.85 + rollScale * 0.45;
      rawPropData[pOff] = 0; // tree
      rawPropData[pOff + 1] = b;
      rawPropData[pOff + 2] = wx;
      rawPropData[pOff + 3] = y;
      rawPropData[pOff + 4] = wz;
      rawPropData[pOff + 5] = scale;
      rawPropData[pOff + 6] = rollRot * Math.PI;
      propCount++;

      rawColliderData[cOff] = wx;
      rawColliderData[cOff + 1] = wz;
      rawColliderData[cOff + 2] = 0.4 * scale;
      colliderCount++;
    } else {
      const scale = (b === 3 ? 0.9 : 0.7) + rollScale * 0.75;
      rawPropData[pOff] = 1; // rock
      rawPropData[pOff + 1] = b;
      rawPropData[pOff + 2] = wx;
      rawPropData[pOff + 3] = y;
      rawPropData[pOff + 4] = wz;
      rawPropData[pOff + 5] = scale;
      rawPropData[pOff + 6] = rollRot * Math.PI * 2;
      propCount++;

      rawColliderData[cOff] = wx;
      rawColliderData[cOff + 1] = wz;
      rawColliderData[cOff + 2] = 0.62 * scale;
      colliderCount++;
    }
  }

  const propData = rawPropData.slice(0, propCount * PROP_STRIDE);
  const colliderData = rawColliderData.slice(0, colliderCount * COLLIDER_STRIDE);

  // 4. Deterministic Tall Grass Instances (zero-texture procedural blades blended by chunk biomeMix)
  const maxGrass = CHUNK_CONFIG.MAX_GRASS_PER_CHUNK;
  const grassMatrices = new Float32Array(maxGrass * 16);
  const grassColors = new Float32Array(maxGrass * 3);
  const grassColorVars = new Float32Array(maxGrass);
  let grassCount = 0;

  const G_MEADOW = [srgbToLinear(0x5a / 255), srgbToLinear(0x9e / 255), srgbToLinear(0x3e / 255)];
  const G_FOREST = [srgbToLinear(0x49 / 255), srgbToLinear(0x8a / 255), srgbToLinear(0x5b / 255)];
  const G_ROCKY = [srgbToLinear(0x9f / 255), srgbToLinear(0xa3 / 255), srgbToLinear(0x56 / 255)];
  const G_SNOW = [srgbToLinear(0x98 / 255), srgbToLinear(0xc5 / 255), srgbToLinear(0xb8 / 255)];
  const G_VOLCANIC = [srgbToLinear(0x70 / 255), srgbToLinear(0x55 / 255), srgbToLinear(0x49 / 255)];

  const grassForBiome = (bid: BiomeId): number[] =>
    bid === 1 ? G_FOREST : bid === 3 ? G_ROCKY : bid === 4 ? G_SNOW : bid === 2 ? G_VOLCANIC : G_MEADOW;

  const secBiome = biomeMix[1];
  const grassTries = hasLand ? maxGrass * 3 : 0;
  for (let tries = 0; tries < grassTries && grassCount < maxGrass; tries++) {
    const lx = (rng() * 2 - 1) * (half - 0.3);
    const lz = (rng() * 2 - 1) * (half - 0.3);
    const wx = originX + lx;
    const wz = originZ + lz;
    const sc = 0.78 + rng() * 0.52;
    const rotY = rng() * Math.PI * 2;
    const colorVar = rng();
    const mixRoll = rng();

    const path = getPathFactor(wx, wz);
    if (path > 0.32) continue;
    if (Math.hypot(wx - LANDMARKS.village.x, wz - LANDMARKS.village.z) < 24.5) continue;
    const landElev = getLandElevation(wx, wz, resolvedSeed, path);
    if (landElev <= LAND_THRESHOLD + 0.04) continue;

    const w = getBiomeWeights(wx, wz, resolvedSeed);
    const localDom = pickBiomeFromWeights(w);

    // Transición gradual de densidad en nieve/volcánico: si hay peso secundario verde, aparecen mechones dispersos
    const greenSupport = w.meadow + w.forest + w.rocky * 0.45;
    if ((localDom === 2 || localDom === 4) && rng() > greenSupport * 0.85) continue;
    if (localDom === 3 && rng() > 0.32 + (w.meadow + w.forest) * 0.55) continue;

    const y = computeTerrainHeightWithFactors(wx, wz, w, path, resolvedSeed, landElev);
    if (y < -0.1) continue;

    const cR = Math.cos(rotY);
    const sR = Math.sin(rotY);
    const mOff = grassCount * 16;
    grassMatrices[mOff + 0] = cR * sc;
    grassMatrices[mOff + 2] = -sR * sc;
    grassMatrices[mOff + 5] = sc;
    grassMatrices[mOff + 8] = sR * sc;
    grassMatrices[mOff + 10] = cR * sc;
    grassMatrices[mOff + 12] = wx;
    grassMatrices[mOff + 13] = y - 0.04;
    grassMatrices[mOff + 14] = wz;
    grassMatrices[mOff + 15] = 1;

    // Mezcla visual por pesos del chunk: % secundario usa color del bioma secundario, resto primario
    const chosenBiome: BiomeId =
      secBiome && mixRoll < secBiome.weight ? secBiome.biome : dominantBiome;
    const baseG = grassForBiome(chosenBiome);
    const localG = grassForBiome(localDom);
    const cOff = grassCount * 3;
    grassColors[cOff] = lerp(baseG[0], localG[0], 0.3);
    grassColors[cOff + 1] = lerp(baseG[1], localG[1], 0.3);
    grassColors[cOff + 2] = lerp(baseG[2], localG[2], 0.3);
    grassColorVars[grassCount] = colorVar;
    grassCount++;
  }

  return {
    cx,
    cz,
    seed: resolvedSeed,
    dominantBiome,
    biomeMix,
    hasLiquid,
    hasLava,
    heights,
    normals,
    colors,
    biomeMap,
    grassCount,
    grassMatrices,
    grassColors,
    grassColorVars,
    propCount,
    propData,
    colliderCount,
    colliderData,
  };
}
