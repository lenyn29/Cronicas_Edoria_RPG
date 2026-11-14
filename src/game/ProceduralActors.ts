import * as THREE from 'three';
import {
  computeHighlightHex,
  computeShadowHex,
  PALETTE_32,
} from './core/Palette';
import { ProceduralEntity } from './core/ProceduralEntity';
import {
  createBoneShape,
  createCrystalShape,
  createDaggerBladeShape,
  createDropShape,
  createFlameShape,
  createHeadSilhouette,
  createLeafShape,
  createRockPolygonShape,
  createShieldShape,
  createSwordBladeShape,
  createTorsoSilhouette,
} from './core/ShapeLibrary';
import { EnemyKind, NpcRole } from './types';

export type EnemyArchetype =
  | 'slime'
  | 'rat'
  | 'bat'
  | 'wild_dog'
  | 'goblin'
  | 'skeleton'
  | 'ghost'
  | 'wolf'
  | 'golem';

export function resolveEnemyArchetype(kind: EnemyKind): EnemyArchetype {
  switch (kind) {
    case 'slime':
    case 'boss_meadow':
      return 'slime';
    case 'rat':
      return 'rat';
    case 'bat':
      return 'bat';
    case 'wild_dog':
      return 'wild_dog';
    case 'goblin':
    case 'rabbit':
      return 'goblin';
    case 'knight':
    case 'mage':
      return 'skeleton';
    case 'ghost':
    case 'boss_snow':
      return 'ghost';
    case 'wolf':
    case 'gray_wolf':
    case 'polar_bear':
      return 'wolf';
    case 'ent':
    case 'rock_golem':
    case 'lava_golem':
    case 'ice_golem':
    case 'boss_forest':
    case 'boss_rocky':
    case 'boss':
    default:
      return 'golem';
  }
}

function getArchetypePalette(kind: EnemyKind): {
  primary: number;
  secondary: number;
  accent: number;
  burst: number;
  scale: number;
} {
  switch (kind) {
    case 'slime':
      return { primary: PALETTE_32.HOJA_CLARA, secondary: PALETTE_32.HOJA_OSCURA, accent: PALETTE_32.ORO, burst: PALETTE_32.HOJA_CLARA, scale: 1.0 };
    case 'boss_meadow':
      return { primary: PALETTE_32.ORO, secondary: PALETTE_32.HOJA_CLARA, accent: PALETTE_32.BLANCO_CALIDO, burst: PALETTE_32.ORO, scale: 1.85 };
    case 'rat':
      return { primary: PALETTE_32.PIEL_OSCURA, secondary: PALETTE_32.TIERRA, accent: PALETTE_32.TELA_ROJA, burst: PALETTE_32.PIEL_OSCURA, scale: 0.96 };
    case 'wild_dog':
      return { primary: PALETTE_32.TIERRA, secondary: PALETTE_32.CORTEZA, accent: PALETTE_32.ORO, burst: PALETTE_32.TIERRA, scale: 1.05 };
    case 'rabbit':
      return { primary: PALETTE_32.BLANCO_CALIDO, secondary: PALETTE_32.ROCA_CLARA, accent: PALETTE_32.TELA_ROJA, burst: PALETTE_32.TELA_ROJA, scale: 1.05 };
    case 'goblin':
      return { primary: PALETTE_32.HOJA_OSCURA, secondary: PALETTE_32.TIERRA, accent: PALETTE_32.BRONCE, burst: PALETTE_32.HOJA_CLARA, scale: 1.08 };
    case 'knight':
      return { primary: PALETTE_32.ACERO_OSCURO, secondary: PALETTE_32.BLANCO_CALIDO, accent: PALETTE_32.LAVA, burst: PALETTE_32.BRASA, scale: 1.28 };
    case 'mage':
      return { primary: PALETTE_32.VIOLETA_RUNA, secondary: PALETTE_32.BLANCO_CALIDO, accent: PALETTE_32.ARCANO_CIAN, burst: PALETTE_32.VIOLETA_RUNA, scale: 1.24 };
    case 'bat':
      return { primary: PALETTE_32.CENIZA_OSCURA, secondary: PALETTE_32.VIOLETA_RUNA, accent: PALETTE_32.TELA_ROJA, burst: PALETTE_32.VIOLETA_RUNA, scale: 1.04 };
    case 'ghost':
      return { primary: PALETTE_32.HIELO, secondary: PALETTE_32.ARCANO_CIAN, accent: PALETTE_32.BLANCO_CALIDO, burst: PALETTE_32.ARCANO_CIAN, scale: 1.15 };
    case 'boss_snow':
      return { primary: PALETTE_32.HIELO, secondary: PALETTE_32.ARCANO_CIAN, accent: PALETTE_32.BLANCO_CALIDO, burst: PALETTE_32.HIELO, scale: 1.95 };
    case 'wolf':
      return { primary: PALETTE_32.TIERRA, secondary: PALETTE_32.ROCA_OSCURA, accent: PALETTE_32.ORO, burst: PALETTE_32.HIERBA_SECA, scale: 1.15 };
    case 'gray_wolf':
      return { primary: PALETTE_32.ROCA_CLARA, secondary: PALETTE_32.ROCA_OSCURA, accent: PALETTE_32.ARCANO_CIAN, burst: PALETTE_32.HIELO, scale: 1.18 };
    case 'polar_bear':
      return { primary: PALETTE_32.BLANCO_CALIDO, secondary: PALETTE_32.HIELO, accent: PALETTE_32.ARCANO_CIAN, burst: PALETTE_32.BLANCO_CALIDO, scale: 1.48 };
    case 'ent':
      return { primary: PALETTE_32.CORTEZA, secondary: PALETTE_32.HOJA_OSCURA, accent: PALETTE_32.ESPECTRO_VERDE, burst: PALETTE_32.HOJA_CLARA, scale: 1.52 };
    case 'boss_forest':
      return { primary: PALETTE_32.CORTEZA, secondary: PALETTE_32.ESPECTRO_VERDE, accent: PALETTE_32.ORO, burst: PALETTE_32.ESPECTRO_VERDE, scale: 2.05 };
    case 'rock_golem':
      return { primary: PALETTE_32.ROCA_CLARA, secondary: PALETTE_32.ROCA_OSCURA, accent: PALETTE_32.BRONCE, burst: PALETTE_32.ROCA_CLARA, scale: 1.56 };
    case 'boss_rocky':
      return { primary: PALETTE_32.ROCA_OSCURA, secondary: PALETTE_32.BRONCE, accent: PALETTE_32.ORO, burst: PALETTE_32.ORO, scale: 2.12 };
    case 'ice_golem':
      return { primary: PALETTE_32.HIELO, secondary: PALETTE_32.AGUA_CLARA, accent: PALETTE_32.ARCANO_CIAN, burst: PALETTE_32.HIELO, scale: 1.58 };
    case 'lava_golem':
      return { primary: PALETTE_32.CENIZA_OSCURA, secondary: PALETTE_32.LAVA, accent: PALETTE_32.BRASA, burst: PALETTE_32.LAVA, scale: 1.62 };
    case 'boss':
    default:
      return { primary: PALETTE_32.CENIZA_OSCURA, secondary: PALETTE_32.LAVA, accent: PALETTE_32.ORO, burst: PALETTE_32.LAVA, scale: 2.32 };
  }
}

export interface EnemyActorVariantOptions {
  primaryColorHex?: number;
  scaleMult?: number;
  variantIndex?: 0 | 1 | 2;
}

export class ProceduralEnemyActor extends ProceduralEntity {
  public readonly kind: EnemyKind;
  public readonly archetype: EnemyArchetype;
  private readonly burstColor: number;
  private readonly baseScale: number;
  private readonly primaryOverrideHex?: number;
  private readonly variantIndex: 0 | 1 | 2;

  private readonly bodyPivot = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly limbL = new THREE.Group();
  private readonly limbR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly tailPivot = new THREE.Group();
  private readonly jawPivot = new THREE.Group();
  private readonly slimeEyesPivot = new THREE.Group();
  private readonly furTufts: THREE.Group[] = [];
  private readonly waveMaterials: THREE.ShaderMaterial[] = [];

  private telegraphActive = false;
  private telegraphProgress = 0;
  private slowed = false;
  private enraged = false;
  private stepToggle = false;
  private stepTimer = 0;
  private bounceHeight = 0;
  private partGeoSeq = 0;
  public onHeavyStep?: () => void;

