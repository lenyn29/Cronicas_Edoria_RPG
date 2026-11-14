import * as THREE from 'three';
import { gameEventBus } from './EventBus';

export interface NameplateTarget {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  z: number;
  isPlayer: boolean;
}

interface PoolSlot {
  root: HTMLDivElement;
  nameEl: HTMLSpanElement;
  levelEl: HTMLSpanElement;
  fillEl: HTMLDivElement;
  active: boolean;
  lastId: string;
  lastName: string;
  lastLevel: number;
  lastIsPlayer: boolean;
  lastHpSig: string;
}

interface CachedHp {
  hp: number;
  maxHp: number;
  dead: boolean;
}

const POOL_SIZE = 10;
const ENEMY_MAX_CAM_DIST_SQ = 20 * 20; // < 20 unidades de la cámara
const PLAYER_MIN_CAM_DIST_SQ = 5 * 5; // >= 5 unidades de la cámara
const HEAD_OFFSET_Y = 2.5;

export class NameplateSystem {
  private container: HTMLElement | null = null;
  private slots: PoolSlot[] = [];
  private hpCache = new Map<string, CachedHp>();
  private playerLevelOverride: number | null = null;
  private unsubs: Array<() => void> = [];

  // Pre-allocated math & selection buffers (0 GC allocations per frame)
  private readonly _projScreenMatrix = new THREE.Matrix4();
  private readonly _frustum = new THREE.Frustum();
  private readonly _tmpVec = new THREE.Vector3();
  private readonly _screenX = new Float32Array(POOL_SIZE);
  private readonly _screenY = new Float32Array(POOL_SIZE);
  private readonly _pickIdx = new Int32Array(POOL_SIZE);
  private readonly _pickDist = new Float32Array(POOL_SIZE);
  private readonly _pickScreenX = new Float32Array(POOL_SIZE);
  private readonly _pickScreenY = new Float32Array(POOL_SIZE);

  constructor() {
    this.unsubs.push(
      gameEventBus.on('enemy:damaged', (payload) => {
        const prev = this.hpCache.get(payload.id);
        if (prev) {
          prev.hp = payload.hp;
          prev.maxHp = payload.maxHp;
          prev.dead = payload.dead;
        } else {
          this.hpCache.set(payload.id, {
            hp: payload.hp,
            maxHp: payload.maxHp,
            dead: payload.dead,
          });
        }
        if (payload.dead) {
          this.hideSlotForEntity(payload.id);
        } else {
          this.refreshSlotHp(payload.id, payload.hp, payload.maxHp);
        }
      }),
      gameEventBus.on('player:healthChanged', (payload) => {
        const prev = this.hpCache.get('__player__');
        if (prev) {
          prev.hp = payload.hp;
          prev.maxHp = payload.maxHp;
          prev.dead = payload.hp <= 0;
        } else {
          this.hpCache.set('__player__', {
            hp: payload.hp,
            maxHp: payload.maxHp,
            dead: payload.hp <= 0,
          });
        }
        this.refreshSlotHp('__player__', payload.hp, payload.maxHp);
      }),
      gameEventBus.on('player:expChanged', (payload) => {
        this.playerLevelOverride = payload.level;
      })
    );
  }

  public setContainer(container: HTMLElement | null): void {
    if (this.container === container) return;
    this.teardownDom();
    this.container = container;
    if (!this.container || typeof document === 'undefined') return;

    for (let i = 0; i < POOL_SIZE; i++) {
      const root = document.createElement('div');
      root.className = 'nameplate enemy';
      root.style.display = 'none';

      const header = document.createElement('div');
      header.className = 'nameplate-header';

      const nameEl = document.createElement('span');
      nameEl.className = 'nameplate-name';

      const levelEl = document.createElement('span');
      levelEl.className = 'nameplate-level';

      header.appendChild(nameEl);
      header.appendChild(levelEl);

      const bar = document.createElement('div');
      bar.className = 'nameplate-bar';

      const fillEl = document.createElement('div');
      fillEl.className = 'nameplate-fill';
      fillEl.style.width = '100%';
      bar.appendChild(fillEl);

      root.appendChild(header);
      root.appendChild(bar);
      this.container.appendChild(root);

      this.slots.push({
        root,
        nameEl,
        levelEl,
        fillEl,
        active: false,
        lastId: '',
        lastName: '',
        lastLevel: -1,
        lastIsPlayer: false,
        lastHpSig: '',
      });
    }
  }

