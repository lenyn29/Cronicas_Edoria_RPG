import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActionBar } from './components/ActionBar';
import { ActionButton } from './components/ActionButton';
import { BankWindow } from './components/BankWindow';
import { BlacksmithModal } from './components/BlacksmithModal';
import { CharacterCreatorModal } from './components/CharacterCreatorModal';
import { GameHUD } from './components/GameHUD';
import { HeroModal } from './components/HeroModal';
import { InventoryPanel } from './components/InventoryPanel';
import { ShopModal } from './components/ShopModal';
import { StatusPanel } from './components/StatusPanel';
import { TouchControls } from './components/TouchControls';
import { WelcomeScreen } from './components/WelcomeScreen';
import { WorldMapOverlay } from './components/WorldMapOverlay';
import { DEFAULT_HERO_CONFIG, HeroConfig } from './game/Constants';
import { gameEventBus } from './game/EventBus';
import { EldoriaGameEngine } from './game/GameEngine';
import { windowManager } from './game/WindowManager';
import {
  enterFullscreenLandscape,
  GameFlowManager,
  GameFlowState,
  hasSavedAdventure,
  readSavedHeroPreview,
} from './game/GameFlowManager';
import { createEmptyMaterials, getGearStyle } from './game/lootTable';
import { createEmptySkills, SPELL_DEFS } from './game/skillTree';
import {
  BANK_CAPACITY,
  DialoguePayload,
  GamePhase,
  GearSlot,
  HeroTab,
  HudSnapshot,
  INVENTORY_CAPACITY,
  InventorySlotView,
  QualityMode,
  SkillKey,
  SpellId,
} from './game/types';
import { DEFAULT_WORLD_SEED, ensureWorldSeed, getNearestTownInfo, getWorldTowns } from './game/worldMath';

const INITIAL_TOWNS = getWorldTowns(ensureWorldSeed(DEFAULT_WORLD_SEED));
const INITIAL_SLOTS: Array<InventorySlotView | null> = Array.from(
  { length: INVENTORY_CAPACITY },
  (_, idx) => {
    if (idx === 0) {
      return {
        id: 'potion',
        name: 'Poción de Vida',
        category: 'consumable',
        qty: 1,
        desc: 'Restaura 55% de Vida máxima.',
      };
    }
    if (idx === 1) {
      return {
        id: 'elixir',
        name: 'Elixir de Maná',
        category: 'consumable',
        qty: 1,
        desc: 'Restaura 60% del Maná máximo.',
      };
    }
    if (idx === 2) {
      return {
        id: 'coins',
        name: 'Monedas',
        category: 'currency',
        qty: 15,
        rarity: 'poco_comun',
        desc: 'Monedas de oro de Eldoria. Apilables en mochila o cofre.',
      };
    }
    return null;
  }
);

const INITIAL_BANK_SLOTS: Array<InventorySlotView | null> = Array.from(
  { length: BANK_CAPACITY },
  () => null
);

