import * as THREE from 'three';

export interface FloatTextSpawnOptions {
  wx: number;
  wy: number;
  wz: number;
  text: string;
  color?: string;
  size?: number;
  isCrit?: boolean;
  isCombo?: boolean;
  duration?: number;
}

interface FloatItemSlot {
  active: boolean;
  el: HTMLDivElement;
  wx: number;
  wy: number;
  wz: number;
  vy: number;
  life: number;
  maxLife: number;
  lastText: string;
  lastColor: string;
  lastSize: number;
  lastScale: string;
}

const _projVec = new THREE.Vector3();

// Sistema pooled de textos flotantes en DOM directo (cero re-renders de React a 60 FPS y cero GC)
export class FloatTextSystem {
  private container: HTMLElement | null = null;
  private pool: FloatItemSlot[] = [];
  private activeSlots: FloatItemSlot[] = [];

  constructor(preallocate = 16) {
    if (typeof document !== 'undefined') {
      for (let i = 0; i < preallocate; i++) {
        this.pool.push(this.createSlot());
      }
    }
  }

  private createSlot(): FloatItemSlot {
    const el = document.createElement('div');
    el.className = 'absolute top-0 left-0 font-mono-num font-extrabold whitespace-nowrap pointer-events-none select-none';
    el.style.display = 'none';
    el.style.willChange = 'transform, opacity';
    el.style.textShadow = '0 2px 3px rgba(0,0,0,0.95)';
    if (this.container) {
      this.container.appendChild(el);
    }
    return {
      active: false,
      el,
      wx: 0,
      wy: 0,
      wz: 0,
      vy: 1.5,
      life: 0,
      maxLife: 0.95,
      lastText: '',
      lastColor: '',
      lastSize: 0,
      lastScale: '1',
    };
  }

  public setContainer(container: HTMLElement | null): void {
    if (this.container === container) return;
    this.container = container;
    if (!container) return;

    for (let i = 0; i < this.activeSlots.length; i++) {
      const s = this.activeSlots[i];
      if (s.el.parentElement !== container) container.appendChild(s.el);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (s.el.parentElement !== container) container.appendChild(s.el);
    }
  }

  public spawn(opts: FloatTextSpawnOptions): void {
    if (typeof document === 'undefined') return;
    let slot = this.pool.pop();
    if (!slot) {
      if (this.activeSlots.length >= 40) {
        // Reciclar el más antiguo si hay demasiados simultáneos
        slot = this.activeSlots.shift()!;
      } else {
        slot = this.createSlot();
      }
    }
    if (this.container && slot.el.parentElement !== this.container) {
      this.container.appendChild(slot.el);
    }

    const life = opts.duration ?? (opts.isCombo ? 1.1 : 0.95);
    const color = opts.color ?? '#ffffff';
    const size = opts.size ?? 15;
    const scale = opts.isCrit || opts.isCombo ? '1.12' : '1';

    slot.active = true;
    slot.wx = opts.wx;
    slot.wy = opts.wy;
    slot.wz = opts.wz;
    slot.vy = opts.isCombo ? 1.15 : 1.55;
    slot.life = life;
    slot.maxLife = life;

    if (slot.lastText !== opts.text) {
      slot.lastText = opts.text;
      slot.el.textContent = opts.text;
    }
    if (slot.lastColor !== color) {
      slot.lastColor = color;
      slot.el.style.color = color;
    }
    if (slot.lastSize !== size) {
      slot.lastSize = size;
      slot.el.style.fontSize = `${size}px`;
    }
    slot.lastScale = scale;
    this.activeSlots.push(slot);
  }

  public update(dt: number, camera: THREE.Camera, viewportW: number, viewportH: number): void {
    if (this.activeSlots.length === 0) return;

    for (let i = this.activeSlots.length - 1; i >= 0; i--) {
      const f = this.activeSlots[i];
      f.life -= dt;
      f.wy += f.vy * dt;
      if (f.life <= 0) {
        f.active = false;
        f.el.style.display = 'none';
        const lastIdx = this.activeSlots.length - 1;
        if (i !== lastIdx) this.activeSlots[i] = this.activeSlots[lastIdx];
        this.activeSlots.pop();
        this.pool.push(f);
        continue;
      }

      _projVec.set(f.wx, f.wy, f.wz).project(camera);
      if (_projVec.z > 1) {
        f.el.style.display = 'none';
        continue;
      }

      const sx = (_projVec.x * 0.5 + 0.5) * viewportW;
      const sy = (-_projVec.y * 0.5 + 0.5) * viewportH;
      const opacity = Math.max(0, Math.min(1, (f.life / f.maxLife) * 1.4));

      f.el.style.display = 'block';
      f.el.style.opacity = opacity.toFixed(2);
      f.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${f.lastScale})`;
    }
  }

  public clear(): void {
    for (let i = this.activeSlots.length - 1; i >= 0; i--) {
      const s = this.activeSlots[i];
      s.active = false;
      s.el.style.display = 'none';
      this.pool.push(s);
    }
    this.activeSlots.length = 0;
  }

  public dispose(): void {
    this.clear();
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].el.remove();
    }
    this.pool.length = 0;
    this.container = null;
  }
}
