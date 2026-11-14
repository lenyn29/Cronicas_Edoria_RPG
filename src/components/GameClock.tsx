import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { TIME } from '../game/Constants';
import { formatGameTime, resolveDayPhase } from '../game/DayNightCycle';
import { gameEventBus } from '../game/EventBus';

interface ClockDisplayState {
  formatted: string;
  isNight: boolean;
  phaseLabel: string;
}

export const GameClock: React.FC = React.memo(() => {
  const [clock, setClock] = useState<ClockDisplayState>(() => {
    const t = formatGameTime(TIME.DAY_START_HOUR);
    const p = resolveDayPhase(TIME.DAY_START_HOUR);
    return {
      formatted: t.formatted,
      isNight: p.isNight,
      phaseLabel: p.label,
    };
  });

  useEffect(() => {
    return gameEventBus.on('time:minuteChanged', (snap) => {
      setClock((prev) => {
        if (
          prev.formatted === snap.formatted &&
          prev.isNight === snap.isNight &&
          prev.phaseLabel === snap.phaseLabel
        ) {
          return prev;
        }
        return {
          formatted: snap.formatted,
          isNight: snap.isNight,
          phaseLabel: snap.phaseLabel,
        };
      });
    });
  }, []);

  return (
    <div
      id="game-clock"
      title={clock.phaseLabel}
      className="pointer-events-none select-none mt-1 flex items-center justify-center gap-1 text-[11px] font-mono-num font-semibold text-[#f1f5f9] tracking-wide"
      style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.75)' }}
    >
      {clock.isNight ? (
        <Moon className="w-3 h-3 text-[#bfdbfe]" aria-hidden="true" />
      ) : (
        <Sun className="w-3 h-3 text-[#fde68a]" aria-hidden="true" />
      )}
      <span>{clock.formatted}</span>
    </div>
  );
});