  constructor(kind: EnemyKind, opts?: EnemyActorVariantOptions) {
    const pal = getArchetypePalette(kind);
    const arch = resolveEnemyArchetype(kind);
    const scaleMult = opts?.scaleMult ?? 1;
    const totalScale = pal.scale * scaleMult;
    super({
      hasShadow: arch !== 'ghost',
      shadowRadius: 0.56 * totalScale,
      outlineWidth: arch === 'golem' ? 0.025 : 0.021,
      colliderHalfW: 0.44 * totalScale,
      colliderHalfH: 0.44 * totalScale,
      particlePoolSize: 12,
    });
    this.kind = kind;
    this.archetype = arch;
    this.primaryOverrideHex = opts?.primaryColorHex;
    this.variantIndex = opts?.variantIndex ?? 0;
    this.burstColor = opts?.primaryColorHex ?? pal.burst;
    this.baseScale = totalScale;
    this.rigRoot.scale.setScalar(totalScale);
    this.buildBody();
  }

  private addPart(
    parent: THREE.Group,
    shape: THREE.Shape,
    depth: number,
    baseColor: number,
    opts?: {
      shadowColor?: number;
      highlightColor?: number;
      rimStrength?: number;
      subsurfaceColor?: number;
      subsurfaceStrength?: number;
      desaturation?: number;
      waveOpacity?: boolean;
      unlitGlow?: boolean;
      additive?: boolean;
      opacity?: number;
      outline?: boolean;
      bevel?: number;
      x?: number;
      y?: number;
      z?: number;
      rx?: number;
      ry?: number;
      rz?: number;
    }
  ): THREE.Group {
    const part = this.createExtrudedShapePart(
      shape,
      depth,
      {
        baseColor,
        shadowColor: opts?.shadowColor ?? computeShadowHex(baseColor),
        highlightColor: opts?.highlightColor ?? computeHighlightHex(baseColor),
        rimStrength: opts?.rimStrength ?? 0.34,
        subsurfaceColor: opts?.subsurfaceColor,
        subsurfaceStrength: opts?.subsurfaceStrength,
        desaturation: opts?.desaturation,
        waveOpacity: opts?.waveOpacity ? 0.85 : undefined,
        unlitGlow: opts?.unlitGlow,
        additive: opts?.additive,
        opacity: opts?.opacity,
      },
      opts?.outline ?? !opts?.unlitGlow,
      opts?.bevel ?? 0.85,
      1.0,
      undefined,
      `enemy:${this.kind}:${this.partGeoSeq++}`
    );
    part.position.set(opts?.x ?? 0, opts?.y ?? 0, opts?.z ?? 0);
    if (opts?.rx) part.rotation.x = opts.rx;
    if (opts?.ry) part.rotation.y = opts.ry;
    if (opts?.rz) part.rotation.z = opts.rz;
    parent.add(part);

    if (opts?.waveOpacity) {
      const m = (part.children[0] as THREE.Mesh)?.material as THREE.ShaderMaterial | undefined;
      if (m) this.waveMaterials.push(m);
    }
    return part;
  }

  public buildBody(): void {
    const basePal = getArchetypePalette(this.kind);
    const primary = this.primaryOverrideHex ?? basePal.primary;
    const secondary = this.primaryOverrideHex !== undefined
      ? computeShadowHex(this.primaryOverrideHex)
      : basePal.secondary;
    const pal = {
      ...basePal,
      primary,
      secondary,
      accent: this.variantIndex === 2 ? PALETTE_32.ORO : basePal.accent,
    };
    this.rigRoot.add(this.bodyPivot);

    if (this.archetype === 'slime') {
      // Gota invertida gelatinosa + núcleo brillante + ojos parpadeantes + variantes visuales
      const outer = createDropShape(0.46, 0.72, true);
      this.addPart(this.bodyPivot, outer, 0.56, pal.primary, {
        shadowColor: pal.secondary,
        rimStrength: 0.8,
        subsurfaceColor: pal.accent,
        subsurfaceStrength: 0.46,
        opacity: 0.9,
      });

      const core = createDropShape(0.18, 0.28, false);
      this.addPart(this.bodyPivot, core, 0.22, pal.accent, {
        unlitGlow: true,
        additive: true,
        outline: false,
        y: 0.14,
        z: 0.05,
        opacity: 0.85,
      });

      // Ojos parpadeantes en pivote dedicado
      this.slimeEyesPivot.position.set(0, 0.34, 0.28);
      this.bodyPivot.add(this.slimeEyesPivot);
      for (const side of [-1, 1]) {
        const eye = createRockPolygonShape(0.048, 0.058, side + 4);
        this.addPart(this.slimeEyesPivot, eye, 0.04, PALETTE_32.CONTORNO, {
          outline: false,
          bevel: 0.3,
          x: side * 0.14,
        });
      }
      if (this.kind === 'boss_meadow' || this.variantIndex === 2) {
        const crown = new THREE.Shape();
        crown.moveTo(-0.2, 0);
        crown.lineTo(-0.23, 0.2);
        crown.lineTo(-0.09, 0.11);
        crown.lineTo(0, 0.27);
        crown.lineTo(0.09, 0.11);
        crown.lineTo(0.23, 0.2);
        crown.lineTo(0.2, 0);
        crown.closePath();
        this.addPart(
          this.bodyPivot,
          crown,
          0.14,
          this.kind === 'boss_meadow' ? PALETTE_32.ORO : pal.accent,
          {
            y: 0.65,
            z: 0.02,
            rimStrength: 0.6,
          }
        );
      }
      return;
    }

    if (this.archetype === 'rat') {
      // Rata mejorada: cuerpo alargado bajo, cola curva Bezier, orejas redondas, ojos brillantes y cresta en Nv.3
      this.bodyPivot.position.set(0, 0.22, 0);
      const torso = new THREE.Shape();
      torso.moveTo(-0.36, -0.02);
      torso.bezierCurveTo(-0.38, 0.24, -0.06, 0.34, 0.26, 0.23);
      torso.quadraticCurveTo(0.4, 0.12, 0.34, -0.02);
      torso.quadraticCurveTo(0.0, -0.08, -0.36, -0.02);
      this.addPart(this.bodyPivot, torso, 0.32, pal.primary, {
        shadowColor: pal.secondary,
        ry: Math.PI * 0.5,
      });

      if (this.variantIndex === 2) {
        for (let k = 0; k < 3; k++) {
          const ridge = createCrystalShape(0.04, 0.13);
          this.addPart(this.bodyPivot, ridge, 0.04, pal.accent, {
            y: 0.24,
            z: -0.14 + k * 0.14,
            rx: -0.25,
          });
        }
      }

      this.headPivot.position.set(0, 0.11, 0.25);
      this.bodyPivot.add(this.headPivot);

      const snout = new THREE.Shape();
      snout.moveTo(-0.13, -0.04);
      snout.lineTo(-0.08, 0.15);
      snout.lineTo(0.0, 0.28);
      snout.lineTo(0.08, 0.15);
      snout.lineTo(0.13, -0.04);
      snout.closePath();
      this.addPart(this.headPivot, snout, 0.18, pal.primary, { rx: Math.PI * 0.42 });

      for (const side of [-1, 1]) {
        const ear = createLeafShape(0.12, 0.2);
        this.addPart(this.headPivot, ear, 0.03, pal.secondary, {
          x: side * 0.13,
          y: 0.14,
          z: -0.02,
          rz: side * -0.45,
        });
        const eye = createCrystalShape(0.032, 0.048);
        this.addPart(this.headPivot, eye, 0.02, PALETTE_32.BRASA, {
          unlitGlow: true,
          additive: true,
          outline: false,
          x: side * 0.072,
          y: 0.085,
          z: 0.165,
        });
      }

      // Cola sinuosa por curva Bezier
      this.tailPivot.position.set(0, 0.06, -0.29);
      this.bodyPivot.add(this.tailPivot);
      const tail = new THREE.Shape();
      tail.moveTo(-0.03, 0);
      tail.bezierCurveTo(-0.09, 0.16, 0.13, 0.3, -0.05, 0.52);
      tail.lineTo(0.02, 0.52);
      tail.bezierCurveTo(0.18, 0.28, -0.02, 0.15, 0.03, 0);
      tail.closePath();
      this.addPart(this.tailPivot, tail, 0.03, pal.secondary, { rx: -Math.PI * 0.45 });

      const paw = createBoneShape(0.18, 0.032);
      this.legL.position.set(-0.16, 0.04, 0.16);
      this.legR.position.set(0.16, 0.04, -0.14);
      this.bodyPivot.add(this.legL, this.legR);
      this.addPart(this.legL, paw, 0.06, pal.secondary);
      this.addPart(this.legR, paw, 0.06, pal.secondary);
      return;
    }

    if (this.archetype === 'bat') {
      // Murciélago flotante: cuerpo compacto, orejas puntiagudas, alas membranosas dentadas, ojos rojos aditivos
      this.bodyPivot.position.set(0, 0.85, 0);
      const torso = createDropShape(0.22, 0.36, false);
      this.addPart(this.bodyPivot, torso, 0.24, pal.primary, {
        shadowColor: pal.secondary,
        rimStrength: 0.55,
      });

      this.headPivot.position.set(0, 0.24, 0.04);
      this.bodyPivot.add(this.headPivot);
      const head = createRockPolygonShape(0.16, 0.15, 3);
      this.addPart(this.headPivot, head, 0.2, pal.primary, { shadowColor: pal.secondary });

      for (const side of [-1, 1]) {
        const ear = createCrystalShape(0.055, 0.18);
        this.addPart(this.headPivot, ear, 0.035, pal.secondary, {
          x: side * 0.11,
          y: 0.14,
          rz: side * -0.22,
        });
        const eye = createCrystalShape(0.034, 0.05);
        this.addPart(this.headPivot, eye, 0.025, this.variantIndex === 2 ? PALETTE_32.ORO : PALETTE_32.TELA_ROJA, {
          unlitGlow: true,
          additive: true,
          outline: false,
          x: side * 0.065,
          y: 0.04,
          z: 0.11,
        });

        // Ala membranosa dentada articulada en limbL/limbR
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0.04);
        wingShape.bezierCurveTo(side * 0.28, 0.28, side * 0.54, 0.22, side * 0.68, 0.04);
        wingShape.lineTo(side * 0.52, -0.14);
        wingShape.lineTo(side * 0.38, -0.05);
        wingShape.lineTo(side * 0.24, -0.16);
        wingShape.lineTo(side * 0.11, -0.06);
        wingShape.closePath();

        const wingPivot = side < 0 ? this.limbL : this.limbR;
        wingPivot.position.set(side * 0.14, 0.18, 0);
        this.bodyPivot.add(wingPivot);
        this.addPart(wingPivot, wingShape, 0.03, pal.secondary, {
          rimStrength: 0.62,
          subsurfaceColor: pal.accent,
          subsurfaceStrength: 0.25,
        });
      }

      if (this.variantIndex === 2) {
        const crest = createCrystalShape(0.06, 0.18);
        this.addPart(this.headPivot, crest, 0.04, pal.accent, { y: 0.18 });
      }
      return;
    }

