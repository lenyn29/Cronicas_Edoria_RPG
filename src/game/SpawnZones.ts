import {
  BESTIARY,
  BESTIARY_LIST,
  BestiaryEntry,
  BestiaryMobId,
  BestiaryVariant,
  SpawnZoneId,
} from './Bestiary';
import { BiomeId } from './types';
import { clamp, isLiquidAt, LANDMARKS, PLAY_BOUND } from './worldMath';

export interface SpawnZone {
  id: SpawnZoneId;
  name: string;
  biome: BiomeId;
  biomeColor: string;
  center: { x: number; z: number };
  radiusRange: [number, number];
  mobs: BestiaryMobId[];
  levelRange: { min: number; max: number };
  aggroRange: number;
  maxMobs: number;
  respawnTime: number;
  sectorCenterAngle: number;
  sectorSpan: number;
  strictSector?: boolean;
}

interface ZoneBlueprint {
  id: SpawnZoneId;
  name: string;
  biome: BiomeId;
  biomeColor: string;
  radiusRange: [number, number];
  aggroRange: number;
  maxMobs: number;
  respawnTime: number;
  sectorCenterAngle: number;
  sectorSpan: number;
  strictSector?: boolean;
}

const ZONE_BLUEPRINTS: ZoneBlueprint[] = [
  {
    id: 'north_plains',
    name: 'Llanura Norte',
    biome: 0,
    biomeColor: '#569c42',
    radiusRange: [30, 50],
    aggroRange: 7.5,
    maxMobs: 10,
    respawnTime: 24,
    sectorCenterAngle: -Math.PI * 0.5,
    sectorSpan: Math.PI * 0.44,
    strictSector: true,
  },
  {
    id: 'south_plains',
    name: 'Llanura Sur',
    biome: 0,
    biomeColor: '#769148',
    radiusRange: [30, 50],
    aggroRange: 7.5,
    maxMobs: 10,
    respawnTime: 24,
    sectorCenterAngle: Math.PI * 0.5,
    sectorSpan: Math.PI * 0.44,
    strictSector: true,
  },
  {
    id: 'east_woods',
    name: 'Bosque Este',
    biome: 1,
    biomeColor: '#4c7356',
    radiusRange: [35, 55],
    aggroRange: 8,
    maxMobs: 10,
    respawnTime: 26,
    sectorCenterAngle: 0,
    sectorSpan: Math.PI * 0.44,
    strictSector: true,
  },
  {
    id: 'west_hills',
    name: 'Colinas Oeste',
    biome: 0,
    biomeColor: '#5cb85c',
    radiusRange: [30, 50],
    aggroRange: 7.5,
    maxMobs: 10,
    respawnTime: 24,
    sectorCenterAngle: Math.PI,
    sectorSpan: Math.PI * 0.44,
    strictSector: true,
  },
  {
    id: 'forest_edge',
    name: 'Borde del Bosque',
    biome: 1,
    biomeColor: '#40824a',
    radiusRange: [52, 76],
    aggroRange: 8,
    maxMobs: 16,
    respawnTime: 28,
    sectorCenterAngle: 0,
    sectorSpan: Math.PI * 2,
  },
  {
    id: 'mid_forest',
    name: 'Bosque Medio',
    biome: 1,
    biomeColor: '#356a4b',
    radiusRange: [65, 95],
    aggroRange: 8,
    maxMobs: 24,
    respawnTime: 30,
    sectorCenterAngle: -Math.PI * 0.72,
    sectorSpan: Math.PI * 1.45,
  },
  {
    id: 'deep_forest',
    name: 'Bosque Profundo',
    biome: 1,
    biomeColor: '#225238',
    radiusRange: [90, 125],
    aggroRange: 8,
    maxMobs: 26,
    respawnTime: 32,
    sectorCenterAngle: -Math.PI * 0.75,
    sectorSpan: Math.PI * 1.25,
  },
  {
    id: 'rocky_hills',
    name: 'Colinas Rocosas',
    biome: 3,
    biomeColor: '#877a6a',
    radiusRange: [120, 160],
    aggroRange: 8,
    maxMobs: 24,
    respawnTime: 34,
    sectorCenterAngle: Math.PI * 0.75,
    sectorSpan: Math.PI * 1.25,
  },
  {
    id: 'swamp',
    name: 'Ciénaga',
    biome: 4,
    biomeColor: '#527982',
    radiusRange: [155, 200],
    aggroRange: 8,
    maxMobs: 22,
    respawnTime: 35,
    sectorCenterAngle: Math.PI * 0.25,
    sectorSpan: Math.PI * 1.25,
  },
  {
    id: 'ancient_ruins',
    name: 'Ruinas Antiguas',
    biome: 2,
    biomeColor: '#9e3a32',
    radiusRange: [195, 250],
    aggroRange: 12,
    maxMobs: 25,
    respawnTime: 38,
    sectorCenterAngle: -Math.PI * 0.25,
    sectorSpan: Math.PI * 1.2,
  },
];

function buildDerivedZones(): SpawnZone[] {
  return ZONE_BLUEPRINTS.map((bp) => {
    const mobs = BESTIARY_LIST.filter((entry) => entry.zones.includes(bp.id)).map((entry) => entry.id);
    let minLvl = Infinity;
    let maxLvl = -Infinity;
    for (const mobId of mobs) {
      const entry = BESTIARY[mobId];
      for (const v of entry.variants) {
        if (v.level < minLvl) minLvl = v.level;
        if (v.level > maxLvl) maxLvl = v.level;
      }
    }
    return {
      ...bp,
      center: { x: LANDMARKS.village.x, z: LANDMARKS.village.z },
      mobs,
      levelRange: {
        min: Number.isFinite(minLvl) ? minLvl : 1,
        max: Number.isFinite(maxLvl) ? maxLvl : 20,
      },
    };
  });
}

