import * as THREE from 'three';
import { TIME } from './Constants';
import { computeBiomeEnvironmentTargetAt } from './core/BiomeSystem';
import { GLOBAL_DAY_NIGHT_UNIFORMS } from './core/GlobalDayNightUniforms';
import { PALETTE_ENVIRONMENT, PALETTE_SKY } from './core/PaletteEnvironment';
import { gameEventBus } from './EventBus';
import { DayPhaseId, TimeSnapshot } from './types';
import { clamp, lerp } from './worldMath';

// Colores clave de las 6 fases del día
const COL_DEEP_NIGHT = new THREE.Color(0x0a0a2a);
const COL_DAWN = new THREE.Color(0xff8c42);
const COL_DAY = new THREE.Color(0x87ceeb);
const COL_DUSK = new THREE.Color(0xff6b35);
const COL_TWILIGHT = new THREE.Color(0x2a1a4a);
const COL_HORIZON_WHITE = new THREE.Color(PALETTE_SKY.HORIZON_WHITE);

// Colores de luz direccional y ambiental por fase (legibilidad RPG garantizada de noche)
const DIR_DAY = new THREE.Color(0xfff4de);
const DIR_DAWN = new THREE.Color(0xffb478);
const DIR_DUSK = new THREE.Color(0xff8a5c);
const DIR_MOON = new THREE.Color(0x7aa2f7);

const AMB_DAY = new THREE.Color(0xffffff);
const AMB_DAWN = new THREE.Color(0xffdfc2);
const AMB_DUSK = new THREE.Color(0xffc9ab);
const AMB_TWILIGHT = new THREE.Color(0x8f82c4);
const AMB_NIGHT = new THREE.Color(0x5b70ad);

const GROUND_DAY = new THREE.Color(PALETTE_ENVIRONMENT.GRASS_SHADOW);
const GROUND_NIGHT = new THREE.Color(0x161b3a);

// Scratch reutilizados (cero GC por frame)
const _phaseSky = new THREE.Color();
const _phaseAmb = new THREE.Color();
const _phaseDir = new THREE.Color();
const _phaseGround = new THREE.Color();
const _targetSky = new THREE.Color();
const _targetGrassBase = new THREE.Color();
const _targetGrassShadow = new THREE.Color();
const _targetGrassHighlight = new THREE.Color();
const _smoothedBiomeSky = new THREE.Color(PALETTE_SKY.DAY_SKY);
const _finalSky = new THREE.Color(PALETTE_SKY.DAY_SKY);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function resolveDayPhase(hours: number): { phase: DayPhaseId; label: string; isNight: boolean } {
  const h = ((hours % 24) + 24) % 24;
  if (h < 5) return { phase: 'deep_night', label: 'Noche profunda', isNight: true };
  if (h < 7) return { phase: 'dawn', label: 'Amanecer', isNight: false };
  if (h < 17) return { phase: 'day', label: 'Día', isNight: false };
  if (h < 19) return { phase: 'dusk', label: 'Atardecer', isNight: false };
  if (h < 21) return { phase: 'twilight', label: 'Crepúsculo', isNight: true };
  return { phase: 'night', label: 'Noche', isNight: true };
}