    if (this.archetype === 'wild_dog') {
      // Perro Salvaje: cuadrúpedo ágil con mandíbula articulada, orejas caídas, 5 mechones y ojos ámbar
      this.bodyPivot.position.set(0, 0.36, 0);
      const torso = new THREE.Shape();
      torso.moveTo(-0.38, 0.03);
      torso.bezierCurveTo(-0.36, 0.3, -0.04, 0.38, 0.32, 0.3);
      torso.quadraticCurveTo(0.42, 0.18, 0.37, 0.01);
      torso.quadraticCurveTo(0.0, -0.06, -0.38, 0.03);
      this.addPart(this.bodyPivot, torso, 0.3, pal.primary, {
        shadowColor: pal.secondary,
        ry: Math.PI * 0.5,
      });

      const tuftCount = this.variantIndex === 2 ? 6 : 4;
      for (let i = 0; i < tuftCount; i++) {
        const tuft = new THREE.Group();
        tuft.position.set((i % 2 === 0 ? -1 : 1) * 0.1, 0.24 + (i % 2) * 0.04, -0.2 + i * 0.1);
        this.addPart(tuft, createLeafShape(0.065, 0.16), 0.03, pal.secondary, {
          rz: (i % 2 === 0 ? 1 : -1) * 0.38,
        });
        this.bodyPivot.add(tuft);
        this.furTufts.push(tuft);
      }

      this.headPivot.position.set(0, 0.22, 0.34);
      this.bodyPivot.add(this.headPivot);

      const upperJaw = new THREE.Shape();
      upperJaw.moveTo(-0.13, -0.02);
      upperJaw.lineTo(-0.09, 0.2);
      upperJaw.lineTo(0.0, 0.3);
      upperJaw.lineTo(0.09, 0.2);
      upperJaw.lineTo(0.13, -0.02);
      upperJaw.closePath();
      this.addPart(this.headPivot, upperJaw, 0.2, pal.primary, { rx: Math.PI * 0.42 });

      // Mandíbula inferior articulada (se abre en ataque)
      this.jawPivot.position.set(0, -0.02, 0.04);
      this.headPivot.add(this.jawPivot);
      const lowerJaw = new THREE.Shape();
      lowerJaw.moveTo(-0.09, 0);
      lowerJaw.lineTo(-0.06, 0.18);
      lowerJaw.lineTo(0.0, 0.24);
      lowerJaw.lineTo(0.06, 0.18);
      lowerJaw.lineTo(0.09, 0);
      lowerJaw.closePath();
      this.addPart(this.jawPivot, lowerJaw, 0.14, pal.secondary, { rx: Math.PI * 0.45 });

      for (const side of [-1, 1]) {
        const ear = createLeafShape(0.075, 0.19);
        this.addPart(this.headPivot, ear, 0.035, pal.secondary, {
          x: side * 0.12,
          y: 0.14,
          z: -0.02,
          rz: side * -0.78,
        });
        const eye = createCrystalShape(0.03, 0.048);
        this.addPart(this.headPivot, eye, 0.025, pal.accent, {
          unlitGlow: true,
          additive: true,
          outline: false,
          x: side * 0.072,
          y: 0.08,
          z: 0.17,
        });
      }

      if (this.variantIndex === 2) {
        const collar = createCrystalShape(0.16, 0.08);
        this.addPart(this.headPivot, collar, 0.22, PALETTE_32.TELA_ROJA, { y: -0.06, z: -0.05 });
      }

      this.tailPivot.position.set(0, 0.19, -0.34);
      this.bodyPivot.add(this.tailPivot);
      this.addPart(this.tailPivot, createLeafShape(0.085, 0.3), 0.06, pal.secondary, { rx: -0.85 });

      const leg = createBoneShape(0.34, 0.04);
      this.legL.position.set(-0.14, 0.04, 0.2);
      this.legR.position.set(0.14, 0.04, -0.2);
      this.bodyPivot.add(this.legL, this.legR);
      this.addPart(this.legL, leg, 0.075, pal.secondary);
      this.addPart(this.legR, leg, 0.075, pal.secondary);
      return;
    }

