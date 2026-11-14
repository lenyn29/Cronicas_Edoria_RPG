import { getGearDef } from './lootTable';
import { GearSlot, GearStyle } from './types';

const spriteCache = new Map<string, string>();
const slotPlaceholderCache = new Map<GearSlot, string>();

const STYLE_PALETTE: Record<
  GearStyle,
  { dk: string; md: string; hi: string; sp: string; trim: string; gem: string }
> = {
  basic: { dk: '#334155', md: '#64748b', hi: '#cbd5e1', sp: '#f8fafc', trim: '#b45309', gem: '#93c5fd' },
  rock: { dk: '#3f3a36', md: '#78716c', hi: '#a8a29e', sp: '#e7e5e4', trim: '#ca8a04', gem: '#fde047' },
  bronze: { dk: '#6b2f0b', md: '#c26d18', hi: '#f59e0b', sp: '#fef08a', trim: '#fde047', gem: '#ef4444' },
  crimson: { dk: '#7f1d1d', md: '#dc2626', hi: '#fb7185', sp: '#ffe4e6', trim: '#fbbf24', gem: '#fef08a' },
  glacial: { dk: '#075985', md: '#0284c7', hi: '#38bdf8', sp: '#e0f2fe', trim: '#bae6fd', gem: '#f0f9ff' },
  obsidian: { dk: '#181320', md: '#4c1d95', hi: '#ea580c', sp: '#fef08a', trim: '#fb923c', gem: '#fde047' },
};

function makeSpriteCanvas() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  return { c, px };
}

