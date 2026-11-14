import * as THREE from 'three';

// Paleta "Zelda Clásico" (SNES/GBA) exclusiva para ACTORES:
// Héroe, Enemigos, NPCs e Ítems.
// Saturación alta (70-90%), Luminosidad media (45-65%), alto contraste contra el entorno.
export const PALETTE_ACTOR = {
  // Pieles melocotón cálidas y legibles
  PIEL_CLARA: 0xfad2b4,
  PIEL_MEDIA: 0xf0b284,
  PIEL_BRONCEADA: 0xd68854,
  PIEL_MORENA: 0xa65c36,
  PIEL_OSCURA: 0x733b22,

  // Telas vivas estilo SNES (verde Link #3eaf76 como emblema)
  HERO_GREEN: 0x3eaf76,
  TUNIC_BLUE: 0x2c7ae8,
  TUNIC_RED: 0xe33b44,
  TUNIC_PURPLE: 0x8b44d9,
  TUNIC_GOLD: 0xd99b26,
  TUNIC_SLATE: 0x4b6382,

  // Metales y brillos de equipo
  ACERO_CLARO: 0xd4e2f2,
  ACERO_OSCURO: 0x465873,
  BRONCE: 0xe08424,
  ORO: 0xffd230,

  // Magia, pociones e ítems de alto contraste
  POTION_RED: 0xef3340,
  MAGIC_SKY: 0x2ea8ff,
  ESPECTRO_VERDE: 0x2de0b0,
  VIOLETA_RUNA: 0xa848ff,
  CRISTAL_ROSA: 0xf558a8,

  // Criaturas y acentos vivos
  SLIME_GREEN: 0x4cd964,
  SLIME_DARK: 0x238c3e,
  FUR_BROWN: 0x99582a,
  BONE_WARM: 0xf5ebd0,
  ICE_CRYSTAL: 0x5ce1ff,
  FIRE_EMBER: 0xff771c,
  LAVA_RED: 0xe62929,
  SHADOW_INK: 0x282030,

  // Neutros y contorno negro puro (1.5-2 px lógicos)
  OUTLINE_BLACK: 0x000000,
  WARM_WHITE: 0xfff6e0,
  LEATHER_DARK: 0x5c371e,
} as const;

export const ACTOR_HAIR_SWATCHES = {
  black: { id: 'black', label: 'Negro Azabache', base: 0x261d1c, shadow: 0x110c0b, highlight: 0x453533 },
  brown: { id: 'brown', label: 'Castaño Vivo', base: 0x7a4424, shadow: 0x4a2611, highlight: 0xa86238 },
  blonde: { id: 'blonde', label: 'Rubio Héroe', base: 0xf2bf35, shadow: 0xb08014, highlight: 0xffe46b },
  red: { id: 'red', label: 'Cobrizo Intenso', base: 0xc94426, shadow: 0x82230f, highlight: 0xf06b48 },
  white: { id: 'white', label: 'Plata Real', base: 0xdce6f2, shadow: 0x899ab0, highlight: 0xffffff },
  blue: { id: 'blue', label: 'Azul Zafiro', base: 0x2e6cd1, shadow: 0x183f85, highlight: 0x5ca4ff },
} as const;

export type SkinToneId = 'light' | 'medium' | 'tan' | 'brown' | 'dark';
export type HairColorId = keyof typeof ACTOR_HAIR_SWATCHES;
export type ClothColorId = 'green' | 'blue' | 'red' | 'purple' | 'brown' | 'gray';
export type HairStyleId = 'messy' | 'short' | 'long' | 'bald';
export type HeroGender = 'male' | 'female';

export interface CuratedSwatch {
  id: string;
  label: string;
  base: number;
  shadow: number;
  highlight: number;
  cssHex: string;
}

const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

// Sombra SNES: baja luminosidad y sube saturación ligeramente para evitar tonos fangosos
export function computeActorShadowHex(baseHex: number, lumFactor = 0.62): number {
  _c.setHex(baseHex);
  _c.getHSL(_hsl);
  const newL = Math.max(0.11, _hsl.l * lumFactor);
  const newS = Math.min(1, _hsl.s + 0.08);
  _c.setHSL(_hsl.h, newS, newL);
  return _c.getHex();
}