export const SPAWN_ZONES: SpawnZone[] = buildDerivedZones();

const SPAWN_ZONE_MAP = new Map<string, SpawnZone>(SPAWN_ZONES.map((z) => [z.id, z]));

const ARENA_EXCLUSIONS = [
  LANDMARKS.meadowArena,
  LANDMARKS.forestArena,
  LANDMARKS.rockyArena,
  LANDMARKS.snowArena,
  LANDMARKS.volcanicArena,
];

const SAFE_OUTPOST_EXCLUSIONS = [
  LANDMARKS.oakOutpost,
  LANDMARKS.frostOutpost,
];

export function getSpawnZoneById(zoneId?: string): SpawnZone | undefined {
  return zoneId ? SPAWN_ZONE_MAP.get(zoneId) : undefined;
}

/**
 * Picks variant 0 near radiusRange[0], variant 1 in the middle, and variant 2 near radiusRange[1].
 * For starter 20m rings around city gates: <= 5m => v0 (Nv.1/2), <= 15m => v1, > 15m => v2.
 */
export function pickZoneVariantForDistance(
  mob: BestiaryEntry,
  zone: SpawnZone,
  x: number,
  z: number
): BestiaryVariant {
  const distFromTown = Math.hypot(x - zone.center.x, z - zone.center.z);
  const span = Math.max(1, zone.radiusRange[1] - zone.radiusRange[0]);
  const dFromMin = distFromTown - zone.radiusRange[0];
  let idx: 0 | 1 | 2;
  if (span <= 26) {
    idx = dFromMin <= 5 ? 0 : dFromMin <= 15 ? 1 : 2;
  } else {
    const t = clamp(dFromMin / span, 0, 0.999);
    idx = Math.min(2, Math.floor(t * 3)) as 0 | 1 | 2;
  }
  return mob.variants[idx];
}

export function isValidZoneSpawnPoint(
  zone: SpawnZone,
  x: number,
  z: number,
  worldSeed: number,
  avoidPos?: { x: number; z: number; minDist: number }
): boolean {
  if (Math.abs(x) > PLAY_BOUND - 8 || Math.abs(z) > PLAY_BOUND - 8) return false;
  if (isLiquidAt(x, z, worldSeed)) return false;

  const dx = x - zone.center.x;
  const dz = z - zone.center.z;
  const distTown = Math.hypot(dx, dz);
  if (distTown < Math.max(30, zone.radiusRange[0] - 0.25) || distTown > zone.radiusRange[1] + 0.5) {
    return false;
  }

  if (zone.strictSector && zone.sectorSpan < Math.PI * 1.98) {
    const ang = Math.atan2(dz, dx);
    let diff = ang - zone.sectorCenterAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > zone.sectorSpan * 0.5) return false;
  }

  for (let i = 0; i < ARENA_EXCLUSIONS.length; i++) {
    const a = ARENA_EXCLUSIONS[i];
    if (Math.hypot(x - a.x, z - a.z) < 11) return false;
  }

  for (let i = 0; i < SAFE_OUTPOST_EXCLUSIONS.length; i++) {
    const o = SAFE_OUTPOST_EXCLUSIONS[i];
    if (Math.hypot(x - o.x, z - o.z) < 10) return false;
  }

  if (avoidPos && Math.hypot(x - avoidPos.x, z - avoidPos.z) < avoidPos.minDist) {
    return false;
  }

  return true;
}

export function pickZoneSpawnPoint(
  zone: SpawnZone,
  worldSeed: number,
  rng: () => number,
  avoidPos?: { x: number; z: number; minDist: number },
  maxAttempts = 44
): { x: number; z: number } | null {
  const [minR, maxR] = zone.radiusRange;
  const rSqMin = minR * minR;
  const rSqMax = maxR * maxR;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const useSector = zone.strictSector || attempt < Math.floor(maxAttempts * 0.72);
    const angle = useSector
      ? zone.sectorCenterAngle + (rng() - 0.5) * zone.sectorSpan
      : rng() * Math.PI * 2;
    const r = Math.sqrt(rSqMin + rng() * Math.max(1, rSqMax - rSqMin));
    const x = zone.center.x + Math.cos(angle) * r;
    const z = zone.center.z + Math.sin(angle) * r;
    if (isValidZoneSpawnPoint(zone, x, z, worldSeed, avoidPos)) {
      return { x, z };
    }
  }
  return null;
}

export function pickBestiaryMobForPosition(
  zone: SpawnZone,
  x: number,
  z: number,
  rng: () => number
): { entry: BestiaryEntry; variant: BestiaryVariant } {
  const distFromTown = Math.hypot(x - zone.center.x, z - zone.center.z);
  const candidates = zone.mobs.map((id) => BESTIARY[id]);
  const inSubRange = candidates.filter(
    (m) => distFromTown >= m.distanceRange[0] - 4 && distFromTown <= m.distanceRange[1] + 4
  );
  const pool = inSubRange.length > 0 ? inSubRange : candidates;
  const entry = pool[Math.floor(rng() * pool.length)];
  const variant = pickZoneVariantForDistance(entry, zone, x, z);
  return { entry, variant };
}
