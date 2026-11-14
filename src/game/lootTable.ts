import {
  ArmorPieceDef,
  BiomeId,
  EnemyKind,
  GearSlot,
  GearStyle,
  LootRarity,
  MaterialId,
  WeaponDef,
} from './types';
import { createRng, hash2D, normalizeSeed } from './worldMath';

export interface MaterialMeta {
  id: MaterialId;
  name: string;
  rarity: LootRarity;
  desc: string;
}

export const GEAR_SLOT_ORDER: GearSlot[] = ['helmet', 'armor', 'gloves', 'boots', 'weapon', 'offhand'];

export const GEAR_SLOT_LABEL: Record<GearSlot, string> = {
  helmet: 'Casco',
  armor: 'Armadura',
  gloves: 'Guantes',
  boots: 'Botas',
  weapon: 'Mano Princ.',
  offhand: 'Mano Sec.',
};

export const RARITY_COLOR: Record<LootRarity, string> = {
  comun: '#d6d3d1',
  poco_comun: '#86efac',
  raro: '#60a5fa',
  epico: '#f43f5e',
  mitico: '#fbbf24',
};

export const RARITY_LABEL: Record<LootRarity, string> = {
  comun: 'Común',
  poco_comun: 'Poco Común',
  raro: 'Raro',
  epico: 'Épico',
  mitico: 'Mítico',
};

export const MATERIAL_META: Record<MaterialId, MaterialMeta> = {
  slime_gel: {
    id: 'slime_gel',
    name: 'Esencia de Slime',
    rarity: 'comun',
    desc: 'Gel alquímico obtenido de los Slimes de la Pradera.',
  },
  stone_ore: {
    id: 'stone_ore',
    name: 'Mena de Roca',
    rarity: 'comun',
    desc: 'Mineral sólido extraído de Gólems de Roca (50% caída).',
  },
  bronze_ore: {
    id: 'bronze_ore',
    name: 'Mena de Bronce',
    rarity: 'poco_comun',
    desc: 'Aleación natural resistente de Gólems de Roca (30% caída).',
  },
  ancestral_wood: {
    id: 'ancestral_wood',
    name: 'Madera Ancestral',
    rarity: 'poco_comun',
    desc: 'Corazón de roble viviente obtenido de Ents del Bosque (20% caída).',
  },
  wolf_pelt: {
    id: 'wolf_pelt',
    name: 'Piel de Lobo',
    rarity: 'poco_comun',
    desc: 'Pelaje grueso aislante de Lobos Grises de la Nieve (20% caída).',
  },
  iron_ore: {
    id: 'iron_ore',
    name: 'Mena de Hierro',
    rarity: 'raro',
    desc: 'Mineral férreo puro de Gólems de Roca (10% caída).',
  },
  ice_shard: {
    id: 'ice_shard',
    name: 'Esquirla de Hielo',
    rarity: 'raro',
    desc: 'Cristal glacial eterno de Gólems de Hielo (20% caída).',
  },
  obsidian_ore: {
    id: 'obsidian_ore',
    name: 'Mena de Obsidiana',
    rarity: 'epico',
    desc: 'Vidrio volcánico forjado en magma de Gólems de Lava (20% caída).',
  },
  dark_steel: {
    id: 'dark_steel',
    name: 'Acero Sombrío',
    rarity: 'raro',
    desc: 'Fragmento de armadura de Caballeros Oscuros.',
  },
  void_orb: {
    id: 'void_orb',
    name: 'Orbe del Vacío',
    rarity: 'raro',
    desc: 'Núcleo arcano concentrado de Magos del Vacío.',
  },
  ignis_core: {
    id: 'ignis_core',
    name: 'Núcleo de Ignis Rex',
    rarity: 'mitico',
    desc: 'Trofeo ardiente del Titán de las Tierras Volcánicas.',
  },
};

