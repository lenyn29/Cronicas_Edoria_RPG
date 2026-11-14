import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLOBAL_DAY_NIGHT_UNIFORMS } from './GlobalDayNightUniforms';
import { PALETTE_ENVIRONMENT } from './PaletteEnvironment';

export type TreeVisualKind = 'leafy' | 'pine' | 'volcanic';

export interface TreeSharedUniforms {
  uTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindStrength: { value: number };
}

const _col = new THREE.Color();
const _colShadow = new THREE.Color();
const _colMid = new THREE.Color();
const _colHighlight = new THREE.Color();

// Prepara una BufferGeometry no indexada con atributos homogéneos (position, normal, color, aFoliageMask)
// para garantizar mergeGeometries limpio y cero texturas.
function finalizeSubGeometry(
  rawGeo: THREE.BufferGeometry,
  shadowHex: number,
  midHex: number,
  highlightHex: number,
  foliageMask: number,
  yMin: number,
  yMax: number,
  noiseAmp = 0
): THREE.BufferGeometry {
  const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
  if (geo !== rawGeo) rawGeo.dispose();

  if (geo.getAttribute('uv')) {
    geo.deleteAttribute('uv');
  }

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const count = pos.count;

  if (noiseAmp > 0) {
    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n =
        Math.sin(vx * 4.3 + vy * 3.1) * Math.cos(vz * 4.1 - vy * 2.7) * noiseAmp;
      const radialLen = Math.hypot(vx, vz);
      if (radialLen > 0.001) {
        const scale = 1.0 + n;
        pos.setXYZ(i, vx * scale, vy + n * 0.12, vz * scale);
      }
    }
    pos.needsUpdate = true;
  }

  geo.computeVertexNormals();

  const colors = new Float32Array(count * 3);
  const masks = new Float32Array(count);
  _colShadow.setHex(shadowHex);
  _colMid.setHex(midHex);
  _colHighlight.setHex(highlightHex);

  const span = Math.max(0.001, yMax - yMin);
  for (let i = 0; i < count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) - yMin) / span));
    if (t < 0.5) {
      _col.copy(_colShadow).lerp(_colMid, t * 2.0);
    } else {
      _col.copy(_colMid).lerp(_colHighlight, (t - 0.5) * 2.0);
    }
    colors[i * 3] = _col.r;
    colors[i * 3 + 1] = _col.g;
    colors[i * 3 + 2] = _col.b;
    masks[i] = foliageMask;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aFoliageMask', new THREE.BufferAttribute(masks, 1));
  return geo;
}

// Crea un tronco cilíndrico cónico con curvatura orgánica en los segmentos superiores
function buildCurvedTrunk(
  bottomRadius: number,
  topRadius: number,
  height: number,
  radialSegs: number,
  heightSegs: number,
  curveX: number,
  curveZ: number,
  trunkBaseHex: number,
  trunkShadowHex: number
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, radialSegs, heightSegs);
  geo.translate(0, height * 0.5, 0);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, y / height));
    const bend = t * t;
    const flare = t < 0.16 ? 1 + (0.16 - t) * 1.45 : 1.0;
    pos.setXYZ(i, x * flare + curveX * bend, y, z * flare + curveZ * bend);
  }
  pos.needsUpdate = true;

  return finalizeSubGeometry(geo, trunkShadowHex, trunkBaseHex, trunkBaseHex, 0.0, 0, height);
}

// Añade 3–4 raíces en ángulo en la base del tronco
function appendRoots(
  parts: THREE.BufferGeometry[],
  count: number,
  radius: number,
  length: number,
  trunkBaseHex: number,
  trunkShadowHex: number
): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + 0.4;
    const root = new THREE.ConeGeometry(radius, length, 5, 1);
    root.translate(0, length * 0.42, 0);
    root.rotateZ(-1.12);
    root.rotateY(ang);
    root.translate(Math.cos(ang) * 0.18, 0.04, -Math.sin(ang) * 0.18);
    parts.push(
      finalizeSubGeometry(root, trunkShadowHex, trunkBaseHex, trunkBaseHex, 0.0, 0, length * 0.6)
    );
  }
}