    if (this.archetype === 'goblin') {
      // Goblin / Conejo Guerrero: esqueleto humanoide encorvado, orejas puntiagudas y arma
      this.bodyPivot.position.set(0, 0.46, 0);
      this.bodyPivot.rotation.x = 0.24;
      const torso = createTorsoSilhouette('male');
      this.addPart(this.bodyPivot, torso, 0.22, pal.secondary, {
        bevel: 0.7,
        y: -0.04,
      });

      this.headPivot.position.set(0, 0.44, 0.06);
      this.bodyPivot.add(this.headPivot);
      const head = createHeadSilhouette('male');
      this.addPart(this.headPivot, head, 0.22, pal.primary, { bevel: 0.75 });

      const isRabbit = this.kind === 'rabbit';
      for (const side of [-1, 1]) {
        const ear = createLeafShape(isRabbit ? 0.075 : 0.1, isRabbit ? 0.38 : 0.26);
        this.addPart(this.headPivot, ear, 0.035, pal.primary, {
          x: side * (isRabbit ? 0.09 : 0.17),
          y: isRabbit ? 0.34 : 0.22,
          z: 0,
          rz: side * (isRabbit ? -0.18 : -1.05),
        });
        const eye = createCrystalShape(0.028, 0.048);
        this.addPart(this.headPivot, eye, 0.02, pal.accent, {
          unlitGlow: true,
          outline: false,
          x: side * 0.07,
          y: 0.19,
          z: 0.12,
        });
      }

      if (!isRabbit) {
        // Nariz prominente de Goblin
        const nose = createCrystalShape(0.045, 0.12);
        this.addPart(this.headPivot, nose, 0.05, pal.primary, {
          y: 0.12,
          z: 0.14,
          rx: Math.PI * 0.48,
        });
      }

      // Brazos + arma procedural (daga carmesí o garrote)
      this.limbL.position.set(-0.22, 0.36, 0);
      this.limbR.position.set(0.22, 0.36, 0);
      this.bodyPivot.add(this.limbL, this.limbR);
      const armShape = createBoneShape(0.32, 0.035);
      this.addPart(this.limbL, armShape, 0.06, pal.primary);
      this.addPart(this.limbR, armShape, 0.06, pal.primary);

      const weaponShape = isRabbit ? createDaggerBladeShape(0.042, 0.42) : createTrunkShapeClub();
      this.addPart(this.limbR, weaponShape, 0.04, isRabbit ? PALETTE_32.TELA_ROJA : PALETTE_32.CORTEZA, {
        y: -0.3,
        z: 0.06,
        rx: Math.PI * 0.42,
      });
      if (isRabbit) {
        this.addPart(this.limbL, weaponShape, 0.04, PALETTE_32.TELA_ROJA, {
          y: -0.3,
          z: 0.06,
          rx: Math.PI * 0.42,
        });
      }

      this.legL.position.set(-0.1, 0.46, 0);
      this.legR.position.set(0.1, 0.46, 0);
      this.rigRoot.add(this.legL, this.legR);
      const legShape = createBoneShape(0.38, 0.042);
      this.addPart(this.legL, legShape, 0.08, pal.secondary);
      this.addPart(this.legR, legShape, 0.08, pal.secondary);
      return;
    }

    if (this.archetype === 'skeleton') {
      // Esqueleto / Caballero de Ceniza / Piromante: extremidades finas con huesos visibles + rim alto
      this.bodyPivot.position.set(0, 0.56, 0);
      const ribcage = createBoneShape(0.46, 0.065);
      this.addPart(this.bodyPivot, ribcage, 0.16, pal.secondary, {
        rimStrength: 0.72,
        y: 0.45,
      });

      // Peto o túnica
      const cloak = createTorsoSilhouette('male');
      this.addPart(this.bodyPivot, cloak, 0.18, pal.primary, {
        rimStrength: 0.55,
        bevel: 0.7,
      });

      this.headPivot.position.set(0, 0.48, 0.02);
      this.bodyPivot.add(this.headPivot);
      const skull = createHeadSilhouette('male');
      this.addPart(this.headPivot, skull, 0.22, PALETTE_32.BLANCO_CALIDO, {
        shadowColor: PALETTE_32.ROCA_CLARA,
        rimStrength: 0.78,
      });

      if (this.kind === 'mage') {
        const hood = createDropShape(0.22, 0.36, false);
        this.addPart(this.headPivot, hood, 0.26, pal.primary, { y: 0.18, z: -0.02 });
      } else {
        const crest = createCrystalShape(0.08, 0.28);
        this.addPart(this.headPivot, crest, 0.06, pal.accent, { y: 0.34, rimStrength: 0.6 });
      }

      for (const side of [-1, 1]) {
        const eye = createCrystalShape(0.032, 0.05);
        this.addPart(this.headPivot, eye, 0.02, pal.accent, {
          unlitGlow: true,
          outline: false,
          x: side * 0.075,
          y: 0.19,
          z: 0.125,
        });
      }

      this.limbL.position.set(-0.24, 0.4, 0);
      this.limbR.position.set(0.24, 0.4, 0);
      this.bodyPivot.add(this.limbL, this.limbR);
      const boneArm = createBoneShape(0.42, 0.032);
      this.addPart(this.limbL, boneArm, 0.055, PALETTE_32.BLANCO_CALIDO, { rimStrength: 0.7 });
      this.addPart(this.limbR, boneArm, 0.055, PALETTE_32.BLANCO_CALIDO, { rimStrength: 0.7 });

      if (this.kind === 'mage') {
        const staff = createBoneShape(0.88, 0.024);
        this.addPart(this.limbR, staff, 0.04, PALETTE_32.CORTEZA, { y: 0.2, z: 0.06, rx: 0.2 });
        const orb = createCrystalShape(0.11, 0.22);
        this.addPart(this.limbR, orb, 0.11, pal.accent, {
          unlitGlow: true,
          additive: true,
          outline: false,
          y: 0.26,
          z: 0.08,
        });
      } else {
        const blade = createSwordBladeShape(0.045, 0.65);
        this.addPart(this.limbR, blade, 0.035, PALETTE_32.ACERO_CLARO, {
          y: -0.38,
          z: 0.05,
          rx: Math.PI * 0.42,
        });
        const shield = createShieldShape(0.16, 0.22);
        this.addPart(this.limbL, shield, 0.05, pal.primary, { y: -0.32, z: 0.08 });
      }

      this.legL.position.set(-0.11, 0.54, 0);
      this.legR.position.set(0.11, 0.54, 0);
      this.rigRoot.add(this.legL, this.legR);
      const boneLeg = createBoneShape(0.48, 0.036);
      this.addPart(this.legL, boneLeg, 0.06, PALETTE_32.BLANCO_CALIDO, { rimStrength: 0.7 });
      this.addPart(this.legR, boneLeg, 0.06, PALETTE_32.BLANCO_CALIDO, { rimStrength: 0.7 });
      return;
    }

    if (this.archetype === 'ghost') {
      // Fantasma / Murciélago Sombrío / Señor de la Escarcha: sin piernas, ondeo con uWaveOpacity + halo aditivo
      this.bodyPivot.position.set(0, 0.48, 0);
      const shroud = new THREE.Shape();
      shroud.moveTo(-0.32, 0.0);
      shroud.lineTo(-0.24, 0.16);
      shroud.lineTo(-0.12, 0.02);
      shroud.lineTo(0.0, 0.18);
      shroud.lineTo(0.12, 0.02);
      shroud.lineTo(0.24, 0.16);
      shroud.lineTo(0.32, 0.0);
      shroud.bezierCurveTo(0.34, 0.45, 0.26, 0.92, 0.0, 1.04);
      shroud.bezierCurveTo(-0.26, 0.92, -0.34, 0.45, -0.32, 0.0);
      this.addPart(this.bodyPivot, shroud, 0.26, pal.primary, {
        shadowColor: pal.secondary,
        rimStrength: 0.85,
        waveOpacity: true,
        opacity: 0.84,
      });

      // Halo aditivo envolvente
      const aura = createFlameShape(0.34, 0.82);
      this.addPart(this.bodyPivot, aura, 0.08, pal.accent, {
        unlitGlow: true,
        additive: true,
        outline: false,
        y: 0.12,
        z: -0.06,
        opacity: 0.38,
      });

      for (const side of [-1, 1]) {
        const wing = createLeafShape(0.18, 0.56);
        const pivot = side < 0 ? this.limbL : this.limbR;
        pivot.position.set(side * 0.2, 0.58, 0);
        this.bodyPivot.add(pivot);
        this.addPart(pivot, wing, 0.04, pal.secondary, {
          waveOpacity: true,
          opacity: 0.8,
          rz: side * -1.15,
        });

        const eye = createCrystalShape(0.04, 0.07);
        this.addPart(this.bodyPivot, eye, 0.03, pal.accent, {
          unlitGlow: true,
          outline: false,
          x: side * 0.1,
          y: 0.68,
          z: 0.14,
        });
      }
      return;
    }