export const WEAPONS: WeaponDef[] = [
  {
    id: 'basic_sword',
    slot: 'weapon',
    weaponKind: 'sword',
    style: 'basic',
    name: 'Espada de Aprendiz',
    atk: 6,
    mag: 0,
    reach: 0.4,
    rarity: 'comun',
    desc: 'Espada básica entregada por el Maestro Guerrero Kael.',
    craftable: false,
  },
  {
    id: 'stone_blade',
    slot: 'weapon',
    weaponKind: 'sword',
    style: 'rock',
    name: 'Espada de Roca y Roble',
    atk: 11,
    mag: 0,
    reach: 0.6,
    rarity: 'comun',
    desc: 'Forjada con mena de roca y madera ancestral.',
    craftable: true,
    recipe: { stone_ore: 3, ancestral_wood: 2 },
  },
  {
    id: 'bronze_dagger',
    slot: 'weapon',
    weaponKind: 'dagger',
    style: 'bronze',
    name: 'Daga de Bronce',
    atk: 15,
    mag: 3,
    reach: 0.45,
    atkSpeedPct: 14,
    critChancePct: 5,
    rarity: 'poco_comun',
    desc: 'Daga ágil compatible con doble empuñadura (50% daño en mano sec., 100% vel. ataque).',
    craftable: true,
    recipe: { bronze_ore: 3, ancestral_wood: 1 },
  },
  {
    id: 'bronze_saber',
    slot: 'weapon',
    weaponKind: 'sword',
    style: 'bronze',
    name: 'Sable de Bronce',
    atk: 21,
    mag: 4,
    reach: 0.85,
    rarity: 'poco_comun',
    desc: 'Hoja equilibrada de bronce templado.',
    craftable: true,
    recipe: { bronze_ore: 4, ancestral_wood: 2 },
  },
  {
    id: 'frost_dagger',
    slot: 'weapon',
    weaponKind: 'dagger',
    style: 'glacial',
    name: 'Daga de Escarcha',
    atk: 28,
    mag: 10,
    reach: 0.55,
    atkSpeedPct: 18,
    critChancePct: 7,
    rarity: 'raro',
    desc: 'Daga ligera de escarcha; puede equiparse una en cada mano.',
    craftable: true,
    recipe: { iron_ore: 2, ice_shard: 2, wolf_pelt: 1 },
  },
  {
    id: 'crimson_dagger',
    slot: 'weapon',
    weaponKind: 'dagger',
    style: 'crimson',
    name: 'Daga Carmesí',
    atk: 38,
    mag: 14,
    reach: 0.65,
    atkSpeedPct: 22,
    critChancePct: 10,
    rarity: 'epico',
    desc: 'Daga legendaria de los Conejos Guerreros. Doble empuñadura permitida.',
    craftable: false,
  },
  {
    id: 'frost_iron_blade',
    slot: 'weapon',
    weaponKind: 'sword',
    style: 'glacial',
    name: 'Hoja de Hierro Glacial',
    atk: 40,
    mag: 12,
    reach: 1.05,
    rarity: 'raro',
    desc: 'Acero frío imbuido con esquirlas eternas.',
    craftable: true,
    recipe: { iron_ore: 3, ice_shard: 3, wolf_pelt: 1 },
  },
  {
    id: 'obsidian_greatsword',
    slot: 'weapon',
    weaponKind: 'sword',
    style: 'obsidian',
    name: 'Mandoble de Obsidiana',
    atk: 64,
    mag: 22,
    reach: 1.3,
    rarity: 'mitico',
    desc: 'Arma volcánica suprema forjada en magma y acero.',
    craftable: true,
    recipe: { obsidian_ore: 4, iron_ore: 3, ice_shard: 2 },
  },
];

