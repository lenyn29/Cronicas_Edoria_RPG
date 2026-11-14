import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterCreatorScene } from '../game/CharacterCreatorScene';
import { HeroConfig } from '../game/Constants';
import {
  CLOTH_COLOR_SWATCHES,
  ClothColorId,
  HAIR_COLOR_SWATCHES,
  HAIR_STYLE_OPTIONS,
  HairColorId,
  HairStyleId,
  HeroGender,
  SKIN_TONE_SWATCHES,
  SkinToneId,
} from '../game/core/Palette';
import { DEFAULT_WORLD_SEED } from '../game/worldMath';

interface CharacterCreatorModalProps {
  open: boolean;
  mode: 'initial' | 'edit';
  initialConfig: HeroConfig;
  initialName: string;
  initialSeed: string;
  hasSavedGame: boolean;
  onConfirm: (heroName: string, seed: string, config: HeroConfig) => void;
  onContinueSaved?: () => void;
  onCancel?: () => void;
}

const SKIN_KEYS = Object.keys(SKIN_TONE_SWATCHES) as SkinToneId[];
const HAIR_KEYS = Object.keys(HAIR_COLOR_SWATCHES) as HairColorId[];
const CLOTH_KEYS = Object.keys(CLOTH_COLOR_SWATCHES) as ClothColorId[];

