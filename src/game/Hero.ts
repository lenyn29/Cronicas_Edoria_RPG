import * as THREE from 'three';
import {
  DEFAULT_HERO_CONFIG,
  GEAR_SHADER_PALETTES,
  HERO_DIMENSIONS,
  HERO_PALETTE,
  HERO_SHADER_DEFAULTS,
  HERO_SPEEDS,
  HeroConfig,
} from './Constants';
import {
  CLOTH_COLOR_SWATCHES,
  HAIR_COLOR_SWATCHES,
  HairStyleId,
  HeroGender,
  PALETTE_32,
  SKIN_TONE_SWATCHES,
} from './core/Palette';
import {
  createHairShapePieces,
  createHelmetShapePieces,
  createHeroEyeShape,
} from './core/HeroPortraitParts';
import { ProceduralEntity } from './core/ProceduralEntity';
import { createHeadSilhouette, createTorsoSilhouette } from './core/ShapeLibrary';
import { EventBus, HeroEventMap, HeroState, heroEventBus } from './EventBus';
import { GearStyle, HeroAppearance } from './types';

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function buildTorsoSilhouette(gender: HeroGender): THREE.Shape {
  return createTorsoSilhouette(gender);
}

export function buildHeadSilhouette(gender: HeroGender): THREE.Shape {
  return createHeadSilhouette(gender);
}

export interface EnemyTargetRef {
  pos: THREE.Vector3;
  dead: boolean;
  radius: number;
  name: string;
}

// Héroe Vagabundo procedural que hereda de ProceduralEntity y soporta configuración pura (HeroConfig)
export class Hero extends ProceduralEntity {
  private readonly eventBus: EventBus<HeroEventMap>;

  // Jerarquía ósea humanoide compartida
  public readonly torsoGroup = new THREE.Group();
  public readonly headGroup = new THREE.Group();
  public readonly armLeftGroup = new THREE.Group();
  public readonly forearmLeftGroup = new THREE.Group();
  public readonly handLeftGroup = new THREE.Group();
  public readonly armRightGroup = new THREE.Group();
  public readonly forearmRightGroup = new THREE.Group();
  public readonly handRightGroup = new THREE.Group();
  public readonly legLeftGroup = new THREE.Group();
  public readonly calfLeftGroup = new THREE.Group();
  public readonly legRightGroup = new THREE.Group();
  public readonly calfRightGroup = new THREE.Group();

  // Contenedores separables por geometría (género / estilo de pelo) vs equipamiento
  private readonly torsoMeshHolder = new THREE.Group();
  private readonly headMeshHolder = new THREE.Group();
  private readonly vagabondDetailGroup = new THREE.Group();
  private readonly hairGroup = new THREE.Group();
  private readonly helmetGroup = new THREE.Group();
  private readonly armorGroup = new THREE.Group();
  private readonly gloveLeftGroup = new THREE.Group();
  private readonly gloveRightGroup = new THREE.Group();
  private readonly bootLeftGroup = new THREE.Group();
  private readonly bootRightGroup = new THREE.Group();
  private readonly weaponRightGroup = new THREE.Group();
  private readonly weaponLeftGroup = new THREE.Group();

  // Listas clasificadas para actualización de color instantánea por uniforms (sin regenerar geometría)
  private readonly skinMats: THREE.ShaderMaterial[] = [];
  private readonly clothMats: THREE.ShaderMaterial[] = [];
  private readonly hairMats: THREE.ShaderMaterial[] = [];
  private readonly silhouetteDynamicBuckets = {
    geos: [] as THREE.BufferGeometry[],
    mats: [] as THREE.ShaderMaterial[],
    outlines: [] as THREE.ShaderMaterial[],
  };
  private readonly hairDynamicBuckets = {
    geos: [] as THREE.BufferGeometry[],
    mats: [] as THREE.ShaderMaterial[],
    outlines: [] as THREE.ShaderMaterial[],
  };
  private readonly gearDynamicBuckets = {
    geos: [] as THREE.BufferGeometry[],
    mats: [] as THREE.ShaderMaterial[],
    outlines: [] as THREE.ShaderMaterial[],
  };

  private heroConfig: HeroConfig;
  private state: HeroState = 'idle';
  private transitionTimer = 0;
  private hurtFlashTimer = 0;
  private comboStep: 0 | 1 | 2 = 0;
  private attackDuration: number = HERO_SPEEDS.ATTACK_BASE_DUR;
  private currentBobY = 0;
  private hairPopTimer = 0;
  private lastAppearanceSig = '';
  private moveTarget: THREE.Vector3 | null = null;
  public autoAttackTarget: EnemyTargetRef | null = null;
  private appearance: HeroAppearance = {
    weapon: null,
    offhand: null,
    isDaggerMain: false,
    isDaggerOff: false,
    helmet: null,
    armor: null,
    gloves: null,
    boots: null,
  };

  constructor(bus: EventBus<HeroEventMap> = heroEventBus, initialConfig: HeroConfig = DEFAULT_HERO_CONFIG) {
    super({
      hasShadow: true,
      shadowRadius: HERO_DIMENSIONS.SHADOW_BASE_RADIUS,
      outlineWidth: HERO_SHADER_DEFAULTS.BASE_OUTLINE_WIDTH,
      colliderHalfW: HERO_DIMENSIONS.COLLIDER_HALF_W,
      colliderHalfH: HERO_DIMENSIONS.COLLIDER_HALF_H,
      particlePoolSize: HERO_SPEEDS.DUST_POOL_SIZE,
    });
    this.eventBus = bus;
    this.heroConfig = { ...initialConfig };
    this.sharedLightDir.set(
      HERO_SHADER_DEFAULTS.LIGHT_DIR_X,
      HERO_SHADER_DEFAULTS.LIGHT_DIR_Y,
      HERO_SHADER_DEFAULTS.LIGHT_DIR_Z
    ).normalize();

    this.buildBody();
    this.applyColorUniforms();
  }

  public getConfig(): HeroConfig {
    return { ...this.heroConfig };
  }

