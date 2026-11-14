import * as THREE from 'three';
import { computeHighlightHex, computeShadowHex, PALETTE_32 } from './core/Palette';
import { ProceduralEntity } from './core/ProceduralEntity';
import {
  createBottleShape,
  createCoinShape,
  createCrystalShape,
  createDaggerBladeShape,
  createGemShape,
  createKeyShape,
  createLeafShape,
  createRockPolygonShape,
  createScrollShape,
  createShieldShape,
  createSwordBladeShape,
} from './core/ShapeLibrary';
import { WEAPON_MAP } from './lootTable';
import { MaterialId } from './types';

export type ItemArchetype =
  | 'potion'
  | 'elixir'
  | 'sword'
  | 'dagger'
  | 'shield'
  | 'gold'
  | 'key'
  | 'scroll'
  | 'herb'
  | 'gem'
  | 'food';

export function resolveItemArchetype(
  pickupType: 'gold' | 'potion' | 'elixir' | 'weapon' | 'armor' | 'material',
  gearId?: string,
  materialId?: MaterialId
): ItemArchetype {
  if (pickupType === 'gold') return 'gold';
  if (pickupType === 'potion') return 'potion';
  if (pickupType === 'elixir') return 'elixir';
  if (pickupType === 'weapon') {
    const def = gearId ? WEAPON_MAP[gearId] : undefined;
    return def?.weaponKind === 'dagger' ? 'dagger' : 'sword';
  }
  if (pickupType === 'armor') return 'shield';
  if (materialId === 'ancestral_wood' || materialId === 'wolf_pelt') return 'herb';
  if (materialId === 'void_orb' || materialId === 'ignis_core' || materialId === 'ice_shard') return 'gem';
  if (materialId === 'slime_gel') return 'elixir';
  return 'gem';
}

// Ítems procedurales con siluetas icónicas legibles a 16x16–24x24, contorno fino (0.014) y brillo interno
export class ItemEntity extends ProceduralEntity {
  public readonly archetype: ItemArchetype;
  private readonly itemHolder = new THREE.Group();
  private readonly shimmerDot = new THREE.Group();
  private pickupAnimating = false;
  private pickupTimer = 0;
  private readonly pickupDuration = 0.28;
  private readonly accentColor: number;
  private phaseOffset = 0;
  private basePosY = 0.45;

  constructor(archetype: ItemArchetype, accentHex?: number) {
    super({
      hasShadow: false,
      outlineWidth: 0.014,
      colliderHalfW: 0.35,
      colliderHalfH: 0.35,
      particlePoolSize: 12,
    });
    this.archetype = archetype;
    this.accentColor = accentHex ?? ItemEntity.defaultAccentFor(archetype);
    this.rigRoot.rotation.x = 0;
    this.buildBody();
  }

  private static defaultAccentFor(arch: ItemArchetype): number {
    switch (arch) {
      case 'potion':
        return PALETTE_32.TELA_ROJA;
      case 'elixir':
        return PALETTE_32.ARCANO_CIAN;
      case 'sword':
        return PALETTE_32.ACERO_CLARO;
      case 'dagger':
        return PALETTE_32.TELA_ROJA;
      case 'shield':
        return PALETTE_32.BRONCE;
      case 'gold':
        return PALETTE_32.ORO;
      case 'key':
        return PALETTE_32.ORO;
      case 'scroll':
        return PALETTE_32.BLANCO_CALIDO;
      case 'herb':
        return PALETTE_32.HOJA_CLARA;
      case 'gem':
        return PALETTE_32.VIOLETA_RUNA;
      case 'food':
      default:
        return PALETTE_32.BRASA;
    }
  }

  private addShape(shape: THREE.Shape, depth: number, color: number, opts?: { rimStrength?: number; unlit?: boolean; additive?: boolean; outline?: boolean; x?: number; y?: number; z?: number; rz?: number; rx?: number }) {
    const p = this.createExtrudedShapePart(
      shape,
      depth,
      {
        baseColor: color,
        shadowColor: computeShadowHex(color),
        highlightColor: computeHighlightHex(color),
        rimStrength: opts?.rimStrength ?? 0.55,
        unlitGlow: opts?.unlit,
        additive: opts?.additive,
      },
      opts?.outline ?? true,
      0.55
    );
    p.position.set(opts?.x ?? 0, opts?.y ?? 0, opts?.z ?? 0);
    if (opts?.rz) p.rotation.z = opts.rz;
    if (opts?.rx) p.rotation.x = opts.rx;
    this.itemHolder.add(p);
    return p;
  }