    if (this.archetype === 'wolf') {
      // Lobo Sombrío / Lobo Gris / Oso Polar: cuadrúpedo + 7 mechones oscilantes + desaturación + ojos brillantes
      const desat = this.kind === 'polar_bear' ? 0.08 : 0.48;
      this.bodyPivot.position.set(0, 0.42, 0);

      const torso = new THREE.Shape();
      torso.moveTo(-0.44, 0.04);
      torso.bezierCurveTo(-0.42, 0.36, -0.05, 0.44, 0.36, 0.36);
      torso.quadraticCurveTo(0.48, 0.22, 0.42, 0.02);
      torso.quadraticCurveTo(0.0, -0.08, -0.44, 0.04);
      this.addPart(this.bodyPivot, torso, 0.36, pal.primary, {
        shadowColor: pal.secondary,
        desaturation: desat,
        ry: Math.PI * 0.5,
      });

      // 7 mechones de pelo independientes que oscilan con el tiempo
      for (let i = 0; i < 7; i++) {
        const tuft = new THREE.Group();
        tuft.position.set((i % 2 === 0 ? -1 : 1) * 0.12, 0.28 + (i % 3) * 0.05, -0.26 + i * 0.09);
        const tuftShape = createLeafShape(0.075, 0.2);
        this.addPart(tuft, tuftShape, 0.035, pal.secondary, {
          desaturation: desat,
          rz: (i % 2 === 0 ? 1 : -1) * 0.42,
        });
        this.bodyPivot.add(tuft);
        this.furTufts.push(tuft);
      }

      this.headPivot.position.set(0, 0.26, 0.38);
      this.bodyPivot.add(this.headPivot);
      const snout = new THREE.Shape();
      snout.moveTo(-0.15, -0.06);
      snout.lineTo(-0.1, 0.22);
      snout.lineTo(0.0, 0.34);
      snout.lineTo(0.1, 0.22);
      snout.lineTo(0.15, -0.06);
      snout.closePath();
      this.addPart(this.headPivot, snout, 0.24, pal.primary, {
        desaturation: desat,
        rx: Math.PI * 0.42,
      });

      for (const side of [-1, 1]) {
        const ear = createCrystalShape(0.065, 0.17);
        this.addPart(this.headPivot, ear, 0.04, pal.secondary, {
          desaturation: desat,
          x: side * 0.12,
          y: 0.16,
          z: -0.04,
          rz: side * -0.22,
        });
        // Ojos aditivos independientes del shader de sombra
        const eye = createCrystalShape(0.034, 0.055);
        this.addPart(this.headPivot, eye, 0.03, pal.accent, {
          unlitGlow: true,
          additive: true,
          outline: false,
          x: side * 0.08,
          y: 0.09,
          z: 0.2,
        });
      }

      this.tailPivot.position.set(0, 0.22, -0.38);
      this.bodyPivot.add(this.tailPivot);
      this.addPart(this.tailPivot, createLeafShape(0.1, 0.36), 0.08, pal.secondary, {
        desaturation: desat,
        rx: -0.95,
      });

      const leg = createBoneShape(0.38, 0.045);
      this.legL.position.set(-0.16, 0.04, 0.22);
      this.legR.position.set(0.16, 0.04, -0.22);
      this.bodyPivot.add(this.legL, this.legR);
      this.addPart(this.legL, leg, 0.08, pal.secondary, { desaturation: desat });
      this.addPart(this.legR, leg, 0.08, pal.secondary, { desaturation: desat });
      return;
    }

    // 'golem': Gólem de Roca / Lava / Hielo / Ent / Jefes Colosales
    this.bodyPivot.position.set(0, 0.62, 0);
    const bodyPoly = createRockPolygonShape(0.46, 0.54, this.kind.length);
    this.addPart(this.bodyPivot, bodyPoly, 0.42, pal.primary, {
      shadowColor: pal.secondary,
      y: 0.34,
      bevel: 0.65,
    });

    // Grietas internas luminosas o musgosas
    const crack = createCrystalShape(0.12, 0.38);
    this.addPart(this.bodyPivot, crack, 0.05, pal.accent, {
      unlitGlow: true,
      outline: false,
      y: 0.16,
      z: 0.21,
    });

    this.headPivot.position.set(0, 0.68, 0.04);
    this.bodyPivot.add(this.headPivot);
    const headPoly = createRockPolygonShape(0.22, 0.22, 3);
    this.addPart(this.headPivot, headPoly, 0.26, pal.primary, { shadowColor: pal.secondary });

    if (this.kind === 'ent' || this.kind === 'boss_forest') {
      for (const side of [-1, 1]) {
        const branch = createLeafShape(0.18, 0.42);
        this.addPart(this.headPivot, branch, 0.08, pal.secondary, {
          x: side * 0.22,
          y: 0.16,
          rz: side * -0.48,
        });
      }
    }

    for (const side of [-1, 1]) {
      const eye = createCrystalShape(0.036, 0.05);
      this.addPart(this.headPivot, eye, 0.03, pal.accent, {
        unlitGlow: true,
        additive: true,
        outline: false,
        x: side * 0.08,
        y: 0.02,
        z: 0.15,
      });
    }

    this.limbL.position.set(-0.46, 0.46, 0);
    this.limbR.position.set(0.46, 0.46, 0);
    this.bodyPivot.add(this.limbL, this.limbR);
    const armPoly = createRockPolygonShape(0.16, 0.36, 9);
    this.addPart(this.limbL, armPoly, 0.24, pal.secondary, { y: -0.26 });
    this.addPart(this.limbR, armPoly, 0.24, pal.secondary, { y: -0.26 });