// Highlight SNES: tercera banda de luz clara y nítida
export function computeActorHighlightHex(baseHex: number, boost = 0.16): number {
  _c.setHex(baseHex);
  _c.getHSL(_hsl);
  const newL = Math.min(0.96, _hsl.l + boost);
  const newS = Math.min(1, _hsl.s * 0.94);
  _c.setHSL(_hsl.h, newS, newL);
  return _c.getHex();
}

function makeSwatch(id: string, label: string, base: number, shadow?: number, highlight?: number): CuratedSwatch {
  return {
    id,
    label,
    base,
    shadow: shadow ?? computeActorShadowHex(base),
    highlight: highlight ?? computeActorHighlightHex(base),
    cssHex: `#${base.toString(16).padStart(6, '0')}`,
  };
}

export const ACTOR_SKIN_SWATCHES: Record<SkinToneId, CuratedSwatch> = {
  light: makeSwatch('light', 'Melocotón Claro', PALETTE_ACTOR.PIEL_CLARA, 0xd49c79, 0xffe8d6),
  medium: makeSwatch('medium', 'Melocotón Cálido', PALETTE_ACTOR.PIEL_MEDIA, 0xc27f55, 0xffd2ad),
  tan: makeSwatch('tan', 'Bronceado Vivo', PALETTE_ACTOR.PIEL_BRONCEADA, 0xa15a31, 0xf2ab79),
  brown: makeSwatch('brown', 'Canela Cálida', PALETTE_ACTOR.PIEL_MORENA, 0x73381c, 0xc97b50),
  dark: makeSwatch('dark', 'Ébano Cálido', PALETTE_ACTOR.PIEL_OSCURA, 0x451f10, 0x995538),
};

export const ACTOR_HAIR_COLOR_SWATCHES: Record<HairColorId, CuratedSwatch> = {
  black: makeSwatch('black', ACTOR_HAIR_SWATCHES.black.label, ACTOR_HAIR_SWATCHES.black.base, ACTOR_HAIR_SWATCHES.black.shadow, ACTOR_HAIR_SWATCHES.black.highlight),
  brown: makeSwatch('brown', ACTOR_HAIR_SWATCHES.brown.label, ACTOR_HAIR_SWATCHES.brown.base, ACTOR_HAIR_SWATCHES.brown.shadow, ACTOR_HAIR_SWATCHES.brown.highlight),
  blonde: makeSwatch('blonde', ACTOR_HAIR_SWATCHES.blonde.label, ACTOR_HAIR_SWATCHES.blonde.base, ACTOR_HAIR_SWATCHES.blonde.shadow, ACTOR_HAIR_SWATCHES.blonde.highlight),
  red: makeSwatch('red', ACTOR_HAIR_SWATCHES.red.label, ACTOR_HAIR_SWATCHES.red.base, ACTOR_HAIR_SWATCHES.red.shadow, ACTOR_HAIR_SWATCHES.red.highlight),
  white: makeSwatch('white', ACTOR_HAIR_SWATCHES.white.label, ACTOR_HAIR_SWATCHES.white.base, ACTOR_HAIR_SWATCHES.white.shadow, ACTOR_HAIR_SWATCHES.white.highlight),
  blue: makeSwatch('blue', ACTOR_HAIR_SWATCHES.blue.label, ACTOR_HAIR_SWATCHES.blue.base, ACTOR_HAIR_SWATCHES.blue.shadow, ACTOR_HAIR_SWATCHES.blue.highlight),
};

export const ACTOR_CLOTH_SWATCHES: Record<ClothColorId, CuratedSwatch> = {
  green: makeSwatch('green', 'Verde Héroe', PALETTE_ACTOR.HERO_GREEN, 0x22784d, 0x62d99d),
  blue: makeSwatch('blue', 'Azul Zora', PALETTE_ACTOR.TUNIC_BLUE, 0x1a4ea1, 0x5ca4ff),
  red: makeSwatch('red', 'Rojo Goron', PALETTE_ACTOR.TUNIC_RED, 0x9e1f27, 0xff6b73),
  purple: makeSwatch('purple', 'Púrpura Real', PALETTE_ACTOR.TUNIC_PURPLE, 0x572494, 0xb275ff),
  brown: makeSwatch('brown', 'Ámbar Viajero', PALETTE_ACTOR.TUNIC_GOLD, 0x966312, 0xffc654),
  gray: makeSwatch('gray', 'Cobalto Acero', PALETTE_ACTOR.TUNIC_SLATE, 0x2c3d54, 0x728eb3),
};
