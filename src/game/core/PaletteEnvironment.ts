// Paleta "Zelda Clásico" (SNES/GBA) exclusiva para ENTORNO y CIELO:
// Pasto, árboles, suelo, rocas y cielo.
// Saturación media-alta (50-70%), Luminosidad más alta (55-75%) y contraste suave
// para que los Actores (PaletteActor) destaquen siempre en primer plano.
export const PALETTE_ENVIRONMENT = {
  // Pradera Esmeralda (verde pasto claro y vivo, nunca oliva apagado)
  GRASS_BASE: 0x5a9e3e,
  GRASS_SHADOW: 0x3d7a2a,
  GRASS_HIGHLIGHT: 0x7bc456,

  // Copa de árbol (más oscura que el pasto para crear profundidad sin competir con actores)
  TREE_BASE: 0x2d6b3a,
  TREE_SHADOW: 0x1a4a24,
  TREE_HIGHLIGHT: 0x4a9e5a,

  // Tronco cálido
  TRUNK_BASE: 0x8b5a2b,
  TRUNK_SHADOW: 0x5a3a1a,

  // Suelo y caminos de tierra cálida
  GROUND_BASE: 0xc9a66b,
  GROUND_SHADOW: 0xa08050,

  // Bosque Ancestral (tonos esmeralda profundos)
  FOREST_GRASS_BASE: 0x498a5b,
  FOREST_GRASS_SHADOW: 0x2f6340,
  FOREST_GRASS_HIGHLIGHT: 0x6ab37c,
  FOREST_TREE_BASE: 0x245942,
  FOREST_TREE_SHADOW: 0x153b2b,
  FOREST_TREE_HIGHLIGHT: 0x3b8564,
  FOREST_GROUND: 0x457d5a,

  // Tierras Volcánicas (ceniza cálida y brasas contenidas)
  VOLCANIC_GROUND: 0x524648,
  VOLCANIC_TRUNK_BASE: 0x3d3336,
  VOLCANIC_TRUNK_SHADOW: 0x261f21,
  VOLCANIC_EMBER_BASE: 0xc95232,
  VOLCANIC_EMBER_HIGHLIGHT: 0xe67b45,

  // Tierras Rocosas (piedra cálida y hierba seca)
  ROCKY_GRASS_BASE: 0x9fa356,
  ROCKY_GRASS_SHADOW: 0x787a3b,
  ROCKY_GRASS_HIGHLIGHT: 0xbec274,
  ROCKY_TREE_BASE: 0x6a7848,
  ROCKY_TREE_SHADOW: 0x485230,
  ROCKY_TREE_HIGHLIGHT: 0x8b9c62,
  ROCKY_GROUND: 0x998e7e,
  ROCKY_STONE: 0x8a8275,

  // Tierras Nevadas (pinos escarchados y nieve luminosa)
  SNOW_GROUND: 0xdcebf7,
  SNOW_STONE: 0xaecae0,
  SNOW_TREE_BASE: 0x3d7d7a,
  SNOW_TREE_SHADOW: 0x265454,
  SNOW_TREE_HIGHLIGHT: 0xcce8fa,
} as const;

export const PALETTE_SKY = {
  DAY_SKY: 0x87ceeb,       // Azul cielo clásico Zelda diurno
  HORIZON_WHITE: 0xeff8ff, // Blanco suave en el horizonte
  SUNSET_SKY: 0xf0a36e,    // Ocaso cálido
  NIGHT_SKY: 0x1c2d4a,     // Noche estrellada legible
  FOG_MEADOW: 0x87ceeb,
  FOG_FOREST: 0x62a896,
  FOG_VOLCANIC: 0x694542,
  FOG_ROCKY: 0xa8a399,
  FOG_SNOW: 0xc7e4fa,
} as const;
