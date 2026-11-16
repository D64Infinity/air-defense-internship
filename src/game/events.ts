import Phaser from 'phaser';
import type { GameTarget } from './gameConfig';
import type { TargetSpawner } from './spawner';

/**
 * Параметры настройки тактических динамических событий
 */
export const EVENT_CONFIG = {
  salvo: {
    minWave: 3, // Стартовая волна для появления ивента
    delayMin: 4.5, // Минимальная задержка от старта волны (сек)
    delayMax: 7.5, // Максимальная задержка от старта волны (сек)
    intervalBetweenMissiles: 0.75, // Интервал между ракетами в пачке (сек)
    wave3Count: 2, // 2 ракеты на 3-й волне
    wave4PlusCount: 3, // 3 ракеты на 4+ волнах
    fanSpreadRad: 0.09, // Угловой веерный разброс траекторий (~5 градусов)
    warningDuration: 2.5, // Длительность красной подсветки сектора угрозы (сек)
    startChanceWave4: 0.10, // 10% вероятность на первой проверке (волна 4)
  },
} as const;

/**
 * Контекст игрового состояния для оценки и генерации событий
 */
export interface TacticalEventContext {
  wave: number;
  activeTargetsCount: number;
  targetsLeftInWave: number;
}

/**
 * Описание сектора предупреждения о залпе
 */
export interface SalvoWarningSector {
  angle: number;
  duration: number;
}

/**
 * Результат одного шага тика менеджера событий
 */
export interface TacticalEventStepResult {
  spawnedTargets: GameTarget[];
  warningSector?: SalvoWarningSector;
  playAlarmSound?: boolean;
}

/**
 * Расчёт динамической вероятности события «Массированный залп».
 * - Волна 3: гарантирован (100%).
 * - Волна 4 (1 волна после предыдущего залпа): стартовое значение 10% (0.10).
 * - Далее вероятность плавно нарастает так, чтобы средний интервал составлял 2-5 волн (E ≈ 3 волны).
 * - На 5-й волне без залпа вероятность достигает 100% (гарантированный верхний порог).
 */
export function calculateSalvoProbability(wavesSinceLastSalvo: number): number {
  switch (wavesSinceLastSalvo) {
    case 1:
      return EVENT_CONFIG.salvo.startChanceWave4; // 10% на старте волны 4
    case 2:
      return 0.25; // 2 волны перерыва
    case 3:
      return 0.50; // 3 волны перерыва
    case 4:
      return 0.75; // 4 волны перерыва
    default:
      return 1.00; // 5+ волн: гарантированное срабатывание
  }
}

/**
 * Интерфейс менеджера тактических событий
 */
export interface TacticalEventManager {
  reset: () => void;
  startWave: (wave: number, targetsLeftInWave: number) => void;
  update: (
    dt: number,
    context: TacticalEventContext,
  ) => TacticalEventStepResult;
}

/**
 * Внутреннее состояние прогрессивного события «Массированный залп» (Salvo Alert)
 */
interface SalvoState {
  scheduled: boolean;
  delayTimer: number;
  active: boolean;
  missilesLeftToSpawn: number;
  launchTimer: number;
  baseAngle: number;
  currentSalvoIndex: number;
  totalSalvoSize: number;
}

/**
 * Фабрика менеджера динамических тактических событий
 */
