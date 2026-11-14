export type ThreatTier = 'green' | 'yellow' | 'red';

export interface FlyffCombatSummary {
  levelDiff: number;
  threat: ThreatTier;
  threatColor: string;
  damageMultiplier: number;
  incomingDamageMultiplier: number;
  hitChance: number;
  expGain: number;
  dropMultiplier: number;
  statusLabel: string;
}

export interface PlayerDamageParams {
  playerLevel: number;
  monsterLevel: number;
  baseAttack: number;
  equipmentBonus: number;
  comboMultiplier?: number;
  critMultiplier?: number;
  rng?: () => number;
}

export interface PlayerDamageResult {
  missed: boolean;
  damage: number;
  accuracyPenalty: number;
  hitChance: number;
}

export const THREAT_COLORS: Record<ThreatTier, string> = {
  green: '#4ade80',
  yellow: '#facc15',
  red: '#ef4444',
};

/**
 * Sistema de progresión y combate inspirado en Flyff Universe + OSRS:
 * - Flyff: penalización por diferencia de nivel en precisión/daño (-8%/nivel debajo del mob, mín 0.2),
 *   daño recibido +15% por cada nivel superior del mob, y bloqueo duro en brecha >= +16 niveles.
 * - OSRS: tirada de acierto (`hitChance`) que penaliza atacar mobs superiores sin equipamiento
 *   (`equipmentBonus === 0`), produciendo "Miss" en los golpes fallidos.
 */
export const ProgressionSystem = {
  getAccuracyPenalty(playerLevel: number, monsterLevel: number): number {
    const gap = monsterLevel - playerLevel;
    if (gap >= 16) return 0.1;
    const levelDiff = playerLevel - monsterLevel;
    if (levelDiff < 0) return Math.max(0.2, 1 + levelDiff * 0.08);
    return 1.0;
  },

  getHitChance(playerLevel: number, monsterLevel: number, equipmentBonus = 0): number {
    const levelDiff = playerLevel - monsterLevel;
    if (levelDiff >= 0) return 1.0;
    const unequippedPenalty = equipmentBonus <= 0 ? 0.12 : 0;
    const gearAccuracy = Math.min(0.18, Math.max(0, equipmentBonus) * 0.025);
    return Math.max(0.2, Math.min(0.95, 1 + levelDiff * 0.14 - unequippedPenalty + gearAccuracy));
  },

  getDamageMultiplier(playerLevel: number, monsterLevel: number): number {
    return ProgressionSystem.getAccuracyPenalty(playerLevel, monsterLevel);
  },

  getIncomingDamageMultiplier(playerLevel: number, monsterLevel: number): number {
    const diff = monsterLevel - playerLevel;
    if (diff > 0) return 1 + diff * 0.15;
    return 1.0;
  },

  computePlayerDamage({
    playerLevel,
    monsterLevel,
    baseAttack,
    equipmentBonus,
    comboMultiplier = 1,
    critMultiplier = 1,
    rng = Math.random,
  }: PlayerDamageParams): PlayerDamageResult {
    const accuracyPenalty = ProgressionSystem.getAccuracyPenalty(playerLevel, monsterLevel);
    const hitChance = ProgressionSystem.getHitChance(playerLevel, monsterLevel, equipmentBonus);
    if (rng() > hitChance) {
      return { missed: true, damage: 0, accuracyPenalty, hitChance };
    }
    const baseDamage = Math.max(1, baseAttack) * (1 + Math.max(0, equipmentBonus) * 0.1);
    const variance = 0.9 + rng() * 0.2;
    const damage = Math.max(
      1,
      Math.round(baseDamage * accuracyPenalty * comboMultiplier * critMultiplier * variance)
    );
    return { missed: false, damage, accuracyPenalty, hitChance };
  },

  getExpGain(playerLevel: number, monsterLevel: number, isBoss = false): number {
    const diff = monsterLevel - playerLevel;
    if (diff >= 16) return 0; // Bloqueo duro Flyff Universe (+16 niveles)
    if (playerLevel > monsterLevel + 10) return 0; // Enemigo demasiado bajo

    const expBase = monsterLevel * 10 * (isBoss ? 5 : 1);
    if (diff > 0) {
      return Math.round(expBase * (1 + diff * 0.05));
    }
    if (playerLevel > monsterLevel + 5) {
      return Math.round(expBase * 0.5);
    }
    return expBase;
  },

  getDropMultiplier(playerLevel: number, monsterLevel: number): number {
    const diff = monsterLevel - playerLevel;
    if (diff >= 16) return 0; // Sin drops en brecha >= +16
    if (playerLevel > monsterLevel + 10) return 0.25;
    if (playerLevel > monsterLevel + 5) return 0.65;
    return 1.0;
  },

  getThreatTier(playerLevel: number, monsterLevel: number): ThreatTier {
    const diff = monsterLevel - playerLevel;
    if (diff >= 16 || playerLevel > monsterLevel + 10) return 'red';
    if (diff > 0 || playerLevel > monsterLevel + 5) return 'yellow';
    return 'green';
  },

  getStatusLabel(playerLevel: number, monsterLevel: number, equipmentBonus = 0): string {
    const diff = monsterLevel - playerLevel;
    if (diff >= 16) return 'Bloqueo +16: 0 EXP / 0 Drop / Daño 10%';
    if (playerLevel > monsterLevel + 10) return 'Nivel muy bajo: 0 EXP';
    if (playerLevel > monsterLevel + 5) return 'Nivel bajo: EXP 50%';
    if (diff > 0) {
      const dmgPct = Math.round(ProgressionSystem.getAccuracyPenalty(playerLevel, monsterLevel) * 100);
      const hitPct = Math.round(ProgressionSystem.getHitChance(playerLevel, monsterLevel, equipmentBonus) * 100);
      const incPct = Math.round(ProgressionSystem.getIncomingDamageMultiplier(playerLevel, monsterLevel) * 100);
      return `+${diff} Nv: Acierto ${hitPct}% · Daño ${dmgPct}% · Recibido ${incPct}%`;
    }
    return 'Rango óptimo: EXP 100% · Daño 100%';
  },

  getCombatSummary(
    playerLevel: number,
    monsterLevel: number,
    isBoss = false,
    equipmentBonus = 0
  ): FlyffCombatSummary {
    const levelDiff = monsterLevel - playerLevel;
    const threat = ProgressionSystem.getThreatTier(playerLevel, monsterLevel);
    return {
      levelDiff,
      threat,
      threatColor: THREAT_COLORS[threat],
      damageMultiplier: ProgressionSystem.getAccuracyPenalty(playerLevel, monsterLevel),
      incomingDamageMultiplier: ProgressionSystem.getIncomingDamageMultiplier(playerLevel, monsterLevel),
      hitChance: ProgressionSystem.getHitChance(playerLevel, monsterLevel, equipmentBonus),
      expGain: ProgressionSystem.getExpGain(playerLevel, monsterLevel, isBoss),
      dropMultiplier: ProgressionSystem.getDropMultiplier(playerLevel, monsterLevel),
      statusLabel: ProgressionSystem.getStatusLabel(playerLevel, monsterLevel, equipmentBonus),
    };
  },
};
