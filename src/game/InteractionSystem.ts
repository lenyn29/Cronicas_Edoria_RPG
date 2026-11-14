import * as THREE from 'three';
import { ContextActionType, ContextActionView } from './types';

export type InteractableKind = 'enemy' | 'chest' | 'npc' | 'crystal' | 'pickup';

export interface InteractableEntry {
  kind: InteractableKind;
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  range: number;
  target: unknown;
}

export interface ContextAction extends ContextActionView {
  kind: InteractableKind;
  target: unknown;
}

export const DEFAULT_ATTACK_ACTION: ContextAction = {
  type: 'attack',
  kind: 'enemy',
  targetId: 'air',
  label: 'Atacar',
  distance: Infinity,
  target: null,
};

export class InteractionSystem {
  private throttleTimer = 0;
  private readonly throttleInterval = 0.1;
  private currentAction: ContextAction | null = { ...DEFAULT_ATTACK_ACTION };

  public reset(): void {
    this.throttleTimer = 0;
    this.currentAction = null;
  }

  public getContextAction(): ContextAction | null {
    return this.currentAction;
  }

  public updateDetection(
    playerPos: THREE.Vector3,
    interactables: InteractableEntry[],
    dt: number,
    force = false
  ): { changed: boolean; action: ContextAction } {
    this.throttleTimer += dt;
    if (!force && this.throttleTimer < this.throttleInterval && this.currentAction) {
      return { changed: false, action: this.currentAction };
    }
    this.throttleTimer = 0;

    let bestEnemy: InteractableEntry | null = null;
    let bestEnemyDist = Infinity;

    let bestChest: InteractableEntry | null = null;
    let bestChestDist = Infinity;

    let bestTalk: InteractableEntry | null = null;
    let bestTalkDist = Infinity;

    let bestPickup: InteractableEntry | null = null;
    let bestPickupDist = Infinity;

    const px = playerPos.x;
    const pz = playerPos.z;

    for (let i = 0; i < interactables.length; i++) {
      const item = interactables[i];
      const dist = Math.hypot(item.x - px, item.z - pz);

      if (item.kind === 'enemy') {
        const limit = item.range + item.radius;
        if (dist <= limit && dist < bestEnemyDist) {
          bestEnemyDist = dist;
          bestEnemy = item;
        }
      } else if (item.kind === 'chest') {
        if (dist <= item.range && dist < bestChestDist) {
          bestChestDist = dist;
          bestChest = item;
        }
      } else if (item.kind === 'npc' || item.kind === 'crystal') {
        if (dist <= item.range && dist < bestTalkDist) {
          bestTalkDist = dist;
          bestTalk = item;
        }
      } else if (item.kind === 'pickup') {
        if (dist <= item.range && dist < bestPickupDist) {
          bestPickupDist = dist;
          bestPickup = item;
        }
      }
    }

    // Prioridad estricta estilo Flyff:
    // 1) Enemigo en rango -> Atacar enemigo
    // 2) Cofre / Banquero en rango -> Abrir cofre
    // 3) NPC / Cristal en rango -> Hablar
    // 4) Botín en rango -> Recoger
    // 5) Por defecto -> Atacar (nunca deshabilitado)
    let nextAction: ContextAction;
    if (bestEnemy) {
      nextAction = this.makeAction('attack', bestEnemy, bestEnemyDist);
    } else if (bestChest) {
      nextAction = this.makeAction('chest', bestChest, bestChestDist);
    } else if (bestTalk) {
      nextAction = this.makeAction('talk', bestTalk, bestTalkDist);
    } else if (bestPickup) {
      nextAction = this.makeAction('pickup', bestPickup, bestPickupDist);
    } else {
      nextAction = { ...DEFAULT_ATTACK_ACTION };
    }

    const prev = this.currentAction;
    const changed =
      prev === null ||
      prev.type !== nextAction.type ||
      prev.targetId !== nextAction.targetId ||
      prev.label !== nextAction.label;

    this.currentAction = nextAction;
    return { changed, action: nextAction };
  }

  private makeAction(type: ContextActionType, entry: InteractableEntry, distance: number): ContextAction {
    return {
      type,
      kind: entry.kind,
      targetId: entry.id,
      label: entry.label,
      distance,
      target: entry.target,
    };
  }

  // Raycaster dirigido solo a la lista explícita de objetos interactuables (nunca a toda la escena)
  public raycastInteractables(
    raycaster: THREE.Raycaster,
    interactableObjects: THREE.Object3D[]
  ): THREE.Intersection | null {
    if (interactableObjects.length === 0) return null;
    const hits = raycaster.intersectObjects(interactableObjects, true);
    return hits.length > 0 ? hits[0] : null;
  }
}