export function createTacticalEventsManager(
  spawner: TargetSpawner,
): TacticalEventManager {
  let wavesSinceLastSalvo = 0;

  let salvo: SalvoState = {
    scheduled: false,
    delayTimer: 0,
    active: false,
    missilesLeftToSpawn: 0,
    launchTimer: 0,
    baseAngle: 0,
    currentSalvoIndex: 0,
    totalSalvoSize: 0,
  };

  const reset = (): void => {
    salvo.scheduled = false;
    salvo.active = false;
    salvo.missilesLeftToSpawn = 0;
    wavesSinceLastSalvo = 0;
  };

  /**
   * Инициализация событий в начале новой волны
   */
  const startWave = (wave: number, targetsLeftInWave: number): void => {
    salvo.scheduled = false;
    salvo.active = false;
    salvo.missilesLeftToSpawn = 0;

    // Оценка запуска события «Массированный залп»
    let shouldTrigger = false;
    if (wave === EVENT_CONFIG.salvo.minWave && targetsLeftInWave >= 4) {
      // На 3-й волне ивент гарантирован (100%)
      shouldTrigger = true;
      wavesSinceLastSalvo = 0;
    } else if (wave > EVENT_CONFIG.salvo.minWave && targetsLeftInWave >= 4) {
      // С 4-й волны: динамический расчёт шанса (10% на старте волны 4, средний интервал 2–5 волн)
      wavesSinceLastSalvo++;
      const chance = calculateSalvoProbability(wavesSinceLastSalvo);
      if (Math.random() < chance) {
        shouldTrigger = true;
        wavesSinceLastSalvo = 0;
      }
    }

    if (shouldTrigger) {
      salvo.scheduled = true;
      salvo.delayTimer = Phaser.Math.FloatBetween(
        EVENT_CONFIG.salvo.delayMin,
        EVENT_CONFIG.salvo.delayMax,
      );
      salvo.active = false;

      const requestedCount =
        wave === 3
          ? EVENT_CONFIG.salvo.wave3Count
          : EVENT_CONFIG.salvo.wave4PlusCount;

      // Не превышаем допустимый остаток целей в волне
      salvo.totalSalvoSize = Math.min(
        requestedCount,
        Math.max(1, targetsLeftInWave - 2),
      );
      salvo.missilesLeftToSpawn = salvo.totalSalvoSize;
      salvo.launchTimer = 0;
      salvo.baseAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      salvo.currentSalvoIndex = 0;
    }
  };

  /**
   * Обновление таймеров событий и генерация пачек целей
   */
  const update = (
    dt: number,
    context: TacticalEventContext,
  ): TacticalEventStepResult => {
    const spawnedTargets: GameTarget[] = [];
    let warningSector: SalvoWarningSector | undefined = undefined;
    let playAlarmSound: boolean | undefined = undefined;

    // 1. Фаза ожидания запуска запланированного залпа
    if (salvo.scheduled && !salvo.active) {
      salvo.delayTimer -= dt;
      if (
        salvo.delayTimer <= 0 &&
        context.targetsLeftInWave >= salvo.missilesLeftToSpawn
      ) {
        salvo.scheduled = false;
        salvo.active = true;
        salvo.launchTimer = 0; // Первый пуск немедленно

        // Вместо текстового баннера активируем звуковой ревун и визуальную подсветку сектора
        playAlarmSound = true;
        warningSector = {
          angle: salvo.baseAngle,
          duration: EVENT_CONFIG.salvo.warningDuration,
        };
      }
    }

    // 2. Фаза активного веерного отстрела ракет пачки
    if (salvo.active) {
      salvo.launchTimer -= dt;

      if (salvo.launchTimer <= 0 && salvo.missilesLeftToSpawn > 0) {
        // Расчёт углового веерного смещения для ракет в залпе
        let angleOffset = 0;
        if (salvo.totalSalvoSize === 2) {
          angleOffset =
            salvo.currentSalvoIndex === 0
              ? -EVENT_CONFIG.salvo.fanSpreadRad
              : EVENT_CONFIG.salvo.fanSpreadRad;
        } else if (salvo.totalSalvoSize >= 3) {
          if (salvo.currentSalvoIndex === 0) {
            angleOffset = -EVENT_CONFIG.salvo.fanSpreadRad;
          } else if (salvo.currentSalvoIndex === 1) {
            angleOffset = EVENT_CONFIG.salvo.fanSpreadRad;
          } else {
            angleOffset = 0;
          }
        }

        const missileAngle = salvo.baseAngle + angleOffset;
        const target = spawner.spawnMissileAtAngle(missileAngle, context.wave);
        spawnedTargets.push(target);

        salvo.currentSalvoIndex++;
        salvo.missilesLeftToSpawn--;

        if (salvo.missilesLeftToSpawn > 0) {
          salvo.launchTimer = EVENT_CONFIG.salvo.intervalBetweenMissiles;
        } else {
          salvo.active = false;
        }
      }
    }

    return {
      spawnedTargets,
      warningSector,
      playAlarmSound,
    };
  };

  return {
    reset,
    startWave,
    update,
  };
}