    this.legL.position.set(-0.22, 0.48, 0);
    this.legR.position.set(0.22, 0.48, 0);
    this.rigRoot.add(this.legL, this.legR);
    const legPoly = createRockPolygonShape(0.15, 0.26, 5);
    this.addPart(this.legL, legPoly, 0.22, pal.secondary, { y: -0.22 });
    this.addPart(this.legR, legPoly, 0.22, pal.secondary, { y: -0.22 });
  }

  public setTelegraph(active: boolean, progress = 0): void {
    this.telegraphActive = active;
    this.telegraphProgress = Math.max(0, Math.min(1, progress));
    if (active && this.currentState !== 'telegraph') {
      this.playAnimation('telegraph');
      this.spawnAdditiveBurst(0.25, PALETTE_32.BRASA, 5, 0.45, 1.4);
    } else if (!active && this.currentState === 'telegraph') {
      this.playAnimation('idle');
    }
  }

  public setSlowed(slow: boolean): void {
    this.slowed = slow;
  }

  public setEnraged(enr: boolean): void {
    this.enraged = enr;
  }

  public triggerAttack(): void {
    this.telegraphActive = false;
    this.playAnimation('attack');
    this.squashAmount = 0.22;
    this.spawnAdditiveBurst(0.35, this.burstColor, 8, 0.42, 2.4);
  }

  public triggerHit(): void {
    this.triggerFlash(0.95, 0.14);
    this.squashAmount = 0.26;
    this.spawnAdditiveBurst(0.0, PALETTE_32.BLANCO_CALIDO, 7, 0.45, 2.0);
  }

  public triggerDeathBurst(): void {
    this.spawnAdditiveBurst(0.0, this.burstColor, this.kind.startsWith('boss') ? 22 : 12, 0.45, 3.2);
  }

  public update(delta: number): void {
    super.update(delta);

    for (let i = 0; i < this.waveMaterials.length; i++) {
      this.waveMaterials[i].uniforms.uWaveOpacity.value = 0.72 + Math.sin(this.elapsed * 3.8 + i) * 0.24;
    }

    if (this.telegraphActive) {
      const pulse = 0.28 + Math.sin(this.elapsed * 22) * 0.24 + this.telegraphProgress * 0.35;
      for (let i = 0; i < this.bodyMaterials.length; i++) {
        this.bodyMaterials[i].uniforms.uFlashIntensity.value = Math.min(1, pulse);
      }
    } else if (this.slowed && this.flashTimer <= 0) {
      for (let i = 0; i < this.bodyMaterials.length; i++) {
        this.bodyMaterials[i].uniforms.uFlashIntensity.value = 0.22;
      }
    } else if (this.enraged && this.flashTimer <= 0) {
      for (let i = 0; i < this.bodyMaterials.length; i++) {
        this.bodyMaterials[i].uniforms.uFlashIntensity.value = 0.12 + Math.sin(this.elapsed * 6) * 0.08;
      }
    }

    const isMoving = this.currentState === 'walk';
    const isAttacking = this.currentState === 'attack';
    const atkP = isAttacking ? Math.min(1, this.stateTimer / 0.28) : 0;
    const strike = isAttacking ? Math.sin(atkP * Math.PI) : 0;
    const telePull = this.telegraphActive ? 0.35 + this.telegraphProgress * 0.4 : 0;

    let bob = 0;
    let bodyRotX = 0;
    let bodyScaleX = 1;
    let bodyScaleY = 1;

    if (this.archetype === 'slime') {
      const freq = isMoving ? 8.5 : 3.2;
      const breath = Math.sin(this.elapsed * freq);
      bob = isMoving ? Math.abs(breath) * 0.26 : 0;
      bodyScaleY = 1 + breath * 0.15 - strike * 0.26;
      bodyScaleX = 1 - breath * 0.11 + strike * 0.32;
      bodyRotX = isMoving ? 0.22 : -telePull * 0.35 + strike * 0.48;
      // Parpadeo periódico cada ~3.5s
      const blinkPhase = this.elapsed % 3.6;
      this.slimeEyesPivot.scale.y = blinkPhase > 3.45 ? 0.12 : 1.0;
    } else if (this.archetype === 'rat') {
      const trot = Math.sin(this.elapsed * (isMoving ? 14 : 3.2));
      this.tailPivot.rotation.y = Math.sin(this.elapsed * 3.0) * 0.42;
      this.legL.rotation.x = isMoving ? trot * 0.72 : 0;
      this.legR.rotation.x = isMoving ? -trot * 0.72 : 0;
      bob = isAttacking ? Math.sin(atkP * Math.PI) * 0.42 : isMoving ? Math.abs(trot) * 0.08 : 0;
      bodyRotX = -telePull * 0.4 + strike * 0.5;
    } else if (this.archetype === 'bat') {
      const flapFreq = isMoving || isAttacking ? 18 : 11;
      const flap = Math.sin(this.elapsed * flapFreq) * 0.72;
      this.limbL.rotation.y = -flap;
      this.limbR.rotation.y = flap;
      this.limbL.rotation.z = flap * 0.42;
      this.limbR.rotation.z = -flap * 0.42;
      bob = Math.sin(this.elapsed * 4.2) * 0.16 - strike * 0.38;
      this.bodyPivot.rotation.z = Math.sin(this.elapsed * 3.1) * 0.16;
      bodyRotX = isAttacking ? 0.52 * strike : isMoving ? 0.22 : -telePull * 0.25;
    } else if (this.archetype === 'wild_dog') {
      const trot = Math.sin(this.elapsed * (isMoving ? 13 : 2.8));
      for (let i = 0; i < this.furTufts.length; i++) {
        this.furTufts[i].rotation.z = Math.sin(this.elapsed * 4.8 + i * 0.9) * 0.14;
      }
      this.tailPivot.rotation.y = Math.sin(this.elapsed * 5.2) * 0.42;
      this.legL.rotation.x = isMoving ? trot * 0.72 : 0;
      this.legR.rotation.x = isMoving ? -trot * 0.72 : 0;
      this.jawPivot.rotation.x = isAttacking ? 0.45 * strike : this.telegraphActive ? 0.28 : 0.04;
      bob = isAttacking ? Math.sin(atkP * Math.PI) * 0.34 : isMoving ? Math.abs(trot) * 0.1 : 0;
      bodyRotX = -telePull * 0.38 + strike * 0.45;
    } else if (this.archetype === 'goblin') {
      const swing = Math.sin(this.elapsed * (isMoving ? 10 : 2.6));
      this.headPivot.rotation.y = isMoving ? 0 : Math.sin(this.elapsed * 9.5) * 0.08;
      this.limbL.rotation.x = isMoving ? -swing * 0.6 : -telePull * 0.5;
      this.limbR.rotation.x = isAttacking
        ? -2.1 + strike * 2.4
        : this.telegraphActive
          ? -1.6
          : isMoving
            ? swing * 0.6
            : 0.15;
      this.legL.rotation.x = isMoving ? swing * 0.65 : 0;
      this.legR.rotation.x = isMoving ? -swing * 0.65 : 0;
      bob = isMoving ? Math.abs(swing) * 0.09 : 0;
      bodyRotX = 0.24 - telePull * 0.25 + strike * 0.35;
    } else if (this.archetype === 'skeleton') {
      const march = Math.sin(this.elapsed * (isMoving ? 8 : 2.0));
      this.limbR.rotation.x = isAttacking
        ? -1.8 + strike * 2.1
        : this.telegraphActive
          ? -1.45
          : march * 0.42;
      this.limbL.rotation.x = -march * 0.35;
      this.legL.rotation.x = isMoving ? march * 0.52 : 0;
      this.legR.rotation.x = isMoving ? -march * 0.52 : 0;
      bob = isMoving ? Math.abs(march) * 0.06 : 0;
      bodyRotX = -telePull * 0.2 + strike * 0.28;
    } else if (this.archetype === 'ghost') {
      bob = 0.34 + Math.sin(this.elapsed * 3.4) * 0.15;
      this.bodyPivot.rotation.z = Math.sin(this.elapsed * 2.3) * 0.1;
      const flap = Math.sin(this.elapsed * 6.5) * 0.32;
      this.limbL.rotation.z = flap;
      this.limbR.rotation.z = -flap;
      bodyScaleX = 1 + strike * 0.25;
    } else if (this.archetype === 'wolf') {
      const trot = Math.sin(this.elapsed * (isMoving ? 12 : 2.5));
      for (let i = 0; i < this.furTufts.length; i++) {
        this.furTufts[i].rotation.z = Math.sin(this.elapsed * 4.5 + i * 0.9) * 0.14;
      }
      this.tailPivot.rotation.y = Math.sin(this.elapsed * 4) * 0.35;
      this.legL.rotation.x = isMoving ? trot * 0.65 : 0;
      this.legR.rotation.x = isMoving ? -trot * 0.65 : 0;
      bob = isMoving ? Math.abs(trot) * 0.1 : 0;
      bodyRotX = -telePull * 0.35 + strike * 0.42;
    } else {
      // golem: paso lento y pesado con impacto y polvo
      const stompFreq = 4.4;
      const march = Math.sin(this.elapsed * stompFreq);
      if (isMoving) {
        this.stepTimer += delta;
        if (this.stepTimer >= Math.PI / stompFreq) {
          this.stepTimer = 0;
          this.stepToggle = !this.stepToggle;
          this.spawnAdditiveBurst(0.15, PALETTE_32.ROCA_CLARA, 5, 0.08, 1.3);
          this.onHeavyStep?.();
        }
      }
      this.legL.rotation.x = isMoving ? march * 0.42 : 0;
      this.legR.rotation.x = isMoving ? -march * 0.42 : 0;
      const slam = isAttacking ? -2.0 + strike * 2.35 : this.telegraphActive ? -1.75 : march * 0.25;
      this.limbL.rotation.x = isAttacking || this.telegraphActive ? slam : -march * 0.25;
      this.limbR.rotation.x = slam;
      bob = isMoving ? Math.abs(march) * 0.06 : Math.sin(this.elapsed * 1.8) * 0.03;
      bodyRotX = -telePull * 0.22 + strike * 0.38;
    }

    if (isAttacking && atkP >= 1) {
      this.playAnimation('idle');
    }

    this.bounceHeight = bob;
    const sqX = bodyScaleX + this.squashAmount * 0.38;
    const sqY = bodyScaleY - this.squashAmount * 0.32;
    this.bodyPivot.scale.set(sqX, Math.max(0.55, sqY), 1);
    this.bodyPivot.rotation.x = bodyRotX;
    this.rigRoot.position.y = bob * this.baseScale;
    this.updateShadowByHeight(bob);
  }
}

function createTrunkShapeClub(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.025, 0);
  s.lineTo(-0.065, -0.34);
  s.quadraticCurveTo(0, -0.4, 0.065, -0.34);
  s.lineTo(0.025, 0);
  s.closePath();
  return s;
}

export class ProceduralNpcActor extends ProceduralEntity {
  public readonly role: NpcRole;
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly mouthGroup = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly propGroup = new THREE.Group();

  constructor(role: NpcRole) {
    super({
      hasShadow: true,
      shadowRadius: role === 'kid' ? 0.45 : 0.62,
      outlineWidth: 0.021,
      colliderHalfW: 0.42,
      colliderHalfH: 0.42,
      particlePoolSize: 0,
    });
    this.role = role;
    if (role === 'kid') {
      this.rigRoot.scale.setScalar(0.76);
    }
    this.buildBody();
  }

