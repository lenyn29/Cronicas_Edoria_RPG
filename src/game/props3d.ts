import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, getTerrainHeight, hashChunkCoords } from './worldMath';

export interface TorchEntry {
  x: number;
  y: number;
  z: number;
  flame: THREE.Mesh;
  baseIntensity: number;
  phase: number;
}

// Caché compartida de geometrías y materiales de props (cero texturas, cero RoomEnvironment IBL, mínimos draw calls)
const SHARED_PROP_GEOS = new Map<string, THREE.BufferGeometry>();
const SHARED_PROP_MATS = new Map<string, THREE.Material>();

function getSharedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = SHARED_PROP_GEOS.get(key);
  if (!g) {
    g = factory();
    SHARED_PROP_GEOS.set(key, g);
  }
  return g;
}

function getSharedMat<T extends THREE.Material>(key: string, factory: () => T): T {
  let m = SHARED_PROP_MATS.get(key) as T | undefined;
  if (!m) {
    m = factory();
    SHARED_PROP_MATS.set(key, m);
  }
  return m;
}

function mergeNormalizedParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (g !== p) p.dispose();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(normalized, false) ?? normalized[0].clone();
  for (let i = 0; i < normalized.length; i++) normalized[i].dispose();
  merged.computeBoundingSphere();
  return merged;
}

