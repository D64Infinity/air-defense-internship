import Phaser from 'phaser';
import { GAME_CONFIG, type TargetType } from './gameConfig';

export type WaveModifierId =
  | 'ally_convoy'
  | 'reverse_sweep'
  | 'radio_silence'
  | 'blind_sector'
  | 'afterburner_raid'
  | 'recon_hunt';

/**
 * Конфигурация системы случайных модификаторов (правил) волны
 */
export const WAVE_MODIFIERS_CONFIG = {
  minWave: 2, // 1-я волна остаётся чистой для комфортного старта/обучения
  triggerChance: 0.65, // 65% шанс правила на волну (если прошлая была без правила — 100%)
  historyNoRepeat: 2, // последние 2 сработавших правила не выпадают подряд
  blindSectorSpanRad: Math.PI / 2, // ширина глухой зоны помех (90 градусов)
  blindSectorMaxAlpha: 0.34, // максимальная яркость отметок внутри слепого сектора
} as const;

export interface WaveModifierDefinition {
  readonly id: WaveModifierId;
  readonly minWave: number;
  readonly title: string;
  readonly shortLabel: string;
  readonly subtitle: string;
  readonly hudTag: string;
  readonly accentColor: string;
  readonly borderColor: number;
  readonly typeWeightsOverride?: Partial<Record<TargetType, number>>;
  readonly targetSpeedMultiplier?: number;
  readonly spawnIntervalMultiplier?: number;
  readonly beamDirection?: 1 | -1;
  readonly beamSpeedMultiplier?: number;
  readonly scanDisabled?: boolean;
  readonly interceptorCostOverride?: number;
  readonly creditsMultiplier?: number;
  readonly hasBlindSector?: boolean;
  readonly extraReconFlights?: number;
}

export interface ActiveWaveModifier extends WaveModifierDefinition {
  readonly blindSectorStartAngle?: number;
  readonly blindSectorSpanRad?: number;
}

/**
 * Каталог правил волн: каждое меняет ощущения от игры и требует своей тактики
 */
export const WAVE_MODIFIER_DEFS: readonly WaveModifierDefinition[] = [
  {
    id: 'ally_convoy',
    minWave: 2,
    title: 'КОНВОЙ СОЮЗНИКОВ',
    shortLabel: 'КОНВОЙ',
    subtitle: 'ПЛОТНЫЙ ПОТОК СВОИХ БОРТОВ • ОСТОРОЖНЕЕ С ОГНЁМ',
    hudTag: 'ПРАВИЛО: КОНВОЙ (МНОГО СВОИХ • ЧАЩЕ СПАВН)',
    accentColor: '#4ade80',
    borderColor: 0x22c55e,
    typeWeightsOverride: { friend: 52, bomber: 22, missile: 16, decoy: 10 },
    spawnIntervalMultiplier: 0.78,
  },
  {
    id: 'reverse_sweep',
    minWave: 2,
    title: 'ОБРАТНАЯ РАЗВЁРТКА',
    shortLabel: 'РЕВЕРС',
    subtitle: 'РЕВЕРС ЛУЧА РЛС ПРОТИВ ЧАСОВОЙ • СКОРОСТЬ +35%',
    hudTag: 'ПРАВИЛО: ОБРАТНАЯ РАЗВЁРТКА (ЛУЧ НАЗАД +35%)',
    accentColor: '#38bdf8',
    borderColor: 0x0284c7,
    beamDirection: -1,
    beamSpeedMultiplier: 1.35,
  },
  {
    id: 'radio_silence',
    minWave: 3,
    title: 'РАДИОМОЛЧАНИЕ',
    shortLabel: 'ТИШИНА',
    subtitle: 'СКАНЕР ОТКЛЮЧЁН • РАКЕТЫ ПО 90 CR • +25% КРЕДИТОВ',
    hudTag: 'ПРАВИЛО: РАДИОМОЛЧАНИЕ (БЕЗ СКАНА • РАКЕТА 90 CR)',
    accentColor: '#facc15',
    borderColor: 0xeab308,
    scanDisabled: true,
    interceptorCostOverride: 90,
    creditsMultiplier: 1.25,
  },
  {
    id: 'blind_sector',
    minWave: 3,
    title: 'МЁРТВЫЙ СЕКТОР',
    shortLabel: 'СЕКТОР',
    subtitle: 'КВАДРАНТ 90° В ПОМЕХАХ • ТУСКЛАЯ ЗАСВЕТКА ЦЕЛЕЙ',
    hudTag: 'ПРАВИЛО: МЁРТВЫЙ СЕКТОР (ПОМЕХИ В КВАДРАНТЕ 90°)',
    accentColor: '#f97316',
    borderColor: 0xea580c,
    hasBlindSector: true,
    creditsMultiplier: 1.15,
  },
  {
    id: 'afterburner_raid',
    minWave: 3,
    title: 'ФОРСАЖНЫЙ НАЛЁТ',
    shortLabel: 'ФОРСАЖ',
    subtitle: 'СКОРОСТЬ ЦЕЛЕЙ +25% • +35% КРЕДИТОВ ЗА ПЕРЕХВАТ',
    hudTag: 'ПРАВИЛО: ФОРСАЖ (+25% СКОРОСТЬ • +35% CR)',
    accentColor: '#f87171',
    borderColor: 0xef4444,
    targetSpeedMultiplier: 1.25,
    spawnIntervalMultiplier: 1.12,
    creditsMultiplier: 1.35,
  },
  {
    id: 'recon_hunt',
    minWave: 4,
    title: 'ВОЗДУШНАЯ РАЗВЕДКА',
    shortLabel: 'СОКОЛ',
    subtitle: 'ДВОЙНОЙ ВЫЛЕТ РАЗВЕДЧИКА «СОКОЛ» • СКОРОСТНЫЕ ЦЕЛИ',
    hudTag: 'ПРАВИЛО: РАЗВЕДКА (ДВОЙНОЙ ВЫЛЕТ «СОКОЛА»)',
    accentColor: '#67e8f9',
    borderColor: 0x06b6d4,
    typeWeightsOverride: { missile: 42, decoy: 24, bomber: 20, friend: 14 },
    extraReconFlights: 2,
  },
];

