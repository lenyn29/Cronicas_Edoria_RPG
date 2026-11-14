import React, { useMemo } from 'react';
import { Coins, ShoppingBag, X } from 'lucide-react';
import { getItemSpriteUrl } from '../game/itemSprites';
import { HudSnapshot } from '../game/types';

interface ShopModalProps {
  open: boolean;
  zIndex?: number;
  hud: HudSnapshot;
  onBuySupply: (kind: 'potion' | 'elixir', qty?: number) => void;
  onClose: () => void;
  onBackdropClick?: () => void;
}

interface ShopCatalogItem {
  id: string;
  kind: 'potion' | 'elixir';
  spriteId: 'potion' | 'elixir';
  title: string;
  desc: string;
  qty: number;
  cost: number;
}

const SHOP_ITEMS: ShopCatalogItem[] = [
  {
    id: 'potion_1',
    kind: 'potion',
    spriteId: 'potion',
    title: 'Poción de Vida',
    desc: 'Restaura 55% de tu Vida máxima al instante.',
    qty: 1,
    cost: 30,
  },
  {
    id: 'elixir_1',
    kind: 'elixir',
    spriteId: 'elixir',
    title: 'Elixir de Maná',
    desc: 'Restaura 60% de tu Maná máximo para conjuros.',
    qty: 1,
    cost: 35,
  },
  {
    id: 'potion_3',
    kind: 'potion',
    spriteId: 'potion',
    title: 'Lote de Pociones (x3)',
    desc: 'Provisiones recomendadas antes de cruzar los portones.',
    qty: 3,
    cost: 85,
  },
  {
    id: 'elixir_3',
    kind: 'elixir',
    spriteId: 'elixir',
    title: 'Lote de Elixires (x3)',
    desc: 'Reserva arcana para expediciones largas.',
    qty: 3,
    cost: 100,
  },
];

export const ShopModal: React.FC<ShopModalProps> = React.memo(({
  open,
  zIndex = 1000,
  hud,
  onBuySupply,
  onClose,
  onBackdropClick,
}) => {
  const carriedCoins = useMemo(
    () => hud.inventorySlots.reduce((acc, s) => (s && s.id === 'coins' ? acc + s.qty : acc), 0),
    [hud.inventorySlots]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 bg-black/70 pointer-events-auto"
      style={{ zIndex }}
      onClick={() => (onBackdropClick ? onBackdropClick() : onClose())}
    >
      <div
        id="shop-window"
        role="dialog"
        aria-modal="true"
        aria-label="Tienda de Mercader Darío"
        className="rpg-panel w-full max-w-[480px] max-h-[86vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#555555] bg-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#2a2a2a] border border-[#c9a227] flex items-center justify-center text-[#c9a227]">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-[#c9a227] leading-tight">
                Bazar de Mercader Darío
              </h2>
              <p className="text-[11px] text-[#a0a0a0]">
                Provisiones de viaje de Piedrablanca
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rpg-btn-secondary p-1.5 cursor-pointer"
            aria-label="Cerrar tienda"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 bg-[#161616] border-b border-[#555555] flex items-center justify-between text-xs">
          <span className="text-[#a0a0a0]">Monedas en mochila</span>
          <span className="font-mono-num font-bold text-[#c9a227] flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" />
            {carriedCoins}
          </span>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          {SHOP_ITEMS.map((item) => {
            const affordable = carriedCoins >= item.cost;
            return (
              <div
                key={item.id}
                className="rpg-subpanel px-3.5 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-[#262626] border border-[#555555] flex items-center justify-center shrink-0">
                    <img
                      src={getItemSpriteUrl(item.spriteId)}
                      alt={item.title}
                      width={28}
                      height={28}
                      className="w-7 h-7"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#e0e0e0] truncate">{item.title}</div>
                    <div className="text-[11px] text-[#a0a0a0] truncate">{item.desc}</div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onBuySupply(item.kind, item.qty)}
                  className={`px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 font-mono-num ${
                    affordable
                      ? 'rpg-btn-primary cursor-pointer'
                      : 'bg-[#222222] border border-[#444444] text-[#666666] cursor-not-allowed'
                  }`}
                >
                  {item.cost} M
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
