import * as THREE from 'three';
import {
  createAdditivePointsMaterial,
  createContactShadowMaterial,
  createEntityOutlineMaterial,
  createEntityShaderMaterial,
  EntityShaderOptions,
} from './EntityShader';
import { PALETTE_32 } from './Palette';

const _burstScratchColor = new THREE.Color();
const EXTRUDED_GEO_CACHE = new Map<string, THREE.BufferGeometry>();
let _sharedShadowGeo: THREE.BufferGeometry | null = null;
function getSharedShadowGeo(): THREE.BufferGeometry {
  if (!_sharedShadowGeo) {
    _sharedShadowGeo = new THREE.CircleGeometry(1, 18);
    _sharedShadowGeo.rotateX(-Math.PI / 2);
  }
  return _sharedShadowGeo;
}

export interface AdditivePointSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

export interface ProceduralEntityOptions {
  hasShadow?: boolean;
  shadowRadius?: number;
  outlineWidth?: number;
  colliderHalfW?: number;
  colliderHalfH?: number;
  particlePoolSize?: number;
}

export abstract class ProceduralEntity {
  public readonly group = new THREE.Group();
  public readonly rigRoot = new THREE.Group();

  protected readonly bodyMaterials: THREE.ShaderMaterial[] = [];
  protected readonly outlineMaterials: THREE.ShaderMaterial[] = [];
  protected readonly disposableGeos: THREE.BufferGeometry[] = [];
  protected readonly disposableMats: THREE.Material[] = [];

  protected readonly sharedLightDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
  protected readonly sharedAmbientTint = new THREE.Color(1, 1, 1);

  protected shadowDisc: THREE.Mesh | null = null;
  protected shadowMat: THREE.ShaderMaterial | null = null;
  protected readonly shadowBaseRadius: number;
  protected readonly baseOutlineWidth: number;

  private readonly collider = new THREE.Box2();
  private readonly colliderMin = new THREE.Vector2();
  private readonly colliderMax = new THREE.Vector2();
  protected readonly colliderHalfW: number;
  protected readonly colliderHalfH: number;

  // Pool opcional de partículas aditivas (cero partículas en reposo)
  private pointsMesh: THREE.Points | null = null;
  private pointsGeo: THREE.BufferGeometry | null = null;
  private pointsMat: THREE.ShaderMaterial | null = null;
  private pointPool: AdditivePointSlot[] = [];
  private pointPosArr: Float32Array | null = null;
  private pointSizeArr: Float32Array | null = null;
  private pointAlphaArr: Float32Array | null = null;
  private pointColorArr: Float32Array | null = null;

  protected elapsed = 0;
  protected stateTimer = 0;
  protected currentState = 'idle';
  protected flashTimer = 0;
  protected flashDuration = 0.14;
  protected healthRatio = 1.0;
  protected _debugSilhouette = false;
  protected facingYaw = 0;
  protected currentYaw = 0;
  protected squashAmount = 0;

  constructor(opts: ProceduralEntityOptions = {}) {
    this.shadowBaseRadius = opts.shadowRadius ?? 0.62;
    this.baseOutlineWidth = opts.outlineWidth ?? 0.022;
    this.colliderHalfW = opts.colliderHalfW ?? 0.42;
    this.colliderHalfH = opts.colliderHalfH ?? 0.42;

    this.group.add(this.rigRoot);
    this.rigRoot.rotation.x = 0;

    if (opts.hasShadow !== false) {
      this.buildShadow();
    }

    if ((opts.particlePoolSize ?? 0) > 0) {
      this.initParticlePool(opts.particlePoolSize!);
    }
  }

  public abstract buildBody(): void;

  public buildShadow(): void {
    if (this.shadowDisc) return;
    const shadowGeo = getSharedShadowGeo();
    this.shadowMat = createContactShadowMaterial(0.5);
    this.disposableMats.push(this.shadowMat);
    this.shadowDisc = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadowDisc.scale.set(this.shadowBaseRadius, 1, this.shadowBaseRadius);
    this.shadowDisc.position.y = 0.03;
    this.group.add(this.shadowDisc);
  }

