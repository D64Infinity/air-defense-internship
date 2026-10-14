import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig';

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
    flashDuration: 0.35, // быстрая вспышка люминофора (0.35 сек)
    hasShockwave,
    waveRadius: 4,
    maxWaveRadius: GAME_CONFIG.radarRadius * 1.05, // уходит за пределы радара (~278 px)
    waveDuration: 0.55, // волна проносится за 0.55 сек (~500 px/сек)
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
      exp.waveRadius = 4 + (exp.maxWaveRadius - 4) * progress;
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

      // Базовый размер в 2-2.5 раза больше обычной метки
      const baseRadius = blipRadius * 2.3; // ~9.2 px

      // Внешний мягкий ореол, плавно уходящий в гамму радара
      graphics.fillStyle(colors.blipHalo, flashAlpha * 0.25);
      graphics.fillCircle(exp.x, exp.y, baseRadius * 2.2);

      // Средняя переходная зона вспышки
      graphics.fillStyle(colors.blipHalo, flashAlpha * 0.55);
      graphics.fillCircle(exp.x, exp.y, baseRadius * 1.4);

      // Яркое белое / салатовое ядро взрыва
      graphics.fillStyle(colors.blipCore, flashAlpha * 0.95);
      graphics.fillCircle(exp.x, exp.y, baseRadius);
    }

    // 2. Кольцо ударной волны (только для ракет и кораблей)
    if (exp.hasShockwave && exp.age < exp.waveDuration) {
      const waveProgress = exp.age / exp.waveDuration;
      // Волна плавно истончается и растворяется по мере приближения к краю радара
      const waveAlpha = Math.max(0, (1 - waveProgress) * 0.85);
      const lineWidth = waveProgress < 0.3 ? 2 : 1;

      graphics.lineStyle(lineWidth, colors.beam, waveAlpha);
      graphics.strokeCircle(exp.x, exp.y, exp.waveRadius);
    }
  }
}
