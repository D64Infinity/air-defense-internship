import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from './gameConfig';
import { renderExplosions, type ExplosionEffect } from './effects';

/**
 * Данные текущего кадра для отрисовки динамических объектов радара
 */
export interface RadarRenderData {
  baseFlashTimer: number;
  targets: GameTarget[];
  selectedTarget: GameTarget | null;
  isScanning: boolean;
  scanningTarget: GameTarget | null;
  timeNow: number;
  explosions: ExplosionEffect[];
}

/**
 * Интерфейс управления рендером и развёрткой луча радара
 */
export interface RadarRender {
  staticGraphics: Phaser.GameObjects.Graphics;
  dynamicGraphics: Phaser.GameObjects.Graphics;
  readonly beamAngle: number;
  readonly currentBeamSpeed: number;
  reset: () => void;
  setWaveSpeed: (wave: number) => void;
  updateBeam: (dt: number, targets?: GameTarget[]) => void;
  renderStaticGrid: () => void;
  renderDynamic: (data: RadarRenderData) => void;
}

/**
 * Опции конфигурации и коллбэков рендера радара
 */
export interface RadarRenderOptions {
  onTargetSwept?: (target: GameTarget) => void;
}

/**
 * Описание микро-помехи / тепловой засветки люминофора ЭЛТ
 */
interface CrtNoiseSpeck {
  x: number;
  y: number;
  age: number;
  maxLife: number;
  size: number;
  maxAlpha: number;
}

/**
 * Фабрика рендера экрана радара (статическая сетка, луч и динамические слои)
 */