/**
 * Проверка попадания координат (x, y) внутрь слепого сектора активного модификатора
 */
export function isPointInBlindSector(
  modifier: ActiveWaveModifier | null | undefined,
  x: number,
  y: number,
): boolean {
  if (
    !modifier?.hasBlindSector ||
    modifier.blindSectorStartAngle === undefined ||
    modifier.blindSectorSpanRad === undefined
  ) {
    return false;
  }

  const dx = x - GAME_CONFIG.radarX;
  const dy = y - GAME_CONFIG.radarY;
  const dist = Math.hypot(dx, dy);
  if (dist < GAME_CONFIG.baseRadius + 10) return false;

  const twoPi = Math.PI * 2;
  const angle = ((Math.atan2(dy, dx) % twoPi) + twoPi) % twoPi;
  const delta = ((angle - modifier.blindSectorStartAngle) % twoPi + twoPi) % twoPi;
  return delta <= modifier.blindSectorSpanRad;
}

export interface WaveModifierManager {
  readonly current: ActiveWaveModifier | null;
  rollForWave: (wave: number, isSpecialWave: boolean) => ActiveWaveModifier | null;
  reset: () => void;
}

/**
 * Фабрика менеджера модификаторов волн
 */
export function createWaveModifierManager(): WaveModifierManager {
  let current: ActiveWaveModifier | null = null;
  let recentIds: WaveModifierId[] = [];
  let hadModifierLastEligibleWave = false;

  const reset = (): void => {
    current = null;
    recentIds = [];
    hadModifierLastEligibleWave = false;
  };

  const rollForWave = (
    wave: number,
    isSpecialWave: boolean,
  ): ActiveWaveModifier | null => {
    current = null;

    if (isSpecialWave || wave < WAVE_MODIFIERS_CONFIG.minWave) {
      hadModifierLastEligibleWave = false;
      return null;
    }

    // Не даём двум «пустым» волнам идти подряд — держим динамику
    const mustTrigger = !hadModifierLastEligibleWave;
    const willTrigger = mustTrigger || Math.random() < WAVE_MODIFIERS_CONFIG.triggerChance;
    if (!willTrigger) {
      hadModifierLastEligibleWave = false;
      return null;
    }

    const eligible = WAVE_MODIFIER_DEFS.filter(
      (def) => def.minWave <= wave && !recentIds.includes(def.id),
    );
    const pool =
      eligible.length > 0
        ? eligible
        : WAVE_MODIFIER_DEFS.filter((def) => def.minWave <= wave);

    if (pool.length === 0) {
      hadModifierLastEligibleWave = false;
      return null;
    }

    const picked = pool[Phaser.Math.Between(0, pool.length - 1)];
    recentIds.push(picked.id);
    if (recentIds.length > WAVE_MODIFIERS_CONFIG.historyNoRepeat) {
      recentIds.shift();
    }

    hadModifierLastEligibleWave = true;

    if (picked.hasBlindSector) {
      current = {
        ...picked,
        blindSectorStartAngle: Phaser.Math.FloatBetween(0, Math.PI * 2),
        blindSectorSpanRad: WAVE_MODIFIERS_CONFIG.blindSectorSpanRad,
      };
    } else {
      current = { ...picked };
    }

    return current;
  };

  return {
    get current() {
      return current;
    },
    rollForWave,
    reset,
  };
}
