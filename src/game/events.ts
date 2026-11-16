import Phaser from 'phaser';
import type { GameTarget } from './gameConfig';
import type { TargetSpawner } from './spawner';

/**
 * Параметры настройки тактических динамических событий
 */
export const EVENT_CONFIG = {
  salvo: {
    minWave: 3, // Стартовая волна для появления ивента
    delayMin: 3.5, // Минимальная задержка до включения раннего оповещения (сек)
    delayMax: 6.5, // Максимальная задержка до включения раннего оповещения (сек)
    earlyWarningLeadTime: 2.0, // За 2.0 секунды ДО прилёта включается сирена и дуга на границе
    intervalBetweenMissiles: 0.75, // Интервал между ракетами в пачке (сек)
    wave3Count: 2, // 2 ракеты на 3-й волне
    wave4PlusCount: 3, // 3 ракеты на 4+ волнах
    fanSpreadRad: 0.09, // Угловой веерный разброс траекторий (~5 градусов)
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
  activeTargets: readonly GameTarget[];
}

/**
 * Описание дуги предупреждения и сопровождения налёта на границе радара
 */
export interface SalvoWarningArc {
  angle: number;
  phase: 'warning' | 'active'; // 'warning' = 2 сек до прилёта, 'active' = ракеты в воздухе до уничтожения
}

/**
 * Результат одного шага тика менеджера событий
 */
export interface TacticalEventStepResult {
  spawnedTargets: GameTarget[];
  warningArc: SalvoWarningArc | null;
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
type SalvoPhase = 'idle' | 'scheduled' | 'warning' | 'spawning' | 'tracking';

interface SalvoState {
  phase: SalvoPhase;
  delayTimer: number;
  warningTimer: number;
  missilesLeftToSpawn: number;
  launchTimer: number;
  baseAngle: number;
  currentSalvoIndex: number;
  totalSalvoSize: number;
  trackedTargetIds: Set<number>;
}

/**
 * Фабрика менеджера динамических тактических событий
 */
export function createTacticalEventsManager(
  spawner: TargetSpawner,
): TacticalEventManager {
  let wavesSinceLastSalvo = 0;

  let salvo: SalvoState = {
    phase: 'idle',
    delayTimer: 0,
    warningTimer: 0,
    missilesLeftToSpawn: 0,
    launchTimer: 0,
    baseAngle: 0,
    currentSalvoIndex: 0,
    totalSalvoSize: 0,
    trackedTargetIds: new Set<number>(),
  };

  const reset = (): void => {
    salvo.phase = 'idle';
    salvo.missilesLeftToSpawn = 0;
    salvo.trackedTargetIds.clear();
    wavesSinceLastSalvo = 0;
  };

  /**
   * Инициализация событий в начале новой волны
   */
  const startWave = (wave: number, targetsLeftInWave: number): void => {
    salvo.phase = 'idle';
    salvo.missilesLeftToSpawn = 0;
    salvo.trackedTargetIds.clear();

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
      salvo.phase = 'scheduled';
      salvo.delayTimer = Phaser.Math.FloatBetween(
        EVENT_CONFIG.salvo.delayMin,
        EVENT_CONFIG.salvo.delayMax,
      );
      salvo.warningTimer = EVENT_CONFIG.salvo.earlyWarningLeadTime;

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
      salvo.trackedTargetIds.clear();
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
    let warningArc: SalvoWarningArc | null = null;
    let playAlarmSound: boolean | undefined = undefined;

    // 1. Ожидание времени до включения раннего оповещения
    if (salvo.phase === 'scheduled') {
      salvo.delayTimer -= dt;
      if (
        salvo.delayTimer <= 0 &&
        context.targetsLeftInWave >= salvo.missilesLeftToSpawn
      ) {
        salvo.phase = 'warning';
        salvo.warningTimer = EVENT_CONFIG.salvo.earlyWarningLeadTime; // 2.0 секунды до появления ракет
        playAlarmSound = true; // За 2 секунды раньше звучит сигнал тревоги
      }
    }

    // 2. Фаза раннего предупреждения: тревожная дуга на границе радара и сигнал тревоги
    if (salvo.phase === 'warning') {
      warningArc = { angle: salvo.baseAngle, phase: 'warning' };
      salvo.warningTimer -= dt;
      if (salvo.warningTimer <= 0) {
        salvo.phase = 'spawning';
        salvo.launchTimer = 0; // Первый пуск немедленно по истечении 2 секунд
      }
    }

    // 3. Фаза активного веерного отстрела ракет пачки
    if (salvo.phase === 'spawning') {
      warningArc = { angle: salvo.baseAngle, phase: 'active' };
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
        target.isSalvo = true;
        salvo.trackedTargetIds.add(target.id);
        spawnedTargets.push(target);

        salvo.currentSalvoIndex++;
        salvo.missilesLeftToSpawn--;

        if (salvo.missilesLeftToSpawn > 0) {
          salvo.launchTimer = EVENT_CONFIG.salvo.intervalBetweenMissiles;
        } else {
          salvo.phase = 'tracking'; // Все ракеты вылетели, переходим к отслеживанию налёта
        }
      }
    }

    // 4. Фаза сопровождения налёта: мягкая красная дуга на границе сохраняется, пока ракеты не уничтожены
    if (salvo.phase === 'tracking') {
      const hasAliveMissiles = context.activeTargets.some((t) =>
        salvo.trackedTargetIds.has(t.id),
      );

      if (hasAliveMissiles) {
        warningArc = { angle: salvo.baseAngle, phase: 'active' };
      } else {
        // Все ракеты налёта уничтожены либо нейтрализованы — налёт пройден!
        salvo.phase = 'idle';
        salvo.trackedTargetIds.clear();
        warningArc = null;
      }
    }

    return {
      spawnedTargets,
      warningArc,
      playAlarmSound,
    };
  };

  return {
    reset,
    startWave,
    update,
  };
}