  public buildOutline(
    geo: THREE.BufferGeometry,
    opacity = 1.0,
    widthScale = 1.0,
    registerList?: THREE.ShaderMaterial[]
  ): THREE.Mesh {
    const outMat = createEntityOutlineMaterial(this.baseOutlineWidth * widthScale, opacity, PALETTE_32.CONTORNO);
    if (registerList) registerList.push(outMat);
    else this.outlineMaterials.push(outMat);
    const mesh = new THREE.Mesh(geo, outMat);
    mesh.userData.outlineScale = widthScale;
    return mesh;
  }

  protected createPartMaterial(
    opts: EntityShaderOptions,
    registerList?: THREE.ShaderMaterial[]
  ): THREE.ShaderMaterial {
    const mat = createEntityShaderMaterial({
      ...opts,
      sharedLightDir: this.sharedLightDir,
      sharedAmbientTint: this.sharedAmbientTint,
    });
    mat.uniforms.uDebugSilhouette.value = this._debugSilhouette ? 1.0 : 0.0;
    mat.uniforms.uHealthRatio.value = this.healthRatio;
    if (registerList) registerList.push(mat);
    else this.bodyMaterials.push(mat);
    return mat;
  }

  protected createExtrudedShapePart(
    shape: THREE.Shape,
    depth: number,
    shaderOpts: EntityShaderOptions,
    withOutline = true,
    bevelScale = 1.0,
    outlineScale = 1.0,
    dynamicBuckets?: {
      geos: THREE.BufferGeometry[];
      mats: THREE.ShaderMaterial[];
      outlines: THREE.ShaderMaterial[];
    },
    geoCacheKey?: string
  ): THREE.Group {
    let geo: THREE.BufferGeometry | undefined = geoCacheKey ? EXTRUDED_GEO_CACHE.get(geoCacheKey) : undefined;
    if (!geo) {
      geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: Math.min(0.028, depth * 0.28) * bevelScale,
        bevelSize: 0.022 * bevelScale,
        bevelSegments: 2,
        curveSegments: 8,
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.computeVertexNormals();

      if (geoCacheKey) {
        EXTRUDED_GEO_CACHE.set(geoCacheKey, geo);
      } else if (dynamicBuckets) {
        dynamicBuckets.geos.push(geo);
      } else {
        this.disposableGeos.push(geo);
      }
    }

    const holder = new THREE.Group();
    const mat = this.createPartMaterial(shaderOpts, dynamicBuckets?.mats);
    const mesh = new THREE.Mesh(geo, mat);
    const opacity = shaderOpts.opacity ?? 1.0;
    mesh.castShadow = opacity >= 0.98 && !shaderOpts.additive;
    mesh.receiveShadow = !shaderOpts.additive;
    holder.add(mesh);

    if (withOutline) {
      holder.add(this.buildOutline(geo, opacity, outlineScale, dynamicBuckets?.outlines));
    }

    return holder;
  }