  private getRoleColors() {
    switch (this.role) {
      case 'smith':
        return { tunic: PALETTE_32.TIERRA, trim: PALETTE_32.TELA_ROJA, skin: PALETTE_32.PIEL_MEDIA, hair: PALETTE_32.CENIZA_OSCURA };
      case 'elder':
        return { tunic: PALETTE_32.TELA_AZUL, trim: PALETTE_32.ORO, skin: PALETTE_32.PIEL_CLARA, hair: PALETTE_32.BLANCO_CALIDO };
      case 'scholar':
        return { tunic: PALETTE_32.VIOLETA_RUNA, trim: PALETTE_32.ARCANO_CIAN, skin: PALETTE_32.PIEL_CLARA, hair: PALETTE_32.BLANCO_CALIDO };
      case 'warrior':
        return { tunic: PALETTE_32.ACERO_OSCURO, trim: PALETTE_32.TELA_ROJA, skin: PALETTE_32.PIEL_OSCURA, hair: PALETTE_32.CENIZA_OSCURA };
      case 'merchant':
        return { tunic: PALETTE_32.TELA_VERDE, trim: PALETTE_32.ORO, skin: PALETTE_32.PIEL_MEDIA, hair: PALETTE_32.CORTEZA };
      case 'kid':
        return { tunic: PALETTE_32.TELA_AZUL, trim: PALETTE_32.HIERBA_SECA, skin: PALETTE_32.PIEL_CLARA, hair: PALETTE_32.ORO };
      case 'banker':
        return { tunic: PALETTE_32.TIERRA, trim: PALETTE_32.ORO, skin: PALETTE_32.PIEL_MEDIA, hair: PALETTE_32.CENIZA_OSCURA };
      case 'innkeeper':
        return { tunic: PALETTE_32.TELA_ROJA, trim: PALETTE_32.BLANCO_CALIDO, skin: PALETTE_32.PIEL_MEDIA, hair: PALETTE_32.CORTEZA };
      case 'guard':
        return { tunic: PALETTE_32.TELA_AZUL, trim: PALETTE_32.ACERO_CLARO, skin: PALETTE_32.PIEL_MEDIA, hair: PALETTE_32.CENIZA_OSCURA };
      case 'peddler':
      default:
        return { tunic: PALETTE_32.HIERBA_SECA, trim: PALETTE_32.CORTEZA, skin: PALETTE_32.PIEL_OSCURA, hair: PALETTE_32.ROCA_OSCURA };
    }
  }

  private addPart(parent: THREE.Group, shape: THREE.Shape, depth: number, color: number, outline = true, x = 0, y = 0, z = 0) {
    const part = this.createExtrudedShapePart(
      shape,
      depth,
      {
        baseColor: color,
        shadowColor: computeShadowHex(color),
        highlightColor: computeHighlightHex(color),
        rimStrength: 0.34,
      },
      outline,
      0.8
    );
    part.position.set(x, y, z);
    parent.add(part);
    return part;
  }

  public buildBody(): void {
    const c = this.getRoleColors();
    this.torsoGroup.position.set(0, 0.56, 0);
    this.rigRoot.add(this.torsoGroup);

    const torsoShape = createTorsoSilhouette(this.role === 'smith' ? 'female' : 'male');
    this.addPart(this.torsoGroup, torsoShape, 0.24, c.tunic);

    // Delantal, bufanda o mochila de rol
    if (this.role === 'smith') {
      const apron = createShieldShape(0.15, 0.22);
      this.addPart(this.torsoGroup, apron, 0.05, PALETTE_32.CORTEZA, true, 0, 0.16, 0.13);
    } else if (this.role === 'banker') {
      const apron = createShieldShape(0.16, 0.24);
      this.addPart(this.torsoGroup, apron, 0.05, PALETTE_32.ACERO_OSCURO, true, 0, 0.15, 0.13);
      const beltKey = createCrystalShape(0.04, 0.11);
      this.addPart(this.torsoGroup, beltKey, 0.03, c.trim, true, 0.12, 0.18, 0.15);
    } else if (this.role === 'innkeeper') {
      const apron = createShieldShape(0.17, 0.24);
      this.addPart(this.torsoGroup, apron, 0.05, c.trim, true, 0, 0.16, 0.13);
    } else if (this.role === 'guard') {
      const breastplate = createShieldShape(0.17, 0.24);
      this.addPart(this.torsoGroup, breastplate, 0.06, c.trim, true, 0, 0.24, 0.13);
    } else if (this.role === 'merchant') {
      const sash = createShieldShape(0.16, 0.14);
      this.addPart(this.torsoGroup, sash, 0.06, c.trim, true, 0, 0.3, 0.12);
    } else if (this.role === 'peddler') {
      const pack = createRockPolygonShape(0.26, 0.32, 7);
      this.addPart(this.torsoGroup, pack, 0.26, PALETTE_32.CORTEZA, true, 0, 0.26, -0.22);
    }

    // Cabeza compartida + boca para animación 'talk'
    this.headGroup.position.set(0, 0.48, 0.02);
    this.torsoGroup.add(this.headGroup);
    if (this.role === 'kid') this.headGroup.scale.setScalar(1.26);
    this.addPart(this.headGroup, createHeadSilhouette(this.role === 'smith' ? 'female' : 'male'), 0.22, c.skin);

    for (const side of [-1, 1]) {
      const eye = createCrystalShape(0.024, 0.038);
      this.addPart(this.headGroup, eye, 0.02, PALETTE_32.CONTORNO, false, side * 0.07, 0.18, 0.115);
    }

    this.mouthGroup.position.set(0, 0.08, 0.115);
    this.headGroup.add(this.mouthGroup);
    const mouth = createRockPolygonShape(0.036, 0.016, 2);
    this.addPart(this.mouthGroup, mouth, 0.015, PALETTE_32.CONTORNO, false);

    // Rasgos distintivos por rol
    if (this.role === 'elder') {
      const beard = createDropShape(0.14, 0.26, false);
      const beardPart = this.addPart(this.headGroup, beard, 0.08, c.hair, true, 0, 0.04, 0.1);
      beardPart.rotation.x = Math.PI;
    } else if (this.role === 'scholar') {
      const hat = createCrystalShape(0.28, 0.46);
      this.addPart(this.headGroup, hat, 0.24, c.tunic, true, 0, 0.28, 0);
    } else if (this.role === 'warrior') {
      const helm = createCrystalShape(0.22, 0.34);
      this.addPart(this.headGroup, helm, 0.24, PALETTE_32.ACERO_CLARO, true, 0, 0.22, 0);
    } else if (this.role === 'guard') {
      // Casco cónico de guardia de Piedrablanca
      const helm = createCrystalShape(0.21, 0.3);
      this.addPart(this.headGroup, helm, 0.24, PALETTE_32.ACERO_CLARO, true, 0, 0.24, 0);
      const plume = createCrystalShape(0.05, 0.18);
      this.addPart(this.headGroup, plume, 0.06, PALETTE_32.TELA_AZUL, true, 0, 0.42, -0.02);
    } else if (this.role === 'peddler') {
      const brim = new THREE.Shape();
      brim.moveTo(-0.34, 0.3);
      brim.quadraticCurveTo(0, 0.36, 0.34, 0.3);
      brim.lineTo(0.14, 0.48);
      brim.lineTo(-0.14, 0.48);
      brim.closePath();
      this.addPart(this.headGroup, brim, 0.26, PALETTE_32.HIERBA_SECA, true, 0, 0.02, 0);
    } else if (this.role === 'merchant') {
      const turban = createDropShape(0.2, 0.22, false);
      this.addPart(this.headGroup, turban, 0.22, c.trim, true, 0, 0.28, 0);
    } else if (this.role === 'innkeeper') {
      const cap = createDropShape(0.18, 0.16, false);
      this.addPart(this.headGroup, cap, 0.2, c.hair, true, 0, 0.26, 0);
    }

    // Brazos y piernas
    this.armL.position.set(-0.22, 0.39, 0);
    this.armR.position.set(0.22, 0.39, 0);
    this.torsoGroup.add(this.armL, this.armR);
    const armShape = createBoneShape(0.36, 0.042);
    this.addPart(this.armL, armShape, 0.08, c.tunic);
    this.addPart(this.armR, armShape, 0.08, c.tunic);

    this.propGroup.position.set(0, -0.34, 0.05);
    this.armR.add(this.propGroup);

    if (this.role === 'smith') {
      const handle = createBoneShape(0.36, 0.024);
      this.addPart(this.propGroup, handle, 0.04, PALETTE_32.CORTEZA, true, 0, 0.14, 0);
      const hammerHead = createRockPolygonShape(0.1, 0.07, 1);
      this.addPart(this.propGroup, hammerHead, 0.12, PALETTE_32.ACERO_CLARO, true, 0, 0.24, 0.06);
    } else if (this.role === 'elder' || this.role === 'scholar') {
      const staff = createBoneShape(0.95, 0.024);
      this.addPart(this.propGroup, staff, 0.04, PALETTE_32.CORTEZA, true, 0, 0.34, 0.04);
      if (this.role === 'scholar') {
        this.addPart(this.propGroup, createCrystalShape(0.08, 0.16), 0.08, PALETTE_32.ARCANO_CIAN, false, 0, 0.42, 0.05);
      }
    } else if (this.role === 'warrior') {
      this.addPart(this.propGroup, createSwordBladeShape(0.04, 0.72), 0.03, PALETTE_32.ACERO_CLARO, true, 0, 0.1, 0.05);
      this.addPart(this.armL, createShieldShape(0.18, 0.24), 0.05, c.trim, true, -0.04, -0.24, 0.08);
    } else if (this.role === 'guard') {
      // Lanza vertical en mano derecha y escudo en brazo izquierdo
      const shaft = createBoneShape(1.25, 0.024);
      this.addPart(this.propGroup, shaft, 0.04, PALETTE_32.CORTEZA, true, 0, 0.48, 0.06);
      const spearTip = createCrystalShape(0.065, 0.24);
      this.addPart(this.propGroup, spearTip, 0.04, PALETTE_32.ACERO_CLARO, true, 0, 1.15, 0.06);
      this.addPart(this.armL, createShieldShape(0.2, 0.28), 0.055, PALETTE_32.TELA_AZUL, true, -0.05, -0.22, 0.09);
    } else if (this.role === 'innkeeper') {
      // Jarra de taberna en mano derecha
      const mug = createRockPolygonShape(0.075, 0.09, 2);
      this.addPart(this.propGroup, mug, 0.1, PALETTE_32.ORO, true, 0, 0.06, 0.06);
    }

    this.legL.position.set(-0.1, 0.54, 0);
    this.legR.position.set(0.1, 0.54, 0);
    this.rigRoot.add(this.legL, this.legR);
    const legShape = createBoneShape(0.46, 0.046);
    this.addPart(this.legL, legShape, 0.09, PALETTE_32.TIERRA);
    this.addPart(this.legR, legShape, 0.09, PALETTE_32.TIERRA);
  }

