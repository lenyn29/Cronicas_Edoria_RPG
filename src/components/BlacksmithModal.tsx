import React, { useMemo, useState } from 'react';
import { Hammer, X } from 'lucide-react';
import { getItemSpriteUrl } from '../game/itemSprites';
import { GEAR_SLOT_LABEL, GEAR_SLOT_ORDER, MATERIAL_META, RARITY_COLOR, RARITY_LABEL } from '../game/lootTable';
import { ForgeItemSnapshot, GearSlot, HudSnapshot, MaterialId } from '../game/types';

interface BlacksmithModalProps {
  open: boolean;
  zIndex?: number;
  hud: HudSnapshot;
  onCraft: (slot: GearSlot, id: string) => void;
  onUpgrade: (slot: GearSlot, id: string) => void;
  onEquip: (slot: GearSlot, id: string) => void;
  onBuySupply: (kind: 'potion' | 'elixir') => void;
  onClose: () => void;
  onBackdropClick?: () => void;
}

type ForgeTab = 'craft' | 'upgrade';
type SlotFilter = 'all' | GearSlot;

const FORGE_MAT_ORDER: MaterialId[] = [
  'stone_ore',
  'ancestral_wood',
  'bronze_ore',
  'wolf_pelt',
  'iron_ore',
  'ice_shard',
  'obsidian_ore',
  'dark_steel',
];