function drawGearPixelArt(slot: GearSlot, style: GearStyle, isDagger = false): string {
  const { c, px } = makeSpriteCanvas();
  const pal = STYLE_PALETTE[style];
  const ol = '#0a0d14';

  if (slot === 'offhand' || (slot === 'weapon' && isDagger)) {
    // Sleek angled RPG Dagger with fuller, guard wings & pommel gem (twin-silhouette hint if offhand placeholder)
    const drawDagger = (ox: number, oy: number) => {
      for (let i = 0; i < 14; i++) {
        const bx = ox + 17 - i;
        const by = oy + 3 + i;
        const bw = i < 3 ? 2 + i : 5;
        px(bx - 1, by - 1, bw + 2, 3, ol);
        px(bx, by, bw, 2, i % 2 === 0 ? pal.md : pal.dk);
        px(bx + 1, by, Math.max(1, bw - 2), 1, pal.hi);
        if (i < 6) px(bx + 1, by, 1, 1, pal.sp);
      }
      // Guard
      px(ox + 2, oy + 14, 11, 4, ol);
      px(ox + 3, oy + 15, 9, 2, pal.trim);
      px(ox + 6, oy + 15, 3, 2, pal.gem);
      // Grip & pommel
      px(ox + 2, oy + 18, 6, 5, ol);
      px(ox + 3, oy + 19, 4, 3, '#5c341b');
      px(ox + 0, oy + 21, 5, 5, ol);
      px(ox + 1, oy + 22, 3, 3, pal.trim);
      px(ox + 2, oy + 23, 1, 1, pal.gem);
    };
    if (slot === 'offhand') {
      drawDagger(6, 3);
      drawDagger(1, 5);
    } else {
      drawDagger(4, 4);
    }
  } else if (slot === 'weapon') {
    // Detailed RPG Sword / Greatsword with beveled tip, fuller & ornate hilt
    const isHeavy = style === 'obsidian' || style === 'glacial';
    const bw = isHeavy ? 6 : 4;
    const bx = 16 - Math.floor(bw / 2);
    // Pointed tip
    px(14, 2, 4, 3, ol);
    px(15, 3, 2, 2, pal.sp);
    // Main blade body
    px(bx - 1, 4, bw + 2, 18, ol);
    px(bx, 4, bw, 17, pal.dk);
    px(bx, 4, Math.max(2, bw - 1), 17, pal.md);
    px(bx + 1, 5, Math.max(1, bw - 3), 15, pal.hi);
    px(bx + 1, 5, 1, 11, pal.sp);
    // Fuller / Runes
    if (style === 'glacial' || style === 'obsidian') {
      px(15, 8, 2, 2, pal.gem);
      px(15, 13, 2, 2, pal.gem);
    }
    // Crossguard with winged tips
    px(7, 20, 18, 4, ol);
    px(8, 21, 16, 2, pal.trim);
    px(14, 20, 4, 4, pal.sp);
    px(15, 21, 2, 2, pal.gem);
    // Leather grip & weighted pommel
    px(13, 24, 6, 5, ol);
    px(14, 24, 4, 4, '#5c341b');
    px(15, 25, 2, 2, '#92400e');
    px(12, 27, 8, 4, ol);
    px(13, 28, 6, 2, pal.trim);
    px(15, 28, 2, 2, pal.gem);
  } else if (slot === 'helmet') {
    // Tiered RPG Helmet with plume/horns, beveled dome & visor
    if (style === 'bronze' || style === 'glacial' || style === 'obsidian') {
      px(12, 2, 8, 6, ol);
      px(13, 3, 6, 5, style === 'obsidian' ? '#f97316' : style === 'glacial' ? '#7dd3fc' : '#dc2626');
      px(14, 3, 3, 3, pal.sp);
    }
    px(6, 6, 20, 20, ol);
    px(7, 7, 18, 18, pal.dk);
    px(8, 8, 16, 15, pal.md);
    px(9, 9, 10, 6, pal.hi);
    px(10, 9, 5, 3, pal.sp);
    // Rivets
    px(9, 13, 1, 1, pal.trim);
    px(22, 13, 1, 1, pal.trim);
    // Visor brow + T-opening + nasal guard
    px(8, 15, 16, 5, ol);
    px(9, 16, 14, 3, '#0b0f19');
    px(15, 13, 2, 10, pal.trim);
    px(10, 17, 4, 2, style === 'obsidian' ? '#fb923c' : pal.gem);
    px(18, 17, 4, 2, style === 'obsidian' ? '#fb923c' : pal.gem);
    // Chin guard
    px(8, 21, 16, 4, pal.trim);
    px(10, 22, 12, 2, pal.hi);
  } else if (slot === 'armor') {
    // Detailed RPG Cuirass with layered pauldrons, core crest & buckled belt
    px(3, 5, 26, 11, ol);
    px(6, 8, 20, 19, ol);
    // Pauldrons
    px(4, 6, 7, 8, pal.dk);
    px(21, 6, 7, 8, pal.dk);
    px(5, 7, 5, 6, pal.md);
    px(22, 7, 5, 6, pal.md);
    px(5, 7, 3, 3, pal.hi);
    px(22, 7, 3, 3, pal.hi);
    px(4, 12, 7, 2, pal.trim);
    px(21, 12, 7, 2, pal.trim);
    // Chestplate
    px(8, 9, 16, 17, pal.dk);
    px(9, 10, 14, 13, pal.md);
    px(10, 11, 8, 7, pal.hi);
    px(11, 11, 4, 3, pal.sp);
    // Core emblem
    px(13, 14, 6, 5, ol);
    px(14, 15, 4, 3, pal.trim);
    px(15, 16, 2, 1, pal.gem);
    // Belt & tassets
    px(8, 21, 16, 4, '#451a03');
    px(13, 21, 6, 4, pal.trim);
    px(15, 22, 2, 2, pal.gem);
  } else if (slot === 'gloves') {
    // Armored Gauntlets with knuckle plates & trimmed cuffs
    for (const gx of [4, 18]) {
      px(gx, 6, 10, 19, ol);
      px(gx + 1, 7, 8, 17, pal.dk);
      px(gx + 2, 8, 6, 12, pal.md);
      px(gx + 2, 9, 4, 5, pal.hi);
      px(gx + 3, 9, 2, 2, pal.sp);
      // Knuckle plates & cuff
      px(gx + 1, 13, 8, 2, pal.trim);
      px(gx + 1, 20, 8, 3, pal.trim);
      px(gx + 4, 21, 2, 1, pal.gem);
    }
  } else {
    // Pair of Armored Greaves / Boots
    for (const bx of [4, 17]) {
      px(bx, 6, 10, 20, ol);
      px(bx + 1, 7, 8, 17, pal.dk);
      px(bx + 2, 8, 6, 13, pal.md);
      px(bx + 3, 9, 3, 6, pal.hi);
      px(bx + 3, 9, 2, 2, pal.sp);
      // Boot toe
      px(bx, 21, 12, 5, ol);
      px(bx + 1, 22, 10, 3, pal.dk);
      px(bx + 2, 22, 6, 2, pal.md);
      // Knee trim & strap
      px(bx + 1, 8, 8, 2, pal.trim);
      px(bx + 1, 17, 8, 2, pal.trim);
    }
  }

  return c.toDataURL();
}

