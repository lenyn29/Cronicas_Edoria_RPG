// Bus de eventos desacoplado para comunicar estados del héroe hacia motor, sonido e interfaz

export type HeroState = 'idle' | 'walk' | 'attack' | 'hurt' | 'cast';

export type HeroEventMap = {
  'hero:stateChanged': { state: HeroState; previous: HeroState };
  'hero:damaged': { amount: number; healthRatio: number };
  'hero:died': { timestamp: number };
  'hero:attacked': { comboStep: 0 | 1 | 2; armed: boolean; dualDaggers: boolean };
};

type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  public on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  public off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener<never>);
    if (set.size === 0) this.listeners.delete(event);
  }

  public emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      (fn as Listener<Events[K]>)(payload);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

import type {
  ContextActionView,
  DayPhaseId,
  InventorySlotView,
  NearestTownInfo,
  TimeSnapshot,
  TownLocation,
  WindowId,
} from './types';

export type TargetFrameSnapshot = {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  isBoss: boolean;
} | null;

export type GameEventMap = {
  'player:healthChanged': { hp: number; maxHp: number };
  'player:manaChanged': { mp: number; maxMp: number };
  'player:expChanged': { xp: number; xpNext: number; level: number; leveledUp: boolean };
  'player:combatChanged': { inCombat: boolean };
  'enemy:damaged': { id: string; hp: number; maxHp: number; dead: boolean };
  'target:changed': TargetFrameSnapshot;
  'compass:updated': NearestTownInfo & {
    px: number;
    pz: number;
    seed: number;
    towns: TownLocation[];
    playerYawDeg?: number;
  };
  'inventory:updated': { slots: Array<InventorySlotView | null>; capacity: number };
  'bank:updated': { bankSlots: Array<InventorySlotView | null>; inventorySlots: Array<InventorySlotView | null> };
  'zone:entered': { name: string };
  'context:actionChanged': ContextActionView | null;
  'ui:toggleStatusPanel': undefined;
  'ui:toggleInventory': undefined;
  'ui:toggleBank': { open: boolean };
  'window:opened': { id: WindowId };
  'window:closed': { id: WindowId };
  'time:minuteChanged': TimeSnapshot;
  'time:phaseChanged': { phase: DayPhaseId; label: string; isNight: boolean };
};

export const heroEventBus = new EventBus<HeroEventMap>();
export const gameEventBus = new EventBus<GameEventMap>();

