import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { BESTIARY } from '../game/Bestiary';
import { SPAWN_ZONES, SpawnZone } from '../game/SpawnZones';
import { BiomeId, TownLocation } from '../game/types';
import {
  getBiomeId,
  getLandElevation,
  getPathFactor,
  HALF_WORLD,
  isLiquidAt,
  LAND_THRESHOLD,
  LANDMARKS,
  WORLD_SIZE,
} from '../game/worldMath';

interface WorldMapOverlayProps {
  open: boolean;
  playerPos: { x: number; z: number };
  playerYawDeg?: number;
  worldSeed: number;
  towns: TownLocation[];
  onClose: () => void;
}

const BIOME_MAP_RGB: Record<BiomeId, [number, number, number]> = {
  0: [78, 143, 56], // Pradera Esmeralda
  1: [53, 106, 75], // Bosque Ancestral
  2: [77, 65, 68], // Tierras Volcánicas
  3: [135, 122, 106], // Tierras Rocosas
  4: [199, 217, 234], // Tierras Nevadas
};

const MAP_RENDER_SIZE = 600;
const TERRAIN_GRID = 300;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function worldToMapPx(wx: number, wz: number, size = MAP_RENDER_SIZE): { x: number; y: number } {
  return {
    x: ((wx + HALF_WORLD) / WORLD_SIZE) * size,
    y: ((wz + HALF_WORLD) / WORLD_SIZE) * size,
  };
}