const INITIAL_HUD: HudSnapshot = {
  heroName: 'Aelion',
  hp: 32,
  maxHp: 32,
  mp: 45,
  maxMp: 45,
  xp: 0,
  xpNext: 260,
  level: 1,
  potions: 1,
  elixirs: 1,
  atkDmg: 5,
  magDmg: 14,
  def: 0,
  moveSpeed: 6.5,
  atkSpeedPct: 0,
  critChancePct: 5,
  elemResistPct: 0,
  equipped: {
    helmet: null,
    armor: null,
    gloves: null,
    boots: null,
    weapon: null,
    offhand: null,
  },
  equippedNames: {
    helmet: null,
    armor: null,
    gloves: null,
    boots: null,
    weapon: null,
    offhand: null,
  },
  ownedGearQty: {},
  learnedSpells: [],
  activeSpell: null,
  skillPoints: 0,
  skills: createEmptySkills(),
  materials: createEmptyMaterials(),
  forgeItems: [],
  inventory: [
    { id: 'potion', name: 'Poción de Vida', category: 'consumable', qty: 1, desc: 'Restaura 55% de Vida máxima.' },
    { id: 'elixir', name: 'Elixir de Maná', category: 'consumable', qty: 1, desc: 'Restaura 60% del Maná máximo.' },
    { id: 'coins', name: 'Monedas', category: 'currency', rarity: 'poco_comun', qty: 15, desc: 'Monedas de oro de Eldoria. Apilables en mochila o cofre.' },
  ],
  inventorySlots: INITIAL_SLOTS,
  inventoryCapacity: INVENTORY_CAPACITY,
  bankSlots: INITIAL_BANK_SLOTS,
  inCombat: false,
  towns: INITIAL_TOWNS,
  nearestTown: getNearestTownInfo(0, 19, INITIAL_TOWNS),
  playerPos: { x: 0, z: 19 },
  worldSeed: ensureWorldSeed(DEFAULT_WORLD_SEED),
  kills: 0,
  slimeKills: 0,
  forestKills: 0,
  defeatedBiomeBosses: 0,
  hasCrystal: false,
  quests: { q1: 0, q2: 0, q3: 0, mage: 0, warrior: 0 },
  biomeName: 'Pradera Esmeralda',
  timeLabel: 'Día',
  interactPrompt: null,
  bossBar: { visible: false, name: '', hp: 0, maxHp: 1 },
  targetEnemy: null,
  questTitle: 'Ciudad de Piedrablanca',
  questDesc: 'Habla con Kael, Aldric, Lyra, Darío, Bran, Bardo o el Mago Theron usando F o clic.',
  audioEnabled: true,
  cooldowns: {
    atk: 0,
    spell: 0,
    dash: 0,
    potionHp: 0,
    potionMp: 0,
  },
};

const QUALITY_LABELS: Record<QualityMode, string> = {
  auto: 'Automático',
  high: 'Alta Calidad',
  performance: 'Alto Rendimiento',
};