// Añade una rama inclinada saliendo desde el tronco
function createBranchPart(
  length: number,
  rBottom: number,
  rTop: number,
  startX: number,
  startY: number,
  startZ: number,
  yaw: number,
  pitch: number,
  trunkBaseHex: number,
  trunkShadowHex: number
): THREE.BufferGeometry {
  const b = new THREE.CylinderGeometry(rTop, rBottom, length, 5, 1);
  b.translate(0, length * 0.5, 0);
  b.rotateZ(-pitch);
  b.rotateY(yaw);
  b.translate(startX, startY, startZ);
  return finalizeSubGeometry(b, trunkShadowHex, trunkBaseHex, trunkBaseHex, 0.0, startY - 0.1, startY + length);
}

// 1. ROBLE (Pradera y Bosque): Tronco curvo + raíces + ramas bifurcadas + 4 copas asimétricas de icosaedros aplastados
export function buildLeafyTreeGeometry(highLod: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkHeight = 2.05;
  const curveX = 0.18;
  const curveZ = -0.1;

  parts.push(
    buildCurvedTrunk(
      0.29,
      0.14,
      trunkHeight,
      highLod ? 8 : 5,
      highLod ? 4 : 2,
      curveX,
      curveZ,
      PALETTE_ENVIRONMENT.TRUNK_BASE,
      PALETTE_ENVIRONMENT.TRUNK_SHADOW
    )
  );

  if (highLod) {
    appendRoots(parts, 4, 0.13, 0.48, PALETTE_ENVIRONMENT.TRUNK_BASE, PALETTE_ENVIRONMENT.TRUNK_SHADOW);

    // 3 ramas principales entre el 45% y el 72% de altura del tronco
    const branches = [
      { yFrac: 0.48, yaw: 0.5, pitch: 0.82, len: 0.95 },
      { yFrac: 0.60, yaw: 2.55, pitch: 0.78, len: 0.88 },
      { yFrac: 0.68, yaw: 4.5, pitch: 0.72, len: 0.82 },
    ];
    for (const br of branches) {
      const sy = trunkHeight * br.yFrac;
      const sx = curveX * br.yFrac * br.yFrac;
      const sz = curveZ * br.yFrac * br.yFrac;
      parts.push(
        createBranchPart(
          br.len,
          0.085,
          0.042,
          sx,
          sy,
          sz,
          br.yaw,
          br.pitch,
          PALETTE_ENVIRONMENT.TRUNK_BASE,
          PALETTE_ENVIRONMENT.TRUNK_SHADOW
        )
      );
    }

    // 4 copas asimétricas superpuestas en forma de icosaedros aplastados con relieve orgánico y gradiente verde
    const canopyClusters = [
      { x: -0.58, y: 2.28, z: 0.36, r: 0.92, sy: 0.72 },
      { x: 0.66, y: 2.42, z: -0.32, r: 0.86, sy: 0.7 },
      { x: 0.08, y: 2.68, z: 0.52, r: 0.82, sy: 0.68 },
      { x: 0.12, y: 2.98, z: -0.06, r: 1.06, sy: 0.74 },
    ];
    for (const c of canopyClusters) {
      const g = new THREE.IcosahedronGeometry(c.r, 1);
      g.scale(1.06, c.sy, 1.02);
      g.translate(c.x, c.y, c.z);
      parts.push(
        finalizeSubGeometry(
          g,
          PALETTE_ENVIRONMENT.TREE_SHADOW,
          PALETTE_ENVIRONMENT.TREE_BASE,
          PALETTE_ENVIRONMENT.TREE_HIGHLIGHT,
          1.0,
          c.y - c.r * c.sy,
          c.y + c.r * c.sy,
          0.11
        )
      );
    }
  } else {
    // LOD lejano: tronco + 2 capas de follaje ligeras sin ramas ni vaivén
    const lowCanopies = [
      { x: -0.25, y: 2.35, z: 0.15, r: 1.05, sy: 0.72 },
      { x: 0.18, y: 2.82, z: -0.1, r: 0.92, sy: 0.72 },
    ];
    for (const c of lowCanopies) {
      const g = new THREE.IcosahedronGeometry(c.r, 0);
      g.scale(1.05, c.sy, 1.05);
      g.translate(c.x, c.y, c.z);
      parts.push(
        finalizeSubGeometry(
          g,
          PALETTE_ENVIRONMENT.TREE_SHADOW,
          PALETTE_ENVIRONMENT.TREE_BASE,
          PALETTE_ENVIRONMENT.TREE_HIGHLIGHT,
          1.0,
          c.y - c.r * c.sy,
          c.y + c.r * c.sy
        )
      );
    }
  }

  const merged = mergeGeometries(parts, false) ?? parts[0].clone();
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

// 2. PINO (Colinas Rocosas y Picos Nevados): Tronco alto esbelto + raíces + 5 conos escalonados con gradiente
export function buildSnowPineGeometry(highLod: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkHeight = 2.35;

  parts.push(
    buildCurvedTrunk(
      0.22,
      0.09,
      trunkHeight,
      highLod ? 7 : 5,
      highLod ? 3 : 1,
      0.05,
      -0.04,
      PALETTE_ENVIRONMENT.TRUNK_BASE,
      PALETTE_ENVIRONMENT.TRUNK_SHADOW
    )
  );

  if (highLod) {
    appendRoots(parts, 3, 0.11, 0.42, PALETTE_ENVIRONMENT.TRUNK_BASE, PALETTE_ENVIRONMENT.TRUNK_SHADOW);
  }

  const tiers = highLod
    ? [
        { y: 1.15, r: 1.28, h: 1.25, tiltX: 0.03, tiltZ: -0.02 },
        { y: 1.85, r: 1.08, h: 1.15, tiltX: -0.02, tiltZ: 0.03 },
        { y: 2.52, r: 0.88, h: 1.05, tiltX: 0.02, tiltZ: 0.02 },
        { y: 3.12, r: 0.66, h: 0.92, tiltX: -0.03, tiltZ: -0.01 },
        { y: 3.64, r: 0.44, h: 0.78, tiltX: 0.01, tiltZ: 0.02 },
      ]
    : [
        { y: 1.25, r: 1.25, h: 1.75, tiltX: 0, tiltZ: 0 },
        { y: 2.45, r: 0.82, h: 1.55, tiltX: 0, tiltZ: 0 },
      ];

  for (const t of tiers) {
    const cone = new THREE.ConeGeometry(t.r, t.h, highLod ? 7 : 5, 1);
    cone.rotateX(t.tiltX);
    cone.rotateZ(t.tiltZ);
    cone.translate(0, t.y + t.h * 0.5, 0);
    parts.push(
      finalizeSubGeometry(
        cone,
        0x1a5a2a,
        0x246b32,
        0x2d7a3a,
        1.0,
        t.y,
        t.y + t.h,
        highLod ? 0.06 : 0
      )
    );
  }

  const merged = mergeGeometries(parts, false) ?? parts[0].clone();
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

// 3. ÁRBOL RETORCIDO (Volcánico / Pantano): Tronco muy curvado + ramas escasas + 2 copas irregulares pequeñas
export function buildVolcanicTreeGeometry(highLod: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkHeight = 2.4;

  parts.push(
    buildCurvedTrunk(
      0.3,
      0.12,
      trunkHeight,
      highLod ? 7 : 5,
      highLod ? 5 : 2,
      0.46,
      -0.28,
      PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_BASE,
      PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW
    )
  );

  if (highLod) {
    appendRoots(
      parts,
      3,
      0.13,
      0.52,
      PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_BASE,
      PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW
    );

    parts.push(
      createBranchPart(
        1.05,
        0.08,
        0.04,
        0.12,
        1.15,
        -0.07,
        2.9,
        0.92,
        PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_BASE,
        PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW
      )
    );
    parts.push(
      createBranchPart(
        0.85,
        0.07,
        0.035,
        0.24,
        1.65,
        -0.14,
        0.35,
        0.84,
        PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_BASE,
        PALETTE_ENVIRONMENT.VOLCANIC_TRUNK_SHADOW
      )
    );

    const clusters = [
      { x: 0.58, y: 2.52, z: -0.34, r: 0.64, sy: 0.68 },
      { x: -0.62, y: 1.92, z: 0.24, r: 0.52, sy: 0.65 },
    ];
    for (const c of clusters) {
      const g = new THREE.IcosahedronGeometry(c.r, 1);
      g.scale(1.08, c.sy, 0.96);
      g.translate(c.x, c.y, c.z);
      parts.push(
        finalizeSubGeometry(
          g,
          0x3d4d3a,
          0x4a6a4a,
          PALETTE_ENVIRONMENT.VOLCANIC_EMBER_HIGHLIGHT,
          1.0,
          c.y - c.r * c.sy,
          c.y + c.r * c.sy,
          0.14
        )
      );
    }
  } else {
    const g = new THREE.IcosahedronGeometry(0.68, 0);
    g.scale(1.05, 0.68, 1.0);
    g.translate(0.42, 2.48, -0.24);
    parts.push(
      finalizeSubGeometry(
        g,
        0x3d4d3a,
        0x4a6a4a,
        PALETTE_ENVIRONMENT.VOLCANIC_EMBER_BASE,
        1.0,
        2.0,
        2.95
      )
    );
  }

  const merged = mergeGeometries(parts, false) ?? parts[0].clone();
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

// Material compartido para árboles: MeshLambertMaterial con vertexColors + sway exclusivo del follaje (aFoliageMask)
export function createTreeLambertMaterial(
  uniforms: TreeSharedUniforms,
  enableSway: boolean,
  isVolcanic = false
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: isVolcanic ? new THREE.Color(0x2e0d04) : new THREE.Color(0x000000),
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uAmbientColor = GLOBAL_DAY_NIGHT_UNIFORMS.uAmbientColor;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       attribute float aColorVar;
       attribute vec3 aCanopyTint;
       attribute float aFoliageMask;
       uniform float uTime;
       uniform vec2 uWindDir;
       uniform float uWindStrength;
       varying float vColorVar;
       varying float vFoliageMask;
       varying vec3 vCanopyTint;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vColorVar = aColorVar;
       vFoliageMask = aFoliageMask;
       vCanopyTint = aCanopyTint;
       ${
         enableSway
           ? `#ifdef USE_INSTANCING
                float crownFactor = aFoliageMask * smoothstep(0.85, 3.3, position.y);
                vec3 instOrigin = instanceMatrix[3].xyz;
                float treeSway = sin(uTime * 1.15 + instOrigin.x * 0.14 + instOrigin.z * 0.11 + aColorVar * 3.1) * uWindStrength * ${isVolcanic ? '0.09' : '0.30'};
                transformed.x += (treeSway * uWindDir.x + treeSway * 0.22) * crownFactor;
                transformed.z += (treeSway * uWindDir.y + treeSway * 0.12) * crownFactor;
              #endif`
           : ''
       }`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform vec3 uAmbientColor;
       varying float vColorVar;
       varying float vFoliageMask;
       varying vec3 vCanopyTint;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float tint = mix(0.88, 1.14, vColorVar);
       diffuseColor.rgb *= mix(vec3(1.0), vCanopyTint * tint, vFoliageMask) * mix(vec3(1.0), uAmbientColor, 0.35);`
    );
  };

  return mat;
}

export class TreeChunk {
  public readonly highMesh: THREE.InstancedMesh;
  public readonly lowMesh: THREE.InstancedMesh;
  private readonly highColorVarAttr: THREE.InstancedBufferAttribute;
  private readonly lowColorVarAttr: THREE.InstancedBufferAttribute;
  private readonly highCanopyTintAttr: THREE.InstancedBufferAttribute;
  private readonly lowCanopyTintAttr: THREE.InstancedBufferAttribute;
  public count = 0;

  constructor(
    highGeo: THREE.BufferGeometry,
    lowGeo: THREE.BufferGeometry,
    highMat: THREE.MeshLambertMaterial,
    lowMat: THREE.MeshLambertMaterial,
    maxInstances: number,
    chunkSize: number
  ) {
    const gHigh = highGeo.clone();
    const gLow = lowGeo.clone();

    this.highColorVarAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1);
    this.lowColorVarAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1);
    this.highCanopyTintAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
    this.lowCanopyTintAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
    gHigh.setAttribute('aColorVar', this.highColorVarAttr);
    gLow.setAttribute('aColorVar', this.lowColorVarAttr);
    gHigh.setAttribute('aCanopyTint', this.highCanopyTintAttr);
    gLow.setAttribute('aCanopyTint', this.lowCanopyTintAttr);

    this.highMesh = new THREE.InstancedMesh(gHigh, highMat, maxInstances);
    this.highMesh.castShadow = true;
    this.highMesh.receiveShadow = false;
    this.highMesh.frustumCulled = true;
    this.highMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), chunkSize * 0.95);
    this.highMesh.count = 0;
    this.highMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);

    this.lowMesh = new THREE.InstancedMesh(gLow, lowMat, maxInstances);
    this.lowMesh.castShadow = false;
    this.lowMesh.receiveShadow = false;
    this.lowMesh.frustumCulled = true;
    this.lowMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), chunkSize * 0.95);
    this.lowMesh.count = 0;
    this.lowMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
  }

  public setInstance(index: number, matrix: THREE.Matrix4, canopyTint: THREE.Color, colorVar: number): void {
    this.highMesh.setMatrixAt(index, matrix);
    this.highMesh.setColorAt(index, _col.setHex(0xffffff));
    this.highColorVarAttr.setX(index, colorVar);
    this.highCanopyTintAttr.setXYZ(index, canopyTint.r, canopyTint.g, canopyTint.b);

    this.lowMesh.setMatrixAt(index, matrix);
    this.lowMesh.setColorAt(index, _col);
    this.lowColorVarAttr.setX(index, colorVar);
    this.lowCanopyTintAttr.setXYZ(index, canopyTint.r, canopyTint.g, canopyTint.b);
  }

  public finalize(originX: number, originZ: number, chunkSize: number, count: number, useHighLod: boolean): void {
    this.count = count;
    this.highMesh.count = useHighLod ? count : 0;
    this.lowMesh.count = useHighLod ? 0 : count;
    this.highMesh.visible = useHighLod && count > 0;
    this.lowMesh.visible = !useHighLod && count > 0;

    if (this.highMesh.boundingSphere) {
      this.highMesh.boundingSphere.center.set(originX, 2.5, originZ);
      this.highMesh.boundingSphere.radius = chunkSize * 1.02;
    }
    if (this.lowMesh.boundingSphere) {
      this.lowMesh.boundingSphere.center.set(originX, 2.5, originZ);
      this.lowMesh.boundingSphere.radius = chunkSize * 1.02;
    }

    if (count > 0) {
      this.highMesh.instanceMatrix.needsUpdate = true;
      this.lowMesh.instanceMatrix.needsUpdate = true;
      if (this.highMesh.instanceColor) this.highMesh.instanceColor.needsUpdate = true;
      if (this.lowMesh.instanceColor) this.lowMesh.instanceColor.needsUpdate = true;
      this.highColorVarAttr.needsUpdate = true;
      this.lowColorVarAttr.needsUpdate = true;
      this.highCanopyTintAttr.needsUpdate = true;
      this.lowCanopyTintAttr.needsUpdate = true;
    }
  }

  public setLodMode(useHighLod: boolean): void {
    const c = this.count;
    this.highMesh.count = useHighLod ? c : 0;
    this.lowMesh.count = useHighLod ? 0 : c;
    this.highMesh.visible = useHighLod && c > 0;
    this.lowMesh.visible = !useHighLod && c > 0;
  }

  public clear(): void {
    this.count = 0;
    this.highMesh.count = 0;
    this.lowMesh.count = 0;
    this.highMesh.visible = false;
    this.lowMesh.visible = false;
  }

  public dispose(): void {
    this.highMesh.geometry.dispose();
    this.lowMesh.geometry.dispose();
    this.highMesh.dispose();
    this.lowMesh.dispose();
  }
}
