import * as THREE from 'three';
import { GLOBAL_DAY_NIGHT_UNIFORMS } from './GlobalDayNightUniforms';
import { PALETTE_ENVIRONMENT } from './PaletteEnvironment';

export interface GrassSharedUniforms {
  uTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindStrength: { value: number };
  uPlayerPos: { value: THREE.Vector3 };
}

export const GRASS_BLADE_HEIGHT = 0.72;

// Construye una brizna procedural curvada de 3 segmentos (sin texturas, mínimo costo en GPU)
export function createGrassBladeGeometry(): THREE.BufferGeometry {
  const h = GRASS_BLADE_HEIGHT;
  const w = 0.16;

  // 7 vértices (3 segmentos verticales con ligera curvatura y pliegue en V para lectura desde cualquier ángulo)
  const positions = new Float32Array([
    -w * 0.5, 0.0, 0.03,       // 0: base izq
     w * 0.5, 0.0, 0.03,       // 1: base der
    -w * 0.40, h * 0.34, 0.0,  // 2: seg 1 izq
     w * 0.40, h * 0.34, 0.0,  // 3: seg 1 der
    -w * 0.22, h * 0.68, -0.04,// 4: seg 2 izq
     w * 0.22, h * 0.68, -0.04,// 5: seg 2 der
     0.0,      h,        -0.11 // 6: punta curvada
  ]);

  const normals = new Float32Array([
    -0.25, 0.65, 0.72,
     0.25, 0.65, 0.72,
    -0.22, 0.72, 0.66,
     0.22, 0.72, 0.66,
    -0.15, 0.80, 0.58,
     0.15, 0.80, 0.58,
     0.0,  0.88, 0.47,
  ]);

  const indices = [
    0, 1, 2,
    1, 3, 2,
    2, 3, 4,
    3, 5, 4,
    4, 5, 6,
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

// Material compartido de pasto Zelda clásico: MeshLambertMaterial sin texturas + sway en vertex shader
export function createGrassLambertMaterial(uniforms: GrassSharedUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uPlayerPos = uniforms.uPlayerPos;
    shader.uniforms.uAmbientColor = GLOBAL_DAY_NIGHT_UNIFORMS.uAmbientColor;
    shader.uniforms.uTimeOfDay = GLOBAL_DAY_NIGHT_UNIFORMS.uTimeOfDay;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       attribute float aColorVar;
       uniform float uTime;
       uniform vec2 uWindDir;
       uniform float uWindStrength;
       uniform vec3 uPlayerPos;
       varying float vColorVar;
       varying float vBladeH;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vColorVar = aColorVar;
       vBladeH = clamp(position.y / ${GRASS_BLADE_HEIGHT.toFixed(2)}, 0.0, 1.0);
       #ifdef USE_INSTANCING
         vec3 instOrigin = instanceMatrix[3].xyz;
         float sway = sin(uTime * 2.15 + instOrigin.x * 0.5 + instOrigin.z * 0.3 + aColorVar * 3.14159) * uWindStrength;
         float hf = vBladeH;
         transformed.x += (sway * uWindDir.x + sway * 0.32) * hf * hf;
         transformed.z += (sway * uWindDir.y + sway * 0.16) * hf * hf;

         vec2 diff = instOrigin.xz - uPlayerPos.xz;
         float dist = length(diff);
         float push = smoothstep(1.85, 0.25, dist) * 0.60 * hf;
         vec2 pDir = dist > 0.001 ? normalize(diff) : vec2(1.0, 0.0);
         transformed.x += pDir.x * push;
         transformed.z += pDir.y * push;
       #endif`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform vec3 uAmbientColor;
       varying float vColorVar;
       varying float vBladeH;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       // Gradiente suave de raíz (sombra) a punta iluminada + armonización con ciclo día/noche
       vec3 bladeShade = mix(vec3(0.68, 0.74, 0.64), vec3(1.22, 1.24, 1.10), vBladeH);
       float instVar = mix(0.84, 1.16, vColorVar);
       diffuseColor.rgb *= bladeShade * instVar * mix(vec3(1.0), uAmbientColor, 0.35);`
    );
  };

  return mat;
}

export class GrassChunk {
  public readonly mesh: THREE.InstancedMesh;
  public readonly colorVarAttr: THREE.InstancedBufferAttribute;
  public rawCount = 0;
  public dominantBiome = 0;
  public secondaryBiome = 0;
  public secondaryWeight = 0;

  constructor(
    bladeGeo: THREE.BufferGeometry,
    sharedMat: THREE.MeshLambertMaterial,
    maxInstances: number,
    chunkSize: number
  ) {
    const geo = bladeGeo.clone();
    const colorVarArray = new Float32Array(maxInstances);
    this.colorVarAttr = new THREE.InstancedBufferAttribute(colorVarArray, 1);
    geo.setAttribute('aColorVar', this.colorVarAttr);

    this.mesh = new THREE.InstancedMesh(geo, sharedMat, maxInstances);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), chunkSize * 0.9);
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
  }

  public applyChunkData(
    originX: number,
    originZ: number,
    chunkSize: number,
    count: number,
    densityRatio: number,
    matrices: Float32Array,
    colors: Float32Array,
    colorVars: Float32Array,
    dominantBiome = 0,
    secondaryBiome = 0,
    secondaryWeight = 0
  ): void {
    this.rawCount = count;
    this.dominantBiome = dominantBiome;
    this.secondaryBiome = secondaryBiome;
    this.secondaryWeight = secondaryWeight;
    this.mesh.count = Math.floor(count * densityRatio);
    this.mesh.visible = this.mesh.count > 0;
    if (this.mesh.boundingSphere) {
      this.mesh.boundingSphere.center.set(originX, 2, originZ);
      this.mesh.boundingSphere.radius = chunkSize * 0.98;
    }
    if (count > 0) {
      (this.mesh.instanceMatrix.array as Float32Array).set(matrices.subarray(0, count * 16));
      this.mesh.instanceMatrix.needsUpdate = true;

      if (this.mesh.instanceColor) {
        (this.mesh.instanceColor.array as Float32Array).set(colors.subarray(0, count * 3));
        this.mesh.instanceColor.needsUpdate = true;
      }

      (this.colorVarAttr.array as Float32Array).set(colorVars.subarray(0, count));
      this.colorVarAttr.needsUpdate = true;
    }
  }

  public setDensityRatio(ratio: number): void {
    this.mesh.count = Math.floor(this.rawCount * ratio);
  }

  public setDistanceVisible(inRange: boolean): void {
    this.mesh.visible = inRange && this.mesh.count > 0;
  }

  public clear(): void {
    this.mesh.count = 0;
    this.rawCount = 0;
    this.mesh.visible = false;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
