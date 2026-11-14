import React, { useState } from 'react';
import {
  Crosshair,
  Heart,
  Lock,
  Shield,
  Sparkles,
  Sword,
  User,
  Wand2,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { HeroConfig } from '../game/Constants';
import { formatOsrsQty, getItemSpriteUrl, getSlotPlaceholderUrl } from '../game/itemSprites';
import {
  formatGearStats,
  GEAR_SLOT_LABEL,
  GEAR_SLOT_ORDER,
  getGearDef,
  getGearStyle,
  RARITY_COLOR,
  RARITY_LABEL,
} from '../game/lootTable';
import {
  BRANCH_META,
  isSkillUnlocked,
  SKILL_NODE_MAP,
  SKILL_TREE_NODES,
  SPELL_DEFS,
} from '../game/skillTree';
import { GearSlot, HeroTab, HudSnapshot, InventoryItem, SkillKey, SpellId } from '../game/types';
import { HeroPortraitCanvas } from './HeroPortraitCanvas';

interface HeroModalProps {
  open: boolean;
  zIndex?: number;
  activeTab: HeroTab;
  hud: HudSnapshot;
  heroConfig: HeroConfig;
  onChangeTab: (tab: HeroTab) => void;
  onAllocateSkill: (key: SkillKey) => void;
  onUseItem: (id: string) => void;
  onUseSlot: (slotIndex: number) => void;
  onEquipGear: (slot: GearSlot, id: string) => void;
  onUnequipGear: (slot: GearSlot) => void;
  onSelectSpell: (spellId: SpellId) => void;
  onOpenInventory: () => void;
  onClose: () => void;
  onBackdropClick?: () => void;
}

const SKILL_ICON: Record<SkillKey, React.FC<{ className?: string }>> = {
  sword: Sword,
  atkSpeed: Zap,
  crit: Crosshair,
  vitality: Heart,
  elemResist: Shield,
  agility: Wind,
  magic: Sparkles,
  spellMastery: Wand2,
};

const CATEGORY_LABEL: Record<InventoryItem['category'], string> = {
  gear: 'Equipo',
  consumable: 'Consumible',
  material: 'Material',
  relic: 'Reliquia',
  currency: 'Moneda',
};

export const HeroModal: React.FC<HeroModalProps> = React.memo(({
  open,
  zIndex = 1000,
  activeTab,
  hud,
  heroConfig,
  onChangeTab,
  onAllocateSkill,
  onUseSlot,
  onEquipGear,
  onUnequipGear,
  onSelectSpell,
  onOpenInventory,
  onClose,
  onBackdropClick,
}) => {
  const [selectedSkill, setSelectedSkill] = useState<SkillKey>('sword');

  if (!open) return null;

  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const mpPct = Math.max(0, Math.min(100, (hud.mp / Math.max(1, hud.maxMp)) * 100));
  const xpPct = Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpNext)) * 100));

  const selNode = SKILL_NODE_MAP[selectedSkill] ?? SKILL_TREE_NODES[0];
  const selRank = hud.skills[selNode.key] ?? 0;
  const selUnlocked = isSkillUnlocked(selNode.key, hud.skills);
  const selMaxed = selRank >= selNode.maxRank;
  const canUpgradeSel = hud.skillPoints > 0 && selUnlocked && !selMaxed;

  const equippedCount = GEAR_SLOT_ORDER.filter((slot) => hud.equipped[slot] !== null).length;
  const usedSlots = hud.inventorySlots.filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 bg-black/75 pointer-events-auto"
      style={{ zIndex }}
      onClick={() => (onBackdropClick ? onBackdropClick() : onClose())}
    >
      <div
        id="hero-window"
        role="dialog"
        aria-modal="true"
        aria-label="Ficha del Héroe"
        className="rpg-panel w-full max-w-[640px] max-h-[89vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (sin contador de oro) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#555555] bg-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#2a2a2a] border border-[#c9a227] flex items-center justify-center text-[#c9a227]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-[#c9a227] leading-tight">
                {hud.heroName || 'Aelion'} · Nivel <span className="font-mono-num">{hud.level}</span>
              </h2>
              <p className="text-[11px] text-[#a0a0a0]">
                {hud.biomeName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rpg-btn-secondary p-1.5 cursor-pointer"
            aria-label="Cerrar panel del héroe"
            title="Cerrar (C / Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 gap-1.5 px-4 py-2 bg-[#161616] border-b border-[#555555]">
          <button
            type="button"
            onClick={() => onChangeTab('info')}
            className={`py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap ${
              activeTab === 'info' ? 'rpg-btn-primary' : 'rpg-btn-secondary'
            }`}
          >
            Información
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('equipment')}
            className={`py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap ${
              activeTab === 'equipment' ? 'rpg-btn-primary' : 'rpg-btn-secondary'
            }`}
          >
            Equipo ({equippedCount}/6)
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('inventory')}
            className={`py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap ${
              activeTab === 'inventory' ? 'rpg-btn-primary' : 'rpg-btn-secondary'
            }`}
          >
            Mochila ({usedSlots}/{hud.inventoryCapacity})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('skills')}
            className={`py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap ${
              activeTab === 'skills' ? 'rpg-btn-primary' : 'rpg-btn-secondary'
            }`}
          >
            Habilidades{hud.skillPoints > 0 ? ` (${hud.skillPoints})` : ''}
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 overflow-y-auto space-y-3">
          {activeTab === 'info' && (
            <>
              <div className="rpg-subpanel p-3 flex flex-col sm:flex-row items-center gap-3.5">
                <HeroPortraitCanvas
                  config={heroConfig}
                  helmetStyle={getGearStyle(hud.equipped.helmet)}
                  size={128}
                />

                <div className="w-full flex-1 space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs text-[#b8b8b8] mb-1">
                      <span>Vida</span>
                      <span className="font-mono-num text-[#e0e0e0] font-semibold">
                        {Math.ceil(hud.hp)} / {hud.maxHp}
                      </span>
                    </div>
                    <div className="h-2 bg-[#121212] border border-[#555555] overflow-hidden">
                      <div className="h-full bg-[#dc2626]" style={{ width: `${hpPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-[#b8b8b8] mb-1">
                      <span>Maná</span>
                      <span className="font-mono-num text-[#e0e0e0] font-semibold">
                        {Math.floor(hud.mp)} / {hud.maxMp}
                      </span>
                    </div>
                    <div className="h-2 bg-[#121212] border border-[#555555] overflow-hidden">
                      <div className="h-full bg-[#2563eb]" style={{ width: `${mpPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-[#b8b8b8] mb-1">
                      <span>Experiencia</span>
                      <span className="font-mono-num text-[#e0e0e0] font-semibold">
                        {hud.xp} / {hud.xpNext}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#121212] border border-[#555555] overflow-hidden">
                      <div className="h-full bg-[#c9a227]" style={{ width: `${xpPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Ataque Físico</div>
                  <div className="font-mono-num text-base font-bold text-[#c9a227]">{hud.atkDmg}</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Poder Mágico</div>
                  <div className="font-mono-num text-base font-bold text-[#38bdf8]">{hud.magDmg}</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Defensa</div>
                  <div className="font-mono-num text-base font-bold text-[#86efac]">{hud.def}</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Vel. Ataque</div>
                  <div className="font-mono-num text-base font-bold text-[#fb923c]">+{hud.atkSpeedPct}%</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Prob. Crítico</div>
                  <div className="font-mono-num text-base font-bold text-[#fbbf24]">{hud.critChancePct}%</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Res. Elemental</div>
                  <div className="font-mono-num text-base font-bold text-[#2dd4bf]">{hud.elemResistPct}%</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Velocidad</div>
                  <div className="font-mono-num text-base font-bold text-[#7dd3fc]">{hud.moveSpeed}</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Enemigos Vencidos</div>
                  <div className="font-mono-num text-base font-bold text-[#e0e0e0]">{hud.kills}</div>
                </div>
                <div className="rpg-subpanel p-2.5">
                  <div className="text-[11px] text-[#a0a0a0]">Jefes de Bioma</div>
                  <div className="font-mono-num text-sm font-bold mt-0.5 text-[#e0e0e0]">
                    {hud.defeatedBiomeBosses}/5 biomas
                  </div>
                </div>
              </div>

              {/* Equipo Activo */}
              <div className="rpg-subpanel p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9a227]">
                    Equipo Activo
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeTab('equipment')}
                    className="text-[11px] font-semibold text-[#c9a227] hover:underline cursor-pointer"
                  >
                    Gestionar equipo →
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {GEAR_SLOT_ORDER.map((slot) => {
                    const eqId = hud.equipped[slot];
                    const eqName = hud.equippedNames[slot];
                    const def = eqId ? getGearDef(eqId) : null;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => onChangeTab('equipment')}
                        className="flex flex-col items-center gap-1 bg-[#262626] border border-[#555555] hover:border-[#c9a227] p-1.5 cursor-pointer"
                        title={eqName ?? `${GEAR_SLOT_LABEL[slot]}: Vacío`}
                      >
                        <img
                          src={eqId ? getItemSpriteUrl(eqId) : getSlotPlaceholderUrl(slot)}
                          alt={eqName ?? GEAR_SLOT_LABEL[slot]}
                          width={28}
                          height={28}
                          className={`w-7 h-7 ${eqId ? '' : 'opacity-35'}`}
                          style={{ imageRendering: 'pixelated' }}
                        />
                        <span
                          className="text-[10px] font-semibold truncate w-full text-center"
                          style={{ color: def ? RARITY_COLOR[def.rarity] : '#808080' }}
                        >
                          {GEAR_SLOT_LABEL[slot]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grimorio */}
              <div className="rpg-subpanel p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7dd3fc]">
                    Grimorio del Mago Theron
                  </span>
                  <span className="font-mono-num text-[11px] text-[#a0a0a0]">{hud.learnedSpells.length}/3 hechizos</span>
                </div>
                {hud.learnedSpells.length === 0 ? (
                  <p className="text-xs text-[#a0a0a0]">
                    Aún no conoces conjuros. Habla con el <span className="text-[#7dd3fc] font-semibold">Mago Theron</span> en la aldea para aprender magia.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {hud.learnedSpells.map((sid) => {
                      const sp = SPELL_DEFS[sid];
                      const active = hud.activeSpell === sid;
                      return (
                        <button
                          key={sid}
                          type="button"
                          onClick={() => onSelectSpell(sid)}
                          className={`text-left px-2.5 py-2 border cursor-pointer ${
                            active
                              ? 'bg-[#2a2a2a] border-[#c9a227] text-[#e0e0e0]'
                              : 'bg-[#121212] border-[#555555] text-[#b8b8b8] hover:border-[#888888]'
                          }`}
                        >
                          <div className="text-xs font-bold" style={{ color: sp.uiColor }}>{sp.name}</div>
                          <div className="text-[10px] text-[#909090] font-mono-num">
                            {sp.manaCost} PM {active ? '· Activo' : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rpg-subpanel p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#c9a227] mb-1">Misión Activa</div>
                <div className="text-sm font-bold text-[#e0e0e0]">{hud.questTitle}</div>
                <div className="text-xs text-[#a0a0a0] mt-0.5">{hud.questDesc}</div>
              </div>
            </>
          )}

          {activeTab === 'equipment' && (
            <div className="space-y-2.5">
              <div className="rpg-subpanel px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#b8b8b8]">
                <span>Cada pieza equipada cambia tu apariencia y suma estadísticas.</span>
                <span className="font-mono-num font-bold text-[#c9a227]">
                  ATQ {hud.atkDmg} · DEF {hud.def} · VEL {hud.moveSpeed}
                </span>
              </div>

              {GEAR_SLOT_ORDER.map((slot) => {
                const eqId = hud.equipped[slot];
                const eqSnapshot = eqId ? hud.forgeItems.find((fi) => fi.id === eqId) ?? null : null;
                const eqDef = eqId ? getGearDef(eqId) : null;
                const isOffhandSlot = slot === 'offhand';
                const ownedForSlot = isOffhandSlot
                  ? hud.forgeItems.filter((fi) => fi.owned && fi.slot === 'weapon' && fi.weaponKind === 'dagger')
                  : hud.forgeItems.filter((fi) => fi.slot === slot && fi.owned);

                return (
                  <div
                    key={slot}
                    className="rpg-subpanel p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 bg-[#262626] border border-[#555555] flex items-center justify-center shrink-0">
                          <img
                            src={eqId ? getItemSpriteUrl(eqId) : getSlotPlaceholderUrl(slot)}
                            alt={GEAR_SLOT_LABEL[slot]}
                            width={34}
                            height={34}
                            className={`w-8 h-8 ${eqId ? '' : 'opacity-35'}`}
                            style={{ imageRendering: 'pixelated' }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#909090]">
                            {GEAR_SLOT_LABEL[slot]}
                          </div>
                          {eqDef ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-sm font-bold truncate"
                                  style={{ color: RARITY_COLOR[eqDef.rarity] }}
                                >
                                  {eqSnapshot?.name ?? eqDef.name}
                                </span>
                                <span className="text-[10px] text-[#909090]">
                                  {RARITY_LABEL[eqDef.rarity]}
                                </span>
                              </div>
                              <div className="text-xs text-[#86efac] font-semibold">
                                {formatGearStats(eqDef, eqSnapshot?.upgradeLevel ?? 0, isOffhandSlot)}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-[#808080]">
                              {isOffhandSlot
                                ? 'Solo dagas (50% daño · +100% vel. ataque)'
                                : 'Sin equipar — Visita a Kael o a la Herrera Lyra'}
                            </div>
                          )}
                        </div>
                      </div>

                      {eqId && (
                        <button
                          type="button"
                          onClick={() => onUnequipGear(slot)}
                          className="rpg-btn-secondary px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    {ownedForSlot.length > 0 && (
                      <div className="pt-2 border-t border-[#444444] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {ownedForSlot.map((piece) => {
                          const isEq = eqId === piece.id;
                          const usedInMainOnly =
                            isOffhandSlot && hud.equipped.weapon === piece.id && piece.ownedQty < 2;
                          const usedInOffOnly =
                            slot === 'weapon' && hud.equipped.offhand === piece.id && piece.ownedQty < 2;
                          const needsSecondCopy = !isEq && (usedInMainOnly || usedInOffOnly);
                          const pieceDef = getGearDef(piece.id);
                          const pieceStats =
                            isOffhandSlot && pieceDef
                              ? formatGearStats(pieceDef, piece.upgradeLevel, true)
                              : piece.statsText;

                          return (
                            <button
                              key={piece.id}
                              type="button"
                              disabled={needsSecondCopy}
                              onClick={() => (isEq ? onUnequipGear(slot) : onEquipGear(slot, piece.id))}
                              className={`flex items-center gap-2 px-2.5 py-1.5 border text-left ${
                                isEq
                                  ? 'bg-[#2a2a2a] border-[#c9a227] text-[#e0e0e0] cursor-pointer'
                                  : needsSecondCopy
                                    ? 'bg-[#161616] border-[#444444] text-[#666666] cursor-not-allowed opacity-70'
                                    : 'bg-[#222222] border-[#555555] hover:border-[#c9a227] text-[#e0e0e0] cursor-pointer'
                              }`}
                            >
                              <img
                                src={getItemSpriteUrl(piece.id)}
                                alt={piece.name}
                                width={24}
                                height={24}
                                className="w-6 h-6 shrink-0"
                                style={{ imageRendering: 'pixelated' }}
                              />
                              <div className="min-w-0 flex-1">
                                <div
                                  className="text-xs font-bold truncate"
                                  style={{ color: RARITY_COLOR[piece.rarity] }}
                                >
                                  {piece.name}
                                  {piece.ownedQty > 1 ? ` (x${piece.ownedQty})` : ''}
                                </div>
                                <div className="text-[10.5px] text-[#a0a0a0] truncate">{pieceStats}</div>
                              </div>
                              <span
                                className={`text-[10px] font-bold shrink-0 ${
                                  isEq ? 'text-[#c9a227]' : needsSecondCopy ? 'text-[#666666]' : 'text-[#86efac]'
                                }`}
                              >
                                {isEq ? 'Equipada' : needsSecondCopy ? 'En otra mano' : 'Equipar'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rpg-subpanel px-3 py-2">
                <div className="text-xs text-[#b8b8b8]">
                  Mochila OSRS (<span className="font-mono-num font-bold text-[#c9a227]">{usedSlots}/{hud.inventoryCapacity}</span> ranuras).
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenInventory();
                  }}
                  className="rpg-btn-primary px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Abrir Mochila [I]
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1.5 justify-items-center bg-[#121212] border border-[#555555] p-3">
                {hud.inventorySlots.map((slot, idx) => {
                  const slotLabel = slot
                    ? slot.category === 'gear' && slot.slot
                      ? GEAR_SLOT_LABEL[slot.slot]
                      : CATEGORY_LABEL[slot.category]
                    : null;
                  const isCoins = slot?.id === 'coins';
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!slot || (slot.category !== 'consumable' && slot.category !== 'gear')}
                      onClick={() => slot && onUseSlot(idx)}
                      title={slot ? `${slot.name} (${slotLabel})\n${slot.desc}` : `Ranura vacía ${idx + 1}`}
                      className={`osrs-slot !w-11 !h-11 ${isCoins ? 'osrs-slot-coins' : ''} ${
                        slot && (slot.category === 'consumable' || slot.category === 'gear')
                          ? 'cursor-pointer'
                          : 'cursor-default'
                      }`}
                    >
                      {slot && (
                        <>
                          <img
                            src={getItemSpriteUrl(slot.id)}
                            alt={slot.name}
                            width={28}
                            height={28}
                            className="w-7 h-7 pointer-events-none"
                            style={{ imageRendering: 'pixelated' }}
                          />
                          {slot.qty > 1 && (
                            <span className="osrs-qty">{formatOsrsQty(slot.qty)}</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'skills' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rpg-subpanel px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-[#e0e0e0]">
                  <Sparkles className="w-4 h-4 text-[#c9a227]" />
                  <span>Puntos disponibles:</span>
                  <span className="font-mono-num text-base font-extrabold text-[#c9a227]">{hud.skillPoints}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono-num">
                  <span className="text-[#fb923c]">Vel.Atq +{hud.atkSpeedPct}%</span>
                  <span className="text-[#c9a227]">Crít {hud.critChancePct}%</span>
                  <span className="text-[#2dd4bf]">Res.Elem {hud.elemResistPct}%</span>
                </div>
              </div>

              <div className="rpg-subpanel p-3">
                <div className="grid grid-cols-3 text-center text-[11px] font-bold uppercase tracking-wider mb-2">
                  <span style={{ color: BRANCH_META.marcial.color }}>{BRANCH_META.marcial.label}</span>
                  <span style={{ color: BRANCH_META.guardian.color }}>{BRANCH_META.guardian.label}</span>
                  <span style={{ color: BRANCH_META.arcano.color }}>{BRANCH_META.arcano.label}</span>
                </div>

                <div className="relative w-full h-[250px] sm:h-[270px]">
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {SKILL_TREE_NODES.map((node) => {
                      if (!node.requires) return null;
                      const parent = SKILL_NODE_MAP[node.requires.key];
                      const unlocked = isSkillUnlocked(node.key, hud.skills);
                      const active = (hud.skills[node.key] ?? 0) > 0;
                      return (
                        <line
                          key={`${parent.key}-${node.key}`}
                          x1={parent.x}
                          y1={parent.y}
                          x2={node.x}
                          y2={node.y}
                          stroke={active ? node.accentColor : unlocked ? '#c9a227' : '#555555'}
                          strokeWidth={active ? '1.35' : unlocked ? '1.05' : '0.85'}
                          strokeDasharray={unlocked ? undefined : '2.5 2'}
                          strokeOpacity={active ? 0.95 : unlocked ? 0.65 : 0.45}
                        />
                      );
                    })}
                  </svg>

                  {SKILL_TREE_NODES.map((node) => {
                    const Icon = SKILL_ICON[node.key];
                    const rank = hud.skills[node.key] ?? 0;
                    const unlocked = isSkillUnlocked(node.key, hud.skills);
                    const maxed = rank >= node.maxRank;
                    const isSelected = selectedSkill === node.key;
                    const canUpgrade = hud.skillPoints > 0 && unlocked && !maxed;

                    return (
                      <button
                        key={node.key}
                        type="button"
                        onClick={() => setSelectedSkill(node.key)}
                        style={{
                          left: `${node.x}%`,
                          top: `${node.y}%`,
                          borderColor: isSelected
                            ? '#c9a227'
                            : rank > 0
                              ? node.accentColor
                              : unlocked
                                ? '#777777'
                                : '#444444',
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 w-[92px] sm:w-[116px] border-2 px-2 py-1.5 text-left cursor-pointer ${
                          !unlocked ? 'bg-[#141414] opacity-55' : 'bg-[#222222]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div
                            className="w-5 h-5 flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: '#161616',
                              color: unlocked ? node.accentColor : '#666666',
                            }}
                          >
                            {unlocked ? <Icon className="w-3.5 h-3.5" /> : <Lock className="w-3 h-3" />}
                          </div>
                          <span
                            className="font-mono-num text-[10px] font-bold"
                            style={{ color: maxed ? '#c9a227' : rank > 0 ? '#e0e0e0' : '#808080' }}
                          >
                            {rank}/{node.maxRank}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span className="text-[10.5px] font-bold text-[#e0e0e0] truncate">{node.shortName}</span>
                          {canUpgrade && (
                            <span className="text-[10px] font-extrabold text-[#c9a227]">+</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rpg-subpanel p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: selNode.accentColor }}>
                      {selNode.name}
                    </span>
                    <span className="font-mono-num text-xs font-bold text-[#c9a227]">
                      Rango {selRank}/{selNode.maxRank}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-[#909090]">
                      {BRANCH_META[selNode.branch].label}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#86efac] mt-0.5">{selNode.perRankSummary}</div>
                  <p className="text-xs text-[#a0a0a0] mt-0.5">{selNode.desc}</p>
                  {!selUnlocked && selNode.requires && (
                    <p className="text-[11px] font-semibold text-[#fca5a5] mt-1">
                      Requiere: {SKILL_NODE_MAP[selNode.requires.key].name} Rango {selNode.requires.rank}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canUpgradeSel}
                  onClick={() => onAllocateSkill(selNode.key)}
                  className={`px-4 py-2 text-xs font-bold shrink-0 whitespace-nowrap ${
                    canUpgradeSel
                      ? 'rpg-btn-primary cursor-pointer'
                      : 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
                  }`}
                >
                  {selMaxed ? 'Máximo' : !selUnlocked ? 'Bloqueado' : hud.skillPoints > 0 ? 'Mejorar +1' : 'Sin Puntos'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
