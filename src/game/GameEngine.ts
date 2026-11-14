import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoundEngine } from './audio';
import { ChunkManager } from './ChunkManager';
import {
  DEFAULT_HERO_CONFIG,
  GAME_SAVE_STORAGE_KEY,
  HERO_SAVE_VERSION,
  HeroConfig,
  migrateHeroConfig,
  TIME,
} from './Constants';
import {
  BIOME_CONFIGS,
  computeBiomeLightingAt,
  VILLAGE_BIOME_PROFILE,
} from './core/BiomeSystem';
import { createAdditivePointsMaterial } from './core/EntityShader';
import { GrassSharedUniforms } from './core/GrassChunk';
import { PALETTE_ENVIRONMENT, PALETTE_SKY } from './core/PaletteEnvironment';
import { ProgressionSystem } from './core/ProgressionSystem';
import { BESTIARY, BestiaryMobId, hexStringToNumber } from './Bestiary';
import { DayNightCycle } from './DayNightCycle';
import { gameEventBus } from './EventBus';
import { FloatTextSystem } from './FloatTextSystem';
import { Hero } from './Hero';
import { InteractableEntry, InteractionSystem } from './InteractionSystem';
import { NameplateSystem, NameplateTarget } from './NameplateSystem';
import { registerSharedWebGLRenderer } from './OffscreenSnapshotRenderer';
import {
  getSpawnZoneById,
  pickBestiaryMobForPosition,
  pickZoneSpawnPoint,
  pickZoneVariantForDistance,
  SPAWN_ZONES,
} from './SpawnZones';
import {
  createProceduralNpcPortrait,
  ProceduralEnemyActor,
  ProceduralNpcActor,
} from './ProceduralActors';
import { isSoftwareWebGL } from './webglDetect';
import { ProceduralChest } from './ProceduralChest';
import { ItemArchetype, ItemEntity, resolveItemArchetype } from './ProceduralItem';
import {
  createCrystalShrineGroup,
  createHouseGroup,
  createRuinPillarGroup,
  createStoneWellGroup,
  createTorchGroup,
  TorchEntry,
} from './props3d';
import {
  ARMOR_PIECES,
  ARMOR_PIECE_MAP,
  createEmptyMaterials,
  formatGearStats,
  GEAR_SLOT_LABEL,
  GEAR_SLOT_ORDER,
  getGearDef,
  getGearStyle,
  getUpgradeMultiplier,
  getUpgradeRecipe,
  MATERIAL_META,
  MAX_UPGRADE_TIER,
  RARITY_COLOR,
  rollDeterministicLoot,
  WEAPONS,
  WEAPON_MAP,
} from './lootTable';
import { createEmptySkills, isSkillUnlocked, SKILL_NODE_MAP, SPELL_DEFS } from './skillTree';
import {
  ArmorPieceDef,
  BANK_CAPACITY,
  BiomeId,
  DialoguePayload,
  EnemyKind,
  ForgeItemSnapshot,
  GamePhase,
  GearSlot,
  HeroSkills,
  HudSnapshot,
  INVENTORY_CAPACITY,
  InventoryItem,
  InventorySlotEntry,
  InventorySlotView,
  MaterialId,
  NpcRole,
  QualityMode,
  QuestProgress,
  SkillKey,
  SpellId,
  TownLocation,
  WeaponDef,
} from './types';
import {
  CHUNK_CONFIG,
  clamp,
  createRng,
  DEFAULT_WORLD_SEED,
  ensureWorldSeed,
  getBiomeId,
  getBiomeWeights,
  getNearestTownInfo,
  getPathFactor,
  getTerrainHeight,
  getWorldTowns,
  hashChunkCoords,
  isLiquidAt,
  LANDMARKS,
  lerp,
  PLAY_BOUND,
} from './worldMath';

function xpForNextLevel(level: number): number {
  if (level <= 1) return 260;
  return Math.round(240 + level * 65 + level * level * 4.5);
}

const BIOME_NAMES: Record<BiomeId, string> = {
  0: 'Pradera Esmeralda',
  1: 'Bosque Ancestral',
  2: 'Tierras Volcánicas',
  3: 'Tierras Rocosas',
  4: 'Tierras Nevadas',
};

interface Collider {
  x: number;
  z: number;
  r: number;
}

interface EnemyEntity {
  id: string;
  type: EnemyKind;
  biome: BiomeId;
  name: string;
  level: number;
  isBoss: boolean;
  isElemental: boolean;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  dmg: number;
  spd: number;
  range: number;
  aggro: number;
  xp: number;
  radius: number;
  atkCd: number;
  atkAnim: number;
  windup: number;
  windupDuration: number;
  flash: number;
  squash: number;
  slowTimer: number;
  dead: boolean;
  respawnTimer: number;
  respawnable: boolean;
  actor: ProceduralEnemyActor;
  telegraphMesh: THREE.Mesh;
  plateHeight: number;
  phaseOffset: number;
  nocturnalOnly?: boolean;
  zoneId?: string;
  bestiaryId?: BestiaryMobId;
  variantIndex?: 0 | 1 | 2;
  provoked?: boolean;
}

interface NpcEntity {
  id: NpcRole;
  name: string;
  role: NpcRole;
  pos: THREE.Vector3;
  actor: ProceduralNpcActor;
  marker: THREE.Sprite;
  talk: () => Omit<DialoguePayload, 'npcName' | 'npcRole' | 'portraitCanvas'>;
}

interface ProjectileEntity {
  pos: THREE.Vector3;
  vx: number;
  vz: number;
  fromPlayer: boolean;
  isElemental: boolean;
  attackerLevel: number;
  dmg: number;
  color: number;
  radius: number;
  aoe: boolean;
  aoeRadius: number;
  pierceLeft: number;
  hitSet: Set<EnemyEntity> | null;
  life: number;
  mesh: THREE.Mesh;
  lightSlot: { light: THREE.PointLight; active: boolean } | null;
}

interface PickupEntity {
  id: string;
  type: 'gold' | 'potion' | 'elixir' | 'weapon' | 'armor' | 'material';
  archetype: ItemArchetype;
  gearId?: string;
  materialId?: MaterialId;
  qty?: number;
  pos: THREE.Vector3;
  baseY: number;
  itemActor: ItemEntity;
  collected: boolean;
  life: number;
  pickupDelay: number;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
  gravity: number;
  size: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snap: HudSnapshot) => void;
  onToast: (msg: string) => void;
  onDialogue: (payload: DialoguePayload | null) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onContextLost: (lost: boolean) => void;
  onToggleHeroPanel?: () => void;
  onForgeOpen?: (open: boolean) => void;
  onBankOpen?: (open: boolean) => void;
}

// Pre-allocated scratch helpers (zero per-frame GC)
const _scratchVec = new THREE.Vector3();
const _scratchCol = new THREE.Color();
const _scratchAim = new THREE.Vector2();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camTargetDelta = new THREE.Vector3();
const _desiredCamFollow = new THREE.Vector3();
const _shakeOffset = new THREE.Vector3();
const _tapTargetPos = new THREE.Vector3();
const _biomeLightDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
const _sunLightDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const _biomeAmbientTint = new THREE.Color(1, 1, 1);
const _curSky = new THREE.Color(PALETTE_SKY.DAY_SKY);

function createStarterSlots(): Array<InventorySlotEntry | null> {
  const slots: Array<InventorySlotEntry | null> = Array.from({ length: INVENTORY_CAPACITY }, () => null);
  slots[0] = { id: 'potion', category: 'consumable', qty: 1 };
  slots[1] = { id: 'elixir', category: 'consumable', qty: 1 };
  slots[2] = { id: 'coins', category: 'currency', qty: 15 };
  return slots;
}

function createEmptyBankSlots(): Array<InventorySlotEntry | null> {
  return Array.from({ length: BANK_CAPACITY }, () => null);
}