  private createTaggedPart(
    shape: THREE.Shape,
    depth: number,
    baseHex: number,
    shadowHex: number,
    highlightHex: number,
    tag: 'skin' | 'cloth' | 'hair' | 'neutral' | 'gear',
    withOutline = true,
    opacity = 1.0,
    bevelScale = 1.0,
    bucket?: {
      geos: THREE.BufferGeometry[];
      mats: THREE.ShaderMaterial[];
      outlines: THREE.ShaderMaterial[];
    }
  ): THREE.Group {
    const holder = this.createExtrudedShapePart(
      shape,
      depth,
      {
        baseColor: baseHex,
        shadowColor: shadowHex,
        highlightColor: highlightHex,
        rimStrength: 0.32,
        opacity,
      },
      withOutline,
      bevelScale,
      1.0,
      bucket
    );

    const mesh = holder.children[0] as THREE.Mesh | undefined;
    const mat = mesh?.material as THREE.ShaderMaterial | undefined;
    if (mat) {
      if (tag === 'skin') this.skinMats.push(mat);
      else if (tag === 'cloth') this.clothMats.push(mat);
      else if (tag === 'hair') this.hairMats.push(mat);
    }
    return holder;
  }

  public buildBody(): void {
    const skin = SKIN_TONE_SWATCHES[this.heroConfig.skinTone];
    const cloth = CLOTH_COLOR_SWATCHES[this.heroConfig.clothColor];

    // --- TORSO & CONTENEDOR DE SILUETA ---
    this.torsoGroup.position.set(0, 0.58, 0);
    this.torsoGroup.rotation.x = 0.09;
    this.rigRoot.add(this.torsoGroup);
    this.torsoGroup.add(this.torsoMeshHolder);
    this.torsoGroup.add(this.vagabondDetailGroup);

    // Detalles de ropa raída, rasgaduras con piel visible y manchas de tierra
    const ragLeft = new THREE.Shape();
    ragLeft.moveTo(-0.16, 0.06);
    ragLeft.lineTo(-0.19, -0.09);
    ragLeft.lineTo(-0.13, -0.04);
    ragLeft.lineTo(-0.08, -0.13);
    ragLeft.lineTo(-0.03, -0.02);
    ragLeft.lineTo(-0.02, 0.07);
    ragLeft.closePath();
    const ragLeftPart = this.createTaggedPart(
      ragLeft,
      0.04,
      cloth.shadow,
      PALETTE_32.TIERRA,
      cloth.base,
      'cloth',
      true,
      1.0,
      0.6
    );
    ragLeftPart.position.set(0, 0, 0.08);
    this.vagabondDetailGroup.add(ragLeftPart);

    const ragRight = new THREE.Shape();
    ragRight.moveTo(-0.12, 0.43);
    ragRight.quadraticCurveTo(0.02, 0.36, 0.16, 0.25);
    ragRight.lineTo(0.14, 0.17);
    ragRight.lineTo(0.09, 0.21);
    ragRight.lineTo(0.04, 0.14);
    ragRight.quadraticCurveTo(-0.03, 0.26, -0.13, 0.34);
    ragRight.closePath();
    const ragRightPart = this.createTaggedPart(
      ragRight,
      0.035,
      cloth.shadow,
      PALETTE_32.TIERRA,
      cloth.base,
      'cloth',
      true,
      1.0,
      0.55
    );
    ragRightPart.position.set(0, 0, 0.085);
    this.vagabondDetailGroup.add(ragRightPart);

    const ragBack = new THREE.Shape();
    ragBack.moveTo(-0.15, 0.12);
    ragBack.lineTo(-0.17, -0.11);
    ragBack.lineTo(-0.09, -0.05);
    ragBack.lineTo(0.0, -0.14);
    ragBack.lineTo(0.09, -0.04);
    ragBack.lineTo(0.16, -0.10);
    ragBack.lineTo(0.14, 0.12);
    ragBack.closePath();
    const ragBackPart = this.createTaggedPart(
      ragBack,
      0.035,
      cloth.base,
      cloth.shadow,
      cloth.highlight,
      'cloth',
      true,
      1.0,
      0.55
    );
    ragBackPart.position.set(0, 0, -0.08);
    this.vagabondDetailGroup.add(ragBackPart);

    // 2 rasgaduras que dejan ver la piel bajo la túnica
    const tearPositions: Array<[number, number, number]> = [
      [-0.085, 0.31, 0.088],
      [0.075, 0.16, 0.088],
    ];
    for (const [tx, ty, tz] of tearPositions) {
      const tearShape = new THREE.Shape();
      tearShape.moveTo(-0.04, 0.01);
      tearShape.lineTo(0.0, 0.032);
      tearShape.lineTo(0.042, -0.005);
      tearShape.lineTo(0.012, -0.025);
      tearShape.closePath();
      const tearPart = this.createTaggedPart(
        tearShape,
        0.02,
        skin.base,
        skin.shadow,
        skin.highlight,
        'skin',
        false,
        1.0,
        0.35
      );
      tearPart.position.set(tx, ty, tz);
      this.vagabondDetailGroup.add(tearPart);
    }

    // 4 manchas de suciedad en torso
    const dirtOffsets: Array<[number, number, number, number]> = [
      [0.085, 0.34, 0.092, 0.036],
      [-0.075, 0.12, 0.092, 0.042],
      [0.02, 0.22, -0.09, 0.045],
      [-0.11, 0.02, 0.096, 0.03],
    ];
    for (const [dx, dy, dz, rad] of dirtOffsets) {
      const dirtShape = new THREE.Shape();
      dirtShape.moveTo(-rad, 0);
      dirtShape.quadraticCurveTo(-rad * 0.4, rad * 0.9, rad * 0.7, rad * 0.6);
      dirtShape.quadraticCurveTo(rad, -rad * 0.2, 0, -rad * 0.8);
      dirtShape.quadraticCurveTo(-rad * 0.8, -rad * 0.5, -rad, 0);
      const dirtPart = this.createTaggedPart(
        dirtShape,
        0.012,
        HERO_PALETTE.DIRT,
        HERO_PALETTE.DIRT,
        HERO_PALETTE.DIRT,
        'neutral',
        false,
        HERO_SHADER_DEFAULTS.DIRT_OPACITY,
        0.25
      );
      dirtPart.position.set(dx, dy, dz);
      this.vagabondDetailGroup.add(dirtPart);
    }

    // --- CABEZA + OJOS + CABELLO ---
    this.headGroup.position.set(0, 0.48, 0.02);
    this.torsoGroup.add(this.headGroup);
    this.headGroup.add(this.headMeshHolder);

    for (const side of [-1, 1]) {
      const eyeShape = createHeroEyeShape();
      const eyePart = this.createTaggedPart(
        eyeShape,
        0.018,
        PALETTE_32.CONTORNO,
        PALETTE_32.CONTORNO,
        PALETTE_32.CONTORNO,
        'neutral',
        false,
        1.0,
        0.2
      );
      eyePart.position.set(side * 0.072, 0.18 + (side > 0 ? -0.01 : 0), 0.11);
      this.headGroup.add(eyePart);
    }

    this.headGroup.add(this.hairGroup);

    // Construir siluetas dependientes de género y pelo
    this.rebuildGenderGeometry();
    this.rebuildHairGeometry();

    // --- BRAZOS JERÁRQUICOS ---
    const buildArm = (
      side: -1 | 1,
      shoulderGroup: THREE.Group,
      forearmGroup: THREE.Group,
      handGroup: THREE.Group,
      gloveGroup: THREE.Group,
      weaponGroup: THREE.Group
    ) => {
      shoulderGroup.position.set(side * (this.heroConfig.gender === 'female' ? 0.19 : 0.245), 0.39, 0.0);
      this.torsoGroup.add(shoulderGroup);

      const upperArmShape = new THREE.Shape();
      upperArmShape.moveTo(-0.05, 0.02);
      upperArmShape.quadraticCurveTo(-0.06, -0.11, -0.045, -HERO_DIMENSIONS.UPPER_ARM_LEN);
      upperArmShape.lineTo(0.045, -HERO_DIMENSIONS.UPPER_ARM_LEN);
      upperArmShape.quadraticCurveTo(0.06, -0.11, 0.05, 0.02);
      upperArmShape.closePath();
      shoulderGroup.add(
        this.createTaggedPart(upperArmShape, 0.085, cloth.base, cloth.shadow, cloth.highlight, 'cloth', true, 1.0, 0.7)
      );

      forearmGroup.position.set(0, -HERO_DIMENSIONS.UPPER_ARM_LEN + 0.01, 0);
      shoulderGroup.add(forearmGroup);

      const forearmShape = new THREE.Shape();
      forearmShape.moveTo(-0.042, 0.0);
      forearmShape.quadraticCurveTo(-0.045, -0.11, -0.034, -HERO_DIMENSIONS.FOREARM_LEN);
      forearmShape.lineTo(0.034, -HERO_DIMENSIONS.FOREARM_LEN);
      forearmShape.quadraticCurveTo(0.045, -0.11, 0.042, 0.0);
      forearmShape.closePath();
      forearmGroup.add(
        this.createTaggedPart(forearmShape, 0.075, skin.base, skin.shadow, skin.highlight, 'skin', true, 1.0, 0.65)
      );

      handGroup.position.set(0, -HERO_DIMENSIONS.FOREARM_LEN - 0.02, 0);
      forearmGroup.add(handGroup);

      const handShape = new THREE.Shape();
      handShape.moveTo(-0.038, 0.02);
      handShape.bezierCurveTo(-0.055, -0.03, -0.035, -0.075, 0.0, -0.075);
      handShape.bezierCurveTo(0.035, -0.075, 0.055, -0.03, 0.038, 0.02);
      handShape.closePath();
      handGroup.add(
        this.createTaggedPart(handShape, 0.065, skin.base, skin.shadow, skin.highlight, 'skin', true, 1.0, 0.55)
      );

      forearmGroup.add(gloveGroup);
      handGroup.add(weaponGroup);
    };

    buildArm(
      -1,
      this.armLeftGroup,
      this.forearmLeftGroup,
      this.handLeftGroup,
      this.gloveLeftGroup,
      this.weaponLeftGroup
    );
    buildArm(
      1,
      this.armRightGroup,
      this.forearmRightGroup,
      this.handRightGroup,
      this.gloveRightGroup,
      this.weaponRightGroup
    );

    // --- PIERNAS JERÁRQUICAS ---
    const buildLeg = (
      side: -1 | 1,
      legGroup: THREE.Group,
      calfGroup: THREE.Group,
      bootGroup: THREE.Group
    ) => {
      legGroup.position.set(side * 0.105, 0.56, 0.0);
      this.rigRoot.add(legGroup);

      const thighShape = new THREE.Shape();
      thighShape.moveTo(-0.065, 0.02);
      thighShape.quadraticCurveTo(-0.07, -0.13, -0.052, -HERO_DIMENSIONS.THIGH_LEN);
      thighShape.lineTo(0.052, -HERO_DIMENSIONS.THIGH_LEN);
      thighShape.quadraticCurveTo(0.07, -0.13, 0.065, 0.02);
      thighShape.closePath();
      legGroup.add(
        this.createTaggedPart(thighShape, 0.105, cloth.shadow, PALETTE_32.TIERRA, cloth.base, 'cloth', true, 1.0, 0.75)
      );

      calfGroup.position.set(0, -HERO_DIMENSIONS.THIGH_LEN + 0.01, 0);
      legGroup.add(calfGroup);

      const calfShape = new THREE.Shape();
      calfShape.moveTo(-0.05, 0.01);
      calfShape.quadraticCurveTo(-0.055, -0.13, -0.038, -HERO_DIMENSIONS.CALF_LEN);
      calfShape.lineTo(0.038, -HERO_DIMENSIONS.CALF_LEN);
      calfShape.quadraticCurveTo(0.055, -0.13, 0.05, 0.01);
      calfShape.closePath();
      calfGroup.add(
        this.createTaggedPart(calfShape, 0.088, skin.base, skin.shadow, skin.highlight, 'skin', true, 1.0, 0.7)
      );

      const footShape = new THREE.Shape();
      footShape.moveTo(-0.048, 0.01);
      footShape.lineTo(-0.055, -0.045);
      footShape.quadraticCurveTo(0.0, -0.06, 0.068, -0.045);
      footShape.quadraticCurveTo(0.075, -0.005, 0.038, 0.01);
      footShape.closePath();
      const footPart = this.createTaggedPart(
        footShape,
        0.13,
        HERO_PALETTE.DIRT,
        cloth.shadow,
        HERO_PALETTE.DIRT,
        'neutral',
        true,
        1.0,
        0.65
      );
      footPart.position.set(0, -HERO_DIMENSIONS.CALF_LEN, 0.025);
      calfGroup.add(footPart);

      calfGroup.add(bootGroup);
    };

    buildLeg(-1, this.legLeftGroup, this.calfLeftGroup, this.bootLeftGroup);
    buildLeg(1, this.legRightGroup, this.calfRightGroup, this.bootRightGroup);

    this.headGroup.add(this.helmetGroup);
    this.torsoGroup.add(this.armorGroup);
  }