export const ARMOR_PIECES: ArmorPieceDef[] = [
  // Basic Starter Set (Maestro Guerrero Kael Quest Rewards)
  {
    id: 'basic_helmet',
    slot: 'helmet',
    style: 'basic',
    name: 'Yelmo de Recluta',
    hp: 24,
    mp: 0,
    def: 3,
    rarity: 'comun',
    desc: 'Casco ligero otorgado por el Maestro Guerrero.',
    craftable: false,
  },
  {
    id: 'basic_armor',
    slot: 'armor',
    style: 'basic',
    name: 'Cota de Soldado',
    hp: 34,
    mp: 0,
    def: 4,
    rarity: 'comun',
    desc: 'Armadura básica de guardia otorgada por el Maestro Guerrero.',
    craftable: false,
  },
  {
    id: 'basic_gloves',
    slot: 'gloves',
    style: 'basic',
    name: 'Guantes de Entrenamiento',
    hp: 10,
    mp: 0,
    def: 1,
    atk: 3,
    atkSpeedPct: 4,
    critChancePct: 2,
    rarity: 'comun',
    desc: 'Guantes de cuero reforzado para empuñar mejor tu arma.',
    craftable: false,
  },
  {
    id: 'basic_boots',
    slot: 'boots',
    style: 'basic',
    name: 'Botas de Cuero Ligero',
    hp: 15,
    mp: 0,
    def: 2,
    moveSpeed: 0.35,
    rarity: 'comun',
    desc: 'Botas ágiles entregadas por el Maestro Guerrero.',
    craftable: false,
  },

  // Rock Tier
  {
    id: 'rock_helmet',
    slot: 'helmet',
    style: 'rock',
    name: 'Casco de Roca',
    hp: 36,
    mp: 0,
    def: 4,
    rarity: 'comun',
    desc: 'Yelmo tallado en piedra densa y forrado en piel.',
    craftable: true,
    recipe: { stone_ore: 2, wolf_pelt: 1 },
  },
  {
    id: 'rock_hide_armor',
    slot: 'armor',
    style: 'rock',
    name: 'Coraza de Roca y Piel',
    hp: 48,
    mp: 0,
    def: 5,
    rarity: 'comun',
    desc: 'Protección firme de placas pétreas y piel gruesa.',
    craftable: true,
    recipe: { stone_ore: 3, wolf_pelt: 2 },
  },
  {
    id: 'rock_gloves',
    slot: 'gloves',
    style: 'rock',
    name: 'Guanteletes de Roca',
    hp: 18,
    mp: 0,
    def: 2,
    atk: 5,
    atkSpeedPct: 5,
    rarity: 'comun',
    desc: 'Puños reforzados con la solidez del granito.',
    craftable: true,
    recipe: { stone_ore: 2, ancestral_wood: 1 },
  },
  {
    id: 'rock_boots',
    slot: 'boots',
    style: 'rock',
    name: 'Botas Reforzadas de Roca',
    hp: 25,
    mp: 0,
    def: 3,
    moveSpeed: 0.45,
    rarity: 'comun',
    desc: 'Botas estables para terrenos escarpados.',
    craftable: true,
    recipe: { stone_ore: 2, wolf_pelt: 1 },
  },

  // Bronze Tier
  {
    id: 'bronze_helmet',
    slot: 'helmet',
    style: 'bronze',
    name: 'Casco de Bronce',
    hp: 65,
    mp: 8,
    def: 6,
    rarity: 'poco_comun',
    desc: 'Yelmo con cresta de bronce templado.',
    craftable: true,
    recipe: { bronze_ore: 3, wolf_pelt: 1 },
  },
  {
    id: 'bronze_mail',
    slot: 'armor',
    style: 'bronze',
    name: 'Malla de Bronce',
    hp: 105,
    mp: 10,
    def: 9,
    rarity: 'poco_comun',
    desc: 'Anillas de bronce forjadas sobre cuero resistente.',
    craftable: true,
    recipe: { bronze_ore: 4, wolf_pelt: 2 },
  },
  {
    id: 'bronze_gloves',
    slot: 'gloves',
    style: 'bronze',
    name: 'Brazales de Bronce',
    hp: 30,
    mp: 5,
    def: 4,
    atk: 9,
    atkSpeedPct: 8,
    critChancePct: 4,
    rarity: 'poco_comun',
    desc: 'Guantes articulados que aceleran cada estocada.',
    craftable: true,
    recipe: { bronze_ore: 3, ancestral_wood: 1 },
  },
  {
    id: 'bronze_boots',
    slot: 'boots',
    style: 'bronze',
    name: 'Botas de Bronce',
    hp: 45,
    mp: 0,
    def: 5,
    moveSpeed: 0.65,
    rarity: 'poco_comun',
    desc: 'Grebas ligeras de bronce con suela reforzada.',
    craftable: true,
    recipe: { bronze_ore: 3, wolf_pelt: 1 },
  },

  // Glacial Tier
  {
    id: 'glacial_helmet',
    slot: 'helmet',
    style: 'glacial',
    name: 'Casco de Hierro Glacial',
    hp: 115,
    mp: 16,
    def: 11,
    rarity: 'raro',
    desc: 'Yelmo coronado por runas de escarcha eterna.',
    craftable: true,
    recipe: { iron_ore: 2, ice_shard: 2 },
  },
  {
    id: 'glacial_plate',
    slot: 'armor',
    style: 'glacial',
    name: 'Armadura de Hierro Glacial',
    hp: 205,
    mp: 25,
    def: 17,
    rarity: 'raro',
    desc: 'Placas de hierro reforzadas con hielo rúnico.',
    craftable: true,
    recipe: { iron_ore: 3, ice_shard: 3, wolf_pelt: 2 },
  },
  {
    id: 'glacial_gloves',
    slot: 'gloves',
    style: 'glacial',
    name: 'Guantes Glaciales',
    hp: 55,
    mp: 12,
    def: 7,
    atk: 14,
    mag: 7,
    atkSpeedPct: 11,
    critChancePct: 6,
    rarity: 'raro',
    desc: 'Manoplas de escarcha que potencian acero y magia.',
    craftable: true,
    recipe: { iron_ore: 2, ice_shard: 2 },
  },
  {
    id: 'glacial_boots',
    slot: 'boots',
    style: 'glacial',
    name: 'Botas Glaciales',
    hp: 85,
    mp: 8,
    def: 9,
    moveSpeed: 0.85,
    rarity: 'raro',
    desc: 'Botas forradas con piel de lobo e hierro helado.',
    craftable: true,
    recipe: { iron_ore: 2, wolf_pelt: 2, ice_shard: 1 },
  },

  // Obsidian Tier
  {
    id: 'obsidian_helmet',
    slot: 'helmet',
    style: 'obsidian',
    name: 'Casco de Obsidiana',
    hp: 190,
    mp: 30,
    def: 17,
    rarity: 'mitico',
    desc: 'Yelmo ígneo forjado en cristal volcánico irrompible.',
    craftable: true,
    recipe: { obsidian_ore: 3, iron_ore: 2 },
  },
  {
    id: 'obsidian_aegis',
    slot: 'armor',
    style: 'obsidian',
    name: 'Égida de Obsidiana',
    hp: 360,
    mp: 55,
    def: 30,
    rarity: 'mitico',
    desc: 'Armadura volcánica impenetrable contra llamas abisales.',
    craftable: true,
    recipe: { obsidian_ore: 5, iron_ore: 3, ice_shard: 3 },
  },
  {
    id: 'obsidian_gloves',
    slot: 'gloves',
    style: 'obsidian',
    name: 'Guantes de Obsidiana',
    hp: 95,
    mp: 22,
    def: 11,
    atk: 22,
    mag: 12,
    atkSpeedPct: 15,
    critChancePct: 9,
    rarity: 'mitico',
    desc: 'Guanteletes volcánicos de precisión letal.',
    craftable: true,
    recipe: { obsidian_ore: 3, dark_steel: 1 },
  },
  {
    id: 'obsidian_boots',
    slot: 'boots',
    style: 'obsidian',
    name: 'Botas de Obsidiana',
    hp: 140,
    mp: 15,
    def: 14,
    moveSpeed: 1.1,
    rarity: 'mitico',
    desc: 'Grebas volcánicas que permiten correr sobre cenizas.',
    craftable: true,
    recipe: { obsidian_ore: 3, wolf_pelt: 2 },
  },
];

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const ARMOR_PIECE_MAP: Record<string, ArmorPieceDef> = Object.fromEntries(
  ARMOR_PIECES.map((a) => [a.id, a])
);

