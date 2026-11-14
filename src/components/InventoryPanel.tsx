import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { gameEventBus } from '../game/EventBus';
import { formatOsrsQty, getItemSpriteUrl } from '../game/itemSprites';
import { RARITY_COLOR } from '../game/lootTable';
import { INVENTORY_CAPACITY, InventorySlotView } from '../game/types';

interface InventoryPanelProps {
  open: boolean;
  zIndex?: number;
  initialSlots: Array<InventorySlotView | null>;
  onClose: () => void;
  onUseSlot: (slotIndex: number) => void;
  onMoveSlot: (fromIndex: number, toIndex: number) => void;
  onDropSlot: (slotIndex: number) => void;
}

interface ContextMenuState {
  slotIndex: number;
  x: number;
  y: number;
}

export const InventoryPanel: React.FC<InventoryPanelProps> = React.memo(({
  open,
  zIndex = 1000,
  initialSlots,
  onClose,
  onUseSlot,
  onMoveSlot,
  onDropSlot,
}) => {
  const [slots, setSlots] = useState<Array<InventorySlotView | null>>(initialSlots);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const droppedInsideRef = useRef<boolean>(false);

  useEffect(() => {
    setSlots(initialSlots);
  }, [initialSlots]);

  useEffect(() => {
    return gameEventBus.on('inventory:updated', (payload) => {
      setSlots(payload.slots);
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setCtxMenu(null);
      setHoveredIdx(null);
      return;
    }
    const handleGlobalClick = () => setCtxMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedIdx !== null && slots[selectedIdx]) {
        e.preventDefault();
        onDropSlot(selectedIdx);
        setCtxMenu(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, selectedIdx, slots, onDropSlot]);

  const handleDragStart = useCallback((idx: number, e: React.DragEvent<HTMLDivElement>) => {
    const item = slots[idx];
    if (!item) {
      e.preventDefault();
      return;
    }
    droppedInsideRef.current = false;
    setDragFromIdx(idx);
    setSelectedIdx(idx);
    setCtxMenu(null);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', String(idx));
  }, [slots]);

  const handleDropOnSlot = useCallback((toIdx: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    droppedInsideRef.current = true;
    const raw = e.dataTransfer.getData('text/plain');
    const fromIdx = dragFromIdx !== null ? dragFromIdx : Number(raw);
    if (Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < INVENTORY_CAPACITY && fromIdx !== toIdx) {
      onMoveSlot(fromIdx, toIdx);
      setSelectedIdx(toIdx);
    }
    setDragFromIdx(null);
    setDragOverIdx(null);
  }, [dragFromIdx, onMoveSlot]);

  const handleDragEnd = useCallback((idx: number, e: React.DragEvent<HTMLDivElement>) => {
    const grid = gridRef.current;
    if (!droppedInsideRef.current && e.dataTransfer.dropEffect === 'none' && grid) {
      const rect = grid.getBoundingClientRect();
      const outside =
        e.clientX < rect.left - 8 ||
        e.clientX > rect.right + 8 ||
        e.clientY < rect.top - 8 ||
        e.clientY > rect.bottom + 8;
      if (outside && (e.clientX !== 0 || e.clientY !== 0)) {
        onDropSlot(idx);
      }
    }
    setDragFromIdx(null);
    setDragOverIdx(null);
    droppedInsideRef.current = false;
  }, [onDropSlot]);

  if (!open) return null;

  const usedCount = slots.filter(Boolean).length;
  const inspectedIdx = hoveredIdx !== null && slots[hoveredIdx] ? hoveredIdx : selectedIdx;
  const inspectedItem = inspectedIdx !== null ? slots[inspectedIdx] : null;
  const ctxItem = ctxMenu ? slots[ctxMenu.slotIndex] : null;

  return (
    <div
      id="inventory-panel"
      className="fixed bottom-[max(96px,calc(env(safe-area-inset-bottom)+86px))] left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-[max(14px,env(safe-area-inset-right))] rpg-panel p-2 w-[184px] pointer-events-auto select-none"
      style={{ zIndex }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Cabecera limpia estilo OSRS */}
      <div className="flex items-center justify-between gap-1.5 pb-1.5 mb-1.5 border-b border-[#555555]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-display text-xs font-bold text-[#c9a227] truncate">
            Mochila
          </span>
          <span className="font-mono-num text-[10px] text-[#a0a0a0]">
            {usedCount}/{INVENTORY_CAPACITY}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rpg-btn-secondary p-0.5 cursor-pointer"
          aria-label="Cerrar mochila"
          title="Cerrar (I)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cuadrícula OSRS 4x5 = 20 ranuras cuadradas */}
      <div
        ref={gridRef}
        className="grid grid-cols-4 gap-1 justify-items-center bg-[#121212] border border-[#444444] p-1"
      >
        {Array.from({ length: INVENTORY_CAPACITY }).map((_, idx) => {
          const item = slots[idx] ?? null;
          const isSelected = selectedIdx === idx;
          const isOver = dragOverIdx === idx && dragFromIdx !== idx;
          const isCoins = item?.id === 'coins';

          return (
            <div
              key={idx}
              draggable={!!item}
              onDragStart={(e) => handleDragStart(idx, e)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverIdx !== idx) setDragOverIdx(idx);
              }}
              onDragLeave={() => {
                if (dragOverIdx === idx) setDragOverIdx(null);
              }}
              onDrop={(e) => handleDropOnSlot(idx, e)}
              onDragEnd={(e) => handleDragEnd(idx, e)}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
              onClick={(e) => {
                e.stopPropagation();
                setCtxMenu(null);
                setSelectedIdx(idx);
              }}
              onDoubleClick={() => {
                if (item && (item.category === 'consumable' || item.category === 'gear')) {
                  onUseSlot(idx);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!item) {
                  setCtxMenu(null);
                  return;
                }
                setSelectedIdx(idx);
                setCtxMenu({ slotIndex: idx, x: e.clientX, y: e.clientY });
              }}
              title={item ? `${item.name}${item.qty > 1 ? ` (x${item.qty})` : ''}\n${item.desc}` : undefined}
              className={`osrs-slot ${isCoins ? 'osrs-slot-coins' : ''} ${
                item ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
              } ${
                isOver
                  ? '!bg-[#4f4628] !border-[#c9a227]'
                  : isSelected
                    ? '!border-[#c9a227]'
                    : ''
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
            </div>
          );
        })}
      </div>

      {/* Tooltip / Inspector inferior compacto sin contador de oro */}
      <div className="mt-1.5 bg-[#1a1a1a] border border-[#555555] px-1.5 py-1 min-h-[44px] flex flex-col justify-between">
        {inspectedItem ? (
          <>
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-[10.5px] font-bold truncate"
                style={{
                  color:
                    inspectedItem.id === 'coins'
                      ? '#c9a227'
                      : inspectedItem.rarity
                        ? RARITY_COLOR[inspectedItem.rarity]
                        : '#e0e0e0',
                }}
              >
                {inspectedItem.name}
              </span>
              {inspectedItem.qty > 1 && (
                <span className="font-mono-num text-[9.5px] font-bold text-[#ffff00] shrink-0">
                  x{formatOsrsQty(inspectedItem.qty)}
                </span>
              )}
            </div>
            <p className="text-[9.5px] text-[#a0a0a0] leading-tight truncate">
              {inspectedItem.desc}
            </p>
            {selectedIdx !== null && slots[selectedIdx] === inspectedItem && (
              <div className="flex items-center justify-end gap-1 mt-1">
                {(inspectedItem.category === 'consumable' || inspectedItem.category === 'gear') && (
                  <button
                    type="button"
                    onClick={() => onUseSlot(selectedIdx)}
                    className="rpg-btn-primary px-1.5 py-0.5 text-[9.5px] font-bold cursor-pointer"
                  >
                    {inspectedItem.category === 'gear' ? 'Equipar' : 'Usar'}
                  </button>
                )}
                {inspectedItem.category !== 'relic' && (
                  <button
                    type="button"
                    onClick={() => onDropSlot(selectedIdx)}
                    className="rpg-btn-secondary px-1.5 py-0.5 text-[9.5px] font-semibold text-[#fca5a5] cursor-pointer"
                    title="Tirar al suelo (Delete)"
                  >
                    Tirar
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-[9.5px] text-[#808080] my-auto text-center">
            Arrastra o haz clic en un objeto
          </div>
        )}
      </div>

      {/* Menú contextual clic derecho */}
      {ctxMenu && ctxItem && (
        <div
          className="fixed z-[1100] rpg-panel py-1 min-w-[100px] flex flex-col"
          style={{
            left: Math.min(window.innerWidth - 115, ctxMenu.x),
            top: Math.min(window.innerHeight - 105, ctxMenu.y),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(ctxItem.category === 'consumable' || ctxItem.category === 'gear') && (
            <button
              type="button"
              onClick={() => {
                onUseSlot(ctxMenu.slotIndex);
                setCtxMenu(null);
              }}
              className="px-2.5 py-1 text-left text-[11px] font-bold text-[#c9a227] hover:bg-[#3a3a3a] cursor-pointer"
            >
              {ctxItem.category === 'gear' ? 'Equipar' : 'Usar'}
            </button>
          )}
          {ctxItem.category !== 'relic' && (
            <button
              type="button"
              onClick={() => {
                onDropSlot(ctxMenu.slotIndex);
                setCtxMenu(null);
              }}
              className="px-2.5 py-1 text-left text-[11px] font-semibold text-[#fca5a5] hover:bg-[#3a3a3a] cursor-pointer"
            >
              Tirar
            </button>
          )}
        </div>
      )}
    </div>
  );
});
