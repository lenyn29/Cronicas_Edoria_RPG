import { gameEventBus } from './EventBus';
import { WindowId } from './types';

export interface WindowRuleConfig {
  closeOnOutsideClick: boolean;
  exclusive: boolean;
  blocksGameplay: boolean;
  fixedZIndex?: number;
}

export const HUD_Z_INDEX = 500;
export const WINDOW_BASE_Z_INDEX = 1000;
export const WORLD_MAP_Z_INDEX = 2000;

const WINDOW_RULES: Record<WindowId, WindowRuleConfig> = {
  'npc-dialog': { closeOnOutsideClick: true, exclusive: true, blocksGameplay: true },
  'bank-window': { closeOnOutsideClick: false, exclusive: true, blocksGameplay: true },
  'shop-window': { closeOnOutsideClick: true, exclusive: true, blocksGameplay: true },
  'forge-window': { closeOnOutsideClick: true, exclusive: true, blocksGameplay: true },
  'hero-window': { closeOnOutsideClick: true, exclusive: false, blocksGameplay: true },
  'inventory-window': { closeOnOutsideClick: false, exclusive: false, blocksGameplay: false },
  'world-map': {
    closeOnOutsideClick: true,
    exclusive: true,
    blocksGameplay: true,
    fixedZIndex: WORLD_MAP_Z_INDEX,
  },
};

export interface WindowManagerSnapshot {
  stack: readonly WindowId[];
  revision: number;
}

export class WindowManager {
  public readonly maxSimultaneous = 2;
  private stack: WindowId[] = [];
  private revision = 0;
  private snapshot: WindowManagerSnapshot = { stack: [], revision: 0 };
  private listeners = new Set<() => void>();

  private notify(): void {
    this.revision++;
    this.snapshot = { stack: [...this.stack], revision: this.revision };
    for (const fn of this.listeners) {
      fn();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): WindowManagerSnapshot => {
    return this.snapshot;
  };

  public isOpen(id: WindowId): boolean {
    return this.stack.includes(id);
  }

  public getOpenWindows(): readonly WindowId[] {
    return this.snapshot.stack;
  }

  public hasAnyOpen(): boolean {
    return this.stack.length > 0;
  }

  public hasBlockingModalOpen(): boolean {
    for (let i = 0; i < this.stack.length; i++) {
      if (WINDOW_RULES[this.stack[i]].blocksGameplay) return true;
    }
    return false;
  }

  public getZIndex(id: WindowId): number {
    const fixed = WINDOW_RULES[id].fixedZIndex;
    if (fixed !== undefined) return fixed;
    const idx = this.stack.indexOf(id);
    return WINDOW_BASE_Z_INDEX + (idx >= 0 ? idx : 0);
  }

  public open(id: WindowId): void {
    const rule = WINDOW_RULES[id];
    const closedIds: WindowId[] = [];

    if (this.stack.includes(id)) {
      // Bring already-open window to top of stack
      this.stack = this.stack.filter((w) => w !== id);
      this.stack.push(id);
      this.notify();
      return;
    }

    if (rule.exclusive) {
      // Exclusive NPC / modal windows replace current windows cleanly
      while (this.stack.length > 0) {
        const removed = this.stack.shift()!;
        closedIds.push(removed);
      }
    } else {
      // Non-exclusive windows (hero-window, inventory-window) close any exclusive window first
      const nextStack: WindowId[] = [];
      for (const existing of this.stack) {
        if (WINDOW_RULES[existing].exclusive) {
          closedIds.push(existing);
        } else {
          nextStack.push(existing);
        }
      }
      this.stack = nextStack;
      while (this.stack.length >= this.maxSimultaneous) {
        const removed = this.stack.shift()!;
        closedIds.push(removed);
      }
    }

    this.stack.push(id);
    this.notify();

    for (let i = 0; i < closedIds.length; i++) {
      gameEventBus.emit('window:closed', { id: closedIds[i] });
    }
    gameEventBus.emit('window:opened', { id });
  }

  public close(id: WindowId): boolean {
    const idx = this.stack.indexOf(id);
    if (idx < 0) return false;
    this.stack.splice(idx, 1);
    this.notify();
    gameEventBus.emit('window:closed', { id });
    return true;
  }

  public toggle(id: WindowId): boolean {
    if (this.isOpen(id)) {
      this.close(id);
      return false;
    }
    this.open(id);
    return true;
  }

  public closeTopmost(): WindowId | null {
    if (this.stack.length === 0) return null;
    const top = this.stack.pop()!;
    this.notify();
    gameEventBus.emit('window:closed', { id: top });
    return top;
  }

  public closeAll(): void {
    if (this.stack.length === 0) return;
    const prev = [...this.stack];
    this.stack = [];
    this.notify();
    for (let i = prev.length - 1; i >= 0; i--) {
      gameEventBus.emit('window:closed', { id: prev[i] });
    }
  }

  public handleOutsideClick(id: WindowId): boolean {
    if (!WINDOW_RULES[id].closeOnOutsideClick) {
      return false;
    }
    return this.close(id);
  }
}

export const windowManager = new WindowManager();