  public syncEntityHp(id: string, hp: number, maxHp: number, dead = false): void {
    const prev = this.hpCache.get(id);
    if (prev) {
      prev.hp = hp;
      prev.maxHp = maxHp;
      prev.dead = dead;
    } else {
      this.hpCache.set(id, { hp, maxHp, dead });
    }
    if (dead) {
      this.hideSlotForEntity(id);
    } else {
      this.refreshSlotHp(id, hp, maxHp);
    }
  }

  public hideAll(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.active) {
        slot.active = false;
        slot.root.style.display = 'none';
      }
    }
  }

  public update(
    camera: THREE.PerspectiveCamera,
    viewportW: number,
    viewportH: number,
    targets: NameplateTarget[],
    count: number,
    playerX: number,
    playerZ: number
  ): void {
    if (!this.container || this.slots.length === 0 || viewportW <= 0 || viewportH <= 0 || count <= 0) {
      this.hideAll();
      return;
    }

    camera.updateMatrixWorld();
    this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreenMatrix);

    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const halfW = viewportW * 0.5;
    const halfH = viewportH * 0.5;

    let playerSlotIdx = -1;
    let playerScreenX = 0;
    let playerScreenY = 0;
    let pickedCount = 0;

    // 1) Evaluar candidato del jugador y candidatos enemigos dentro de frustum + distancia
    for (let i = 0; i < count; i++) {
      const t = targets[i];
      const cached = this.hpCache.get(t.id);
      if (cached?.dead) continue;

      const worldY = t.y + HEAD_OFFSET_Y;
      const dcx = t.x - camX;
      const dcy = worldY - camY;
      const dcz = t.z - camZ;
      const camDistSq = dcx * dcx + dcy * dcy + dcz * dcz;

      if (t.isPlayer) {
        if (camDistSq < PLAYER_MIN_CAM_DIST_SQ) continue;
        this._tmpVec.set(t.x, worldY, t.z);
        if (!this._frustum.containsPoint(this._tmpVec)) continue;
        this._tmpVec.project(camera);
        if (this._tmpVec.z < -1 || this._tmpVec.z > 1) continue;
        const sx = (this._tmpVec.x + 1) * halfW;
        const sy = (-this._tmpVec.y + 1) * halfH;
        if (sx < -40 || sx > viewportW + 40 || sy < -40 || sy > viewportH + 40) continue;
        playerSlotIdx = i;
        playerScreenX = sx;
        playerScreenY = sy;
        continue;
      }

      if (camDistSq >= ENEMY_MAX_CAM_DIST_SQ) continue;
      this._tmpVec.set(t.x, worldY, t.z);
      if (!this._frustum.containsPoint(this._tmpVec)) continue;
      this._tmpVec.project(camera);
      if (this._tmpVec.z < -1 || this._tmpVec.z > 1) continue;
      const sx = (this._tmpVec.x + 1) * halfW;
      const sy = (-this._tmpVec.y + 1) * halfH;
      if (sx < -40 || sx > viewportW + 40 || sy < -40 || sy > viewportH + 40) continue;

      // Distancia al jugador para priorizar los más cercanos si hay > POOL_SIZE
      const dpx = t.x - playerX;
      const dpz = t.z - playerZ;
      const sortDistSq = dpx * dpx + dpz * dpz;

      const maxEnemySlots = playerSlotIdx >= 0 ? POOL_SIZE - 1 : POOL_SIZE;
      if (pickedCount < maxEnemySlots) {
        let pos = pickedCount;
        while (pos > 0 && this._pickDist[pos - 1] > sortDistSq) {
          this._pickDist[pos] = this._pickDist[pos - 1];
          this._pickIdx[pos] = this._pickIdx[pos - 1];
          this._pickScreenX[pos] = this._pickScreenX[pos - 1];
          this._pickScreenY[pos] = this._pickScreenY[pos - 1];
          pos--;
        }
        this._pickDist[pos] = sortDistSq;
        this._pickIdx[pos] = i;
        this._pickScreenX[pos] = sx;
        this._pickScreenY[pos] = sy;
        pickedCount++;
      } else if (maxEnemySlots > 0 && sortDistSq < this._pickDist[pickedCount - 1]) {
        let pos = pickedCount - 1;
        while (pos > 0 && this._pickDist[pos - 1] > sortDistSq) {
          this._pickDist[pos] = this._pickDist[pos - 1];
          this._pickIdx[pos] = this._pickIdx[pos - 1];
          this._pickScreenX[pos] = this._pickScreenX[pos - 1];
          this._pickScreenY[pos] = this._pickScreenY[pos - 1];
          pos--;
        }
        this._pickDist[pos] = sortDistSq;
        this._pickIdx[pos] = i;
        this._pickScreenX[pos] = sx;
        this._pickScreenY[pos] = sy;
      }
    }

    // Si el jugador apareció después que los enemigos, asegurar límite exacto de POOL_SIZE
    if (playerSlotIdx >= 0 && pickedCount > POOL_SIZE - 1) {
      pickedCount = POOL_SIZE - 1;
    }

    let slotCursor = 0;

    if (playerSlotIdx >= 0 && slotCursor < POOL_SIZE) {
      this._screenX[slotCursor] = playerScreenX;
      this._screenY[slotCursor] = playerScreenY;
      this.applySlot(this.slots[slotCursor], targets[playerSlotIdx], playerScreenX, playerScreenY);
      slotCursor++;
    }

    for (let k = 0; k < pickedCount && slotCursor < POOL_SIZE; k++) {
      const t = targets[this._pickIdx[k]];
      const sx = this._pickScreenX[k];
      const sy = this._pickScreenY[k];
      this.applySlot(this.slots[slotCursor], t, sx, sy);
      slotCursor++;
    }

    for (let i = slotCursor; i < POOL_SIZE; i++) {
      const slot = this.slots[i];
      if (slot.active) {
        slot.active = false;
        slot.root.style.display = 'none';
      }
    }
  }

  private applySlot(slot: PoolSlot, target: NameplateTarget, sx: number, sy: number): void {
    if (!slot.active) {
      slot.active = true;
      slot.root.style.display = 'flex';
    }

    if (slot.lastIsPlayer !== target.isPlayer) {
      slot.lastIsPlayer = target.isPlayer;
      slot.root.className = target.isPlayer ? 'nameplate player' : 'nameplate enemy';
    }

    if (slot.lastId !== target.id || slot.lastName !== target.name) {
      slot.lastId = target.id;
      slot.lastName = target.name;
      slot.nameEl.textContent = target.name;
    }

    const effectiveLevel =
      target.isPlayer && this.playerLevelOverride !== null
        ? this.playerLevelOverride
        : target.level;
    if (slot.lastLevel !== effectiveLevel) {
      slot.lastLevel = effectiveLevel;
      slot.levelEl.textContent = `Nv.${effectiveLevel}`;
    }

    let cached = this.hpCache.get(target.id);
    if (!cached) {
      cached = { hp: target.hp, maxHp: target.maxHp, dead: false };
      this.hpCache.set(target.id, cached);
    }

    const hpSig = `${Math.max(0, Math.round(cached.hp))}/${Math.max(1, Math.round(cached.maxHp))}`;
    if (slot.lastHpSig !== hpSig) {
      slot.lastHpSig = hpSig;
      const pct = Math.max(0, Math.min(100, (cached.hp / Math.max(1, cached.maxHp)) * 100));
      slot.fillEl.style.width = `${pct.toFixed(1)}%`;
    }

    slot.root.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  private refreshSlotHp(id: string, hp: number, maxHp: number): void {
    const hpSig = `${Math.max(0, Math.round(hp))}/${Math.max(1, Math.round(maxHp))}`;
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    const widthStr = `${pct.toFixed(1)}%`;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.active || slot.lastId !== id) continue;
      if (slot.lastHpSig !== hpSig) {
        slot.lastHpSig = hpSig;
        slot.fillEl.style.width = widthStr;
      }
    }
  }

  private hideSlotForEntity(id: string): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.active && slot.lastId === id) {
        slot.active = false;
        slot.root.style.display = 'none';
      }
    }
  }

  private teardownDom(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].root.remove();
    }
    this.slots.length = 0;
  }

  public dispose(): void {
    for (let i = 0; i < this.unsubs.length; i++) {
      this.unsubs[i]();
    }
    this.unsubs.length = 0;
    this.hpCache.clear();
    this.teardownDom();
    this.container = null;
  }
}
