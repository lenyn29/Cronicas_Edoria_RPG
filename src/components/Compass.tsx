import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Home } from 'lucide-react';
import { gameEventBus } from '../game/EventBus';
import { BiomeId, NearestTownInfo, TownLocation } from '../game/types';
import { getBiomeId, getPathFactor, isLiquidAt } from '../game/worldMath';

interface CompassProps {
  initialTown: NearestTownInfo;
  initialPos: { x: number; z: number };
  worldSeed: number;
  towns: TownLocation[];
  onOpenWorldMap?: () => void;
}

const BIOME_MINIMAP_COLORS: Record<BiomeId, string> = {
  0: '#4e8f38', // Pradera
  1: '#356a4b', // Bosque
  2: '#4d4144', // Volcánico
  3: '#877a6a', // Rocoso
  4: '#c7d9ea', // Nieve
};

const ZOOM_OPTIONS = [48, 80, 120] as const;

export const Compass: React.FC<CompassProps> = React.memo(({
  initialTown,
  initialPos,
  worldSeed,
  towns: initialTowns,
  onOpenWorldMap,
}) => {
  const [info, setInfo] = useState<NearestTownInfo>(initialTown);
  const smoothAngleRef = useRef<number>(initialTown.angleDeg);
  const [displayAngle, setDisplayAngle] = useState<number>(initialTown.angleDeg);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapStateRef = useRef<{ px: number; pz: number; seed: number; towns: TownLocation[] }>({
    px: initialPos.x,
    pz: initialPos.z,
    seed: worldSeed,
    towns: initialTowns,
  });

  const [zoomRadius, setZoomRadius] = useState<number>(80);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    longPressTimer: number | null;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
    longPressTimer: null,
  });

  useEffect(() => {
    setInfo(initialTown);
    const delta = ((initialTown.angleDeg - smoothAngleRef.current + 540) % 360) - 180;
    smoothAngleRef.current += delta;
    setDisplayAngle(smoothAngleRef.current);
  }, [initialTown]);

  useEffect(() => {
    mapStateRef.current = {
      px: initialPos.x,
      pz: initialPos.z,
      seed: worldSeed,
      towns: initialTowns,
    };
  }, [initialPos.x, initialPos.z, worldSeed, initialTowns]);

  useEffect(() => {
    return gameEventBus.on('compass:updated', (next) => {
      setInfo(next);
      mapStateRef.current = {
        px: next.px,
        pz: next.pz,
        seed: next.seed,
        towns: next.towns,
      };
      const delta = ((next.angleDeg - smoothAngleRef.current + 540) % 360) - 180;
      smoothAngleRef.current += delta;
      setDisplayAngle(smoothAngleRef.current);
    });
  }, []);

  const lastDrawnRef = useRef<{ qx: number; qz: number; zoomRadius: number; seed: number } | null>(null);

  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { px, pz, seed, towns } = mapStateRef.current;
    const qx = Math.round(px * 2);
    const qz = Math.round(pz * 2);
    const prev = lastDrawnRef.current;
    if (prev && prev.qx === qx && prev.qz === qz && prev.zoomRadius === zoomRadius && prev.seed === seed) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    lastDrawnRef.current = { qx, qz, zoomRadius, seed };

    const size = canvas.width;
    const half = size * 0.5;
    const cells = 35;
    const cellPx = size / cells;
    const span = zoomRadius * 2;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();

    // Norte siempre arriba: -Z hacia arriba, +X hacia la derecha
    for (let gy = 0; gy < cells; gy++) {
      const wz = pz + ((gy + 0.5) / cells - 0.5) * span;
      for (let gx = 0; gx < cells; gx++) {
        const wx = px + ((gx + 0.5) / cells - 0.5) * span;
        const dx = (gx + 0.5) * cellPx - half;
        const dy = (gy + 0.5) * cellPx - half;
        if (dx * dx + dy * dy > (half + cellPx) * (half + cellPx)) continue;

        const biome = getBiomeId(wx, wz, seed);
        let color = BIOME_MINIMAP_COLORS[biome];
        if (isLiquidAt(wx, wz, seed)) {
          color = biome === 2 ? '#a8321e' : '#1b4978';
        } else if (getPathFactor(wx, wz) > 0.28) {
          color = '#c5a167';
        }
        ctx.fillStyle = color;
        ctx.fillRect(gx * cellPx, gy * cellPx, Math.ceil(cellPx) + 0.5, Math.ceil(cellPx) + 0.5);
      }
    }

    const pxPerMeter = size / span;
    for (let i = 0; i < towns.length; i++) {
      const t = towns[i];
      const tx = half + (t.x - px) * pxPerMeter;
      const ty = half + (t.z - pz) * pxPerMeter;
      const d = Math.hypot(tx - half, ty - half);
      if (d <= half - 10) {
        ctx.fillStyle = t.isCapital ? '#c9a227' : '#86efac';
        ctx.strokeStyle = '#141414';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(tx, ty, t.isCapital ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(half, half, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }, [zoomRadius]);

  useEffect(() => {
    drawMinimap();
    const timer = window.setInterval(drawMinimap, 200);
    return () => window.clearInterval(timer);
  }, [drawMinimap]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  const clearLongPress = () => {
    if (dragStateRef.current.longPressTimer !== null) {
      window.clearTimeout(dragStateRef.current.longPressTimer);
      dragStateRef.current.longPressTimer = null;
    }
  };

  return (
    <div
      className="relative flex flex-col items-center select-none touch-none"
      style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }}
    >
      <div
        id="compass-container"
        onPointerDown={(e) => {
          if (e.button === 2) return;
          e.stopPropagation();
          clearLongPress();
          dragStateRef.current = {
            active: true,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            origX: dragOffset.x,
            origY: dragOffset.y,
            moved: false,
            longPressTimer: window.setTimeout(() => {
              dragStateRef.current.active = false;
              setMenuOpen(true);
            }, 480),
          };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignorar si pointer capture no está disponible
          }
        }}
        onPointerMove={(e) => {
          const ds = dragStateRef.current;
          if (!ds.active || e.pointerId !== ds.pointerId) return;
          const dx = e.clientX - ds.startX;
          const dy = e.clientY - ds.startY;
          if (!ds.moved && Math.hypot(dx, dy) > 6) {
            ds.moved = true;
            clearLongPress();
          }
          if (ds.moved) {
            setDragOffset({
              x: Math.max(-window.innerWidth * 0.65, Math.min(24, ds.origX + dx)),
              y: Math.max(-16, Math.min(window.innerHeight * 0.55, ds.origY + dy)),
            });
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerId === dragStateRef.current.pointerId) {
            const wasMoved = dragStateRef.current.moved;
            const wasActive = dragStateRef.current.active;
            clearLongPress();
            dragStateRef.current.active = false;
            dragStateRef.current.pointerId = null;
            if (wasActive && !wasMoved && e.button !== 2 && !menuOpen) {
              onOpenWorldMap?.();
            }
          }
        }}
        onPointerCancel={() => {
          clearLongPress();
          dragStateRef.current.active = false;
          dragStateRef.current.pointerId = null;
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearLongPress();
          setMenuOpen((v) => !v);
        }}
        title={
          info.inTown
            ? `Dentro de ${info.name} · Toca para abrir mapa · Arrastra para mover · Clic derecho para zoom`
            : `Hacia ${info.name} (${info.distance} m) · Toca para abrir mapa · Arrastra para mover · Clic derecho para zoom`
        }
        className={`relative w-[116px] h-[116px] md:w-[134px] md:h-[134px] rounded-full overflow-hidden border-2 cursor-pointer active:cursor-grabbing ${
          info.inTown ? 'border-[#86efac] bg-[#141414]/80' : 'border-[#c9a227] bg-[#141414]/80'
        }`}
      >
        <canvas
          id="minimap-canvas"
          ref={canvasRef}
          width={280}
          height={280}
          className="w-full h-full block opacity-75 pointer-events-none"
        />

        {/* Cardinales fijos (Norte siempre arriba) */}
        <span className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-extrabold text-[#c9a227]">
          N
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold text-[#e0e0e0]/80">
          S
        </span>
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[#e0e0e0]/80">
          E
        </span>
        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[#e0e0e0]/80">
          O
        </span>

        {info.inTown ? (
          <div className="pointer-events-none absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#86efac] flex items-center justify-center">
            <Home className="w-3.5 h-3.5 text-[#86efac]" />
          </div>
        ) : (
          <div
            id="compass-arrow"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{
              transform: `rotate(${displayAngle}deg)`,
              transition: 'transform 0.1s linear',
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 38 38"
              className="-translate-y-4"
              aria-hidden="true"
            >
              <polygon points="19,2 25,18 19,14.5 13,18" fill="#c9a227" stroke="#141414" strokeWidth="1.2" />
            </svg>
          </div>
        )}
      </div>

      {/* Menú contextual de zoom / reset de posición */}
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full mt-1 right-0 z-40 rpg-panel p-1.5 w-[132px] flex flex-col gap-1"
        >
          <div className="text-[9.5px] font-bold text-[#c9a227] px-1">Zoom Minimapa</div>
          <div className="grid grid-cols-3 gap-1">
            {ZOOM_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setZoomRadius(r);
                  setMenuOpen(false);
                }}
                className={`py-0.5 text-[10px] font-mono-num font-bold cursor-pointer ${
                  zoomRadius === r ? 'rpg-btn-primary' : 'rpg-btn-secondary'
                }`}
              >
                {r}m
              </button>
            ))}
          </div>
          {(dragOffset.x !== 0 || dragOffset.y !== 0) && (
            <button
              type="button"
              onClick={() => {
                setDragOffset({ x: 0, y: 0 });
                setMenuOpen(false);
              }}
              className="rpg-btn-secondary py-1 text-[10px] font-semibold cursor-pointer mt-0.5"
            >
              Centrar brújula
            </button>
          )}
        </div>
      )}
    </div>
  );
});