export function getGearDef(id: string): WeaponDef | ArmorPieceDef | undefined {
  return WEAPON_MAP[id] ?? ARMOR_PIECE_MAP[id];
}

export function getGearStyle(id: string | null): GearStyle | null {
  if (!id) return null;
  return getGearDef(id)?.style ?? null;
}

export const MAX_UPGRADE_TIER = 5;

export function getUpgradeMultiplier(tier: number): number {
  return 1 + Math.max(0, tier) * 0.28;
}

export function formatGearStats(def: WeaponDef | ArmorPieceDef, tier: number, asOffhand = false): string {
  const mult = getUpgradeMultiplier(tier);
  if (def.slot === 'weapon') {
    const dmgScale = asOffhand ? 0.5 : 1;
    const atk = Math.round(def.atk * mult * dmgScale);
    const mag = Math.round(def.mag * mult * dmgScale);
    const parts = [`+${atk} Atq`];
    if (mag > 0) parts.push(`+${mag} Mag`);
    if (def.atkSpeedPct) parts.push(`+${def.atkSpeedPct}% Vel.Atq`);
    if (def.critChancePct) parts.push(`+${def.critChancePct}% Crít`);
    if (!asOffhand) parts.push(`+${def.reach.toFixed(1)} Alc`);
    return parts.join(' · ');
  }
  const parts: string[] = [];
  const defVal = Math.round(def.def * mult);
  const hpVal = Math.round(def.hp * mult);
  const mpVal = Math.round(def.mp * mult);
  const atkVal = def.atk ? Math.round(def.atk * mult) : 0;
  const magVal = def.mag ? Math.round(def.mag * mult) : 0;
  if (defVal > 0) parts.push(`+${defVal} Def`);
  if (hpVal > 0) parts.push(`+${hpVal} Vida`);
  if (mpVal > 0) parts.push(`+${mpVal} Maná`);
  if (atkVal > 0) parts.push(`+${atkVal} Atq`);
  if (magVal > 0) parts.push(`+${magVal} Mag`);
  if (def.atkSpeedPct) parts.push(`+${def.atkSpeedPct}% Vel.Atq`);
  if (def.critChancePct) parts.push(`+${def.critChancePct}% Crít`);
  if (def.moveSpeed) parts.push(`+${def.moveSpeed.toFixed(1)} Vel`);
  return parts.join(' · ');
}