export class EldoriaGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  public audio = new SoundEngine();

  private isSoftwareGl: boolean;
  private isTouchDevice: boolean;
  private seedLabel: string;
  private worldSeed: number;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private dynamicLightPool: { light: THREE.PointLight; active: boolean }[] = [];

  private grassUniforms: GrassSharedUniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
    uWindStrength: { value: 0.22 },
    uPlayerPos: { value: new THREE.Vector3(0, 0, 19) },
  };
  private landmarkGroup = new THREE.Group();
  private landmarkColliders: Collider[] = [];
  private npcColliders: Collider[] = [];
  private villageWindows: THREE.MeshLambertMaterial[] = [];
  private worldTorches: TorchEntry[] = [];
  private torchLightPool: THREE.PointLight[] = [];
  private chunkManager!: ChunkManager;

  private crystalPos = new THREE.Vector3();
  private crystalMesh!: THREE.Mesh;
  private crystalLight!: THREE.PointLight;
  private bankChest: ProceduralChest | null = null;
  private bankChestPos = new THREE.Vector3(-6.4, 0, 13.4);

  private slashMesh!: THREE.Mesh;
  private slashMat!: THREE.MeshBasicMaterial;
  private hero!: Hero;
  private heroConfig: HeroConfig = { ...DEFAULT_HERO_CONFIG };
  private talkingNpc: NpcEntity | null = null;

  // Shared projectile, pickup & enemy assets (zero per-spawn GPU allocation)
  private projGeo!: THREE.SphereGeometry;
  private projMatCache = new Map<number, THREE.MeshBasicMaterial>();
  private projMeshPool: THREE.Mesh[] = [];
  private itemPoolByArch = new Map<ItemArchetype, ItemEntity[]>();
  private towns: TownLocation[] = [];

  private enemyTeleGeoCache = new Map<EnemyKind, THREE.RingGeometry>();
  private teleMatNormal!: THREE.MeshBasicMaterial;
  private teleMatBoss!: THREE.MeshBasicMaterial;
  private interactionSystem = new InteractionSystem();
  private interactablesBuffer: InteractableEntry[] = [];
  private enemyHitObjects: THREE.Object3D[] = [];
  private nextEntityId = 1;

  private npcs: NpcEntity[] = [];
  private enemies: EnemyEntity[] = [];
  private bosses: EnemyEntity[] = [];
  private targetEnemy: EnemyEntity | null = null;
  private lastEmittedTargetId: string | null = null;
  private defeatedBossKinds = new Set<EnemyKind>();
  private biomeLevelBonus: Record<BiomeId, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  private projectiles: ProjectileEntity[] = [];
  private pickups: PickupEntity[] = [];
  private waterRippleTimer = 0;

  // Zero-GC Object-Pooled Particle System (single THREE.Points + AdditiveBlending)
  private readonly MAX_PARTICLES = 280;
  private particlePool: ParticleSlot[] = [];
  private freeParticleIds: number[] = [];
  private activeParticleIds: number[] = [];
  private pointsMesh!: THREE.Points;
  private pointsGeo!: THREE.BufferGeometry;
  private pointsMat!: THREE.ShaderMaterial;
  private pointPosArr!: Float32Array;
  private pointSizeArr!: Float32Array;
  private pointAlphaArr!: Float32Array;
  private pointColorArr!: Float32Array;

  private floatTextSystem = new FloatTextSystem(16);
  private nameplateSystem = new NameplateSystem();
  private nameplateTargets: NameplateTarget[] = [];

  // Luciérnagas nocturnas de bosque/pradera (THREE.Points + AdditiveBlending, cero GC)
  private readonly MAX_FIREFLIES = 160;
  private firefliesMesh!: THREE.Points;
  private firefliesGeo!: THREE.BufferGeometry;
  private firefliesMat!: THREE.ShaderMaterial;
  private fireflyPosArr!: Float32Array;
  private fireflySizeArr!: Float32Array;
  private fireflyAlphaArr!: Float32Array;
  private fireflyColorArr!: Float32Array;
  private fireflySeeds!: Float32Array;
  private firefliesActiveCount = 0;

  private viewSize = 11.5;
  private camOffset = new THREE.Vector3(0, 8, 12);
  private camFollowPos = new THREE.Vector3(0, 0.12, 19);
  private shadowMapSize: number;
  private tapMarkerMesh!: THREE.Mesh;
  private tapMarkerMat!: THREE.MeshBasicMaterial;
  private tapStuckTimer = 0;
  private tapLastDistSq = Infinity;
  private autoAttackCd = 0;
  private potionHpCd = 0;
  private potionMpCd = 0;
  private pointerDownState = {
    active: false,
    x: 0,
    y: 0,
    time: 0,
    button: 0,
  };

  private clock = new THREE.Clock();
  private elapsed = 0;
  private dayNightCycle = new DayNightCycle(TIME.DAY_START_HOUR);
  private ambientParticleTimer = 0;
  private hudSyncTimer = 0;
  private compassTimer = 0;
  private fullInvToastCd = 0;
  private lastHudSig = '';
  private lastHeavyHudSig = '';
  private cachedForgeItems: ForgeItemSnapshot[] = [];
  private cachedInventory: InventoryItem[] = [];
  private cachedInventorySlots: Array<InventorySlotView | null> = [];
  private cachedBankSlots: Array<InventorySlotView | null> = [];
  private lastHealthSig = '';
  private lastManaSig = '';
  private lastExpSig = '';
  private screenShake = 0;
  private hitstopTimer = 0;

  // Arranque por defecto en Alto Rendimiento para máxima fluidez inicial
  private qualityMode: QualityMode = 'performance';
  private qualityTier: 0 | 1 | 2 = 2;
  private avgFrameMs = 16.6;
  private perfEvalTimer = 0;
  private perfObserver: PerformanceObserver | null = null;
  private longTaskCount = 0;
  private maxLongTaskMs = 0;

  private frameId = 0;
  private loopActive = false;
  private disposed = false;
  private contextLost = false;

  public phase: GamePhase = 'title';
  private isDialogueOpen = false;
  private isHeroModalOpen = false;
  private isForgeOpen = false;
  private isBankOpen = false;
  private isWorldMapOpen = false;
  private combatTimer = 0;
  private isInCombat = false;
  private lastZoneBannerTownId = '';
  private keys: Record<string, boolean> = {};
  private joyVec = new THREE.Vector2(0, 0);
  private actionBuffer: { type: 'attack' | 'spell' | 'dash'; ttl: number; aim: THREE.Vector2 | null } | null = null;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hitPoint = new THREE.Vector3();

  public quests: QuestProgress = { q1: 0, q2: 0, q3: 0, mage: 0, warrior: 0 };

  public player = {
    heroName: 'Aelion',
    pos: new THREE.Vector3(0, 0.12, 19),
    dir: 0,
    facing: new THREE.Vector2(0, 1),
    walkPhase: 0,
    hp: 32,
    maxHp: 32,
    mp: 45,
    maxMp: 45,
    xp: 0,
    xpNext: xpForNextLevel(1),
    level: 1,
    potions: 1,
    elixirs: 1,
    baseAttack: 5,
    equipmentBonus: 0,
    atkDmg: 5,
    magDmg: 14,
    def: 0,
    meleeReach: 1.65,
    baseMoveSpeed: 6.5,
    atkSpeedPct: 0,
    critChancePct: 5,
    elemResistPct: 0,
    equipped: {
      weapon: null,
      offhand: null,
      helmet: null,
      armor: null,
      gloves: null,
      boots: null,
    } as Record<GearSlot, string | null>,
    ownedGear: [] as string[],
    ownedGearQty: {} as Record<string, number>,
    gearUpgrades: {} as Record<string, number>,
    inventorySlots: createStarterSlots(),
    bankSlots: createEmptyBankSlots(),
    learnedSpells: [] as SpellId[],
    activeSpell: null as SpellId | null,
    skillPoints: 0,
    skills: createEmptySkills() as HeroSkills,
    materials: createEmptyMaterials(),
    killCounters: {} as Partial<Record<EnemyKind, number>>,
    kills: 0,
    slimeKills: 0,
    forestKills: 0,
    defeatedBiomeBosses: 0,
    hasCrystal: false,
    atkCd: 0,
    atkAnim: 0,
    atkAnimDur: 0.22,
    slashBaseAng: 0,
    slashDirSign: 1 as 1 | -1,
    comboStep: 0 as 0 | 1 | 2,
    comboTimer: 0,
    comboHitCount: 0,
    comboDmgSum: 0,
    castAnim: 0,
    magCd: 0,
    dashCd: 0,
    dashTimer: 0,
    invuln: 0,
    stepTimer: 0,
    squash: 0,
  };

  private disposableGeos: THREE.BufferGeometry[] = [];
  private disposableMats: THREE.Material[] = [];

  constructor(container: HTMLElement, callbacks: EngineCallbacks, initialSeed: string = DEFAULT_WORLD_SEED) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = isSoftwareWebGL();
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.seedLabel = initialSeed.trim() || DEFAULT_WORLD_SEED;
    this.worldSeed = ensureWorldSeed(this.seedLabel);

    // Renderer único de Eldoria (sin preserveDrawingBuffer para reducir presión en memoria de GPU)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, this.isTouchDevice ? 1.5 : 2)
    );
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    registerSharedWebGLRenderer(this.renderer);

    // Scene & Fog (100% procedural, zero textures / zero PMREM)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE_SKY.DAY_SKY);
    this.scene.fog = new THREE.Fog(PALETTE_SKY.DAY_SKY, 42, 115);

    // Camera (Perspectiva 3D estilo Flyff Universe + OrbitControls)
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
    this.camera.position.copy(this.camOffset);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.5, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 25;
    this.controls.minPolarAngle = Math.PI / 6;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.update();

    // Indicador procedural de destino para movimiento por toque/clic
    const tapGeo = new THREE.RingGeometry(0.28, 0.48, 24);
    tapGeo.rotateX(-Math.PI / 2);
    this.tapMarkerMat = new THREE.MeshBasicMaterial({
      color: 0xffd230,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.tapMarkerMesh = new THREE.Mesh(tapGeo, this.tapMarkerMat);
    this.tapMarkerMesh.visible = false;
    this.tapMarkerMesh.renderOrder = 8;
    this.disposableGeos.push(tapGeo);
    this.disposableMats.push(this.tapMarkerMat);
    this.scene.add(this.tapMarkerMesh);

    // Lighting
    this.hemiLight = new THREE.HemisphereLight(PALETTE_SKY.DAY_SKY, PALETTE_ENVIRONMENT.GRASS_SHADOW, 0.78);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff1d6, 1.25);
    this.dirLight.position.set(22, 34, 18);
    this.dirLight.castShadow = !this.isSoftwareGl;
    this.shadowMapSize = this.isTouchDevice ? 1024 : 2048;
    this.dirLight.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 95;
    const dCam = 28;
    this.dirLight.shadow.camera.left = -dCam;
    this.dirLight.shadow.camera.right = dCam;
    this.dirLight.shadow.camera.top = dCam;
    this.dirLight.shadow.camera.bottom = -dCam;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Compact PointLight pool (2 on touch/software, 3 on desktop) to keep PBR fragment shader fast
    const lightPoolCount = this.isTouchDevice || this.isSoftwareGl ? 2 : 3;
    for (let i = 0; i < lightPoolCount; i++) {
      const pl = new THREE.PointLight(0xff7722, 0, 9, 1.6);
      this.scene.add(pl);
      this.dynamicLightPool.push({ light: pl, active: false });
    }

    // Pool compacto de luces dinámicas para antorchas cercanas (máx. 3 activas según proximidad)
    for (let i = 0; i < 3; i++) {
      const tl = new THREE.PointLight(0xff8c33, 0, 14, 1.5);
      this.scene.add(tl);
      this.torchLightPool.push(tl);
    }

    // Materiales compartidos para telegrafía de ataques (cero materiales por enemigo)
    this.teleMatNormal = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.teleMatBoss = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.disposableMats.push(this.teleMatNormal, this.teleMatBoss);

    // Shared Projectile Geometry (100% procedural, zero textures)
    this.projGeo = new THREE.SphereGeometry(1, 8, 8);
    this.disposableGeos.push(this.projGeo);

    // Pre-allocated Zero-GC Pooled Particle System (THREE.Points + AdditiveBlending)
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r: 1,
        g: 1,
        b: 1,
        life: 0,
        maxLife: 1,
        gravity: 0,
        size: 1,
      });
    }
    for (let i = this.MAX_PARTICLES - 1; i >= 0; i--) {
      this.freeParticleIds.push(i);
    }
    this.pointPosArr = new Float32Array(this.MAX_PARTICLES * 3);
    this.pointSizeArr = new Float32Array(this.MAX_PARTICLES);
    this.pointAlphaArr = new Float32Array(this.MAX_PARTICLES);
    this.pointColorArr = new Float32Array(this.MAX_PARTICLES * 3);
    this.pointsGeo = new THREE.BufferGeometry();
    this.pointsGeo.setAttribute('position', new THREE.BufferAttribute(this.pointPosArr, 3));
    this.pointsGeo.setAttribute('aSize', new THREE.BufferAttribute(this.pointSizeArr, 1));
    this.pointsGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pointAlphaArr, 1));
    this.pointsGeo.setAttribute('aColor', new THREE.BufferAttribute(this.pointColorArr, 3));
    this.pointsMat = createAdditivePointsMaterial();
    this.pointsMesh = new THREE.Points(this.pointsGeo, this.pointsMat);
    this.pointsMesh.frustumCulled = false;
    this.pointsMesh.visible = false;
    this.scene.add(this.pointsMesh);

    // Sistema pooled de luciérnagas nocturnas (THREE.Points + AdditiveBlending)
    this.initFireflies();

    // Build World, Hero, NPCs, Enemies, Towns
    this.towns = getWorldTowns(this.worldSeed);
    this.player.pos.set(0, getTerrainHeight(0, 19, this.worldSeed), 19);
    this.snapCameraToPlayer();
    this.scene.add(this.landmarkGroup);
    this.buildWorld();
    this.applyQualityTier(2);
    this.buildHero();
    this.buildNpcs();
    this.spawnInitialEnemies();
    this.syncDerivedFromSlots();
    this.dayNightCycle.emitInitialEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Medición de rendimiento con PerformanceObserver + renderer.info
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.perfObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (let i = 0; i < entries.length; i++) {
            const dur = entries[i].duration;
            this.longTaskCount++;
            if (dur > this.maxLongTaskMs) this.maxLongTaskMs = dur;
          }
        });
        this.perfObserver.observe({ type: 'longtask', buffered: true });
      } catch {
        this.perfObserver = null;
      }
    }

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__eldoriaDebug = {
        getPerf: () => this.getPerformanceReport(),
        setTimeHours: (hours: number) => {
          this.dayNightCycle.setTimeHours(hours, true);
          this.updateDayNight(0);
          this.emitHud(true);
        },
        getTimeHours: () => this.dayNightCycle.getTimeHours(),
        getPhase: () => this.dayNightCycle.getSnapshot(),
      };
    }

    this.bindEvents();
    this.emitHud(true);
    this.emitCompass();
    this.startRenderLoop();
  }

  public getPerformanceReport() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
      avgFrameMs: Number(this.avgFrameMs.toFixed(2)),
      longTasks: this.longTaskCount,
      maxLongTaskMs: Number(this.maxLongTaskMs.toFixed(1)),
    };
  }

  private initFireflies(): void {
    this.fireflyPosArr = new Float32Array(this.MAX_FIREFLIES * 3);
    this.fireflySizeArr = new Float32Array(this.MAX_FIREFLIES);
    this.fireflyAlphaArr = new Float32Array(this.MAX_FIREFLIES);
    this.fireflyColorArr = new Float32Array(this.MAX_FIREFLIES * 3);
    // [ox, oz, heightOff, phase, speed] por luciérnaga
    this.fireflySeeds = new Float32Array(this.MAX_FIREFLIES * 5);

    for (let i = 0; i < this.MAX_FIREFLIES; i++) {
      const i5 = i * 5;
      const ang = ((i * 2.399963) % (Math.PI * 2));
      const rad = 2.5 + ((i * 73) % 100) * 0.21;
      this.fireflySeeds[i5] = Math.cos(ang) * rad;
      this.fireflySeeds[i5 + 1] = Math.sin(ang) * rad;
      this.fireflySeeds[i5 + 2] = 0.55 + ((i * 37) % 100) * 0.017;
      this.fireflySeeds[i5 + 3] = ((i * 19) % 628) * 0.01;
      this.fireflySeeds[i5 + 4] = 0.75 + ((i * 29) % 100) * 0.01;

      const i3 = i * 3;
      const warmLime = i % 3 === 0;
      this.fireflyColorArr[i3] = warmLime ? 0.85 : 0.99;
      this.fireflyColorArr[i3 + 1] = warmLime ? 0.99 : 0.9;
      this.fireflyColorArr[i3 + 2] = warmLime ? 0.48 : 0.35;
      this.fireflySizeArr[i] = 1.25 + (i % 4) * 0.25;
      this.fireflyAlphaArr[i] = 0;
    }

    this.firefliesGeo = new THREE.BufferGeometry();
    this.firefliesGeo.setAttribute('position', new THREE.BufferAttribute(this.fireflyPosArr, 3));
    this.firefliesGeo.setAttribute('aSize', new THREE.BufferAttribute(this.fireflySizeArr, 1));
    this.firefliesGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.fireflyAlphaArr, 1));
    this.firefliesGeo.setAttribute('aColor', new THREE.BufferAttribute(this.fireflyColorArr, 3));
    this.firefliesGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 32);
    this.firefliesGeo.setDrawRange(0, 0);

    this.firefliesMat = createAdditivePointsMaterial();
    this.firefliesMesh = new THREE.Points(this.firefliesGeo, this.firefliesMat);
    this.firefliesMesh.frustumCulled = true;
    this.firefliesMesh.visible = false;
    this.scene.add(this.firefliesMesh);
  }

  private buildWorld(): void {
    // Dynamic 32x32 Chunk Streaming + Object Pooling + Async Web Worker Terrain/Vegetation/Liquid (zero textures)
    this.chunkManager = new ChunkManager(this.scene, this.grassUniforms, this.worldSeed);
    this.chunkManager.preloadImmediate(this.player.pos.x, this.player.pos.z, 1);

    this.buildLandmarks();
  }

  private buildLandmarks(): void {
    while (this.landmarkGroup.children.length > 0) {
      const child = this.landmarkGroup.children[0];
      this.landmarkGroup.remove(child);
      if (!child.userData.sharedPropAssets) {
        child.traverse((obj) => {
          if (obj instanceof THREE.Mesh && !obj.userData.sharedPropAssets) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }
    this.landmarkColliders.length = 0;
    this.villageWindows.length = 0;
    this.worldTorches.length = 0;

    // Village cottages
    [
      [-8.5, 11, 0.25],
      [8.5, 10.5, -0.22],
      [-9.5, 22, 0.55],
    ].forEach(([hx, hz, rot]) => {
      this.landmarkGroup.add(createHouseGroup(hx, hz, rot, this.villageWindows, this.worldSeed));
      const ox = Math.cos(rot) * 0.62;
      const oz = -Math.sin(rot) * 0.62;
      this.landmarkColliders.push({ x: hx + ox, z: hz + oz, r: 1.9 });
      this.landmarkColliders.push({ x: hx - ox, z: hz - oz, r: 1.9 });
    });

    this.landmarkGroup.add(createStoneWellGroup(LANDMARKS.village.x, LANDMARKS.village.z, this.worldSeed));
    this.landmarkColliders.push({ x: LANDMARKS.village.x, z: LANDMARKS.village.z, r: 1.15 });

    // Refugios fronterizos para orientarse en el continente irregular
    this.landmarkGroup.add(createStoneWellGroup(LANDMARKS.oakOutpost.x, LANDMARKS.oakOutpost.z, this.worldSeed));
    this.landmarkColliders.push({ x: LANDMARKS.oakOutpost.x, z: LANDMARKS.oakOutpost.z, r: 1.15 });
    this.landmarkGroup.add(createStoneWellGroup(LANDMARKS.frostOutpost.x, LANDMARKS.frostOutpost.z, this.worldSeed));
    this.landmarkColliders.push({ x: LANDMARKS.frostOutpost.x, z: LANDMARKS.frostOutpost.z, r: 1.15 });

    [
      [-3.2, 13.2],
      [3.2, 13.2],
      [LANDMARKS.oakOutpost.x - 2.6, LANDMARKS.oakOutpost.z + 2.1],
      [LANDMARKS.oakOutpost.x + 2.6, LANDMARKS.oakOutpost.z + 2.1],
      [LANDMARKS.frostOutpost.x - 2.6, LANDMARKS.frostOutpost.z + 2.1],
      [LANDMARKS.frostOutpost.x + 2.6, LANDMARKS.frostOutpost.z + 2.1],
      [LANDMARKS.meadowArena.x - 8, LANDMARKS.meadowArena.z],
      [LANDMARKS.forestArena.x + 8, LANDMARKS.forestArena.z + 5],
      [LANDMARKS.rockyArena.x + 7, LANDMARKS.rockyArena.z - 6],
      [LANDMARKS.snowArena.x - 7, LANDMARKS.snowArena.z - 6],
      [LANDMARKS.volcanicArena.x - 9, LANDMARKS.volcanicArena.z + 9],
    ].forEach(([tx, tz]) => {
      this.landmarkGroup.add(createTorchGroup(tx, tz, this.worldTorches, this.worldSeed));
    });

    // 5 Biome Boss Arenas
    const arenas: Array<{
      x: number;
      z: number;
      count: number;
      radius: number;
      style: 'meadow' | 'forest' | 'rocky' | 'snow' | 'volcanic';
      baseH: number;
    }> = [
      { x: LANDMARKS.meadowArena.x, z: LANDMARKS.meadowArena.z, count: 5, radius: 7.5, style: 'meadow', baseH: 2.2 },
      { x: LANDMARKS.forestArena.x, z: LANDMARKS.forestArena.z, count: 6, radius: 8.5, style: 'forest', baseH: 2.6 },
      { x: LANDMARKS.rockyArena.x, z: LANDMARKS.rockyArena.z, count: 6, radius: 8.8, style: 'rocky', baseH: 2.9 },
      { x: LANDMARKS.snowArena.x, z: LANDMARKS.snowArena.z, count: 6, radius: 8.8, style: 'snow', baseH: 3.0 },
      { x: LANDMARKS.volcanicArena.x, z: LANDMARKS.volcanicArena.z, count: 8, radius: 12, style: 'volcanic', baseH: 3.6 },
    ];
    for (const a of arenas) {
      for (let i = 0; i < a.count; i++) {
        const ang = (i / a.count) * Math.PI * 2;
        const rx = a.x + Math.cos(ang) * a.radius;
        const rz = a.z + Math.sin(ang) * a.radius;
        this.landmarkGroup.add(createRuinPillarGroup(rx, rz, this.worldSeed, a.baseH + (i % 2) * 1.1, a.style));
        this.landmarkColliders.push({ x: rx, z: rz, r: 0.65 });
      }
    }

    // Crystal Shrine behind Ignis Rex far NE
    const shrine = createCrystalShrineGroup(LANDMARKS.crystalShrine.x, LANDMARKS.crystalShrine.z, this.worldSeed);
    this.landmarkGroup.add(shrine.group);
    this.landmarkColliders.push({ x: LANDMARKS.crystalShrine.x, z: LANDMARKS.crystalShrine.z, r: 1.25 });
    this.crystalMesh = shrine.crystalMesh;
    this.crystalLight = shrine.crystalLight;
    this.crystalPos.copy(shrine.pos);

    // Cofre de almacenamiento procedural en la Aldea del Alba junto al Banquero
    if (!this.bankChest) {
      this.bankChest = new ProceduralChest();
      this.scene.add(this.bankChest.group);
    }
    const chestY = getTerrainHeight(this.bankChestPos.x, this.bankChestPos.z, this.worldSeed);
    this.bankChestPos.y = chestY;
    this.bankChest.group.position.set(this.bankChestPos.x, chestY, this.bankChestPos.z);
    this.bankChest.group.rotation.y = 0.35;
    this.landmarkColliders.push({ x: this.bankChestPos.x, z: this.bankChestPos.z, r: 0.65 });
  }

  public setHeroName(rawName: string): void {
    const clean = rawName.trim().slice(0, 18) || 'Aelion';
    if (this.player.heroName === clean) return;
    this.player.heroName = clean;
    this.emitHud(true);
  }

  public setFloatTextContainer(el: HTMLElement | null): void {
    this.floatTextSystem.setContainer(el);
  }

  public setNameplateContainer(el: HTMLElement | null): void {
    this.nameplateSystem.setContainer(el);
  }

  private setCombatTarget(enemy: EnemyEntity | null): void {
    const next = enemy && !enemy.dead ? enemy : null;
    this.targetEnemy = next;
    const nextId = next ? next.id : null;
    if (nextId !== this.lastEmittedTargetId) {
      this.lastEmittedTargetId = nextId;
      gameEventBus.emit(
        'target:changed',
        next
          ? {
              id: next.id,
              name: next.name,
              level: next.level,
              hp: Math.max(0, next.hp),
              maxHp: next.maxHp,
              isBoss: next.isBoss,
            }
          : null
      );
    }
  }

  private refreshHeroAppearance(): void {
    const eq = this.player.equipped;
    const wDef = eq.weapon ? WEAPON_MAP[eq.weapon] : undefined;
    const offDef = eq.offhand ? WEAPON_MAP[eq.offhand] : undefined;
    this.hero.setAppearance({
      weapon: getGearStyle(eq.weapon),
      offhand: getGearStyle(eq.offhand),
      isDaggerMain: wDef?.weaponKind === 'dagger',
      isDaggerOff: offDef?.weaponKind === 'dagger',
      helmet: getGearStyle(eq.helmet),
      armor: getGearStyle(eq.armor),
      gloves: getGearStyle(eq.gloves),
      boots: getGearStyle(eq.boots),
    });
  }

  private recalcPlayerStats(preserveRatio = true): void {
    const p = this.player;
    const hpRatio = preserveRatio && p.maxHp > 0 ? p.hp / p.maxHp : 1;
    const mpRatio = preserveRatio && p.maxMp > 0 ? p.mp / p.maxMp : 1;

    let bonusHp = 0;
    let bonusMp = 0;
    let bonusAtk = 0;
    let bonusMag = 0;
    let bonusDef = 0;
    let bonusMove = 0;
    let bonusAtkSpd = 0;
    let bonusCrit = 0;

    let equipmentBonus = 0;
    const rarityWeight = { comun: 1, poco_comun: 2, raro: 3, epico: 4, mitico: 5 } as const;

    const wId = p.equipped.weapon;
    const wDef = wId ? WEAPON_MAP[wId] : undefined;
    if (wDef && wId) {
      const upg = p.gearUpgrades[wId] ?? 0;
      const wMult = getUpgradeMultiplier(upg);
      bonusAtk += Math.round(wDef.atk * wMult);
      bonusMag += Math.round(wDef.mag * wMult);
      equipmentBonus += rarityWeight[wDef.rarity] * 2 + upg;
      if (wDef.atkSpeedPct) bonusAtkSpd += wDef.atkSpeedPct;
      if (wDef.critChancePct) bonusCrit += wDef.critChancePct;
    }

    // Doble empuñadura exclusiva de dagas: 100% velocidad de ataque + 50% de daño de la 2da daga
    const offId = p.equipped.offhand;
    const offDef = offId ? WEAPON_MAP[offId] : undefined;
    if (wDef?.weaponKind === 'dagger' && offDef?.weaponKind === 'dagger' && offId) {
      const offUpg = p.gearUpgrades[offId] ?? 0;
      const offMult = getUpgradeMultiplier(offUpg);
      bonusAtk += Math.round(offDef.atk * offMult * 0.5);
      bonusMag += Math.round(offDef.mag * offMult * 0.5);
      equipmentBonus += rarityWeight[offDef.rarity] + offUpg;
      if (offDef.atkSpeedPct) bonusAtkSpd += offDef.atkSpeedPct;
      if (offDef.critChancePct) bonusCrit += offDef.critChancePct;
    }

    const armorSlots: Array<Exclude<GearSlot, 'weapon' | 'offhand'>> = ['helmet', 'armor', 'gloves', 'boots'];
    for (const sl of armorSlots) {
      const id = p.equipped[sl];
      if (!id) continue;
      const aDef = ARMOR_PIECE_MAP[id];
      if (!aDef) continue;
      const upg = p.gearUpgrades[id] ?? 0;
      const mult = getUpgradeMultiplier(upg);
      bonusHp += Math.round(aDef.hp * mult);
      bonusMp += Math.round(aDef.mp * mult);
      bonusDef += Math.round(aDef.def * mult);
      equipmentBonus += rarityWeight[aDef.rarity] + upg;
      if (aDef.atk) bonusAtk += Math.round(aDef.atk * mult);
      if (aDef.mag) bonusMag += Math.round(aDef.mag * mult);
      if (aDef.moveSpeed) bonusMove += aDef.moveSpeed;
      if (aDef.atkSpeedPct) bonusAtkSpd += aDef.atkSpeedPct;
      if (aDef.critChancePct) bonusCrit += aDef.critChancePct;
    }

    p.maxHp = 32 + (p.level - 1) * 14 + p.skills.vitality * 24 + bonusHp;
    p.maxMp = 45 + (p.level - 1) * 9 + p.skills.magic * 10 + bonusMp;
    p.equipmentBonus = equipmentBonus;
    p.baseAttack = 5 + (p.level - 1) * 2 + p.skills.sword * 5 + bonusAtk;
    p.atkDmg = Math.round(p.baseAttack * (1 + equipmentBonus * 0.1));
    p.magDmg = 14 + (p.level - 1) * 4 + p.skills.magic * 9 + bonusMag;
    p.def = Math.floor((p.level - 1) * 0.5) + bonusDef;
    p.meleeReach = (wDef ? 1.85 + wDef.reach : 1.65) + p.skills.sword * 0.1;
    p.baseMoveSpeed = Number((6.5 + p.skills.agility * 0.45 + bonusMove).toFixed(2));
    p.atkSpeedPct = p.skills.atkSpeed * 9 + bonusAtkSpd;
    p.critChancePct = 5 + p.skills.crit * 7 + bonusCrit;
    p.elemResistPct = Math.min(50, p.skills.elemResist * 8);

    if (preserveRatio) {
      p.hp = clamp(Math.round(hpRatio * p.maxHp), 1, p.maxHp);
      p.mp = clamp(mpRatio * p.maxMp, 0, p.maxMp);
    } else {
      p.hp = p.maxHp;
      p.mp = p.maxMp;
    }
  }

  private buildHero(): void {
    this.hero = new Hero(undefined, this.heroConfig);
    this.hero.setWorldPosition(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.hero.setZoomOutline(this.viewSize);
    this.scene.add(this.hero.group);

    this.recalcPlayerStats(false);
    this.refreshHeroAppearance();

    // Procedural Melee attack crescent arc VFX (zero textures)
    this.slashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const slashShape = new THREE.Shape();
    slashShape.absarc(0, 0, 1.55, -1.1, 1.1, false);
    slashShape.absarc(-0.22, 0, 1.24, 1.1, -1.1, true);
    slashShape.closePath();
    const slashGeo = new THREE.ShapeGeometry(slashShape, 18);
    this.slashMesh = new THREE.Mesh(slashGeo, this.slashMat);
    this.slashMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.slashMesh);
    this.disposableGeos.push(slashGeo);
    this.disposableMats.push(this.slashMat);
  }

  private syncDerivedFromSlots(): void {
    const p = this.player;
    const mats = createEmptyMaterials();
    let potions = 0;
    let elixirs = 0;
    let hasCrystal = false;
    const gearCounts: Record<string, number> = {};
    const ownedSet = new Set<string>();

    for (const sl of GEAR_SLOT_ORDER) {
      const eqId = p.equipped[sl];
      if (!eqId) continue;
      ownedSet.add(eqId);
      gearCounts[eqId] = (gearCounts[eqId] ?? 0) + 1;
    }

    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      const s = p.inventorySlots[i];
      if (!s || s.qty <= 0) {
        p.inventorySlots[i] = null;
        continue;
      }
      if (s.id === 'potion') potions += s.qty;
      else if (s.id === 'elixir') elixirs += s.qty;
      else if (s.id === 'crystal') hasCrystal = true;
      else if (s.category === 'material' && s.id in mats) {
        mats[s.id as MaterialId] += s.qty;
      } else if (s.category === 'gear') {
        ownedSet.add(s.id);
        gearCounts[s.id] = (gearCounts[s.id] ?? 0) + s.qty;
      }
    }

    p.potions = potions;
    p.elixirs = elixirs;
    p.materials = mats;
    p.hasCrystal = hasCrystal;
    p.ownedGear = Array.from(ownedSet);
    p.ownedGearQty = gearCounts;
  }

  private buildSlotsView(slots: Array<InventorySlotEntry | null>, capacity: number): Array<InventorySlotView | null> {
    const out: Array<InventorySlotView | null> = [];
    for (let i = 0; i < capacity; i++) {
      const s = slots[i];
      if (!s || s.qty <= 0) {
        out.push(null);
        continue;
      }
      if (s.id === 'coins') {
        out.push({
          ...s,
          name: 'Monedas',
          rarity: 'poco_comun',
          desc: 'Moneda corriente de Eldoria. Se guarda y retira en el cofre del banco.',
        });
      } else if (s.id === 'potion') {
        out.push({
          ...s,
          name: 'Poción de Vida',
          desc: `Restaura ${55 + this.player.skills.vitality * 5}% de Vida máxima.`,
        });
      } else if (s.id === 'elixir') {
        out.push({
          ...s,
          name: 'Elixir de Maná',
          desc: 'Restaura 60% del Maná máximo.',
        });
      } else if (s.id === 'crystal') {
        out.push({
          ...s,
          name: 'Cristal Carmesí',
          rarity: 'mitico',
          desc: 'Reliquia sagrada recuperada de las Tierras Volcánicas.',
        });
      } else if (s.category === 'material') {
        const meta = MATERIAL_META[s.id as MaterialId];
        out.push({
          ...s,
          name: meta ? meta.name : s.id,
          rarity: meta?.rarity,
          desc: meta ? meta.desc : 'Material de forja.',
        });
      } else {
        const def = getGearDef(s.id);
        const tier = this.player.gearUpgrades[s.id] ?? 0;
        out.push({
          ...s,
          name: def ? (tier > 0 ? `${def.name} +${tier}` : def.name) : s.id,
          slot: def?.slot,
          rarity: def?.rarity,
          upgradeLevel: tier,
          desc: def ? `${formatGearStats(def, tier)} · ${def.desc}` : 'Equipo de aventura.',
        });
      }
    }
    return out;
  }

  private buildInventorySlotsView(): Array<InventorySlotView | null> {
    return this.buildSlotsView(this.player.inventorySlots, INVENTORY_CAPACITY);
  }

  private buildBankSlotsView(): Array<InventorySlotView | null> {
    return this.buildSlotsView(this.player.bankSlots, BANK_CAPACITY);
  }

  private emitInventoryUpdate(): void {
    const inv = this.buildInventorySlotsView();
    gameEventBus.emit('inventory:updated', {
      slots: inv,
      capacity: INVENTORY_CAPACITY,
    });
    if (this.isBankOpen) {
      gameEventBus.emit('bank:updated', {
        bankSlots: this.buildBankSlotsView(),
        inventorySlots: inv,
      });
    }
  }

  private emitBankUpdate(): void {
    gameEventBus.emit('bank:updated', {
      bankSlots: this.buildBankSlotsView(),
      inventorySlots: this.buildInventorySlotsView(),
    });
  }

  private emitCompass(): void {
    const info = getNearestTownInfo(this.player.pos.x, this.player.pos.z, this.towns);
    this.camera.getWorldDirection(_camForward);
    const playerYawDeg = (Math.atan2(_camForward.x, -_camForward.z) * 180) / Math.PI;
    gameEventBus.emit('compass:updated', {
      ...info,
      px: this.player.pos.x,
      pz: this.player.pos.z,
      seed: this.worldSeed,
      towns: this.towns,
      playerYawDeg,
    });
  }

  private emitPlayerBars(leveledUp = false): void {
    const hpSig = `${Math.ceil(this.player.hp)}/${this.player.maxHp}`;
    if (hpSig !== this.lastHealthSig) {
      this.lastHealthSig = hpSig;
      gameEventBus.emit('player:healthChanged', {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
      });
    }
    const mpSig = `${Math.floor(this.player.mp)}/${this.player.maxMp}`;
    if (mpSig !== this.lastManaSig) {
      this.lastManaSig = mpSig;
      gameEventBus.emit('player:manaChanged', {
        mp: this.player.mp,
        maxMp: this.player.maxMp,
      });
    }
    const expSig = `${this.player.xp}/${this.player.xpNext}/${this.player.level}`;
    if (expSig !== this.lastExpSig || leveledUp) {
      this.lastExpSig = expSig;
      gameEventBus.emit('player:expChanged', {
        xp: this.player.xp,
        xpNext: this.player.xpNext,
        level: this.player.level,
        leveledUp,
      });
    }
  }

  private getCoinsInInventory(): number {
    let total = 0;
    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      const s = this.player.inventorySlots[i];
      if (s && s.id === 'coins') total += s.qty;
    }
    return total;
  }

  private addCoinsToInventory(amount: number): boolean {
    if (amount <= 0) return true;
    return this.addItemToSlots({ id: 'coins', category: 'currency', qty: amount }, true);
  }

  private spendCoinsFromInventory(amount: number): boolean {
    if (amount <= 0) return true;
    return this.consumeFromSlots('coins', amount);
  }

  private addEntryToGrid(
    slots: Array<InventorySlotEntry | null>,
    capacity: number,
    entry: InventorySlotEntry,
    stackable: boolean
  ): boolean {
    if (stackable) {
      for (let i = 0; i < capacity; i++) {
        const s = slots[i];
        if (s && s.id === entry.id) {
          s.qty += entry.qty;
          return true;
        }
      }
    }
    for (let i = 0; i < capacity; i++) {
      if (!slots[i]) {
        slots[i] = { ...entry };
        return true;
      }
    }
    return false;
  }

  private canAddToSlots(id: string, stackable: boolean): boolean {
    const slots = this.player.inventorySlots;
    if (stackable) {
      for (let i = 0; i < INVENTORY_CAPACITY; i++) {
        if (slots[i]?.id === id) return true;
      }
    }
    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      if (!slots[i]) return true;
    }
    return false;
  }

  private addItemToSlots(entry: InventorySlotEntry, stackable: boolean): boolean {
    const added = this.addEntryToGrid(this.player.inventorySlots, INVENTORY_CAPACITY, entry, stackable);
    if (!added) return false;
    this.syncDerivedFromSlots();
    this.emitInventoryUpdate();
    return true;
  }

  private consumeFromSlots(id: string, amount: number): boolean {
    const slots = this.player.inventorySlots;
    let total = 0;
    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      if (slots[i]?.id === id) total += slots[i]!.qty;
    }
    if (total < amount) return false;

    let remaining = amount;
    for (let i = 0; i < INVENTORY_CAPACITY && remaining > 0; i++) {
      const s = slots[i];
      if (!s || s.id !== id) continue;
      if (s.qty <= remaining) {
        remaining -= s.qty;
        slots[i] = null;
      } else {
        s.qty -= remaining;
        remaining = 0;
      }
    }
    this.syncDerivedFromSlots();
    this.emitInventoryUpdate();
    return true;
  }

  private removeOneGearFromSlots(gearId: string): boolean {
    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      const s = this.player.inventorySlots[i];
      if (s && s.category === 'gear' && s.id === gearId) {
        if (s.qty > 1) s.qty--;
        else this.player.inventorySlots[i] = null;
        this.syncDerivedFromSlots();
        this.emitInventoryUpdate();
        return true;
      }
    }
    return false;
  }

  private grantGearItems(gearIds: string[]): void {
    for (const gid of gearIds) {
      const def = getGearDef(gid);
      if (!def) continue;
      if (this.player.gearUpgrades[gid] === undefined) {
        this.player.gearUpgrades[gid] = 0;
      }
      if (!this.player.equipped[def.slot]) {
        this.player.equipped[def.slot] = gid;
      } else if (!this.addItemToSlots({ id: gid, category: 'gear', qty: 1 }, false)) {
        this.spawnPickup(
          this.player.pos.x + this.player.facing.x * 1.4,
          this.player.pos.z + this.player.facing.y * 1.4,
          def.slot === 'weapon' ? 'weapon' : 'armor',
          gid,
          undefined,
          1,
          0.9
        );
        this.callbacks.onToast(`Inventario lleno: ${def.name} cayó al suelo.`);
      }
    }
    this.syncDerivedFromSlots();
    this.recalcPlayerStats(true);
    this.refreshHeroAppearance();
    this.emitInventoryUpdate();
  }

  private buildNpcs(): void {
    const configs: Array<{
      id: NpcRole;
      name: string;
      role: NpcRole;
      x: number;
      z: number;
      talk: NpcEntity['talk'];
    }> = [
      {
        id: 'elder',
        name: 'Anciano Aldric',
        role: 'elder',
        x: -2.6,
        z: 14.5,
        talk: () => {
          if (this.quests.q1 === 0) {
            return {
              text: `¡Bienvenido, ${this.player.heroName}! Los Slimes de la Pradera se han multiplicado por los alrededores de la aldea. ¿Podrías derrotar 5 Slimes para proteger los cultivos?`,
              buttons: [
                {
                  label: 'Aceptar Misión',
                  action: () => {
                    this.quests.q1 = 1;
                    this.audio.questDone();
                    this.callbacks.onToast('Misión aceptada: La Plaga Verde');
                    this.closeDialogue();
                    this.emitHud();
                  },
                },
                { label: 'Luego', secondary: true, action: () => this.closeDialogue() },
              ],
            };
          } else if (this.quests.q1 === 1) {
            if (this.player.slimeKills >= 5) {
              return {
                text: '¡Magnífico trabajo! La pradera vuelve a estar segura. Toma esta recompensa y habla con Lyra o Kael en la plaza.',
                buttons: [
                  {
                    label: 'Reclamar Recompensa',
                    action: () => {
                      this.quests.q1 = 2;
                      if (!this.addCoinsToInventory(60)) {
                        this.spawnPickup(this.player.pos.x + 0.9, this.player.pos.z, 'gold', undefined, undefined, 60, 0.8);
                      }
                      if (!this.addItemToSlots({ id: 'potion', category: 'consumable', qty: 2 }, true)) {
                        this.spawnPickup(this.player.pos.x + 1.1, this.player.pos.z, 'potion', undefined, undefined, 2, 0.8);
                      }
                      this.gainXp(90);
                      this.audio.questDone();
                      this.callbacks.onToast('¡Misión completada! +60 Monedas, +2 Pociones');
                      this.closeDialogue();
                      this.emitHud(true);
                    },
                  },
                ],
              };
            }
            return {
              text: `Los Slimes merodean al este de aquí. Llevas ${this.player.slimeKills}/5 derrotados.`,
              buttons: [{ label: 'Entendido', action: () => this.closeDialogue() }],
            };
          }
          return {
            text: 'Que la luz del alba guíe tu espada, joven héroe.',
            buttons: [{ label: 'Cerrar', action: () => this.closeDialogue() }],
          };
        },
      },
      {
        id: 'smith',
        name: 'Herrera Lyra',
        role: 'smith',
        x: 4.5,
        z: 13.5,
        talk: () => {
          const forgeBtn = {
            label: 'Abrir Forja de Materiales',
            action: () => {
              this.closeDialogue();
              this.callbacks.onForgeOpen?.(true);
            },
          };
          if (this.quests.q2 === 0) {
            return {
              text: `¡Saludos, ${this.player.heroName}! Solo forjo y mejoro armas, cascos, armaduras, guantes y botas si me traes los materiales de los 5 biomas. Derrota 4 enemigos en el Bosque Ancestral (noroeste) y te daré materiales iniciales.`,
              buttons: [
                forgeBtn,
                {
                  label: 'Aceptar Misión',
                  action: () => {
                    this.quests.q2 = 1;
                    this.audio.questDone();
                    this.callbacks.onToast('Misión aceptada: Acero en la Penumbra');
                    this.closeDialogue();
                    this.emitHud();
                  },
                },
                { label: 'Cerrar', secondary: true, action: () => this.closeDialogue() },
              ],
            };
          } else if (this.quests.q2 === 1) {
            if (this.player.forestKills >= 4) {
              return {
                text: '¡Buen temple! Toma Madera Ancestral (x3), Mena de Roca (x2), Mena de Bronce (x2) y 160 Monedas para forjar equipo en mi yunque.',
                buttons: [
                  {
                    label: 'Recibir Materiales',
                    action: () => {
                      this.quests.q2 = 2;
                      const matRewards: Array<[MaterialId, number]> = [
                        ['ancestral_wood', 3],
                        ['stone_ore', 2],
                        ['bronze_ore', 2],
                      ];
                      for (const [mId, q] of matRewards) {
                        if (!this.addItemToSlots({ id: mId, category: 'material', qty: q }, true)) {
                          this.spawnPickup(this.player.pos.x + 1.2, this.player.pos.z, 'material', undefined, mId, q, 0.8);
                        }
                      }
                      if (!this.addCoinsToInventory(160)) {
                        this.spawnPickup(this.player.pos.x + 0.9, this.player.pos.z, 'gold', undefined, undefined, 160, 0.8);
                      }
                      this.gainXp(320);
                      this.audio.questDone();
                      this.callbacks.onToast('¡Recibidos materiales de forja y +160 Monedas!');
                      this.closeDialogue();
                      this.emitHud(true);
                    },
                  },
                  forgeBtn,
                ],
              };
            }
            return {
              text: `El Bosque Ancestral queda al noroeste. Has derrotado ${this.player.forestKills}/4 enemigos allí. ¿Quieres revisar recetas en la forja?`,
              buttons: [forgeBtn, { label: 'Cerrar', secondary: true, action: () => this.closeDialogue() }],
            };
          }
          return {
            text: 'Mi yunque arde sin descanso. Tráeme menas, maderas, pieles y esquirlas de cada bioma para forjar tu set completo (incluso doble daga) y mejorarlo hasta +5.',
            buttons: [forgeBtn, { label: 'Cerrar', secondary: true, action: () => this.closeDialogue() }],
          };
        },
      },
      {
        id: 'scholar',
        name: 'Mago Theron',
        role: 'scholar',
        x: 0.4,
        z: 22.8,
        talk: () => {
          const buttons: Array<{ label: string; secondary?: boolean; disabled?: boolean; action: () => void }> = [];
          const learnSpell = (spellId: SpellId, xpReward: number, nextStage: 2 | 4 | 6, matId: MaterialId, req: number) => {
            this.consumeFromSlots(matId, req);
            this.quests.mage = nextStage;
            if (!this.player.learnedSpells.includes(spellId)) {
              this.player.learnedSpells.push(spellId);
            }
            this.player.activeSpell = spellId;
            this.gainXp(xpReward);
            this.audio.questDone();
            this.spawnBurst(this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z, 34, SPELL_DEFS[spellId].colorHex, 5.2, 0.9, -1.5);
            this.callbacks.onToast(`¡Hechizo aprendido: ${SPELL_DEFS[spellId].name}! (E / Clic Der)`);
            this.closeDialogue();
            this.emitHud(true);
          };

          let text = '';
          const mStage = this.quests.mage;
          if (mStage === 0) {
            text =
              `Bienvenido a mi torre, ${this.player.heroName}. La magia arcana no es un regalo gratuito: debes demostrar tu valía. Tráeme 2 Esencias de Slime de la Pradera para enseñarte el Pulso Arcano.`;
            buttons.push({
              label: 'Aceptar Senda Arcana (Pulso Arcano)',
              action: () => {
                this.quests.mage = 1;
                this.audio.questDone();
                this.callbacks.onToast('Misión del Mago: Reúne 2 Esencias de Slime');
                this.closeDialogue();
                this.emitHud(true);
              },
            });
          } else if (mStage === 1) {
            const have = this.player.materials.slime_gel ?? 0;
            if (have >= 2) {
              text = '¡Excelente! Estas Esencias de Slime vibran con energía pura. Prepárate para canalizar tu primer conjuro: Pulso Arcano.';
              buttons.push({
                label: 'Aprender Pulso Arcano',
                action: () => learnSpell('arcane_pulse', 120, 2, 'slime_gel', 2),
              });
            } else {
              text = `Necesito 2 Esencias de Slime de la Pradera al este para destilar el sello mágico (llevas ${have}/2).`;
            }
          } else if (mStage === 2) {
            text =
              'Ya dominas el Pulso Arcano. Si deseas controlar la escarcha, adéntrate en el Bosque Ancestral (noroeste) y tráeme 2 Maderas Ancestrales para forjar el foco de la Nova Glacial.';
            buttons.push({
              label: 'Aceptar: Ecos del Bosque (Nova Glacial)',
              action: () => {
                this.quests.mage = 3;
                this.audio.questDone();
                this.callbacks.onToast('Misión del Mago: Reúne 2 Maderas Ancestrales');
                this.closeDialogue();
                this.emitHud(true);
              },
            });
          } else if (mStage === 3) {
            const have = this.player.materials.ancestral_wood ?? 0;
            if (have >= 2) {
              text = '¡Madera Ancestral intacta! Con sus runas te concedo la Nova Glacial, capaz de congelar y frenar a quienes te rodeen.';
              buttons.push({
                label: 'Aprender Nova Glacial',
                action: () => learnSpell('frost_nova', 280, 4, 'ancestral_wood', 2),
              });
            } else {
              text = `Explora el Bosque Ancestral al noroeste y consigue 2 Maderas Ancestrales de los Ents o Goblins (llevas ${have}/2).`;
            }
          } else if (mStage === 4) {
            text =
              'Solo resta el secreto estelar de Eldoria. Viaja a las Tierras Nevadas al sureste y tráeme 2 Esquirlas de Hielo de los Gólems de Hielo para despertar la Lanza Astral.';
            buttons.push({
              label: 'Aceptar: Estrella de Escarcha (Lanza Astral)',
              action: () => {
                this.quests.mage = 5;
                this.audio.questDone();
                this.callbacks.onToast('Misión del Mago: Reúne 2 Esquirlas de Hielo');
                this.closeDialogue();
                this.emitHud(true);
              },
            });
          } else if (mStage === 5) {
            const have = this.player.materials.ice_shard ?? 0;
            if (have >= 2) {
              text = '¡Esquirlas eternas de hielo! Observa la constelación rúnica: ahora dominas la Lanza Astral, un rayo perforante devastador.';
              buttons.push({
                label: 'Aprender Lanza Astral',
                action: () => learnSpell('astral_lance', 600, 6, 'ice_shard', 2),
              });
            } else {
              text = `Los Gólems de Hielo de las Tierras Nevadas (sureste) dejan caer Esquirlas de Hielo (llevas ${have}/2).`;
            }
          } else {
            text =
              'Has completado todas las enseñanzas arcanas de la aldea (Pulso Arcano, Nova Glacial y Lanza Astral). Usa [R] para alternar entre tus hechizos.';
          }

          // Five Biomes Guardian Challenge (equal biome bosses + Crimson Crystal relic)
          if (this.quests.q3 === 0) {
            buttons.push({
              label: 'Desafío: Los Cinco Biomas',
              secondary: mStage < 6,
              action: () => {
                this.quests.q3 = 1;
                this.audio.questDone();
                this.callbacks.onToast('Misión aceptada: El Desafío de los Cinco Biomas');
                this.closeDialogue();
                this.emitHud(true);
              },
            });
          } else if (this.quests.q3 === 1 && this.player.hasCrystal && this.player.defeatedBiomeBosses >= 5) {
            text =
              '¡Has vencido a los cinco guardianes de bioma y recuperado el Cristal Carmesí! Eldoria celebra tu maestría, aunque los jefes volverán más fuertes cada minuto.';
            buttons.unshift({
              label: 'Entregar Cristal Carmesí',
              action: () => {
                this.quests.q3 = 2;
                if (!this.addCoinsToInventory(500)) {
                  this.spawnPickup(this.player.pos.x + 0.9, this.player.pos.z, 'gold', undefined, undefined, 500, 0.8);
                }
                this.gainXp(600);
                this.audio.levelUp();
                this.spawnBurst(this.player.pos.x, this.player.pos.y + 1.5, this.player.pos.z, 55, 0xfacc15, 6, 1.2, -2);
                this.callbacks.onToast('¡VICTORIA! Campeón de los Cinco Biomas (+500 Monedas)');
                this.closeDialogue();
                this.emitHud(true);
              },
            });
          } else if (this.quests.q3 === 1) {
            text += ` [Jefes de Bioma: ${this.player.defeatedBiomeBosses}/5 · Cristal: ${this.player.hasCrystal ? 'Obtenido' : 'Pendiente'}]`;
          }

          buttons.push({ label: 'Cerrar', secondary: true, action: () => this.closeDialogue() });
          return { text, buttons };
        },
      },
      {
        id: 'warrior',
        name: 'Maestro Guerrero Kael',
        role: 'warrior',
        x: -5.2,
        z: 18.2,
        talk: () => {
          const wStage = this.quests.warrior;
          if (wStage === 0) {
            return {
              text: '¿Vas a salir al mundo desarmado, recluta? Derrota 3 monstruos en los alrededores de la Pradera y vuelve conmigo: te entregaré tu espada básica, botas y guantes.',
              buttons: [
                {
                  label: 'Aceptar Entrenamiento I',
                  action: () => {
                    this.quests.warrior = 1;
                    this.audio.questDone();
                    this.callbacks.onToast('Maestro Guerrero: Derrota 3 enemigos');
                    this.closeDialogue();
                    this.emitHud(true);
                  },
                },
                { label: 'Luego', secondary: true, action: () => this.closeDialogue() },
              ],
            };
          } else if (wStage === 1) {
            if (this.player.kills >= 3) {
              return {
                text: '¡Buen golpe! Toma esta Espada de Aprendiz, Botas de Cuero Ligero y Guantes de Entrenamiento. Cuando derrotes 8 enemigos (o al Rey Slime Dorado), vuelve por tu casco y coraza.',
                buttons: [
                  {
                    label: 'Recibir Armas y Botas/Guantes',
                    action: () => {
                      this.quests.warrior = 2;
                      this.grantGearItems(['basic_sword', 'basic_boots', 'basic_gloves']);
                      this.gainXp(85);
                      this.audio.questDone();
                      this.spawnBurst(this.player.pos.x, this.player.pos.y + 1.0, this.player.pos.z, 24, 0xfacc15, 4, 0.7, -2);
                      this.callbacks.onToast('¡Equipo básico equipado! Revisa [C] -> Equipo');
                      this.closeDialogue();
                      this.emitHud(true);
                    },
                  },
                ],
              };
            }
            return {
              text: `Aún estás empezando tu entrenamiento (${this.player.kills}/3 enemigos derrotados).`,
              buttons: [{ label: 'Seguir entrenando', action: () => this.closeDialogue() }],
            };
          } else if (wStage === 2) {
            const bossDone = this.defeatedBossKinds.has('boss_meadow');
            if (this.player.kills >= 8 || bossDone) {
              return {
                text: '¡Temple de verdadero guerrero! Te otorgo el Yelmo de Recluta y la Cota de Soldado. Ahora llevas el set completo; cuando reúnas materiales, visita a Herrera Lyra para forjar piezas superiores.',
                buttons: [
                  {
                    label: 'Recibir Casco y Armadura',
                    action: () => {
                      this.quests.warrior = 3;
                      this.grantGearItems(['basic_helmet', 'basic_armor']);
                      if (!this.addCoinsToInventory(60)) {
                        this.spawnPickup(this.player.pos.x + 0.9, this.player.pos.z, 'gold', undefined, undefined, 60, 0.8);
                      }
                      this.gainXp(140);
                      this.audio.questDone();
                      this.spawnBurst(this.player.pos.x, this.player.pos.y + 1.1, this.player.pos.z, 28, 0xfbbf24, 4.5, 0.8, -2);
                      this.callbacks.onToast('¡Recibidos Yelmo de Recluta y Cota de Soldado!');
                      this.closeDialogue();
                      this.emitHud(true);
                    },
                  },
                ],
              };
            }
            return {
              text: `Derrota 8 enemigos en total (${this.player.kills}/8) o vence al Rey Slime Dorado para conseguir tu casco y coraza básica.`,
              buttons: [{ label: 'Entendido', action: () => this.closeDialogue() }],
            };
          }
          return {
            text: 'Recuerda abrir Héroe [C] -> Equipo para equipar o cambiar tu casco, armadura, guantes, botas y arma en cualquier momento. Cada jefe de bioma que reaparezca fortalecerá su zona +5 niveles.',
            buttons: [{ label: 'Cerrar', action: () => this.closeDialogue() }],
          };
        },
      },
      {
        id: 'merchant',
        name: 'Mercader Darío',
        role: 'merchant',
        x: 6.2,
        z: 18.0,
        talk: () => ({
          text: 'Las rutas comerciales de Piedrablanca dependen de héroes como tú. Si necesitas pociones o elixires rápidos, puedo vendértelos aquí mismo.',
          buttons: [
            { label: 'Poción de Vida (30 Monedas)', action: () => this.buySupply('potion') },
            { label: 'Elixir de Maná (35 Monedas)', action: () => this.buySupply('elixir') },
            { label: 'Cerrar', secondary: true, action: () => this.closeDialogue() },
          ],
        }),
      },
      {
        id: 'kid',
        name: 'Pequeño Pip',
        role: 'kid',
        x: -1.4,
        z: 17.2,
        talk: () => ({
          text: `¡Guau, ${this.player.heroName}! ¿Es verdad que en las Tierras Nevadas viven osos gigantes y en la Pradera hay un Rey Slime con corona de oro? ¡Cuando sea grande quiero ser aventurero como tú!`,
          buttons: [{ label: '¡Cuídate en la aldea!', action: () => this.closeDialogue() }],
        }),
      },
      {
        id: 'peddler',
        name: 'Buhonero Orin',
        role: 'peddler',
        x: 3.1,
        z: 24.0,
        talk: () => ({
          text: 'He recorrido los cinco biomas con esta mochila a cuestas. Recuerda: cada bioma responde a su propia luz, y los conejos guerreros del bosque esconden dagas carmesí muy codiciadas.',
          buttons: [{ label: 'Gracias por el consejo', action: () => this.closeDialogue() }],
        }),
      },
      {
        id: 'banker',
        name: 'Banquero Bran',
        role: 'banker',
        x: -5.25,
        z: 13.45,
        talk: () => ({
          text: 'Bienvenido al cofre de la Aldea del Alba. Puedes almacenar aquí tu equipo, materiales y monedas con total seguridad.',
          buttons: [
            {
              label: 'Abrir cofre',
              action: () => {
                this.closeDialogue();
                this.setBankOpen(true);
              },
            },
            { label: 'Cerrar', secondary: true, action: () => this.closeDialogue() },
          ],
        }),
      },
    ];

    configs.forEach((cfg) => {
      const actor = new ProceduralNpcActor(cfg.role);
      const y = getTerrainHeight(cfg.x, cfg.z, this.worldSeed);
      actor.setWorldPosition(cfg.x, y, cfg.z);
      actor.setZoomOutline(this.viewSize);
      this.scene.add(actor.group);
      this.npcColliders.push({ x: cfg.x, z: cfg.z, r: 0.48 });

      const markerMat = new THREE.SpriteMaterial({ color: 0xfacc15, depthTest: false });
      const marker = new THREE.Sprite(markerMat);
      marker.scale.set(0.32, 0.32, 1);
      marker.position.set(cfg.x, y + 2.15, cfg.z);
      marker.visible = cfg.role === 'elder' || cfg.role === 'smith' || cfg.role === 'scholar' || cfg.role === 'warrior';
      this.scene.add(marker);

      this.npcs.push({
        id: cfg.id,
        name: cfg.name,
        role: cfg.role,
        pos: new THREE.Vector3(cfg.x, y, cfg.z),
        actor,
        marker,
        talk: cfg.talk,
      });
    });
  }

  private buildForgeSnapshot(): ForgeItemSnapshot[] {
    const out: ForgeItemSnapshot[] = [];
    const toRows = (recipe?: Partial<Record<MaterialId, number>> | null) =>
      recipe
        ? (Object.entries(recipe) as Array<[MaterialId, number]>).map(([materialId, req]) => ({
            materialId,
            name: MATERIAL_META[materialId].name,
            req,
            have: this.player.materials[materialId] ?? 0,
          }))
        : [];

    const allDefs: Array<WeaponDef | ArmorPieceDef> = [...WEAPONS, ...ARMOR_PIECES];
    for (const def of allDefs) {
      const owned = this.player.ownedGear.includes(def.id);
      if (!def.craftable && !owned) continue;
      const tier = this.player.gearUpgrades[def.id] ?? 0;
      const upgRecipe = owned ? getUpgradeRecipe(tier) : null;
      const ownedQty = this.player.ownedGearQty[def.id] ?? (owned ? 1 : 0);
      const isEquipped =
        this.player.equipped[def.slot] === def.id ||
        (def.slot === 'weapon' && this.player.equipped.offhand === def.id);
      out.push({
        id: def.id,
        slot: def.slot,
        weaponKind: def.slot === 'weapon' ? def.weaponKind : undefined,
        name: tier > 0 ? `${def.name} +${tier}` : def.name,
        rarity: def.rarity,
        statsText: formatGearStats(def, tier),
        owned,
        ownedQty,
        equipped: isEquipped,
        upgradeLevel: tier,
        maxUpgrade: MAX_UPGRADE_TIER,
        craftable: def.craftable,
        craftRecipe: toRows(def.recipe),
        upgradeRecipe: upgRecipe ? toRows(upgRecipe) : null,
        nextStatsText: upgRecipe ? formatGearStats(def, tier + 1) : null,
      });
    }
    return out;
  }

  private clearMovementAndCombatIntent(): void {
    this.keys = {};
    this.joyVec.set(0, 0);
    this.actionBuffer = null;
    this.hero?.clearMoveTarget();
    this.hero?.clearAutoAttackTarget();
    if (this.tapMarkerMesh) this.tapMarkerMesh.visible = false;
  }

  public setForgeOpen(open: boolean): void {
    this.isForgeOpen = open;
    if (open) {
      this.clearMovementAndCombatIntent();
      this.emitHud(true);
    }
  }

  public craftGear(slot: GearSlot, gearId: string): void {
    const def = getGearDef(gearId);
    if (!def || def.slot !== slot || !def.craftable || !def.recipe) return;
    const isDagger = def.slot === 'weapon' && def.weaponKind === 'dagger';
    const maxCopies = isDagger ? 2 : 1;
    const curQty = this.player.ownedGearQty[gearId] ?? (this.player.ownedGear.includes(gearId) ? 1 : 0);
    if (curQty >= maxCopies) {
      this.equipGear(slot, gearId);
      return;
    }

    const entries = Object.entries(def.recipe) as Array<[MaterialId, number]>;
    for (const [matId, req] of entries) {
      if ((this.player.materials[matId] ?? 0) < req) {
        this.callbacks.onToast(`Falta ${MATERIAL_META[matId].name} para forjar.`);
        return;
      }
    }
    for (const [matId, req] of entries) {
      this.consumeFromSlots(matId, req);
    }
    if (this.player.gearUpgrades[gearId] === undefined) {
      this.player.gearUpgrades[gearId] = 0;
    }

    const mainWeapon = this.player.equipped.weapon ? WEAPON_MAP[this.player.equipped.weapon] : null;
    if (isDagger && mainWeapon?.weaponKind === 'dagger' && !this.player.equipped.offhand && curQty >= 1) {
      this.player.equipped.offhand = gearId;
      this.callbacks.onToast(`¡2da ${def.name} forjada y equipada en Mano Sec.!`);
    } else {
      const prevMain = this.player.equipped[slot];
      if (prevMain && !this.addItemToSlots({ id: prevMain, category: 'gear', qty: 1 }, false)) {
        this.spawnPickup(
          this.player.pos.x + 1.2,
          this.player.pos.z,
          def.slot === 'weapon' ? 'weapon' : 'armor',
          prevMain,
          undefined,
          1,
          0.9
        );
      }
      if (slot === 'weapon' && !isDagger && this.player.equipped.offhand) {
        const prevOff = this.player.equipped.offhand;
        this.player.equipped.offhand = null;
        if (!this.addItemToSlots({ id: prevOff, category: 'gear', qty: 1 }, false)) {
          this.spawnPickup(this.player.pos.x - 1.2, this.player.pos.z, 'weapon', prevOff, undefined, 1, 0.9);
        }
      }
      this.player.equipped[slot] = gearId;
      this.callbacks.onToast(`¡Forjado y equipado: ${def.name}!`);
    }
    this.syncDerivedFromSlots();
    this.recalcPlayerStats(true);
    this.refreshHeroAppearance();
    this.audio.questDone();
    this.spawnBurst(this.player.pos.x, this.player.pos.y + 1.0, this.player.pos.z, 26, 0xf59e0b, 4.5, 0.7, -2);
    this.emitInventoryUpdate();
    this.emitHud(true);
  }

  public upgradeGear(slot: GearSlot, gearId: string): void {
    const def = getGearDef(gearId);
    if (!def || def.slot !== slot || !this.player.ownedGear.includes(gearId)) return;

    const tier = this.player.gearUpgrades[gearId] ?? 0;
    const recipe = getUpgradeRecipe(tier);
    if (!recipe) {
      this.callbacks.onToast(`${def.name} ya está al nivel máximo (+${MAX_UPGRADE_TIER}).`);
      return;
    }
    const entries = Object.entries(recipe) as Array<[MaterialId, number]>;
    for (const [matId, req] of entries) {
      if ((this.player.materials[matId] ?? 0) < req) {
        this.callbacks.onToast(`Falta ${MATERIAL_META[matId].name} para mejorar.`);
        return;
      }
    }
    for (const [matId, req] of entries) {
      this.consumeFromSlots(matId, req);
    }
    this.player.gearUpgrades[gearId] = tier + 1;
    this.recalcPlayerStats(true);
    this.audio.levelUp();
    this.spawnBurst(this.player.pos.x, this.player.pos.y + 1.0, this.player.pos.z, 28, 0xfacc15, 5, 0.75, -2);
    this.callbacks.onToast(`¡${def.name} mejorado a +${tier + 1}!`);
    this.emitInventoryUpdate();
    this.emitHud(true);
  }

  public buySupply(kind: 'potion' | 'elixir'): void {
    const cost = kind === 'potion' ? 30 : 35;
    if (this.getCoinsInInventory() < cost) {
      this.callbacks.onToast('Monedas insuficientes.');
      return;
    }
    if (!this.canAddToSlots(kind, true)) {
      this.callbacks.onToast('Inventario lleno.');
      return;
    }
    if (!this.spendCoinsFromInventory(cost)) return;
    this.addItemToSlots({ id: kind, category: 'consumable', qty: 1 }, true);
    if (kind === 'potion') {
      this.callbacks.onToast('+1 Poción de Vida');
    } else {
      this.callbacks.onToast('+1 Elixir de Maná');
    }
    this.audio.pickup();
    this.emitHud(true);
  }

  public setBankOpen(open: boolean): void {
    this.isBankOpen = open;
    if (open) {
      this.clearMovementAndCombatIntent();
      this.emitBankUpdate();
    }
    this.callbacks.onBankOpen?.(open);
    gameEventBus.emit('ui:toggleBank', { open });
    this.emitHud(true);
  }

  public depositInventorySlotToBank(slotIdx: number): void {
    if (slotIdx < 0 || slotIdx >= INVENTORY_CAPACITY) return;
    const item = this.player.inventorySlots[slotIdx];
    if (!item) return;
    const stackable = item.category !== 'gear';
    if (!this.addEntryToGrid(this.player.bankSlots, BANK_CAPACITY, item, stackable)) {
      this.callbacks.onToast('Cofre lleno');
      return;
    }
    this.player.inventorySlots[slotIdx] = null;
    this.audio.pickup();
    this.syncDerivedFromSlots();
    this.emitBankUpdate();
    this.emitInventoryUpdate();
    this.emitHud(true);
  }

  public withdrawBankSlotToInventory(bankIdx: number): void {
    if (bankIdx < 0 || bankIdx >= BANK_CAPACITY) return;
    const item = this.player.bankSlots[bankIdx];
    if (!item) return;
    const stackable = item.category !== 'gear';
    if (!this.addEntryToGrid(this.player.inventorySlots, INVENTORY_CAPACITY, item, stackable)) {
      this.callbacks.onToast('Inventario lleno');
      return;
    }
    this.player.bankSlots[bankIdx] = null;
    this.audio.pickup();
    this.syncDerivedFromSlots();
    this.emitBankUpdate();
    this.emitInventoryUpdate();
    this.emitHud(true);
  }

  public depositAllToBank(): void {
    let moved = 0;
    let skipped = false;
    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      const item = this.player.inventorySlots[i];
      if (!item) continue;
      const stackable = item.category !== 'gear';
      if (this.addEntryToGrid(this.player.bankSlots, BANK_CAPACITY, item, stackable)) {
        this.player.inventorySlots[i] = null;
        moved++;
      } else {
        skipped = true;
      }
    }
    if (moved > 0) {
      this.audio.pickup();
      this.syncDerivedFromSlots();
      this.emitBankUpdate();
      this.emitInventoryUpdate();
      this.emitHud(true);
    }
    if (skipped) {
      this.callbacks.onToast('Cofre lleno');
    } else if (moved === 0) {
      this.callbacks.onToast('No hay objetos para depositar.');
    } else {
      this.callbacks.onToast(`Depositados ${moved} espacio(s) en el cofre.`);
    }
  }

  public depositCoinsToBank(): void {
    let movedCoins = 0;
    let blocked = false;
    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      const item = this.player.inventorySlots[i];
      if (!item || item.id !== 'coins') continue;
      if (this.addEntryToGrid(this.player.bankSlots, BANK_CAPACITY, item, true)) {
        movedCoins += item.qty;
        this.player.inventorySlots[i] = null;
      } else {
        blocked = true;
      }
    }
    if (movedCoins > 0) {
      this.audio.pickup();
      this.syncDerivedFromSlots();
      this.emitBankUpdate();
      this.emitInventoryUpdate();
      this.emitHud(true);
      this.callbacks.onToast(`Depositadas ${movedCoins} monedas en el cofre.`);
    } else if (blocked) {
      this.callbacks.onToast('Cofre lleno');
    } else {
      this.callbacks.onToast('No llevas monedas en tu inventario.');
    }
  }


  private computeEnemyStats(type: EnemyKind, level: number) {
    const scale = 1 + Math.max(0, level - 1) * 0.24;
    switch (type) {
      case 'slime':
        return { hp: Math.round(38 * scale), dmg: Math.round(8 + level * 2.1), spd: 2.35, range: 1.4, aggro: 9, xp: Math.round(18 + level * 7), size: 1.25, radius: 0.55, plateH: 1.45 };
      case 'rat':
        return { hp: Math.round(30 * scale), dmg: Math.round(9 + level * 2.2), spd: 3.4, range: 1.35, aggro: 10, xp: Math.round(16 + level * 7), size: 1.2, radius: 0.48, plateH: 1.4 };
      case 'rabbit':
        return { hp: Math.round(44 * scale), dmg: Math.round(11 + level * 2.6), spd: 4.1, range: 1.6, aggro: 11, xp: Math.round(25 + level * 9), size: 1.45, radius: 0.52, plateH: 1.75 };
      case 'goblin':
        return { hp: Math.round(48 * scale), dmg: Math.round(12 + level * 2.6), spd: 3.3, range: 1.65, aggro: 11, xp: Math.round(26 + level * 9), size: 1.55, radius: 0.56, plateH: 1.85 };
      case 'ent':
        return { hp: Math.round(78 * scale), dmg: Math.round(15 + level * 2.9), spd: 2.15, range: 2.1, aggro: 10, xp: Math.round(38 + level * 12), size: 2.2, radius: 0.82, plateH: 2.55 };
      case 'wolf':
        return { hp: Math.round(46 * scale), dmg: Math.round(13 + level * 2.7), spd: 4.2, range: 1.7, aggro: 12, xp: Math.round(28 + level * 10), size: 1.65, radius: 0.6, plateH: 1.85 };
      case 'bat':
        return { hp: Math.round(36 * scale), dmg: Math.round(12 + level * 2.5), spd: 4.45, range: 1.55, aggro: 12.5, xp: Math.round(24 + level * 9), size: 1.45, radius: 0.52, plateH: 1.85 };
      case 'rock_golem':
        return { hp: Math.round(92 * scale), dmg: Math.round(16 + level * 3.1), spd: 2.0, range: 2.15, aggro: 10.5, xp: Math.round(44 + level * 13), size: 2.25, radius: 0.88, plateH: 2.55 };
      case 'gray_wolf':
        return { hp: Math.round(52 * scale), dmg: Math.round(14 + level * 2.9), spd: 4.35, range: 1.75, aggro: 12.5, xp: Math.round(32 + level * 11), size: 1.7, radius: 0.62, plateH: 1.9 };
      case 'polar_bear':
        return { hp: Math.round(86 * scale), dmg: Math.round(17 + level * 3.2), spd: 2.9, range: 2.05, aggro: 11.5, xp: Math.round(45 + level * 13), size: 2.1, radius: 0.82, plateH: 2.3 };
      case 'ice_golem':
        return { hp: Math.round(96 * scale), dmg: Math.round(17 + level * 3.2), spd: 2.15, range: 2.2, aggro: 11, xp: Math.round(48 + level * 14), size: 2.3, radius: 0.88, plateH: 2.6 };
      case 'knight':
        return { hp: Math.round(68 * scale), dmg: Math.round(14 + level * 2.8), spd: 3.3, range: 1.9, aggro: 11.5, xp: Math.round(34 + level * 12), size: 1.88, radius: 0.65, plateH: 2.15 };
      case 'mage':
        return { hp: Math.round(48 * scale), dmg: Math.round(13 + level * 2.7), spd: 2.55, range: 8.0, aggro: 13, xp: Math.round(32 + level * 11), size: 1.78, radius: 0.6, plateH: 2.1 };
      case 'lava_golem':
        return { hp: Math.round(105 * scale), dmg: Math.round(19 + level * 3.4), spd: 2.2, range: 2.25, aggro: 11.5, xp: Math.round(54 + level * 15), size: 2.35, radius: 0.9, plateH: 2.65 };
      case 'boss_meadow': {
        const bScale = 1 + Math.max(0, level - 5) * 0.2;
        return { hp: Math.round(460 * bScale), dmg: Math.round(20 * (1 + Math.max(0, level - 5) * 0.14)), spd: 2.85, range: 2.4, aggro: 14.5, xp: Math.round(240 * bScale), size: 2.7, radius: 0.98, plateH: 2.8 };
      }
      case 'boss_forest': {
        const bScale = 1 + Math.max(0, level - 10) * 0.2;
        return { hp: Math.round(980 * bScale), dmg: Math.round(34 * (1 + Math.max(0, level - 10) * 0.14)), spd: 2.65, range: 2.8, aggro: 15.5, xp: Math.round(480 * bScale), size: 3.15, radius: 1.1, plateH: 3.35 };
      }
      case 'boss_rocky': {
        const bScale = 1 + Math.max(0, level - 15) * 0.2;
        return { hp: Math.round(1650 * bScale), dmg: Math.round(48 * (1 + Math.max(0, level - 15) * 0.14)), spd: 2.75, range: 2.95, aggro: 16, xp: Math.round(760 * bScale), size: 3.3, radius: 1.16, plateH: 3.45 };
      }
      case 'boss_snow': {
        const bScale = 1 + Math.max(0, level - 19) * 0.2;
        return { hp: Math.round(2350 * bScale), dmg: Math.round(64 * (1 + Math.max(0, level - 19) * 0.14)), spd: 3.35, range: 3.1, aggro: 16.5, xp: Math.round(1100 * bScale), size: 3.35, radius: 1.16, plateH: 3.5 };
      }
      case 'boss':
      default: {
        const bScale = 1 + Math.max(0, level - 22) * 0.2;
        return { hp: Math.round(3400 * bScale), dmg: Math.round(84 * (1 + Math.max(0, level - 22) * 0.14)), spd: 3.65, range: 3.2, aggro: 18, xp: Math.round(2200 * bScale), size: 3.75, radius: 1.24, plateH: 3.8 };
      }
    }
  }

  private escalateBiomeZone(biome: BiomeId, respawnedBoss: EnemyEntity): void {
    this.biomeLevelBonus[biome] = Math.min(5, this.biomeLevelBonus[biome] + 5);
    for (let i = 0; i < this.enemies.length; i++) {
      const m = this.enemies[i];
      if (m.biome !== biome) continue;
      m.level = Math.min(20, m.level + 5);
      const st = this.computeEnemyStats(m.type, m.level);
      const oldMax = Math.max(1, m.maxHp);
      m.maxHp = st.hp;
      m.dmg = st.dmg;
      m.xp = st.xp;
      if (m === respawnedBoss) {
        m.hp = m.maxHp;
      } else if (!m.dead) {
        m.hp = Math.min(m.maxHp, Math.max(1, Math.round((m.hp / oldMax) * m.maxHp)));
      }
      this.nameplateSystem.syncEntityHp(m.id, m.hp, m.maxHp, m.dead);
    }
    this.callbacks.onToast(
      `¡${respawnedBoss.name} renació en Nv.${respawnedBoss.level}! Toda ${BIOME_NAMES[biome]} escala hacia Nv.20.`
    );
  }

  private spawnEnemy(
    type: EnemyKind,
    x: number,
    z: number,
    level: number,
    name: string,
    respawnable = true,
    nocturnalOnly = false,
    zoneId?: string,
    bestiaryOpts?: {
      bestiaryId: BestiaryMobId;
      variantIndex: 0 | 1 | 2;
      primaryColorHex: number;
      scaleMult: number;
      hp: number;
      dmg: number;
      spd: number;
      range: number;
      aggro: number;
      xp: number;
      radius: number;
      plateH: number;
    }
  ): void {
    const isBoss = type.startsWith('boss');
    const stats = bestiaryOpts ?? this.computeEnemyStats(type, level);
    const zone = getSpawnZoneById(zoneId);
    const biome = getBiomeId(x, z, this.worldSeed);

    const actor = new ProceduralEnemyActor(
      type,
      bestiaryOpts
        ? {
            primaryColorHex: bestiaryOpts.primaryColorHex,
            scaleMult: bestiaryOpts.scaleMult,
            variantIndex: bestiaryOpts.variantIndex,
          }
        : undefined
    );
    const y = getTerrainHeight(x, z, this.worldSeed);
    actor.setWorldPosition(x, y, z);
    actor.setZoomOutline(this.viewSize);
    if (actor.archetype === 'golem') {
      actor.onHeavyStep = () => {
        if (Math.hypot(this.player.pos.x - actor.group.position.x, this.player.pos.z - actor.group.position.z) < 14) {
          this.screenShake = Math.max(this.screenShake, isBoss ? 0.14 : 0.06);
        }
      };
    }
    if (nocturnalOnly) {
      actor.group.visible = false;
    }
    this.scene.add(actor.group);

    let teleGeo = this.enemyTeleGeoCache.get(type);
    if (!teleGeo) {
      teleGeo = new THREE.RingGeometry(stats.radius * 0.9, stats.radius * 1.45, 24);
      teleGeo.rotateX(-Math.PI / 2);
      this.enemyTeleGeoCache.set(type, teleGeo);
      this.disposableGeos.push(teleGeo);
    }
    const telegraphMesh = new THREE.Mesh(teleGeo, isBoss ? this.teleMatBoss : this.teleMatNormal);
    telegraphMesh.position.y = 0.06;
    telegraphMesh.visible = false;
    actor.group.add(telegraphMesh);

    const plateHeight = stats.plateH + 0.18;
    const rng = createRng(hashChunkCoords(Math.round(x * 10), Math.round(z * 10), this.worldSeed));
    const clampedLevel = Math.min(20, Math.max(1, level));

    const entity: EnemyEntity = {
      id: `enemy_${this.nextEntityId++}`,
      type,
      biome,
      name,
      level: clampedLevel,
      isBoss,
      isElemental: type === 'mage' || type === 'lava_golem' || type === 'ice_golem' || type === 'boss_snow' || type === 'boss',
      home: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      hp: stats.hp,
      maxHp: stats.hp,
      dmg: stats.dmg,
      spd: stats.spd,
      range: stats.range,
      aggro: zone ? zone.aggroRange : stats.aggro,
      xp: stats.xp,
      radius: stats.radius,
      atkCd: 0,
      atkAnim: 0,
      windup: 0,
      windupDuration: isBoss ? 0.48 : 0.28,
      flash: 0,
      squash: 0,
      slowTimer: 0,
      dead: false,
      respawnTimer: 0,
      respawnable,
      actor,
      telegraphMesh,
      plateHeight,
      phaseOffset: rng() * 6.28,
      nocturnalOnly,
      zoneId,
      bestiaryId: bestiaryOpts?.bestiaryId,
      variantIndex: bestiaryOpts?.variantIndex,
      provoked: false,
    };
    actor.group.userData.enemyEntity = entity;
    this.enemies.push(entity);
    if (isBoss) this.bosses.push(entity);
    this.nameplateSystem.syncEntityHp(entity.id, entity.hp, entity.maxHp, false);
  }

  private spawnInitialEnemies(): void {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      this.scene.remove(e.actor.group);
      e.actor.dispose();
    }
    this.enemies.length = 0;
    this.bosses.length = 0;
    this.setCombatTarget(null);
    this.nameplateSystem.hideAll();
    this.biomeLevelBonus = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

    // Spawneo por zonas derivadas automáticamente del bestiario en Bestiary.ts + SpawnZones.ts
    for (let zIdx = 0; zIdx < SPAWN_ZONES.length; zIdx++) {
      const zone = SPAWN_ZONES[zIdx];
      const rng = createRng(hashChunkCoords(zIdx + 17, zone.biome * 31 + 7, this.worldSeed ^ 0x5c3a));
      for (let i = 0; i < zone.maxMobs; i++) {
        const pt = pickZoneSpawnPoint(zone, this.worldSeed, rng);
        if (!pt) continue;
        const { entry, variant } = pickBestiaryMobForPosition(zone, pt.x, pt.z, rng);
        this.spawnEnemy(entry.visualKind, pt.x, pt.z, variant.level, entry.name, true, false, zone.id, {
          bestiaryId: entry.id,
          variantIndex: variant.variantIndex,
          primaryColorHex: hexStringToNumber(variant.color),
          scaleMult: variant.scaleMult,
          hp: variant.hp,
          dmg: variant.damage,
          spd: variant.speed,
          range: entry.attackRange,
          aggro: zone.aggroRange,
          xp: variant.xp,
          radius: entry.radius,
          plateH: entry.plateHeight,
        });
      }
    }

    // 5 Biome Bosses (todos acotados hasta Nv.20)
    this.spawnEnemy('boss_meadow', LANDMARKS.meadowArena.x, LANDMARKS.meadowArena.z, 6, 'Rey Slime Dorado', true);
    this.spawnEnemy('boss_forest', LANDMARKS.forestArena.x, LANDMARKS.forestArena.z, 10, 'Sylvarok, Ent Ancestral', true);
    this.spawnEnemy('boss_rocky', LANDMARKS.rockyArena.x, LANDMARKS.rockyArena.z, 14, 'Kragor, Coloso de Granito', true);
    this.spawnEnemy('boss_snow', LANDMARKS.snowArena.x, LANDMARKS.snowArena.z, 17, 'Ymir, Señor de la Escarcha', true);
    this.spawnEnemy('boss', LANDMARKS.volcanicArena.x, LANDMARKS.volcanicArena.z, 20, 'Ignis Rex, Señor de Ceniza', true);
  }

  // =========================================================================
  // PUBLIC CONTROLS FOR REACT SHELL & ANDROID TOUCH CONTROLS
  // =========================================================================
  public getSeed(): string {
    return this.seedLabel;
  }

  public setSeed(seedInput: string): string {
    const clean = seedInput.trim() || DEFAULT_WORLD_SEED;
    this.seedLabel = clean;
    this.worldSeed = ensureWorldSeed(clean);
    this.towns = getWorldTowns(this.worldSeed);

    // Re-ground player before streaming chunks
    this.player.pos.set(0, getTerrainHeight(0, 19, this.worldSeed), 19);
    this.hero?.clearMoveTarget();
    this.hero?.clearAutoAttackTarget();
    this.interactionSystem.reset();
    this.tapMarkerMesh.visible = false;
    this.snapCameraToPlayer();
    this.hero.setWorldPosition(this.player.pos.x, this.player.pos.y, this.player.pos.z);

    // Rebuild deterministic chunks, landmarks, NPC heights & enemies
    this.chunkManager.setWorldSeed(this.worldSeed, this.player.pos.x, this.player.pos.z);
    this.buildLandmarks();
    this.npcs.forEach((n) => {
      const ny = getTerrainHeight(n.pos.x, n.pos.z, this.worldSeed);
      n.pos.y = ny;
      n.actor.setWorldPosition(n.pos.x, ny, n.pos.z);
      n.marker.position.y = ny + 2.15;
    });
    this.spawnInitialEnemies();
    this.emitHud(true);
    this.emitCompass();
    return this.seedLabel;
  }

  public getHeroConfig(): HeroConfig {
    return { ...this.heroConfig };
  }

  public setHeroConfig(cfg: HeroConfig, animatePop = true): void {
    this.heroConfig = migrateHeroConfig(cfg);
    this.hero.applyConfig(this.heroConfig, animatePop);
  }

  public hasSavedGame(): boolean {
    try {
      return Boolean(localStorage.getItem(GAME_SAVE_STORAGE_KEY));
    } catch {
      return false;
    }
  }

  public saveGameState(showToast = true): boolean {
    try {
      const payload = {
        version: HERO_SAVE_VERSION,
        heroName: this.player.heroName,
        seed: this.seedLabel,
        gameTimeHours: this.dayNightCycle.getTimeHours(),
        heroConfig: this.heroConfig,
        quests: this.quests,
        defeatedBossKinds: Array.from(this.defeatedBossKinds),
        player: {
          level: this.player.level,
          xp: this.player.xp,
          xpNext: this.player.xpNext,
          potions: this.player.potions,
          elixirs: this.player.elixirs,
          equipped: this.player.equipped,
          ownedGear: this.player.ownedGear,
          ownedGearQty: this.player.ownedGearQty,
          gearUpgrades: this.player.gearUpgrades,
          inventorySlots: this.player.inventorySlots,
          bankSlots: this.player.bankSlots,
          learnedSpells: this.player.learnedSpells,
          activeSpell: this.player.activeSpell,
          skillPoints: this.player.skillPoints,
          skills: this.player.skills,
          materials: this.player.materials,
          kills: this.player.kills,
          slimeKills: this.player.slimeKills,
          forestKills: this.player.forestKills,
          hasCrystal: this.player.hasCrystal,
        },
      };
      localStorage.setItem(GAME_SAVE_STORAGE_KEY, JSON.stringify(payload));
      if (showToast) this.callbacks.onToast('Partida y apariencia guardadas.');
      return true;
    } catch {
      return false;
    }
  }

  public loadGameState(): boolean {
    try {
      const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;

      if (typeof data.seed === 'string' && data.seed.trim()) {
        this.setSeed(data.seed);
      }
      if (typeof data.gameTimeHours === 'number' && Number.isFinite(data.gameTimeHours)) {
        this.dayNightCycle.setTimeHours(data.gameTimeHours, true);
      } else {
        this.dayNightCycle.setTimeHours(TIME.DAY_START_HOUR, true);
      }
      if (typeof data.heroName === 'string') {
        this.setHeroName(data.heroName);
      }
      if (data.heroConfig) {
        this.setHeroConfig(migrateHeroConfig(data.heroConfig), false);
      }
      if (data.quests) {
        this.quests = { ...this.quests, ...data.quests };
      }
      if (Array.isArray(data.defeatedBossKinds)) {
        this.defeatedBossKinds = new Set(data.defeatedBossKinds);
        this.player.defeatedBiomeBosses = this.defeatedBossKinds.size;
      }
      const sp = data.player;
      if (sp && typeof sp === 'object') {
        this.player.level = Number(sp.level) || 1;
        this.player.xp = Number(sp.xp) || 0;
        this.player.xpNext = Number(sp.xpNext) || xpForNextLevel(this.player.level);
        if (sp.equipped) this.player.equipped = { ...this.player.equipped, ...sp.equipped };
        if (sp.gearUpgrades) this.player.gearUpgrades = { ...sp.gearUpgrades };
        if (Array.isArray(sp.learnedSpells)) this.player.learnedSpells = [...sp.learnedSpells];
        if (sp.activeSpell !== undefined) this.player.activeSpell = sp.activeSpell;
        this.player.skillPoints = Number(sp.skillPoints) || 0;
        if (sp.skills) this.player.skills = { ...this.player.skills, ...sp.skills };
        this.player.kills = Number(sp.kills) || 0;
        this.player.slimeKills = Number(sp.slimeKills) || 0;
        this.player.forestKills = Number(sp.forestKills) || 0;

        const parseSlotArray = (rawArr: unknown, cap: number): Array<InventorySlotEntry | null> => {
          const out: Array<InventorySlotEntry | null> = Array.from({ length: cap }, () => null);
          if (!Array.isArray(rawArr)) return out;
          for (let i = 0; i < Math.min(cap, rawArr.length); i++) {
            const rawSlot = rawArr[i];
            if (
              rawSlot &&
              typeof rawSlot === 'object' &&
              typeof rawSlot.id === 'string' &&
              typeof rawSlot.category === 'string' &&
              Number(rawSlot.qty) > 0
            ) {
              out[i] = {
                id: rawSlot.id,
                category: rawSlot.category,
                qty: Math.max(1, Math.floor(Number(rawSlot.qty))),
              };
            }
          }
          return out;
        };

        let nextSlots: Array<InventorySlotEntry | null>;
        if (Array.isArray(sp.inventorySlots)) {
          nextSlots = parseSlotArray(sp.inventorySlots, INVENTORY_CAPACITY);
        } else {
          nextSlots = Array.from({ length: INVENTORY_CAPACITY }, () => null);
          let ptr = 0;
          const pushLegacy = (entry: InventorySlotEntry) => {
            if (ptr < INVENTORY_CAPACITY) nextSlots[ptr++] = entry;
          };
          const potQty = Math.max(0, Math.floor(Number(sp.potions) ?? 1));
          if (potQty > 0) pushLegacy({ id: 'potion', category: 'consumable', qty: potQty });
          const elixQty = Math.max(0, Math.floor(Number(sp.elixirs) ?? 1));
          if (elixQty > 0) pushLegacy({ id: 'elixir', category: 'consumable', qty: elixQty });
          if (sp.hasCrystal) pushLegacy({ id: 'crystal', category: 'relic', qty: 1 });
          if (sp.materials && typeof sp.materials === 'object') {
            for (const [mId, rawQty] of Object.entries(sp.materials)) {
              const q = Math.floor(Number(rawQty) || 0);
              if (q > 0) pushLegacy({ id: mId, category: 'material', qty: q });
            }
          }
          const eqCounts: Record<string, number> = {};
          for (const sl of GEAR_SLOT_ORDER) {
            const eqId = this.player.equipped[sl];
            if (eqId) eqCounts[eqId] = (eqCounts[eqId] ?? 0) + 1;
          }
          if (Array.isArray(sp.ownedGear)) {
            for (const gid of sp.ownedGear) {
              if (typeof gid !== 'string') continue;
              const totalQty = Math.max(1, Math.floor(Number(sp.ownedGearQty?.[gid]) || 1));
              const bagCopies = Math.max(0, totalQty - (eqCounts[gid] ?? 0));
              for (let c = 0; c < bagCopies; c++) {
                pushLegacy({ id: gid, category: 'gear', qty: 1 });
              }
            }
          }
        }

        const nextBankSlots = parseSlotArray(sp.bankSlots, BANK_CAPACITY);
        // Migración automática de oro heredado hacia monedas apilables
        const legacyGold = Math.floor(Number(sp.gold) || 0);
        const hasAnyCoins =
          nextSlots.some((s) => s?.id === 'coins') || nextBankSlots.some((s) => s?.id === 'coins');
        if (legacyGold > 0 && !hasAnyCoins) {
          this.addEntryToGrid(nextSlots, INVENTORY_CAPACITY, { id: 'coins', category: 'currency', qty: legacyGold }, true);
        }

        this.player.inventorySlots = nextSlots;
        this.player.bankSlots = nextBankSlots;
        this.syncDerivedFromSlots();
      }
      this.recalcPlayerStats(false);
      this.refreshHeroAppearance();
      this.emitPlayerBars(false);
      this.emitInventoryUpdate();
      this.emitBankUpdate();
      this.emitCompass();
      this.emitHud(true);
      return true;
    } catch {
      return false;
    }
  }

  public startNewAdventure(heroName: string, seed: string, config: HeroConfig): void {
    this.setHeroName(heroName);
    this.setHeroConfig(config, true);
    if (seed.trim() && seed.trim() !== this.seedLabel) {
      this.setSeed(seed);
    }
    this.saveGameState(false);
    this.startGame();
  }

  public getQualityMode(): QualityMode {
    return this.qualityMode;
  }

  public setQualityMode(mode: QualityMode): void {
    this.qualityMode = mode;
    if (mode === 'high') this.applyQualityTier(0);
    else if (mode === 'performance') this.applyQualityTier(2);
    else this.applyQualityTier(this.qualityTier);
  }

  private applyQualityTier(tier: 0 | 1 | 2): void {
    this.qualityTier = tier;
    if (this.isSoftwareGl) return;
    if (tier === 0) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isTouchDevice ? 1.5 : 2));
      this.chunkManager.setGrassDensityRatio(1.0);
      this.dirLight.castShadow = true;
    } else if (tier === 1) {
      this.renderer.setPixelRatio(1);
      this.chunkManager.setGrassDensityRatio(0.6);
      this.dirLight.castShadow = true;
    } else {
      this.renderer.setPixelRatio(0.85);
      this.chunkManager.setGrassDensityRatio(0.35);
      this.dirLight.castShadow = false;
    }
  }

  private snapCameraToPlayer(): void {
    const p = this.player.pos;
    this.camFollowPos.copy(p);
    this.controls.target.set(p.x, p.y + 1.5, p.z);
    this.camera.position.set(p.x + this.camOffset.x, p.y + this.camOffset.y, p.z + this.camOffset.z);
    this.controls.update();
  }

  private checkZoneEntryBanner(): void {
    const info = getNearestTownInfo(this.player.pos.x, this.player.pos.z, this.towns);
    if (info.inTown) {
      if (this.lastZoneBannerTownId !== info.id) {
        this.lastZoneBannerTownId = info.id;
        gameEventBus.emit('zone:entered', { name: info.name });
      }
    } else {
      this.lastZoneBannerTownId = '';
    }
  }

  public startGame(): void {
    this.audio.init();
    this.phase = 'playing';
    this.lastZoneBannerTownId = '';
    this.snapCameraToPlayer();
    this.callbacks.onPhaseChange('playing');
    this.checkZoneEntryBanner();
    this.emitHud(true);
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.clearMovementAndCombatIntent();
      this.callbacks.onPhaseChange('paused');
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.callbacks.onPhaseChange('playing');
    }
  }

  public setHeroModalOpen(open: boolean): void {
    this.isHeroModalOpen = open;
    if (open) {
      this.clearMovementAndCombatIntent();
    }
  }

  public setWorldMapOpen(open: boolean): void {
    this.isWorldMapOpen = open;
    if (open) {
      this.clearMovementAndCombatIntent();
    }
  }

  public retryAfterGameOver(): void {
    this.keys = {};
    this.joyVec.set(0, 0);
    this.actionBuffer = null;
    this.hitstopTimer = 0;
    this.screenShake = 0;
    this.isDialogueOpen = false;
    this.isHeroModalOpen = false;
    this.isForgeOpen = false;
    this.setBankOpen(false);
    this.combatTimer = 0;
    if (this.isInCombat) {
      this.isInCombat = false;
      gameEventBus.emit('player:combatChanged', { inCombat: false });
    }
    this.player.dashTimer = 0;
    this.player.atkCd = 0;
    this.player.atkAnim = 0;
    this.player.castAnim = 0;
    this.player.magCd = 0;
    this.player.dashCd = 0;
    this.player.squash = 0;
    this.slashMat.opacity = 0;
    this.player.pos.set(0, getTerrainHeight(0, 19, this.worldSeed), 19);
    this.hero.clearMoveTarget();
    this.hero.clearAutoAttackTarget();
    this.interactionSystem.reset();
    this.tapMarkerMesh.visible = false;
    this.snapCameraToPlayer();
    this.hero.setWorldPosition(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.hero.setHealthRatio(1.0);
    this.hero.setState('idle');
    this.player.hp = this.player.maxHp;
    this.player.mp = this.player.maxMp;
    this.player.invuln = 1.6;
    if (this.player.potions < 2) {
      this.addItemToSlots({ id: 'potion', category: 'consumable', qty: 2 - this.player.potions }, true);
    }
    this.phase = 'playing';
    this.callbacks.onPhaseChange('playing');
    this.callbacks.onToast('Has despertado en la Aldea del Alba.');
    this.emitPlayerBars(false);
    this.emitCompass();
    this.emitInventoryUpdate();
    this.emitHud(true);
  }

  public toggleAudio(): boolean {
    const on = this.audio.toggle();
    this.emitHud();
    return on;
  }

  public setJoystick(nx: number, ny: number): void {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
      this.joyVec.set(0, 0);
      return;
    }
    this.joyVec.set(clamp(nx, -1, 1), clamp(ny, -1, 1));
  }

  public cycleSpell(): void {
    const spells = this.player.learnedSpells;
    if (spells.length <= 1) return;
    const idx = this.player.activeSpell ? spells.indexOf(this.player.activeSpell) : -1;
    const next = spells[(idx + 1) % spells.length];
    this.player.activeSpell = next;
    this.audio.talk();
    this.callbacks.onToast(`Hechizo activo: ${SPELL_DEFS[next].name}`);
    this.emitHud(true);
  }

  public triggerAttack(aimDir: THREE.Vector2 | null = null): void {
    if (
      this.phase !== 'playing' ||
      this.isDialogueOpen ||
      this.isHeroModalOpen ||
      this.isForgeOpen ||
      this.isBankOpen ||
      this.isWorldMapOpen
    ) {
      return;
    }
    if (this.player.atkCd > 0) {
      this.actionBuffer = { type: 'attack', ttl: 0.14, aim: aimDir ? aimDir.clone() : null };
      return;
    }
    this.performMeleeAttack(aimDir);
  }

  public triggerSpell(aimDir: THREE.Vector2 | null = null): void {
    if (this.phase !== 'playing' || this.isDialogueOpen || this.isHeroModalOpen || this.isForgeOpen || this.isBankOpen) return;
    if (!this.player.activeSpell || this.player.learnedSpells.length === 0) {
      this.callbacks.onToast('Sin hechizos: visita al Mago Theron en la aldea.');
      return;
    }
    if (this.player.magCd > 0) {
      this.actionBuffer = { type: 'spell', ttl: 0.14, aim: aimDir ? aimDir.clone() : null };
      return;
    }
    this.performSpell(aimDir);
  }

  public triggerDash(): void {
    if (this.phase !== 'playing' || this.isDialogueOpen || this.isHeroModalOpen || this.isForgeOpen || this.isBankOpen) return;
    if (this.player.dashCd > 0) {
      this.actionBuffer = { type: 'dash', ttl: 0.14, aim: null };
      return;
    }
    this.performDash();
  }

  public triggerInteract(): void {
    if (this.phase !== 'playing' || this.isHeroModalOpen || this.isForgeOpen) return;
    if (this.isBankOpen) {
      this.setBankOpen(false);
      return;
    }
    if (this.isDialogueOpen) {
      this.closeDialogue();
      return;
    }
    const inter = this.getNearestInteractable();
    if (inter) {
      if (inter.type === 'chest') {
        this.setBankOpen(true);
      } else if (inter.type === 'npc' && inter.target) {
        this.openDialogue(inter.target);
      } else if (inter.type === 'crystal') {
        this.collectCrimsonCrystal();
      }
      return;
    }
    // Si no hay cofre/NPC/Cristal cerca, [F] también permite recoger botín manual dentro de 1.5u
    let bestPk: PickupEntity | null = null;
    let bestD = 1.5;
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (pk.collected || pk.type === 'gold' || pk.pickupDelay > 0) continue;
      const d = Math.hypot(pk.pos.x - this.player.pos.x, pk.pos.z - this.player.pos.z);
      if (d <= bestD) {
        bestD = d;
        bestPk = pk;
      }
    }
    if (bestPk) {
      this.tryCollectPickup(bestPk);
    }
  }

  private collectCrimsonCrystal(): void {
    if (!this.defeatedBossKinds.has('boss')) {
      this.callbacks.onToast('Un sello volcánico protege el cristal. ¡Derrota al Titán Ignis Rex!');
      return;
    }
    if (!this.addItemToSlots({ id: 'crystal', category: 'relic', qty: 1 }, true)) {
      this.callbacks.onToast('Inventario lleno: libera 1 espacio para el Cristal Carmesí.');
      return;
    }
    this.crystalMesh.visible = false;
    this.crystalLight.intensity = 0;
    this.audio.levelUp();
    this.spawnBurst(this.crystalPos.x, this.crystalPos.y + 1.5, this.crystalPos.z, 45, 0xff2a6d, 6, 1.0, -1);
    this.callbacks.onToast('¡Has obtenido el Cristal Carmesí! Llévalo al Mago Theron.');
    this.emitHud(true);
  }

  public triggerContextAction(): void {
    if (this.phase !== 'playing' || this.isHeroModalOpen || this.isForgeOpen || this.isBankOpen) return;
    if (this.isDialogueOpen) {
      this.closeDialogue();
      return;
    }
    const action = this.interactionSystem.getContextAction();
    if (!action || action.type === 'attack') {
      const en = (action?.target as EnemyEntity | null) ?? null;
      if (!en || en.dead) {
        // Comportamiento por defecto: ataque al aire sin daño si no hay enemigo cercano
        this.hero.clearAutoAttackTarget();
        this.triggerAttack(null);
        return;
      }
      this.hero.setAutoAttackTarget(en);
      this.setCombatTarget(en);
      const dist = Math.hypot(en.pos.x - this.player.pos.x, en.pos.z - this.player.pos.z);
      const attackRange = Math.max(2.5, this.player.meleeReach + en.radius);
      const aim = _scratchAim.set(en.pos.x - this.player.pos.x, en.pos.z - this.player.pos.z);
      if (aim.lengthSq() > 0.0001) aim.normalize();
      if (dist <= attackRange) {
        this.hero.clearMoveTarget();
        this.tapMarkerMesh.visible = false;
        this.autoAttackCd = Math.max(0.28, 0.78 / (1 + this.player.atkSpeedPct * 0.01));
        this.triggerAttack(aim.lengthSq() > 0 ? aim : null);
      } else {
        this.hero.moveTo(en.pos);
      }
      this.emitHud();
    } else if (action.type === 'chest') {
      this.setBankOpen(true);
    } else if (action.type === 'talk') {
      if (action.kind === 'npc') {
        const npc = action.target as NpcEntity | null;
        if (npc) this.openDialogue(npc);
      } else if (action.kind === 'crystal') {
        this.collectCrimsonCrystal();
      }
    } else if (action.type === 'pickup') {
      const pk = action.target as PickupEntity | null;
      if (pk && !pk.collected) {
        this.tryCollectPickup(pk);
      }
    }
  }

  public triggerSkillSlot(slotIndex: 0 | 1 | 2): void {
    if (slotIndex === 0) this.triggerAttack();
    else if (slotIndex === 1) this.triggerSpell();
    else this.triggerDash();
  }

  public useConsumableById(itemId: string): void {
    if (itemId === 'potion') this.usePotion();
    else if (itemId === 'elixir') this.useElixir();
  }

  public usePotion(): void {
    if (this.phase !== 'playing' || this.isDialogueOpen || this.isForgeOpen || this.isBankOpen) return;
    if (this.potionHpCd > 0) return;
    if (this.player.potions <= 0) {
      this.callbacks.onToast('No te quedan pociones.');
      return;
    }
    if (this.player.hp >= this.player.maxHp) {
      this.callbacks.onToast('Tu vida ya está al máximo.');
      return;
    }
    if (!this.consumeFromSlots('potion', 1)) return;
    this.potionHpCd = 1.2;
    const heal = Math.round(this.player.maxHp * (0.55 + this.player.skills.vitality * 0.05));
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    this.audio.pickup();
    this.spawnFloatText(this.player.pos, `+${heal} Vida`, '#4ade80', 16);
    this.spawnBurst(this.player.pos.x, this.player.pos.y + 0.8, this.player.pos.z, 22, 0x4ade80, 3.5, 0.7, 1.5);
    this.emitPlayerBars(false);
    this.emitHud(true);
  }

  public useElixir(): void {
    if (this.phase !== 'playing' || this.isDialogueOpen || this.isForgeOpen || this.isBankOpen) return;
    if (this.potionMpCd > 0) return;
    if (this.player.elixirs <= 0) {
      this.callbacks.onToast('No te quedan elixires de maná.');
      return;
    }
    if (this.player.mp >= this.player.maxMp) {
      this.callbacks.onToast('Tu maná ya está al máximo.');
      return;
    }
    if (!this.consumeFromSlots('elixir', 1)) return;
    this.potionMpCd = 1.2;
    const restore = Math.round(this.player.maxMp * 0.6);
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + restore);
    this.audio.pickup();
    this.spawnFloatText(this.player.pos, `+${restore} Maná`, '#60a5fa', 16);
    this.spawnBurst(this.player.pos.x, this.player.pos.y + 0.8, this.player.pos.z, 22, 0x38bdf8, 3.5, 0.7, 1.5);
    this.emitPlayerBars(false);
    this.emitHud(true);
  }

  public equipGear(slot: GearSlot, gearId: string): void {
    const def = getGearDef(gearId);
    if (!def || !this.player.ownedGear.includes(gearId)) return;

    if (slot === 'offhand') {
      if (def.slot !== 'weapon' || def.weaponKind !== 'dagger') {
        this.callbacks.onToast('Solo puedes equipar dagas en Mano Sec.');
        return;
      }
      const mainId = this.player.equipped.weapon;
      const mainDef = mainId ? WEAPON_MAP[mainId] : null;
      if (!mainDef || mainDef.weaponKind !== 'dagger') {
        this.callbacks.onToast('Equipa primero una daga en Mano Princ. para usar doble empuñadura.');
        return;
      }
      if (this.player.equipped.offhand === gearId) return;
      if (!this.removeOneGearFromSlots(gearId)) {
        this.callbacks.onToast('Necesitas 2 copias de esa daga para equiparla en ambas manos.');
        return;
      }
      const prevOff = this.player.equipped.offhand;
      if (prevOff && !this.addItemToSlots({ id: prevOff, category: 'gear', qty: 1 }, false)) {
        this.spawnPickup(this.player.pos.x + 1.2, this.player.pos.z, 'weapon', prevOff, undefined, 1, 0.9);
      }
      this.player.equipped.offhand = gearId;
      this.callbacks.onToast(`Mano Sec. equipada: ${def.name}`);
    } else {
      if (def.slot !== slot) return;
      if (this.player.equipped[slot] === gearId) return;

      const tookFromBag = this.removeOneGearFromSlots(gearId);
      const swappedFromOffhand = !tookFromBag && slot === 'weapon' && this.player.equipped.offhand === gearId;
      if (!tookFromBag && !swappedFromOffhand) return;

      const prevMain = this.player.equipped[slot];
      if (swappedFromOffhand) {
        this.player.equipped.offhand = null;
      }
      if (def.slot === 'weapon' && def.weaponKind !== 'dagger' && this.player.equipped.offhand) {
        const prevOff = this.player.equipped.offhand;
        this.player.equipped.offhand = null;
        if (!this.addItemToSlots({ id: prevOff, category: 'gear', qty: 1 }, false)) {
          this.spawnPickup(this.player.pos.x - 1.2, this.player.pos.z, 'weapon', prevOff, undefined, 1, 0.9);
        }
        this.callbacks.onToast('Espada equipada: Mano Sec. liberada (solo dagas en ambas manos).');
      } else {
        this.callbacks.onToast(`${GEAR_SLOT_LABEL[slot]} equipado: ${def.name}`);
      }

      if (prevMain) {
        if (
          swappedFromOffhand &&
          WEAPON_MAP[prevMain]?.weaponKind === 'dagger' &&
          def.slot === 'weapon' &&
          def.weaponKind === 'dagger'
        ) {
          this.player.equipped.offhand = prevMain;
        } else if (!this.addItemToSlots({ id: prevMain, category: 'gear', qty: 1 }, false)) {
          this.spawnPickup(
            this.player.pos.x + 1.2,
            this.player.pos.z,
            slot === 'weapon' ? 'weapon' : 'armor',
            prevMain,
            undefined,
            1,
            0.9
          );
        }
      }
      this.player.equipped[slot] = gearId;
    }

    this.syncDerivedFromSlots();
    this.recalcPlayerStats(true);
    this.refreshHeroAppearance();
    this.audio.pickup();
    this.emitInventoryUpdate();
    this.emitPlayerBars(false);
    this.emitHud(true);
  }

  public unequipGear(slot: GearSlot): void {
    const prev = this.player.equipped[slot];
    if (!prev) return;
    if (!this.canAddToSlots(prev, false)) {
      this.callbacks.onToast('Inventario lleno: libera 1 espacio antes de desequipar.');
      return;
    }
    this.player.equipped[slot] = null;
    this.addItemToSlots({ id: prev, category: 'gear', qty: 1 }, false);

    if (slot === 'weapon' && this.player.equipped.offhand) {
      const prevOff = this.player.equipped.offhand;
      this.player.equipped.offhand = null;
      if (!this.addItemToSlots({ id: prevOff, category: 'gear', qty: 1 }, false)) {
        this.spawnPickup(this.player.pos.x - 1.2, this.player.pos.z, 'weapon', prevOff, undefined, 1, 0.9);
      }
    }
    this.callbacks.onToast(`${GEAR_SLOT_LABEL[slot]} desequipado.`);
    this.syncDerivedFromSlots();
    this.recalcPlayerStats(true);
    this.refreshHeroAppearance();
    this.audio.pickup();
    this.emitInventoryUpdate();
    this.emitPlayerBars(false);
    this.emitHud(true);
  }

  public useInventoryItem(itemId: string): void {
    if (itemId === 'potion') this.usePotion();
    else if (itemId === 'elixir') this.useElixir();
    else {
      const def = getGearDef(itemId);
      if (def) {
        if (this.player.equipped[def.slot] === itemId) this.unequipGear(def.slot);
        else this.equipGear(def.slot, itemId);
      }
    }
  }

  public useInventorySlot(slotIdx: number): void {
    if (this.phase !== 'playing' || this.isDialogueOpen || this.isForgeOpen || this.isBankOpen) return;
    if (slotIdx < 0 || slotIdx >= INVENTORY_CAPACITY) return;
    const slot = this.player.inventorySlots[slotIdx];
    if (!slot) return;

    if (slot.id === 'coins') {
      this.callbacks.onToast(`${slot.qty} Monedas de Eldoria.`);
    } else if (slot.id === 'potion') {
      this.usePotion();
    } else if (slot.id === 'elixir') {
      this.useElixir();
    } else if (slot.category === 'gear') {
      const def = getGearDef(slot.id);
      if (!def) return;
      const curMain = this.player.equipped.weapon ? WEAPON_MAP[this.player.equipped.weapon] : null;
      if (
        def.slot === 'weapon' &&
        def.weaponKind === 'dagger' &&
        curMain?.weaponKind === 'dagger' &&
        !this.player.equipped.offhand
      ) {
        this.equipGear('offhand', def.id);
      } else {
        this.equipGear(def.slot, def.id);
      }
    } else if (slot.category === 'material') {
      const matName = MATERIAL_META[slot.id as MaterialId]?.name ?? slot.id;
      this.callbacks.onToast(`${matName}: úsalo con la Herrera Lyra o el Mago Theron.`);
    } else if (slot.id === 'crystal') {
      this.callbacks.onToast('Cristal Carmesí: entrégalo al Mago Theron en la aldea.');
    }
  }

  public moveInventorySlot(fromIdx: number, toIdx: number): void {
    if (
      fromIdx < 0 ||
      fromIdx >= INVENTORY_CAPACITY ||
      toIdx < 0 ||
      toIdx >= INVENTORY_CAPACITY ||
      fromIdx === toIdx
    ) {
      return;
    }
    const slots = this.player.inventorySlots;
    const src = slots[fromIdx];
    if (!src) return;
    const dst = slots[toIdx];
    if (dst && dst.id === src.id && src.category !== 'gear') {
      dst.qty += src.qty;
      slots[fromIdx] = null;
    } else {
      slots[toIdx] = src;
      slots[fromIdx] = dst ?? null;
    }
    this.syncDerivedFromSlots();
    this.emitInventoryUpdate();
    this.emitHud(true);
  }

  public dropInventorySlot(slotIdx: number): void {
    if (slotIdx < 0 || slotIdx >= INVENTORY_CAPACITY) return;
    const slot = this.player.inventorySlots[slotIdx];
    if (!slot) return;
    if (slot.id === 'crystal') {
      this.callbacks.onToast('No puedes soltar el Cristal Carmesí.');
      return;
    }

    const dropX = this.player.pos.x + this.player.facing.x * 1.85;
    const dropZ = this.player.pos.z + this.player.facing.y * 1.85;
    if (slot.id === 'coins') {
      this.spawnPickup(dropX, dropZ, 'gold', undefined, undefined, slot.qty, 1.6);
    } else if (slot.id === 'potion') {
      this.spawnPickup(dropX, dropZ, 'potion', undefined, undefined, slot.qty, 1.6);
    } else if (slot.id === 'elixir') {
      this.spawnPickup(dropX, dropZ, 'elixir', undefined, undefined, slot.qty, 1.6);
    } else if (slot.category === 'material') {
      this.spawnPickup(dropX, dropZ, 'material', undefined, slot.id as MaterialId, slot.qty, 1.6);
    } else if (slot.category === 'gear') {
      const def = getGearDef(slot.id);
      this.spawnPickup(
        dropX,
        dropZ,
        def?.slot === 'weapon' ? 'weapon' : 'armor',
        slot.id,
        undefined,
        1,
        1.6
      );
    }

    this.player.inventorySlots[slotIdx] = null;
    this.audio.pickup();
    this.syncDerivedFromSlots();
    this.emitInventoryUpdate();
    this.emitHud(true);
  }

  public allocateSkill(key: SkillKey): void {
    const node = SKILL_NODE_MAP[key];
    if (!node || this.player.skillPoints <= 0) return;
    if (!isSkillUnlocked(key, this.player.skills)) {
      this.callbacks.onToast('Desbloquea primero la habilidad previa de esta rama.');
      return;
    }
    const curRank = this.player.skills[key] ?? 0;
    if (curRank >= node.maxRank) {
      this.callbacks.onToast(`${node.name} ya está al rango máximo.`);
      return;
    }

    this.player.skillPoints--;
    this.player.skills[key] = curRank + 1;
    this.recalcPlayerStats(true);
    if (key === 'vitality') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 28);
    } else if (key === 'magic') {
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + 10);
    }
    this.callbacks.onToast(`${node.name} Nv.${this.player.skills[key]} (${node.perRankSummary})`);
    this.audio.questDone();
    this.spawnBurst(this.player.pos.x, this.player.pos.y + 0.8, this.player.pos.z, 18, 0xfacc15, 4, 0.6, -1);
    this.emitHud(true);
  }

  // =========================================================================
  // COMBAT, COLLISION & PROGRESSION INTERNALS
  // =========================================================================
  private openDialogue(npc: NpcEntity): void {
    this.isDialogueOpen = true;
    this.talkingNpc = npc;
    npc.actor.playAnimation('talk');
    this.clearMovementAndCombatIntent();
    this.audio.talk();
    const data = npc.talk();
    this.callbacks.onDialogue({
      npcName: npc.name,
      npcRole: npc.role,
      portraitCanvas: createProceduralNpcPortrait(npc.role),
      text: data.text,
      buttons: data.buttons,
    });
  }

  private closeDialogue(): void {
    this.isDialogueOpen = false;
    if (this.talkingNpc) {
      this.talkingNpc.actor.playAnimation('idle');
      this.talkingNpc = null;
    }
    this.callbacks.onDialogue(null);
  }

  private getNearestInteractable(): { type: 'chest' | 'npc' | 'crystal'; target?: NpcEntity; label: string } | null {
    const chestDist = Math.hypot(this.bankChestPos.x - this.player.pos.x, this.bankChestPos.z - this.player.pos.z);
    if (chestDist < 2.45) {
      return { type: 'chest', label: '[F] Abrir cofre' };
    }

    let bestNpc: NpcEntity | null = null;
    let bestD = 2.15;
    for (const n of this.npcs) {
      const d = Math.hypot(n.pos.x - this.player.pos.x, n.pos.z - this.player.pos.z);
      if (d < bestD) {
        bestD = d;
        bestNpc = n;
      }
    }
    if (bestNpc) {
      if (bestNpc.role === 'banker') return { type: 'chest', target: bestNpc, label: '[F] Abrir cofre' };
      return { type: 'npc', target: bestNpc, label: `[F] Hablar con ${bestNpc.name}` };
    }

    if (!this.player.hasCrystal) {
      const cd = Math.hypot(this.crystalPos.x - this.player.pos.x, this.crystalPos.z - this.player.pos.z);
      if (cd < 2.25) {
        return {
          type: 'crystal',
          label: this.defeatedBossKinds.has('boss') ? '[F] Recoger Cristal Carmesí' : 'Derrota a Ignis Rex primero',
        };
      }
    }
    return null;
  }

  private updateDirFromFacing(): void {
    if (Math.abs(this.player.facing.x) > Math.abs(this.player.facing.y)) {
      this.player.dir = this.player.facing.x < 0 ? 2 : 3;
    } else {
      this.player.dir = this.player.facing.y < 0 ? 1 : 0;
    }
  }

  private performMeleeAttack(aimDir: THREE.Vector2 | null): void {
    const p = this.player;
    if (aimDir) {
      p.facing.copy(aimDir).normalize();
      this.updateDirFromFacing();
    }

    const step = p.comboStep;
    p.comboStep = ((step + 1) % 3) as 0 | 1 | 2;
    p.comboTimer = 0.95;

    const atkCd = Math.max(0.16, 0.36 / (1 + p.atkSpeedPct * 0.01));
    const atkDur = Math.min(0.22, atkCd * 0.78);
    p.atkCd = atkCd;
    p.atkAnim = atkDur;
    p.atkAnimDur = atkDur;
    p.squash = step === 2 ? 0.32 : 0.22;
    this.audio.sword();
    this.hero.setFacing(p.facing.x, p.facing.y);
    this.hero.playAnimation('attack', step, atkDur);

    // Subtle forward lunge for physical weight & coherent hit registration
    if (p.dashTimer <= 0) {
      const lunge = step === 2 ? 0.34 : 0.24;
      this.tryMoveEntity(p.pos, p.facing.x * lunge, p.facing.y * lunge, 0.48);
    }

    const px = p.pos.x;
    const py = p.pos.y;
    const pz = p.pos.z;
    const fx = p.facing.x;
    const fz = p.facing.y;
    const ang = Math.atan2(fz, fx);
    p.slashBaseAng = ang;
    p.slashDirSign = step === 1 ? -1 : 1;

    const eqW = p.equipped.weapon;
    const isArmed = eqW !== null;
    const slashColor =
      eqW === 'crimson_dagger'
        ? 0xfb7185
        : eqW === 'frost_iron_blade' || eqW === 'frost_dagger'
          ? 0x7dd3fc
          : eqW === 'obsidian_greatsword'
            ? 0xfb923c
            : eqW === 'bronze_saber' || eqW === 'bronze_dagger'
              ? 0xfde047
              : isArmed
                ? 0xe2e8f0
                : 0xfef3c7;
    this.slashMat.color.setHex(slashColor);
    const comboArcMult = step === 2 ? 1.22 : 1.0;
    const arcScale = (isArmed ? p.meleeReach / 2.25 : 0.56) * comboArcMult;
    this.slashMesh.scale.set(arcScale, arcScale * p.slashDirSign, 1);
    this.slashMesh.position.set(
      px + fx * (isArmed ? 1.05 : 0.78),
      py + 0.9,
      pz + fz * (isArmed ? 1.05 : 0.78)
    );
    this.slashMesh.rotation.z = -ang + 0.45 * p.slashDirSign;
    this.slashMat.opacity = isArmed ? (step === 2 ? 0.94 : 0.82) : 0.56;

    const range = p.meleeReach * (step === 2 ? 1.1 : 1.0);
    const comboDmgMult = step === 0 ? 1.0 : step === 1 ? 1.08 : 1.26;
    const critChance = p.critChancePct + (step === 2 ? 8 : 0);
    const critMultBase = 1.75 + p.skills.crit * 0.12;
    let landedHit = false;
    let landedCrit = false;
    let sweepDmg = 0;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      const dx = e.pos.x - px;
      const dz = e.pos.z - pz;
      const maxR = range + e.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq > maxR * maxR) continue;

      const dist = Math.sqrt(distSq);
      const invDist = dist > 0.01 ? 1 / dist : 0;
      const dot = dist > 0.01 ? dx * invDist * fx + dz * invDist * fz : 1;
      if (dot > (step === 2 ? -0.05 : 0.12) || dist < e.radius + 0.85) {
        const isCrit = Math.random() * 100 < critChance;
        const critMult = isCrit ? critMultBase : 1;
        const hitRes = ProgressionSystem.computePlayerDamage({
          playerLevel: p.level,
          monsterLevel: e.level,
          baseAttack: p.baseAttack,
          equipmentBonus: p.equipmentBonus,
          comboMultiplier: comboDmgMult,
          critMultiplier: critMult,
        });
        if (hitRes.missed) {
          this.markInCombat();
          e.provoked = true;
          this.setCombatTarget(e);
          this.spawnFloatText(e.pos, 'Miss', '#9ca3af', 15, false, false, 0.55);
          continue;
        }
        const kbFactor = p.level < e.level ? hitRes.accuracyPenalty * 0.32 : 1.0;
        const kb = (isCrit ? 1.15 : 0.78) * (step === 2 ? 1.25 : 1.0) * kbFactor;
        this.damageEnemy(e, hitRes.damage, dx * invDist * kb, dz * invDist * kb, isCrit);
        landedHit = true;
        sweepDmg += hitRes.damage;
        if (isCrit) landedCrit = true;
      }
    }

    if (landedHit) {
      p.comboHitCount++;
      p.comboDmgSum += sweepDmg;
      if (p.comboHitCount >= 2) {
        this.spawnFloatText(
          p.pos,
          p.comboHitCount >= 3 ? `¡Combo x${p.comboHitCount} · ${p.comboDmgSum}!` : `Combo x${p.comboHitCount} · ${p.comboDmgSum}`,
          p.comboHitCount >= 3 ? '#fbbf24' : '#7dd3fc',
          p.comboHitCount >= 3 ? 17 : 15,
          false,
          true
        );
      }
      if (landedCrit) this.audio.crit();
      this.hitstopTimer = landedCrit || step === 2 ? 0.052 : 0.034;
      this.screenShake = Math.max(this.screenShake, landedCrit || step === 2 ? 0.22 : 0.13);
    }
  }

  private performSpell(aimDir: THREE.Vector2 | null): void {
    const p = this.player;
    const spellId = p.activeSpell;
    if (!spellId || p.learnedSpells.length === 0) {
      this.callbacks.onToast('Sin hechizos: visita al Mago Theron en la aldea.');
      return;
    }
    const def = SPELL_DEFS[spellId];
    const cost = Math.max(6, Math.round(def.manaCost * (1 - p.skills.spellMastery * 0.1)));
    if (p.mp < cost) {
      this.spawnFloatText(p.pos, '¡Sin Maná!', '#60a5fa', 13);
      return;
    }
    if (aimDir) {
      p.facing.copy(aimDir).normalize();
      this.updateDirFromFacing();
    }
    p.mp -= cost;
    p.magCd = Math.max(0.32, def.cooldown * (1 - p.skills.spellMastery * 0.06));
    p.castAnim = 0.26;
    p.squash = 0.15;
    this.hero.setFacing(p.facing.x, p.facing.y);
    this.hero.playAnimation('cast');
    this.audio.spellCast(spellId);
    this.emitPlayerBars(false);
    this.emitHud();

    const masteryScale = 1 + p.skills.spellMastery * 0.08;

    if (spellId === 'frost_nova') {
      const novaRadius = 4.6 + p.skills.spellMastery * 0.35;
      const novaDmg = Math.round(p.magDmg * 1.32);
      this.spawnBurst(p.pos.x, p.pos.y + 0.65, p.pos.z, 38, 0x7dd3fc, 6.2, 0.72, -1.5, 1.25);
      let hits = 0;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead) continue;
        const dx = e.pos.x - p.pos.x;
        const dz = e.pos.z - p.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= novaRadius + e.radius) {
          e.slowTimer = Math.max(e.slowTimer, 3.2);
          const nx = dist > 0.01 ? dx / dist : p.facing.x;
          const nz = dist > 0.01 ? dz / dist : p.facing.y;
          const hitRes = ProgressionSystem.computePlayerDamage({
            playerLevel: p.level,
            monsterLevel: e.level,
            baseAttack: novaDmg,
            equipmentBonus: p.equipmentBonus * 0.5,
          });
          if (hitRes.missed) {
            this.markInCombat();
            e.provoked = true;
            this.setCombatTarget(e);
            this.spawnFloatText(e.pos, 'Miss', '#9ca3af', 15, false, false, 0.55);
          } else {
            this.damageEnemy(e, hitRes.damage, nx * 1.1, nz * 1.1, false);
            hits++;
          }
        }
      }
      if (hits > 0) {
        this.hitstopTimer = 0.045;
        this.screenShake = Math.max(this.screenShake, 0.22);
      }
      return;
    }

    if (spellId === 'astral_lance') {
      this.spawnProjectile(
        p.pos.x + p.facing.x * 0.8,
        p.pos.y,
        p.pos.z + p.facing.y * 0.8,
        p.facing.x * 22,
        p.facing.y * 22,
        true,
        Math.round(p.magDmg * 1.55),
        0xc084fc,
        0.54 * masteryScale,
        false,
        0,
        4,
        false
      );
      return;
    }

    // Arcane Pulse (default learned spell #1 — zero fireball!)
    this.spawnProjectile(
      p.pos.x + p.facing.x * 0.8,
      p.pos.y,
      p.pos.z + p.facing.y * 0.8,
      p.facing.x * 17.5,
      p.facing.y * 17.5,
      true,
      Math.round(p.magDmg * 1.15),
      0x38bdf8,
      0.48 * masteryScale,
      true,
      2.6 + p.skills.spellMastery * 0.25,
      1,
      false
    );
  }

  private performDash(): void {
    this.player.dashCd = Math.max(0.48, 0.95 * (1 - this.player.skills.agility * 0.08));
    this.player.dashTimer = 0.18;
    this.player.invuln = Math.max(this.player.invuln, 0.28);
    this.player.squash = -0.22;
    this.audio.dash();
    this.spawnBurst(this.player.pos.x, this.player.pos.y + 0.6, this.player.pos.z, 14, 0x93c5fd, 3.2, 0.45);
  }

  private gainXp(amount: number): void {
    if (amount <= 0) return;
    this.player.xp += amount;
    let leveled = false;
    while (this.player.xp >= this.player.xpNext) {
      this.player.xp -= this.player.xpNext;
      this.player.level++;
      this.player.xpNext = xpForNextLevel(this.player.level);
      this.player.skillPoints += 1;
      leveled = true;
    }
    if (leveled) {
      this.recalcPlayerStats(false);
      this.audio.levelUp();
      this.spawnFloatText(this.player.pos, `¡NIVEL ${this.player.level}!`, '#fde047', 19);
      this.spawnBurst(this.player.pos.x, this.player.pos.y + 0.5, this.player.pos.z, 36, 0xfacc15, 5.5, 0.9, -2);
      this.callbacks.onToast(`¡Nivel ${this.player.level}! +1 Punto de Habilidad (C)`);
    }
    this.emitPlayerBars(leveled);
    this.emitHud();
  }

  private markInCombat(): void {
    this.combatTimer = 3.0;
    if (!this.isInCombat) {
      this.isInCombat = true;
      gameEventBus.emit('player:combatChanged', { inCombat: true });
    }
  }

  private damagePlayer(amount: number, isElemental = false, attackerLevel?: number): void {
    if (this.player.invuln > 0 || this.phase !== 'playing') return;
    this.markInCombat();
    const gapMult =
      attackerLevel !== undefined
        ? ProgressionSystem.getIncomingDamageMultiplier(this.player.level, attackerLevel)
        : 1.0;
    const scaledAmount = amount * gapMult;
    const elemMitigated = isElemental ? scaledAmount * (1 - this.player.elemResistPct / 100) : scaledAmount;
    const finalDmg = Math.max(2, Math.round(elemMitigated) - this.player.def);
    this.player.hp = Math.max(0, this.player.hp - finalDmg);
    this.player.invuln = 0.55;
    this.player.squash = -0.25;
    this.screenShake = 0.25;
    this.hero.takeDamage(finalDmg, this.player.hp / Math.max(1, this.player.maxHp));
    this.audio.hurt();
    this.spawnFloatText(this.player.pos, `-${finalDmg}`, isElemental ? '#fb923c' : '#ff4d5a', 16);
    this.spawnBurst(this.player.pos.x, this.player.pos.y + 0.9, this.player.pos.z, 12, 0xef4444, 3.2, 0.45);
    this.emitPlayerBars(false);
    this.emitHud();

    if (this.player.hp <= 0) {
      this.phase = 'gameover';
      this.keys = {};
      this.joyVec.set(0, 0);
      this.actionBuffer = null;
      this.player.dashTimer = 0;
      this.player.atkAnim = 0;
      this.player.castAnim = 0;
      this.hitstopTimer = 0;
      this.screenShake = 0;
      this.closeDialogue();
      this.callbacks.onPhaseChange('gameover');
    }
  }

  private damageEnemy(e: EnemyEntity, dmg: number, kx: number, kz: number, isCrit = false): void {
    if (e.dead) return;
    this.markInCombat();

    e.provoked = true;
    this.setCombatTarget(e);

    const threat = ProgressionSystem.getThreatTier(this.player.level, e.level);
    const dmgMult = ProgressionSystem.getDamageMultiplier(this.player.level, e.level);

    e.hp -= dmg;
    e.flash = 0.14;
    e.squash = isCrit ? 0.34 : 0.26;
    e.actor.setHealthRatio(Math.max(0, e.hp) / Math.max(1, e.maxHp));
    e.actor.triggerHit();
    gameEventBus.emit('enemy:damaged', {
      id: e.id,
      hp: Math.max(0, e.hp),
      maxHp: e.maxHp,
      dead: e.hp <= 0,
    });
    this.audio.hit();
    const floatText =
      dmgMult <= 0.15
        ? `${dmg} (Nv+16)`
        : isCrit
          ? `¡${dmg}!`
          : `${dmg}`;
    const floatCol =
      dmgMult <= 0.15
        ? '#fca5a5'
        : isCrit
          ? '#fbbf24'
          : threat === 'yellow'
            ? '#fde047'
            : '#fff3b0';
    this.spawnFloatText(e.pos, floatText, floatCol, isCrit ? 20 : e.isBoss ? 18 : 16, isCrit, false, 0.6);
    this.spawnBurst(e.pos.x, e.pos.y + 0.8, e.pos.z, isCrit ? 16 : 10, isCrit ? 0xf43f5e : 0xfbbf24, 4.2, 0.42);

    if (!e.isBoss && (kx !== 0 || kz !== 0)) {
      this.tryMoveEntity(e.pos, kx * 0.85, kz * 0.85, e.radius);
    }

    if (e.hp <= 0) {
      e.dead = true;
      e.provoked = false;
      if (this.targetEnemy === e) {
        this.setCombatTarget(null);
      }
      if (this.hero.autoAttackTarget === e) {
        this.hero.clearAutoAttackTarget();
      }
      e.actor.triggerDeathBurst();
      e.actor.group.visible = false;
      const zone = getSpawnZoneById(e.zoneId);
      e.respawnTimer = e.isBoss ? 60 : (zone?.respawnTime ?? 30);
      this.player.kills++;

      const homeBiome = e.biome;
      if (e.type === 'slime') this.player.slimeKills++;
      if (homeBiome === 1) this.player.forestKills++;

      if (e.isBoss) {
        this.defeatedBossKinds.add(e.type);
        this.player.defeatedBiomeBosses = this.defeatedBossKinds.size;
        this.hitstopTimer = 0.065;
        this.screenShake = e.type === 'boss' ? 0.55 : 0.38;
        this.audio.explosion();
        this.spawnBurst(
          e.pos.x,
          e.pos.y + 1.3,
          e.pos.z,
          e.type === 'boss' ? 54 : 38,
          e.type === 'boss' ? 0xff6b2b : 0xfacc15,
          6.5,
          0.95,
          -2
        );
        this.callbacks.onToast(
          `¡${e.name} derrotado! Reaparecerá en 1 min (+5 niveles a ${BIOME_NAMES[homeBiome]}).`
        );
      } else {
        this.spawnBurst(e.pos.x, e.pos.y + 0.8, e.pos.z, 20, 0xc084fc, 4.5, 0.6, -2);
      }

      // Regla de progreso Flyff Universe: EXP y Drop según brecha de nivel
      const expAward = ProgressionSystem.getExpGain(this.player.level, e.level, e.isBoss);
      const dropMult = ProgressionSystem.getDropMultiplier(this.player.level, e.level);

      if (expAward > 0) {
        this.gainXp(expAward);
      } else {
        this.spawnFloatText(e.pos, '0 EXP (Nv)', '#ef4444', 13);
      }

      const killOrd = (this.player.killCounters[e.type] ?? 0) + 1;
      this.player.killCounters[e.type] = killOrd;

      if (dropMult > 0) {
        const loot = rollDeterministicLoot(e.type, homeBiome, e.level, killOrd, this.worldSeed);
        const scaledGold = Math.max(1, Math.round(loot.gold * dropMult));

        this.spawnPickup(
          e.pos.x + (Math.random() - 0.5) * 0.6,
          e.pos.z + (Math.random() - 0.5) * 0.6,
          'gold',
          undefined,
          undefined,
          scaledGold
        );
        if (loot.consumable && (dropMult >= 1 || killOrd % 2 === 0)) {
          this.spawnPickup(
            e.pos.x + (Math.random() - 0.5) * 0.8,
            e.pos.z + (Math.random() - 0.5) * 0.8,
            loot.consumable
          );
        }
        if (dropMult >= 0.6) {
          for (const m of loot.materials) {
            this.spawnPickup(
              e.pos.x + (Math.random() - 0.5) * 1.1,
              e.pos.z + (Math.random() - 0.5) * 1.1,
              'material',
              undefined,
              m.id,
              m.qty
            );
          }
          if (loot.weaponDrop) {
            this.spawnPickup(
              e.pos.x + (Math.random() - 0.5) * 0.9,
              e.pos.z + (Math.random() - 0.5) * 0.9,
              'weapon',
              loot.weaponDrop
            );
          }
        }
      }

      this.emitHud();
    } else {
      this.emitHud();
    }
  }

  private spawnProjectile(
    x: number,
    y: number,
    z: number,
    vx: number,
    vz: number,
    fromPlayer: boolean,
    dmg: number,
    color: number,
    radius: number,
    aoe: boolean,
    aoeRadius = 3.0,
    pierceLeft = 1,
    isElemental = false,
    attackerLevel = this.player.level
  ): void {
    let mat = this.projMatCache.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      this.projMatCache.set(color, mat);
    }
    const mesh = this.projMeshPool.pop() ?? new THREE.Mesh(this.projGeo, mat);
    mesh.material = mat;
    mesh.scale.setScalar(radius * 0.65);
    mesh.position.set(x, y + 0.85, z);
    mesh.visible = true;
    this.scene.add(mesh);

    const slot = this.dynamicLightPool.find((l) => !l.active) || null;
    if (slot) {
      slot.active = true;
      slot.light.color.setHex(color);
      slot.light.intensity = 2.1;
      slot.light.position.copy(mesh.position);
    }

    this.projectiles.push({
      pos: mesh.position,
      vx,
      vz,
      fromPlayer,
      isElemental,
      attackerLevel,
      dmg,
      color,
      radius,
      aoe,
      aoeRadius,
      pierceLeft,
      hitSet: pierceLeft > 1 ? new Set<EnemyEntity>() : null,
      life: 2.2,
      mesh,
      lightSlot: slot,
    });
  }

  private spawnPickup(
    x: number,
    z: number,
    type: PickupEntity['type'],
    gearId?: string,
    materialId?: MaterialId,
    qty = 1,
    pickupDelay = 0
  ): void {
    // Agrupación visual / apilado para objetos del mismo tipo cercanos en el suelo
    if (type === 'potion' || type === 'elixir' || type === 'material') {
      for (let i = 0; i < this.pickups.length; i++) {
        const ex = this.pickups[i];
        if (ex.collected || ex.type !== type || ex.materialId !== materialId) continue;
        if (Math.hypot(ex.pos.x - x, ex.pos.z - z) <= 1.35) {
          ex.qty = (ex.qty ?? 1) + qty;
          ex.life = 300;
          ex.pickupDelay = Math.max(ex.pickupDelay, pickupDelay);
          return;
        }
      }
    }

    // Limitar objetos no-oro simultáneos en el suelo (máx. 20; recicla el más antiguo)
    if (type !== 'gold') {
      let nonGoldCount = 0;
      let oldestIdx = -1;
      let oldestLife = Infinity;
      for (let i = 0; i < this.pickups.length; i++) {
        const cur = this.pickups[i];
        if (cur.collected || cur.type === 'gold') continue;
        nonGoldCount++;
        if (cur.life < oldestLife) {
          oldestLife = cur.life;
          oldestIdx = i;
        }
      }
      if (nonGoldCount >= 20 && oldestIdx >= 0) {
        const drop = this.pickups[oldestIdx];
        drop.itemActor.group.visible = false;
        this.scene.remove(drop.itemActor.group);
        let dropPool = this.itemPoolByArch.get(drop.archetype);
        if (!dropPool) {
          dropPool = [];
          this.itemPoolByArch.set(drop.archetype, dropPool);
        }
        dropPool.push(drop.itemActor);
        this.pickups.splice(oldestIdx, 1);
      }
    }

    const y = getTerrainHeight(x, z, this.worldSeed);
    const archetype = resolveItemArchetype(type, gearId, materialId);
    let pool = this.itemPoolByArch.get(archetype);
    if (!pool) {
      pool = [];
      this.itemPoolByArch.set(archetype, pool);
    }
    const itemActor = pool.pop() ?? new ItemEntity(archetype);
    itemActor.resetForSpawn(x, y, z);
    itemActor.setZoomOutline(this.viewSize);
    itemActor.setLightAndTint(_biomeLightDir, _biomeAmbientTint);
    this.scene.add(itemActor.group);

    this.pickups.push({
      id: `pickup_${this.nextEntityId++}`,
      type,
      archetype,
      gearId,
      materialId,
      qty,
      pos: itemActor.group.position,
      baseY: y + 0.18,
      itemActor,
      collected: false,
      life: type === 'gold' ? Infinity : 300,
      pickupDelay,
    });
  }

  private resolveWorldPos(nx: number, nz: number, radius: number): { x: number; z: number } {
    let x = clamp(nx, -PLAY_BOUND, PLAY_BOUND);
    let z = clamp(nz, -PLAY_BOUND, PLAY_BOUND);
    // 1. Landmark & NPC colliders
    for (let i = 0; i < this.landmarkColliders.length; i++) {
      const c = this.landmarkColliders[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const minD = radius + c.r;
      const distSq = dx * dx + dz * dz;
      if (distSq < minD * minD && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const push = minD - dist;
        x += (dx / dist) * push;
        z += (dz / dist) * push;
      }
    }
    for (let i = 0; i < this.npcColliders.length; i++) {
      const c = this.npcColliders[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const minD = radius + c.r;
      const distSq = dx * dx + dz * dz;
      if (distSq < minD * minD && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const push = minD - dist;
        x += (dx / dist) * push;
        z += (dz / dist) * push;
      }
    }
    // 2. O(1) spatial hash lookup on only the 3x3 chunks surrounding the entity
    const resolved = this.chunkManager.resolveChunkColliders(x, z, radius);
    return {
      x: clamp(resolved.x, -PLAY_BOUND, PLAY_BOUND),
      z: clamp(resolved.z, -PLAY_BOUND, PLAY_BOUND),
    };
  }

  private isPositionSafeFromLiquid(x: number, z: number, radius: number): boolean {
    if (isLiquidAt(x, z, this.worldSeed)) return false;
    const r = radius * 0.85;
    if (r <= 0.05) return true;
    const diag = r * 0.7071;
    if (
      isLiquidAt(x + r, z, this.worldSeed) ||
      isLiquidAt(x - r, z, this.worldSeed) ||
      isLiquidAt(x, z + r, this.worldSeed) ||
      isLiquidAt(x, z - r, this.worldSeed) ||
      isLiquidAt(x + diag, z + diag, this.worldSeed) ||
      isLiquidAt(x - diag, z + diag, this.worldSeed) ||
      isLiquidAt(x + diag, z - diag, this.worldSeed) ||
      isLiquidAt(x - diag, z - diag, this.worldSeed)
    ) {
      return false;
    }
    return true;
  }

  private tryMoveEntity(pos: THREE.Vector3, dx: number, dz: number, radius: number): void {
    const tryX = this.resolveWorldPos(pos.x + dx, pos.z, radius);
    if (this.isPositionSafeFromLiquid(tryX.x, tryX.z, radius)) {
      pos.x = tryX.x;
      pos.z = tryX.z;
    }
    const tryZ = this.resolveWorldPos(pos.x, pos.z + dz, radius);
    if (this.isPositionSafeFromLiquid(tryZ.x, tryZ.z, radius)) {
      pos.x = tryZ.x;
      pos.z = tryZ.z;
    }
    pos.y = getTerrainHeight(pos.x, pos.z, this.worldSeed);
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    hexColor: number,
    life = 0.7,
    gravity = 0,
    size = 1.0
  ): void {
    // O(1) slot acquisition from pre-allocated pool (zero object allocation / GC pressure)
    let id: number;
    if (this.freeParticleIds.length > 0) {
      id = this.freeParticleIds.pop()!;
      this.activeParticleIds.push(id);
    } else {
      // Recycle oldest active slot in-place when pool is at capacity
      id = this.activeParticleIds[0];
    }

    _scratchCol.setHex(hexColor);
    const slot = this.particlePool[id];
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.r = _scratchCol.r;
    slot.g = _scratchCol.g;
    slot.b = _scratchCol.b;
    slot.life = life;
    slot.maxLife = life;
    slot.gravity = gravity;
    slot.size = size;
  }

  private spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    hexColor: number,
    speed = 4,
    life = 0.6,
    gravity = -3,
    size = 1.05
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.3 + Math.random() * 0.7) * speed;
      this.spawnParticle(
        x,
        y,
        z,
        Math.cos(a) * sp,
        1 + Math.random() * speed * 0.7,
        Math.sin(a) * sp,
        hexColor,
        life * (0.6 + Math.random() * 0.6),
        gravity,
        size * (0.75 + Math.random() * 0.5)
      );
    }
  }

  private spawnFloatText(
    worldPos: THREE.Vector3,
    text: string,
    color = '#ffffff',
    size = 15,
    isCrit = false,
    isCombo = false,
    duration?: number
  ): void {
    this.floatTextSystem.spawn({
      wx: worldPos.x + (Math.random() - 0.5) * 0.65,
      wy: worldPos.y + (isCombo ? 2.45 : 1.9),
      wz: worldPos.z + (Math.random() - 0.5) * 0.35,
      text,
      color,
      size,
      isCrit,
      isCombo,
      duration,
    });
  }

  // =========================================================================
  // INPUT & WINDOW EVENTS
  // =========================================================================
  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const outlineScale = clamp(camDist * 0.72, 6, 18);
    this.hero?.setZoomOutline(outlineScale);
    for (let i = 0; i < this.enemies.length; i++) this.enemies[i].actor.setZoomOutline(outlineScale);
    for (let i = 0; i < this.npcs.length; i++) this.npcs[i].actor.setZoomOutline(outlineScale);
    for (let i = 0; i < this.pickups.length; i++) this.pickups[i].itemActor.setZoomOutline(outlineScale);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    const k = e.key.toLowerCase();
    this.keys[k] = true;
    if (e.repeat) return;

    if (k === 'escape') {
      if (this.isWorldMapOpen) {
        return;
      } else if (this.isBankOpen) {
        this.setBankOpen(false);
      } else if (this.isForgeOpen) {
        this.callbacks.onForgeOpen?.(false);
      } else if (this.isDialogueOpen) {
        this.closeDialogue();
      } else if (this.isHeroModalOpen) {
        this.callbacks.onToggleHeroPanel?.();
      } else if (this.phase === 'playing' || this.phase === 'paused') {
        this.togglePause();
      }
      return;
    }

    if (this.phase !== 'playing' || this.isWorldMapOpen) return;

    if (k === 'c' && !this.isDialogueOpen && !this.isForgeOpen && !this.isBankOpen) {
      this.callbacks.onToggleHeroPanel?.();
      return;
    }
    if (k === 'i' && !this.isDialogueOpen && !this.isForgeOpen && !this.isHeroModalOpen && !this.isBankOpen) {
      gameEventBus.emit('ui:toggleInventory', undefined);
      return;
    }
    if (this.isHeroModalOpen || this.isForgeOpen || this.isBankOpen) return;

    if (k === ' ' || k === 'spacebar') {
      e.preventDefault();
      if (this.interactionSystem.getContextAction()) {
        this.triggerContextAction();
      } else {
        this.triggerAttack();
      }
    } else if (k === 'e') {
      this.triggerSpell();
    } else if (k === 'r') {
      this.cycleSpell();
    } else if (k === 'shift') {
      this.triggerDash();
    } else if (k === 'f') {
      this.triggerInteract();
    } else if (k === 'q' || k === 'h') {
      this.usePotion();
    } else if (k === 'z') {
      this.useElixir();
    } else if (k === '1') {
      this.triggerSkillSlot(0);
    } else if (k === '2') {
      this.triggerSkillSlot(1);
    } else if (k === '3') {
      this.triggerSkillSlot(2);
    } else if (k === '4' || k === '5') {
      this.useInventorySlot(Number(k) - 1);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.key.toLowerCase()] = false;
  };

  private onWindowBlur = (): void => {
    this.keys = {};
    this.joyVec.set(0, 0);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.target !== this.renderer.domElement) return;
    this.pointerDownState.active = true;
    this.pointerDownState.x = e.clientX;
    this.pointerDownState.y = e.clientY;
    this.pointerDownState.time = performance.now();
    this.pointerDownState.button = e.button;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointerDownState.active) return;
    this.pointerDownState.active = false;
    if (
      this.phase !== 'playing' ||
      this.isDialogueOpen ||
      this.isHeroModalOpen ||
      this.isForgeOpen ||
      this.isBankOpen ||
      this.isWorldMapOpen
    ) {
      return;
    }
    if (e.target !== this.renderer.domElement) return;

    const moveDist = Math.hypot(e.clientX - this.pointerDownState.x, e.clientY - this.pointerDownState.y);
    const elapsed = performance.now() - this.pointerDownState.time;
    if (moveDist >= 10 || elapsed >= 300) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.groundPlane.constant = -this.player.pos.y;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) return;

    // Clic derecho (ratón): lanzar hechizo o ataque hacia el cursor
    if (e.button === 2) {
      const dx = this.hitPoint.x - this.player.pos.x;
      const dz = this.hitPoint.z - this.player.pos.z;
      const aim = Math.hypot(dx, dz) > 0.1 ? _scratchAim.set(dx, dz).normalize() : null;
      if (this.player.learnedSpells.length > 0 && this.player.activeSpell) {
        this.triggerSpell(aim);
      } else {
        this.triggerAttack(aim);
      }
      return;
    }

    if (e.button !== 0 && e.pointerType !== 'touch') return;

    // Raycast dirigido únicamente a enemigos vivos visibles (nunca contra toda la escena)
    this.enemyHitObjects.length = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i];
      if (!en.dead && en.actor.group.visible) {
        this.enemyHitObjects.push(en.actor.group);
      }
    }

    let clickedEnemy: EnemyEntity | null = null;
    const hit = this.interactionSystem.raycastInteractables(this.raycaster, this.enemyHitObjects);
    if (hit) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        if (cur.userData?.enemyEntity) {
          clickedEnemy = cur.userData.enemyEntity as EnemyEntity;
          break;
        }
        cur = cur.parent;
      }
    }

    // Fallback generoso cerca del punto de toque en el plano para facilitar selección táctil
    if (!clickedEnemy) {
      let bestEnemyDist = 1.6;
      for (let i = 0; i < this.enemies.length; i++) {
        const en = this.enemies[i];
        if (en.dead || !en.actor.group.visible) continue;
        const d = Math.hypot(en.pos.x - this.hitPoint.x, en.pos.z - this.hitPoint.z);
        if (d <= en.radius + 1.05 && d < bestEnemyDist) {
          bestEnemyDist = d;
          clickedEnemy = en;
        }
      }
    }

    if (clickedEnemy && !clickedEnemy.dead) {
      this.hero.setAutoAttackTarget(clickedEnemy);
      this.setCombatTarget(clickedEnemy);
      const distToEnemy = Math.hypot(
        clickedEnemy.pos.x - this.player.pos.x,
        clickedEnemy.pos.z - this.player.pos.z
      );
      const attackRange = Math.max(2.5, this.player.meleeReach + clickedEnemy.radius);
      const aim = _scratchAim
        .set(clickedEnemy.pos.x - this.player.pos.x, clickedEnemy.pos.z - this.player.pos.z)
        .normalize();
      if (distToEnemy <= attackRange) {
        this.hero.clearMoveTarget();
        this.tapMarkerMesh.visible = false;
        if (this.player.atkCd <= 0) {
          this.autoAttackCd = Math.max(0.28, 0.78 / (1 + this.player.atkSpeedPct * 0.01));
          this.triggerAttack(aim);
        }
        this.emitHud();
        return;
      }
      _tapTargetPos.set(clickedEnemy.pos.x, clickedEnemy.pos.y, clickedEnemy.pos.z);
      this.hero.moveTo(_tapTargetPos);
      this.tapStuckTimer = 0;
      this.tapLastDistSq = Infinity;
      this.tapMarkerMesh.position.set(_tapTargetPos.x, _tapTargetPos.y + 0.08, _tapTargetPos.z);
      this.tapMarkerMesh.visible = true;
      this.emitHud();
      return;
    }

    // Movimiento por toque/clic al suelo: cancela auto-ataque inmediatamente y oculta target frame
    this.hero.clearAutoAttackTarget();
    this.setCombatTarget(null);
    let destX = clamp(this.hitPoint.x, -PLAY_BOUND + 2, PLAY_BOUND - 2);
    let destZ = clamp(this.hitPoint.z, -PLAY_BOUND + 2, PLAY_BOUND - 2);
    if (!this.isPositionSafeFromLiquid(destX, destZ, 0.48)) {
      let foundDry = false;
      const sx = this.player.pos.x;
      const sz = this.player.pos.z;
      for (let step = 1; step <= 14; step++) {
        const t = step / 14;
        const tx = lerp(destX, sx, t);
        const tz = lerp(destZ, sz, t);
        if (this.isPositionSafeFromLiquid(tx, tz, 0.48)) {
          destX = tx;
          destZ = tz;
          foundDry = true;
          break;
        }
      }
      if (!foundDry) {
        this.hero.clearMoveTarget();
        this.tapMarkerMesh.visible = false;
        return;
      }
    }
    const targetY = getTerrainHeight(destX, destZ, this.worldSeed);
    _tapTargetPos.set(destX, targetY, destZ);
    this.hero.moveTo(_tapTargetPos);
    this.tapStuckTimer = 0;
    this.tapLastDistSq = Infinity;
    this.tapMarkerMesh.position.set(destX, targetY + 0.08, destZ);
    this.tapMarkerMesh.visible = true;
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.stopRenderLoop();
    this.clock.stop();
    this.keys = {};
    this.joyVec.set(0, 0);
    registerSharedWebGLRenderer(null);
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    registerSharedWebGLRenderer(this.renderer);
    this.callbacks.onContextLost(false);
    if (!this.disposed && document.visibilityState !== 'hidden') {
      this.clock.start();
      this.clock.getDelta();
      this.startRenderLoop();
    }
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.stopRenderLoop();
      this.clock.stop();
      this.keys = {};
      this.joyVec.set(0, 0);
    } else if (!this.disposed && !this.contextLost && !this.renderer.getContext().isContextLost()) {
      this.clock.start();
      this.clock.getDelta();
      this.startRenderLoop();
    }
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  // =========================================================================
  // FRAME UPDATE & RENDER LOOP
  // =========================================================================
  private updateDayNight(dt: number): { nightFactor: number; dawnDuskFactor: number } {
    const dn = this.dayNightCycle.update({
      delta: dt,
      playerX: this.player.pos.x,
      playerY: this.player.pos.y,
      playerZ: this.player.pos.z,
      worldSeed: this.worldSeed,
      shadowMapSize: this.shadowMapSize,
      dirLight: this.dirLight,
      hemiLight: this.hemiLight,
      scene: this.scene,
      grassWindUniform: this.grassUniforms.uWindStrength,
      outSunDir: _sunLightDir,
      outSkyColor: _curSky,
    });

    this.chunkManager.setFogColor(_curSky, _sunLightDir, dn.fogNear, dn.fogFar);

    const nightFactor = dn.nightFactor;
    const winEmissive = 0.08 + nightFactor * 0.85;
    for (let i = 0; i < this.villageWindows.length; i++) {
      this.villageWindows[i].emissiveIntensity = winEmissive;
    }

    // Asignación dinámica de hasta 3 PointLights reales para las antorchas más cercanas (< 22u)
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    let best0: TorchEntry | null = null;
    let best1: TorchEntry | null = null;
    let best2: TorchEntry | null = null;
    let d0 = 484; // 22^2
    let d1 = 484;
    let d2 = 484;

    for (let i = 0; i < this.worldTorches.length; i++) {
      const t = this.worldTorches[i];
      const dx = t.x - px;
      const dz = t.z - pz;
      const distSq = dx * dx + dz * dz;
      const flick = Math.sin(this.elapsed * 11 + t.phase) * 0.14 + Math.cos(this.elapsed * 17 + t.phase) * 0.08;
      if (distSq < 3600) {
        t.flame.scale.setScalar(0.88 + flick * 0.35 + nightFactor * 0.18);
      }
      if (distSq < d0) {
        d2 = d1; best2 = best1;
        d1 = d0; best1 = best0;
        d0 = distSq; best0 = t;
      } else if (distSq < d1) {
        d2 = d1; best2 = best1;
        d1 = distSq; best1 = t;
      } else if (distSq < d2) {
        d2 = distSq; best2 = t;
      }
    }

    const chosenTorches = [best0, best1, best2];
    const torchStrength = 0.25 + nightFactor * 0.95;
    for (let i = 0; i < this.torchLightPool.length; i++) {
      const light = this.torchLightPool[i];
      const t = chosenTorches[i];
      if (!t) {
        light.intensity = 0;
        continue;
      }
      const distSq = (t.x - px) * (t.x - px) + (t.z - pz) * (t.z - pz);
      const falloff = clamp(1 - Math.sqrt(distSq) / 22, 0.15, 1);
      const flick = Math.sin(this.elapsed * 11 + t.phase) * 0.16 + Math.cos(this.elapsed * 17 + t.phase) * 0.09;
      light.position.set(t.x, t.y + 1.5, t.z);
      light.intensity = Math.max(0.1, (t.baseIntensity * torchStrength + flick) * falloff);
    }

    this.updateFireflies(dt, nightFactor);

    return { nightFactor, dawnDuskFactor: dn.dawnDuskFactor };
  }

  private updateFireflies(dt: number, nightFactor: number): void {
    void dt;
    const b = getBiomeId(this.player.pos.x, this.player.pos.z, this.worldSeed);
    const biomeAllows = b === 0 || b === 1;
    if (nightFactor <= 0.12 || !biomeAllows) {
      if (this.firefliesMesh.visible) {
        this.firefliesGeo.setDrawRange(0, 0);
        this.firefliesMesh.visible = false;
      }
      return;
    }

    const px = this.player.pos.x;
    const py = this.player.pos.y;
    const pz = this.player.pos.z;
    const density = b === 1 ? 1.0 : 0.45;
    const targetCount = Math.min(
      this.MAX_FIREFLIES,
      Math.max(0, Math.round(this.MAX_FIREFLIES * density * clamp((nightFactor - 0.12) / 0.65, 0, 1)))
    );

    if (targetCount === 0) {
      if (this.firefliesMesh.visible) {
        this.firefliesGeo.setDrawRange(0, 0);
        this.firefliesMesh.visible = false;
      }
      return;
    }

    this.firefliesActiveCount = targetCount;
    this.firefliesMesh.visible = true;
    this.firefliesGeo.setDrawRange(0, targetCount);

    // Anclaje en grilla de mundo cada 12m para que las luciérnagas no sigan artificialmente al jugador
    const gridX = Math.round(px / 12) * 12;
    const gridZ = Math.round(pz / 12) * 12;
    const t = this.elapsed;

    for (let i = 0; i < targetCount; i++) {
      const i5 = i * 5;
      const ox = this.fireflySeeds[i5];
      const oz = this.fireflySeeds[i5 + 1];
      const baseH = this.fireflySeeds[i5 + 2];
      const ph = this.fireflySeeds[i5 + 3];
      const spd = this.fireflySeeds[i5 + 4];

      const wx = gridX + ox + Math.sin(t * spd * 0.7 + ph) * 1.4;
      const wz = gridZ + oz + Math.cos(t * spd * 0.6 + ph * 1.3) * 1.4;
      const wy = py + baseH + Math.sin(t * spd * 1.3 + ph) * 0.45;

      const i3 = i * 3;
      this.fireflyPosArr[i3] = wx;
      this.fireflyPosArr[i3 + 1] = wy;
      this.fireflyPosArr[i3 + 2] = wz;

      const pulse = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.4 * spd + ph), 2);
      this.fireflyAlphaArr[i] = pulse * nightFactor * 0.92;
    }

    if (this.firefliesGeo.boundingSphere) {
      this.firefliesGeo.boundingSphere.center.set(gridX, py + 1.5, gridZ);
    }
    (this.firefliesGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.firefliesGeo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateParticles(dt: number, nightBoost: number, dawnDuskFactor = 0): void {
    const inVillage = Math.hypot(this.player.pos.x, this.player.pos.z - 17) < 22;
    const b = getBiomeId(this.player.pos.x, this.player.pos.z, this.worldSeed);
    const profile = inVillage ? VILLAGE_BIOME_PROFILE.particles : BIOME_CONFIGS[b].particles;

    this.ambientParticleTimer += dt;
    const spawnInterval = 0.14 / Math.max(0.5, profile.rateMultiplier);
    if (this.ambientParticleTimer > spawnInterval) {
      this.ambientParticleTimer = 0;
      const rx = this.player.pos.x + (Math.random() - 0.5) * 22;
      const rz = this.player.pos.z + (Math.random() - 0.5) * 18;
      const ry = getTerrainHeight(rx, rz, this.worldSeed);
      let col = Math.random() < 0.65 ? profile.primaryColor : profile.secondaryColor;
      if (dawnDuskFactor > 0.35 && profile.behavior !== 'ash_sparks' && Math.random() < dawnDuskFactor * 0.65) {
        col = Math.random() < 0.5 ? 0xffb36b : 0xff8552;
      }

      if (profile.behavior === 'ash_sparks') {
        this.spawnParticle(
          rx,
          ry + 0.2,
          rz,
          (Math.random() - 0.5) * 0.9,
          1.7 + Math.random() * 1.1,
          (Math.random() - 0.5) * 0.9,
          col,
          1.55,
          0,
          0.95
        );
      } else if (profile.behavior === 'snow_wind') {
        this.spawnParticle(
          rx,
          ry + 5.0 + Math.random() * 2.5,
          rz,
          (Math.random() - 0.35) * 1.15,
          -1.5 - Math.random() * 0.9,
          (Math.random() - 0.5) * 0.85,
          col,
          2.2,
          0,
          0.88
        );
      } else if (profile.behavior === 'ruins_wisps') {
        this.spawnParticle(
          rx,
          ry + 0.65 + Math.random() * 1.5,
          rz,
          (Math.random() - 0.5) * 0.75,
          0.35 + Math.random() * 0.45,
          (Math.random() - 0.5) * 0.75,
          col,
          2.1,
          0,
          0.92
        );
      } else if (profile.behavior === 'village_calm') {
        if (Math.random() < 0.7 || nightBoost > 0.4) {
          this.spawnParticle(
            rx,
            ry + 0.6 + Math.random() * 1.4,
            rz,
            (Math.random() - 0.5) * 0.35,
            0.25 + Math.random() * 0.3,
            (Math.random() - 0.5) * 0.35,
            col,
            2.3,
            0,
            0.8
          );
        }
      } else if (Math.random() < 0.55 || nightBoost > 0.45) {
        // spores_leaves
        this.spawnParticle(
          rx,
          ry + 0.55 + Math.random() * 1.3,
          rz,
          (Math.random() - 0.5) * 0.6,
          0.15 + Math.random() * 0.35,
          (Math.random() - 0.5) * 0.6,
          nightBoost > 0.55 ? 0xd9f99d : col,
          2.1,
          0,
          0.82
        );
      }
    }

    const active = this.activeParticleIds;
    for (let i = active.length - 1; i >= 0; i--) {
      const id = active[i];
      const p = this.particlePool[id];
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        const lastIdx = active.length - 1;
        if (i !== lastIdx) active[i] = active[lastIdx];
        active.pop();
        this.freeParticleIds.push(id);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }

    const count = active.length;
    if (count === 0) {
      if (this.pointsMesh.visible) {
        this.pointsGeo.setDrawRange(0, 0);
        this.pointsMesh.visible = false;
      }
      return;
    }

    this.pointsMesh.visible = true;
    this.pointsGeo.setDrawRange(0, count);

    for (let i = 0; i < count; i++) {
      const p = this.particlePool[active[i]];
      const lifeRatio = clamp(p.life / p.maxLife, 0, 1);
      const i3 = i * 3;
      this.pointPosArr[i3] = p.x;
      this.pointPosArr[i3 + 1] = p.y;
      this.pointPosArr[i3 + 2] = p.z;
      this.pointSizeArr[i] = p.size * (0.4 + lifeRatio * 0.75);
      this.pointAlphaArr[i] = Math.min(1, lifeRatio * 1.25);
      this.pointColorArr[i3] = p.r;
      this.pointColorArr[i3 + 1] = p.g;
      this.pointColorArr[i3 + 2] = p.b;
    }

    (this.pointsGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    if (p.atkCd > 0) p.atkCd = Math.max(0, p.atkCd - dt);
    if (this.autoAttackCd > 0) this.autoAttackCd = Math.max(0, this.autoAttackCd - dt);
    if (this.potionHpCd > 0) this.potionHpCd = Math.max(0, this.potionHpCd - dt);
    if (this.potionMpCd > 0) this.potionMpCd = Math.max(0, this.potionMpCd - dt);
    if (p.atkAnim > 0) p.atkAnim -= dt;
    if (p.castAnim > 0) p.castAnim -= dt;
    if (p.magCd > 0) p.magCd = Math.max(0, p.magCd - dt);
    if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.comboTimer > 0) {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) {
        p.comboStep = 0;
        p.comboHitCount = 0;
        p.comboDmgSum = 0;
      }
    }
    p.squash = lerp(p.squash, 0, 1 - Math.exp(-16 * dt));

    // Process buffered actions as soon as cooldown clears
    if (this.actionBuffer) {
      this.actionBuffer.ttl -= dt;
      if (this.actionBuffer.ttl <= 0) {
        this.actionBuffer = null;
      } else if (this.actionBuffer.type === 'attack' && p.atkCd <= 0) {
        const aim = this.actionBuffer.aim;
        this.actionBuffer = null;
        this.performMeleeAttack(aim);
      } else if (this.actionBuffer.type === 'spell' && p.magCd <= 0) {
        const aim = this.actionBuffer.aim;
        this.actionBuffer = null;
        this.performSpell(aim);
      } else if (this.actionBuffer.type === 'dash' && p.dashCd <= 0) {
        this.actionBuffer = null;
        this.performDash();
      }
    }

    if (p.mp < p.maxMp) {
      const prevMpInt = Math.floor(p.mp);
      const mpRegen = 3.8 * (1 + p.skills.spellMastery * 0.12);
      p.mp = Math.min(p.maxMp, p.mp + mpRegen * dt);
      if (Math.floor(p.mp) !== prevMpInt) {
        this.emitPlayerBars(false);
      }
    }

    let mx = 0,
      mz = 0;
    if (!this.isDialogueOpen && !this.isHeroModalOpen && !this.isForgeOpen && !this.isBankOpen) {
      if (this.keys['w'] || this.keys['arrowup']) mz -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) mz += 1;
      if (this.keys['a'] || this.keys['arrowleft']) mx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) mx += 1;
      if (this.joyVec.lengthSq() > 0.02) {
        mx += this.joyVec.x;
        mz += this.joyVec.y;
      }
    }

    const manualLen = Math.hypot(mx, mz);
    let moving = false;
    if (manualLen > 0.05) {
      this.hero.clearMoveTarget();
      this.hero.clearAutoAttackTarget();
      this.setCombatTarget(null);
      this.tapMarkerMesh.visible = false;

      // Dirección relativa al yaw actual de la cámara 3D (estilo Flyff Universe)
      this.camera.getWorldDirection(_camForward);
      _camForward.y = 0;
      if (_camForward.lengthSq() > 0.0001) _camForward.normalize();
      else _camForward.set(0, 0, -1);
      _camRight.set(-_camForward.z, 0, _camForward.x);

      const inputForward = -mz;
      const inputRight = mx;
      const worldMx = _camRight.x * inputRight + _camForward.x * inputForward;
      const worldMz = _camRight.z * inputRight + _camForward.z * inputForward;
      const wLen = Math.hypot(worldMx, worldMz) || 1;
      mx = worldMx / wLen;
      mz = worldMz / wLen;

      p.facing.set(mx, mz).normalize();
      this.updateDirFromFacing();
      moving = true;
    } else if (!this.isDialogueOpen && !this.isHeroModalOpen && !this.isForgeOpen && !this.isBankOpen) {
      // Bucle de Auto-Ataque estilo Flyff Universe
      const autoTarget = this.hero.autoAttackTarget as EnemyEntity | null;
      if (autoTarget) {
        const dx = autoTarget.pos.x - p.pos.x;
        const dz = autoTarget.pos.z - p.pos.z;
        const distToEnemy = Math.hypot(dx, dz);
        if (autoTarget.dead || distToEnemy > 28) {
          this.hero.clearAutoAttackTarget();
          this.hero.clearMoveTarget();
          this.setCombatTarget(null);
          this.tapMarkerMesh.visible = false;
        } else {
          this.setCombatTarget(autoTarget);
          const attackRange = Math.max(2.5, p.meleeReach + autoTarget.radius);
          if (distToEnemy > attackRange) {
            this.hero.moveTo(autoTarget.pos);
          } else {
            this.hero.clearMoveTarget();
            this.tapMarkerMesh.visible = false;
            if (distToEnemy > 0.01) {
              p.facing.set(dx / distToEnemy, dz / distToEnemy);
              this.updateDirFromFacing();
            }
            if (this.autoAttackCd <= 0 && p.atkCd <= 0) {
              this.autoAttackCd = Math.max(0.28, 0.78 / (1 + p.atkSpeedPct * 0.01));
              this.performMeleeAttack(p.facing);
            }
          }
        }
      }

      if (this.hero.hasMoveTarget()) {
        const step = this.hero.computeMoveStep(p.pos, 0.1);
        if (step.arrived) {
          this.tapMarkerMesh.visible = false;
          this.tapStuckTimer = 0;
          this.tapLastDistSq = Infinity;
        } else if (this.hero.hasMoveTarget()) {
          mx = step.dx;
          mz = step.dz;
          p.facing.set(mx, mz).normalize();
          this.updateDirFromFacing();
          moving = true;
        }
      }
    }

    let speed = p.baseMoveSpeed;
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      speed = 17.5 + p.skills.agility * 0.6;
      mx = p.facing.x;
      mz = p.facing.y;
      moving = true;
      this.spawnParticle(p.pos.x, p.pos.y + 0.55, p.pos.z, 0, 0.45, 0, 0x60a5fa, 0.28, 0, 0.9);
    }

    if (moving) {
      const prevX = p.pos.x;
      const prevZ = p.pos.z;
      this.tryMoveEntity(p.pos, mx * speed * dt, mz * speed * dt, 0.48);

      // Cancelar destino tap-to-move si el héroe queda bloqueado contra agua o una roca
      const moveTarget = this.hero.getMoveTarget();
      if (moveTarget && manualLen <= 0.05 && p.dashTimer <= 0) {
        const movedSq = (p.pos.x - prevX) ** 2 + (p.pos.z - prevZ) ** 2;
        const curDistSq = (moveTarget.x - p.pos.x) ** 2 + (moveTarget.z - p.pos.z) ** 2;
        if (movedSq < 0.00015 || curDistSq >= this.tapLastDistSq - 0.0001) {
          this.tapStuckTimer += dt;
          if (this.tapStuckTimer > 0.35) {
            this.hero.clearMoveTarget();
            this.hero.clearAutoAttackTarget();
            this.setCombatTarget(null);
            this.tapMarkerMesh.visible = false;
            this.tapStuckTimer = 0;
            moving = false;
          }
        } else {
          this.tapStuckTimer = 0;
        }
        this.tapLastDistSq = curDistSq;
      }

      p.walkPhase += dt * 10;
      p.stepTimer -= dt;
      if (p.stepTimer <= 0 && p.dashTimer <= 0) {
        p.stepTimer = 0.28;
        this.audio.footstep();
      }

      // Ondas de agua en orillas poco profundas al caminar cerca del nivel del agua (-0.34)
      this.waterRippleTimer -= dt;
      if (p.pos.y <= -0.10 && this.waterRippleTimer <= 0 && getBiomeId(p.pos.x, p.pos.z, this.worldSeed) !== 2) {
        this.waterRippleTimer = 0.18;
        for (let k = 0; k < 4; k++) {
          const ang = (k / 4) * Math.PI * 2 + this.elapsed * 1.3;
          this.spawnParticle(
            p.pos.x + Math.cos(ang) * 0.22,
            -0.29,
            p.pos.z + Math.sin(ang) * 0.22,
            Math.cos(ang) * 1.15,
            0.08,
            Math.sin(ang) * 1.15,
            0xe0f8ff,
            1.0,
            0,
            1.35
          );
        }
      }
    } else {
      p.walkPhase = 0;
    }

    if (this.tapMarkerMesh.visible) {
      const mt = this.hero.getMoveTarget();
      if (!mt) {
        this.tapMarkerMesh.visible = false;
      } else {
        this.tapMarkerMesh.position.set(mt.x, mt.y + 0.08, mt.z);
        const pulse = 0.92 + Math.sin(this.elapsed * 9) * 0.14;
        this.tapMarkerMesh.scale.setScalar(pulse);
      }
    }

    // Sincronizar Héroe Vagabundo procedural y su placa de nombre
    this.hero.setWorldPosition(p.pos.x, p.pos.y, p.pos.z);
    this.hero.setFacing(p.facing.x, p.facing.y);
    this.hero.setHealthRatio(p.hp / Math.max(1, p.maxHp));
    if (p.atkAnim <= 0 && p.castAnim <= 0 && p.invuln <= 0.3) {
      this.hero.setState(moving ? 'walk' : 'idle');
    }
    this.hero.update(dt);

    if (this.slashMat.opacity > 0) {
      const progress = p.atkAnimDur > 0 ? clamp(1 - p.atkAnim / p.atkAnimDur, 0, 1) : 1;
      const isArmed = p.equipped.weapon !== null;
      const offsetDist = isArmed ? 1.05 : 0.78;
      this.slashMesh.position.set(
        p.pos.x + Math.cos(p.slashBaseAng) * offsetDist,
        p.pos.y + 0.9,
        p.pos.z + Math.sin(p.slashBaseAng) * offsetDist
      );
      this.slashMesh.rotation.z = -p.slashBaseAng + (0.5 - progress * 1.0) * p.slashDirSign;
      this.slashMat.opacity = Math.max(0, this.slashMat.opacity - dt * 5.2);
    }
    this.grassUniforms.uPlayerPos.value.copy(p.pos);
  }

  private updateEnemies(dt: number): void {
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    const nightFactor = this.dayNightCycle.getNightFactor();

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.nocturnalOnly && nightFactor < 0.32) {
        if (e.actor.group.visible) e.actor.group.visible = false;
        if (e.telegraphMesh.visible) e.telegraphMesh.visible = false;
        e.windup = 0;
        if (this.hero.autoAttackTarget === e) this.hero.clearAutoAttackTarget();
        if (this.targetEnemy === e) this.setCombatTarget(null);
        continue;
      }
      if (e.dead) {
        if (e.respawnable) {
          e.respawnTimer -= dt;
          if (e.respawnTimer <= 0) {
            const zone = getSpawnZoneById(e.zoneId);
            if (zone && !e.isBoss) {
              const pt = pickZoneSpawnPoint(zone, this.worldSeed, Math.random, {
                x: px,
                z: pz,
                minDist: 5,
              });
              if (!pt) {
                e.respawnTimer = 2.0;
                continue;
              }
              const ny = getTerrainHeight(pt.x, pt.z, this.worldSeed);
              e.home.set(pt.x, ny, pt.z);
              e.pos.copy(e.home);
              if (e.bestiaryId) {
                const entry = BESTIARY[e.bestiaryId];
                const variant = pickZoneVariantForDistance(entry, zone, pt.x, pt.z);
                const bonusLvl = this.biomeLevelBonus[zone.biome];
                e.level = Math.min(20, variant.level + bonusLvl);
                const bonusScale = bonusLvl > 0 ? 1 + bonusLvl * 0.12 : 1;
                e.maxHp = Math.round(variant.hp * bonusScale);
                e.hp = e.maxHp;
                e.dmg = Math.round(variant.damage * bonusScale);
                e.spd = variant.speed;
                e.xp = variant.xp;
                if (e.variantIndex !== variant.variantIndex) {
                  e.variantIndex = variant.variantIndex;
                  e.actor.group.remove(e.telegraphMesh);
                  this.scene.remove(e.actor.group);
                  e.actor.dispose();
                  const nextActor = new ProceduralEnemyActor(entry.visualKind, {
                    primaryColorHex: hexStringToNumber(variant.color),
                    scaleMult: variant.scaleMult,
                    variantIndex: variant.variantIndex,
                  });
                  if (nextActor.archetype === 'golem') {
                    nextActor.onHeavyStep = () => {
                      if (Math.hypot(this.player.pos.x - nextActor.group.position.x, this.player.pos.z - nextActor.group.position.z) < 14) {
                        this.screenShake = Math.max(this.screenShake, 0.06);
                      }
                    };
                  }
                  nextActor.group.add(e.telegraphMesh);
                  nextActor.group.userData.enemyEntity = e;
                  this.scene.add(nextActor.group);
                  e.actor = nextActor;
                }
              } else {
                const { entry, variant } = pickBestiaryMobForPosition(zone, pt.x, pt.z, Math.random);
                e.level = Math.min(20, variant.level + this.biomeLevelBonus[zone.biome]);
                e.name = entry.name;
                e.maxHp = variant.hp;
                e.hp = variant.hp;
                e.dmg = variant.damage;
                e.spd = variant.speed;
                e.xp = variant.xp;
              }
            } else {
              e.pos.copy(e.home);
              if (e.isBoss) {
                this.escalateBiomeZone(e.biome, e);
              } else {
                e.hp = e.maxHp;
              }
            }

            e.dead = false;
            e.provoked = false;
            e.windup = 0;
            e.atkCd = 0.55;
            e.atkAnim = 0;
            e.flash = 0;
            e.squash = 0;
            e.slowTimer = 0;
            e.actor.setHealthRatio(1);
            e.actor.setTelegraph(false);
            e.telegraphMesh.visible = false;
            e.actor.playAnimation('idle');
            e.actor.setWorldPosition(e.pos.x, e.pos.y, e.pos.z);
            e.actor.setZoomOutline(this.viewSize);
            e.actor.group.visible = true;
            this.nameplateSystem.syncEntityHp(e.id, e.hp, e.maxHp, false);
          }
        }
        continue;
      }

      if (e.atkCd > 0) e.atkCd -= dt;
      if (e.atkAnim > 0) e.atkAnim -= dt;
      if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);
      e.squash = lerp(e.squash, 0, 1 - Math.exp(-14 * dt));

      const dx = px - e.pos.x;
      const dz = pz - e.pos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq > 2704) {
        e.windup = 0;
        e.provoked = false;
        if (e.actor.group.visible) e.actor.group.visible = false;
        if (e.telegraphMesh.visible) e.telegraphMesh.visible = false;
        e.actor.setTelegraph(false);
        continue;
      }
      const dist = Math.sqrt(distSq);
      if (!e.actor.group.visible) e.actor.group.visible = true;

      const bossEnraged = e.isBoss && e.hp <= e.maxHp * 0.5;
      if (e.flash > 0) {
        e.flash -= dt;
        if (e.telegraphMesh.visible) e.telegraphMesh.visible = false;
        e.actor.setTelegraph(false);
      } else if (e.windup > 0) {
        if (!e.telegraphMesh.visible) e.telegraphMesh.visible = true;
        const prog = 1 - clamp(e.windup / Math.max(0.01, e.windupDuration), 0, 1);
        e.actor.setTelegraph(true, prog);
      } else {
        if (e.telegraphMesh.visible) e.telegraphMesh.visible = false;
        e.actor.setTelegraph(false);
      }

      e.actor.setLightAndTint(_biomeLightDir, _biomeAmbientTint);
      e.actor.setHealthRatio(e.hp / Math.max(1, e.maxHp));
      e.actor.setSlowed(e.slowTimer > 0);
      e.actor.setEnraged(bossEnraged);

      const isNocturnal = e.type === 'bat' || e.type === 'wolf' || e.type === 'gray_wolf';
      const nightSpdMult = isNocturnal ? 1 + nightFactor * 0.14 : 1;
      const distHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
      if (e.provoked && (distHome > 15 || dist > 20)) {
        e.provoked = false;
      }
      const zoneDef = getSpawnZoneById(e.zoneId);
      const effectiveAggro = zoneDef ? zoneDef.aggroRange : e.level <= 20 ? Math.min(8, e.aggro) : e.aggro;
      const shouldChase = Boolean(e.provoked) || dist < effectiveAggro;
      const slowFactor = e.slowTimer > 0 ? 0.55 : 1.0;
      const moveSpd = (bossEnraged ? e.spd * 1.2 : e.spd) * slowFactor * nightSpdMult;
      let isMoving = false;
      if (shouldChase) {
        e.actor.setFacing(dx, dz);

        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0) {
            e.atkAnim = 0.26;
            e.squash = 0.24;
            e.actor.triggerAttack();
            if (e.type === 'mage') {
              const vx = (dx / (dist || 1)) * 10.2;
              const vz = (dz / (dist || 1)) * 10.2;
              this.spawnProjectile(e.pos.x, e.pos.y, e.pos.z, vx, vz, false, e.dmg, 0xc084fc, 0.44, false, 0, 1, true, e.level);
              e.atkCd = 1.85;
            } else if (e.isBoss) {
              if (dist < e.range + 0.85) this.damagePlayer(e.dmg, e.isElemental, e.level);
              const projColor =
                e.type === 'boss_meadow'
                  ? 0xa3e635
                  : e.type === 'boss_forest'
                    ? 0x34d399
                    : e.type === 'boss_rocky'
                      ? 0xd6d3d1
                      : e.type === 'boss_snow'
                        ? 0x38bdf8
                        : 0xf97316;
              const baseCount = e.type === 'boss' ? 8 : e.type === 'boss_snow' ? 6 : 5;
              const projCount = bossEnraged ? baseCount + 4 : baseCount;
              const projSpeed = e.type === 'boss' ? (bossEnraged ? 10.6 : 9.0) : 7.8;
              const projDmg = Math.round(e.dmg * (bossEnraged ? 0.78 : 0.65));
              for (let k = 0; k < projCount; k++) {
                const a = (k / projCount) * Math.PI * 2 + this.elapsed;
                this.spawnProjectile(
                  e.pos.x,
                  e.pos.y,
                  e.pos.z,
                  Math.cos(a) * projSpeed,
                  Math.sin(a) * projSpeed,
                  false,
                  projDmg,
                  projColor,
                  0.46,
                  false,
                  0,
                  1,
                  true,
                  e.level
                );
              }
              this.spawnBurst(e.pos.x, e.pos.y + 0.6, e.pos.z, bossEnraged ? 24 : 16, projColor, 5.2, 0.55);
              e.atkCd = bossEnraged ? 1.6 : 2.1;
            } else {
              if (dist < e.range + 0.95) this.damagePlayer(e.dmg, e.isElemental, e.level);
              e.atkCd =
                e.type === 'rat' ||
                e.type === 'rabbit' ||
                e.type === 'bat' ||
                e.type === 'wolf' ||
                e.type === 'gray_wolf' ||
                e.type === 'goblin'
                  ? 0.85
                  : 1.0;
            }
          }
        } else if (dist <= e.range && e.atkCd <= 0) {
          e.windup = e.windupDuration;
        } else if (dist > e.range * 0.85) {
          isMoving = true;
          const nx = dx / (dist || 1);
          const nz = dz / (dist || 1);
          this.tryMoveEntity(e.pos, nx * moveSpd * dt, nz * moveSpd * dt, e.radius);
        }
      } else {
        e.provoked = false;
        e.windup = 0;
        const hdx = e.home.x - e.pos.x;
        const hdz = e.home.z - e.pos.z;
        const hd = Math.hypot(hdx, hdz);
        if (hd > 1.5) {
          isMoving = true;
          e.actor.setFacing(hdx, hdz);
          this.tryMoveEntity(e.pos, (hdx / hd) * moveSpd * 0.5 * dt, (hdz / hd) * moveSpd * 0.5 * dt, e.radius);
        }
      }

      if (e.windup <= 0 && e.atkAnim <= 0) {
        e.actor.playAnimation(isMoving ? 'walk' : 'idle');
      }
      e.actor.setWorldPosition(e.pos.x, e.pos.y, e.pos.z);
      e.actor.update(dt);
    }
  }

  private updateProjectilesAndPickups(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.pos.x += pr.vx * dt;
      pr.pos.z += pr.vz * dt;
      pr.pos.y = getTerrainHeight(pr.pos.x, pr.pos.z, this.worldSeed) + 0.85;

      if (pr.lightSlot) pr.lightSlot.light.position.copy(pr.pos);
      this.spawnParticle(
        pr.pos.x,
        pr.pos.y,
        pr.pos.z,
        (Math.random() - 0.5) * 1.2,
        0.5,
        (Math.random() - 0.5) * 1.2,
        pr.color,
        0.25,
        0
      );

      let hit = pr.life <= 0;
      if (!hit) {
        if (pr.fromPlayer) {
          for (let j = 0; j < this.enemies.length; j++) {
            const e = this.enemies[j];
            if (e.dead || pr.hitSet?.has(e)) continue;
            if (Math.hypot(e.pos.x - pr.pos.x, e.pos.z - pr.pos.z) < e.radius + pr.radius) {
              pr.hitSet?.add(e);
              pr.pierceLeft--;
              if (pr.aoe) {
                this.audio.explosion();
                this.hitstopTimer = 0.045;
                this.screenShake = Math.max(this.screenShake, 0.18);
                this.spawnBurst(pr.pos.x, pr.pos.y, pr.pos.z, 24, pr.color, 5.6, 0.5);
                for (let k = 0; k < this.enemies.length; k++) {
                  const e2 = this.enemies[k];
                  if (!e2.dead && Math.hypot(e2.pos.x - pr.pos.x, e2.pos.z - pr.pos.z) < pr.aoeRadius + e2.radius) {
                    const hitRes = ProgressionSystem.computePlayerDamage({
                      playerLevel: this.player.level,
                      monsterLevel: e2.level,
                      baseAttack: pr.dmg,
                      equipmentBonus: this.player.equipmentBonus * 0.5,
                    });
                    if (hitRes.missed) {
                      this.markInCombat();
                      e2.provoked = true;
                      this.setCombatTarget(e2);
                      this.spawnFloatText(e2.pos, 'Miss', '#9ca3af', 15, false, false, 0.55);
                    } else {
                      this.damageEnemy(e2, hitRes.damage, 0, 0);
                    }
                  }
                }
              } else {
                this.spawnBurst(e.pos.x, e.pos.y + 0.9, e.pos.z, 14, pr.color, 4.8, 0.45);
                const hitRes = ProgressionSystem.computePlayerDamage({
                  playerLevel: this.player.level,
                  monsterLevel: e.level,
                  baseAttack: pr.dmg,
                  equipmentBonus: this.player.equipmentBonus * 0.5,
                });
                if (hitRes.missed) {
                  this.markInCombat();
                  e.provoked = true;
                  this.setCombatTarget(e);
                  this.spawnFloatText(e.pos, 'Miss', '#9ca3af', 15, false, false, 0.55);
                } else {
                  this.damageEnemy(e, hitRes.damage, 0, 0);
                }
              }
              if (pr.pierceLeft <= 0) {
                hit = true;
                break;
              }
            }
          }
        } else {
          if (Math.hypot(this.player.pos.x - pr.pos.x, this.player.pos.z - pr.pos.z) < 0.6 + pr.radius) {
            hit = true;
            this.damagePlayer(pr.dmg, pr.isElemental, pr.attackerLevel);
          }
        }
      }

      if (hit) {
        pr.mesh.visible = false;
        this.scene.remove(pr.mesh);
        this.projMeshPool.push(pr.mesh);
        if (pr.lightSlot) {
          pr.lightSlot.light.intensity = 0;
          pr.lightSlot.active = false;
        }
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.itemActor.setLightAndTint(_biomeLightDir, _biomeAmbientTint);
      pk.itemActor.update(dt);

      let returnToPool = false;
      if (pk.collected) {
        if (pk.itemActor.isPickupFinished()) {
          returnToPool = true;
        }
      } else {
        if (pk.type !== 'gold' && Number.isFinite(pk.life)) {
          pk.life -= dt;
        }
        pk.pickupDelay = Math.max(0, pk.pickupDelay - dt);
        if (pk.type === 'gold') {
          // Monedas de oro: recogida automática dentro de 2 unidades (sin despawn)
          const d = Math.hypot(this.player.pos.x - pk.pos.x, this.player.pos.z - pk.pos.z);
          if (d < 2.0 && pk.pickupDelay <= 0) {
            this.tryCollectPickup(pk);
          }
        } else if (pk.life <= 0) {
          returnToPool = true;
        }
      }

      if (returnToPool) {
        pk.itemActor.group.visible = false;
        this.scene.remove(pk.itemActor.group);
        let pool = this.itemPoolByArch.get(pk.archetype);
        if (!pool) {
          pool = [];
          this.itemPoolByArch.set(pk.archetype, pool);
        }
        pool.push(pk.itemActor);
        this.pickups.splice(i, 1);
      }
    }
  }

  private updateFloatItems(dt: number): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.floatTextSystem.update(dt, this.camera, w, h);
  }

  private buildInventorySnapshot(): InventoryItem[] {
    const items: InventoryItem[] = [];

    for (const gid of this.player.ownedGear) {
      const def = getGearDef(gid);
      if (!def) continue;
      const tier = this.player.gearUpgrades[gid] ?? 0;
      const qty = this.player.ownedGearQty[gid] ?? 1;
      const isEquipped =
        this.player.equipped[def.slot] === def.id ||
        (def.slot === 'weapon' && this.player.equipped.offhand === def.id);
      items.push({
        id: def.id,
        name: tier > 0 ? `${def.name} +${tier}` : def.name,
        category: 'gear',
        slot: def.slot,
        qty,
        rarity: def.rarity,
        upgradeLevel: tier,
        desc: `${formatGearStats(def, tier)} · ${def.desc}`,
        equipped: isEquipped,
      });
    }

    items.push(
      {
        id: 'potion',
        name: 'Poción de Vida',
        category: 'consumable',
        qty: this.player.potions,
        desc: `Restaura ${55 + this.player.skills.vitality * 5}% de Vida máxima.`,
      },
      {
        id: 'elixir',
        name: 'Elixir de Maná',
        category: 'consumable',
        qty: this.player.elixirs,
        desc: 'Restaura 60% del Maná máximo.',
      }
    );

    if (this.player.hasCrystal) {
      items.push({
        id: 'crystal',
        name: 'Cristal Carmesí',
        category: 'relic',
        qty: 1,
        rarity: 'mitico',
        desc: 'Reliquia sagrada recuperada de las Tierras Volcánicas.',
      });
    }

    for (const matId of Object.keys(this.player.materials) as MaterialId[]) {
      const qty = this.player.materials[matId] ?? 0;
      if (qty <= 0) continue;
      const meta = MATERIAL_META[matId];
      items.push({
        id: meta.id,
        name: meta.name,
        category: 'material',
        qty,
        rarity: meta.rarity,
        desc: meta.desc,
      });
    }

    return items;
  }

  private emitHud(force = false): void {
    const biome: BiomeId = getBiomeId(this.player.pos.x, this.player.pos.z, this.worldSeed);
    const biomeName = BIOME_NAMES[biome];
    const timeSnap = this.dayNightCycle.getSnapshot();
    const timeLabel = timeSnap.phaseLabel;

    let questTitle = 'Aldea del Alba';
    let questDesc = 'Habla con Kael, Aldric, Lyra o Theron (F).';
    const mStage = this.quests.mage;
    const wStage = this.quests.warrior;
    if (wStage === 1) {
      questTitle = 'Entrenamiento I (Guerrero)';
      questDesc =
        this.player.kills >= 3
          ? '¡Listo! Vuelve con Maestro Guerrero Kael por tu equipo.'
          : `Derrota enemigos en la Pradera (${this.player.kills}/3).`;
    } else if (wStage === 2) {
      const bossDone = this.defeatedBossKinds.has('boss_meadow');
      questTitle = 'Entrenamiento II (Guerrero)';
      questDesc =
        this.player.kills >= 8 || bossDone
          ? '¡Listo! Vuelve con Maestro Guerrero Kael por casco y coraza.'
          : `Derrota 8 enemigos (${this.player.kills}/8) o al Rey Slime Dorado.`;
    } else if (this.quests.q1 === 1) {
      questTitle = 'La Plaga Verde';
      questDesc =
        this.player.slimeKills >= 5
          ? '¡Listo! Vuelve con el Anciano Aldric en la aldea.'
          : `Derrota Slimes al este de la aldea (${this.player.slimeKills}/5).`;
    } else if (mStage === 1 || mStage === 3 || mStage === 5) {
      if (mStage === 1) {
        const have = this.player.materials.slime_gel ?? 0;
        questTitle = 'Chispa Arcana (Mago)';
        questDesc = have >= 2 ? '¡Listo! Vuelve con el Mago Theron (Pulso Arcano).' : `Reúne Esencias de Slime (${have}/2).`;
      } else if (mStage === 3) {
        const have = this.player.materials.ancestral_wood ?? 0;
        questTitle = 'Ecos del Bosque (Mago)';
        questDesc = have >= 2 ? '¡Listo! Vuelve con el Mago Theron (Nova Glacial).' : `Reúne Madera Ancestral (${have}/2).`;
      } else {
        const have = this.player.materials.ice_shard ?? 0;
        questTitle = 'Estrella de Escarcha (Mago)';
        questDesc = have >= 2 ? '¡Listo! Vuelve con el Mago Theron (Lanza Astral).' : `Reúne Esquirlas de Hielo (${have}/2).`;
      }
    } else if (this.quests.q2 === 1) {
      questTitle = 'Acero en la Penumbra';
      questDesc =
        this.player.forestKills >= 4
          ? '¡Listo! Regresa con la Herrera Lyra.'
          : `Derrota enemigos en el Bosque Ancestral (${this.player.forestKills}/4).`;
    } else if (this.quests.q3 === 1) {
      questTitle = 'Los Cinco Biomas';
      if (this.player.hasCrystal && this.player.defeatedBiomeBosses >= 5) {
        questDesc = '¡Desafío completado! Regresa con el Mago Theron.';
      } else {
        questDesc = `Derrota a los 5 jefes de bioma (${this.player.defeatedBiomeBosses}/5) y recoge el Cristal.`;
      }
    } else if (this.quests.q3 === 2) {
      questTitle = 'Leyenda de Eldoria';
      questDesc = '¡Todas las misiones completadas! Los jefes renacen más fuertes.';
    }

    const inter =
      this.phase === 'playing' && !this.isDialogueOpen && !this.isForgeOpen && !this.isBankOpen
        ? this.getNearestInteractable()
        : null;

    let activeBoss: EnemyEntity | null = null;
    let activeBossDist = 26;
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (b.dead) continue;
      const d = Math.hypot(this.player.pos.x - b.pos.x, this.player.pos.z - b.pos.z);
      if (d < activeBossDist) {
        activeBossDist = d;
        activeBoss = b;
      }
    }

    const promptStr = inter ? inter.label : null;
    const hpDisp = Math.ceil(this.player.hp);
    const mpDisp = Math.floor(this.player.mp);
    const bossHp = activeBoss ? activeBoss.hp : 0;
    const sk = this.player.skills;
    const skSig = `${sk.sword},${sk.atkSpeed},${sk.crit},${sk.vitality},${sk.elemResist},${sk.agility},${sk.magic},${sk.spellMastery}`;
    const matSig = Object.values(this.player.materials).join(',');
    const eqSig = GEAR_SLOT_ORDER.map((s) => this.player.equipped[s] ?? '').join(',');
    const upgSig = Object.values(this.player.gearUpgrades).join(',');
    const qtySig = Object.values(this.player.ownedGearQty).join(',');

    const targetSnap =
      this.targetEnemy && !this.targetEnemy.dead
        ? {
            name: this.targetEnemy.name,
            level: this.targetEnemy.level,
            hp: Math.max(0, this.targetEnemy.hp),
            maxHp: this.targetEnemy.maxHp,
            isBoss: this.targetEnemy.isBoss,
            threat: ProgressionSystem.getThreatTier(this.player.level, this.targetEnemy.level),
            statusLabel: ProgressionSystem.getStatusLabel(
              this.player.level,
              this.targetEnemy.level,
              this.player.equipmentBonus
            ),
          }
        : null;

    const slotsSig = this.player.inventorySlots.map((s) => (s ? `${s.id}:${s.qty}` : '_')).join(',');
    const bankSig = this.player.bankSlots.map((s) => (s ? `${s.id}:${s.qty}` : '_')).join(',');
    const cdSig = `${Math.ceil(this.player.atkCd * 10)},${Math.ceil(this.player.magCd * 10)},${Math.ceil(this.player.dashCd * 10)},${Math.ceil(this.potionHpCd * 10)},${Math.ceil(this.potionMpCd * 10)}`;
    const sig = `${this.player.heroName}|${hpDisp}|${this.player.maxHp}|${mpDisp}|${this.player.maxMp}|${this.player.xp}|${this.player.level}|${this.player.potions}|${this.player.elixirs}|${this.player.atkDmg}|${this.player.magDmg}|${this.player.def}|${this.player.baseMoveSpeed}|${this.player.atkSpeedPct}|${this.player.critChancePct}|${this.player.elemResistPct}|${this.player.learnedSpells.join(',')}|${this.player.activeSpell ?? ''}|${eqSig}|${this.player.ownedGear.length}|${qtySig}|${upgSig}|${slotsSig}|${bankSig}|${cdSig}|${this.player.skillPoints}|${skSig}|${matSig}|${this.player.defeatedBiomeBosses}|${this.player.hasCrystal ? 1 : 0}|${this.player.kills}|${biome}|${timeLabel}|${promptStr ?? ''}|${activeBoss ? `${activeBoss.name}:${activeBoss.level}` : ''}|${bossHp}|${targetSnap ? `${targetSnap.name}:${targetSnap.hp}:${targetSnap.threat}` : ''}|${questTitle}|${questDesc}|${this.audio.enabled ? 1 : 0}|${this.isInCombat ? 1 : 0}`;
    if (!force && sig === this.lastHudSig) return;
    this.lastHudSig = sig;
    this.emitPlayerBars(false);

    const equippedNames = {} as Record<GearSlot, string | null>;
    for (const sl of GEAR_SLOT_ORDER) {
      const id = this.player.equipped[sl];
      if (!id) {
        equippedNames[sl] = null;
      } else {
        const def = getGearDef(id);
        const tier = this.player.gearUpgrades[id] ?? 0;
        equippedNames[sl] = def ? (tier > 0 ? `${def.name} +${tier}` : def.name) : null;
      }
    }

    const heavySig = `${eqSig}|${this.player.ownedGear.length}|${qtySig}|${upgSig}|${slotsSig}|${bankSig}|${matSig}|${this.player.hasCrystal ? 1 : 0}|${this.player.skills.vitality}`;
    if (force || heavySig !== this.lastHeavyHudSig || this.cachedInventorySlots.length === 0) {
      this.lastHeavyHudSig = heavySig;
      this.cachedForgeItems = this.buildForgeSnapshot();
      this.cachedInventory = this.buildInventorySnapshot();
      this.cachedInventorySlots = this.buildInventorySlotsView();
      this.cachedBankSlots = this.buildBankSlotsView();
    }

    const nearestTown = getNearestTownInfo(this.player.pos.x, this.player.pos.z, this.towns);

    this.callbacks.onHudUpdate({
      heroName: this.player.heroName,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      mp: this.player.mp,
      maxMp: this.player.maxMp,
      xp: this.player.xp,
      xpNext: this.player.xpNext,
      level: this.player.level,
      potions: this.player.potions,
      elixirs: this.player.elixirs,
      atkDmg: this.player.atkDmg,
      magDmg: this.player.magDmg,
      def: this.player.def,
      moveSpeed: Number(this.player.baseMoveSpeed.toFixed(1)),
      atkSpeedPct: this.player.atkSpeedPct,
      critChancePct: this.player.critChancePct,
      elemResistPct: this.player.elemResistPct,
      equipped: { ...this.player.equipped },
      equippedNames,
      ownedGearQty: { ...this.player.ownedGearQty },
      learnedSpells: [...this.player.learnedSpells],
      activeSpell: this.player.activeSpell,
      skillPoints: this.player.skillPoints,
      skills: { ...this.player.skills },
      materials: { ...this.player.materials },
      forgeItems: this.cachedForgeItems,
      inventory: this.cachedInventory,
      inventorySlots: this.cachedInventorySlots,
      inventoryCapacity: INVENTORY_CAPACITY,
      bankSlots: this.cachedBankSlots,
      inCombat: this.isInCombat,
      towns: this.towns,
      nearestTown,
      playerPos: { x: this.player.pos.x, z: this.player.pos.z },
      worldSeed: this.worldSeed,
      cooldowns: {
        atk: Math.max(0, Number(this.player.atkCd.toFixed(1))),
        spell: Math.max(0, Number(this.player.magCd.toFixed(1))),
        dash: Math.max(0, Number(this.player.dashCd.toFixed(1))),
        potionHp: Math.max(0, Number(this.potionHpCd.toFixed(1))),
        potionMp: Math.max(0, Number(this.potionMpCd.toFixed(1))),
      },
      kills: this.player.kills,
      slimeKills: this.player.slimeKills,
      forestKills: this.player.forestKills,
      defeatedBiomeBosses: this.player.defeatedBiomeBosses,
      hasCrystal: this.player.hasCrystal,
      quests: { ...this.quests },
      biomeName,
      timeLabel,
      interactPrompt: promptStr,
      bossBar: {
        visible: !!activeBoss,
        name: activeBoss ? `${activeBoss.name} · Nv.${activeBoss.level}` : '',
        hp: bossHp,
        maxHp: activeBoss ? activeBoss.maxHp : 1,
      },
      targetEnemy: targetSnap,
      questTitle,
      questDesc,
      audioEnabled: this.audio.enabled,
    });
  }

  private tryCollectPickup(pk: PickupEntity): boolean {
    if (pk.collected) return false;
    let collectedNow = false;
    const notifyFull = () => {
      if (this.fullInvToastCd <= 0) {
        this.fullInvToastCd = 2.2;
        this.callbacks.onToast('Inventario lleno');
      }
    };

    if (pk.type === 'gold') {
      const amt = pk.qty ?? (8 + Math.floor(Math.random() * 9));
      if (this.addCoinsToInventory(amt)) {
        this.spawnFloatText(this.player.pos, `+${amt} monedas`, '#fde047', 14, false, false, 0.8);
        collectedNow = true;
      } else {
        notifyFull();
      }
    } else if (pk.type === 'potion') {
      const qty = pk.qty ?? 1;
      if (this.addItemToSlots({ id: 'potion', category: 'consumable', qty }, true)) {
        this.spawnFloatText(this.player.pos, `+${qty} Poción`, '#fca5a5', 14);
        collectedNow = true;
      } else {
        notifyFull();
      }
    } else if (pk.type === 'elixir') {
      const qty = pk.qty ?? 1;
      if (this.addItemToSlots({ id: 'elixir', category: 'consumable', qty }, true)) {
        this.spawnFloatText(this.player.pos, `+${qty} Elixir`, '#7dd3fc', 14);
        collectedNow = true;
      } else {
        notifyFull();
      }
    } else if (pk.type === 'material' && pk.materialId) {
      const qty = pk.qty ?? 1;
      if (this.addItemToSlots({ id: pk.materialId, category: 'material', qty }, true)) {
        const meta = MATERIAL_META[pk.materialId];
        this.spawnFloatText(this.player.pos, `+${qty} ${meta.name}`, RARITY_COLOR[meta.rarity], 14);
        if (meta.rarity !== 'comun') {
          this.callbacks.onToast(`Material obtenido: ${meta.name} x${qty}`);
        }
        collectedNow = true;
      } else {
        notifyFull();
      }
    } else if (pk.type === 'weapon' && pk.gearId && WEAPON_MAP[pk.gearId]) {
      const w = WEAPON_MAP[pk.gearId];
      const isDagger = w.weaponKind === 'dagger';
      const curQty = this.player.ownedGearQty[w.id] ?? (this.player.ownedGear.includes(w.id) ? 1 : 0);
      const maxCopies = isDagger ? 2 : 1;
      if (curQty < maxCopies) {
        if (this.player.gearUpgrades[w.id] === undefined) {
          this.player.gearUpgrades[w.id] = 0;
        }
        const curMain = this.player.equipped.weapon ? WEAPON_MAP[this.player.equipped.weapon] : null;
        if (!curMain) {
          this.player.equipped.weapon = w.id;
          this.syncDerivedFromSlots();
          this.recalcPlayerStats(true);
          this.refreshHeroAppearance();
          this.callbacks.onToast(`¡Arma obtenida y equipada: ${w.name}!`);
          this.spawnFloatText(this.player.pos, w.name, RARITY_COLOR[w.rarity], 16);
          collectedNow = true;
        } else if (isDagger && curMain.weaponKind === 'dagger' && !this.player.equipped.offhand) {
          this.player.equipped.offhand = w.id;
          this.syncDerivedFromSlots();
          this.recalcPlayerStats(true);
          this.refreshHeroAppearance();
          this.callbacks.onToast(`¡2da ${w.name} equipada en Mano Sec.!`);
          this.spawnFloatText(this.player.pos, w.name, RARITY_COLOR[w.rarity], 16);
          collectedNow = true;
        } else if (this.addItemToSlots({ id: w.id, category: 'gear', qty: 1 }, false)) {
          if (w.atk > curMain.atk) {
            this.equipGear('weapon', w.id);
          } else {
            this.callbacks.onToast(`¡Arma obtenida: ${w.name}!`);
          }
          this.spawnFloatText(this.player.pos, w.name, RARITY_COLOR[w.rarity], 16);
          collectedNow = true;
        } else {
          notifyFull();
        }
      } else {
        const bonus = 180;
        if (this.addCoinsToInventory(bonus)) {
          this.spawnFloatText(this.player.pos, `+${bonus} Monedas`, '#fde047', 14);
          collectedNow = true;
        } else {
          notifyFull();
        }
      }
    } else if (pk.type === 'armor' && pk.gearId && ARMOR_PIECE_MAP[pk.gearId]) {
      const a = ARMOR_PIECE_MAP[pk.gearId];
      if (!this.player.ownedGear.includes(a.id)) {
        if (this.player.gearUpgrades[a.id] === undefined) {
          this.player.gearUpgrades[a.id] = 0;
        }
        const curId = this.player.equipped[a.slot];
        const cur = curId ? ARMOR_PIECE_MAP[curId] : null;
        if (!cur) {
          this.player.equipped[a.slot] = a.id;
          this.syncDerivedFromSlots();
          this.recalcPlayerStats(true);
          this.refreshHeroAppearance();
          this.callbacks.onToast(`¡Equipo obtenido y equipado: ${a.name}!`);
          this.spawnFloatText(this.player.pos, a.name, RARITY_COLOR[a.rarity], 15);
          collectedNow = true;
        } else if (this.addItemToSlots({ id: a.id, category: 'gear', qty: 1 }, false)) {
          if (a.def > cur.def) {
            this.equipGear(a.slot, a.id);
          } else {
            this.callbacks.onToast(`¡Equipo obtenido: ${a.name}!`);
          }
          this.spawnFloatText(this.player.pos, a.name, RARITY_COLOR[a.rarity], 15);
          collectedNow = true;
        } else {
          notifyFull();
        }
      } else {
        const bonus = 160;
        if (this.addCoinsToInventory(bonus)) {
          this.spawnFloatText(this.player.pos, `+${bonus} Monedas`, '#fde047', 14);
          collectedNow = true;
        } else {
          notifyFull();
        }
      }
    }

    if (collectedNow) {
      this.audio.pickup();
      this.emitInventoryUpdate();
      this.emitHud();
      pk.collected = true;
      pk.itemActor.startPickup();
    }
    return collectedNow;
  }

  private getPickupLabel(pk: PickupEntity): string {
    const qty = pk.qty ?? 1;
    const suffix = qty > 1 ? ` x${qty}` : '';
    if (pk.type === 'gold') return `${qty} monedas`;
    if (pk.type === 'potion') return `Poción de Vida${suffix}`;
    if (pk.type === 'elixir') return `Elixir de Maná${suffix}`;
    if (pk.type === 'material' && pk.materialId) {
      return `${MATERIAL_META[pk.materialId]?.name ?? pk.materialId}${suffix}`;
    }
    if ((pk.type === 'weapon' || pk.type === 'armor') && pk.gearId) {
      return `${getGearDef(pk.gearId)?.name ?? pk.gearId}${suffix}`;
    }
    return `Objeto${suffix}`;
  }

  private updateInteractionDetection(dt: number): void {
    if (this.phase !== 'playing' || this.isDialogueOpen || this.isHeroModalOpen || this.isForgeOpen || this.isBankOpen) {
      if (this.interactionSystem.getContextAction() !== null) {
        this.interactionSystem.reset();
        gameEventBus.emit('context:actionChanged', null);
      }
      return;
    }

    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    this.interactablesBuffer.length = 0;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || !e.actor.group.visible) continue;
      if (Math.abs(e.pos.x - px) > 7 || Math.abs(e.pos.z - pz) > 7) continue;
      this.interactablesBuffer.push({
        kind: 'enemy',
        id: e.id,
        label: e.name,
        x: e.pos.x,
        z: e.pos.z,
        radius: e.radius,
        range: Math.max(2.6, this.player.meleeReach),
        target: e,
      });
    }

    if (Math.abs(this.bankChestPos.x - px) <= 4.5 && Math.abs(this.bankChestPos.z - pz) <= 4.5) {
      this.interactablesBuffer.push({
        kind: 'chest',
        id: 'village_bank_chest',
        label: 'Abrir cofre',
        x: this.bankChestPos.x,
        z: this.bankChestPos.z,
        radius: 0.65,
        range: 2.45,
        target: null,
      });
    }

    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      if (Math.abs(n.pos.x - px) > 4.5 || Math.abs(n.pos.z - pz) > 4.5) continue;
      if (n.role === 'banker') {
        this.interactablesBuffer.push({
          kind: 'chest',
          id: 'banker_bran',
          label: 'Abrir cofre',
          x: n.pos.x,
          z: n.pos.z,
          radius: 0.4,
          range: 2.4,
          target: n,
        });
      } else {
        this.interactablesBuffer.push({
          kind: 'npc',
          id: n.id,
          label: n.name,
          x: n.pos.x,
          z: n.pos.z,
          radius: 0.4,
          range: 2.0,
          target: n,
        });
      }
    }

    if (!this.player.hasCrystal && Math.abs(this.crystalPos.x - px) <= 4 && Math.abs(this.crystalPos.z - pz) <= 4) {
      this.interactablesBuffer.push({
        kind: 'crystal',
        id: 'crimson_crystal',
        label: 'Cristal Carmesí',
        x: this.crystalPos.x,
        z: this.crystalPos.z,
        radius: 0.5,
        range: 2.2,
        target: null,
      });
    }

    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (pk.collected || pk.type === 'gold' || pk.pickupDelay > 0) continue;
      if (Math.abs(pk.pos.x - px) > 3 || Math.abs(pk.pos.z - pz) > 3) continue;
      this.interactablesBuffer.push({
        kind: 'pickup',
        id: pk.id,
        label: this.getPickupLabel(pk),
        x: pk.pos.x,
        z: pk.pos.z,
        radius: 0.25,
        range: 1.5,
        target: pk,
      });
    }

    const res = this.interactionSystem.updateDetection(this.player.pos, this.interactablesBuffer, dt);
    if (res.changed) {
      gameEventBus.emit('context:actionChanged', {
        type: res.action.type,
        targetId: res.action.targetId,
        label: res.action.label,
        distance: res.action.distance,
      });
    }
  }

  private pushNameplateTarget(
    cursor: number,
    id: string,
    name: string,
    level: number,
    hp: number,
    maxHp: number,
    x: number,
    y: number,
    z: number,
    isPlayer: boolean
  ): number {
    let item = this.nameplateTargets[cursor];
    if (!item) {
      item = { id, name, level, hp, maxHp, x, y, z, isPlayer };
      this.nameplateTargets.push(item);
    } else {
      item.id = id;
      item.name = name;
      item.level = level;
      item.hp = hp;
      item.maxHp = maxHp;
      item.x = x;
      item.y = y;
      item.z = z;
      item.isPlayer = isPlayer;
    }
    return cursor + 1;
  }

  private updateNameplates(): void {
    if (
      this.phase !== 'playing' ||
      this.isDialogueOpen ||
      this.isHeroModalOpen ||
      this.isForgeOpen ||
      this.isBankOpen ||
      this.isWorldMapOpen
    ) {
      this.nameplateSystem.hideAll();
      return;
    }

    let cursor = 0;
    cursor = this.pushNameplateTarget(
      cursor,
      '__player__',
      this.player.heroName,
      this.player.level,
      this.player.hp,
      this.player.maxHp,
      this.player.pos.x,
      this.player.pos.y,
      this.player.pos.z,
      true
    );

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || !e.actor.group.visible) continue;
      cursor = this.pushNameplateTarget(
        cursor,
        e.id,
        e.name,
        e.level,
        e.hp,
        e.maxHp,
        e.pos.x,
        e.pos.y,
        e.pos.z,
        false
      );
    }

    this.nameplateSystem.update(
      this.camera,
      this.container.clientWidth,
      this.container.clientHeight,
      this.nameplateTargets,
      cursor,
      this.player.pos.x,
      this.player.pos.z
    );
  }

  private startRenderLoop(): void {
    if (this.disposed || this.contextLost || this.loopActive || document.visibilityState === 'hidden') return;
    this.loopActive = true;
    this.tick();
  }

  private stopRenderLoop(): void {
    this.loopActive = false;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.frameId = 0;
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl?.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed || this.contextLost || !this.loopActive) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed || this.contextLost || !this.loopActive || document.visibilityState === 'hidden') {
      this.loopActive = false;
      return;
    }
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    // Adaptive Frame-Time Governor (smooth auto scaling on sustained FPS drops)
    if (!this.isSoftwareGl && this.phase === 'playing' && rawDt < 0.1) {
      this.avgFrameMs = this.avgFrameMs * 0.92 + rawDt * 1000 * 0.08;
      if (this.qualityMode === 'auto') {
        this.perfEvalTimer += dt;
        if (this.perfEvalTimer >= 1.8) {
          this.perfEvalTimer = 0;
          if (this.avgFrameMs > 23 && this.qualityTier < 2) {
            this.applyQualityTier((this.qualityTier + 1) as 0 | 1 | 2);
          } else if (this.avgFrameMs < 14 && this.qualityTier > 0) {
            this.applyQualityTier((this.qualityTier - 1) as 0 | 1 | 2);
          }
        }
      }
    }

    if (!this.contextLost) {
      this.elapsed += dt;

      // Iluminación ambiental y dirección solar unificada por bioma
      computeBiomeLightingAt(this.player.pos.x, this.player.pos.z, this.worldSeed, _biomeLightDir, _biomeAmbientTint);
      this.hero?.setLightAndTint(_biomeLightDir, _biomeAmbientTint);

      // Animate Crystal & procedural NPCs
      this.crystalMesh.rotation.y += dt * 1.4;
      this.crystalMesh.position.y = 2.05 + Math.sin(this.elapsed * 2.5) * 0.18;
      for (let idx = 0; idx < this.npcs.length; idx++) {
        const n = this.npcs[idx];
        const qDone =
          (n.role === 'elder' && this.quests.q1 === 2) ||
          (n.role === 'smith' && this.quests.q2 === 2) ||
          (n.role === 'scholar' && this.quests.q3 === 2 && this.quests.mage === 6) ||
          (n.role === 'warrior' && this.quests.warrior === 3);
        const hasQuest = n.role === 'elder' || n.role === 'smith' || n.role === 'scholar' || n.role === 'warrior';
        n.marker.visible = hasQuest && !qDone;
        n.marker.position.y = n.pos.y + 2.1 + Math.sin(this.elapsed * 3.5 + idx) * 0.12;
        const active =
          (n.role === 'elder' && this.quests.q1 === 1) ||
          (n.role === 'smith' && this.quests.q2 === 1) ||
          (n.role === 'scholar' && (this.quests.q3 === 1 || this.quests.mage === 1 || this.quests.mage === 3 || this.quests.mage === 5)) ||
          (n.role === 'warrior' && (this.quests.warrior === 1 || this.quests.warrior === 2));
        (n.marker.material as THREE.SpriteMaterial).color.setHex(active ? 0x38bdf8 : 0xfacc15);

        n.actor.setLightAndTint(_biomeLightDir, _biomeAmbientTint);
        const ndx = this.player.pos.x - n.pos.x;
        const ndz = this.player.pos.z - n.pos.z;
        if (ndx * ndx + ndz * ndz < 36) {
          n.actor.setFacing(ndx, ndz);
        }
        n.actor.playAnimation(this.talkingNpc === n ? 'talk' : 'idle');
        n.actor.update(dt);
      }

      this.grassUniforms.uTime.value = this.elapsed;

      // Dynamic Chunk Streaming + Object Pool recycling
      this.chunkManager.update(this.player.pos.x, this.player.pos.z);

      if (this.phase === 'playing') {
        if (this.combatTimer > 0) {
          this.combatTimer = Math.max(0, this.combatTimer - dt);
          if (this.combatTimer <= 0 && this.isInCombat) {
            this.isInCombat = false;
            gameEventBus.emit('player:combatChanged', { inCombat: false });
          }
        }
        if (this.targetEnemy?.dead) {
          this.setCombatTarget(null);
        }
        if (this.hitstopTimer > 0) {
          this.hitstopTimer -= dt;
          if (this.slashMat.opacity > 0) {
            this.slashMat.opacity = Math.max(0, this.slashMat.opacity - dt * 2.2);
          }
        } else {
          this.updatePlayer(dt);
          this.updateEnemies(dt);
          this.updateProjectilesAndPickups(dt);
        }
        this.updateInteractionDetection(dt);
      }

      const dn = this.updateDayNight(dt);
      this.bankChest?.update(dt, _biomeLightDir, _biomeAmbientTint);
      this.updateParticles(dt, dn.nightFactor, dn.dawnDuskFactor);
      this.updateFloatItems(dt);

      // Seguimiento de cámara 3D suavizado estilo Flyff Universe: mueve cámara y target por idéntico delta
      this.controls.enabled =
        this.phase === 'playing' &&
        !this.isDialogueOpen &&
        !this.isHeroModalOpen &&
        !this.isForgeOpen &&
        !this.isBankOpen &&
        !this.isWorldMapOpen;

      if (this.phase === 'title') {
        const panX = Math.sin(this.elapsed * 0.25) * 4.5;
        const panZ = 16 + Math.cos(this.elapsed * 0.2) * 3.5;
        const panY = getTerrainHeight(panX, panZ, this.worldSeed);
        this.controls.target.set(panX, panY + 1.2, panZ);
        this.camera.position.set(panX + this.camOffset.x, panY + this.camOffset.y, panZ + this.camOffset.z);
        this.controls.update();
      } else {
        const followAlpha = 1 - Math.exp(-8 * dt);
        _desiredCamFollow.copy(this.player.pos);
        _camTargetDelta.copy(_desiredCamFollow).sub(this.camFollowPos).multiplyScalar(followAlpha);
        this.camFollowPos.add(_camTargetDelta);
        this.camera.position.add(_camTargetDelta);
        this.controls.target.add(_camTargetDelta);
        this.controls.update();
      }

      // Escalar contornos proporcionalmente a la distancia de zoom de la cámara
      const camDist = this.camera.position.distanceTo(this.controls.target);
      const outlineScale = clamp(camDist * 0.72, 6, 18);
      this.hero?.setZoomOutline(outlineScale);
      this.bankChest?.setZoomOutline(outlineScale * 0.11);

      if (this.phase === 'playing') {
        if (this.fullInvToastCd > 0) this.fullInvToastCd -= dt;
        this.hudSyncTimer += dt;
        if (this.hudSyncTimer >= 0.1) {
          this.hudSyncTimer = 0;
          this.checkZoneEntryBanner();
          this.emitHud();
        }
        this.compassTimer += dt;
        if (this.compassTimer >= 0.1) {
          this.compassTimer = 0;
          this.emitCompass();
        }
      }

      _shakeOffset.set(0, 0, 0);
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 1.6);
        _shakeOffset.set(
          (Math.random() - 0.5) * this.screenShake,
          (Math.random() - 0.5) * this.screenShake * 0.5,
          (Math.random() - 0.5) * this.screenShake
        );
        this.camera.position.add(_shakeOffset);
      }

      this.renderer.render(this.scene, this.camera);
      this.updateNameplates();

      if (_shakeOffset.lengthSq() > 0) {
        this.camera.position.sub(_shakeOffset);
      }
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    this.stopRenderLoop();
    registerSharedWebGLRenderer(null);
    this.perfObserver?.disconnect();
    this.perfObserver = null;
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).__eldoriaDebug;
    }

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.dispose();

    this.audio.dispose();
    this.hero.dispose();
    this.bankChest?.dispose();
    this.enemies.forEach((e) => {
      this.scene.remove(e.actor.group);
      e.actor.dispose();
    });
    this.npcs.forEach((n) => {
      this.scene.remove(n.actor.group);
      this.scene.remove(n.marker);
      n.actor.dispose();
      (n.marker.material as THREE.Material).dispose();
    });
    this.pickups.forEach((pk) => {
      this.scene.remove(pk.itemActor.group);
      pk.itemActor.dispose();
    });
    this.itemPoolByArch.forEach((pool) => pool.forEach((it) => it.dispose()));
    this.itemPoolByArch.clear();

    this.floatTextSystem.dispose();
    this.nameplateSystem.dispose();
    this.chunkManager.dispose();
    this.projMatCache.forEach((m) => m.dispose());
    this.projMatCache.clear();
    this.enemyTeleGeoCache.clear();
    this.projMeshPool.length = 0;
    this.bosses.length = 0;
    this.particlePool.length = 0;
    this.freeParticleIds.length = 0;
    this.activeParticleIds.length = 0;
    this.pointsGeo.dispose();
    this.pointsMat.dispose();
    this.firefliesGeo.dispose();
    this.firefliesMat.dispose();
    this.torchLightPool.forEach((l) => l.dispose());
    this.torchLightPool.length = 0;
    this.crystalLight?.dispose();
    this.disposableGeos.forEach((g) => g.dispose());
    this.disposableMats.forEach((m) => m.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
