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
    wave4PlusMinCount: 3, // 3 ракеты (шанс 50%) на 4+ волнах
    wave4PlusMaxCount: 4, // 4 ракеты (шанс 50%) на 4+ волнах
    wave4PlusCount: 3, // Базовое значение для обратной совместимости
    fanSpreadRad: 0.09, // Угловой веерный разброс траекторий (~5 градусов)
    startChanceWave4: 0.10, // 10% вероятность на первой проверке (волна 4)
  },
  general: {
    maneuverSwarm: {
      minWave: 4, // Доступно с 4-й волны
      chance: 0.12, // Фиксированный шанс 12%
      bannerTitle: 'ОСОБЫЙ СЕКТОР',
      bannerSubtitle: '[ МАНЕВРЕННЫЙ ПРОРЫВ: 3 ЭШЕЛОНА ]',
      startCreditsGrant: 900, // Начальная субсидия ПВО (+900 CR на закупку ракет)
      creditsRewardMultiplier: 1.25, // Множитель награды кредитов за волну при отражении прорыва
      echelon1Delay: 2.5, // Время до запуска 1-го захода (сек)
      interEchelonPause: 3.0, // Передышка между заходами для закупки ракет (сек)
      warningLeadTime: 2.0, // Время тревоги перед каждым заходом (сек)
      echelonCount: 3, // Количество эшелонов
      missilesPerEchelon: 6, // Количество ракет в каждом эшелоне
      totalMissiles: 18, // 3 захода по 6 ракет = 18 ракет всего
    },
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
 * Результат старта волны для менеджера событий
 */
export interface TacticalWaveStartResult {
  isSpecialWave: boolean;
  specialWaveTargetsCount?: number;
  bannerTitle?: string;
  bannerSubtitle?: string;
  creditsGrant?: number;
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
  startWave: (wave: number, targetsLeftInWave: number) => TacticalWaveStartResult;
  isSpecialWaveActive: () => boolean;
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
 * Внутреннее состояние генерального события «Манёвренный прорыв» (Maneuver Swarm Wave)
 */
type ManeuverSwarmStep =
  | 'idle'
  | 'delay_echelon_1'
  | 'warning_echelon_1'
  | 'active_echelon_1'
  | 'pause_between_1_2'
  | 'warning_echelon_2'
  | 'active_echelon_2'
  | 'pause_between_2_3'
  | 'warning_echelon_3'
  | 'active_echelon_3'
  | 'done';

interface ManeuverSwarmState {
  active: boolean;
  step: ManeuverSwarmStep;
  timer: number;
  baseAngle1: number;
  baseAngle2: number;
  baseAngle3: number;
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

  let swarm: ManeuverSwarmState = {
    active: false,
    step: 'idle',
    timer: 0,
    baseAngle1: 0,
    baseAngle2: 0,
    baseAngle3: 0,
    trackedTargetIds: new Set<number>(),
  };

  const reset = (): void => {
    salvo.phase = 'idle';
    salvo.missilesLeftToSpawn = 0;
    salvo.trackedTargetIds.clear();
    wavesSinceLastSalvo = 0;

    swarm.active = false;
    swarm.step = 'idle';
    swarm.timer = 0;
    swarm.trackedTargetIds.clear();
  };

  const isSpecialWaveActive = (): boolean => {
    return swarm.active && swarm.step !== 'done' && swarm.step !== 'idle';
  };

  /**
   * Инициализация событий в начале новой волны
   */
  const startWave = (
    wave: number,
    targetsLeftInWave: number,
  ): TacticalWaveStartResult => {
    salvo.phase = 'idle';
    salvo.missilesLeftToSpawn = 0;
    salvo.trackedTargetIds.clear();

    swarm.active = false;
    swarm.step = 'idle';
    swarm.trackedTargetIds.clear();

    // 1. Оценка генерального события: «Манёвренный прорыв» (с 4-й волны с фиксированным шансом 12%)
    const isManeuverSwarm =
      wave >= EVENT_CONFIG.general.maneuverSwarm.minWave &&
      Math.random() < EVENT_CONFIG.general.maneuverSwarm.chance;

    if (isManeuverSwarm) {
      swarm.active = true;
      swarm.step = 'delay_echelon_1';
      swarm.timer = EVENT_CONFIG.general.maneuverSwarm.echelon1Delay;
      swarm.baseAngle1 = Phaser.Math.FloatBetween(0, Math.PI * 2);
      swarm.baseAngle2 = Phaser.Math.FloatBetween(0, Math.PI * 2);
      swarm.baseAngle3 = Phaser.Math.FloatBetween(0, Math.PI * 2);
      swarm.trackedTargetIds.clear();

      // В особую генеральную волну прогрессивный залп взаимно исключается
      return {
        isSpecialWave: true,
        specialWaveTargetsCount:
          EVENT_CONFIG.general.maneuverSwarm.totalMissiles,
        bannerTitle: `ВОЛНА ${wave}: ${EVENT_CONFIG.general.maneuverSwarm.bannerTitle}`,
        bannerSubtitle: EVENT_CONFIG.general.maneuverSwarm.bannerSubtitle,
        creditsGrant: EVENT_CONFIG.general.maneuverSwarm.startCreditsGrant,
      };
    }

    // 2. Оценка прогрессивного события: «Массированный залп» (доступно с 3-й волны)
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
        wave === EVENT_CONFIG.salvo.minWave
          ? EVENT_CONFIG.salvo.wave3Count
          : Math.random() < 0.5
            ? EVENT_CONFIG.salvo.wave4PlusMinCount
            : EVENT_CONFIG.salvo.wave4PlusMaxCount;

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

    return {
      isSpecialWave: false,
    };
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

    // A. Обработка генерального ивента («Манёвренный прорыв» — особая волна из 3 эшелонов по 6 ракет)
    if (swarm.active) {
      switch (swarm.step) {
        case 'delay_echelon_1': {
          swarm.timer -= dt;
          if (swarm.timer <= 0) {
            swarm.step = 'warning_echelon_1';
            swarm.timer = EVENT_CONFIG.general.maneuverSwarm.warningLeadTime;
            playAlarmSound = true;
          }
          break;
        }

        case 'warning_echelon_1': {
          warningArc = { angle: swarm.baseAngle1, phase: 'warning' };
          swarm.timer -= dt;
          if (swarm.timer <= 0) {
            swarm.step = 'active_echelon_1';

            // Эшелон 1: «Двойные Клещи» (3 ракеты с левого крыла + 3 ракеты с правого крыла)
            const offsetsLeft = [
              { ang: -0.62, flank: 0.78, delay: 2.4 },
              { ang: -0.55, flank: 0.88, delay: 2.7 },
              { ang: -0.48, flank: 0.98, delay: 3.0 },
            ];
            for (const p of offsetsLeft) {
              const m = spawner.spawnManeuveringMissileAtAngle(
                swarm.baseAngle1 + p.ang,
                p.flank,
                p.delay,
                context.wave,
              );
              m.isSalvo = true;
              swarm.trackedTargetIds.add(m.id);
              spawnedTargets.push(m);
            }

            const offsetsRight = [
              { ang: 0.48, flank: -0.98, delay: 3.0 },
              { ang: 0.55, flank: -0.88, delay: 2.7 },
              { ang: 0.62, flank: -0.78, delay: 2.4 },
            ];
            for (const p of offsetsRight) {
              const m = spawner.spawnManeuveringMissileAtAngle(
                swarm.baseAngle1 + p.ang,
                p.flank,
                p.delay,
                context.wave,
              );
              m.isSalvo = true;
              swarm.trackedTargetIds.add(m.id);
              spawnedTargets.push(m);
            }
          }
          break;
        }

        case 'active_echelon_1': {
          warningArc = { angle: swarm.baseAngle1, phase: 'active' };

          const hasAlive = context.activeTargets.some((t) =>
            swarm.trackedTargetIds.has(t.id),
          );

          if (!hasAlive && spawnedTargets.length === 0) {
            // Первый эшелон отбит! 6-секундная передышка для закупки ракет
            swarm.trackedTargetIds.clear();
            swarm.step = 'pause_between_1_2';
            swarm.timer = EVENT_CONFIG.general.maneuverSwarm.interEchelonPause;
            warningArc = null;
          }
          break;
        }

        case 'pause_between_1_2': {
          swarm.timer -= dt;
          if (swarm.timer <= 0) {
            swarm.step = 'warning_echelon_2';
            swarm.timer = EVENT_CONFIG.general.maneuverSwarm.warningLeadTime;
            playAlarmSound = true;
          }
          break;
        }

        case 'warning_echelon_2': {
          warningArc = { angle: swarm.baseAngle2, phase: 'warning' };
          swarm.timer -= dt;
          if (swarm.timer <= 0) {
            swarm.step = 'active_echelon_2';

            // Эшелон 2: «Шестиструнный Каскадный Серп» (6 ракет ступенчатой спиральной лентой)
            for (let i = 0; i < 6; i++) {
              const ang = swarm.baseAngle2 - 0.35 + i * 0.14;
              const flank = 0.68 + i * 0.055; // 0.68 .. 0.955 rad (строго безопасно внутри радара)
              const delay = 1.9 + i * 0.26; // каскадный доворот от 1.9с до 3.2с
              const m = spawner.spawnManeuveringMissileAtAngle(
                ang,
                flank,
                delay,
                context.wave,
              );
              m.isSalvo = true;
              swarm.trackedTargetIds.add(m.id);
              spawnedTargets.push(m);
            }
          }
          break;
        }

        case 'active_echelon_2': {
          warningArc = { angle: swarm.baseAngle2, phase: 'active' };

          const hasAlive = context.activeTargets.some((t) =>
            swarm.trackedTargetIds.has(t.id),
          );

          if (!hasAlive && spawnedTargets.length === 0) {
            // Второй эшелон отбит! Вторая передышка для закупки ракет
            swarm.trackedTargetIds.clear();
            swarm.step = 'pause_between_2_3';
            swarm.timer = EVENT_CONFIG.general.maneuverSwarm.interEchelonPause;
            warningArc = null;
          }
          break;
        }

        case 'pause_between_2_3': {
          swarm.timer -= dt;
          if (swarm.timer <= 0) {
            swarm.step = 'warning_echelon_3';
            swarm.timer = EVENT_CONFIG.general.maneuverSwarm.warningLeadTime;
            playAlarmSound = true;
          }
          break;
        }

        case 'warning_echelon_3': {
          warningArc = { angle: swarm.baseAngle3, phase: 'warning' };
          swarm.timer -= dt;
          if (swarm.timer <= 0) {
            swarm.step = 'active_echelon_3';

            // Эшелон 3: «Сходящийся Трезубец» (2 ракеты слева + 2 по центру + 2 справа = 6 ракет)
            const tridentWings = [
              // Левое крыло (2 ракеты)
              { ang: -0.6, flank: 0.86, delay: 2.6 },
              { ang: -0.52, flank: 0.92, delay: 2.9 },
              // Центральная пара (2 ракеты)
              { ang: -0.08, flank: 0.3, delay: 2.1 },
              { ang: 0.08, flank: -0.3, delay: 2.1 },
              // Правое крыло (2 ракеты)
              { ang: 0.52, flank: -0.92, delay: 2.9 },
              { ang: 0.6, flank: -0.86, delay: 2.6 },
            ];
            for (const p of tridentWings) {
              const m = spawner.spawnManeuveringMissileAtAngle(
                swarm.baseAngle3 + p.ang,
                p.flank,
                p.delay,
                context.wave,
              );
              m.isSalvo = true;
              swarm.trackedTargetIds.add(m.id);
              spawnedTargets.push(m);
            }
          }
          break;
        }

        case 'active_echelon_3': {
          warningArc = { angle: swarm.baseAngle3, phase: 'active' };

          const hasAlive = context.activeTargets.some((t) =>
            swarm.trackedTargetIds.has(t.id),
          );

          if (!hasAlive && spawnedTargets.length === 0) {
            // Третий эшелон отбит — вся особая волна полностью завершена!
            swarm.trackedTargetIds.clear();
            swarm.step = 'done';
            swarm.active = false;
            warningArc = null;
          }
          break;
        }

        case 'done':
        default: {
          break;
        }
      }

      return {
        spawnedTargets,
        warningArc,
        playAlarmSound,
      };
    }

    // B. Обработка прогрессивного события («Массированный залп»)
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
        } else if (salvo.totalSalvoSize === 3) {
          if (salvo.currentSalvoIndex === 0) {
            angleOffset = -EVENT_CONFIG.salvo.fanSpreadRad;
          } else if (salvo.currentSalvoIndex === 1) {
            angleOffset = EVENT_CONFIG.salvo.fanSpreadRad;
          } else {
            angleOffset = 0;
          }
        } else if (salvo.totalSalvoSize === 4) {
          // Для 4 ракет: фланги, затем внутренняя пара (равномерный веер с шагом fanSpreadRad)
          const spread = EVENT_CONFIG.salvo.fanSpreadRad;
          const offsets4 = [-1.5 * spread, 1.5 * spread, -0.5 * spread, 0.5 * spread];
          angleOffset = offsets4[salvo.currentSalvoIndex] ?? 0;
        } else {
          // Симметричный веер для произвольного N
          const half = (salvo.totalSalvoSize - 1) / 2;
          angleOffset =
            (salvo.currentSalvoIndex - half) * EVENT_CONFIG.salvo.fanSpreadRad;
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
    isSpecialWaveActive,
    update,
  };
}
