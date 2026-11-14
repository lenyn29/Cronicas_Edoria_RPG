import { HeroSkills, SkillKey, SpellId } from './types';

export type SkillBranch = 'marcial' | 'guardian' | 'arcano';

export interface SkillNodeDef {
  key: SkillKey;
  branch: SkillBranch;
  name: string;
  shortName: string;
  tier: 1 | 2 | 3;
  col: 0 | 1 | 2;
  maxRank: number;
  requires?: { key: SkillKey; rank: number };
  perRankSummary: string;
  desc: string;
  accentColor: string;
  /** Normalized node center coordinates (0..100) for SVG connector lines */
  x: number;
  y: number;
}

export const BRANCH_META: Record<SkillBranch, { label: string; color: string }> = {
  marcial: { label: 'Senda Marcial', color: '#f87171' },
  guardian: { label: 'Égida Vital', color: '#34d399' },
  arcano: { label: 'Senda Arcana', color: '#38bdf8' },
};

export const SKILL_TREE_NODES: SkillNodeDef[] = [
  // Branch 0: Marcial (Left column, x=18)
  {
    key: 'sword',
    branch: 'marcial',
    name: 'Maestría de Hoja',
    shortName: 'Maestría',
    tier: 1,
    col: 0,
    maxRank: 8,
    perRankSummary: '+6 Daño Físico · +0.1 Alcance',
    desc: 'Perfecciona el dominio de tu arma y extiende el arco de corte cuerpo a cuerpo.',
    accentColor: '#f87171',
    x: 18,
    y: 19,
  },
  {
    key: 'atkSpeed',
    branch: 'marcial',
    name: 'Frenesí de Acero',
    shortName: 'Vel. Atq.',
    tier: 2,
    col: 0,
    maxRank: 5,
    requires: { key: 'sword', rank: 1 },
    perRankSummary: '+9% Velocidad de Ataque',
    desc: 'Reduce el tiempo de recuperación entre golpes para encadenar ataques más veloces.',
    accentColor: '#fb923c',
    x: 18,
    y: 50,
  },
  {
    key: 'crit',
    branch: 'marcial',
    name: 'Golpe Letal',
    shortName: 'Crítico',
    tier: 3,
    col: 0,
    maxRank: 5,
    requires: { key: 'atkSpeed', rank: 1 },
    perRankSummary: '+7% Crítico · +12% Daño Crítico',
    desc: 'Permite asestar estocadas críticas devastadoras contra jefes de bioma e Ignis Rex.',
    accentColor: '#fbbf24',
    x: 18,
    y: 81,
  },

  // Branch 1: Guardián (Center column, x=50)
  {
    key: 'vitality',
    branch: 'guardian',
    name: 'Vitalidad Férrea',
    shortName: 'Vitalidad',
    tier: 1,
    col: 1,
    maxRank: 8,
    perRankSummary: '+28 Vida Máx. · +5% Curación',
    desc: 'Refuerza tu aguante físico e incrementa la salud restaurada por cada poción.',
    accentColor: '#34d399',
    x: 50,
    y: 19,
  },
  {
    key: 'elemResist',
    branch: 'guardian',
    name: 'Égida Elemental',
    shortName: 'Res. Elem.',
    tier: 2,
    col: 1,
    maxRank: 5,
    requires: { key: 'vitality', rank: 1 },
    perRankSummary: '+8% Resistencia Elemental',
    desc: 'Reduce el daño recibido de proyectiles arcanos, gólems elementales y ataques de jefes.',
    accentColor: '#2dd4bf',
    x: 50,
    y: 50,
  },
  {
    key: 'agility',
    branch: 'guardian',
    name: 'Paso del Viento',
    shortName: 'Agilidad',
    tier: 3,
    col: 1,
    maxRank: 5,
    requires: { key: 'elemResist', rank: 1 },
    perRankSummary: '+0.45 Vel. · -8% Enfriamiento Dash',
    desc: 'Aumenta tu movilidad al explorar y acelera la recarga de tu esquiva táctica.',
    accentColor: '#a3e635',
    x: 50,
    y: 81,
  },

  // Branch 2: Arcano (Right column, x=82)
  {
    key: 'magic',
    branch: 'arcano',
    name: 'Sintonía Arcana',
    shortName: 'Arcano',
    tier: 1,
    col: 2,
    maxRank: 8,
    perRankSummary: '+9 Poder Mágico · +10 Maná Máx.',
    desc: 'Amplifica el poder de los hechizos aprendidos con el Mago Theron y expande tu reserva mágica.',
    accentColor: '#38bdf8',
    x: 82,
    y: 19,
  },
  {
    key: 'spellMastery',
    branch: 'arcano',
    name: 'Maestría Rúnica',
    shortName: 'Runas',
    tier: 2,
    col: 2,
    maxRank: 5,
    requires: { key: 'magic', rank: 1 },
    perRankSummary: '-10% Costo Maná · +12% Regen. Maná',
    desc: 'Optimiza el flujo rúnico de tus conjuros, reduciendo el coste y acelerando la regeneración.',
    accentColor: '#c084fc',
    x: 82,
    y: 50,
  },
];

export const SKILL_NODE_MAP: Record<SkillKey, SkillNodeDef> = Object.fromEntries(
  SKILL_TREE_NODES.map((n) => [n.key, n])
) as Record<SkillKey, SkillNodeDef>;

export function createEmptySkills(): HeroSkills {
  return {
    sword: 0,
    atkSpeed: 0,
    crit: 0,
    vitality: 0,
    elemResist: 0,
    agility: 0,
    magic: 0,
    spellMastery: 0,
  };
}

export function isSkillUnlocked(key: SkillKey, skills: HeroSkills): boolean {
  const def = SKILL_NODE_MAP[key];
  if (!def.requires) return true;
  return (skills[def.requires.key] ?? 0) >= def.requires.rank;
}

export interface SpellDef {
  id: SpellId;
  name: string;
  shortLabel: string;
  manaCost: number;
  cooldown: number;
  colorHex: number;
  uiColor: string;
  desc: string;
}

export const SPELL_DEFS: Record<SpellId, SpellDef> = {
  arcane_pulse: {
    id: 'arcane_pulse',
    name: 'Pulso Arcano',
    shortLabel: 'Arcano',
    manaCost: 12,
    cooldown: 0.48,
    colorHex: 0x38bdf8,
    uiColor: '#38bdf8',
    desc: 'Proyectil de energía arcana veloz que estalla al impactar contra el enemigo.',
  },
  frost_nova: {
    id: 'frost_nova',
    name: 'Nova Glacial',
    shortLabel: 'Glacial',
    manaCost: 18,
    cooldown: 1.05,
    colorHex: 0x7dd3fc,
    uiColor: '#7dd3fc',
    desc: 'Onda expansiva helada alrededor de Aelion que daña, empuja y ralentiza 45% a los enemigos.',
  },
  astral_lance: {
    id: 'astral_lance',
    name: 'Lanza Astral',
    shortLabel: 'Astral',
    manaCost: 22,
    cooldown: 0.72,
    colorHex: 0xc084fc,
    uiColor: '#c084fc',
    desc: 'Haz estelar perforante de largo alcance que atraviesa varios enemigos en su trayectoria.',
  },
};