export function getUpgradeRecipe(currentTier: number): Partial<Record<MaterialId, number>> | null {
  if (currentTier >= MAX_UPGRADE_TIER) return null;
  switch (currentTier) {
    case 0:
      return { stone_ore: 2, ancestral_wood: 1 };
    case 1:
      return { bronze_ore: 3, wolf_pelt: 1 };
    case 2:
      return { iron_ore: 2, ice_shard: 2 };
    case 3:
      return { ice_shard: 3, obsidian_ore: 2 };
    case 4:
      return { obsidian_ore: 4, iron_ore: 2, dark_steel: 1 };
    default:
      return null;
  }
}

export function createEmptyMaterials(): Record<MaterialId, number> {
  return {
    slime_gel: 0,
    ancestral_wood: 0,
    stone_ore: 0,
    bronze_ore: 0,
    iron_ore: 0,
    wolf_pelt: 0,
    ice_shard: 0,
    obsidian_ore: 0,
    dark_steel: 0,
    void_orb: 0,
    ignis_core: 0,
  };
}

export interface LootDropResult {
  gold: number;
  consumable: 'potion' | 'elixir' | null;
  materials: Array<{ id: MaterialId; qty: number; rarity: LootRarity }>;
  weaponDrop: string | null;
  rarityHighlight: LootRarity;
}

