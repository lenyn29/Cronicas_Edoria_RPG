import React, { useEffect, useRef, useState } from 'react';
import { HeroConfig } from '../game/Constants';
import { gameEventBus } from '../game/EventBus';
import { GearStyle } from '../game/types';
import { HeroPortraitCanvas } from './HeroPortraitCanvas';

interface StatusPanelProps {
  heroName: string;
  heroConfig: HeroConfig;
  helmetStyle: GearStyle | null;
  initialHp: number;
  initialMaxHp: number;
  initialMp: number;
  initialMaxMp: number;
  initialXp: number;
  initialXpNext: number;
  initialLevel: number;
  onOpenHeroModal: () => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = React.memo(({
  heroName,
  heroConfig,
  helmetStyle,
  initialHp,
  initialMaxHp,
  initialMp,
  initialMaxMp,
  initialXp,
  initialXpNext,
  initialLevel,
  onOpenHeroModal,
}) => {
  const [hp, setHp] = useState(initialHp);
  const [maxHp, setMaxHp] = useState(initialMaxHp);
  const [mp, setMp] = useState(initialMp);
  const [maxMp, setMaxMp] = useState(initialMaxMp);
  const [xp, setXp] = useState(initialXp);
  const [xpNext, setXpNext] = useState(initialXpNext);
  const [level, setLevel] = useState(initialLevel);
  const [hpFlashing, setHpFlashing] = useState(false);
  const [expFlashing, setExpFlashing] = useState(false);
  const [levelUpKey, setLevelUpKey] = useState(0);

  const hpFlashTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const prevHpRef = useRef<number>(initialHp);
  const prevXpRef = useRef<number>(initialXp);

  useEffect(() => {
    setHp(initialHp);
    setMaxHp(initialMaxHp);
    prevHpRef.current = initialHp;
  }, [initialHp, initialMaxHp]);

  useEffect(() => {
    setMp(initialMp);
    setMaxMp(initialMaxMp);
  }, [initialMp, initialMaxMp]);

  useEffect(() => {
    setXp(initialXp);
    setXpNext(initialXpNext);
    setLevel(initialLevel);
    prevXpRef.current = initialXp;
  }, [initialXp, initialXpNext, initialLevel]);

  useEffect(() => {
    const offHp = gameEventBus.on('player:healthChanged', (payload) => {
      if (payload.hp < prevHpRef.current) {
        setHpFlashing(true);
        if (hpFlashTimerRef.current !== null) window.clearTimeout(hpFlashTimerRef.current);
        hpFlashTimerRef.current = window.setTimeout(() => setHpFlashing(false), 180);
      }
      prevHpRef.current = payload.hp;
      setHp(payload.hp);
      setMaxHp(payload.maxHp);
    });

    const offMp = gameEventBus.on('player:manaChanged', (payload) => {
      setMp(payload.mp);
      setMaxMp(payload.maxMp);
    });

    const offExp = gameEventBus.on('player:expChanged', (payload) => {
      const gained = payload.xp > prevXpRef.current || payload.leveledUp;
      prevXpRef.current = payload.xp;
      setXp(payload.xp);
      setXpNext(payload.xpNext);
      setLevel(payload.level);

      if (gained) {
        setExpFlashing(true);
        if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setExpFlashing(false), 460);
      }

      if (payload.leveledUp) {
        setLevelUpKey((k) => k + 1);
        if (levelTimerRef.current !== null) window.clearTimeout(levelTimerRef.current);
        levelTimerRef.current = window.setTimeout(() => setLevelUpKey(0), 1950);
      }
    });

    return () => {
      offHp();
      offMp();
      offExp();
      if (hpFlashTimerRef.current !== null) window.clearTimeout(hpFlashTimerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      if (levelTimerRef.current !== null) window.clearTimeout(levelTimerRef.current);
    };
  }, []);

  const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
  const mpPct = Math.max(0, Math.min(100, (mp / Math.max(1, maxMp)) * 100));
  const expPct = Math.max(0, Math.min(100, (xp / Math.max(1, xpNext)) * 100));

  return (
    <>
      {levelUpKey > 0 && (
        <div
          key={levelUpKey}
          className="pointer-events-none fixed bottom-[88px] left-1/2 -translate-x-1/2 z-[500] px-3 py-1 bg-[#1a1a1a] border border-[#c9a227] font-display text-xs font-extrabold tracking-widest text-[#c9a227] whitespace-nowrap animate-level-up"
        >
          LEVEL UP
        </div>
      )}

      <div
        id="character-panel"
        role="button"
        tabIndex={0}
        onClick={onOpenHeroModal}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenHeroModal();
          }
        }}
        title={`HP ${Math.ceil(hp)}/${maxHp} · MP ${Math.floor(mp)}/${maxMp} · Abrir ficha del héroe (C)`}
        className="fixed top-4 left-4 z-[500] p-1.5 flex items-center gap-2 select-none cursor-pointer hover:border-[#888888] transition-colors"
      >
        <HeroPortraitCanvas
          id="portrait-canvas"
          config={heroConfig}
          helmetStyle={helmetStyle}
          size={56}
          className="rounded-[2px]"
        />

        <div id="character-info-mini" className="min-w-0 flex flex-col justify-center gap-1">
          <div className="char-header flex items-baseline gap-1.5 text-[12px] leading-none text-white">
            <span id="char-level" className="font-mono-num font-bold text-[#c9a227] shrink-0">
              Lv. {level}
            </span>
            <span id="char-name" className="font-semibold truncate max-w-[66px]">
              {heroName || 'Vagabundo'}
            </span>
          </div>

          <div
            className={`mini-bar hp ${hpFlashing ? 'flash' : ''}`}
            title={`HP: ${Math.ceil(hp)}/${maxHp}`}
          >
            <div className="fill" style={{ width: `${hpPct}%` }} />
          </div>

          <div className="mini-bar mp" title={`MP: ${Math.floor(mp)}/${maxMp}`}>
            <div className="fill" style={{ width: `${mpPct}%` }} />
          </div>

          <div
            className={`mini-bar exp ${expFlashing ? 'animate-exp-flash' : ''}`}
            title={`EXP: ${xp}/${xpNext} (${expPct.toFixed(1)}%)`}
          >
            <div className="fill" style={{ width: `${expPct}%` }} />
          </div>
        </div>
      </div>
    </>
  );
});