function drawMiscPixelArt(id: string): string {
  const { c, px } = makeSpriteCanvas();
  const ol = '#0a0d14';

  if (id === 'potion' || id === 'elixir') {
    const isHp = id === 'potion';
    const liqDk = isHp ? '#991b1b' : '#0369a1';
    const liqMd = isHp ? '#ef4444' : '#38bdf8';
    const liqHi = isHp ? '#fca5a5' : '#bae6fd';
    const glass = '#e2e8f0';
    px(12, 2, 8, 4, ol);
    px(13, 3, 6, 2, '#b45309');
    px(10, 6, 12, 5, ol);
    px(11, 7, 10, 3, glass);
    px(6, 11, 20, 18, ol);
    px(7, 12, 18, 16, glass);
    px(8, 14, 16, 13, liqDk);
    px(9, 15, 14, 10, liqMd);
    px(10, 16, 5, 6, liqHi);
    px(11, 16, 2, 3, '#ffffff');
  } else if (id === 'coins') {
    // Pila de monedas de oro estilo OSRS con brillo especular y contorno
    // Moneda trasera izquierda
    px(4, 14, 12, 11, ol);
    px(5, 15, 10, 9, '#926c15');
    px(6, 16, 8, 6, '#c9a227');
    px(7, 17, 4, 2, '#fde047');
    // Moneda trasera derecha
    px(15, 12, 13, 12, ol);
    px(16, 13, 11, 10, '#926c15');
    px(17, 14, 9, 7, '#d4af37');
    px(18, 15, 4, 2, '#fef08a');
    // Moneda principal delantera
    px(9, 17, 14, 12, ol);
    px(10, 18, 12, 10, '#926c15');
    px(11, 19, 10, 7, '#eab308');
    px(12, 20, 7, 4, '#fde047');
    px(13, 20, 3, 2, '#fef9c3');
    // Moneda superior apilada
    px(10, 7, 12, 11, ol);
    px(11, 8, 10, 9, '#b45309');
    px(12, 9, 8, 6, '#facc15');
    px(13, 10, 4, 2, '#fef9c3');
  } else if (id === 'crystal') {
    px(11, 2, 10, 28, ol);
    px(6, 9, 20, 14, ol);
    px(12, 3, 8, 26, '#9f1239');
    px(8, 10, 16, 12, '#e11d48');
    px(11, 7, 10, 16, '#fb7185');
    px(13, 8, 4, 11, '#ffe4e6');
    px(14, 9, 2, 5, '#ffffff');
  } else if (id === 'slime_gel') {
    px(5, 10, 22, 16, ol);
    px(8, 7, 16, 19, ol);
    px(7, 11, 18, 14, '#15803d');
    px(9, 9, 14, 14, '#22c55e');
    px(11, 11, 6, 5, '#86efac');
    px(12, 12, 3, 2, '#ecfdf5');
  } else if (id === 'ancestral_wood') {
    px(4, 9, 24, 15, ol);
    px(5, 10, 22, 13, '#5c341b');
    px(7, 11, 18, 10, '#854d0e');
    px(19, 11, 7, 10, '#b45309');
    px(21, 13, 3, 6, '#fde68a');
    px(9, 7, 6, 4, '#16a34a');
    px(10, 8, 4, 2, '#86efac');
  } else if (id === 'wolf_pelt') {
    px(4, 5, 24, 22, ol);
    px(5, 6, 22, 20, '#475569');
    px(7, 8, 18, 16, '#94a3b8');
    px(9, 10, 14, 12, '#e2e8f0');
    px(12, 12, 8, 8, '#f8fafc');
  } else if (id === 'ice_shard') {
    px(12, 2, 8, 28, ol);
    px(7, 8, 18, 16, ol);
    px(13, 3, 6, 26, '#0369a1');
    px(9, 10, 14, 12, '#38bdf8');
    px(12, 6, 6, 16, '#bae6fd');
    px(13, 8, 3, 8, '#f0f9ff');
  } else if (id === 'void_orb' || id === 'ignis_core') {
    const isVoid = id === 'void_orb';
    px(5, 5, 22, 22, ol);
    px(6, 6, 20, 20, isVoid ? '#4c1d95' : '#9a3412');
    px(8, 8, 16, 16, isVoid ? '#9333ea' : '#ea580c');
    px(10, 10, 9, 9, isVoid ? '#e879f9' : '#facc15');
    px(11, 11, 4, 4, '#ffffff');
  } else if (id === 'dark_steel') {
    px(4, 10, 24, 13, ol);
    px(5, 11, 22, 11, '#0f172a');
    px(7, 12, 18, 7, '#334155');
    px(9, 13, 12, 3, '#94a3b8');
    px(10, 13, 5, 1, '#e2e8f0');
  } else {
    const oreCol =
      id === 'bronze_ore'
        ? { rock: '#44403c', vein: '#d97706', hi: '#fcd34d', sp: '#fef08a' }
        : id === 'iron_ore'
          ? { rock: '#334155', vein: '#94a3b8', hi: '#e2e8f0', sp: '#ffffff' }
          : id === 'obsidian_ore'
            ? { rock: '#181320', vein: '#7e22ce', hi: '#f97316', sp: '#fef08a' }
            : { rock: '#44403c', vein: '#78716c', hi: '#d6d3d1', sp: '#f5f5f4' };
    px(5, 6, 22, 20, ol);
    px(6, 7, 20, 18, oreCol.rock);
    px(8, 9, 16, 14, oreCol.vein);
    px(10, 10, 6, 6, oreCol.hi);
    px(11, 11, 3, 3, oreCol.sp);
    px(17, 15, 5, 5, oreCol.hi);
    px(18, 16, 2, 2, oreCol.sp);
  }

  return c.toDataURL();
}

export function getItemSpriteUrl(id: string): string {
  const existing = spriteCache.get(id);
  if (existing) return existing;

  const gear = getGearDef(id);
  const url = gear
    ? drawGearPixelArt(gear.slot, gear.style, gear.slot === 'weapon' && gear.weaponKind === 'dagger')
    : drawMiscPixelArt(id);

  spriteCache.set(id, url);
  return url;
}

export function getSlotPlaceholderUrl(slot: GearSlot): string {
  const existing = slotPlaceholderCache.get(slot);
  if (existing) return existing;
  const url = drawGearPixelArt(slot, 'basic', slot === 'offhand');
  slotPlaceholderCache.set(slot, url);
  return url;
}

export function formatOsrsQty(qty: number): string {
  if (qty >= 1_000_000) {
    const m = qty / 1_000_000;
    return `${m >= 10 || Number.isInteger(m) ? Math.floor(m) : m.toFixed(1)}M`;
  }
  if (qty >= 10_000) {
    return `${Math.floor(qty / 1_000)}K`;
  }
  if (qty >= 1_000) {
    const k = qty / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(qty);
}
