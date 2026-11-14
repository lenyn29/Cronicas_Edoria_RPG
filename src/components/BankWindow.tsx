import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { gameEventBus } from '../game/EventBus';
import { formatOsrsQty, getItemSpriteUrl } from '../game/itemSprites';
import { RARITY_COLOR } from '../game/lootTable';
import { BANK_CAPACITY, INVENTORY_CAPACITY, InventorySlotView } from '../game/types';

interface BankWindowProps {
  open: boolean;
  zIndex?: number;
  initialInventorySlots: Array<InventorySlotView | null>;
  initialBankSlots: Array<InventorySlotView | null>;
  onClose: () => void;
  onBackdropClick?: () => void;
  onDepositSlot: (slotIndex: number) => void;
  onWithdrawSlot: (bankIndex: number) => void;
  onDepositAll: () => void;
  onDepositCoins: () => void;
}

export const BankWindow: React.FC<BankWindowProps> = React.memo(({
  open,
  zIndex = 1000,
  initialInventorySlots,
  initialBankSlots,
  onClose,
  onBackdropClick,
  onDepositSlot,
  onWithdrawSlot,
  onDepositAll,
  onDepositCoins,
}) => {
  const [invSlots, setInvSlots] = useState<Array<InventorySlotView | null>>(initialInventorySlots);
  const [bankSlots, setBankSlots] = useState<Array<InventorySlotView | null>>(initialBankSlots);
  const [hoveredItem, setHoveredItem] = useState<{
    item: InventorySlotView;
    source: 'inv' | 'bank';
  } | null>(null);

  useEffect(() => {
    setInvSlots(initialInventorySlots);
  }, [initialInventorySlots]);

  useEffect(() => {
    setBankSlots(initialBankSlots);
  }, [initialBankSlots]);

  useEffect(() => {
    const offInv = gameEventBus.on('inventory:updated', (payload) => {
      setInvSlots(payload.slots);
    });
    const offBank = gameEventBus.on('bank:updated', (payload) => {
      setBankSlots(payload.bankSlots);
      setInvSlots(payload.inventorySlots);
    });
    return () => {
      offInv();
      offBank();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setHoveredItem(null);
    }
  }, [open]);

  if (!open) return null;

  const invUsed = invSlots.filter(Boolean).length;
  const bankUsed = bankSlots.filter(Boolean).length;
  const hasInvItems = invUsed > 0;
  const hasCoins = invSlots.some((s) => s?.id === 'coins' && s.qty > 0);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 bg-black/70 pointer-events-auto"
      style={{ zIndex }}
      onClick={() => onBackdropClick?.()}
    >
      <div
        id="bank-window"
        role="dialog"
        aria-modal="true"
        aria-label="Cofre de Almacenamiento"
        className="w-full max-w-[540px] max-h-[92vh] flex flex-col overflow-hidden bg-[rgba(20,20,20,0.95)] border-2 border-[#888888] rounded-none text-[#e0e0e0]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#1a1a1a] border-b border-[#555555]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display text-sm font-bold text-[#c9a227] truncate">
              Cofre de Piedrablanca
            </span>
            <span className="font-mono-num text-[11px] text-[#a0a0a0]">
              Banquero Bran
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar cofre"
            title="Cerrar (Esc)"
            className="rpg-btn-secondary p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dual Grid Body */}
        <div className="p-3 overflow-y-auto flex flex-col sm:flex-row gap-3 items-start justify-center">
          {/* Panel Izquierdo: Tu inventario (4x5 = 20 slots) */}
          <div className="flex flex-col bg-[#1a1a1a] border border-[#555555] p-2 shrink-0 mx-auto sm:mx-0">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[11px] font-bold text-[#e0e0e0] uppercase tracking-wide">
                Tu inventario
              </span>
              <span className="font-mono-num text-[10px] text-[#c9a227]">
                {invUsed}/{INVENTORY_CAPACITY}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 bg-[#121212] border border-[#444444] p-1">
              {Array.from({ length: INVENTORY_CAPACITY }).map((_, idx) => {
                const item = invSlots[idx] ?? null;
                const isCoins = item?.id === 'coins';
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!item}
                    onClick={() => item && onDepositSlot(idx)}
                    onMouseEnter={() => item && setHoveredItem({ item, source: 'inv' })}
                    onMouseLeave={() => setHoveredItem(null)}
                    title={item ? `${item.name} (Clic para depositar)` : 'Ranura vacía'}
                    className={`osrs-slot ${isCoins ? 'osrs-slot-coins' : ''} ${
                      item ? 'cursor-pointer' : 'cursor-default opacity-70'
                    }`}
                  >
                    {item && (
                      <>
                        <img
                          src={getItemSpriteUrl(item.id)}
                          alt={item.name}
                          width={26}
                          height={26}
                          draggable={false}
                          className="w-[26px] h-[26px] pointer-events-none"
                          style={{ imageRendering: 'pixelated' }}
                        />
                        {item.qty > 1 && (
                          <span className="osrs-qty">{formatOsrsQty(item.qty)}</span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel Derecho: Almacenamiento (8x5 = 40 slots) */}
          <div className="flex flex-col bg-[#1a1a1a] border border-[#555555] p-2 shrink-0 mx-auto sm:mx-0">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[11px] font-bold text-[#c9a227] uppercase tracking-wide">
                Almacenamiento
              </span>
              <span className="font-mono-num text-[10px] text-[#c9a227]">
                {bankUsed}/{BANK_CAPACITY}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1 bg-[#121212] border border-[#444444] p-1">
              {Array.from({ length: BANK_CAPACITY }).map((_, idx) => {
                const item = bankSlots[idx] ?? null;
                const isCoins = item?.id === 'coins';
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!item}
                    onClick={() => item && onWithdrawSlot(idx)}
                    onMouseEnter={() => item && setHoveredItem({ item, source: 'bank' })}
                    onMouseLeave={() => setHoveredItem(null)}
                    title={item ? `${item.name} (Clic para retirar)` : 'Ranura vacía'}
                    className={`osrs-slot ${isCoins ? 'osrs-slot-coins' : ''} ${
                      item ? 'cursor-pointer' : 'cursor-default opacity-70'
                    }`}
                  >
                    {item && (
                      <>
                        <img
                          src={getItemSpriteUrl(item.id)}
                          alt={item.name}
                          width={26}
                          height={26}
                          draggable={false}
                          className="w-[26px] h-[26px] pointer-events-none"
                          style={{ imageRendering: 'pixelated' }}
                        />
                        {item.qty > 1 && (
                          <span className="osrs-qty">{formatOsrsQty(item.qty)}</span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tooltip bar (sin texto dentro de slots) */}
        <div className="mx-3 mb-2 px-2.5 py-1.5 bg-[#1a1a1a] border border-[#555555] min-h-[38px] flex items-center justify-between gap-2 text-[11px]">
          {hoveredItem ? (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-bold truncate"
                    style={{
                      color:
                        hoveredItem.item.id === 'coins'
                          ? '#c9a227'
                          : hoveredItem.item.rarity
                            ? RARITY_COLOR[hoveredItem.item.rarity]
                            : '#e0e0e0',
                    }}
                  >
                    {hoveredItem.item.name}
                  </span>
                  <span className="font-mono-num text-[10px] text-[#ffff00] shrink-0">
                    x{hoveredItem.item.qty}
                  </span>
                </div>
                <div className="text-[10px] text-[#a8a8a8] truncate">{hoveredItem.item.desc}</div>
              </div>
              <span className="text-[10px] font-bold text-[#c9a227] shrink-0 uppercase">
                {hoveredItem.source === 'inv' ? 'Clic: Depositar' : 'Clic: Retirar'}
              </span>
            </>
          ) : (
            <span className="text-[10.5px] text-[#909090]">
              Haz clic en un objeto para depositarlo o retirarlo del cofre.
            </span>
          )}
        </div>

        {/* Botones de acción rápida */}
        <div className="px-3 py-2 bg-[#1a1a1a] border-t border-[#555555] flex flex-wrap items-center justify-end gap-2">
          <button
            id="deposit-coins"
            type="button"
            disabled={!hasCoins}
            onClick={onDepositCoins}
            className={`px-3 py-1.5 text-xs font-bold border ${
              hasCoins
                ? 'rpg-btn-secondary cursor-pointer text-[#c9a227] border-[#c9a227]'
                : 'bg-[#222222] border-[#444444] text-[#666666] cursor-not-allowed'
            }`}
          >
            Depositar monedas
          </button>
          <button
            id="deposit-all"
            type="button"
            disabled={!hasInvItems}
            onClick={onDepositAll}
            className={`px-3 py-1.5 text-xs font-bold ${
              hasInvItems
                ? 'rpg-btn-primary cursor-pointer'
                : 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
            }`}
          >
            Depositar todo
          </button>
        </div>
      </div>
    </div>
  );
});