type PendingGameplayLaunch =
  | { type: 'new'; name: string; seed: string; config: HeroConfig }
  | { type: 'continue' }
  | null;

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const floatLayerRef = useRef<HTMLDivElement | null>(null);
  const nameplateLayerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EldoriaGameEngine | null>(null);
  const flowManagerRef = useRef<GameFlowManager>(new GameFlowManager('WELCOME'));
  const pendingLaunchRef = useRef<PendingGameplayLaunch>(null);
  const toastTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  const [flowState, setFlowState] = useState<GameFlowState>(() => flowManagerRef.current.getState());
  const [orientationHintVisible, setOrientationHintVisible] = useState(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  );

  const [phase, setPhase] = useState<GamePhase>('title');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [dialogue, setDialogue] = useState<DialoguePayload | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [contextRetryReady, setContextRetryReady] = useState(false);
  const [heroNameInput, setHeroNameInput] = useState<string>('Aelion');
  const [seedInput, setSeedInput] = useState<string>(DEFAULT_WORLD_SEED);
  const [heroConfig, setHeroConfig] = useState<HeroConfig>({ ...DEFAULT_HERO_CONFIG });
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(() => hasSavedAdventure());
  const [recustomizeOpen, setRecustomizeOpen] = useState<boolean>(false);
  const [fadeOverlay, setFadeOverlay] = useState<boolean>(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>('performance');
  const [heroTab, setHeroTab] = useState<HeroTab>('info');
  useSyncExternalStore(windowManager.subscribe, windowManager.getSnapshot);
  const heroOpen = windowManager.isOpen('hero-window');
  const inventoryOpen = windowManager.isOpen('inventory-window');
  const forgeOpen = windowManager.isOpen('forge-window');
  const bankOpen = windowManager.isOpen('bank-window');
  const shopOpen = windowManager.isOpen('shop-window');
  const worldMapOpen = windowManager.isOpen('world-map');
  const [liveMapPos, setLiveMapPos] = useState<{ x: number; z: number; yawDeg: number }>({
    x: INITIAL_HUD.playerPos.x,
    z: INITIAL_HUD.playerPos.z,
    yawDeg: 0,
  });
  const [touchVisible, setTouchVisible] = useState<boolean>(
    () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    const fm = flowManagerRef.current;
    setFlowState(fm.getState());
    return fm.subscribe(setFlowState);
  }, []);

  useEffect(() => {
    const preview = readSavedHeroPreview();
    setHasSavedGame(preview.hasSave);
    if (preview.hasSave) {
      setHeroNameInput(preview.heroName);
      setSeedInput(preview.seed);
      setHeroConfig(preview.heroConfig);
    }
  }, []);

  useEffect(() => {
    if (!contextLost) {
      setContextRetryReady(false);
      return;
    }
    const timer = window.setTimeout(() => setContextRetryReady(true), 3000);
    return () => window.clearTimeout(timer);
  }, [contextLost]);

  useEffect(() => {
    const updateOrientation = () => {
      const portraitNow = window.innerHeight > window.innerWidth;
      setIsPortrait(portraitNow);
      if (!portraitNow) {
        setOrientationHintVisible(false);
      }
    };
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  useEffect(() => {
    const offWindowClosed = gameEventBus.on('window:closed', (payload) => {
      if (payload.id === 'npc-dialog') {
        setDialogue(null);
      }
    });
    const offCompass = gameEventBus.on('compass:updated', (payload) => {
      setLiveMapPos({
        x: payload.px,
        z: payload.pz,
        yawDeg: payload.playerYawDeg ?? 0,
      });
    });
    return () => {
      offWindowClosed();
      offCompass();
    };
  }, []);

  useEffect(() => {
    if (flowState !== 'GAMEPLAY') return;
    const mount = canvasMountRef.current;
    if (!mount) return;

    const launch = pendingLaunchRef.current;
    const initialSeed = launch?.type === 'new' ? launch.seed : DEFAULT_WORLD_SEED;

    const engine = new EldoriaGameEngine(
      mount,
      {
        onHudUpdate: setHud,
        onToast: showToast,
        onDialogue: (payload) => {
          setDialogue(payload);
          if (payload) {
            windowManager.open('npc-dialog');
          } else {
            windowManager.close('npc-dialog');
          }
        },
        onPhaseChange: (nextPhase) => {
          setPhase(nextPhase);
          if (nextPhase !== 'playing') {
            windowManager.closeAll();
            setDialogue(null);
          }
          if (nextPhase !== 'paused') {
            setRecustomizeOpen(false);
          }
        },
        onContextLost: setContextLost,
        onToggleHeroPanel: () => {
          windowManager.toggle('hero-window');
        },
        onForgeOpen: (open) => {
          if (open) windowManager.open('forge-window');
          else windowManager.close('forge-window');
        },
        onBankOpen: (open) => {
          if (open) windowManager.open('bank-window');
          else windowManager.close('bank-window');
        },
        onShopOpen: (open) => {
          if (open) windowManager.open('shop-window');
          else windowManager.close('shop-window');
        },
      },
      initialSeed
    );

    engineRef.current = engine;
    if (floatLayerRef.current) {
      engine.setFloatTextContainer(floatLayerRef.current);
    }
    if (nameplateLayerRef.current) {
      engine.setNameplateContainer(nameplateLayerRef.current);
    }

    if (launch?.type === 'new') {
      engine.startNewAdventure(launch.name, launch.seed, launch.config);
      setHasSavedGame(engine.hasSavedGame());
    } else if (launch?.type === 'continue') {
      if (engine.loadGameState()) {
        setHeroConfig(engine.getHeroConfig());
        setHeroNameInput(engine.player.heroName);
        engine.startGame();
      } else {
        engine.startGame();
      }
    } else {
      engine.startGame();
    }
    pendingLaunchRef.current = null;

    const fadeOutTimer = window.setTimeout(() => setFadeOverlay(false), 60);

    return () => {
      window.clearTimeout(fadeOutTimer);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      windowManager.closeAll();
      engine.dispose();
      engineRef.current = null;
    };
  }, [flowState, showToast]);

  useEffect(() => {
    engineRef.current?.setFloatTextContainer(floatLayerRef.current);
    engineRef.current?.setNameplateContainer(nameplateLayerRef.current);
  }, [flowState, phase]);

  const handleWelcomeBegin = useCallback(async () => {
    const res = await enterFullscreenLandscape();
    if (!res.orientationLocked && res.isPortrait) {
      setOrientationHintVisible(true);
    }
    flowManagerRef.current.advanceToCharacterCreator();
  }, []);

  const handleToggleInventory = useCallback(() => {
    if (!dialogue && !forgeOpen && !bankOpen && !shopOpen && !worldMapOpen) {
      windowManager.toggle('inventory-window');
    }
  }, [dialogue, forgeOpen, bankOpen, shopOpen, worldMapOpen]);

  const handleCloseHero = useCallback(() => windowManager.close('hero-window'), []);
  const handleCloseForge = useCallback(() => windowManager.close('forge-window'), []);
  const handleCloseInventory = useCallback(() => windowManager.close('inventory-window'), []);
  const handleCloseBank = useCallback(() => windowManager.close('bank-window'), []);
  const handleCloseShop = useCallback(() => windowManager.close('shop-window'), []);
  const handleCloseDialogue = useCallback(() => engineRef.current?.closeDialogue(), []);

  const handleDepositSlot = useCallback((idx: number) => engineRef.current?.depositInventorySlotToBank(idx), []);
  const handleWithdrawSlot = useCallback((idx: number) => engineRef.current?.withdrawBankSlotToInventory(idx), []);
  const handleDepositAll = useCallback(() => engineRef.current?.depositAllToBank(), []);
  const handleDepositCoins = useCallback(() => engineRef.current?.depositCoinsToBank(), []);

  const handleCraftGear = useCallback(
    (slot: GearSlot, id: string) => engineRef.current?.craftGear(slot, id),
    []
  );
  const handleUpgradeGear = useCallback(
    (slot: GearSlot, id: string) => engineRef.current?.upgradeGear(slot, id),
    []
  );
  const handleEquipGear = useCallback(
    (slot: GearSlot, id: string) => engineRef.current?.equipGear(slot, id),
    []
  );
  const handleUnequipGear = useCallback((slot: GearSlot) => engineRef.current?.unequipGear(slot), []);
  const handleBuySupply = useCallback(
    (kind: 'potion' | 'elixir', qty = 1) => engineRef.current?.buySupply(kind, qty),
    []
  );
  const handleAllocateSkill = useCallback((key: SkillKey) => engineRef.current?.allocateSkill(key), []);
  const handleUseInventoryItem = useCallback((id: string) => engineRef.current?.useInventoryItem(id), []);
  const handleUseSlot = useCallback((idx: number) => engineRef.current?.useInventorySlot(idx), []);
  const handleMoveSlot = useCallback((fromIdx: number, toIdx: number) => engineRef.current?.moveInventorySlot(fromIdx, toIdx), []);
  const handleDropSlot = useCallback((idx: number) => engineRef.current?.dropInventorySlot(idx), []);
  const handleJoystickMove = useCallback((nx: number, ny: number) => engineRef.current?.setJoystick(nx, ny), []);
  const handleContextAction = useCallback(() => engineRef.current?.triggerContextAction(), []);
  const handleUseConsumable = useCallback((id: string) => engineRef.current?.useConsumableById(id), []);
  const handleTriggerSkill = useCallback((slotIdx: 0 | 1 | 2) => engineRef.current?.triggerSkillSlot(slotIdx), []);
  const handleSelectSpell = useCallback((spellId: SpellId) => {
    const eng = engineRef.current;
    if (!eng || !eng.player.learnedSpells.includes(spellId)) return;
    eng.player.activeSpell = spellId;
    eng.audio.talk();
    showToast(`Hechizo activo: ${SPELL_DEFS[spellId].name}`);
    setHud((prev) => ({ ...prev, activeSpell: spellId }));
  }, [showToast]);

  const handleStartNewAdventure = useCallback((name: string, seed: string, config: HeroConfig) => {
    if (!flowManagerRef.current.canEnterGameplay()) return;
    setHeroNameInput(name);
    setSeedInput(seed);
    setHeroConfig(config);
    pendingLaunchRef.current = { type: 'new', name, seed, config };

    setFadeOverlay(true);
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => {
      flowManagerRef.current.advanceToGameplay();
    }, 260);
  }, []);

  const handleContinueSaved = useCallback(() => {
    if (!flowManagerRef.current.canEnterGameplay()) return;
    pendingLaunchRef.current = { type: 'continue' };

    setFadeOverlay(true);
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => {
      flowManagerRef.current.advanceToGameplay();
    }, 260);
  }, []);

  const handleSaveGame = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.saveGameState(true)) {
      setHasSavedGame(true);
    }
  }, []);

  const handleOpenRecustomize = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
      setHeroConfig(eng.getHeroConfig());
      setHeroNameInput(eng.player.heroName);
    }
    setRecustomizeOpen(true);
  }, []);

  const handleConfirmRecustomize = useCallback(
    (name: string, _seed: string, config: HeroConfig) => {
      const eng = engineRef.current;
      if (eng) {
        eng.setHeroName(name);
        eng.setHeroConfig(config, true);
        eng.saveGameState(false);
        setHasSavedGame(true);
      }
      setHeroNameInput(name);
      setHeroConfig(config);
      setRecustomizeOpen(false);
      showToast('Apariencia del héroe actualizada.');
    },
    [showToast]
  );

  const cycleQualityMode = useCallback(() => {
    setQualityMode((prev) => {
      const next: QualityMode = prev === 'auto' ? 'high' : prev === 'high' ? 'performance' : 'auto';
      engineRef.current?.setQualityMode(next);
      return next;
    });
  }, []);

  const anyModalOpen = heroOpen || forgeOpen || bankOpen || shopOpen;
  const exclusiveBlockingOpen = forgeOpen || bankOpen || shopOpen || worldMapOpen || Boolean(dialogue);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07080d]">
      <div
        ref={canvasMountRef}
        className={`fixed inset-0 w-full h-full z-0 ${flowState === 'GAMEPLAY' ? 'block' : 'hidden'}`}
      />

      {orientationHintVisible && isPortrait && (
        <div
          role="status"
          className="fixed top-[max(12px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[2500] rpg-panel px-4 py-2 flex items-center gap-3 max-w-[92vw]"
        >
          <span className="text-xs text-[#e0e0e0]">
            Para mejor experiencia, gira tu dispositivo a horizontal
          </span>
          <button
            type="button"
            onClick={() => setOrientationHintVisible(false)}
            aria-label="Cerrar aviso de orientación"
            className="text-xs font-bold text-[#c9a227] hover:underline cursor-pointer shrink-0"
          >
            Entendido
          </button>
        </div>
      )}

      {flowState === 'WELCOME' && <WelcomeScreen onBegin={handleWelcomeBegin} />}

      {flowState === 'CHARACTER_CREATOR' && (
        <CharacterCreatorModal
          open={true}
          mode="initial"
          initialConfig={heroConfig}
          initialName={heroNameInput}
          initialSeed={seedInput}
          hasSavedGame={hasSavedGame}
          onConfirm={handleStartNewAdventure}
          onContinueSaved={handleContinueSaved}
        />
      )}

      {flowState === 'GAMEPLAY' && (
        <>
          {contextLost && (
            <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/90 p-6 text-center">
              <div className="rpg-panel p-6 max-w-sm w-full">
                <h2 className="font-display text-lg font-bold text-[#c9a227] mb-2">
                  Reconectando contexto WebGL...
                </h2>
                <p className="text-sm text-[#a0a0a0]">
                  El navegador suspendió temporalmente WebGL. Esperando recuperación automática...
                </p>
                {contextRetryReady && (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rpg-btn-primary mt-4 px-6 py-2.5 text-sm font-bold cursor-pointer"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            </div>
          )}

          {phase !== 'title' && (
            <>
              <div ref={nameplateLayerRef} className="fixed inset-0 z-[500] pointer-events-none overflow-hidden" />
              <div ref={floatLayerRef} className="fixed inset-0 z-[500] pointer-events-none overflow-hidden" />
              <GameHUD
                hud={hud}
                dialogue={dialogue}
                toast={toast}
                modalOpen={anyModalOpen || worldMapOpen}
                dialogZIndex={windowManager.getZIndex('npc-dialog')}
                onOpenWorldMap={() => windowManager.open('world-map')}
                onCloseDialogue={handleCloseDialogue}
              />
              {phase === 'playing' && !dialogue && !anyModalOpen && !worldMapOpen && (
                <>
                  <StatusPanel
                    heroName={hud.heroName}
                    heroConfig={heroConfig}
                    helmetStyle={getGearStyle(hud.equipped.helmet)}
                    initialHp={hud.hp}
                    initialMaxHp={hud.maxHp}
                    initialMp={hud.mp}
                    initialMaxMp={hud.maxMp}
                    initialXp={hud.xp}
                    initialXpNext={hud.xpNext}
                    initialLevel={hud.level}
                    onOpenHeroModal={() => windowManager.open('hero-window')}
                  />
                  <ActionBar
                    hud={hud}
                    inventoryOpen={inventoryOpen}
                    onToggleInventory={handleToggleInventory}
                    onUseConsumable={handleUseConsumable}
                    onTriggerSkill={handleTriggerSkill}
                  />
                </>
              )}
              <ActionButton
                visible={phase === 'playing' && !dialogue && !anyModalOpen && !worldMapOpen}
                onAction={handleContextAction}
              />
              <InventoryPanel
                open={phase === 'playing' && inventoryOpen && !exclusiveBlockingOpen}
                zIndex={windowManager.getZIndex('inventory-window')}
                initialSlots={hud.inventorySlots}
                onClose={handleCloseInventory}
                onUseSlot={handleUseSlot}
                onMoveSlot={handleMoveSlot}
                onDropSlot={handleDropSlot}
              />
              <BankWindow
                open={phase === 'playing' && bankOpen && !dialogue}
                zIndex={windowManager.getZIndex('bank-window')}
                initialInventorySlots={hud.inventorySlots}
                initialBankSlots={hud.bankSlots}
                onClose={handleCloseBank}
                onBackdropClick={() => windowManager.handleOutsideClick('bank-window')}
                onDepositSlot={handleDepositSlot}
                onWithdrawSlot={handleWithdrawSlot}
                onDepositAll={handleDepositAll}
                onDepositCoins={handleDepositCoins}
              />
              <ShopModal
                open={phase === 'playing' && shopOpen && !dialogue}
                zIndex={windowManager.getZIndex('shop-window')}
                hud={hud}
                onBuySupply={handleBuySupply}
                onClose={handleCloseShop}
                onBackdropClick={() => windowManager.handleOutsideClick('shop-window')}
              />
              <HeroModal
                open={phase === 'playing' && heroOpen && !forgeOpen && !bankOpen && !shopOpen}
                zIndex={windowManager.getZIndex('hero-window')}
                activeTab={heroTab}
                hud={hud}
                heroConfig={heroConfig}
                onChangeTab={setHeroTab}
                onAllocateSkill={handleAllocateSkill}
                onUseItem={handleUseInventoryItem}
                onUseSlot={handleUseSlot}
                onEquipGear={handleEquipGear}
                onUnequipGear={handleUnequipGear}
                onSelectSpell={handleSelectSpell}
                onOpenInventory={() => windowManager.open('inventory-window')}
                onClose={handleCloseHero}
                onBackdropClick={() => windowManager.handleOutsideClick('hero-window')}
              />
              <BlacksmithModal
                open={phase === 'playing' && forgeOpen && !bankOpen && !shopOpen}
                zIndex={windowManager.getZIndex('forge-window')}
                hud={hud}
                onCraft={handleCraftGear}
                onUpgrade={handleUpgradeGear}
                onEquip={handleEquipGear}
                onBuySupply={handleBuySupply}
                onClose={handleCloseForge}
                onBackdropClick={() => windowManager.handleOutsideClick('forge-window')}
              />
              <WorldMapOverlay
                open={phase === 'playing' && worldMapOpen && !dialogue}
                playerPos={{ x: liveMapPos.x, z: liveMapPos.z }}
                playerYawDeg={liveMapPos.yawDeg}
                worldSeed={hud.worldSeed}
                towns={hud.towns}
                onClose={() => windowManager.close('world-map')}
              />
              <TouchControls
                visible={phase === 'playing' && touchVisible && !dialogue && !anyModalOpen && !worldMapOpen}
                onJoystickMove={handleJoystickMove}
              />
            </>
          )}

          {/* Pause Modal (Esc) */}
          {phase === 'paused' && !recustomizeOpen && (
            <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/75">
              <div className="rpg-panel max-w-sm w-full p-6 text-center">
                <h2 className="font-display text-2xl font-bold text-[#c9a227] mb-2">Juego en Pausa</h2>
                <p className="text-xs text-[#a0a0a0] mb-5">
                  Nivel <span className="font-mono-num font-bold text-[#e0e0e0]">{hud.level}</span> · Enemigos{' '}
                  <span className="font-mono-num font-bold text-[#e0e0e0]">{hud.kills}</span>
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => engineRef.current?.togglePause()}
                    className="rpg-btn-primary py-2.5 text-sm font-bold cursor-pointer"
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveGame}
                    className="rpg-btn-secondary py-2 text-xs font-semibold cursor-pointer"
                  >
                    Guardar Partida
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenRecustomize}
                    className="rpg-btn-secondary py-2 text-xs font-semibold cursor-pointer"
                  >
                    Cambiar apariencia
                  </button>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleAudio()}
                    className="rpg-btn-secondary py-2 text-xs font-semibold cursor-pointer"
                  >
                    Audio: {hud.audioEnabled ? 'Activado' : 'Silenciado'}
                  </button>
                  <button
                    type="button"
                    onClick={cycleQualityMode}
                    className="rpg-btn-secondary py-2 text-xs font-semibold cursor-pointer"
                  >
                    Calidad Gráfica: {QUALITY_LABELS[qualityMode]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTouchVisible((v) => !v)}
                    className="rpg-btn-secondary py-2 text-xs font-semibold cursor-pointer"
                  >
                    Controles Táctiles: {touchVisible ? 'Activados' : 'Desactivados'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <CharacterCreatorModal
            open={phase === 'paused' && recustomizeOpen}
            mode="edit"
            initialConfig={heroConfig}
            initialName={hud.heroName}
            initialSeed={seedInput}
            hasSavedGame={hasSavedGame}
            onConfirm={handleConfirmRecustomize}
            onCancel={() => setRecustomizeOpen(false)}
          />

          {/* Game Over Modal */}
          {phase === 'gameover' && (
            <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/82">
              <div className="rpg-panel max-w-md w-full p-7 text-center border-[#ef4444]">
                <h2 className="font-display text-3xl font-extrabold text-[#ef4444] mb-1">Has Caído</h2>
                <p className="text-xs uppercase tracking-[0.18em] text-[#a0a0a0] mb-4">Tu leyenda aún no termina</p>
                <div className="rpg-subpanel p-3.5 text-sm text-[#e0e0e0] mb-5 font-mono-num">
                  Nivel {hud.level} · Enemigos derrotados {hud.kills}
                </div>
                <button
                  type="button"
                  onClick={() => engineRef.current?.retryAfterGameOver()}
                  className="rpg-btn-primary px-9 py-3 font-display text-base font-extrabold tracking-wider cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-[3000] bg-[#07080d] transition-opacity duration-300 ${
          fadeOverlay ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