export const BlacksmithModal: React.FC<BlacksmithModalProps> = React.memo(
  ({ open, zIndex = 1000, hud, onCraft, onUpgrade, onEquip, onBuySupply, onClose, onBackdropClick }) => {
    const [tab, setTab] = useState<ForgeTab>('craft');
    const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');

    const craftableItems = useMemo(
      () =>
        hud.forgeItems.filter(
          (item) =>
            item.craftable &&
            (slotFilter === 'all' ||
              item.slot === slotFilter ||
              (slotFilter === 'offhand' && item.slot === 'weapon' && item.weaponKind === 'dagger'))
        ),
      [hud.forgeItems, slotFilter]
    );
    const ownedItems = useMemo(
      () =>
        hud.forgeItems.filter(
          (item) => item.owned && (slotFilter === 'all' || item.slot === slotFilter)
        ),
      [hud.forgeItems, slotFilter]
    );

    const carriedCoins = useMemo(
      () => hud.inventorySlots.reduce((acc, s) => (s && s.id === 'coins' ? acc + s.qty : acc), 0),
      [hud.inventorySlots]
    );

    if (!open) return null;

    const hasAll = (recipe: ForgeItemSnapshot['craftRecipe'] | null) =>
      !!recipe && recipe.every((r) => r.have >= r.req);

    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 bg-black/75 pointer-events-auto"
        style={{ zIndex }}
        onClick={() => (onBackdropClick ? onBackdropClick() : onClose())}
      >
        <div
          id="forge-window"
          role="dialog"
          aria-modal="true"
          aria-label="Forja de Herrera Lyra"
          className="rpg-panel w-full max-w-[660px] max-h-[88vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header (sin contador de oro) */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#555555] bg-[#1a1a1a]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#2a2a2a] border border-[#c9a227] flex items-center justify-center text-[#c9a227]">
                <Hammer className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-[#c9a227] leading-tight">
                  Forja de Herrera Lyra
                </h2>
                <p className="text-[11px] text-[#a0a0a0]">
                  Forja con materiales de bioma
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rpg-btn-secondary p-1.5 cursor-pointer"
              aria-label="Cerrar forja"
              title="Cerrar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Material Stock Bar */}
          <div className="px-4 py-2 bg-[#161616] border-b border-[#555555]">
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-center">
              {FORGE_MAT_ORDER.map((matId) => {
                const meta = MATERIAL_META[matId];
                const count = hud.materials[matId] ?? 0;
                return (
                  <div
                    key={matId}
                    className="bg-[#222222] border border-[#555555] px-1.5 py-1 flex flex-col items-center"
                    title={`${meta.name}: ${meta.desc}`}
                  >
                    <img
                      src={getItemSpriteUrl(matId)}
                      alt={meta.name}
                      width={20}
                      height={20}
                      className="w-5 h-5 mb-0.5"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div
                      className="text-[9px] font-semibold truncate w-full"
                      style={{ color: RARITY_COLOR[meta.rarity] }}
                    >
                      {meta.name.replace('Mena de ', '').replace('Madera ', 'Mad. ').replace('Esquirla de ', '').replace('Piel de ', 'Piel ').replace('Acero ', 'Ac. ')}
                    </div>
                    <div className={`font-mono-num text-xs font-bold ${count > 0 ? 'text-[#e0e0e0]' : 'text-[#666666]'}`}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation Tabs + Slot Filter */}
          <div className="px-4 py-2.5 bg-[#161616] border-b border-[#555555] space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTab('craft')}
                className={`py-1.5 text-xs font-bold cursor-pointer ${
                  tab === 'craft' ? 'rpg-btn-primary' : 'rpg-btn-secondary'
                }`}
              >
                Forjar Equipo ({craftableItems.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('upgrade')}
                className={`py-1.5 text-xs font-bold cursor-pointer ${
                  tab === 'upgrade' ? 'rpg-btn-primary' : 'rpg-btn-secondary'
                }`}
              >
                Mejorar Equipo ({ownedItems.length})
              </button>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
              <button
                type="button"
                onClick={() => setSlotFilter('all')}
                className={`py-1 text-[11px] font-bold cursor-pointer ${
                  slotFilter === 'all' ? 'rpg-btn-primary' : 'rpg-btn-secondary'
                }`}
              >
                Todos
              </button>
              {GEAR_SLOT_ORDER.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSlotFilter(slot)}
                  className={`py-1 text-[11px] font-bold cursor-pointer ${
                    slotFilter === slot ? 'rpg-btn-primary' : 'rpg-btn-secondary'
                  }`}
                >
                  {GEAR_SLOT_LABEL[slot]}
                </button>
              ))}
            </div>
          </div>

          {/* Items List */}
          <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
            {tab === 'craft' &&
              craftableItems.map((item) => {
                const isDagger = item.slot === 'weapon' && item.weaponKind === 'dagger';
                const maxCopies = isDagger ? 2 : 1;
                const atMaxCopies = item.ownedQty >= maxCopies;
                const canCraft = !atMaxCopies && hasAll(item.craftRecipe);
                return (
                  <div
                    key={`${item.slot}-${item.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rpg-subpanel px-3.5 py-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 bg-[#262626] border border-[#555555] flex items-center justify-center shrink-0 mt-0.5">
                        <img
                          src={getItemSpriteUrl(item.id)}
                          alt={item.name}
                          width={28}
                          height={28}
                          className="w-7 h-7"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-sm font-bold truncate"
                            style={{ color: RARITY_COLOR[item.rarity] }}
                          >
                            {item.name}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-[#909090]">
                            {GEAR_SLOT_LABEL[item.slot]} · {RARITY_LABEL[item.rarity]}
                            {isDagger ? ` · (${item.ownedQty}/2)` : ''}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[#e0e0e0] mt-0.5">{item.statsText}</div>
                        {!atMaxCopies && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                            {item.craftRecipe.map((r) => (
                              <span
                                key={r.materialId}
                                className={`font-mono-num ${r.have >= r.req ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}
                              >
                                {r.name}: {r.have}/{r.req}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-end gap-2">
                      {item.equipped ? (
                        <span className="text-xs font-bold text-[#c9a227] px-2.5 py-1.5 border border-[#c9a227] bg-[#2a2a2a]">
                          Equipada
                        </span>
                      ) : item.owned ? (
                        <button
                          type="button"
                          onClick={() => onEquip(item.slot, item.id)}
                          className="rpg-btn-secondary px-3 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
                        >
                          Equipar
                        </button>
                      ) : null}

                      {!atMaxCopies && (
                        <button
                          type="button"
                          disabled={!canCraft}
                          onClick={() => onCraft(item.slot, item.id)}
                          className={`px-3.5 py-1.5 text-xs font-bold whitespace-nowrap ${
                            canCraft
                              ? 'rpg-btn-primary cursor-pointer'
                              : 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
                          }`}
                        >
                          {item.ownedQty === 1 ? 'Forjar 2da' : 'Forjar'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

            {tab === 'upgrade' &&
              (ownedItems.length === 0 ? (
                <div className="text-center py-8 px-4 rpg-subpanel">
                  <p className="text-sm font-bold text-[#c9a227]">Sin piezas de equipo en esta categoría</p>
                  <p className="text-xs text-[#a0a0a0] mt-1">
                    Completa misiones con el Maestro Guerrero Kael o forja equipo con materiales.
                  </p>
                </div>
              ) : (
                ownedItems.map((item) => {
                  const canUpgrade = hasAll(item.upgradeRecipe);
                  const isMax = item.upgradeRecipe === null;
                  return (
                    <div
                      key={`upg-${item.slot}-${item.id}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rpg-subpanel px-3.5 py-2.5"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 bg-[#262626] border border-[#555555] flex items-center justify-center shrink-0 mt-0.5">
                          <img
                            src={getItemSpriteUrl(item.id)}
                            alt={item.name}
                            width={28}
                            height={28}
                            className="w-7 h-7"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-sm font-bold truncate"
                              style={{ color: RARITY_COLOR[item.rarity] }}
                            >
                              {item.name}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-[#909090]">
                              {GEAR_SLOT_LABEL[item.slot]}
                            </span>
                            <span className="font-mono-num text-[11px] text-[#c9a227]">
                              ({item.upgradeLevel}/{item.maxUpgrade})
                            </span>
                          </div>
                          <div className="text-xs text-[#e0e0e0] mt-0.5">
                            <span>{item.statsText}</span>
                            {item.nextStatsText && (
                              <span className="text-[#86efac] font-semibold"> → {item.nextStatsText}</span>
                            )}
                          </div>
                          {item.upgradeRecipe && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                              {item.upgradeRecipe.map((r) => (
                                <span
                                  key={r.materialId}
                                  className={`font-mono-num ${r.have >= r.req ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}
                                >
                                  {r.name}: {r.have}/{r.req}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center justify-end gap-2">
                        {!item.equipped && (
                          <button
                            type="button"
                            onClick={() => onEquip(item.slot, item.id)}
                            className="rpg-btn-secondary px-2.5 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
                          >
                            Equipar
                          </button>
                        )}
                        {isMax ? (
                          <span className="text-xs font-bold text-[#c9a227] px-3 py-1.5 border border-[#c9a227] bg-[#2a2a2a]">
                            Máximo
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!canUpgrade}
                            onClick={() => onUpgrade(item.slot, item.id)}
                            className={`px-3.5 py-1.5 text-xs font-bold whitespace-nowrap ${
                              canUpgrade
                                ? 'rpg-btn-primary cursor-pointer'
                                : 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
                            }`}
                          >
                            Mejorar +{item.upgradeLevel + 1}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ))}
          </div>

          {/* Supplies Footer (lee monedas apilables desde inventorySlots) */}
          <div className="px-4 py-2.5 bg-[#1a1a1a] border-t border-[#555555] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[#a0a0a0]">Suministros de viaje (usa monedas de la mochila)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={carriedCoins < 30}
                onClick={() => onBuySupply('potion')}
                className={`px-3 py-1 text-xs font-bold whitespace-nowrap ${
                  carriedCoins >= 30
                    ? 'rpg-btn-secondary cursor-pointer'
                    : 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
                }`}
              >
                +1 Poción (30)
              </button>
              <button
                type="button"
                disabled={carriedCoins < 35}
                onClick={() => onBuySupply('elixir')}
                className={`px-3 py-1 text-xs font-bold whitespace-nowrap ${
                  carriedCoins >= 35
                    ? 'rpg-btn-secondary cursor-pointer'
                    : 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
                }`}
              >
                +1 Elixir (35)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
