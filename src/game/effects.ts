import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig';

/**
 * Конфигурация эффектов детонации, вспышек и ударных волн
 */
export const EXPLOSION_CONFIG = {
  flashDuration: 0.35, // быстрая вспышка люминофора (сек)
  waveDuration: 0.55, // время пробега ударной волны до края радара (сек)
  initialWaveRadius: 4, // стартовый радиус кольца волны (px)
  maxWaveRadiusFactor: 1.05, // коэффициент радиуса волны относительно radarRadius (~278 px)

  // Масштабы и яркость слоёв вспышки (множители относительно blipRadius)
  baseRadiusFactor: 2.3, // базовый размер ядра взрыва (~9.2 px при blipRadius = 4)
  haloRadiusFactor: 2.2, // внешний мягкий ореол (~20.2 px)
  haloAlphaFactor: 0.25,
  midRadiusFactor: 1.4, // промежуточная зона (~12.8 px)
  midAlphaFactor: 0.55,
  coreRadiusFactor: 1.0, // яркое ядро (~9.2 px)
  coreAlphaFactor: 0.95,

  // Параметры кольца ударной волны
  waveMaxAlpha: 0.85,
  waveLineWidthEarly: 2,
  waveLineWidthLate: 1,
  waveEarlyThreshold: 0.3, // доля времени, пока фронт волны имеет толщину 2px
} as const;

/**
 * Описание эффекта детонации / взрыва на радаре
 */
export interface ExplosionEffect {
  x: number;
  y: number;
  age: number; // время жизни в секундах
  flashDuration: number; // длительность яркой вспышки
  hasShockwave: boolean; // наличие кольца взрывной волны (false для ловушек)
  waveRadius: number; // текущий радиус волны
  maxWaveRadius: number; // предел распространения волны
  waveDuration: number; // длительность жизни волны
}

/**
 * Создание эффекта взрыва в точке поражения цели
 * @param x координата X на экране
 * @param y координата Y на экране
 * @param hasShockwave распространяется ли ударная волна (false для ловушки)
 */
export function createExplosion(
  x: number,
  y: number,
  hasShockwave: boolean,
): ExplosionEffect {
  return {
    x,
    y,
    age: 0,
    flashDuration: EXPLOSION_CONFIG.flashDuration,
    hasShockwave,
    waveRadius: EXPLOSION_CONFIG.initialWaveRadius,
    maxWaveRadius: GAME_CONFIG.radarRadius * EXPLOSION_CONFIG.maxWaveRadiusFactor,
    waveDuration: EXPLOSION_CONFIG.waveDuration,
  };
}

/**
 * Обновление физики и времени жизни эффектов взрыва
 */
export function updateExplosions(
  explosions: ExplosionEffect[],
  dt: number,
): void {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i];
    exp.age += dt;

    if (exp.hasShockwave) {
      const progress = Math.min(1, exp.age / exp.waveDuration);
      exp.waveRadius =
        EXPLOSION_CONFIG.initialWaveRadius +
        (exp.maxWaveRadius - EXPLOSION_CONFIG.initialWaveRadius) * progress;
    }

    // Завершение эффекта
    const maxLife = exp.hasShockwave ? exp.waveDuration : exp.flashDuration;
    if (exp.age >= maxLife) {
      explosions.splice(i, 1);
    }
  }
}

/**
 * Отрисовка взрывов и ударных волн на холсте радара (CRT Canvas 2D)
 */
export function renderExplosions(
  graphics: Phaser.GameObjects.Graphics,
  explosions: ExplosionEffect[],
): void {
  const { colors, blipRadius } = GAME_CONFIG;

  for (const exp of explosions) {
    // 1. Яркое и мягкое пятно света (вспышка люминофора)
    if (exp.age < exp.flashDuration) {
      const flashAlpha = 1 - exp.age / exp.flashDuration;

      // Базовый размер вспышки
      const baseRadius = blipRadius * EXPLOSION_CONFIG.baseRadiusFactor;

      // Внешний мягкий ореол, плавно уходящий в гамму радара
      graphics.fillStyle(colors.blipHalo, flashAlpha * EXPLOSION_CONFIG.haloAlphaFactor);
      graphics.fillCircle(exp.x, exp.y, baseRadius * EXPLOSION_CONFIG.haloRadiusFactor);

      // Средняя переходная зона вспышки
      graphics.fillStyle(colors.blipHalo, flashAlpha * EXPLOSION_CONFIG.midAlphaFactor);
      graphics.fillCircle(exp.x, exp.y, baseRadius * EXPLOSION_CONFIG.midRadiusFactor);

      // Яркое белое / салатовое ядро взрыва
      graphics.fillStyle(colors.blipCore, flashAlpha * EXPLOSION_CONFIG.coreAlphaFactor);
      graphics.fillCircle(exp.x, exp.y, baseRadius * EXPLOSION_CONFIG.coreRadiusFactor);
    }

    // 2. Кольцо ударной волны (только для ракет и кораблей)
    if (exp.hasShockwave && exp.age < exp.waveDuration) {
      const waveProgress = exp.age / exp.waveDuration;
      // Волна плавно истончается и растворяется по мере приближения к краю радара
      const waveAlpha = Math.max(0, (1 - waveProgress) * EXPLOSION_CONFIG.waveMaxAlpha);
      const lineWidth = waveProgress < EXPLOSION_CONFIG.waveEarlyThreshold
        ? EXPLOSION_CONFIG.waveLineWidthEarly
        : EXPLOSION_CONFIG.waveLineWidthLate;

      graphics.lineStyle(lineWidth, colors.beam, waveAlpha);
      graphics.strokeCircle(exp.x, exp.y, exp.waveRadius);
    }
  }
}
