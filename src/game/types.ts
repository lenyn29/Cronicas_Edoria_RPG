export type GamePhase = 'title' | 'playing' | 'gameover' | 'paused';
export type QualityMode = 'auto' | 'high' | 'performance';
export type HeroTab = 'info' | 'equipment' | 'inventory' | 'skills';
export type GearSlot = 'weapon' | 'offhand' | 'helmet' | 'armor' | 'gloves' | 'boots';
export type GearStyle = 'basic' | 'rock' | 'bronze' | 'glacial' | 'obsidian' | 'crimson';
export type SkillKey =
  | 'sword'
  | 'atkSpeed'
  | 'crit'
  | 'vitality'
  | 'elemResist'
  | 'agility'
  | 'magic'
  | 'spellMastery';
export type SpellId = 'arcane_pulse' | 'frost_nova' | 'astral_lance';
export type BiomeId = 0 | 1 | 2 | 3 | 4;

export type LootRarity = 'comun' | 'poco_comun' | 'raro' | 'epico' | 'mitico';

export type MaterialId =
  | 'slime_gel'
  | 'ancestral_wood'
  | 'stone_ore'
  | 'bronze_ore'
  | 'iron_ore'
  | 'wolf_pelt'
  | 'ice_shard'
  | 'obsidian_ore'
  | 'dark_steel'
  | 'void_orb'
  | 'ignis_core';

export type EnemyKind =
  | 'slime'
  | 'rat'
  | 'wild_dog'
  | 'rabbit'
  | 'goblin'
  | 'ent'
  | 'knight'
  | 'mage'
  | 'lava_golem'
  | 'wolf'
  | 'bat'
  | 'ghost'
  | 'rock_golem'
  | 'gray_wolf'
  | 'polar_bear'
  | 'ice_golem'
  | 'boss_meadow'
  | 'boss_forest'
  | 'boss_rocky'
  | 'boss_snow'
  | 'boss';

export interface HeroAppearance {
  weapon: GearStyle | null;
  offhand: GearStyle | null;
  isDaggerMain: boolean;
  isDaggerOff: boolean;
  helmet: GearStyle | null;
  armor: GearStyle | null;
  gloves: GearStyle | null;
  boots: GearStyle | null;
}

export interface WeaponDef {
  id: string;
  slot: 'weapon';
  weaponKind: 'sword' | 'dagger';
  style: GearStyle;
  name: string;
  atk: number;
  mag: number;
  reach: number;
  atkSpeedPct?: number;
  critChancePct?: number;
  rarity: LootRarity;
  desc: string;
  craftable: boolean;
  recipe?: Partial<Record<MaterialId, number>>;
}

export interface ArmorPieceDef {
  id: string;
  slot: Exclude<GearSlot, 'weapon' | 'offhand'>;
  style: GearStyle;
  name: string;
  hp: number;
  mp: number;
  def: number;
  atk?: number;
  mag?: number;
  atkSpeedPct?: number;
  critChancePct?: number;
  moveSpeed?: number;
  rarity: LootRarity;
  desc: string;
  craftable: boolean;
  recipe?: Partial<Record<MaterialId, number>>;
}

export type HeroSkills = Record<SkillKey, number>;

export const INVENTORY_CAPACITY = 20;
export const BANK_CAPACITY = 40;

export interface InventorySlotEntry {
  id: string;
  category: 'consumable' | 'gear' | 'material' | 'relic' | 'currency';
  qty: number;
}

export interface InventorySlotView extends InventorySlotEntry {
  name: string;
  slot?: GearSlot;
  rarity?: LootRarity;
  desc: string;
  upgradeLevel?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'consumable' | 'gear' | 'material' | 'relic' | 'currency';
  slot?: GearSlot;
  rarity?: LootRarity;
  qty: number;
  desc: string;
  upgradeLevel?: number;
  equipped?: boolean;
}

export interface TownLocation {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  isCapital?: boolean;
}

export interface NearestTownInfo {
  id: string;
  name: string;
  distance: number;
  angleDeg: number;
  inTown: boolean;
}

