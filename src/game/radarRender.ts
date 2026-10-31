import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from './gameConfig';
import {
  renderExplosions,
  type ExplosionEffect,
} from './effects';
import {
  renderInterceptors,
  type InterceptorUnit,
} from './interceptor';

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
  interceptors: readonly InterceptorUnit[];
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
  const twoPi = Math.PI * 2;

  /**
   * Кратчайшая угловая разность a - b в диапазоне [-PI, PI]
   */
  const angleDiff = (a: number, b: number): number => {
    let diff = (a - b) % twoPi;
    if (diff > Math.PI) diff -= twoPi;
    if (diff < -Math.PI) diff += twoPi;
    return diff;
  };

  /**
   * Проверка пересечения сектора прохода луча [from, to] (по часовой стрелке)
   * с диском цели с учётом её физического углового радиуса на текущей дистанции
   */
  const beamIntersectsTarget = (
    from: number,
    to: number,
    targetAngle: number,
    angularRadius: number,
  ): boolean => {
    const sweepSpan = (to - from + twoPi) % twoPi;
    const midAngle = (from + sweepSpan * 0.5) % twoPi;
    const dAngle = Math.abs(angleDiff(targetAngle, midAngle));
    return dAngle <= sweepSpan * 0.5 + angularRadius;
  };

  /**
   * Обновление угла развёртки луча, фосфорная засветка целей и микро-помехи ЭЛТ
   */
  const updateBeam = (dt: number, targets: GameTarget[] = []): void => {
    const prevAngle = beamAngle;
    beamAngle = (beamAngle + currentBeamSpeed * dt) % twoPi;

    for (const target of targets) {
      const dx = target.x - GAME_CONFIG.radarX;
      const dy = target.y - GAME_CONFIG.radarY;
      const dist = Math.hypot(dx, dy);

      // Цель в пределах экрана радара (с запасом на физический радиус метки)
      if (dist <= GAME_CONFIG.radarRadius + GAME_CONFIG.blipRadius) {
        let targetAngle = Math.atan2(dy, dx);
        if (targetAngle < 0) targetAngle += twoPi;

        // Физический угловой полурадиус метки цели на текущей дистанции от центра (с допуском на скорость)
        const angularRadius = Math.asin(
          Math.min(1.0, (GAME_CONFIG.blipRadius + 2) / Math.max(10, dist)),
        );

        if (beamIntersectsTarget(prevAngle, beamAngle, targetAngle, angularRadius)) {
          // Защита от дублирования звука: пинг только при свежем проходе луча
          const isFreshSweep = target.alpha < 0.90;
          target.alpha = 1.0;
          if (isFreshSweep) {
            options?.onTargetSwept?.(target);
          }
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

    // Кольца дальности (25%, 50%, 75%, 100%)
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ringSteps.forEach((fraction, index) => {
      const isOuter = index === ringSteps.length - 1;
      staticGraphics.lineStyle(
        isOuter ? 2 : 1,
        isOuter ? colors.radarBorder : colors.gridRing,
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

    // 0. Динамическая рябь строк кинескопа (CRT Scanline Drift)
    const {
      scanlineStep,
      scanlineAlpha,
      scanlineSpeed,
      humBarSpeed,
      humBarHeight,
      humBarWaveInterval,
      humBarWaveDuration,
      humBarWaveWidth,
      humBarWaveAmplitude,
      humBarWaveSpatialFreq,
    } = GAME_CONFIG.crtNoise;

    const timeSec = data.timeNow * 0.001;
    const scanlineOffset = (timeSec * scanlineSpeed) % scanlineStep;
    const minY = radarY - radarRadius;
    const maxY = radarY + radarRadius;

    // Плавно скользящие микро-строки ЭЛТ
    dynamicGraphics.lineStyle(1, 0x000000, scanlineAlpha);
    dynamicGraphics.beginPath();
    for (let y = minY + scanlineOffset; y < maxY; y += scanlineStep) {
      const dy = y - radarY;
      if (Math.abs(dy) >= radarRadius) continue;
      const halfW = Math.sqrt(radarRadius * radarRadius - dy * dy);
      dynamicGraphics.moveTo(radarX - halfW, y);
      dynamicGraphics.lineTo(radarX + halfW, y);
    }
    dynamicGraphics.strokePath();

    // 0.1. Мягкая волна вертикальной развёртки (CRT Hum Bar) + бегущая синусоидальная волна колебания линий
    const cycleDistance = radarRadius * 2 + humBarHeight;
    const humBarCenterY =
      minY + ((timeSec * humBarSpeed) % cycleDistance) - humBarHeight * 0.5;
    const humBarTop = humBarCenterY - humBarHeight * 0.5;
    const humBarBottom = humBarCenterY + humBarHeight * 0.5;

    // Параметры бегущей слева направо волны
    const waveCycleTime = timeSec % humBarWaveInterval;
    const isWaveActive = waveCycleTime < humBarWaveDuration;
    let waveCenterX = -9999;
    if (isWaveActive) {
      const progress = waveCycleTime / humBarWaveDuration;
      const waveStartX = radarX - radarRadius - humBarWaveWidth;
      const waveEndX = radarX + radarRadius + humBarWaveWidth;
      waveCenterX = waveStartX + (waveEndX - waveStartX) * progress;
    }

    for (let y = humBarTop; y <= humBarBottom; y += scanlineStep * 2) {
      if (y < minY || y > maxY) continue;
      const dy = y - radarY;
      if (Math.abs(dy) >= radarRadius) continue;
      const halfW = Math.sqrt(radarRadius * radarRadius - dy * dy);
      const xLeft = radarX - halfW;
      const xRight = radarX + halfW;

      // Колоколообразный профиль яркости пачки по вертикали (мягкие края)
      const normY = (y - humBarCenterY) / (humBarHeight * 0.5);
      const vertAlpha = 0.055 * Math.cos(normY * (Math.PI * 0.44));

      // Проверяем, пересекает ли бегущий волновой цуг текущую линию
      const segStart = isWaveActive
        ? Math.max(xLeft, waveCenterX - humBarWaveWidth)
        : 0;
      const segEnd = isWaveActive
        ? Math.min(xRight, waveCenterX + humBarWaveWidth)
        : 0;
      const hasActiveWaveOnLine = isWaveActive && segStart < segEnd;

      // 1. Отрисовка непрерывной физической линии развёртки (с синусоидальным волновым изгибом)
      dynamicGraphics.lineStyle(2, colors.trail, vertAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(xLeft, y);

      if (!hasActiveWaveOnLine) {
        // Линия в покое — прямая струна
        dynamicGraphics.lineTo(xRight, y);
      } else {
        // Линия сама по себе физически колеблется синусоидальной волной, бегущей слева направо
        if (segStart > xLeft) {
          dynamicGraphics.lineTo(segStart, y);
        }

        const stepX = 6;
        for (let x = segStart; x <= segEnd; x += stepX) {
          const dx = x - waveCenterX;
          const w = Math.cos((dx / humBarWaveWidth) * (Math.PI * 0.5));
          const wProfile = w * w;
          const waveOffset =
            Math.sin(dx * humBarWaveSpatialFreq) *
            (humBarWaveAmplitude * wProfile);
          dynamicGraphics.lineTo(x, y + waveOffset);
        }

        if (segEnd < xRight) {
          dynamicGraphics.lineTo(segEnd, y);
          dynamicGraphics.lineTo(xRight, y);
        }
      }
      dynamicGraphics.strokePath();

      // 2. Мягкое градиентное усиление яркости люминофора в центре волны (без резких границ)
      if (hasActiveWaveOnLine) {
        const glowStepX = 14;
        for (let x = segStart; x < segEnd; x += glowStepX) {
          const nextX = Math.min(segEnd, x + glowStepX);
          const midDx = x + (nextX - x) * 0.5 - waveCenterX;
          const w = Math.max(
            0,
            Math.cos((midDx / humBarWaveWidth) * (Math.PI * 0.5)),
          );
          // Кубический спад гарантирует абсолютно бесшовный сход в 0 на краях пакета
          const glowAlpha = 0.024 * (w * w * w);

          if (glowAlpha > 0.002) {
            // Тот же родной зелёный цвет люминофора (colors.trail), без чужеродной белизны
            dynamicGraphics.lineStyle(2, colors.trail, glowAlpha);
            dynamicGraphics.beginPath();

            const dx1 = x - waveCenterX;
            const w1 = Math.cos((dx1 / humBarWaveWidth) * (Math.PI * 0.5));
            const y1 =
              y +
              Math.sin(dx1 * humBarWaveSpatialFreq) *
                (humBarWaveAmplitude * w1 * w1);

            const dx2 = nextX - waveCenterX;
            const w2 = Math.cos((dx2 / humBarWaveWidth) * (Math.PI * 0.5));
            const y2 =
              y +
              Math.sin(dx2 * humBarWaveSpatialFreq) *
                (humBarWaveAmplitude * w2 * w2);

            dynamicGraphics.moveTo(x, y1);
            dynamicGraphics.lineTo(nextX, y2);
            dynamicGraphics.strokePath();
          }
        }
      }
    }

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

      // Тактический маркер цели в захвате ПВО (ракета уже летит)
      if (target.isTargeted && target.alpha > 0.02) {
        const lockColor = 0xf59e0b; // янтарный цвет активного перехвата
        const s = 14;
        dynamicGraphics.lineStyle(1.5, lockColor, target.alpha * 0.95);
        dynamicGraphics.beginPath();
        // Угловые скобки захвата
        dynamicGraphics.moveTo(target.x - s, target.y - s + 4);
        dynamicGraphics.lineTo(target.x - s, target.y - s);
        dynamicGraphics.lineTo(target.x - s + 4, target.y - s);
        dynamicGraphics.moveTo(target.x + s - 4, target.y - s);
        dynamicGraphics.lineTo(target.x + s, target.y - s);
        dynamicGraphics.lineTo(target.x + s, target.y - s + 4);
        dynamicGraphics.moveTo(target.x - s, target.y + s - 4);
        dynamicGraphics.lineTo(target.x - s, target.y + s);
        dynamicGraphics.lineTo(target.x - s + 4, target.y + s);
        dynamicGraphics.moveTo(target.x + s - 4, target.y + s);
        dynamicGraphics.lineTo(target.x + s, target.y + s);
        dynamicGraphics.lineTo(target.x + s, target.y + s - 4);
        dynamicGraphics.strokePath();
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

    // 6.5. Ракеты-перехватчики ПВО и инверсионные следы
    renderInterceptors(dynamicGraphics, data.interceptors);

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
