import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type TargetType,
  type GameTarget,
} from './gameConfig';

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
/** Защитный отступ спавна (px) от кромки радара, предотвращающий мгновенный выход дуговых ракет за радиус отсечения */
const MANEUVER_SPAWN_RADAR_INSET = 4;

export function createSpawner(): TargetSpawner {
  let nextTargetId = 1;
  let spawnTimer = 1.2;

  const reset = (): void => {
    nextTargetId = 1;
    spawnTimer = 1.2;
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
      const deltaAngle = Phaser.Math.FloatBetween(-1.15, 1.15); // хорды от центральных до боковых
      const exitAngle = angleFromCenter + Math.PI + deltaAngle;
      const exitX = GAME_CONFIG.radarX + Math.cos(exitAngle) * GAME_CONFIG.radarRadius;
      const exitY = GAME_CONFIG.radarY + Math.sin(exitAngle) * GAME_CONFIG.radarRadius;
      heading = Math.atan2(exitY - y, exitX - x);
      decoyPassesThroughBase = Math.random() < 0.5;
    } else if (type === 'missile') {
      // Крылатая ракета имеет 2 профиля полёта:
      // 1. Стандартный: прямолинейный скоростной заход в центр базы
      // 2. Маневрирующий (со 2-й волны с шансом 45%): заход по фланговой дуге с последующим резким доворотом
      const isManeuver = wave >= 2 && Math.random() < 0.45;
      if (isManeuver) {
        isManeuveringMissile = true;
        const angleToCenter = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
        const sign = Math.random() < 0.5 ? 1 : -1;
        const flankOffset = Phaser.Math.FloatBetween(0.95, 1.3) * sign; // ~55..75 градусов в сторону
        heading = angleToCenter + flankOffset;

        // Скорость поворота рулей и таймер до выполнения доворота на базу
        turnRate = 1.4;
        maneuverTimer = Phaser.Math.FloatBetween(2.2, 3.4);
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
      turnRate = Phaser.Math.FloatBetween(0.3, 0.55); // ~17..31 град/сек
      maneuverTimer = Phaser.Math.FloatBetween(2.2, 4.2); // секунды до принятия решения о довороте
    }

    const waveSpeedFactor = 1 + Math.min(0.35, (wave - 1) * 0.04);
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
    const spawnDist = GAME_CONFIG.radarRadius - 2;

    const x = GAME_CONFIG.radarX + Math.cos(spawnAngle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(spawnAngle) * spawnDist;

    return createTarget(x, y, wave);
  };

  const spawnMissileAtAngle = (angle: number, wave: number): GameTarget => {
    const spawnDist = GAME_CONFIG.radarRadius - 2;
    const x = GAME_CONFIG.radarX + Math.cos(angle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(angle) * spawnDist;

    const type = 'missile';
    const typeCfg = GAME_CONFIG.targetTypes.missile;
    const heading = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);

    const waveSpeedFactor = 1 + Math.min(0.35, (wave - 1) * 0.04);
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
    const spawnDist = GAME_CONFIG.radarRadius - MANEUVER_SPAWN_RADAR_INSET;
    const x = GAME_CONFIG.radarX + Math.cos(angle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(angle) * spawnDist;

    const type = 'missile';
    const typeCfg = GAME_CONFIG.targetTypes.missile;
    const angleToCenter = Math.atan2(
      GAME_CONFIG.radarY - y,
      GAME_CONFIG.radarX - x,
    );
    const heading = angleToCenter + flankOffsetRad;

    const waveSpeedFactor = 1 + Math.min(0.35, (wave - 1) * 0.04);
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
      turnRate: 1.4,
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
      const speedUp = Math.min(1.2, (wave - 1) * 0.12);
      spawnTimer = Phaser.Math.FloatBetween(
        Math.max(1.6, GAME_CONFIG.spawnIntervalMinBase - speedUp),
        Math.max(2.6, GAME_CONFIG.spawnIntervalMaxBase - speedUp),
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
