import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type TargetType,
  type GameTarget,
} from './gameConfig';

/**
 * Конфигурация спавна целей, прогрессии волн и маневрирования
 */
export const SPAWNER_CONFIG = {
  initialSpawnTimer: 1.2, // начальная задержка перед первым спавном на старте волны (сек)
  edgeSpawnInset: 2, // базовый отступ спавна внутрь от кромки радара (px)
  maneuverSpawnInset: 4, // защитный отступ спавна маневрирующих ракет от кромки (px)

  // Увеличение скорости целей с ростом волн
  waveSpeedStep: 0.04, // +4% к скорости за каждую волну выше 1-й
  waveSpeedMaxBonus: 0.35, // максимальный прирост скорости (+35%)

  // Маневрирующие крылатые ракеты
  maneuverMinWave: 2, // минимальная волна появления маневра у ракет
  maneuverChance: 0.45, // 45% шанс маневрирующего профиля
  maneuverFlankMinRad: 0.95, // мин. угол бокового смещения (~55 градусов)
  maneuverFlankMaxRad: 1.3, // макс. угол бокового смещения (~75 градусов)
  maneuverTurnRate: 1.4, // угловая скорость доворота рулей (рад/сек, ~80 град/сек)
  maneuverDelayMin: 2.2, // мин. время до начала доворота (сек)
  maneuverDelayMax: 3.4, // макс. время до начала доворота (сек)

  // Корабли (бомбардировщики и союзники)
  aircraftTurnRateMin: 0.3, // ~17 град/сек
  aircraftTurnRateMax: 0.55, // ~31 град/сек
  aircraftManeuverDelayMin: 2.2,
  aircraftManeuverDelayMax: 4.2,

  // Ловушки (дипольные помехи / decoys)
  decoySpreadRadMin: -1.15, // разброс хордовых траекторий
  decoySpreadRadMax: 1.15,
  decoyPassBaseChance: 0.5, // 50% шанс пролёта через центр базы

  // Темп спавна между целями в волне
  spawnIntervalSpeedUpStep: 0.12, // ускорение темпа спавна на волну (сек)
  spawnIntervalSpeedUpMax: 1.2, // максимальное сокращение интервала (сек)
  spawnIntervalMinFloor: 1.6, // нижний предел минимального интервала спавна (сек)
  spawnIntervalMaxFloor: 2.6, // нижний предел максимального интервала спавна (сек)
} as const;

/**
 * Расчёт множителя скорости целей в зависимости от номера волны
 */
export function calculateWaveSpeedFactor(wave: number): number {
  return 1 + Math.min(
    SPAWNER_CONFIG.waveSpeedMaxBonus,
    (wave - 1) * SPAWNER_CONFIG.waveSpeedStep,
  );
}

/**
 * Интерфейс спавнера целей
 */
export interface TargetSpawner {
  /**
   * Сброс состояния спавнера (счётчик ID и таймер) при старте/рестарте
   */
  reset: () => void;

  /**
   * Шаг таймера спавна текущей волны. Возвращает созданную цель или null, если спавн не произошел
   */
  update: (
    dt: number,
    wave: number,
    activeTargetsCount: number,
    targetsLeftInWave: number,
  ) => GameTarget | null;

  /**
   * Спавн крылатой ракеты по заданному азимуту (для тактических событий, например залпов)
   */
  spawnMissileAtAngle: (angle: number, wave: number) => GameTarget;

  /**
   * Спавн маневрирующей крылатой ракеты с кастомным отклонением от центра и задержкой доворота
   */
  spawnManeuveringMissileAtAngle: (
    angle: number,
    flankOffsetRad: number,
    maneuverDelaySec: number,
    wave: number,
  ) => GameTarget;
}

/**
 * Фабрика изолированного модуля спавна целей
 */