function hashEnemyKind(kind: EnemyKind): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < kind.length; i++) {
    h ^= kind.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic loot evaluator parameterized strictly by (worldSeed, enemyType, level, biomeId, killOrdinal).
 */
export function rollDeterministicLoot(
  enemyType: EnemyKind,
  biomeId: BiomeId,
  level: number,
  killOrdinal: number,
  worldSeed: number | string
): LootDropResult {
  const seedNum = normalizeSeed(worldSeed);
  const rollSeed = hash2D(hashEnemyKind(enemyType) ^ (level * 7919) ^ (biomeId * 131), killOrdinal + 1, seedNum);
  const rng = createRng(rollSeed);

  const materials: Array<{ id: MaterialId; qty: number; rarity: LootRarity }> = [];
  let weaponDrop: string | null = null;
  let rarityHighlight: LootRarity = 'comun';

  const pushMat = (id: MaterialId, qty = 1) => {
    const meta = MATERIAL_META[id];
    materials.push({ id, qty, rarity: meta.rarity });
    const rank: Record<LootRarity, number> = { comun: 0, poco_comun: 1, raro: 2, epico: 3, mitico: 4 };
    if (rank[meta.rarity] > rank[rarityHighlight]) rarityHighlight = meta.rarity;
  };

  const baseGold = enemyType.startsWith('boss') ? 140 + level * 22 : 6 + Math.round(level * 2.2);
  const gold = Math.round(baseGold * (0.85 + rng() * 0.35));

  const consRoll = rng();
  const consumable: 'potion' | 'elixir' | null =
    enemyType.startsWith('boss')
      ? 'potion'
      : consRoll < 0.26
        ? 'potion'
        : consRoll < 0.42
          ? 'elixir'
          : null;

  if (enemyType === 'slime') {
    if (rng() < 0.55) pushMat('slime_gel', 1);
  } else if (enemyType === 'rat') {
    if (killOrdinal === 1) {
      weaponDrop = 'basic_sword';
      rarityHighlight = 'comun';
    }
    if (rng() < 0.25) pushMat('slime_gel', 1);
  } else if (enemyType === 'rabbit') {
    const daggerRate = biomeId === 1 ? 0.1 : 0.05;
    if (rng() < daggerRate) {
      weaponDrop = 'crimson_dagger';
      rarityHighlight = 'epico';
    }
  } else if (enemyType === 'goblin') {
    if (rng() < 0.2) pushMat('ancestral_wood', 1);
  } else if (enemyType === 'ent') {
    if (rng() < 0.2) pushMat('ancestral_wood', 1);
  } else if (enemyType === 'wolf') {
    if (rng() < 0.18) pushMat('stone_ore', 1);
  } else if (enemyType === 'bat') {
    if (rng() < 0.14) pushMat('bronze_ore', 1);
  } else if (enemyType === 'wild_dog') {
    if (rng() < 0.2) pushMat('wolf_pelt', 1);
  } else if (enemyType === 'ghost') {
    if (rng() < 0.18) pushMat('void_orb', 1);
  } else if (enemyType === 'rock_golem') {
    if (rng() < 0.5) pushMat('stone_ore', 1);
    if (rng() < 0.3) pushMat('bronze_ore', 1);
    if (rng() < 0.1) pushMat('iron_ore', 1);
  } else if (enemyType === 'gray_wolf') {
    if (rng() < 0.2) pushMat('wolf_pelt', 1);
  } else if (enemyType === 'polar_bear') {
    if (rng() < 0.25) pushMat('wolf_pelt', 1);
  } else if (enemyType === 'ice_golem') {
    if (rng() < 0.2) pushMat('ice_shard', 1);
  } else if (enemyType === 'knight') {
    if (rng() < 0.35) pushMat('dark_steel', 1);
  } else if (enemyType === 'mage') {
    if (rng() < 0.35) pushMat('void_orb', 1);
  } else if (enemyType === 'lava_golem') {
    if (rng() < 0.2) pushMat('obsidian_ore', 1);
  } else if (enemyType === 'boss_meadow') {
    pushMat('slime_gel', 4);
    pushMat('stone_ore', 2);
  } else if (enemyType === 'boss_forest') {
    pushMat('ancestral_wood', 4);
    pushMat('bronze_ore', 2);
  } else if (enemyType === 'boss_rocky') {
    pushMat('stone_ore', 4);
    pushMat('bronze_ore', 3);
    pushMat('iron_ore', 2);
  } else if (enemyType === 'boss_snow') {
    pushMat('wolf_pelt', 3);
    pushMat('ice_shard', 4);
    pushMat('iron_ore', 2);
  } else if (enemyType === 'boss') {
    pushMat('ignis_core', 1);
    pushMat('obsidian_ore', 5);
    pushMat('dark_steel', 2);
    rarityHighlight = 'mitico';
  }

  return { gold, consumable, materials, weaponDrop, rarityHighlight };
}