  protected initParticlePool(poolSize: number): void {
    this.pointPosArr = new Float32Array(poolSize * 3);
    this.pointSizeArr = new Float32Array(poolSize);
    this.pointAlphaArr = new Float32Array(poolSize);
    this.pointColorArr = new Float32Array(poolSize * 3);
    for (let i = 0; i < poolSize; i++) {
      this.pointPool.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.3,
        size: 0.2,
        r: 1,
        g: 1,
        b: 1,
      });
    }
    this.pointsGeo = new THREE.BufferGeometry();
    this.pointsGeo.setAttribute('position', new THREE.BufferAttribute(this.pointPosArr, 3));
    this.pointsGeo.setAttribute('aSize', new THREE.BufferAttribute(this.pointSizeArr, 1));
    this.pointsGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pointAlphaArr, 1));
    this.pointsGeo.setAttribute('aColor', new THREE.BufferAttribute(this.pointColorArr, 3));
    this.pointsMat = createAdditivePointsMaterial();
    this.pointsMesh = new THREE.Points(this.pointsGeo, this.pointsMat);
    this.pointsMesh.frustumCulled = false;
    this.pointsMesh.visible = false;
    this.group.add(this.pointsMesh);
  }

  public spawnAdditiveBurst(
    forwardOffset: number,
    hexColor: number,
    count: number,
    baseY = 0.25,
    speed = 2.2
  ): void {
    if (this.pointPool.length === 0) return;
    const col = _burstScratchColor.setHex(hexColor);
    const fx = Math.sin(this.currentYaw);
    const fz = Math.cos(this.currentYaw);
    let spawned = 0;
    for (let i = 0; i < this.pointPool.length && spawned < count; i++) {
      const p = this.pointPool[i];
      if (p.active) continue;
      p.active = true;
      p.x = fx * forwardOffset + (Math.random() - 0.5) * 0.45;
      p.y = baseY + Math.random() * 0.45;
      p.z = fz * forwardOffset + (Math.random() - 0.5) * 0.45;
      p.vx = (Math.random() - 0.5) * speed + fx * 0.85;
      p.vy = 0.85 + Math.random() * 1.35;
      p.vz = (Math.random() - 0.5) * speed + fz * 0.85;
      p.maxLife = 0.26 + Math.random() * 0.18;
      p.life = p.maxLife;
      p.size = 0.16 + Math.random() * 0.14;
      p.r = col.r;
      p.g = col.g;
      p.b = col.b;
      spawned++;
    }
  }

  protected updateEntityParticles(delta: number): void {
    if (!this.pointsMesh || !this.pointsGeo || !this.pointPosArr || !this.pointSizeArr || !this.pointAlphaArr || !this.pointColorArr) {
      return;
    }
    let anyActive = false;
    for (let i = 0; i < this.pointPool.length; i++) {
      const p = this.pointPool[i];
      if (!p.active) {
        this.pointAlphaArr[i] = 0;
        continue;
      }
      p.life -= delta;
      if (p.life <= 0) {
        p.active = false;
        this.pointAlphaArr[i] = 0;
        continue;
      }
      anyActive = true;
      p.vy -= 4.2 * delta;
      p.x += p.vx * delta;
      p.y = Math.max(0.04, p.y + p.vy * delta);
      p.z += p.vz * delta;

      const t = p.life / p.maxLife;
      const i3 = i * 3;
      this.pointPosArr[i3] = p.x;
      this.pointPosArr[i3 + 1] = p.y;
      this.pointPosArr[i3 + 2] = p.z;
      this.pointSizeArr[i] = p.size * (0.5 + t * 0.8);
      this.pointAlphaArr[i] = t * 0.85;
      this.pointColorArr[i3] = p.r;
      this.pointColorArr[i3 + 1] = p.g;
      this.pointColorArr[i3 + 2] = p.b;
    }

    this.pointsMesh.visible = anyActive;
    if (anyActive) {
      (this.pointsGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.pointsGeo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (this.pointsGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
      (this.pointsGeo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  public get debugSilhouette(): boolean {
    return this._debugSilhouette;
  }

  public set debugSilhouette(value: boolean) {
    if (this._debugSilhouette === value) return;
    this._debugSilhouette = value;
    const f = value ? 1.0 : 0.0;
    for (let i = 0; i < this.bodyMaterials.length; i++) {
      this.bodyMaterials[i].uniforms.uDebugSilhouette.value = f;
    }
    this.onDebugSilhouetteChanged(f);
  }

  protected onDebugSilhouetteChanged(_flag: number): void {
    // Extensible para materiales dinámicos en subclases (ej. equipamiento)
  }

  public setWorldPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  public setFacing(fx: number, fz: number): void {
    if (Math.hypot(fx, fz) > 0.01) {
      this.facingYaw = Math.atan2(fx, fz);
    }
  }

  public setLightAndTint(lightDir: THREE.Vector3, ambientTint: THREE.Color): void {
    this.sharedLightDir.copy(lightDir).normalize();
    this.sharedAmbientTint.copy(ambientTint);
  }

  public setZoomOutline(viewSize: number, referenceViewSize = 11.5): void {
    const scaled = this.baseOutlineWidth * (viewSize / referenceViewSize);
    for (let i = 0; i < this.outlineMaterials.length; i++) {
      this.outlineMaterials[i].uniforms.uOutlineWidth.value = scaled;
    }
    this.onZoomOutlineChanged(scaled);
  }

  protected onZoomOutlineChanged(_scaledWidth: number): void {
    // Extensible en subclases
  }

  public setHealthRatio(ratio: number): void {
    this.healthRatio = Math.max(0, Math.min(1, ratio));
    for (let i = 0; i < this.bodyMaterials.length; i++) {
      this.bodyMaterials[i].uniforms.uHealthRatio.value = this.healthRatio;
    }
  }

  public triggerFlash(intensity = 0.9, duration = 0.14): void {
    this.flashDuration = duration;
    this.flashTimer = duration;
    for (let i = 0; i < this.bodyMaterials.length; i++) {
      this.bodyMaterials[i].uniforms.uFlashIntensity.value = intensity;
    }
  }

  public getCollider(): THREE.Box2 {
    const cx = this.group.position.x;
    const cz = this.group.position.z;
    this.colliderMin.set(cx - this.colliderHalfW, cz - this.colliderHalfH);
    this.colliderMax.set(cx + this.colliderHalfW, cz + this.colliderHalfH);
    this.collider.set(this.colliderMin, this.colliderMax);
    return this.collider;
  }

  public playAnimation(name: string): void {
    this.currentState = name;
    this.stateTimer = 0;
  }

  public update(delta: number): void {
    this.elapsed += delta;
    this.stateTimer += delta;

    let diff = this.facingYaw - this.currentYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.currentYaw += diff * (1 - Math.exp(-16 * delta));
    this.rigRoot.rotation.y = this.currentYaw;

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - delta);
    }
    const flashVal =
      this.flashTimer > 0 ? Math.sin((this.flashTimer / Math.max(0.01, this.flashDuration)) * Math.PI) : 0;

    for (let i = 0; i < this.bodyMaterials.length; i++) {
      this.bodyMaterials[i].uniforms.uTime.value = this.elapsed;
      this.bodyMaterials[i].uniforms.uFlashIntensity.value = flashVal;
    }

    this.squashAmount = THREE.MathUtils.damp(this.squashAmount, 0, 14, delta);
    this.updateEntityParticles(delta);
  }

  protected updateShadowByHeight(bobHeight: number): void {
    if (!this.shadowDisc || !this.shadowMat) return;
    const scale = this.shadowBaseRadius * Math.max(0.55, 1.0 - bobHeight * 1.45);
    this.shadowDisc.scale.set(scale, 1, scale);
    this.shadowMat.uniforms.uAlpha.value = Math.max(0.18, 0.5 - bobHeight * 0.85);
  }

  public dispose(): void {
    for (let i = 0; i < this.disposableGeos.length; i++) this.disposableGeos[i].dispose();
    for (let i = 0; i < this.bodyMaterials.length; i++) this.bodyMaterials[i].dispose();
    for (let i = 0; i < this.outlineMaterials.length; i++) this.outlineMaterials[i].dispose();
    for (let i = 0; i < this.disposableMats.length; i++) this.disposableMats[i].dispose();
    this.pointsGeo?.dispose();
    this.pointsMat?.dispose();
    this.disposableGeos.length = 0;
    this.bodyMaterials.length = 0;
    this.outlineMaterials.length = 0;
    this.disposableMats.length = 0;
  }
}