  private clearDynamicBucket(
    holderGroups: THREE.Group[],
    bucket: {
      geos: THREE.BufferGeometry[];
      mats: THREE.ShaderMaterial[];
      outlines: THREE.ShaderMaterial[];
    },
    pruneTagLists = false
  ): void {
    for (const g of holderGroups) {
      while (g.children.length > 0) g.remove(g.children[0]);
    }
    if (pruneTagLists) {
      const matSet = new Set(bucket.mats);
      const prune = (arr: THREE.ShaderMaterial[]) => {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (matSet.has(arr[i])) arr.splice(i, 1);
        }
      };
      prune(this.skinMats);
      prune(this.clothMats);
      prune(this.hairMats);
    }
    for (let i = 0; i < bucket.geos.length; i++) bucket.geos[i].dispose();
    for (let i = 0; i < bucket.mats.length; i++) bucket.mats[i].dispose();
    for (let i = 0; i < bucket.outlines.length; i++) bucket.outlines[i].dispose();
    bucket.geos.length = 0;
    bucket.mats.length = 0;
    bucket.outlines.length = 0;
  }

  private rebuildGenderGeometry(): void {
    this.clearDynamicBucket(
      [this.torsoMeshHolder, this.headMeshHolder],
      this.silhouetteDynamicBuckets,
      true
    );

    const gender = this.heroConfig.gender;
    const skin = SKIN_TONE_SWATCHES[this.heroConfig.skinTone];
    const cloth = CLOTH_COLOR_SWATCHES[this.heroConfig.clothColor];

    // Torso con silueta de género marcada
    const torsoShape = buildTorsoSilhouette(gender);
    this.torsoMeshHolder.add(
      this.createTaggedPart(
        torsoShape,
        HERO_DIMENSIONS.TORSO_DEPTH,
        cloth.base,
        cloth.shadow,
        cloth.highlight,
        'cloth',
        true,
        1.0,
        1.0,
        this.silhouetteDynamicBuckets
      )
    );

    // Cabeza con mandíbula angular (hombre) o suave (mujer)
    const headShape = buildHeadSilhouette(gender);
    this.headMeshHolder.add(
      this.createTaggedPart(
        headShape,
        HERO_DIMENSIONS.HEAD_DEPTH,
        skin.base,
        skin.shadow,
        skin.highlight,
        'skin',
        true,
        1.0,
        1.0,
        this.silhouetteDynamicBuckets
      )
    );

    // Ajustar ancho de hombros y cadera según género para mayor lectura a 64x64
    const shoulderX = gender === 'female' ? 0.19 : 0.255;
    this.armLeftGroup.position.x = -shoulderX;
    this.armRightGroup.position.x = shoulderX;
    const armScale = gender === 'female' ? 0.88 : 1.04;
    this.armLeftGroup.scale.set(armScale, 1, armScale);
    this.armRightGroup.scale.set(armScale, 1, armScale);

    const hipX = gender === 'female' ? 0.12 : 0.105;
    this.legLeftGroup.position.x = -hipX;
    this.legRightGroup.position.x = hipX;

    // En mujer, los harapos se ciñen levemente a la cintura
    this.vagabondDetailGroup.scale.x = gender === 'female' ? 0.88 : 1.0;

    // Sincronizar outline actual
    const curW = this.outlineMaterials[0]?.uniforms.uOutlineWidth.value ?? this.baseOutlineWidth;
    for (const o of this.silhouetteDynamicBuckets.outlines) o.uniforms.uOutlineWidth.value = curW;
  }

  private rebuildHairGeometry(): void {
    this.clearDynamicBucket([this.hairGroup], this.hairDynamicBuckets, true);

    const style: HairStyleId = this.heroConfig.hairStyle;
    const pieces = createHairShapePieces(style);
    if (pieces.length === 0) return;

    const hair = HAIR_COLOR_SWATCHES[this.heroConfig.hairColor];
    for (const piece of pieces) {
      const part = this.createTaggedPart(
        piece.shape,
        piece.depth,
        hair.base,
        hair.shadow,
        hair.highlight,
        'hair',
        true,
        1.0,
        piece.bevel,
        this.hairDynamicBuckets
      );
      part.position.set(0, 0, piece.zOffset);
      this.hairGroup.add(part);
    }

    const curW = this.outlineMaterials[0]?.uniforms.uOutlineWidth.value ?? this.baseOutlineWidth;
    for (const o of this.hairDynamicBuckets.outlines) o.uniforms.uOutlineWidth.value = curW;
  }

  private applyColorUniforms(): void {
    const skin = SKIN_TONE_SWATCHES[this.heroConfig.skinTone];
    const hair = HAIR_COLOR_SWATCHES[this.heroConfig.hairColor];
    const cloth = CLOTH_COLOR_SWATCHES[this.heroConfig.clothColor];

    for (const mat of this.skinMats) {
      mat.uniforms.uBaseColor.value.setHex(skin.base);
      mat.uniforms.uShadowColor.value.setHex(skin.shadow);
      mat.uniforms.uHighlightColor.value.setHex(skin.highlight);
    }
    for (const mat of this.hairMats) {
      mat.uniforms.uBaseColor.value.setHex(hair.base);
      mat.uniforms.uShadowColor.value.setHex(hair.shadow);
      mat.uniforms.uHighlightColor.value.setHex(hair.highlight);
    }
    for (const mat of this.clothMats) {
      mat.uniforms.uBaseColor.value.setHex(cloth.base);
      mat.uniforms.uShadowColor.value.setHex(cloth.shadow);
      mat.uniforms.uHighlightColor.value.setHex(cloth.highlight);
    }
  }

  // Aplica HeroConfig en tiempo real: cambios de color por uniforms puros; forma solo cuando cambia género o peinado
  public applyConfig(newConfig: HeroConfig, animatePop = true): void {
    const prev = this.heroConfig;
    const genderChanged = prev.gender !== newConfig.gender;
    const hairStyleChanged = prev.hairStyle !== newConfig.hairStyle;
    const colorChanged =
      prev.skinTone !== newConfig.skinTone ||
      prev.hairColor !== newConfig.hairColor ||
      prev.clothColor !== newConfig.clothColor;

    this.heroConfig = { ...newConfig };

    if (genderChanged) {
      this.rebuildGenderGeometry();
    }
    if (hairStyleChanged) {
      this.rebuildHairGeometry();
    }
    if (genderChanged || hairStyleChanged || colorChanged) {
      this.applyColorUniforms();
    }
    if (animatePop && (genderChanged || hairStyleChanged || colorChanged)) {
      this.squashAmount = 0.14;
      if (hairStyleChanged || prev.hairColor !== newConfig.hairColor) {
        this.hairPopTimer = 0.18;
      }
    }
  }

  protected onDebugSilhouetteChanged(flag: number): void {
    for (const m of this.silhouetteDynamicBuckets.mats) m.uniforms.uDebugSilhouette.value = flag;
    for (const m of this.hairDynamicBuckets.mats) m.uniforms.uDebugSilhouette.value = flag;
    for (const m of this.gearDynamicBuckets.mats) m.uniforms.uDebugSilhouette.value = flag;
  }

  protected onZoomOutlineChanged(scaledWidth: number): void {
    for (const o of this.silhouetteDynamicBuckets.outlines) o.uniforms.uOutlineWidth.value = scaledWidth;
    for (const o of this.hairDynamicBuckets.outlines) o.uniforms.uOutlineWidth.value = scaledWidth;
    for (const o of this.gearDynamicBuckets.outlines) o.uniforms.uOutlineWidth.value = scaledWidth;
  }

  public setHealthRatio(ratio: number): void {
    super.setHealthRatio(ratio);
    for (const m of this.silhouetteDynamicBuckets.mats) m.uniforms.uHealthRatio.value = this.healthRatio;
    for (const m of this.hairDynamicBuckets.mats) m.uniforms.uHealthRatio.value = this.healthRatio;
    for (const m of this.gearDynamicBuckets.mats) m.uniforms.uHealthRatio.value = this.healthRatio;
  }

  public setAppearance(app: HeroAppearance): void {
    const sig = `${app.weapon ?? ''}|${app.offhand ?? ''}|${app.isDaggerMain ? 1 : 0}|${app.isDaggerOff ? 1 : 0}|${app.helmet ?? ''}|${app.armor ?? ''}|${app.gloves ?? ''}|${app.boots ?? ''}`;
    if (sig === this.lastAppearanceSig) return;
    this.lastAppearanceSig = sig;
    this.appearance = { ...app };

    this.clearDynamicBucket(
      [
        this.helmetGroup,
        this.armorGroup,
        this.gloveLeftGroup,
        this.gloveRightGroup,
        this.bootLeftGroup,
        this.bootRightGroup,
        this.weaponRightGroup,
        this.weaponLeftGroup,
      ],
      this.gearDynamicBuckets
    );

    this.vagabondDetailGroup.visible = app.armor === null;
    this.hairGroup.visible = app.helmet === null;

    if (app.helmet) this.buildHelmetVisual(app.helmet);
    if (app.armor) this.buildArmorVisual(app.armor);
    if (app.gloves) this.buildGlovesVisual(app.gloves);
    if (app.boots) this.buildBootsVisual(app.boots);
    if (app.weapon) this.buildWeaponVisual(this.weaponRightGroup, app.weapon, app.isDaggerMain);
    if (app.offhand && app.isDaggerOff) this.buildWeaponVisual(this.weaponLeftGroup, app.offhand, true);

    const curW = this.outlineMaterials[0]?.uniforms.uOutlineWidth.value ?? this.baseOutlineWidth;
    for (const o of this.gearDynamicBuckets.outlines) o.uniforms.uOutlineWidth.value = curW;
  }

  private createGearPart(
    shape: THREE.Shape,
    depth: number,
    baseHex: number,
    shadowHex: number,
    bevelScale = 0.75
  ): THREE.Group {
    return this.createExtrudedShapePart(
      shape,
      depth,
      { baseColor: baseHex, shadowColor: shadowHex, rimStrength: 0.36 },
      true,
      bevelScale,
      1.0,
      this.gearDynamicBuckets
    );
  }

  private buildHelmetVisual(style: GearStyle): void {
    const pal = GEAR_SHADER_PALETTES[style];
    const { dome, crest } = createHelmetShapePieces(style);
    this.helmetGroup.add(this.createGearPart(dome.shape, dome.depth, pal.base, pal.shadow, dome.bevel));
    if (crest) {
      this.helmetGroup.add(this.createGearPart(crest.shape, crest.depth, pal.trim, pal.trimShadow, crest.bevel));
    }
  }

  private buildArmorVisual(style: GearStyle): void {
    const pal = GEAR_SHADER_PALETTES[style];
    const plate = new THREE.Shape();
    plate.moveTo(-0.17, 0.05);
    plate.quadraticCurveTo(-0.20, 0.23, -0.24, 0.39);
    plate.lineTo(-0.08, 0.47);
    plate.quadraticCurveTo(0.0, 0.41, 0.08, 0.47);
    plate.lineTo(0.24, 0.39);
    plate.quadraticCurveTo(0.20, 0.23, 0.17, 0.05);
    plate.quadraticCurveTo(0.0, 0.02, -0.17, 0.05);
    this.armorGroup.add(this.createGearPart(plate, 0.20, pal.base, pal.shadow, 0.9));

    const belt = new THREE.Shape();
    belt.moveTo(-0.17, 0.02);
    belt.lineTo(0.17, 0.02);
    belt.lineTo(0.16, 0.08);
    belt.lineTo(-0.16, 0.08);
    belt.closePath();
    this.armorGroup.add(this.createGearPart(belt, 0.21, pal.trim, pal.trimShadow, 0.55));

    for (const side of [-1, 1]) {
      const pauldron = new THREE.Shape();
      pauldron.moveTo(0, 0);
      pauldron.quadraticCurveTo(side * 0.09, 0.05, side * 0.14, -0.07);
      pauldron.lineTo(0, -0.08);
      pauldron.closePath();
      const pMesh = this.createGearPart(pauldron, 0.16, pal.base, pal.shadow, 0.75);
      pMesh.position.set(side * 0.18, 0.44, 0);
      this.armorGroup.add(pMesh);
    }
  }

  private buildGlovesVisual(style: GearStyle): void {
    const pal = GEAR_SHADER_PALETTES[style];
    for (const group of [this.gloveLeftGroup, this.gloveRightGroup]) {
      const cuff = new THREE.Shape();
      cuff.moveTo(-0.048, -0.09);
      cuff.lineTo(-0.052, -0.25);
      cuff.quadraticCurveTo(0, -0.29, 0.052, -0.25);
      cuff.lineTo(0.048, -0.09);
      cuff.closePath();
      group.add(this.createGearPart(cuff, 0.092, pal.base, pal.shadow, 0.65));
    }
  }

  private buildBootsVisual(style: GearStyle): void {
    const pal = GEAR_SHADER_PALETTES[style];
    for (const group of [this.bootLeftGroup, this.bootRightGroup]) {
      const boot = new THREE.Shape();
      boot.moveTo(-0.056, -0.05);
      boot.lineTo(-0.062, -0.30);
      boot.quadraticCurveTo(0.01, -0.32, 0.078, -0.29);
      boot.quadraticCurveTo(0.082, -0.24, 0.054, -0.22);
      boot.lineTo(0.056, -0.05);
      boot.closePath();
      const mesh = this.createGearPart(boot, 0.14, pal.base, pal.shadow, 0.7);
      mesh.position.set(0, 0, 0.02);
      group.add(mesh);
    }
  }

  private buildWeaponVisual(targetGroup: THREE.Group, style: GearStyle, isDagger: boolean): void {
    const pal = GEAR_SHADER_PALETTES[style];
    const weaponHolder = new THREE.Group();
    weaponHolder.position.set(0, -0.04, 0.03);
    weaponHolder.rotation.x = Math.PI * 0.42;

    if (isDagger) {
      const blade = new THREE.Shape();
      blade.moveTo(-0.028, 0.05);
      blade.lineTo(-0.034, 0.24);
      blade.lineTo(0.0, 0.42);
      blade.lineTo(0.034, 0.24);
      blade.lineTo(0.028, 0.05);
      blade.closePath();
      weaponHolder.add(this.createGearPart(blade, 0.026, pal.accent, pal.base, 0.45));

      const guard = new THREE.Shape();
      guard.moveTo(-0.075, 0.02);
      guard.lineTo(0.075, 0.02);
      guard.lineTo(0.06, 0.065);
      guard.lineTo(-0.06, 0.065);
      guard.closePath();
      weaponHolder.add(this.createGearPart(guard, 0.036, pal.trim, pal.trimShadow, 0.45));
    } else {
      const isHeavy = style === 'obsidian' || style === 'glacial';
      const w = isHeavy ? 0.058 : 0.04;
      const len = isHeavy ? 0.84 : 0.68;
      const blade = new THREE.Shape();
      blade.moveTo(-w, 0.07);
      blade.lineTo(-w * 0.9, len - 0.14);
      blade.lineTo(0.0, len);
      blade.lineTo(w * 0.9, len - 0.14);
      blade.lineTo(w, 0.07);
      blade.closePath();
      weaponHolder.add(this.createGearPart(blade, 0.032, pal.accent, pal.base, 0.5));

      const guard = new THREE.Shape();
      guard.moveTo(-0.115, 0.02);
      guard.lineTo(0.115, 0.02);
      guard.lineTo(0.09, 0.078);
      guard.lineTo(-0.09, 0.078);
      guard.closePath();
      weaponHolder.add(this.createGearPart(guard, 0.044, pal.trim, pal.trimShadow, 0.5));
    }

    targetGroup.add(weaponHolder);
  }

  public setState(nextState: HeroState): void {
    if (this.state === nextState) return;
    const prev = this.state;
    this.state = nextState;
    this.stateTimer = 0;
    this.transitionTimer = HERO_SPEEDS.TRANSITION_SQUASH_DUR;
    this.eventBus.emit('hero:stateChanged', { state: nextState, previous: prev });
  }

  public playAnimation(name: HeroState, comboStep: 0 | 1 | 2 = 0, duration?: number): void {
    this.comboStep = comboStep;
    if (name === 'attack') {
      this.attackDuration = duration ?? HERO_SPEEDS.ATTACK_BASE_DUR;
      this.setState('attack');
      this.stateTimer = 0;
      const armed = this.appearance.weapon !== null;
      const dualDaggers = Boolean(this.appearance.isDaggerMain && this.appearance.isDaggerOff);
      this.spawnAdditiveBurst(0.22, armed ? PALETTE_32.BLANCO_CALIDO : PALETTE_32.TIERRA, 7);
      this.eventBus.emit('hero:attacked', { comboStep, armed, dualDaggers });
    } else if (name === 'cast') {
      this.setState('cast');
      this.stateTimer = 0;
    } else if (name === 'hurt') {
      this.setState('hurt');
      this.stateTimer = 0;
      this.hurtFlashTimer = HERO_SPEEDS.HURT_FLASH_DUR;
      this.spawnAdditiveBurst(0.0, PALETTE_32.LAVA, 9);
    } else {
      this.setState(name);
    }
  }

  public takeDamage(amount: number, newHealthRatio?: number): void {
    if (typeof newHealthRatio === 'number') this.setHealthRatio(newHealthRatio);
    this.playAnimation('hurt');
    this.eventBus.emit('hero:damaged', { amount, healthRatio: this.healthRatio });
    if (this.healthRatio <= 0) {
      this.eventBus.emit('hero:died', { timestamp: this.elapsed });
    }
  }

  public setAutoAttackTarget(target: EnemyTargetRef | null): void {
    this.autoAttackTarget = target;
  }

  public clearAutoAttackTarget(): void {
    this.autoAttackTarget = null;
  }

  public moveTo(position: THREE.Vector3): void {
    if (!this.moveTarget) {
      this.moveTarget = position.clone();
    } else {
      this.moveTarget.copy(position);
    }
  }

  public clearMoveTarget(): void {
    this.moveTarget = null;
  }

  public hasMoveTarget(): boolean {
    return this.moveTarget !== null;
  }

  public getMoveTarget(): THREE.Vector3 | null {
    return this.moveTarget;
  }

  public computeMoveStep(
    currentPos: THREE.Vector3,
    arrivalThreshold = 0.1
  ): { dx: number; dz: number; arrived: boolean; distance: number } {
    if (!this.moveTarget) return { dx: 0, dz: 0, arrived: false, distance: 0 };
    const dx = this.moveTarget.x - currentPos.x;
    const dz = this.moveTarget.z - currentPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < arrivalThreshold) {
      this.moveTarget = null;
      return { dx: 0, dz: 0, arrived: true, distance: dist };
    }
    return { dx: dx / dist, dz: dz / dist, arrived: false, distance: dist };
  }

  public stepPosition(
    currentPos: THREE.Vector3,
    speed: number,
    delta: number,
    arrivalThreshold = 0.1
  ): { dx: number; dz: number; stepX: number; stepZ: number; arrived: boolean } {
    const step = this.computeMoveStep(currentPos, arrivalThreshold);
    if (step.arrived || !this.moveTarget) {
      return { dx: 0, dz: 0, stepX: 0, stepZ: 0, arrived: step.arrived };
    }
    const maxMove = speed * delta;
    const moveDist = Math.min(maxMove, step.distance);
    return {
      dx: step.dx,
      dz: step.dz,
      stepX: step.dx * moveDist,
      stepZ: step.dz * moveDist,
      arrived: false,
    };
  }

  public update(delta: number): void {
    super.update(delta);

    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - delta);
    }
    const flashVal =
      this.hurtFlashTimer > 0 ? Math.sin((this.hurtFlashTimer / HERO_SPEEDS.HURT_FLASH_DUR) * Math.PI) : 0;

    const syncUniforms = (mats: THREE.ShaderMaterial[]) => {
      for (let i = 0; i < mats.length; i++) {
        mats[i].uniforms.uTime.value = this.elapsed;
        mats[i].uniforms.uFlashIntensity.value = flashVal;
      }
    };
    syncUniforms(this.silhouetteDynamicBuckets.mats);
    syncUniforms(this.hairDynamicBuckets.mats);
    syncUniforms(this.gearDynamicBuckets.mats);

    if (this.hairPopTimer > 0) {
      this.hairPopTimer = Math.max(0, this.hairPopTimer - delta);
      const hp = Math.sin((this.hairPopTimer / 0.18) * Math.PI) * 0.16;
      this.hairGroup.scale.set(1 + hp, 1 - hp * 0.7, 1);
    } else {
      this.hairGroup.scale.set(1, 1, 1);
    }

    let targetBobY = 0;
    let torsoRotX = 0.09;
    let torsoRotY = 0;
    let torsoScaleY = 1 + Math.sin(this.elapsed * HERO_SPEEDS.IDLE_BREATH_FREQ) * HERO_SPEEDS.IDLE_BREATH_AMP;
    let torsoScaleX = 1;
    let headRotX = 0.08 + Math.sin(this.elapsed * 1.5 - 0.6) * 0.03;
    let headRotZ = -0.04;
    let armLRotX = 0.14;
    let armLRotZ = -0.14;
    let forearmLRotX = -0.25;
    let armRRotX = 0.14;
    let armRRotZ = 0.14;
    let forearmRRotX = -0.25;
    let legLRotX = -0.08;
    let calfLRotX = 0.18;
    let legRRotX = 0.08;
    let calfRRotX = 0.14;

    if (this.state === 'walk') {
      const cyc = this.elapsed * HERO_SPEEDS.WALK_CYCLE_FREQ;
      const swing = Math.sin(cyc);
      targetBobY = Math.abs(Math.sin(cyc)) * 0.085;
      torsoRotX = 0.16;
      torsoRotY = swing * 0.08;
      headRotX = 0.04;
      headRotZ = swing * 0.03;
      armLRotX = -swing * 0.65;
      armRRotX = swing * 0.65;
      forearmLRotX = -0.35 - Math.max(0, -swing) * 0.35;
      forearmRRotX = -0.35 - Math.max(0, swing) * 0.35;
      legLRotX = swing * 0.68;
      legRRotX = -swing * 0.68;
      calfLRotX = Math.max(0.08, -swing * 0.65 + 0.18);
      calfRRotX = Math.max(0.08, swing * 0.65 + 0.18);
    } else if (this.state === 'attack') {
      const p = Math.min(1, this.stateTimer / Math.max(0.08, this.attackDuration));
      const strike = p < 0.45 ? easeOutQuad(p / 0.45) : 1 - easeOutQuad((p - 0.45) / 0.55);
      const dual = Boolean(this.appearance.isDaggerMain && this.appearance.isDaggerOff);

      if (this.comboStep === 1 && dual) {
        torsoRotX = 0.14 + strike * 0.22;
        torsoRotY = -0.25 + strike * 0.72;
        armLRotX = -0.15 - strike * 1.55;
        armLRotZ = -0.2 + strike * 0.35;
        forearmLRotX = -0.45 + strike * 0.42;
        armRRotX = 0.35;
        targetBobY = strike * 0.05;
      } else if (this.comboStep === 1) {
        torsoRotX = 0.14 + strike * 0.18;
        torsoRotY = 0.5 - strike * 1.05;
        armRRotX = -1.15;
        armRRotZ = 0.65 - strike * 1.15;
        forearmRRotX = -0.25;
        targetBobY = strike * 0.04;
      } else if (this.comboStep === 2) {
        torsoRotX = -0.05 + strike * 0.42;
        torsoRotY = -0.25 + strike * 0.45;
        armRRotX = -2.1 + strike * 1.75;
        armRRotZ = 0.18;
        forearmRRotX = -0.2;
        if (dual) {
          armLRotX = -1.9 + strike * 1.65;
          forearmLRotX = -0.2;
        }
        targetBobY = Math.sin(p * Math.PI) * 0.12;
      } else {
        torsoRotX = 0.12 + strike * 0.24;
        torsoRotY = 0.28 - strike * 0.72;
        armRRotX = -0.15 - strike * 1.65;
        armRRotZ = 0.2 - strike * 0.3;
        forearmRRotX = -0.55 + strike * 0.52;
        armLRotX = 0.35;
        targetBobY = strike * 0.04;
      }
      if (p >= 1) this.setState('idle');
    } else if (this.state === 'hurt') {
      const p = Math.min(1, this.stateTimer / 0.26);
      const kick = Math.sin(p * Math.PI);
      torsoRotX = -0.28 * kick;
      headRotX = -0.24 * kick;
      armLRotZ = -0.45 * kick - 0.14;
      armRRotZ = 0.45 * kick + 0.14;
      torsoScaleY = 1 - 0.16 * kick;
      torsoScaleX = 1 + 0.14 * kick;
      if (p >= 1) this.setState('idle');
    } else if (this.state === 'cast') {
      const p = Math.min(1, this.stateTimer / HERO_SPEEDS.CAST_BASE_DUR);
      const lift = Math.sin(p * Math.PI);
      torsoRotX = -0.05;
      armRRotX = -1.8 * lift;
      armLRotX = -1.4 * lift;
      targetBobY = lift * 0.09;
      if (p >= 1) this.setState('idle');
    }

    if (this.transitionTimer > 0) {
      this.transitionTimer = Math.max(0, this.transitionTimer - delta);
      const sq = Math.sin((this.transitionTimer / HERO_SPEEDS.TRANSITION_SQUASH_DUR) * Math.PI) * 0.09;
      torsoScaleX += sq;
      torsoScaleY -= sq * 0.85;
    }

    if (this.squashAmount > 0.002) {
      torsoScaleX += this.squashAmount;
      torsoScaleY -= this.squashAmount * 0.75;
    }

    const k = 1 - Math.exp(-22 * delta);
    this.currentBobY += (targetBobY - this.currentBobY) * k;
    this.rigRoot.position.y = this.currentBobY;

    this.torsoGroup.rotation.x += (torsoRotX - this.torsoGroup.rotation.x) * k;
    this.torsoGroup.rotation.y += (torsoRotY - this.torsoGroup.rotation.y) * k;
    this.torsoGroup.scale.set(torsoScaleX, torsoScaleY, 1);

    this.headGroup.rotation.x += (headRotX - this.headGroup.rotation.x) * k;
    this.headGroup.rotation.z += (headRotZ - this.headGroup.rotation.z) * k;

    this.armLeftGroup.rotation.x += (armLRotX - this.armLeftGroup.rotation.x) * k;
    this.armLeftGroup.rotation.z += (armLRotZ - this.armLeftGroup.rotation.z) * k;
    this.forearmLeftGroup.rotation.x += (forearmLRotX - this.forearmLeftGroup.rotation.x) * k;

    this.armRightGroup.rotation.x += (armRRotX - this.armRightGroup.rotation.x) * k;
    this.armRightGroup.rotation.z += (armRRotZ - this.armRightGroup.rotation.z) * k;
    this.forearmRightGroup.rotation.x += (forearmRRotX - this.forearmRightGroup.rotation.x) * k;

    this.legLeftGroup.rotation.x += (legLRotX - this.legLeftGroup.rotation.x) * k;
    this.calfLeftGroup.rotation.x += (calfLRotX - this.calfLeftGroup.rotation.x) * k;
    this.legRightGroup.rotation.x += (legRRotX - this.legRightGroup.rotation.x) * k;
    this.calfRightGroup.rotation.x += (calfRRotX - this.calfRightGroup.rotation.x) * k;

    this.updateShadowByHeight(this.currentBobY);
  }

  public dispose(): void {
    this.clearDynamicBucket([this.torsoMeshHolder, this.headMeshHolder], this.silhouetteDynamicBuckets, true);
    this.clearDynamicBucket([this.hairGroup], this.hairDynamicBuckets, true);
    this.clearDynamicBucket(
      [
        this.helmetGroup,
        this.armorGroup,
        this.gloveLeftGroup,
        this.gloveRightGroup,
        this.bootLeftGroup,
        this.bootRightGroup,
        this.weaponRightGroup,
        this.weaponLeftGroup,
      ],
      this.gearDynamicBuckets
    );
    super.dispose();
  }
}