export interface QuestProgress {
  q1: 0 | 1 | 2;
  q2: 0 | 1 | 2;
  q3: 0 | 1 | 2;
  mage: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  warrior: 0 | 1 | 2 | 3;
}

export interface ForgeItemSnapshot {
  id: string;
  slot: GearSlot;
  weaponKind?: 'sword' | 'dagger';
  name: string;
  rarity: LootRarity;
  statsText: string;
  owned: boolean;
  ownedQty: number;
  equipped: boolean;
  upgradeLevel: number;
  maxUpgrade: number;
  craftable: boolean;
  craftRecipe: Array<{ materialId: MaterialId; name: string; req: number; have: number }>;
  upgradeRecipe: Array<{ materialId: MaterialId; name: string; req: number; have: number }> | null;
  nextStatsText: string | null;
}

export interface HudSnapshot {
  heroName: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  xpNext: number;
  level: number;
  potions: number;
  elixirs: number;
  atkDmg: number;
  magDmg: number;
  def: number;
  moveSpeed: number;
  atkSpeedPct: number;
  critChancePct: number;
  elemResistPct: number;
  equipped: Record<GearSlot, string | null>;
  equippedNames: Record<GearSlot, string | null>;
  ownedGearQty: Record<string, number>;
  learnedSpells: SpellId[];
  activeSpell: SpellId | null;
  skillPoints: number;
  skills: HeroSkills;
  materials: Record<MaterialId, number>;
  forgeItems: ForgeItemSnapshot[];
  inventory: InventoryItem[];
  inventorySlots: Array<InventorySlotView | null>;
  inventoryCapacity: number;
  bankSlots: Array<InventorySlotView | null>;
  inCombat: boolean;
  towns: TownLocation[];
  nearestTown: NearestTownInfo;
  playerPos: { x: number; z: number };
  worldSeed: number;
  cooldowns: {
    atk: number;
    spell: number;
    dash: number;
    potionHp: number;
    potionMp: number;
  };
  kills: number;
  slimeKills: number;
  forestKills: number;
  defeatedBiomeBosses: number;
  hasCrystal: boolean;
  quests: QuestProgress;
  biomeName: string;
  timeLabel: string;
  interactPrompt: string | null;
  bossBar: { visible: boolean; name: string; hp: number; maxHp: number };
  targetEnemy: {
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    isBoss: boolean;
    threat: 'green' | 'yellow' | 'red';
    statusLabel: string;
  } | null;
  questTitle: string;
  questDesc: string;
  audioEnabled: boolean;
}

export type ContextActionType = 'attack' | 'talk' | 'pickup' | 'chest';

export interface ContextActionView {
  type: ContextActionType;
  targetId: string;
  label: string;
  distance: number;
}

export type NpcRole =
  | 'elder'
  | 'smith'
  | 'scholar'
  | 'warrior'
  | 'merchant'
  | 'innkeeper'
  | 'kid'
  | 'peddler'
  | 'banker'
  | 'guard';

export type WindowId =
  | 'npc-dialog'
  | 'bank-window'
  | 'shop-window'
  | 'forge-window'
  | 'inventory-window'
  | 'hero-window'
  | 'world-map';

export interface DialogueButton {
  label: string;
  secondary?: boolean;
  disabled?: boolean;
  action: () => void;
}

export interface DialoguePayload {
  npcName: string;
  npcRole: NpcRole;
  portraitCanvas: HTMLCanvasElement;
  text: string;
  buttons: DialogueButton[];
}

export type DayPhaseId = 'deep_night' | 'dawn' | 'day' | 'dusk' | 'twilight' | 'night';

export interface TimeSnapshot {
  hours: number;
  hour: number;
  minute: number;
  formatted: string;
  phase: DayPhaseId;
  phaseLabel: string;
  isNight: boolean;
  timeOfDay: number;
}

export interface FloatPopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  opacity: number;
  isCrit?: boolean;
  isCombo?: boolean;
}

