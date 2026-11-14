import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { gameEventBus, TargetFrameSnapshot } from '../game/EventBus';
import { DialoguePayload, HudSnapshot } from '../game/types';
import { Compass } from './Compass';
import { GameClock } from './GameClock';

interface GameHUDProps {
  hud: HudSnapshot;
  dialogue: DialoguePayload | null;
  toast: string | null;
  modalOpen?: boolean;
  dialogZIndex?: number;
  onOpenWorldMap?: () => void;
  onCloseDialogue?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = React.memo(({
  hud,
  dialogue,
  toast,
  modalOpen = false,
  dialogZIndex = 1000,
  onOpenWorldMap,
  onCloseDialogue,
}) => {
  const portraitRef = useRef<HTMLCanvasElement | null>(null);
  const [zoneBanner, setZoneBanner] = useState<{ key: number; name: string } | null>(null);
  const [target, setTarget] = useState<TargetFrameSnapshot>(null);
  const zoneTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const offZone = gameEventBus.on('zone:entered', (payload) => {
      setZoneBanner({ key: Date.now(), name: payload.name });
      if (zoneTimerRef.current !== null) window.clearTimeout(zoneTimerRef.current);
      zoneTimerRef.current = window.setTimeout(() => {
        setZoneBanner(null);
      }, 3000);
    });
    const offTarget = gameEventBus.on('target:changed', (payload) => {
      setTarget(payload);
    });
    const offDamaged = gameEventBus.on('enemy:damaged', (payload) => {
      setTarget((prev) => {
        if (!prev || prev.id !== payload.id) return prev;
        if (payload.dead || payload.hp <= 0) return null;
        return { ...prev, hp: payload.hp, maxHp: payload.maxHp };
      });
    });
    return () => {
      offZone();
      offTarget();
      offDamaged();
      if (zoneTimerRef.current !== null) window.clearTimeout(zoneTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const c = portraitRef.current;
    if (!c || !dialogue) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(dialogue.portraitCanvas, 0, 0, 64, 64);
  }, [dialogue]);

  const bossPct = Math.max(0, Math.min(100, (hud.bossBar.hp / Math.max(1, hud.bossBar.maxHp)) * 100));
  const showTargetFrame = Boolean(target && !dialogue && !modalOpen);
  const targetPct = target ? Math.max(0, Math.min(100, (target.hp / Math.max(1, target.maxHp)) * 100)) : 0;

  return (
    <>
      {/* HUD Minimalista estilo Flyff: solo brújula circular permanente + elementos contextuales */}
      <div className="fixed inset-0 z-[500] pointer-events-none">
        {/* Top-Center: Target Frame del enemigo seleccionado / en auto-ataque */}
        {showTargetFrame && target && (
          <div id="target-frame" role="status" aria-live="polite">
            <div className="target-header">
              <span id="target-name">{target.name}</span>
              <span id="target-level">Nv.{target.level}</span>
            </div>
            <div className="target-bar">
              <div className="target-fill" style={{ width: `${targetPct}%` }} />
            </div>
            <div className="target-hp-text">
              {Math.max(0, Math.ceil(target.hp))}/{target.maxHp}
            </div>
          </div>
        )}

        {/* Banner temporal (3s) al entrar en una zona o aldea */}
        {zoneBanner && !hud.bossBar.visible && !showTargetFrame && (
          <div
            key={zoneBanner.key}
            className="absolute top-[max(18px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 rpg-panel px-5 py-1.5 text-center animate-zone-banner"
          >
            <div className="text-[9.5px] uppercase tracking-[0.22em] text-[#a0a0a0]">Zona</div>
            <div className="font-display text-sm font-bold text-[#c9a227] whitespace-nowrap">
              {zoneBanner.name}
            </div>
          </div>
        )}

        {/* Top-Center: Boss Bar (solo en encuentro con jefe) */}
        {hud.bossBar.visible && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-[min(320px,46vw)] flex flex-col gap-1.5 pointer-events-none ${
              showTargetFrame ? 'top-[78px]' : 'top-[max(14px,env(safe-area-inset-top))]'
            }`}
          >
            <div className="rpg-panel px-3 py-1.5 text-center">
              <div className="font-display text-xs font-bold text-[#fca5a5] tracking-wider mb-1">
                {hud.bossBar.name}
              </div>
              <div className="h-2.5 bg-[#121212] border border-[#555555] overflow-hidden">
                <div className="h-full bg-[#dc2626] transition-all duration-150" style={{ width: `${bossPct}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Top-Right: Minimapa Circular + Reloj discreto debajo */}
        <div className="absolute top-[max(10px,env(safe-area-inset-top))] right-[max(10px,env(safe-area-inset-right))] flex flex-col items-center pointer-events-none">
          <div className="pointer-events-auto">
            <Compass
              initialTown={hud.nearestTown}
              initialPos={hud.playerPos}
              worldSeed={hud.worldSeed}
              towns={hud.towns}
              onOpenWorldMap={onOpenWorldMap}
            />
          </div>
          <GameClock />
        </div>

        {/* Toast Notification */}
        {toast && (
          <div
            className={`rpg-panel absolute left-1/2 -translate-x-1/2 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-[#c9a227] whitespace-nowrap ${
              showTargetFrame ? 'top-[78px]' : 'top-[68px]'
            }`}
          >
            {toast}
          </div>
        )}

        {/* Bottom-Center: indicador discreto de interacción (NPC / cofre / cristal) */}
        {!dialogue && !modalOpen && hud.interactPrompt && (
          <div className="absolute bottom-[94px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
            <div className="rpg-panel px-3 py-1 text-[11px] font-bold text-[#c9a227] whitespace-nowrap">
              {hud.interactPrompt}
            </div>
          </div>
        )}

      </div>

      {/* NPC Dialogue Modal (fuera del stacking context del HUD, gestionado por WindowManager) */}
      {dialogue && (
        <div
          className="fixed inset-0 flex items-end justify-center pb-[max(20px,env(safe-area-inset-bottom))] px-3 bg-black/35 pointer-events-auto"
          style={{ zIndex: dialogZIndex }}
          onClick={() => onCloseDialogue?.()}
        >
          <div
            id="npc-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={dialogue.npcName}
            className="rpg-panel w-[min(560px,calc(100vw-24px))] p-4 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-3.5 items-start">
              <canvas
                ref={portraitRef}
                width={64}
                height={64}
                className="w-16 h-16 border-2 border-[#c9a227] bg-[#1a1a1a] shrink-0"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-display text-sm font-bold text-[#c9a227] truncate">{dialogue.npcName}</div>
                  {onCloseDialogue && (
                    <button
                      type="button"
                      onClick={onCloseDialogue}
                      aria-label="Cerrar diálogo"
                      title="Cerrar (Esc)"
                      className="rpg-btn-secondary p-1 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs sm:text-sm leading-relaxed text-[#e0e0e0] mb-3">{dialogue.text}</p>
                <div className="flex flex-wrap gap-2 justify-end max-h-[175px] overflow-y-auto pr-0.5">
                  {dialogue.buttons.map((b, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={b.disabled}
                      onClick={b.action}
                      className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 ${
                        b.disabled
                          ? 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
                          : b.secondary
                            ? 'rpg-btn-secondary cursor-pointer'
                            : 'rpg-btn-primary cursor-pointer'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