export function createRadarRender(
  scene: Phaser.Scene,
  options?: RadarRenderOptions,
): RadarRender {
  const staticGraphics = scene.add.graphics();
  const dynamicGraphics = scene.add.graphics();

  let beamAngle = 0;
  let currentBeamSpeed = GAME_CONFIG.beamSpeedBase;
  const crtSpecks: CrtNoiseSpeck[] = [];

  const isAngleBetween = (target: number, from: number, to: number): boolean => {
    if (to >= from) return target >= from && target <= to;
    return target >= from || target <= to;
  };

  /**
   * Обновление угла развёртки луча, фосфорная засветка целей и микро-помехи ЭЛТ
   */
  const updateBeam = (dt: number, targets: GameTarget[] = []): void => {
    const prevAngle = beamAngle;
    const twoPi = Math.PI * 2;
    beamAngle = (beamAngle + currentBeamSpeed * dt) % twoPi;

    for (const target of targets) {
      const dx = target.x - GAME_CONFIG.radarX;
      const dy = target.y - GAME_CONFIG.radarY;
      const dist = Math.hypot(dx, dy);

      if (dist <= GAME_CONFIG.radarRadius) {
        let targetAngle = Math.atan2(dy, dx);
        if (targetAngle < 0) targetAngle += twoPi;

        if (isAngleBetween(targetAngle, prevAngle, beamAngle)) {
          target.alpha = 1.0;
          options?.onTargetSwept?.(target);
        }
      }
    }

    // Обновление и затухание активных микро-помех люминофора
    for (let i = crtSpecks.length - 1; i >= 0; i--) {
      const s = crtSpecks[i];
      s.age += dt;
      if (s.age >= s.maxLife) {
        crtSpecks.splice(i, 1);
      }
    }

    // Генерация микро-помех в шлейфе проходящего луча
    const noiseCfg = GAME_CONFIG.crtNoise;
    if (crtSpecks.length < noiseCfg.maxSpecks && Math.random() < noiseCfg.spawnChancePerFrame) {
      const count = 1 + (Math.random() < 0.45 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        if (crtSpecks.length >= noiseCfg.maxSpecks) break;
        const angle = beamAngle - Math.random() * (GAME_CONFIG.trailAngle * 0.85);
        // Смещение плотности к внешним кольцам экрана (где уровень сигнала слабее)
        const radiusNorm =
          noiseCfg.minRadiusFraction +
          (1 - noiseCfg.minRadiusFraction) * Math.sqrt(Math.random());
        const r = radiusNorm * (GAME_CONFIG.radarRadius - 6);
        const x = GAME_CONFIG.radarX + Math.cos(angle) * r;
        const y = GAME_CONFIG.radarY + Math.sin(angle) * r;
        const maxLife =
          noiseCfg.speckLifeMin +
          Math.random() * (noiseCfg.speckLifeMax - noiseCfg.speckLifeMin);
        const size = 1.2 + Math.random() * 0.9; // Тонкое зерно 1.2 - 2.1 px
        const maxAlpha =
          noiseCfg.minAlpha +
          Math.random() * (noiseCfg.maxAlpha - noiseCfg.minAlpha);

        crtSpecks.push({ x, y, age: 0, maxLife, size, maxAlpha });
      }
    }
  };

  /**
   * Корректировка скорости вращения луча с ростом номера волны
   */
  const setWaveSpeed = (wave: number): void => {
    currentBeamSpeed =
      GAME_CONFIG.beamSpeedBase * Math.min(1.85, 1 + (wave - 1) * 0.09);
  };

  const reset = (): void => {
    beamAngle = 0;
    currentBeamSpeed = GAME_CONFIG.beamSpeedBase;
    crtSpecks.length = 0;
  };

  /**
   * Отрисовка постоянной фоновой сетки радара
   */
  const renderStaticGrid = (): void => {
    const { radarX, radarY, radarRadius, colors } = GAME_CONFIG;

    staticGraphics.clear();
    staticGraphics.fillStyle(colors.radarBg, 0.88);
    staticGraphics.fillCircle(radarX, radarY, radarRadius);

    // Растр строк кинескопа (CRT Scanlines)
    const scanlineStep = GAME_CONFIG.crtNoise.scanlineStep;
    const scanlineAlpha = GAME_CONFIG.crtNoise.scanlineAlpha;
    staticGraphics.lineStyle(1, 0x000000, scanlineAlpha);
    for (
      let y = radarY - radarRadius + scanlineStep;
      y < radarY + radarRadius;
      y += scanlineStep
    ) {
      const dy = y - radarY;
      const halfW = Math.sqrt(radarRadius * radarRadius - dy * dy);
      staticGraphics.beginPath();
      staticGraphics.moveTo(radarX - halfW, y);
      staticGraphics.lineTo(radarX + halfW, y);
      staticGraphics.strokePath();
    }

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
      const a1 = beamAngle - (trailAngle * (trailSteps - i)) / trailSteps;
      const a2 = beamAngle - (trailAngle * (trailSteps - (i + 1))) / trailSteps;
      const sliceAlpha = (i / trailSteps) * 0.22;

      dynamicGraphics.fillStyle(colors.trail, sliceAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(radarX, radarY);
      dynamicGraphics.arc(radarX, radarY, radarRadius, a1, a2, false);
      dynamicGraphics.closePath();
      dynamicGraphics.fillPath();
    }

    // 2. Линия луча
    const beamEndX = radarX + Math.cos(beamAngle) * radarRadius;
    const beamEndY = radarY + Math.sin(beamAngle) * radarRadius;

    dynamicGraphics.lineStyle(2, colors.beam, 0.95);
    dynamicGraphics.beginPath();
    dynamicGraphics.moveTo(radarX, radarY);
    dynamicGraphics.lineTo(beamEndX, beamEndY);
    dynamicGraphics.strokePath();

    // 2.1. Микро-помехи и тепловой шум люминофора ЭЛТ (CRT Phosphor Noise)
    for (const speck of crtSpecks) {
      const progress = speck.age / speck.maxLife;
      // Быстрое угасание микро-искры люминофора
      const alpha = speck.maxAlpha * Math.pow(1 - progress, 2.2);
      if (alpha > 0.015) {
        dynamicGraphics.fillStyle(colors.trail, alpha);
        dynamicGraphics.fillRect(
          speck.x - speck.size * 0.5,
          speck.y - speck.size * 0.5,
          speck.size,
          speck.size,
        );
      }
    }

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

      // Индикатор опознанной цели (сканирование) в виде ромбика с воздушным зазором до метки юнита
      if (target.isScanned && target.alpha > 0.02) {
        const typeCfg = GAME_CONFIG.targetTypes[target.type];
        const tagColor =
          typeCfg.category === 'threat'
            ? 0xef4444
            : typeCfg.category === 'friend'
              ? 0x22c55e
              : 0x94a3b8;
        const size = 18;
        dynamicGraphics.lineStyle(2, tagColor, target.alpha * 0.95);
        dynamicGraphics.beginPath();
        dynamicGraphics.moveTo(target.x, target.y - size);
        dynamicGraphics.lineTo(target.x + size, target.y);
        dynamicGraphics.lineTo(target.x, target.y + size);
        dynamicGraphics.lineTo(target.x - size, target.y);
        dynamicGraphics.closePath();
        dynamicGraphics.strokePath();
      }

      // Тактическая окантовка оператора (союзник / помеха) в виде квадрата с угасанием люминофора
      if (target.markedAs && target.alpha > 0.02) {
        const markColor = target.markedAs === 'friend' ? 0x22c55e : 0x94a3b8;
        const b = 21;
        dynamicGraphics.lineStyle(1.5, markColor, target.alpha * 0.9);
        dynamicGraphics.strokeRect(target.x - b, target.y - b, b * 2, b * 2);
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
      const s = 15;
      dynamicGraphics.lineStyle(1.5, colors.selectedBox, 0.95);

      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(x - s, y - s + 5);
      dynamicGraphics.lineTo(x - s, y - s);
      dynamicGraphics.lineTo(x - s + 5, y - s);
      dynamicGraphics.moveTo(x + s - 5, y - s);
      dynamicGraphics.lineTo(x + s, y - s);
      dynamicGraphics.lineTo(x + s, y - s + 5);
      dynamicGraphics.moveTo(x - s, y + s - 5);
      dynamicGraphics.lineTo(x - s, y + s);
      dynamicGraphics.lineTo(x - s + 5, y + s);
      dynamicGraphics.moveTo(x + s - 5, y + s);
      dynamicGraphics.lineTo(x + s, y + s);
      dynamicGraphics.lineTo(x + s, y + s - 5);
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
    get beamAngle() {
      return beamAngle;
    },
    get currentBeamSpeed() {
      return currentBeamSpeed;
    },
    reset,
    setWaveSpeed,
    updateBeam,
    renderStaticGrid,
    renderDynamic,
  };
}