  public update(delta: number): void {
    super.update(delta);
    const talking = this.currentState === 'talk';
    const attacking = this.currentState === 'attack';
    let bob = Math.sin(this.elapsed * 2.2) * 0.025;

    if (attacking && this.role === 'guard') {
      const p = Math.min(1, this.stateTimer / 0.42);
      const thrust = Math.sin(p * Math.PI);
      this.armR.rotation.x = -0.3 - thrust * 1.15;
      this.torsoGroup.rotation.x = thrust * 0.22;
      if (p >= 1) this.playAnimation('idle');
    } else if (talking) {
      this.mouthGroup.scale.y = 1 + Math.abs(Math.sin(this.elapsed * 14)) * 2.2;
      this.headGroup.rotation.x = Math.sin(this.elapsed * 6) * 0.09;
      this.armR.rotation.x = -0.35 + Math.sin(this.elapsed * 5.2) * 0.22;
      this.armL.rotation.x = -0.2 + Math.cos(this.elapsed * 4.6) * 0.14;
    } else {
      this.mouthGroup.scale.y = 1;
      this.torsoGroup.rotation.x = 0;
      if (this.role === 'smith') {
        const strike = Math.sin(this.elapsed * 4.5);
        this.armR.rotation.x = -0.8 + Math.max(0, strike) * 1.1;
        this.torsoGroup.rotation.x = 0.08 + Math.max(0, strike) * 0.08;
      } else if (this.role === 'elder') {
        this.headGroup.rotation.x = 0.06;
        this.armR.rotation.x = -0.15 + Math.sin(this.elapsed * 18) * 0.025;
      } else if (this.role === 'warrior') {
        this.headGroup.rotation.y = Math.sin(this.elapsed * 1.1) * 0.32;
        this.armR.rotation.x = -0.25;
      } else if (this.role === 'guard') {
        this.headGroup.rotation.y = Math.sin(this.elapsed * 0.9) * 0.18;
        this.armR.rotation.x = -0.15;
        bob = 0;
      } else if (this.role === 'kid') {
        bob = Math.abs(Math.sin(this.elapsed * 4.2)) * 0.14;
        this.armL.rotation.z = -0.3 - Math.abs(Math.sin(this.elapsed * 4.2)) * 0.25;
        this.armR.rotation.z = 0.3 + Math.abs(Math.sin(this.elapsed * 4.2)) * 0.25;
      } else if (this.role === 'peddler') {
        this.headGroup.rotation.z = Math.sin(this.elapsed * 1.7) * 0.08;
        this.torsoGroup.rotation.x = 0.16;
      } else if (this.role === 'banker') {
        this.armL.rotation.x = -0.82;
        this.armL.rotation.z = 0.56;
        this.armR.rotation.x = -0.86;
        this.armR.rotation.z = -0.56;
        bob = 0;
      } else {
        this.armR.rotation.x = Math.sin(this.elapsed * 2) * 0.08;
        this.armL.rotation.x = -Math.sin(this.elapsed * 2) * 0.08;
      }
    }

    this.rigRoot.position.y = bob;
    this.updateShadowByHeight(bob);
  }
}

export function createProceduralNpcPortrait(role: NpcRole): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#141824';
  ctx.fillRect(0, 0, 64, 64);

  const bgMap: Record<NpcRole, string> = {
    elder: '#1e3a5f',
    smith: '#5c2d1e',
    scholar: '#321b54',
    warrior: '#3b1e24',
    merchant: '#1b4332',
    kid: '#244760',
    peddler: '#463820',
    banker: '#2b241c',
    innkeeper: '#4c1d24',
    guard: '#1d3557',
  };
  ctx.fillStyle = bgMap[role];
  ctx.beginPath();
  ctx.arc(32, 34, 24, 0, Math.PI * 2);
  ctx.fill();

  const skin = role === 'warrior' ? '#a66b4c' : role === 'smith' || role === 'merchant' ? '#d49a6a' : '#f2c8a2';
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(32, 32, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f121a';
  ctx.fillRect(26, 29, 3, 4);
  ctx.fillRect(35, 29, 3, 4);

  if (role === 'elder') {
    ctx.fillStyle = '#f8f4e8';
    ctx.beginPath();
    ctx.moveTo(21, 37);
    ctx.lineTo(32, 54);
    ctx.lineTo(43, 37);
    ctx.closePath();
    ctx.fill();
  } else if (role === 'scholar') {
    ctx.fillStyle = '#6d28d9';
    ctx.beginPath();
    ctx.moveTo(14, 24);
    ctx.lineTo(32, 6);
    ctx.lineTo(50, 24);
    ctx.closePath();
    ctx.fill();
  } else if (role === 'warrior') {
    ctx.fillStyle = '#b4bcc8';
    ctx.fillRect(19, 14, 26, 10);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(29, 7, 6, 8);
  } else if (role === 'guard') {
    ctx.fillStyle = '#b4bcc8';
    ctx.beginPath();
    ctx.moveTo(18, 24);
    ctx.lineTo(32, 8);
    ctx.lineTo(46, 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(30, 5, 4, 7);
  } else if (role === 'smith') {
    ctx.fillStyle = '#c84b31';
    ctx.fillRect(19, 17, 26, 7);
  } else if (role === 'merchant') {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(32, 18, 12, Math.PI, 0);
    ctx.fill();
  } else if (role === 'innkeeper') {
    ctx.fillStyle = '#7c4620';
    ctx.fillRect(19, 16, 26, 8);
    ctx.fillStyle = '#f8f4e8';
    ctx.fillRect(22, 45, 20, 11);
  } else if (role === 'peddler') {
    ctx.fillStyle = '#b89f6d';
    ctx.fillRect(12, 18, 40, 5);
    ctx.fillRect(21, 11, 22, 8);
  } else if (role === 'banker') {
    ctx.fillStyle = '#262930';
    ctx.fillRect(19, 17, 26, 6);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(29, 44, 6, 10);
  } else {
    ctx.fillStyle = '#e8c170';
    ctx.fillRect(21, 16, 22, 7);
  }

  return c;
}
