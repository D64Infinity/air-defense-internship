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
   * Спавн стартовых целей в безопасном кольце (0.8..0.96 радиуса)
   */
  spawnInitialTargets: (count: number, wave: number) => GameTarget[];

  /**
   * Шаг таймера спавна текущей волны. Возвращает созданную цель или null, если спавн не произошел
   */
  update: (
    dt: number,
    wave: number,
    activeTargetsCount: number,
    targetsLeftInWave: number,
  ) => GameTarget | null;
}

/**
 * Фабрика изолированного модуля спавна целей
 */
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
      // Ракета летит строго по прямой в центр базы без манёвров
      heading = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
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
      decoyPassesThroughBase,
    };
  };

  const spawnInitialTargets = (count: number, wave: number): GameTarget[] => {
    const targets: GameTarget[] = [];
    for (let i = 0; i < count; i++) {
      const dist = Phaser.Math.FloatBetween(
        GAME_CONFIG.radarRadius * 0.8,
        GAME_CONFIG.radarRadius * 0.96,
      );
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      targets.push(
        createTarget(
          GAME_CONFIG.radarX + Math.cos(angle) * dist,
          GAME_CONFIG.radarY + Math.sin(angle) * dist,
          wave,
        ),
      );
    }
    return targets;
  };

  const spawnTargetAtEdge = (wave: number): GameTarget => {
    const spawnAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const spawnDist = GAME_CONFIG.radarRadius - 2;

    const x = GAME_CONFIG.radarX + Math.cos(spawnAngle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(spawnAngle) * spawnDist;

    return createTarget(x, y, wave);
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
    spawnInitialTargets,
    update,
  };
}
