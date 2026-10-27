import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from './gameConfig';
import { renderExplosions, type ExplosionEffect } from './effects';

/**
 * Данные текущего кадра для отрисовки динамических объектов радара
 */
export interface RadarRenderData {
  beamAngle: number;
  baseFlashTimer: number;
  targets: GameTarget[];
  selectedTarget: GameTarget | null;
  isScanning: boolean;
  scanningTarget: GameTarget | null;
  timeNow: number;
  explosions: ExplosionEffect[];
}

/**
 * Интерфейс управления рендером радара
 */
export interface RadarRender {
  staticGraphics: Phaser.GameObjects.Graphics;
  dynamicGraphics: Phaser.GameObjects.Graphics;
  renderStaticGrid: () => void;
  renderDynamic: (data: RadarRenderData) => void;
}

/**
 * Фабрика рендера экрана радара (статическая сетка и динамические слои)
 */
export function createRadarRender(scene: Phaser.Scene): RadarRender {
  const staticGraphics = scene.add.graphics();
  const dynamicGraphics = scene.add.graphics();

  /**
   * Отрисовка постоянной фоновой сетки радара
   */
  const renderStaticGrid = (): void => {
    const { radarX, radarY, radarRadius, colors } = GAME_CONFIG;

    staticGraphics.clear();
    staticGraphics.fillStyle(colors.radarBg, 0.88);
    staticGraphics.fillCircle(radarX, radarY, radarRadius);

    // Кольца дальности (25%, 50%, 75%, 100%)
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ringSteps.forEach((fraction, index) => {
      const isOuter = index === ringSteps.length - 1;
      staticGraphics.lineStyle(
        isOuter ? 2 : 1,
        colors.gridRing,
        isOuter ? 0.9 : 0.2,
      );
      staticGraphics.strokeCircle(radarX, radarY, radarRadius * fraction);
    });

    // Зона ближней опасности (danger close ring)
    staticGraphics.lineStyle(1, colors.dangerRing, 0.3);
    staticGraphics.strokeCircle(radarX, radarY, 70);

    // Оси
    staticGraphics.lineStyle(1, colors.gridAxis, 0.22);
    staticGraphics.beginPath();
    staticGraphics.moveTo(radarX - radarRadius, radarY);
    staticGraphics.lineTo(radarX + radarRadius, radarY);
    staticGraphics.moveTo(radarX, radarY - radarRadius);
    staticGraphics.lineTo(radarX, radarY + radarRadius);
    staticGraphics.strokePath();

    // Засечки по окружности
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = Phaser.Math.DegToRad(deg);
      const isMajor = deg % 90 === 0;
      const tickLength = isMajor ? 10 : 5;

      const x1 = radarX + Math.cos(rad) * (radarRadius - tickLength);
      const y1 = radarY + Math.sin(rad) * (radarRadius - tickLength);
      const x2 = radarX + Math.cos(rad) * radarRadius;
      const y2 = radarY + Math.sin(rad) * radarRadius;

      staticGraphics.lineStyle(1, colors.gridRing, isMajor ? 0.7 : 0.3);
      staticGraphics.beginPath();
      staticGraphics.moveTo(x1, y1);
      staticGraphics.lineTo(x2, y2);
      staticGraphics.strokePath();
    }
  };

  /**
   * Отрисовка динамических объектов радара (каждый кадр)
   */
  const renderDynamic = (data: RadarRenderData): void => {
    const { radarX, radarY, radarRadius, colors, trailSteps, trailAngle, blipRadius } =
      GAME_CONFIG;

    dynamicGraphics.clear();

    // 1. Шлейф луча
    for (let i = 0; i < trailSteps; i++) {
      const a1 = data.beamAngle - (trailAngle * (trailSteps - i)) / trailSteps;
      const a2 = data.beamAngle - (trailAngle * (trailSteps - (i + 1))) / trailSteps;
      const sliceAlpha = (i / trailSteps) * 0.22;

      dynamicGraphics.fillStyle(colors.trail, sliceAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(radarX, radarY);
      dynamicGraphics.arc(radarX, radarY, radarRadius, a1, a2, false);
      dynamicGraphics.closePath();
      dynamicGraphics.fillPath();
    }

    // 2. Линия луча
    const beamEndX = radarX + Math.cos(data.beamAngle) * radarRadius;
    const beamEndY = radarY + Math.sin(data.beamAngle) * radarRadius;

    dynamicGraphics.lineStyle(2, colors.beam, 0.95);
    dynamicGraphics.beginPath();
    dynamicGraphics.moveTo(radarX, radarY);
    dynamicGraphics.lineTo(beamEndX, beamEndY);
    dynamicGraphics.strokePath();

    // 3. Маркер базы в центре (вспыхивает красным при уроне)
    const baseColor = data.baseFlashTimer > 0 ? 0xef4444 : colors.gridRing;
    dynamicGraphics.lineStyle(1.8, baseColor, 0.95);
    dynamicGraphics.strokeCircle(radarX, radarY, 8);
    dynamicGraphics.fillStyle(baseColor, 0.95);
    dynamicGraphics.fillCircle(radarX, radarY, 3);

    // 4. Метки целей (люминофор)
    for (const target of data.targets) {
      if (target.alpha > 0.02) {
        dynamicGraphics.fillStyle(colors.blipHalo, target.alpha * 0.38);
        dynamicGraphics.fillCircle(target.x, target.y, blipRadius * 2.4);

        dynamicGraphics.fillStyle(colors.blipCore, target.alpha);
        dynamicGraphics.fillCircle(target.x, target.y, blipRadius);
      }

      // Индикатор опознанной цели (сканирование)
      if (target.isScanned) {
        const typeCfg = GAME_CONFIG.targetTypes[target.type];
        const tagColor =
          typeCfg.category === 'threat'
            ? 0xef4444
            : typeCfg.category === 'friend'
              ? 0x22c55e
              : 0x94a3b8;
        dynamicGraphics.lineStyle(1.2, tagColor, 0.85);
        dynamicGraphics.strokeCircle(target.x, target.y, blipRadius * 2.6);
      }

      // Тактическая окантовка оператора (союзник / помеха) с угасанием люминофора
      if (target.markedAs && target.alpha > 0.02) {
        const markColor = target.markedAs === 'friend' ? 0x22c55e : 0x94a3b8;
        dynamicGraphics.lineStyle(1.4, markColor, target.alpha * 0.9);
        dynamicGraphics.strokeCircle(target.x, target.y, blipRadius * 3.4);
      }
    }

    // 5. Анимация сканирования сигнатуры
    if (data.isScanning && data.scanningTarget) {
      const { x, y } = data.scanningTarget;
      const pulse = 16 + Math.sin(data.timeNow * 0.015) * 3;
      dynamicGraphics.lineStyle(1.5, colors.scanCyan, 0.9);
      dynamicGraphics.strokeCircle(x, y, pulse);

      const rot = (data.timeNow * 0.005) % (Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2;
        dynamicGraphics.beginPath();
        dynamicGraphics.moveTo(
          x + Math.cos(a) * (pulse - 4),
          y + Math.sin(a) * (pulse - 4),
        );
        dynamicGraphics.lineTo(
          x + Math.cos(a) * (pulse + 4),
          y + Math.sin(a) * (pulse + 4),
        );
        dynamicGraphics.strokePath();
      }
    }

    // 6. Маркер захвата выбранной цели [ · ]
    if (data.selectedTarget) {
      const { x, y } = data.selectedTarget;
      const s = 11;
      dynamicGraphics.lineStyle(1.5, colors.selectedBox, 0.95);

      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(x - s, y - s + 4);
      dynamicGraphics.lineTo(x - s, y - s);
      dynamicGraphics.lineTo(x - s + 4, y - s);
      dynamicGraphics.moveTo(x + s - 4, y - s);
      dynamicGraphics.lineTo(x + s, y - s);
      dynamicGraphics.lineTo(x + s, y - s + 4);
      dynamicGraphics.moveTo(x - s, y + s - 4);
      dynamicGraphics.lineTo(x - s, y + s);
      dynamicGraphics.lineTo(x - s + 4, y + s);
      dynamicGraphics.moveTo(x + s - 4, y + s);
      dynamicGraphics.lineTo(x + s, y + s);
      dynamicGraphics.lineTo(x + s, y + s - 4);
      dynamicGraphics.strokePath();
    }

    // 7. Эффекты взрывов и ударных волн
    renderExplosions(dynamicGraphics, data.explosions);
  };

  // Отрисовываем сетку сразу при создании
  renderStaticGrid();

  return {
    staticGraphics,
    dynamicGraphics,
    renderStaticGrid,
    renderDynamic,
  };
}
