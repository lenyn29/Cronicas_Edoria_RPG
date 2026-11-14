import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createGrassBladeGeometry,
  createGrassLambertMaterial,
  GrassChunk,
  GrassSharedUniforms,
} from './core/GrassChunk';
import { GLOBAL_DAY_NIGHT_UNIFORMS } from './core/GlobalDayNightUniforms';
import { PALETTE_ENVIRONMENT, PALETTE_SKY } from './core/PaletteEnvironment';
import {
  buildLeafyTreeGeometry,
  buildSnowPineGeometry,
  buildVolcanicTreeGeometry,
  createTreeLambertMaterial,
  TreeChunk,
  TreeVisualKind,
} from './core/TreeChunk';
import { createWaterShaderMaterial } from './core/WaterShader';
import { BiomeId } from './types';
import {
  CHUNK_CONFIG,
  ChunkDataPayload,
  chunkKey,
  COLLIDER_STRIDE,
  ensureWorldSeed,
  generateChunkData,
  PROP_STRIDE,
  worldToChunk,
} from './worldMath';

const MAX_TREES_PER_KIND_CHUNK = 36;
const MAX_ROCKS_PER_TYPE_CHUNK = 24;
const TREE_HIGH_LOD_DIST_SQ = 40 * 40;

// Pre-allocated scratch helpers (zero per-mount GC)
const _instPos = new THREE.Vector3();
const _instQuat = new THREE.Quaternion();
const _instEuler = new THREE.Euler();
const _instScale = new THREE.Vector3();
const _instMatrix = new THREE.Matrix4();
const _instColor = new THREE.Color();
const _instSecColor = new THREE.Color();

// Multiplicadores suaves de copa por bioma (rango 0.82..1.28 para preservar luces/sombras de la geometría)
const BIOME_CANOPY_REL_TINT: Record<BiomeId, [number, number, number]> = {
  0: [1.02, 1.06, 0.94], // Pradera viva
  1: [0.84, 1.04, 1.08], // Bosque esmeralda profundo
  2: [1.14, 0.88, 0.80], // Ceniza/brasas
  3: [1.08, 1.04, 0.82], // Colinas rocosas (pinos secos)
  4: [0.88, 1.15, 1.28], // Nieve escarchada (pinos alpinos)
};

type RockVariant = 'normal' | 'volcanic' | 'rocky' | 'snow';

const TREE_KINDS: readonly TreeVisualKind[] = ['leafy', 'pine', 'volcanic'];
const ROCK_VARIANTS: readonly RockVariant[] = ['normal', 'volcanic', 'rocky', 'snow'];

interface PooledChunkSlot {
  group: THREE.Group;
  terrainGeo: THREE.PlaneGeometry;
  terrainMesh: THREE.Mesh;
  liquidGeo: THREE.PlaneGeometry;
  liquidMesh: THREE.Mesh;
  grassChunk: GrassChunk;
  treeChunks: Record<TreeVisualKind, TreeChunk>;
  rockInsts: Record<RockVariant, THREE.InstancedMesh>;
}

interface ActiveChunk {
  cx: number;
  cz: number;
  key: string;
  slot: PooledChunkSlot;
  colliderData: Float32Array;
}

export class ChunkManager {
  private scene: THREE.Scene;
  private worldSeed: number;
  private activeChunks = new Map<string, ActiveChunk>();
  private pendingKeys = new Set<string>();
  private readyQueue: ChunkDataPayload[] = [];
  private workers: Worker[] = [];
  private nextWorkerIdx = 0;

  private chunkSlotPool: PooledChunkSlot[] = [];

  private terrainMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.ShaderMaterial;
  private lavaMat: THREE.ShaderMaterial;
  private grassGeo: THREE.BufferGeometry;
  private grassMat: THREE.MeshLambertMaterial;