  public buildBody(): void {
    this.rigRoot.add(this.itemHolder);
    this.itemHolder.scale.setScalar(1.18);

    if (this.archetype === 'potion' || this.archetype === 'elixir') {
      const liquidColor = this.archetype === 'potion' ? PALETTE_32.TELA_ROJA : PALETTE_32.ARCANO_CIAN;
      this.addShape(createBottleShape(), 0.14, liquidColor, { rimStrength: 0.72 });
      const cork = createRockPolygonShape(0.055, 0.045, 2);
      this.addShape(cork, 0.09, PALETTE_32.CORTEZA, { y: 0.49 });
      // Partícula / burbuja interna flotando
      const dot = createCrystalShape(0.038, 0.075);
      const dotMesh = this.createExtrudedShapePart(
        dot,
        0.04,
        { baseColor: PALETTE_32.BLANCO_CALIDO, unlitGlow: true, additive: true },
        false,
        0.3
      );
      this.shimmerDot.add(dotMesh);
      this.shimmerDot.position.set(0.03, 0.16, 0.08);
      this.itemHolder.add(this.shimmerDot);
      return;
    }

    if (this.archetype === 'sword') {
      this.addShape(createSwordBladeShape(0.055, 0.58), 0.035, PALETTE_32.ACERO_CLARO, { y: -0.14, rz: -0.35 });
      const guard = createRockPolygonShape(0.14, 0.032, 1);
      this.addShape(guard, 0.05, PALETTE_32.ORO, { y: -0.1, rz: -0.35 });
      return;
    }

    if (this.archetype === 'dagger') {
      this.addShape(createDaggerBladeShape(0.045, 0.44), 0.032, this.accentColor, { y: -0.12, rz: -0.4 });
      const guard = createRockPolygonShape(0.1, 0.028, 3);
      this.addShape(guard, 0.045, PALETTE_32.ORO, { y: -0.09, rz: -0.4 });
      return;
    }

    if (this.archetype === 'shield') {
      this.addShape(createShieldShape(0.22, 0.28), 0.08, PALETTE_32.ACERO_CLARO, { y: 0.24 });
      this.addShape(createCrystalShape(0.08, 0.14), 0.09, this.accentColor, { y: 0.18, z: 0.03, outline: false });
      return;
    }

    if (this.archetype === 'gold') {
      this.addShape(createCoinShape(0.21), 0.06, PALETTE_32.ORO, { y: 0.24 });
      return;
    }

    if (this.archetype === 'key') {
      this.addShape(createKeyShape(), 0.045, PALETTE_32.ORO, { y: 0.16 });
      const shaft = new THREE.Shape();
      shaft.moveTo(-0.025, 0.14);
      shaft.lineTo(-0.025, -0.16);
      shaft.lineTo(0.09, -0.16);
      shaft.lineTo(0.09, -0.1);
      shaft.lineTo(0.025, -0.1);
      shaft.lineTo(0.025, 0.14);
      shaft.closePath();
      this.addShape(shaft, 0.04, PALETTE_32.ORO, { y: 0.16 });
      return;
    }

    if (this.archetype === 'scroll') {
      this.addShape(createScrollShape(), 0.06, PALETTE_32.BLANCO_CALIDO, { y: 0.24 });
      this.addShape(createRockPolygonShape(0.055, 0.055, 4), 0.075, PALETTE_32.TELA_ROJA, { y: 0.22, z: 0.03 });
      return;
    }

    if (this.archetype === 'herb') {
      this.addShape(createLeafShape(0.11, 0.34), 0.035, PALETTE_32.HOJA_CLARA, { y: 0.08 });
      this.addShape(createLeafShape(0.09, 0.28), 0.035, PALETTE_32.HOJA_OSCURA, { y: 0.08, rz: -0.45 });
      this.addShape(createLeafShape(0.09, 0.28), 0.035, PALETTE_32.HOJA_OSCURA, { y: 0.08, rz: 0.45 });
      return;
    }

    if (this.archetype === 'gem') {
      this.addShape(createGemShape(0.19, 0.27), 0.16, this.accentColor, { y: 0.26 });
      return;
    }

    // food
    this.addShape(createRockPolygonShape(0.19, 0.18, 6), 0.16, PALETTE_32.TELA_ROJA, { y: 0.22 });
    this.addShape(createLeafShape(0.06, 0.14), 0.03, PALETTE_32.HOJA_CLARA, { x: 0.04, y: 0.38, rz: -0.5 });
  }

  public resetForSpawn(x: number, y: number, z: number): void {
    this.pickupAnimating = false;
    this.pickupTimer = 0;
    this.phaseOffset = Math.random() * 6.28;
    this.basePosY = y + 0.18;
    this.itemHolder.scale.setScalar(1.18);
    this.itemHolder.rotation.y = 0;
    this.group.visible = true;
    this.setWorldPosition(x, this.basePosY, z);
  }

  public startPickup(): void {
    if (this.pickupAnimating) return;
    this.pickupAnimating = true;
    this.pickupTimer = 0;
    this.spawnAdditiveBurst(0.0, this.accentColor, 10, 0.28, 2.5);
  }

  public isPickupFinished(): boolean {
    return this.pickupAnimating && this.pickupTimer >= this.pickupDuration;
  }

  public isPickingUp(): boolean {
    return this.pickupAnimating;
  }

  public update(delta: number): void {
    super.update(delta);

    if (this.pickupAnimating) {
      this.pickupTimer += delta;
      const t = Math.min(1, this.pickupTimer / this.pickupDuration);
      const overshoot = t < 0.3 ? 1.18 + (t / 0.3) * 0.42 : Math.max(0, 1.6 * (1 - (t - 0.3) / 0.7));
      this.itemHolder.scale.setScalar(overshoot);
      this.itemHolder.position.y = t * 0.72;
      this.itemHolder.rotation.y += delta * 9;
      return;
    }

    this.itemHolder.position.y = Math.sin(this.elapsed * 3.8 + this.phaseOffset) * 0.11;
    this.itemHolder.rotation.y += delta * 2.1;
    this.shimmerDot.position.y = 0.16 + Math.sin(this.elapsed * 5.2 + this.phaseOffset) * 0.05;

    const pulse = 0.04 + 0.07 * (0.5 + 0.5 * Math.sin(this.elapsed * 4.2 + this.phaseOffset));
    for (let i = 0; i < this.bodyMaterials.length; i++) {
      const u = this.bodyMaterials[i].uniforms;
      if (u.uFlashIntensity) {
        u.uFlashIntensity.value = pulse;
      }
    }
  }
}