export function formatGameTime(hours: number): { hour: number; minute: number; formatted: string } {
  const hNorm = ((hours % 24) + 24) % 24;
  const totalMinutes = Math.floor(hNorm * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hh = hour < 10 ? `0${hour}` : `${hour}`;
  const mm = minute < 10 ? `0${minute}` : `${minute}`;
  return { hour, minute, formatted: `${hh}:${mm}` };
}

export interface DayNightUpdateParams {
  delta: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  worldSeed: number;
  shadowMapSize: number;
  dirLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  scene: THREE.Scene;
  grassWindUniform: { value: number };
  outSunDir: THREE.Vector3;
  outSkyColor: THREE.Color;
}

export class DayNightCycle {
  private gameTimeHours: number;
  private lastEmittedMinute = -1;
  private lastPhase: DayPhaseId | null = null;
  private nightFactor = 0;
  private dawnDuskFactor = 0;

  constructor(initialHour: number = TIME.DAY_START_HOUR) {
    this.gameTimeHours = ((initialHour % TIME.GAME_HOURS_PER_DAY) + TIME.GAME_HOURS_PER_DAY) % TIME.GAME_HOURS_PER_DAY;
    this.syncUniformsOnly();
  }

  public getTimeHours(): number {
    return this.gameTimeHours;
  }

  public setTimeHours(hours: number, emitEvents = true): void {
    if (!Number.isFinite(hours)) return;
    this.gameTimeHours = ((hours % TIME.GAME_HOURS_PER_DAY) + TIME.GAME_HOURS_PER_DAY) % TIME.GAME_HOURS_PER_DAY;
    this.lastEmittedMinute = -1;
    this.lastPhase = null;
    this.syncUniformsOnly();
    if (emitEvents) {
      this.checkAndEmitEvents();
    }
  }

  public getNightFactor(): number {
    return this.nightFactor;
  }

  public getDawnDuskFactor(): number {
    return this.dawnDuskFactor;
  }

  public getSnapshot(): TimeSnapshot {
    const { hour, minute, formatted } = formatGameTime(this.gameTimeHours);
    const { phase, label, isNight } = resolveDayPhase(this.gameTimeHours);
    return {
      hours: this.gameTimeHours,
      hour,
      minute,
      formatted,
      phase,
      phaseLabel: label,
      isNight,
      timeOfDay: this.gameTimeHours / TIME.GAME_HOURS_PER_DAY,
    };
  }

  private computePhaseFactorsAndColors(h: number): {
    dayLight: number;
    dawnFactor: number;
    duskFactor: number;
    fogNear: number;
    fogFar: number;
  } {
    // 0-5: #0a0a2a
    // 5-7: #ff8c42 -> #87CEEB (con ~0.5h suave desde #0a0a2a en 4.5-5.2)
    // 7-17: #87CEEB
    // 17-19: #87CEEB -> #ff6b35
    // 19-21: #ff6b35 -> #2a1a4a
    // 21-24: #0a0a2a (con ~0.5h suave 20.5-21.5 hacia #0a0a2a)
    let dawnFactor = 0;
    let duskFactor = 0;

    if (h < 4.5) {
      _phaseSky.copy(COL_DEEP_NIGHT);
      _phaseAmb.copy(AMB_NIGHT);
      _phaseDir.copy(DIR_MOON);
      _phaseGround.copy(GROUND_NIGHT);
    } else if (h < 5.3) {
      const t = smoothstep(4.5, 5.3, h);
      dawnFactor = t;
      _phaseSky.copy(COL_DEEP_NIGHT).lerp(COL_DAWN, t);
      _phaseAmb.copy(AMB_NIGHT).lerp(AMB_DAWN, t);
      _phaseDir.copy(DIR_MOON).lerp(DIR_DAWN, t);
      _phaseGround.copy(GROUND_NIGHT).lerp(GROUND_DAY, t * 0.5);
    } else if (h < 7.0) {
      const t = smoothstep(5.3, 7.0, h);
      dawnFactor = 1 - t * 0.65;
      _phaseSky.copy(COL_DAWN).lerp(COL_DAY, t);
      _phaseAmb.copy(AMB_DAWN).lerp(AMB_DAY, t);
      _phaseDir.copy(DIR_DAWN).lerp(DIR_DAY, t);
      _phaseGround.copy(GROUND_NIGHT).lerp(GROUND_DAY, 0.5 + t * 0.5);
    } else if (h < 16.6) {
      _phaseSky.copy(COL_DAY);
      _phaseAmb.copy(AMB_DAY);
      _phaseDir.copy(DIR_DAY);
      _phaseGround.copy(GROUND_DAY);
    } else if (h < 19.0) {
      const t = smoothstep(16.6, 19.0, h);
      duskFactor = t;
      _phaseSky.copy(COL_DAY).lerp(COL_DUSK, t);
      _phaseAmb.copy(AMB_DAY).lerp(AMB_DUSK, t);
      _phaseDir.copy(DIR_DAY).lerp(DIR_DUSK, t);
      _phaseGround.copy(GROUND_DAY).lerp(GROUND_NIGHT, t * 0.35);
    } else if (h < 20.6) {
      const t = smoothstep(19.0, 20.6, h);
      duskFactor = 1 - t;
      _phaseSky.copy(COL_DUSK).lerp(COL_TWILIGHT, t);
      _phaseAmb.copy(AMB_DUSK).lerp(AMB_TWILIGHT, t);
      _phaseDir.copy(DIR_DUSK).lerp(DIR_MOON, t);
      _phaseGround.copy(GROUND_DAY).lerp(GROUND_NIGHT, 0.35 + t * 0.45);
    } else if (h < 21.5) {
      const t = smoothstep(20.6, 21.5, h);
      _phaseSky.copy(COL_TWILIGHT).lerp(COL_DEEP_NIGHT, t);
      _phaseAmb.copy(AMB_TWILIGHT).lerp(AMB_NIGHT, t);
      _phaseDir.copy(DIR_MOON);
      _phaseGround.copy(GROUND_DAY).lerp(GROUND_NIGHT, 0.8 + t * 0.2);
    } else {
      _phaseSky.copy(COL_DEEP_NIGHT);
      _phaseAmb.copy(AMB_NIGHT);
      _phaseDir.copy(DIR_MOON);
      _phaseGround.copy(GROUND_NIGHT);
    }

    // Factor solar suave (0 = noche cerrada, 1 = día pleno)
    const dayRise = smoothstep(4.8, 7.0, h);
    const daySet = 1 - smoothstep(17.5, 20.6, h);
    const dayLight = clamp(Math.min(dayRise, daySet), 0, 1);

    this.nightFactor = 1 - dayLight;
    this.dawnDuskFactor = clamp(Math.max(dawnFactor, duskFactor), 0, 1);

    const fogNear = lerp(42, 28, this.nightFactor);
    const fogFar = lerp(115, 78, this.nightFactor);

    return { dayLight, dawnFactor, duskFactor, fogNear, fogFar };
  }

  private syncUniformsOnly(): void {
    const h = this.gameTimeHours;
    this.computePhaseFactorsAndColors(h);

    const sunAngle = ((h - 6) / TIME.GAME_HOURS_PER_DAY) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    const activeElevation = sunY >= 0 ? Math.max(0.24, sunY) : Math.max(0.28, -sunY * 0.72);
    const activeHorizon = sunY >= 0 ? sunX : -sunX * 0.7;

    GLOBAL_DAY_NIGHT_UNIFORMS.uTimeOfDay.value = h / TIME.GAME_HOURS_PER_DAY;
    GLOBAL_DAY_NIGHT_UNIFORMS.uSunDirection.value.set(activeHorizon, activeElevation, 0.42).normalize();
    GLOBAL_DAY_NIGHT_UNIFORMS.uAmbientColor.value.copy(_phaseAmb);
  }

  private checkAndEmitEvents(): void {
    const { hour, minute, formatted } = formatGameTime(this.gameTimeHours);
    const { phase, label, isNight } = resolveDayPhase(this.gameTimeHours);
    const totalMin = hour * 60 + minute;

    if (totalMin !== this.lastEmittedMinute) {
      this.lastEmittedMinute = totalMin;
      gameEventBus.emit('time:minuteChanged', {
        hours: this.gameTimeHours,
        hour,
        minute,
        formatted,
        phase,
        phaseLabel: label,
        isNight,
        timeOfDay: this.gameTimeHours / TIME.GAME_HOURS_PER_DAY,
      });
    }

    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      gameEventBus.emit('time:phaseChanged', { phase, label, isNight });
    }
  }

  public emitInitialEvents(): void {
    this.lastEmittedMinute = -1;
    this.lastPhase = null;
    this.checkAndEmitEvents();
  }

  public update(params: DayNightUpdateParams): { nightFactor: number; dawnDuskFactor: number; fogNear: number; fogFar: number } {
    const {
      delta,
      playerX,
      playerY,
      playerZ,
      worldSeed,
      shadowMapSize,
      dirLight,
      hemiLight,
      scene,
      grassWindUniform,
      outSunDir,
      outSkyColor,
    } = params;

    // 1 hora de juego = 600s reales => 24h completas = 4 horas reales
    this.gameTimeHours = (this.gameTimeHours + delta / TIME.REAL_SECONDS_PER_GAME_HOUR) % TIME.GAME_HOURS_PER_DAY;
    const h = this.gameTimeHours;

    const { dayLight, fogNear, fogFar } = this.computePhaseFactorsAndColors(h);

    // Viento y atmósfera sutil por bioma (sin GC)
    const targetWind = computeBiomeEnvironmentTargetAt(
      playerX,
      playerZ,
      worldSeed,
      _targetGrassBase,
      _targetGrassShadow,
      _targetGrassHighlight,
      _targetSky
    );
    const envSmooth = 1 - Math.exp(-1.5 * delta);
    grassWindUniform.value = lerp(grassWindUniform.value, targetWind, envSmooth);
    _smoothedBiomeSky.lerp(_targetSky, envSmooth);

    // Cielo unificado: fase temporal dominante, modulada sutilmente por clima del bioma de día
    _finalSky.copy(_phaseSky);
    if (dayLight > 0.05) {
      _finalSky.lerp(COL_HORIZON_WHITE, 0.1 * dayLight);
      _finalSky.lerp(_smoothedBiomeSky, 0.32 * dayLight);
    }

    // Arco solar / lunar continuo con snap de texel en shadowMap
    const sunAngle = ((h - 6) / TIME.GAME_HOURS_PER_DAY) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    const isDayArc = sunY >= 0;
    const lx = (isDayArc ? sunX : -sunX * 0.7) * 28;
    const ly = isDayArc ? Math.max(9, sunY * 34 + 6) : Math.max(12, Math.abs(sunY) * 24 + 10);

    const texel = (28 * 2) / shadowMapSize;
    const snapX = Math.round(playerX / texel) * texel;
    const snapZ = Math.round(playerZ / texel) * texel;
    dirLight.position.set(snapX + lx, playerY + ly, snapZ + 18);
    dirLight.target.position.set(snapX, playerY, snapZ);
    dirLight.target.updateMatrixWorld();

    outSunDir.copy(dirLight.position).sub(dirLight.target.position).normalize();
    outSkyColor.copy(_finalSky);

    // Actualizar uniforms globales compartidos
    GLOBAL_DAY_NIGHT_UNIFORMS.uTimeOfDay.value = h / TIME.GAME_HOURS_PER_DAY;
    GLOBAL_DAY_NIGHT_UNIFORMS.uSunDirection.value.copy(outSunDir);
    GLOBAL_DAY_NIGHT_UNIFORMS.uAmbientColor.value.copy(_phaseAmb);

    // Aplicar a escena, niebla y luces Three.js
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_finalSky);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(_finalSky);
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }

    dirLight.color.copy(_phaseDir);
    dirLight.intensity = lerp(0.46, 1.28, dayLight);

    hemiLight.color.copy(_finalSky);
    hemiLight.groundColor.copy(_phaseGround);
    hemiLight.intensity = lerp(0.36, 0.84, dayLight);

    this.checkAndEmitEvents();

    return {
      nightFactor: this.nightFactor,
      dawnDuskFactor: this.dawnDuskFactor,
      fogNear,
      fogFar,
    };
  }
}