  private treeGeosHigh: Record<TreeVisualKind, THREE.BufferGeometry>;
  private treeGeosLow: Record<TreeVisualKind, THREE.BufferGeometry>;
  private treeMatsHigh: Record<TreeVisualKind, THREE.MeshLambertMaterial>;
  private treeMatsLow: Record<TreeVisualKind, THREE.MeshLambertMaterial>;

  private rockGeoMerged: THREE.BufferGeometry;
  private rockMats: Record<RockVariant, THREE.MeshLambertMaterial>;

  private lastPlayerChunkX = Number.NaN;
  private lastPlayerChunkZ = Number.NaN;
  private lastVisX = Number.NaN;
  private lastVisZ = Number.NaN;
  private currentViewRadius: number = CHUNK_CONFIG.VIEW_RADIUS;
  private grassDensityRatio = 1.0;

  constructor(
    scene: THREE.Scene,
    vegUniforms: GrassSharedUniforms,
    seed: number | string
  ) {
    this.scene = scene;
    this.worldSeed = ensureWorldSeed(seed);

    // Terreno 100% libre de texturas usando MeshLambertMaterial + micro-variación procedural en shader
    this.terrainMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });
    this.terrainMat.onBeforeCompile = (shader) => {
      shader.uniforms.uAmbientColor = GLOBAL_DAY_NIGHT_UNIFORMS.uAmbientColor;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vGroundWorld;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uAmbientColor;
         varying vec3 vGroundWorld;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float n1 = sin(vGroundWorld.x * 0.85) * cos(vGroundWorld.z * 0.85);
         float n2 = sin(vGroundWorld.x * 2.7 + vGroundWorld.z * 2.1);
         float patchShade = 0.94 + 0.06 * (n1 * 0.6 + n2 * 0.4);
         diffuseColor.rgb *= patchShade * mix(vec3(1.0), uAmbientColor, 0.28);`
      );
    };

    // Agua procedural estilizada (gradiente de profundidad, espuma en orilla, reflejo del cielo y specular)
    this.waterMat = createWaterShaderMaterial({
      uTime: vegUniforms.uTime,
      uSkyColor: new THREE.Color(PALETTE_SKY.DAY_SKY),
      uFogColor: new THREE.Color(PALETTE_SKY.DAY_SKY),
    });
    this.lavaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: vegUniforms.uTime,
        uTimeOfDay: GLOBAL_DAY_NIGHT_UNIFORMS.uTimeOfDay,
        uCrustColor: { value: new THREE.Color(0x4a1815) },
        uMoltenColor: { value: new THREE.Color(0xe64a19) },
        uBrightColor: { value: new THREE.Color(0xffb732) },
        uFogColor: { value: new THREE.Color(PALETTE_SKY.FOG_VOLCANIC) },
        uFogRange: { value: new THREE.Vector2(42.0, 115.0) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uTimeOfDay;
        uniform vec3 uCrustColor;
        uniform vec3 uMoltenColor;
        uniform vec3 uBrightColor;
        uniform vec3 uFogColor;
        uniform vec2 uFogRange;
        varying vec3 vWorldPos;
        void main() {
          float flow = sin(vWorldPos.x * 0.75 + uTime * 1.1) * cos(vWorldPos.z * 0.85 - uTime * 0.9)
                     + 0.45 * sin((vWorldPos.x + vWorldPos.z) * 1.6 + uTime * 1.9);
          vec3 col = mix(uCrustColor, uMoltenColor, smoothstep(-0.25, 0.55, flow));
          col = mix(col, uBrightColor, smoothstep(0.68, 1.05, flow));
          float nightBoost = smoothstep(-0.1, 0.8, cos(uTimeOfDay * 6.2831853));
          col *= (1.0 + nightBoost * 0.15);
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = smoothstep(uFogRange.x, uFogRange.y, dist);
          col = mix(col, uFogColor, fogFactor);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    // Pasto instanciado sin texturas con animación por vertex shader
    this.grassGeo = createGrassBladeGeometry();
    this.grassMat = createGrassLambertMaterial(vegUniforms);

    // Árboles RPG clásicos sin texturas: geometría fusionada + LOD dual + sway en copa
    this.treeGeosHigh = {
      leafy: buildLeafyTreeGeometry(true),
      pine: buildSnowPineGeometry(true),
      volcanic: buildVolcanicTreeGeometry(true),
    };
    this.treeGeosLow = {
      leafy: buildLeafyTreeGeometry(false),
      pine: buildSnowPineGeometry(false),
      volcanic: buildVolcanicTreeGeometry(false),
    };
    this.treeMatsHigh = {
      leafy: createTreeLambertMaterial(vegUniforms, true, false),
      pine: createTreeLambertMaterial(vegUniforms, true, false),
      volcanic: createTreeLambertMaterial(vegUniforms, true, true),
    };
    this.treeMatsLow = {
      leafy: createTreeLambertMaterial(vegUniforms, false, false),
      pine: createTreeLambertMaterial(vegUniforms, false, false),
      volcanic: createTreeLambertMaterial(vegUniforms, false, true),
    };

    // Rocas fusionadas de entorno con paleta suave (PaletteEnvironment)
    const rMain = new THREE.DodecahedronGeometry(0.75, 0);
    rMain.scale(1, 0.72, 1);
    rMain.rotateX(0.2);
    rMain.rotateY(0.7);
    rMain.rotateZ(0.15);
    rMain.translate(0, 0.38, 0);

    const rSub1 = new THREE.DodecahedronGeometry(0.42, 0);
    rSub1.scale(0.85, 0.85, 0.85);
    rSub1.translate(0.48, 0.2, 0.28);

    const rSub2 = new THREE.DodecahedronGeometry(0.32, 0);
    rSub2.scale(0.8, 0.8, 0.8);
    rSub2.translate(-0.42, 0.16, -0.25);

    this.rockGeoMerged = mergeGeometries([rMain, rSub1, rSub2]) ?? rMain.clone();
    rMain.dispose();
    rSub1.dispose();
    rSub2.dispose();

    this.rockMats = {
      normal: new THREE.MeshLambertMaterial({ color: PALETTE_ENVIRONMENT.ROCKY_STONE }),
      volcanic: new THREE.MeshLambertMaterial({ color: PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_BASE }),
      rocky: new THREE.MeshLambertMaterial({ color: PALETTE_ENVIRONMENT.GROUND_SHADOW }),
      snow: new THREE.MeshLambertMaterial({ color: PALETTE_ENVIRONMENT.SNOW_STONE }),
    };

    const workerCount = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 2) >= 4 ? 2 : 1;
    for (let i = 0; i < workerCount; i++) {
      try {
        const w = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<ChunkDataPayload>) => {
          const data = e.data;
          const key = chunkKey(data.cx, data.cz);
          this.pendingKeys.delete(key);

          if (data.seed !== this.worldSeed) return;
          if (
            Math.abs(data.cx - this.lastPlayerChunkX) > this.currentViewRadius ||
            Math.abs(data.cz - this.lastPlayerChunkZ) > this.currentViewRadius
          ) {
            return;
          }
          if (!this.activeChunks.has(key)) {
            this.readyQueue.push(data);
          }
        };
        w.onerror = () => {
          this.workers = this.workers.filter((item) => item !== w);
          w.terminate();
        };
        this.workers.push(w);
      } catch {
        break;
      }
    }

    const targetSlots = (CHUNK_CONFIG.VIEW_RADIUS * 2 + 1) ** 2;
    for (let i = 0; i < targetSlots; i++) {
      this.chunkSlotPool.push(this.createPooledChunkSlot());
    }
  }

  private createPooledChunkSlot(): PooledChunkSlot {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    const segs = CHUNK_CONFIG.CHUNK_SEGMENTS;

    const group = new THREE.Group();
    group.visible = false;

    const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
    terrainGeo.rotateX(-Math.PI / 2);
    const vertCount = terrainGeo.attributes.position.count;
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    terrainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), size * 0.85);

    const terrainMesh = new THREE.Mesh(terrainGeo, this.terrainMat);
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);

    const liquidGeo = new THREE.PlaneGeometry(size, size, 16, 16);
    liquidGeo.rotateX(-Math.PI / 2);
    const liquidVertCount = liquidGeo.attributes.position.count;
    liquidGeo.setAttribute('aWaterDepth', new THREE.BufferAttribute(new Float32Array(liquidVertCount).fill(0.5), 1));

    const liquidMesh = new THREE.Mesh(liquidGeo, this.waterMat);
    liquidMesh.visible = false;
    group.add(liquidMesh);

    const grassChunk = new GrassChunk(
      this.grassGeo,
      this.grassMat,
      CHUNK_CONFIG.MAX_GRASS_PER_CHUNK,
      size
    );
    group.add(grassChunk.mesh);

    const makeTreeChunk = (kind: TreeVisualKind): TreeChunk => {
      const tc = new TreeChunk(
        this.treeGeosHigh[kind],
        this.treeGeosLow[kind],
        this.treeMatsHigh[kind],
        this.treeMatsLow[kind],
        MAX_TREES_PER_KIND_CHUNK,
        size
      );
      group.add(tc.highMesh, tc.lowMesh);
      return tc;
    };

    const makeRockInst = (variant: RockVariant): THREE.InstancedMesh => {
      const inst = new THREE.InstancedMesh(
        this.rockGeoMerged,
        this.rockMats[variant],
        MAX_ROCKS_PER_TYPE_CHUNK
      );
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = true;
      inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), size * 0.9);
      inst.count = 0;
      group.add(inst);
      return inst;
    };

    return {
      group,
      terrainGeo,
      terrainMesh,
      liquidGeo,
      liquidMesh,
      grassChunk,
      treeChunks: {
        leafy: makeTreeChunk('leafy'),
        pine: makeTreeChunk('pine'),
        volcanic: makeTreeChunk('volcanic'),
      },
      rockInsts: {
        normal: makeRockInst('normal'),
        volcanic: makeRockInst('volcanic'),
        rocky: makeRockInst('rocky'),
        snow: makeRockInst('snow'),
      },
    };
  }

  private isChunkVisible(cx: number, cz: number, playerX: number, playerZ: number): boolean {
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    const maxDist = size * (this.currentViewRadius + 0.15);
    return Math.abs(cx * size - playerX) <= maxDist && Math.abs(cz * size - playerZ) <= maxDist;
  }

  private mountChunkData(data: ChunkDataPayload, playerX: number, playerZ: number): void {
    const key = chunkKey(data.cx, data.cz);
    if (this.activeChunks.has(key)) return;

    const slot = this.chunkSlotPool.pop() ?? this.createPooledChunkSlot();
    const size = CHUNK_CONFIG.CHUNK_SIZE;
    const originX = data.cx * size;
    const originZ = data.cz * size;

    slot.terrainMesh.position.set(originX, 0, originZ);
    slot.liquidMesh.visible = data.hasLiquid;
    if (data.hasLiquid) {
      slot.liquidMesh.material = data.hasLava ? this.lavaMat : this.waterMat;
      slot.liquidMesh.position.set(originX, data.hasLava ? -0.31 : -0.34, originZ);
      if (!data.hasLava) {
        const depthAttr = slot.liquidGeo.attributes.aWaterDepth as THREE.BufferAttribute;
        const terrainCols = CHUNK_CONFIG.CHUNK_SEGMENTS + 1;
        const step = Math.max(1, Math.floor(CHUNK_CONFIG.CHUNK_SEGMENTS / 16));
        let idx = 0;
        for (let r = 0; r <= 16; r++) {
          const tr = Math.min(CHUNK_CONFIG.CHUNK_SEGMENTS, r * step);
          for (let c = 0; c <= 16; c++) {
            const tc = Math.min(CHUNK_CONFIG.CHUNK_SEGMENTS, c * step);
            const terrainY = data.heights[tr * terrainCols + tc] ?? -1.0;
            const depth = Math.max(0, Math.min(1, (-0.34 - terrainY) / 1.45));
            depthAttr.setX(idx++, depth);
          }
        }
        depthAttr.needsUpdate = true;
      }
    }

    const posAttr = slot.terrainGeo.attributes.position as THREE.BufferAttribute;
    const normAttr = slot.terrainGeo.attributes.normal as THREE.BufferAttribute;
    const colAttr = slot.terrainGeo.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < data.heights.length; i++) {
      posAttr.setY(i, data.heights[i]);
    }
    (normAttr.array as Float32Array).set(data.normals);
    (colAttr.array as Float32Array).set(data.colors);

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    if (slot.terrainGeo.boundingSphere) {
      slot.terrainGeo.boundingSphere.center.set(0, 1.5, 0);
      slot.terrainGeo.boundingSphere.radius = size * 0.95;
    }

    const domEntry = data.biomeMix[0];
    const secEntry = data.biomeMix[1];
    slot.grassChunk.applyChunkData(
      originX,
      originZ,
      size,
      data.grassCount,
      this.grassDensityRatio,
      data.grassMatrices,
      data.grassColors,
      data.grassColorVars,
      domEntry?.biome ?? data.dominantBiome,
      secEntry?.biome ?? data.dominantBiome,
      secEntry?.weight ?? 0
    );

    const dxChunk = originX - playerX;
    const dzChunk = originZ - playerZ;
    const chunkDistSq = dxChunk * dxChunk + dzChunk * dzChunk;
    slot.grassChunk.setDistanceVisible(chunkDistSq <= CHUNK_CONFIG.GRASS_CULL_DIST_SQ);

    // Tinte de copa mezclado entre bioma dominante y secundario del chunk
    const domRgb = BIOME_CANOPY_REL_TINT[domEntry?.biome ?? data.dominantBiome];
    const secRgb = BIOME_CANOPY_REL_TINT[secEntry?.biome ?? domEntry?.biome ?? data.dominantBiome];
    const chunkMixTintR = domRgb[0] + (secRgb[0] - domRgb[0]) * (secEntry?.weight ?? 0) * 0.6;
    const chunkMixTintG = domRgb[1] + (secRgb[1] - domRgb[1]) * (secEntry?.weight ?? 0) * 0.6;
    const chunkMixTintB = domRgb[2] + (secRgb[2] - domRgb[2]) * (secEntry?.weight ?? 0) * 0.6;

    const treeCounts: Record<TreeVisualKind, number> = { leafy: 0, pine: 0, volcanic: 0 };
    const rockCounts: Record<RockVariant, number> = { normal: 0, volcanic: 0, rocky: 0, snow: 0 };

    const propData = data.propData;
    for (let i = 0; i < data.propCount; i++) {
      const off = i * PROP_STRIDE;
      const kind = propData[off];
      const biome = propData[off + 1] as BiomeId;
      const px = propData[off + 2];
      const py = propData[off + 3];
      const pz = propData[off + 4];
      const scale = propData[off + 5];
      const rotY = propData[off + 6];

      if (kind === 0) {
        const visualKind: TreeVisualKind =
          biome === 2 ? 'volcanic' : biome === 3 || biome === 4 ? 'pine' : 'leafy';
        const tc = slot.treeChunks[visualKind];
        const idx = treeCounts[visualKind];
        if (idx >= MAX_TREES_PER_KIND_CHUNK) continue;
        treeCounts[visualKind]++;

        // Variación de escala (0.85 a 1.20), rotación Y (0 a 2π) e inclinación orgánica sutil (±0.05 rad)
        const instScale = 0.85 + ((scale - 0.85) / 0.45) * 0.35;
        const hash = Math.sin(px * 12.9898 + pz * 78.233) * 43758.5453;
        const colorVar = hash - Math.floor(hash);
        const hash2 = Math.sin(px * 39.346 + pz * 11.135) * 24634.6345;
        const tiltVar = hash2 - Math.floor(hash2);
        const tiltX = (colorVar - 0.5) * 0.1;
        const tiltZ = (tiltVar - 0.5) * 0.1;

        _instPos.set(px, py, pz);
        _instEuler.set(tiltX, rotY * 2.0, tiltZ);
        _instQuat.setFromEuler(_instEuler);
        _instScale.set(instScale, instScale, instScale);
        _instMatrix.compose(_instPos, _instQuat, _instScale);

        const localRgb = BIOME_CANOPY_REL_TINT[biome];
        _instColor.setRGB(chunkMixTintR, chunkMixTintG, chunkMixTintB);
        _instSecColor.setRGB(localRgb[0], localRgb[1], localRgb[2]);
        _instColor.lerp(_instSecColor, 0.45);

        tc.setInstance(idx, _instMatrix, _instColor, colorVar);
      } else {
        const variant: RockVariant =
          biome === 2 ? 'volcanic' : biome === 3 ? 'rocky' : biome === 4 ? 'snow' : 'normal';
        const inst = slot.rockInsts[variant];
        const idx = rockCounts[variant];
        if (idx >= MAX_ROCKS_PER_TYPE_CHUNK) continue;
        rockCounts[variant]++;

        _instPos.set(px, py, pz);
        _instEuler.set(0, rotY, 0);
        _instQuat.setFromEuler(_instEuler);
        _instScale.set(scale, scale, scale);
        _instMatrix.compose(_instPos, _instQuat, _instScale);
        inst.setMatrixAt(idx, _instMatrix);
      }
    }

    const useHighLod = chunkDistSq <= TREE_HIGH_LOD_DIST_SQ;

    for (let i = 0; i < TREE_KINDS.length; i++) {
      const k = TREE_KINDS[i];
      slot.treeChunks[k].finalize(originX, originZ, size, treeCounts[k], useHighLod);
    }

    for (let i = 0; i < ROCK_VARIANTS.length; i++) {
      const v = ROCK_VARIANTS[i];
      const inst = slot.rockInsts[v];
      const count = rockCounts[v];
      inst.count = count;
      if (inst.boundingSphere) {
        inst.boundingSphere.center.set(originX, 1.5, originZ);
        inst.boundingSphere.radius = size * 0.96;
      }
      if (count > 0) inst.instanceMatrix.needsUpdate = true;
    }

    slot.group.visible = this.isChunkVisible(data.cx, data.cz, playerX, playerZ);
    this.scene.add(slot.group);
    this.activeChunks.set(key, {
      cx: data.cx,
      cz: data.cz,
      key,
      slot,
      colliderData: data.colliderData,
    });
  }

  private unloadChunk(chunk: ActiveChunk): void {
    const { slot } = chunk;
    slot.group.visible = false;
    this.scene.remove(slot.group);
    slot.grassChunk.clear();
    for (let i = 0; i < TREE_KINDS.length; i++) {
      slot.treeChunks[TREE_KINDS[i]].clear();
    }
    for (let i = 0; i < ROCK_VARIANTS.length; i++) {
      slot.rockInsts[ROCK_VARIANTS[i]].count = 0;
    }

    this.activeChunks.delete(chunk.key);
    this.chunkSlotPool.push(slot);
  }

  public setWorldSeed(seed: number | string, playerX: number, playerZ: number): number {
    this.worldSeed = ensureWorldSeed(seed);
    this.pendingKeys.clear();
    this.readyQueue.length = 0;
    const toUnload = Array.from(this.activeChunks.values());
    for (let i = 0; i < toUnload.length; i++) {
      this.unloadChunk(toUnload[i]);
    }
    this.preloadImmediate(playerX, playerZ, 1);
    return this.worldSeed;
  }

  public setGrassDensityRatio(ratio: number): void {
    const clamped = Math.max(0.25, Math.min(1, ratio));
    if (Math.abs(clamped - this.grassDensityRatio) < 0.05) return;
    this.grassDensityRatio = clamped;
    for (const chunk of this.activeChunks.values()) {
      chunk.slot.grassChunk.setDensityRatio(clamped);
    }
  }

  public setFogColor(skyCol: THREE.Color, lightDir?: THREE.Vector3, fogNear = 42, fogFar = 115): void {
    (this.waterMat.uniforms.uFogColor.value as THREE.Color).copy(skyCol);
    (this.waterMat.uniforms.uSkyColor.value as THREE.Color).copy(skyCol);
    (this.waterMat.uniforms.uFogRange.value as THREE.Vector2).set(fogNear, fogFar);
    if (lightDir) {
      (this.waterMat.uniforms.uLightDir.value as THREE.Vector3).copy(lightDir).normalize();
    }
    (this.lavaMat.uniforms.uFogColor.value as THREE.Color).copy(skyCol);
    (this.lavaMat.uniforms.uFogRange.value as THREE.Vector2).set(fogNear, fogFar);
  }

  public preloadImmediate(playerX: number, playerZ: number, syncRadius = 1): void {
    const { cx: pcx, cz: pcz } = worldToChunk(playerX, playerZ);
    this.lastPlayerChunkX = pcx;
    this.lastPlayerChunkZ = pcz;

    for (let dz = -syncRadius; dz <= syncRadius; dz++) {
      for (let dx = -syncRadius; dx <= syncRadius; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = chunkKey(cx, cz);
        if (!this.activeChunks.has(key)) {
          this.mountChunkData(generateChunkData(cx, cz, this.worldSeed), playerX, playerZ);
        }
      }
    }
    this.requestMissingChunks(pcx, pcz);
  }

  private requestMissingChunks(pcx: number, pcz: number): void {
    const R = this.currentViewRadius;
    const needed: Array<{ cx: number; cz: number; distSq: number }> = [];

    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = chunkKey(cx, cz);
        if (this.activeChunks.has(key) || this.pendingKeys.has(key)) continue;
        if (this.readyQueue.some((q) => q.cx === cx && q.cz === cz)) continue;
        needed.push({ cx, cz, distSq: dx * dx + dz * dz });
      }
    }

    needed.sort((a, b) => a.distSq - b.distSq);

    for (const item of needed) {
      const key = chunkKey(item.cx, item.cz);
      if (this.workers.length > 0) {
        this.pendingKeys.add(key);
        const w = this.workers[this.nextWorkerIdx % this.workers.length];
        this.nextWorkerIdx++;
        w.postMessage({ cx: item.cx, cz: item.cz, seed: this.worldSeed });
      } else {
        this.readyQueue.push(generateChunkData(item.cx, item.cz, this.worldSeed));
      }
    }
  }

  public update(playerX: number, playerZ: number): void {
    const { cx: pcx, cz: pcz } = worldToChunk(playerX, playerZ);

    if (pcx !== this.lastPlayerChunkX || pcz !== this.lastPlayerChunkZ) {
      this.lastPlayerChunkX = pcx;
      this.lastPlayerChunkZ = pcz;

      const R = this.currentViewRadius;
      for (const chunk of this.activeChunks.values()) {
        if (Math.abs(chunk.cx - pcx) > R || Math.abs(chunk.cz - pcz) > R) {
          this.unloadChunk(chunk);
        }
      }

      this.requestMissingChunks(pcx, pcz);
      if (this.readyQueue.length > 1) {
        this.readyQueue.sort((a, b) => {
          const da = (a.cx - pcx) ** 2 + (a.cz - pcz) ** 2;
          const db = (b.cx - pcx) ** 2 + (b.cz - pcz) ** 2;
          return da - db;
        });
      }
    }

    const visDx = playerX - this.lastVisX;
    const visDz = playerZ - this.lastVisZ;
    if (Number.isNaN(visDx) || visDx * visDx + visDz * visDz >= 16) {
      this.lastVisX = playerX;
      this.lastVisZ = playerZ;
      const size = CHUNK_CONFIG.CHUNK_SIZE;
      for (const chunk of this.activeChunks.values()) {
        chunk.slot.group.visible = this.isChunkVisible(chunk.cx, chunk.cz, playerX, playerZ);
        const cdx = chunk.cx * size - playerX;
        const cdz = chunk.cz * size - playerZ;
        const distSq = cdx * cdx + cdz * cdz;
        chunk.slot.grassChunk.setDistanceVisible(distSq <= CHUNK_CONFIG.GRASS_CULL_DIST_SQ);
        const useHighLod = distSq <= TREE_HIGH_LOD_DIST_SQ;
        for (let i = 0; i < TREE_KINDS.length; i++) {
          chunk.slot.treeChunks[TREE_KINDS[i]].setLodMode(useHighLod);
        }
      }
    }

    let uploaded = 0;
    while (this.readyQueue.length > 0 && uploaded < CHUNK_CONFIG.MAX_UPLOADS_PER_FRAME) {
      const next = this.readyQueue.shift()!;
      if (
        next.seed === this.worldSeed &&
        Math.abs(next.cx - pcx) <= this.currentViewRadius &&
        Math.abs(next.cz - pcz) <= this.currentViewRadius
      ) {
        this.mountChunkData(next, playerX, playerZ);
        uploaded++;
      }
    }
  }

  public resolveChunkColliders(x: number, z: number, radius: number): { x: number; z: number } {
    const { cx, cz } = worldToChunk(x, z);
    let rx = x;
    let rz = z;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.activeChunks.get(chunkKey(cx + dx, cz + dz));
        if (!chunk) continue;
        const cols = chunk.colliderData;
        for (let i = 0; i < cols.length; i += COLLIDER_STRIDE) {
          const cxPos = cols[i];
          const czPos = cols[i + 1];
          const cr = cols[i + 2];
          const ddx = rx - cxPos;
          const ddz = rz - czPos;
          const minD = radius + cr;
          const distSq = ddx * ddx + ddz * ddz;
          if (distSq < minD * minD && distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const push = minD - dist;
            rx += (ddx / dist) * push;
            rz += (ddz / dist) * push;
          }
        }
      }
    }
    return { x: rx, z: rz };
  }

  public dispose(): void {
    for (let i = 0; i < this.workers.length; i++) {
      this.workers[i].terminate();
    }
    this.workers.length = 0;

    for (const chunk of this.activeChunks.values()) {
      this.unloadChunk(chunk);
    }

    for (const slot of this.chunkSlotPool) {
      slot.terrainGeo.dispose();
      slot.liquidGeo.dispose();
      slot.grassChunk.dispose();
      (['leafy', 'pine', 'volcanic'] as TreeVisualKind[]).forEach((k) => slot.treeChunks[k].dispose());
      (['normal', 'volcanic', 'rocky', 'snow'] as RockVariant[]).forEach((v) => slot.rockInsts[v].dispose());
      this.scene.remove(slot.group);
    }
    this.chunkSlotPool.length = 0;
    this.pendingKeys.clear();
    this.readyQueue.length = 0;
    this.activeChunks.clear();

    this.terrainMat.dispose();
    this.waterMat.dispose();
    this.lavaMat.dispose();
    this.grassGeo.dispose();
    this.grassMat.dispose();
    (['leafy', 'pine', 'volcanic'] as TreeVisualKind[]).forEach((k) => {
      this.treeGeosHigh[k].dispose();
      this.treeGeosLow[k].dispose();
      this.treeMatsHigh[k].dispose();
      this.treeMatsLow[k].dispose();
    });
    this.rockGeoMerged.dispose();
    Object.values(this.rockMats).forEach((m) => m.dispose());
  }
}