export function createSpawner(): TargetSpawner {
  let nextTargetId = 1;
  let spawnTimer: number = SPAWNER_CONFIG.initialSpawnTimer;

  const reset = (): void => {
    nextTargetId = 1;
    spawnTimer = SPAWNER_CONFIG.initialSpawnTimer;
  };

  const pickRandomType = (): TargetType => {
    const types = Object.keys(GAME_CONFIG.targetTypes) as TargetType[];
    const totalWeight = types.reduce(
      (sum, t) => sum + GAME_CONFIG.targetTypes[t].weight,
      0,
    );
    let rnd = Phaser.Math.Between(1, totalWeight);

    for (const t of types) {
      rnd -= GAME_CONFIG.targetTypes[t].weight;
      if (rnd <= 0) return t;
    }
    return 'missile';
  };

  const createTarget = (x: number, y: number, wave: number): GameTarget => {
    const type = pickRandomType();
    const typeCfg = GAME_CONFIG.targetTypes[type];

    let heading: number;
    let decoyPassesThroughBase: boolean | undefined = undefined;
    let turnRate = 0;
    let maneuverTimer: number | undefined = undefined;
    let isManeuveringMissile: boolean | undefined = undefined;

    if (type === 'decoy') {
      // Ловушка движется по хордам (включая диаметральные диагонали через базу)
      const angleFromCenter = Math.atan2(y - GAME_CONFIG.radarY, x - GAME_CONFIG.radarX);
      const deltaAngle = Phaser.Math.FloatBetween(
        SPAWNER_CONFIG.decoySpreadRadMin,
        SPAWNER_CONFIG.decoySpreadRadMax,
      ); // хорды от центральных до боковых
      const exitAngle = angleFromCenter + Math.PI + deltaAngle;
      const exitX = GAME_CONFIG.radarX + Math.cos(exitAngle) * GAME_CONFIG.radarRadius;
      const exitY = GAME_CONFIG.radarY + Math.sin(exitAngle) * GAME_CONFIG.radarRadius;
      heading = Math.atan2(exitY - y, exitX - x);
      decoyPassesThroughBase = Math.random() < SPAWNER_CONFIG.decoyPassBaseChance;
    } else if (type === 'missile') {
      // Крылатая ракета имеет 2 профиля полёта:
      // 1. Стандартный: прямолинейный скоростной заход в центр базы
      // 2. Маневрирующий (со 2-й волны с шансом 45%): заход по фланговой дуге с последующим резким доворотом
      const isManeuver =
        wave >= SPAWNER_CONFIG.maneuverMinWave &&
        Math.random() < SPAWNER_CONFIG.maneuverChance;
      if (isManeuver) {
        isManeuveringMissile = true;
        const angleToCenter = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
        const sign = Math.random() < 0.5 ? 1 : -1;
        const flankOffset =
          Phaser.Math.FloatBetween(
            SPAWNER_CONFIG.maneuverFlankMinRad,
            SPAWNER_CONFIG.maneuverFlankMaxRad,
          ) * sign; // ~55..75 градусов в сторону
        heading = angleToCenter + flankOffset;

        // Скорость поворота рулей и таймер до выполнения доворота на базу
        turnRate = SPAWNER_CONFIG.maneuverTurnRate;
        maneuverTimer = Phaser.Math.FloatBetween(
          SPAWNER_CONFIG.maneuverDelayMin,
          SPAWNER_CONFIG.maneuverDelayMax,
        );
      } else {
        heading = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
      }
    } else {
      // Корабли (бомбардировщик и союзник): начинают под углом и могут довернуть
      const angleToCenter = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
      heading =
        angleToCenter +
        Phaser.Math.FloatBetween(-typeCfg.headingJitter, typeCfg.headingJitter);
      // Способность плавно маневрировать
      turnRate = Phaser.Math.FloatBetween(
        SPAWNER_CONFIG.aircraftTurnRateMin,
        SPAWNER_CONFIG.aircraftTurnRateMax,
      ); // ~17..31 град/сек
      maneuverTimer = Phaser.Math.FloatBetween(
        SPAWNER_CONFIG.aircraftManeuverDelayMin,
        SPAWNER_CONFIG.aircraftManeuverDelayMax,
      ); // секунды до принятия решения о довороте
    }

    const waveSpeedFactor = calculateWaveSpeedFactor(wave);
    const speed =
      Phaser.Math.FloatBetween(typeCfg.speedRange[0], typeCfg.speedRange[1]) *
      waveSpeedFactor;

    const signal = Math.round(
      Phaser.Math.FloatBetween(typeCfg.signalRange[0], typeCfg.signalRange[1]),
    );

    const vx = Math.cos(heading) * speed;
    const vy = Math.sin(heading) * speed;

    let headingDeg = Math.round(Phaser.Math.RadToDeg(heading));
    if (headingDeg < 0) headingDeg += 360;

    return {
      id: nextTargetId++,
      type,
      x,
      y,
      vx,
      vy,
      speed: Math.round(speed),
      headingDeg,
      headingRad: heading,
      targetHeadingRad: heading,
      turnRate,
      maneuverTimer,
      signal,
      alpha: 0,
      isManeuveringMissile,
      decoyPassesThroughBase,
    };
  };

  const spawnTargetAtEdge = (wave: number): GameTarget => {
    const spawnAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const spawnDist = GAME_CONFIG.radarRadius - SPAWNER_CONFIG.edgeSpawnInset;

    const x = GAME_CONFIG.radarX + Math.cos(spawnAngle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(spawnAngle) * spawnDist;

    return createTarget(x, y, wave);
  };

  const spawnMissileAtAngle = (angle: number, wave: number): GameTarget => {
    const spawnDist = GAME_CONFIG.radarRadius - SPAWNER_CONFIG.edgeSpawnInset;
    const x = GAME_CONFIG.radarX + Math.cos(angle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(angle) * spawnDist;

    const type = 'missile';
    const typeCfg = GAME_CONFIG.targetTypes.missile;
    const heading = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);

    const waveSpeedFactor = calculateWaveSpeedFactor(wave);
    const speed =
      Phaser.Math.FloatBetween(typeCfg.speedRange[0], typeCfg.speedRange[1]) *
      waveSpeedFactor;

    const signal = Math.round(
      Phaser.Math.FloatBetween(typeCfg.signalRange[0], typeCfg.signalRange[1]),
    );

    const vx = Math.cos(heading) * speed;
    const vy = Math.sin(heading) * speed;

    let headingDeg = Math.round(Phaser.Math.RadToDeg(heading));
    if (headingDeg < 0) headingDeg += 360;

    return {
      id: nextTargetId++,
      type,
      x,
      y,
      vx,
      vy,
      speed: Math.round(speed),
      headingDeg,
      headingRad: heading,
      targetHeadingRad: heading,
      turnRate: 0,
      signal,
      alpha: 0,
    };
  };

  const spawnManeuveringMissileAtAngle = (
    angle: number,
    flankOffsetRad: number,
    maneuverDelaySec: number,
    wave: number,
  ): GameTarget => {
    // Безопасный отступ от кромки, чтобы при фланговой дуге ракета не вылетала за границу радара
    const spawnDist = GAME_CONFIG.radarRadius - SPAWNER_CONFIG.maneuverSpawnInset;
    const x = GAME_CONFIG.radarX + Math.cos(angle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(angle) * spawnDist;

    const type = 'missile';
    const typeCfg = GAME_CONFIG.targetTypes.missile;
    const angleToCenter = Math.atan2(
      GAME_CONFIG.radarY - y,
      GAME_CONFIG.radarX - x,
    );
    const heading = angleToCenter + flankOffsetRad;

    const waveSpeedFactor = calculateWaveSpeedFactor(wave);
    const speed =
      Phaser.Math.FloatBetween(typeCfg.speedRange[0], typeCfg.speedRange[1]) *
      waveSpeedFactor;

    const signal = Math.round(
      Phaser.Math.FloatBetween(typeCfg.signalRange[0], typeCfg.signalRange[1]),
    );

    const vx = Math.cos(heading) * speed;
    const vy = Math.sin(heading) * speed;

    let headingDeg = Math.round(Phaser.Math.RadToDeg(heading));
    if (headingDeg < 0) headingDeg += 360;

    return {
      id: nextTargetId++,
      type,
      x,
      y,
      vx,
      vy,
      speed: Math.round(speed),
      headingDeg,
      headingRad: heading,
      targetHeadingRad: heading,
      turnRate: SPAWNER_CONFIG.maneuverTurnRate,
      maneuverTimer: maneuverDelaySec,
      isManeuveringMissile: true,
      signal,
      alpha: 0,
    };
  };

  const update = (
    dt: number,
    wave: number,
    activeTargetsCount: number,
    targetsLeftInWave: number,
  ): GameTarget | null => {
    if (targetsLeftInWave <= 0) return null;

    spawnTimer -= dt;
    const maxActive = GAME_CONFIG.maxActiveTargetsBase + Math.floor(wave / 2);

    if (spawnTimer <= 0) {
      const speedUp = Math.min(
        SPAWNER_CONFIG.spawnIntervalSpeedUpMax,
        (wave - 1) * SPAWNER_CONFIG.spawnIntervalSpeedUpStep,
      );
      spawnTimer = Phaser.Math.FloatBetween(
        Math.max(
          SPAWNER_CONFIG.spawnIntervalMinFloor,
          GAME_CONFIG.spawnIntervalMinBase - speedUp,
        ),
        Math.max(
          SPAWNER_CONFIG.spawnIntervalMaxFloor,
          GAME_CONFIG.spawnIntervalMaxBase - speedUp,
        ),
      );

      if (activeTargetsCount < maxActive) {
        return spawnTargetAtEdge(wave);
      }
    }

    return null;
  };

  return {
    reset,
    update,
    spawnMissileAtAngle,
    spawnManeuveringMissileAtAngle,
  };
}