export const WorldMapOverlay: React.FC<WorldMapOverlayProps> = React.memo(({
  open,
  playerPos,
  playerYawDeg = 0,
  worldSeed,
  towns,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainSeedRef = useRef<number | null>(null);
  const [hoveredZone, setHoveredZone] = useState<SpawnZone | null>(null);

  useEffect(() => {
    if (!open) {
      setHoveredZone(null);
    }
  }, [open]);

  const ensureTerrainCache = useMemo(() => {
    return (seed: number): HTMLCanvasElement | null => {
      if (typeof document === 'undefined') return null;
      if (terrainCanvasRef.current && terrainSeedRef.current === seed) {
        return terrainCanvasRef.current;
      }

      const off = terrainCanvasRef.current ?? document.createElement('canvas');
      off.width = TERRAIN_GRID;
      off.height = TERRAIN_GRID;
      const octx = off.getContext('2d');
      if (!octx) return null;

      const img = octx.createImageData(TERRAIN_GRID, TERRAIN_GRID);
      const data = img.data;

      for (let py = 0; py < TERRAIN_GRID; py++) {
        const wz = ((py + 0.5) / TERRAIN_GRID - 0.5) * WORLD_SIZE;
        for (let px = 0; px < TERRAIN_GRID; px++) {
          const wx = ((px + 0.5) / TERRAIN_GRID - 0.5) * WORLD_SIZE;
          const idx = (py * TERRAIN_GRID + px) * 4;

          const biome = getBiomeId(wx, wz, seed);
          let r: number;
          let g: number;
          let b: number;

          if (isLiquidAt(wx, wz, seed)) {
            if (biome === 2) {
              r = 168;
              g = 50;
              b = 30;
            } else {
              const elev = getLandElevation(wx, wz, seed);
              const shallow = elev > LAND_THRESHOLD - 0.08;
              r = shallow ? 34 : 23;
              g = shallow ? 84 : 62;
              b = shallow ? 132 : 106;
            }
          } else if (getPathFactor(wx, wz) > 0.28) {
            r = 197;
            g = 161;
            b = 103;
          } else {
            const base = BIOME_MAP_RGB[biome];
            const elev = getLandElevation(wx, wz, seed);
            const shade = 0.9 + Math.min(0.18, Math.max(-0.08, (elev - LAND_THRESHOLD) * 0.45));
            r = Math.min(255, Math.round(base[0] * shade));
            g = Math.min(255, Math.round(base[1] * shade));
            b = Math.min(255, Math.round(base[2] * shade));
          }

          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }

      octx.putImageData(img, 0, 0);
      terrainCanvasRef.current = off;
      terrainSeedRef.current = seed;
      return off;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = MAP_RENDER_SIZE;
    ctx.clearRect(0, 0, size, size);

    const terrain = ensureTerrainCache(worldSeed);
    if (terrain) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(terrain, 0, 0, size, size);
    }

    // Zonas de spawn derivadas del bestiario: anillos/sectores semitransparentes y etiquetas nítidas
    for (let i = 0; i < SPAWN_ZONES.length; i++) {
      const z = SPAWN_ZONES[i];
      const pos = worldToMapPx(z.center.x, z.center.z, size);
      const innerPx = (z.radiusRange[0] / WORLD_SIZE) * size;
      const outerPx = (z.radiusRange[1] / WORLD_SIZE) * size;
      const isHovered = hoveredZone?.id === z.id;
      const isFullRing = z.sectorSpan >= Math.PI * 1.98;
      const startAng = z.sectorCenterAngle - z.sectorSpan * 0.5;
      const endAng = z.sectorCenterAngle + z.sectorSpan * 0.5;

      ctx.save();
      ctx.beginPath();
      if (isFullRing) {
        ctx.arc(pos.x, pos.y, outerPx, 0, Math.PI * 2, false);
        ctx.arc(pos.x, pos.y, innerPx, 0, Math.PI * 2, true);
      } else {
        ctx.arc(pos.x, pos.y, outerPx, startAng, endAng, false);
        ctx.arc(pos.x, pos.y, innerPx, endAng, startAng, true);
        ctx.closePath();
      }
      ctx.fillStyle = hexToRgba(z.biomeColor, isHovered ? 0.38 : 0.24);
      ctx.fill();
      ctx.lineWidth = isHovered ? 2.2 : 1.3;
      ctx.strokeStyle = isHovered ? '#fde047' : 'rgba(255, 255, 255, 0.42)';
      ctx.stroke();

      // Etiqueta de zona y niveles (12px blanco con sombra) en el punto medio del sector
      const midRadPx = (innerPx + outerPx) * 0.5;
      let labelAngle = z.sectorCenterAngle;
      if (z.id === 'forest_edge') labelAngle = Math.PI * 0.75;
      const labelX = pos.x + Math.cos(labelAngle) * midRadPx;
      const labelY = pos.y + Math.sin(labelAngle) * midRadPx - 5;

      ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = isHovered ? '#fde047' : '#ffffff';
      ctx.fillText(`${z.name}`, labelX, labelY);
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(`Nv.${z.levelRange.min}-${z.levelRange.max}`, labelX, labelY + 13);
      ctx.restore();
    }

    // Pueblos secundarios
    for (let i = 0; i < towns.length; i++) {
      const t = towns[i];
      if (t.isCapital) continue;
      const p = worldToMapPx(t.x, t.z, size);
      ctx.save();
      ctx.fillStyle = '#86efac';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = '#bbf7d0';
      ctx.fillText(t.name, p.x, p.y + 13);
      ctx.restore();
    }

    // Centro del pueblo: icono de casa + etiqueta "Piedrablanca"
    const capitalPx = worldToMapPx(LANDMARKS.village.x, LANDMARKS.village.z, size);
    ctx.save();
    ctx.translate(capitalPx.x, capitalPx.y);
    // Techo
    ctx.fillStyle = '#c9a227';
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, -1);
    ctx.lineTo(7, -1);
    ctx.lineTo(7, 8);
    ctx.lineTo(-7, 8);
    ctx.lineTo(-7, -1);
    ctx.lineTo(-10, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Puerta
    ctx.fillStyle = '#3f2818';
    ctx.fillRect(-2.5, 1.5, 5, 6.5);
    // Etiqueta Piedrablanca
    ctx.font = '800 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#fde047';
    ctx.fillText('Piedrablanca', 0, 21);
    ctx.restore();

    // Rosa de los vientos / Norte arriba en la esquina superior derecha
    ctx.save();
    ctx.translate(size - 34, 34);
    ctx.fillStyle = 'rgba(15, 18, 28, 0.85)';
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(5, -2);
    ctx.lineTo(0, -5);
    ctx.lineTo(-5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.font = '800 12px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('N', 0, 7);
    ctx.restore();

    // Jugador: punto rojo + flecha direccional
    const pPx = worldToMapPx(playerPos.x, playerPos.z, size);
    const rad = (playerYawDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(pPx.x, pPx.y);
    ctx.rotate(rad);
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(6, -3);
    ctx.lineTo(0, -5.5);
    ctx.lineTo(-6, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [open, playerPos.x, playerPos.z, playerYawDeg, worldSeed, towns, hoveredZone, ensureTerrainCache]);

  if (!open) return null;

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const cx = ((e.clientX - rect.left) / rect.width) * MAP_RENDER_SIZE;
    const cy = ((e.clientY - rect.top) / rect.height) * MAP_RENDER_SIZE;

    const wx = (cx / MAP_RENDER_SIZE - 0.5) * WORLD_SIZE;
    const wz = (cy / MAP_RENDER_SIZE - 0.5) * WORLD_SIZE;

    let best: SpawnZone | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < SPAWN_ZONES.length; i++) {
      const z = SPAWN_ZONES[i];
      const dx = wx - z.center.x;
      const dz = wz - z.center.z;
      const distMeters = Math.hypot(dx, dz);
      if (distMeters < z.radiusRange[0] || distMeters > z.radiusRange[1]) continue;

      if (z.sectorSpan < Math.PI * 1.98) {
        const ang = Math.atan2(dz, dx);
        let diff = ang - z.sectorCenterAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > z.sectorSpan * 0.5) continue;
      }

      const mid = (z.radiusRange[0] + z.radiusRange[1]) * 0.5;
      const score = Math.abs(distMeters - mid);
      if (score < bestScore) {
        bestScore = score;
        best = z;
      }
    }
    if (best?.id !== hoveredZone?.id) {
      setHoveredZone(best);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(10,10,20,0.9)] p-3 sm:p-5 pointer-events-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mapa del Continente de Eldoria"
    >
      <div
        id="world-map"
        className="rpg-panel p-3 sm:p-4 flex flex-col items-center gap-2.5 max-w-[94vw] max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#c9a227] leading-tight">
              Mapa del Continente
            </h2>
            <p className="text-[11px] text-[#a0a0a0]">
              Zonas de criaturas por nivel · Punto rojo: tu posición ({Math.round(playerPos.x)}, {Math.round(playerPos.z)})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rpg-btn-secondary p-1.5 cursor-pointer shrink-0"
            aria-label="Cerrar mapa"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            width={MAP_RENDER_SIZE}
            height={MAP_RENDER_SIZE}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoveredZone(null)}
            className="block w-[min(600px,86vw,74vh)] h-[min(600px,86vw,74vh)] border-2 border-[#888888] bg-[#102542] cursor-crosshair"
          />

          {hoveredZone && (
            <div className="pointer-events-none absolute left-2.5 bottom-2.5 rpg-panel px-3 py-2 max-w-[300px]">
              <div className="flex items-center justify-between gap-3 mb-0.5">
                <span className="font-display text-xs font-bold text-[#c9a227]">
                  {hoveredZone.name}
                </span>
                <span className="font-mono-num text-[11px] font-bold text-[#e0e0e0]">
                  Nv.{hoveredZone.levelRange.min}-{hoveredZone.levelRange.max}
                </span>
              </div>
              <div className="text-[11px] text-[#b8b8b8]">
                Criaturas:{' '}
                {hoveredZone.mobs
                  .map((m) => {
                    const b = BESTIARY[m];
                    return `${b.name} (${b.baseLevel}-${Math.min(20, b.baseLevel + 2)})`;
                  })
                  .join(', ')}
              </div>
              <div className="text-[10px] text-[#9ca3af] mt-0.5 font-mono-num">
                Distancia: {hoveredZone.radiusRange[0]}-{hoveredZone.radiusRange[1]} m de Piedrablanca
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