export function CharacterCreatorModal({
  open,
  mode,
  initialConfig,
  initialName,
  initialSeed,
  hasSavedGame,
  onConfirm,
  onContinueSaved,
  onCancel,
}: CharacterCreatorModalProps) {
  const previewMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CharacterCreatorScene | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [config, setConfig] = useState<HeroConfig>(initialConfig);
  const [hoverConfig, setHoverConfig] = useState<HeroConfig | null>(null);
  const [heroName, setHeroName] = useState<string>(initialName || 'Aelion');
  const [seed, setSeed] = useState<string>(initialSeed || DEFAULT_WORLD_SEED);

  useEffect(() => {
    if (!open) return;
    setConfig(initialConfig);
    setHoverConfig(null);
    setHeroName(initialName || 'Aelion');
    setSeed(initialSeed || DEFAULT_WORLD_SEED);
  }, [open, initialConfig, initialName, initialSeed]);

  useEffect(() => {
    if (!open) return;
    const el = previewMountRef.current;
    if (!el) return;

    const scene = new CharacterCreatorScene(el, initialConfig);
    sceneRef.current = scene;

    let resizeRaf = 0;
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (resizeRaf) cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(() => {
              resizeRaf = 0;
              scene.resize();
            });
          })
        : null;
    ro?.observe(el);

    return () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      ro?.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [open]);

  const activePreview = hoverConfig ?? config;
  const isHoverPreview = hoverConfig !== null;

  useEffect(() => {
    if (!open || !sceneRef.current) return;
    sceneRef.current.setConfig(activePreview, !isHoverPreview);
  }, [open, activePreview, isHoverPreview]);

  const commitPatch = useCallback((patch: Partial<HeroConfig>) => {
    setHoverConfig(null);
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const previewPatch = useCallback((patch: Partial<HeroConfig>) => {
    setHoverConfig({ ...config, ...patch });
  }, [config]);

  const clearPreview = useCallback(() => setHoverConfig(null), []);

  const randomizeSeed = useCallback(() => {
    const num = Math.floor(10000 + Math.random() * 89999);
    setSeed(`ELDORIA-${num}`);
  }, []);

  const randomizeAppearance = useCallback(() => {
    const genders: HeroGender[] = ['male', 'female'];
    const styles: HairStyleId[] = ['messy', 'short', 'long', 'bald'];
    setHoverConfig(null);
    setConfig({
      gender: genders[Math.floor(Math.random() * genders.length)],
      skinTone: SKIN_KEYS[Math.floor(Math.random() * SKIN_KEYS.length)],
      hairColor: HAIR_KEYS[Math.floor(Math.random() * HAIR_KEYS.length)],
      clothColor: CLOTH_KEYS[Math.floor(Math.random() * CLOTH_KEYS.length)],
      hairStyle: styles[Math.floor(Math.random() * styles.length)],
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const cleanName = heroName.trim() || 'Aelion';
    const cleanSeed = seed.trim() || DEFAULT_WORLD_SEED;
    onConfirm(cleanName, cleanSeed, config);
  }, [heroName, seed, config, onConfirm]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === 'Escape' && mode === 'edit' && onCancel) {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === 'Enter' && inInput) {
        e.preventDefault();
        handleConfirm();
        return;
      }

      if (inInput) return;

      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp'
      ) {
        const container = rootRef.current;
        if (!container) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
        );
        if (focusables.length === 0) return;
        e.preventDefault();
        const curIdx = focusables.indexOf(document.activeElement as HTMLElement);
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx =
          curIdx === -1 ? 0 : (curIdx + step + focusables.length) % focusables.length;
        focusables[nextIdx]?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, mode, onCancel, handleConfirm]);

  useEffect(() => {
    if (!open) return;
    let rafId = 0;
    let lastMoveAt = 0;
    let prevA = false;
    let prevB = false;

    const pollGamepad = (now: number) => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads?.[0];
      if (pad && rootRef.current) {
        const focusables = Array.from(
          rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
        );
        if (focusables.length > 0) {
          const ax = pad.axes[0] ?? 0;
          const ay = pad.axes[1] ?? 0;
          const up = pad.buttons[12]?.pressed || ay < -0.55;
          const down = pad.buttons[13]?.pressed || ay > 0.55;
          const left = pad.buttons[14]?.pressed || ax < -0.55;
          const right = pad.buttons[15]?.pressed || ax > 0.55;

          if ((up || down || left || right) && now - lastMoveAt > 180) {
            lastMoveAt = now;
            const curIdx = focusables.indexOf(document.activeElement as HTMLElement);
            const delta = right || down ? 1 : -1;
            const nextIdx = curIdx === -1 ? 0 : (curIdx + delta + focusables.length) % focusables.length;
            focusables[nextIdx]?.focus();
          }

          const btnA = !!pad.buttons[0]?.pressed;
          if (btnA && !prevA) {
            const active = document.activeElement as HTMLElement | null;
            if (active && rootRef.current.contains(active) && active.tagName === 'BUTTON') {
              active.click();
            } else {
              handleConfirm();
            }
          }
          prevA = btnA;

          const btnB = !!pad.buttons[1]?.pressed;
          if (btnB && !prevB && mode === 'edit' && onCancel) {
            onCancel();
          }
          prevB = btnB;
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };

    rafId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(rafId);
  }, [open, mode, onCancel, handleConfirm]);

  const activeSkinLabel = useMemo(() => SKIN_TONE_SWATCHES[activePreview.skinTone].label, [activePreview.skinTone]);
  const activeHairLabel = useMemo(() => HAIR_COLOR_SWATCHES[activePreview.hairColor].label, [activePreview.hairColor]);
  const activeClothLabel = useMemo(() => CLOTH_COLOR_SWATCHES[activePreview.clothColor].label, [activePreview.clothColor]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'initial' ? 'Creación de personaje' : 'Personalizar apariencia del héroe'}
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 bg-black/80 overflow-y-auto"
    >
      <div className="rpg-panel max-w-4xl w-full p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 my-auto">
        {/* Columna izquierda: Vista previa 3D */}
        <div className="md:col-span-5 flex flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#c9a227] tracking-wide leading-tight">
                {mode === 'initial' ? 'Crónicas de Eldoria' : 'Aspecto del Héroe'}
              </h1>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#a0a0a0]">
                {mode === 'initial' ? 'Forja tu Vagabundo · Mundo 3D' : 'Personalización en vivo'}
              </p>
            </div>
            <button
              type="button"
              onClick={randomizeAppearance}
              aria-label="Aleatorizar apariencia del héroe"
              className="rpg-btn-secondary px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
            >
              Azar
            </button>
          </div>

          <div className="relative flex-1 min-h-[280px] sm:min-h-[360px] bg-[#141414] border border-[#555555] overflow-hidden">
            <div ref={previewMountRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center">
              <span className="px-3 py-1 bg-[#1a1a1a] border border-[#555555] text-[11px] text-[#e0e0e0]">
                Arrastra para girar 360°
              </span>
            </div>
          </div>

          {mode === 'initial' && (
            <p className="mt-2.5 text-[11px] text-[#a0a0a0] leading-snug">
              Inicias como un vagabundo sin armas ni armadura. Explora 5 biomas, habla con los aldeanos (F) y forja tu leyenda.
            </p>
          )}
        </div>

        {/* Columna derecha: Controles */}
        <div className="md:col-span-7 flex flex-col justify-between gap-3.5">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rpg-subpanel px-3 py-2">
                <label
                  htmlFor="cc-hero-name"
                  className="block text-[10.5px] font-bold uppercase tracking-wider text-[#c9a227] mb-1"
                >
                  Nombre del Héroe
                </label>
                <input
                  id="cc-hero-name"
                  type="text"
                  value={heroName}
                  maxLength={18}
                  onChange={(e) => setHeroName(e.target.value)}
                  className="w-full bg-transparent text-sm font-display font-bold text-[#e0e0e0] outline-none border-b border-[#555555] focus:border-[#c9a227] pb-0.5"
                  placeholder="Aelion"
                />
              </div>

              {mode === 'initial' && (
                <div className="rpg-subpanel px-3 py-2">
                  <label
                    htmlFor="cc-world-seed"
                    className="block text-[10.5px] font-bold uppercase tracking-wider text-[#c9a227] mb-1"
                  >
                    Semilla del Mundo
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="cc-world-seed"
                      type="text"
                      value={seed}
                      maxLength={28}
                      onChange={(e) => setSeed(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-xs font-mono-num text-[#e0e0e0] outline-none border-b border-[#555555] focus:border-[#c9a227] pb-0.5"
                      placeholder={DEFAULT_WORLD_SEED}
                    />
                    <button
                      type="button"
                      onClick={randomizeSeed}
                      aria-label="Generar semilla aleatoria"
                      className="rpg-btn-secondary px-2 py-0.5 text-[10.5px] font-semibold cursor-pointer shrink-0"
                    >
                      Aleatoria
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Género */}
            <div className="rpg-subpanel p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9a227]">
                  Silueta / Género
                </span>
                <span className="text-[11px] text-[#a0a0a0]">
                  {activePreview.gender === 'male' ? 'Masculino' : 'Femenino'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['male', 'female'] as HeroGender[]).map((g) => {
                  const selected = config.gender === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Género ${g === 'male' ? 'Masculino' : 'Femenino'}`}
                      onMouseEnter={() => previewPatch({ gender: g })}
                      onFocus={() => previewPatch({ gender: g })}
                      onMouseLeave={clearPreview}
                      onBlur={clearPreview}
                      onClick={() => commitPatch({ gender: g })}
                      className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold cursor-pointer border ${
                        selected
                          ? 'bg-[#2a2a2a] border-[#c9a227] text-[#c9a227]'
                          : 'bg-[#1a1a1a] border-[#555555] text-[#e0e0e0] hover:border-[#888888]'
                      }`}
                    >
                      {g === 'male' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                          <circle cx="10" cy="14" r="5" />
                          <path d="M14 10l6-6m0 0h-5m5 0v5" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                          <circle cx="12" cy="9" r="5" />
                          <path d="M12 14v7m-3-3h6" />
                        </svg>
                      )}
                      <span>{g === 'male' ? 'Masculino' : 'Femenino'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tono de Piel */}
            <div className="rpg-subpanel p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9a227]">Tono de Piel</span>
                <span className="text-[11px] text-[#e0e0e0]">{activeSkinLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {SKIN_KEYS.map((id) => {
                  const sw = SKIN_TONE_SWATCHES[id];
                  const selected = config.skinTone === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={sw.label}
                      title={sw.label}
                      onMouseEnter={() => previewPatch({ skinTone: id })}
                      onFocus={() => previewPatch({ skinTone: id })}
                      onMouseLeave={clearPreview}
                      onBlur={clearPreview}
                      onClick={() => commitPatch({ skinTone: id })}
                      style={{ backgroundColor: sw.cssHex }}
                      className={`w-9 h-9 cursor-pointer flex items-center justify-center border-2 ${
                        selected ? 'border-[#c9a227]' : 'border-[#111111]'
                      }`}
                    >
                      {selected && (
                        <span className="text-xs font-extrabold text-[#111111] bg-white/80 px-1 leading-tight">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Estilo y Color de Cabello */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rpg-subpanel p-2.5">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-[#c9a227] mb-1.5">
                  Estilo de Cabello
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {HAIR_STYLE_OPTIONS.map((opt) => {
                    const selected = config.hairStyle === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`Cabello ${opt.label}`}
                        onMouseEnter={() => previewPatch({ hairStyle: opt.id })}
                        onFocus={() => previewPatch({ hairStyle: opt.id })}
                        onMouseLeave={clearPreview}
                        onBlur={clearPreview}
                        onClick={() => commitPatch({ hairStyle: opt.id })}
                        className={`py-1.5 px-2 text-[11.5px] font-semibold cursor-pointer border ${
                          selected
                            ? 'bg-[#2a2a2a] border-[#c9a227] text-[#c9a227]'
                            : 'bg-[#1a1a1a] border-[#555555] text-[#e0e0e0] hover:border-[#888888]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rpg-subpanel p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9a227]">
                    Color de Pelo
                  </span>
                  <span className="text-[11px] text-[#e0e0e0] truncate max-w-[110px]">{activeHairLabel}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {HAIR_KEYS.map((id) => {
                    const sw = HAIR_COLOR_SWATCHES[id];
                    const selected = config.hairColor === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`Pelo ${sw.label}`}
                        title={sw.label}
                        onMouseEnter={() => previewPatch({ hairColor: id })}
                        onFocus={() => previewPatch({ hairColor: id })}
                        onMouseLeave={clearPreview}
                        onBlur={clearPreview}
                        onClick={() => commitPatch({ hairColor: id })}
                        style={{ backgroundColor: sw.cssHex }}
                        className={`w-8 h-8 cursor-pointer flex items-center justify-center border-2 ${
                          selected ? 'border-[#c9a227]' : 'border-[#111111]'
                        }`}
                      >
                        {selected && (
                          <span className="text-[10px] font-extrabold text-[#111111] bg-white/80 px-1 leading-tight">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Color de Túnica */}
            <div className="rpg-subpanel p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9a227]">
                  Túnica de Vagabundo
                </span>
                <span className="text-[11px] text-[#e0e0e0]">{activeClothLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {CLOTH_KEYS.map((id) => {
                  const sw = CLOTH_COLOR_SWATCHES[id];
                  const selected = config.clothColor === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Túnica ${sw.label}`}
                      title={sw.label}
                      onMouseEnter={() => previewPatch({ clothColor: id })}
                      onFocus={() => previewPatch({ clothColor: id })}
                      onMouseLeave={clearPreview}
                      onBlur={clearPreview}
                      onClick={() => commitPatch({ clothColor: id })}
                      style={{ backgroundColor: sw.cssHex }}
                      className={`px-2.5 py-1.5 cursor-pointer flex items-center gap-1.5 border-2 text-[11px] font-semibold text-[#e0e0e0] ${
                        selected ? 'border-[#c9a227]' : 'border-[#111111]'
                      }`}
                    >
                      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {selected ? `✓ ${sw.label.split(' ')[0]}` : sw.label.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-1 flex flex-wrap items-center justify-end gap-2.5">
            {mode === 'initial' && hasSavedGame && onContinueSaved && (
              <button
                type="button"
                onClick={onContinueSaved}
                className="rpg-btn-secondary px-5 py-2.5 font-display text-sm font-bold cursor-pointer whitespace-nowrap"
              >
                Continuar partida
              </button>
            )}
            {mode === 'edit' && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rpg-btn-secondary px-5 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className="rpg-btn-primary px-7 py-2.5 font-display text-sm sm:text-base font-extrabold tracking-wider cursor-pointer whitespace-nowrap"
            >
              {mode === 'initial' ? 'Comenzar aventura' : 'Guardar apariencia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