// Casa medieval de 8 piezas fusionadas por material (6 draw calls totales en vez de 14 por casa)
export function createHouseGroup(
  x: number,
  z: number,
  rotY: number,
  windowMaterials: THREE.MeshLambertMaterial[],
  seed: number
): THREE.Group {
  const y = getTerrainHeight(x, z, seed);
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = rotY;
  grp.userData.sharedPropAssets = true;

  // 1. Stone plinth + chimney fused
  const stoneGeo = getSharedGeo('house_stone', () => {
    const plinth = new THREE.BoxGeometry(4.7, 0.45, 3.9);
    plinth.translate(0, 0.22, 0);
    const chimney = new THREE.BoxGeometry(0.65, 1.4, 0.65);
    chimney.translate(1.2, 4.15, -0.7);
    return mergeNormalizedParts([plinth, chimney]);
  });
  const stoneMat = getSharedMat('house_stone_mat', () => new THREE.MeshLambertMaterial({ color: 0x626770 }));
  const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  grp.add(stoneMesh);

  // 2. Plaster main body
  const bodyGeo = getSharedGeo('house_body', () => {
    const b = new THREE.BoxGeometry(4.35, 2.55, 3.55);
    b.translate(0, 1.68, 0);
    return b;
  });
  const bodyMat = getSharedMat('house_body_mat', () => new THREE.MeshLambertMaterial({ color: 0xd9cbb8 }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  grp.add(body);

  // 3. Corner timber beams + window frames + doorway fused
  const timberGeo = getSharedGeo('house_timber', () => {
    const parts: THREE.BufferGeometry[] = [];
    const corners = [
      [-2.12, -1.72],
      [2.12, -1.72],
      [-2.12, 1.72],
      [2.12, 1.72],
    ];
    for (let i = 0; i < corners.length; i++) {
      const beam = new THREE.BoxGeometry(0.24, 2.6, 0.24);
      beam.translate(corners[i][0], 1.7, corners[i][1]);
      parts.push(beam);
    }
    for (const wx of [-1.3, 1.3]) {
      const frame = new THREE.BoxGeometry(0.84, 0.84, 0.12);
      frame.translate(wx, 1.88, 1.76);
      parts.push(frame);
    }
    const door = new THREE.BoxGeometry(0.92, 1.55, 0.16);
    door.translate(0, 1.2, 1.78);
    parts.push(door);
    return mergeNormalizedParts(parts);
  });
  const timberMat = getSharedMat('house_timber_mat', () => new THREE.MeshLambertMaterial({ color: 0x4d321c }));
  const timberMesh = new THREE.Mesh(timberGeo, timberMat);
  timberMesh.castShadow = true;
  grp.add(timberMesh);

  // 4. Pitched shingle roof
  const roofGeo = getSharedGeo('house_roof', () => {
    const r = new THREE.ConeGeometry(3.52, 2.15, 4);
    r.rotateY(Math.PI / 4);
    r.translate(0, 3.98, 0);
    return r;
  });
  const roofMat = getSharedMat('house_roof_mat', () => new THREE.MeshLambertMaterial({ color: 0x8f3328 }));
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  grp.add(roof);

  // 5. Golden door latch
  const latchGeo = getSharedGeo('house_latch', () => new THREE.SphereGeometry(0.07, 6, 6));
  const latchMat = getSharedMat(
    'house_latch_mat',
    () => new THREE.MeshLambertMaterial({ color: 0xd4a342, emissive: 0x3b2a08, emissiveIntensity: 0.25 })
  );
  const latch = new THREE.Mesh(latchGeo, latchMat);
  latch.position.set(0.3, 1.18, 1.88);
  grp.add(latch);

  // 6. Warm cottage windows fused (shared material toggled by DayNightCycle)
  const panesGeo = getSharedGeo('house_panes', () => {
    const p1 = new THREE.BoxGeometry(0.64, 0.64, 0.14);
    p1.translate(-1.3, 1.88, 1.77);
    const p2 = new THREE.BoxGeometry(0.64, 0.64, 0.14);
    p2.translate(1.3, 1.88, 1.77);
    return mergeNormalizedParts([p1, p2]);
  });
  const winMat = getSharedMat(
    'house_win_mat',
    () =>
      new THREE.MeshLambertMaterial({
        color: 0xffd27d,
        emissive: 0xff9f1c,
        emissiveIntensity: 0.45,
      })
  );
  const panes = new THREE.Mesh(panesGeo, winMat);
  grp.add(panes);
  if (!windowMaterials.includes(winMat)) {
    windowMaterials.push(winMat);
  }

  return grp;
}

// Pozo de piedra de 6 partes fusionadas por material (4 draw calls en vez de 7)
export function createStoneWellGroup(x: number, z: number, seed: number): THREE.Group {
  const y = getTerrainHeight(x, z, seed);
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.userData.sharedPropAssets = true;

  const stoneGeo = getSharedGeo('well_stone', () => {
    const base = new THREE.CylinderGeometry(1.18, 1.32, 0.25, 12);
    base.translate(0, 0.12, 0);
    const rim = new THREE.CylinderGeometry(1.02, 1.1, 0.82, 12);
    rim.translate(0, 0.56, 0);
    return mergeNormalizedParts([base, rim]);
  });
  const stoneMat = getSharedMat('well_stone_mat', () => new THREE.MeshLambertMaterial({ color: 0x76808f }));
  const stone = new THREE.Mesh(stoneGeo, stoneMat);
  stone.castShadow = true;
  stone.receiveShadow = true;
  grp.add(stone);

  const waterGeo = getSharedGeo('well_water', () => {
    const w = new THREE.CircleGeometry(0.84, 12);
    w.rotateX(-Math.PI / 2);
    w.translate(0, 0.98, 0);
    return w;
  });
  const waterMat = getSharedMat('well_water_mat', () => new THREE.MeshLambertMaterial({ color: 0x1e6091 }));
  grp.add(new THREE.Mesh(waterGeo, waterMat));

  const woodGeo = getSharedGeo('well_wood', () => {
    const p1 = new THREE.CylinderGeometry(0.08, 0.09, 1.45, 6);
    p1.translate(-0.86, 1.65, 0);
    const p2 = new THREE.CylinderGeometry(0.08, 0.09, 1.45, 6);
    p2.translate(0.86, 1.65, 0);
    const axle = new THREE.CylinderGeometry(0.06, 0.06, 1.85, 8);
    axle.rotateZ(Math.PI / 2);
    axle.translate(0, 1.9, 0);
    return mergeNormalizedParts([p1, p2, axle]);
  });
  const woodMat = getSharedMat('well_wood_mat', () => new THREE.MeshLambertMaterial({ color: 0x563922 }));
  const wood = new THREE.Mesh(woodGeo, woodMat);
  wood.castShadow = true;
  grp.add(wood);

  const roofGeo = getSharedGeo('well_roof', () => {
    const r = new THREE.ConeGeometry(1.45, 0.85, 4);
    r.rotateY(Math.PI / 4);
    r.translate(0, 2.62, 0);
    return r;
  });
  const roofMat = getSharedMat('well_roof_mat', () => new THREE.MeshLambertMaterial({ color: 0x7a3428 }));
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  grp.add(roof);

  return grp;
}

// Antorcha optimizada: base+poste+cesta compartidos + llama emisiva, SIN PointLight individual (usa pool en GameEngine)
export function createTorchGroup(
  x: number,
  z: number,
  torches: TorchEntry[],
  seed: number,
  _color = 0xff8c33,
  intensity = 3.6
): THREE.Group {
  const y = getTerrainHeight(x, z, seed);
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.userData.sharedPropAssets = true;

  const baseGeo = getSharedGeo('torch_base', () => {
    const b = new THREE.CylinderGeometry(0.22, 0.28, 0.22, 8);
    b.translate(0, 0.11, 0);
    const basket = new THREE.CylinderGeometry(0.22, 0.12, 0.26, 6);
    basket.translate(0, 1.56, 0);
    return mergeNormalizedParts([b, basket]);
  });
  const baseMat = getSharedMat('torch_base_mat', () => new THREE.MeshLambertMaterial({ color: 0x424750 }));
  grp.add(new THREE.Mesh(baseGeo, baseMat));

  const postGeo = getSharedGeo('torch_post', () => {
    const p = new THREE.CylinderGeometry(0.09, 0.13, 1.38, 6);
    p.translate(0, 0.86, 0);
    return p;
  });
  const postMat = getSharedMat('torch_post_mat', () => new THREE.MeshLambertMaterial({ color: 0x4b3423 }));
  const post = new THREE.Mesh(postGeo, postMat);
  post.castShadow = true;
  grp.add(post);

  const flameGeo = getSharedGeo('torch_flame', () => new THREE.OctahedronGeometry(0.23, 0));
  const flameMat = getSharedMat('torch_flame_mat', () => new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 1.78;
  grp.add(flame);

  const rng = createRng(hashChunkCoords(Math.round(x * 10), Math.round(z * 10), seed));
  torches.push({ x, y: y + 1.98, z, flame, baseIntensity: intensity, phase: rng() * 10 });
  return grp;
}

// Pilar de ruina antiguo: piedra fusionada + banda rúnica compartida por bioma (2 draw calls en vez de 4)
export function createRuinPillarGroup(
  x: number,
  z: number,
  seed: number,
  h = 3.2,
  style: boolean | 'meadow' | 'forest' | 'volcanic' | 'rocky' | 'snow' = false
): THREE.Group {
  const mode = typeof style === 'boolean' ? (style ? 'volcanic' : 'forest') : style;
  const y = getTerrainHeight(x, z, seed);
  const rng = createRng(hashChunkCoords(Math.round(x * 10), Math.round(z * 10), seed));
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = rng() * 0.6;
  grp.userData.sharedPropAssets = true;

  const stoneHex =
    mode === 'volcanic'
      ? 0x272125
      : mode === 'snow'
        ? 0x9fb8cc
        : mode === 'rocky'
          ? 0x6b645c
          : mode === 'meadow'
            ? 0x8f8a7a
            : 0x677573;

  const stoneMat = getSharedMat(`pillar_stone_${mode}`, () => new THREE.MeshLambertMaterial({ color: stoneHex }));
  const hKey = h.toFixed(1);
  const stoneGeo = getSharedGeo(`pillar_stone_geo_${hKey}`, () => {
    const plinth = new THREE.BoxGeometry(1.48, 0.4, 1.48);
    plinth.translate(0, 0.2, 0);
    const shaft = new THREE.BoxGeometry(1.06, h, 1.06);
    shaft.translate(0, 0.4 + h * 0.5, 0);
    const cap = new THREE.BoxGeometry(1.36, 0.32, 1.36);
    cap.translate(0, 0.4 + h + 0.14, 0);
    return mergeNormalizedParts([plinth, shaft, cap]);
  });

  const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  grp.add(stoneMesh);

  const runeCol =
    mode === 'volcanic'
      ? 0xc2410c
      : mode === 'snow'
        ? 0x38bdf8
        : mode === 'rocky'
          ? 0xd97706
          : mode === 'meadow'
            ? 0x22c55e
            : 0x0d9488;

  const runeMat = getSharedMat(
    `pillar_rune_${mode}`,
    () =>
      new THREE.MeshLambertMaterial({
        color: runeCol,
        emissive: runeCol,
        emissiveIntensity: 0.45,
      })
  );
  const runeGeo = getSharedGeo('pillar_rune_geo', () => new THREE.BoxGeometry(1.12, 0.22, 1.12));
  const runeBand = new THREE.Mesh(runeGeo, runeMat);
  runeBand.position.y = 0.4 + h * 0.65;
  grp.add(runeBand);

  return grp;
}

// Santuario del Cristal Carmesí (materiales Lambert sin IBL -> textures === 0)
export function createCrystalShrineGroup(x: number, z: number, seed: number) {
  const y = getTerrainHeight(x, z, seed);
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.userData.sharedPropAssets = true;

  const obsidianMat = getSharedMat('shrine_obsidian_mat', () => new THREE.MeshLambertMaterial({ color: 0x2b2528 }));
  const trimMat = getSharedMat(
    'shrine_trim_mat',
    () => new THREE.MeshLambertMaterial({ color: 0xd4a342, emissive: 0x5c4212, emissiveIntensity: 0.25 })
  );

  const obsidianGeo = getSharedGeo('shrine_obsidian_geo', () => {
    const parts: THREE.BufferGeometry[] = [];
    const step1 = new THREE.CylinderGeometry(1.7, 2.0, 0.38, 8);
    step1.translate(0, 0.19, 0);
    parts.push(step1);
    const step2 = new THREE.CylinderGeometry(1.1, 1.35, 0.46, 8);
    step2.translate(0, 0.61, 0);
    parts.push(step2);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const ob = new THREE.ConeGeometry(0.22, 1.45, 4);
      ob.translate(Math.cos(ang) * 1.65, 0.72, Math.sin(ang) * 1.65);
      parts.push(ob);
    }
    return mergeNormalizedParts(parts);
  });
  const baseMesh = new THREE.Mesh(obsidianGeo, obsidianMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  grp.add(baseMesh);

  const ringGeo = getSharedGeo('shrine_ring_geo', () => {
    const r = new THREE.TorusGeometry(0.95, 0.06, 8, 24);
    r.rotateX(Math.PI / 2);
    r.translate(0, 0.86, 0);
    return r;
  });
  grp.add(new THREE.Mesh(ringGeo, trimMat));

  const crystalGeo = getSharedGeo('shrine_crystal_geo', () => new THREE.OctahedronGeometry(0.85, 0));
  const crystalMat = getSharedMat(
    'shrine_crystal_mat',
    () =>
      new THREE.MeshLambertMaterial({
        color: 0xe11d48,
        emissive: 0xbe123c,
        emissiveIntensity: 0.65,
      })
  );
  const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
  crystalMesh.scale.set(0.8, 1.65, 0.8);
  crystalMesh.position.y = 2.05;
  grp.add(crystalMesh);

  const crystalLight = new THREE.PointLight(0xff2a6d, 2.2, 12, 1.6);
  crystalLight.position.y = 2.2;
  grp.add(crystalLight);

  return { group: grp, crystalMesh, crystalLight, pos: new THREE.Vector3(x, y, z) };
}
