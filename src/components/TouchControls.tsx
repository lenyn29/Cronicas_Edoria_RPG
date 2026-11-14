import React, { useCallback, useEffect, useRef, useState } from 'react';

interface TouchControlsProps {
  visible: boolean;
  onJoystickMove: (nx: number, ny: number) => void;
}

export const TouchControls: React.FC<TouchControlsProps> = React.memo(({
  visible,
  onJoystickMove,
}) => {
  const joyZoneRef = useRef<HTMLDivElement | null>(null);
  const joyPointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const resetJoy = useCallback(() => {
    const pid = joyPointerId.current;
    joyPointerId.current = null;
    if (pid !== null && joyZoneRef.current) {
      try {
        if (joyZoneRef.current.hasPointerCapture(pid)) {
          joyZoneRef.current.releasePointerCapture(pid);
        }
      } catch {
        // Ignore if element is already unmounted or capture expired
      }
    }
    setKnobOffset({ x: 0, y: 0 });
    onJoystickMove(0, 0);
  }, [onJoystickMove]);

  useEffect(() => {
    if (!visible) {
      resetJoy();
    }
  }, [visible, resetJoy]);

  useEffect(() => {
    const handleGlobalPointerEnd = (e: PointerEvent) => {
      if (e.pointerId === joyPointerId.current) {
        resetJoy();
      }
    };
    const handleBlur = () => {
      resetJoy();
    };
    window.addEventListener('pointerup', handleGlobalPointerEnd);
    window.addEventListener('pointercancel', handleGlobalPointerEnd);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd);
      window.removeEventListener('pointercancel', handleGlobalPointerEnd);
      window.removeEventListener('blur', handleBlur);
    };
  }, [resetJoy]);

  if (!visible) return null;

  const updateJoy = (clientX: number, clientY: number) => {
    const el = joyZoneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxRadius = Math.max(32, rect.width * 0.34);
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    onJoystickMove(dx / maxRadius, dy / maxRadius);
  };

  return (
    <div className="fixed inset-0 z-[500] pointer-events-none select-none">
      {/* Área táctil 20% más grande alrededor del joystick visible (130px móvil / 100px escritorio) */}
      <div
        ref={joyZoneRef}
        onPointerDown={(e) => {
          e.preventDefault();
          if (joyPointerId.current !== null) return;
          joyPointerId.current = e.pointerId;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Pointer capture fallback handled by window listeners
          }
          updateJoy(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== joyPointerId.current) return;
          e.preventDefault();
          updateJoy(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerId === joyPointerId.current) resetJoy();
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === joyPointerId.current) resetJoy();
        }}
        onLostPointerCapture={() => {
          if (joyPointerId.current !== null) resetJoy();
        }}
        className="absolute bottom-[max(7px,calc(env(safe-area-inset-bottom)+7px))] left-[max(7px,calc(env(safe-area-inset-left)+7px))] w-[156px] h-[156px] md:w-[120px] md:h-[120px] pointer-events-auto touch-none"
      >
        <div
          className="absolute left-1/2 top-1/2 w-[130px] h-[130px] md:w-[100px] md:h-[100px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#e8c170]/55 shadow-lg"
          style={{ background: 'radial-gradient(circle, rgba(20,24,36,0.45), rgba(10,12,18,0.78))' }}
        />
        <div
          className="absolute left-1/2 top-1/2 w-[54px] h-[54px] md:w-[44px] md:h-[44px] rounded-full border-2 border-[#fff0c2] shadow-md"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #f5d88e, #9c7228)',
            transform: `translate(calc(-50% + ${knobOffset.x}px), calc(-50% + ${knobOffset.y}px))`,
          }}
        />
      </div>
    </div>
  );
});
