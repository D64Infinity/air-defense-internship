import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from './gameConfig';
import {
  renderExplosions,
  type ExplosionEffect,
} from './effects';
import {
  renderInterceptors,
  type InterceptorUnit,
  type SweeperDroneManager,
  type DogfightRescueManager,
  type BarrageSalvoManager,
  type JammerAircraftManager,
  type TerrainHuggerManager,
  type SupersonicReconManager,
  type WeatherFrontManager,
} from './units';
import {
  type ActiveWaveModifier,
  isPointInBlindSector,
  WAVE_MODIFIERS_CONFIG,
} from './waveModifiers';

/**
 * Стадия ненавязчивой экранной подсказки СУО на куполе радара
 */
export type OnboardingStage = 'none' | 'acquire';

/**
 * Параметры экранного целеуказателя СУО для первых секунд сессии
 */
const RADAR_ONBOARDING_CONFIG = {
  ringMinRadius: 10, // минимальный радиус сходящейся воронки (px)
  ringMaxRadius: 28, // стартовый радиус воронки (px)
  ringPeriodSec: 1.15, // период одного сходящегося импульса (сек)
  reticleInner: 12, // внутренний край 4 направляющих рисок (px)
  reticleOuter: 18, // внешний край 4 направляющих рисок (px)
  elbowOffset: 16, // вылет наклонного колена выноски (px)
  shelfLength: 92, // минимальная ширина горизонтальной полки выноски (px)
  acquireText: '▸ ЗАХВАТ ЦЕЛИ',
} as const;

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
  sweeperDrone?: SweeperDroneManager;
  dogfightRescue?: DogfightRescueManager;
  barrageSalvo?: BarrageSalvoManager;
  jammerAircraft?: JammerAircraftManager;
  terrainHugger?: TerrainHuggerManager;
  supersonicRecon?: SupersonicReconManager;
  weatherFront?: WeatherFrontManager;
  waveModifier?: ActiveWaveModifier | null;
  abilityPulseProgress?: number | null;
  abilityStasisActive?: boolean;
  abilityEmpProgress?: number | null;
  abilityDomeRemaining?: number;
  warningArc?: { angle: number; phase: 'warning' | 'active' } | null;
  onboardingStage?: OnboardingStage;
}

/**
 * Интерфейс управления рендером и развёрткой луча радара
 */
export interface RadarRender {
  staticGraphics: Phaser.GameObjects.Graphics;
  dynamicGraphics: Phaser.GameObjects.Graphics;
  readonly beamAngle: number;
  readonly beamDirection: 1 | -1;
  readonly currentBeamSpeed: number;
  reset: () => void;
  setWaveSpeed: (
    wave: number,
    modifier?: { direction?: 1 | -1; speedMultiplier?: number } | null,
  ) => void;
  updateBeam: (dt: number, targets?: GameTarget[]) => void;
  renderStaticGrid: () => void;
  renderDynamic: (data: RadarRenderData) => void;
  setVisible: (visible: boolean) => void;
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
  const hintLabelText = scene.add.text(0, 0, RADAR_ONBOARDING_CONFIG.acquireText, {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: '10px',
    color: '#fde047',
    fontStyle: 'bold',
    letterSpacing: 1,
    resolution: GAME_CONFIG.textResolution,
  });
  hintLabelText.setDepth(5);
  hintLabelText.setVisible(false);

  let beamAngle = 0;
  let currentBeamSpeed = GAME_CONFIG.beamSpeedBase;
  let currentBeamDirection: 1 | -1 = 1;
  const crtSpecks: CrtNoiseSpeck[] = [];
  const twoPi = Math.PI * 2;

  // Состояние плавного отображения тактической дуги налёта на границе радара
  const arcDisplayState = {
    angle: 0,
    alpha: 0,
    phase: 'warning' as 'warning' | 'active',
  };
  let lastDynamicTime = 0;

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
    direction: 1 | -1,
  ): boolean => {
    const sweepSpan =
      direction >= 0 ? (to - from + twoPi) % twoPi : (from - to + twoPi) % twoPi;
    const midAngle =
      direction >= 0
        ? (from + sweepSpan * 0.5) % twoPi
        : ((from - sweepSpan * 0.5) % twoPi + twoPi) % twoPi;
    const dAngle = Math.abs(angleDiff(targetAngle, midAngle));
    return dAngle <= sweepSpan * 0.5 + angularRadius;
  };

  /**
   * Обновление угла развёртки луча, фосфорная засветка целей и микро-помехи ЭЛТ
   */
  const updateBeam = (dt: number, targets: GameTarget[] = []): void => {
    const prevAngle = beamAngle;
    beamAngle =
      ((beamAngle + currentBeamSpeed * currentBeamDirection * dt) % twoPi + twoPi) %
      twoPi;

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

        if (
          beamIntersectsTarget(
            prevAngle,
            beamAngle,
            targetAngle,
            angularRadius,
            currentBeamDirection,
          )
        ) {
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
        const angle =
          beamAngle -
          currentBeamDirection * Math.random() * (GAME_CONFIG.trailAngle * 0.85);
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
   * Корректировка скорости и направления вращения луча на волне
   */
  const setWaveSpeed = (
    wave: number,
    modifier?: { direction?: 1 | -1; speedMultiplier?: number } | null,
  ): void => {
    currentBeamDirection = modifier?.direction ?? 1;
    const modMult = modifier?.speedMultiplier ?? 1;
    currentBeamSpeed =
      GAME_CONFIG.beamSpeedBase *
      Math.min(1.85, 1 + (wave - 1) * 0.09) *
      modMult;
  };

  const reset = (): void => {
    beamAngle = 0;
    currentBeamSpeed = GAME_CONFIG.beamSpeedBase;
    currentBeamDirection = 1;
    crtSpecks.length = 0;
    arcDisplayState.alpha = 0;
    lastDynamicTime = 0;
    hintLabelText.setVisible(false);
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
    staticGraphics.strokeCircle(radarX, radarY, GAME_CONFIG.dangerCloseRadius);

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
    dynamicGraphics.lineStyle(1, colors.scanline, scanlineAlpha);
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

    // 1. Шлейф луча (учитывает направление вращения по/против часовой)
    for (let i = 0; i < trailSteps; i++) {
      const d1 = (trailAngle * (trailSteps - i)) / trailSteps;
      const d2 = (trailAngle * (trailSteps - (i + 1))) / trailSteps;
      const a1 = currentBeamDirection >= 0 ? beamAngle - d1 : beamAngle + d2;
      const a2 = currentBeamDirection >= 0 ? beamAngle - d2 : beamAngle + d1;
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

    // 2.2. Мягкая красная тактическая дуга на границе радара (сопровождение налёта)
    const dtDynamic =
      lastDynamicTime > 0
        ? Math.min(0.1, (data.timeNow - lastDynamicTime) / 1000)
        : 0.016;
    lastDynamicTime = data.timeNow;

    if (data.warningArc) {
      arcDisplayState.angle = data.warningArc.angle;
      arcDisplayState.phase = data.warningArc.phase;
      arcDisplayState.alpha = Math.min(
        1,
        arcDisplayState.alpha + dtDynamic * 5.0,
      );
    } else {
      arcDisplayState.alpha = Math.max(
        0,
        arcDisplayState.alpha - dtDynamic * 2.5,
      );
    }

    if (arcDisplayState.alpha > 0.01) {
      const { angle, phase, alpha } = arcDisplayState;
      const isEarlyWarning = phase === 'warning';

      // Пульсация: напряженная предпусковая (в первые 2 секунды) или спокойное зловещее дыхание во время полёта
      const pulse = isEarlyWarning
        ? 0.7 + 0.3 * Math.sin(data.timeNow * 0.018)
        : 0.75 + 0.25 * Math.sin(data.timeNow * 0.007);

      const effectiveAlpha = alpha * pulse;
      const arcHalf = 0.44; // Дуга ~50 градусов по периметру радара
      const aStart = angle - arcHalf;
      const aEnd = angle + arcHalf;

      // 1. Внешний мягкий ореол люминофора по кромке радара (толщина 6px)
      dynamicGraphics.lineStyle(6, colors.dangerRing, 0.22 * effectiveAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.arc(radarX, radarY, radarRadius - 1.5, aStart, aEnd, false);
      dynamicGraphics.strokePath();

      // 2. Основная чёткая линия дуги на границе (толщина 2.5px)
      const rimAlpha = Math.min(
        0.95,
        (isEarlyWarning ? 0.9 : 0.78) * effectiveAlpha,
      );
      dynamicGraphics.lineStyle(2.5, colors.dangerRing, rimAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.arc(radarX, radarY, radarRadius - 1.5, aStart, aEnd, false);
      dynamicGraphics.strokePath();

      // 3. Деликатный внутренний полумесяц свечения люминофора (только у самой кромки: от 0.93R до R)
      dynamicGraphics.fillStyle(colors.dangerRing, 0.08 * effectiveAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.arc(radarX, radarY, radarRadius - 1.5, aStart, aEnd, false);
      dynamicGraphics.arc(radarX, radarY, radarRadius * 0.93, aEnd, aStart, true);
      dynamicGraphics.closePath();
      dynamicGraphics.fillPath();

      // 4. Тонкие боковые насечки-риски на концах дуги (длина 7px)
      dynamicGraphics.lineStyle(1.5, colors.dangerRing, 0.55 * effectiveAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(
        radarX + Math.cos(aStart) * (radarRadius * 0.95),
        radarY + Math.sin(aStart) * (radarRadius * 0.95),
      );
      dynamicGraphics.lineTo(
        radarX + Math.cos(aStart) * (radarRadius - 1.5),
        radarY + Math.sin(aStart) * (radarRadius - 1.5),
      );
      dynamicGraphics.moveTo(
        radarX + Math.cos(aEnd) * (radarRadius * 0.95),
        radarY + Math.sin(aEnd) * (radarRadius * 0.95),
      );
      dynamicGraphics.lineTo(
        radarX + Math.cos(aEnd) * (radarRadius - 1.5),
        radarY + Math.sin(aEnd) * (radarRadius - 1.5),
      );
      dynamicGraphics.strokePath();

      // 5. Аккуратный тактический шеврон опасности (направлен внутрь сектора к базе)
      const chevDist = radarRadius - 12;
      const cx = radarX + Math.cos(angle) * chevDist;
      const cy = radarY + Math.sin(angle) * chevDist;
      const chevSize = 7;
      const nx = -Math.cos(angle);
      const ny = -Math.sin(angle);
      const px = -ny;
      const py = nx;

      dynamicGraphics.fillStyle(colors.dangerRing, 0.85 * effectiveAlpha);
      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(cx + nx * chevSize, cy + ny * chevSize);
      dynamicGraphics.lineTo(
        cx - nx * (chevSize * 0.6) + px * (chevSize * 0.8),
        cy - ny * (chevSize * 0.6) + py * (chevSize * 0.8),
      );
      dynamicGraphics.lineTo(
        cx - nx * (chevSize * 0.6) - px * (chevSize * 0.8),
        cy - ny * (chevSize * 0.6) - py * (chevSize * 0.8),
      );
      dynamicGraphics.closePath();
      dynamicGraphics.fillPath();
    }

    // 3. Маркер базы в центре (вспыхивает красным при уроне)
    const baseColor = data.baseFlashTimer > 0 ? colors.dangerRing : colors.gridRing;
    dynamicGraphics.lineStyle(1.8, baseColor, 0.95);
    dynamicGraphics.strokeCircle(radarX, radarY, 8);
    dynamicGraphics.fillStyle(baseColor, 0.95);
    dynamicGraphics.fillCircle(radarX, radarY, 3);

    // 3.5. Конус радиопомех самолёта РЭБ («Шумовой Строб»)
    data.jammerAircraft?.render(dynamicGraphics);

    // 3.6. Ионизационный грозовой фронт (Rain Clutter, молнии и вторичное эхо целей)
    data.weatherFront?.render(dynamicGraphics);
    data.weatherFront?.renderGhostEchoes(dynamicGraphics, data.targets);

    // 3.7. Мёртвый сектор (активный модификатор волны: 90° зона статических помех)
    const mod = data.waveModifier;
    if (
      mod?.hasBlindSector &&
      mod.blindSectorStartAngle !== undefined &&
      mod.blindSectorSpanRad !== undefined
    ) {
      const a0 = mod.blindSectorStartAngle;
      const a1 = a0 + mod.blindSectorSpanRad;
      const innerR = GAME_CONFIG.baseRadius + 12;

      dynamicGraphics.fillStyle(0xf97316, 0.075);
      dynamicGraphics.beginPath();
      dynamicGraphics.arc(radarX, radarY, radarRadius, a0, a1, false);
      dynamicGraphics.arc(radarX, radarY, innerR, a1, a0, true);
      dynamicGraphics.closePath();
      dynamicGraphics.fillPath();

      dynamicGraphics.lineStyle(1.4, 0xf97316, 0.48);
      dynamicGraphics.beginPath();
      dynamicGraphics.moveTo(radarX + Math.cos(a0) * innerR, radarY + Math.sin(a0) * innerR);
      dynamicGraphics.lineTo(radarX + Math.cos(a0) * radarRadius, radarY + Math.sin(a0) * radarRadius);
      dynamicGraphics.moveTo(radarX + Math.cos(a1) * innerR, radarY + Math.sin(a1) * innerR);
      dynamicGraphics.lineTo(radarX + Math.cos(a1) * radarRadius, radarY + Math.sin(a1) * radarRadius);
      dynamicGraphics.strokePath();

      for (const frac of [0.42, 0.68, 0.92]) {
        const arcR = radarRadius * frac;
        dynamicGraphics.lineStyle(1, 0xfb923c, 0.22);
        dynamicGraphics.beginPath();
        dynamicGraphics.arc(radarX, radarY, arcR, a0, a1, false);
        dynamicGraphics.strokePath();
      }

      for (let i = 0; i < 10; i++) {
        const ra = a0 + Math.random() * mod.blindSectorSpanRad;
        const rr = innerR + Math.random() * (radarRadius - innerR - 4);
        dynamicGraphics.fillStyle(0xfdba74, 0.14 + Math.random() * 0.22);
        dynamicGraphics.fillRect(
          radarX + Math.cos(ra) * rr,
          radarY + Math.sin(ra) * rr,
          2,
          2,
        );
      }
    }

    // 3.8. Эффекты активных спецспособностей (Крио-стазис, РЛС-импульс, ЭМИ-волна)
    if (data.abilityStasisActive) {
      dynamicGraphics.fillStyle(0x06b6d4, 0.06);
      dynamicGraphics.fillCircle(radarX, radarY, radarRadius);
      dynamicGraphics.lineStyle(2, 0x67e8f9, 0.42);
      dynamicGraphics.strokeCircle(radarX, radarY, radarRadius - 2);
    }

    if (
      data.abilityPulseProgress !== null &&
      data.abilityPulseProgress !== undefined
    ) {
      const p = data.abilityPulseProgress;
      const pr = Math.max(8, p * radarRadius);
      const pa = Math.max(0, 1 - p * 0.85);
      dynamicGraphics.lineStyle(6, 0x38bdf8, 0.22 * pa);
      dynamicGraphics.strokeCircle(radarX, radarY, pr);
      dynamicGraphics.lineStyle(2.2, 0xe0f2fe, 0.92 * pa);
      dynamicGraphics.strokeCircle(radarX, radarY, pr);
    }

    if (
      data.abilityEmpProgress !== null &&
      data.abilityEmpProgress !== undefined
    ) {
      const p = data.abilityEmpProgress;
      const er = Math.max(10, p * radarRadius);
      const ea = Math.max(0, 1 - p * 0.85);
      dynamicGraphics.lineStyle(7, 0xa855f7, 0.24 * ea);
      dynamicGraphics.strokeCircle(radarX, radarY, er);
      dynamicGraphics.lineStyle(2.4, 0xf3e8ff, 0.95 * ea);
      dynamicGraphics.strokeCircle(radarX, radarY, er);
    }

    if (data.abilityDomeRemaining && data.abilityDomeRemaining > 0) {
      const domeR = GAME_CONFIG.dangerCloseRadius;
      const pulse = 0.72 + 0.28 * Math.sin(data.timeNow * 0.012);
      const lowFade =
        data.abilityDomeRemaining < 1.2
          ? 0.45 + 0.55 * Math.abs(Math.sin(data.timeNow * 0.024))
          : 1;
      const alphaScale = pulse * lowFade;

      dynamicGraphics.fillStyle(0xfacc15, 0.065 * alphaScale);
      dynamicGraphics.fillCircle(radarX, radarY, domeR);

      dynamicGraphics.lineStyle(5, 0xfacc15, 0.16 * alphaScale);
      dynamicGraphics.strokeCircle(radarX, radarY, domeR);
      dynamicGraphics.lineStyle(2, 0xfef08a, 0.88 * alphaScale);
      dynamicGraphics.strokeCircle(radarX, radarY, domeR);

      // 4 вращающиеся дуги-сегменты силового барьера
      const rot = data.timeNow * 0.0018;
      dynamicGraphics.lineStyle(2.6, 0x38bdf8, 0.75 * alphaScale);
      for (let i = 0; i < 4; i++) {
        const a0 = rot + (Math.PI / 2) * i;
        dynamicGraphics.beginPath();
        dynamicGraphics.arc(radarX, radarY, domeR + 3, a0, a0 + 0.45, false);
        dynamicGraphics.strokePath();
      }
    }

    // 4. Метки целей (люминофор)
    for (const target of data.targets) {
      // Самолёт РЭБ, штурмовик ПМВ и сверхзвуковой разведчик отрисовываются собственными менеджерами
      if (target.isJammer || target.isTerrainHugger || target.isRecon) continue;

      // Проверка на экранирование конусом помех РЭБ
      const isJammed = data.jammerAircraft?.isTargetJammed(target);
      if (isJammed) {
        // Цель скрыта в шуме РЭБ: мерцающий микро-шум вместо чёткой боевой метки
        if (target.alpha > 0.05 && Math.random() < 0.28) {
          const jx = target.x + (Math.random() - 0.5) * 6;
          const jy = target.y + (Math.random() - 0.5) * 6;
          dynamicGraphics.fillStyle(colors.blipHalo, target.alpha * 0.15);
          dynamicGraphics.fillCircle(jx, jy, 1.4);
        }
        continue;
      }

      const inBlindSector = isPointInBlindSector(mod, target.x, target.y);
      const baseAlpha = inBlindSector
        ? Math.min(target.alpha, WAVE_MODIFIERS_CONFIG.blindSectorMaxAlpha)
        : target.alpha;
      const renderAlpha =
        inBlindSector && Math.random() < 0.25 ? baseAlpha * 0.45 : baseAlpha;

      if (renderAlpha > 0.02) {
        dynamicGraphics.fillStyle(colors.blipHalo, renderAlpha * 0.38);
        dynamicGraphics.fillCircle(target.x, target.y, blipRadius * 2.4);

        dynamicGraphics.fillStyle(colors.blipCore, renderAlpha);
        dynamicGraphics.fillCircle(target.x, target.y, blipRadius);
      }

      // Индикатор опознанной цели (сканирование) в виде ромбика с воздушным зазором до метки юнита
      if (target.isScanned && target.alpha > 0.02) {
        const typeCfg = GAME_CONFIG.targetTypes[target.type];
        const tagColor =
          typeCfg.category === 'threat'
            ? colors.tagThreat
            : typeCfg.category === 'friend'
              ? colors.tagFriend
              : colors.tagNeutral;
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
        const markColor =
          target.markedAs === 'friend' ? colors.markFriend : colors.markIgnore;
        const b = 21;
        dynamicGraphics.lineStyle(1.5, markColor, target.alpha * 0.9);
        dynamicGraphics.strokeRect(target.x - b, target.y - b, b * 2, b * 2);
      }

      // Тактический маркер цели в захвате ПВО (ракета уже летит)
      if (target.isTargeted && target.alpha > 0.02) {
        const lockColor = colors.targetLocked; // янтарный цвет активного перехвата
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

    // 6.7. Декоративный дрон зачистки ложных целей
    data.sweeperDrone?.render(dynamicGraphics);

    // 6.8. Воздушный бой и спасение союзника
    data.dogfightRescue?.render(dynamicGraphics);

    // 6.9. Заградительный ракетный налёт и осветительные фаеры
    data.barrageSalvo?.render(dynamicGraphics);

    // 6.95. Низковысотный штурмовик ПМВ («Стриж»)
    data.terrainHugger?.render(dynamicGraphics);

    // 6.98. Сверхзвуковой разведчик-невидимка «Сокол»
    data.supersonicRecon?.render(dynamicGraphics);

    // 7. Эффекты взрывов и ударных волн
    renderExplosions(dynamicGraphics, data.explosions);

    // 8. Аутентичный экранный целеуказатель СУО для первого контакта (телефон + ПК)
    renderOnboardingCallout(data);
  };

  /**
   * Отрисовка сходящейся воронки автосопровождения и радиальной выноски внутри купола радара
   */
  const renderOnboardingCallout = (data: RadarRenderData): void => {
    if (data.onboardingStage !== 'acquire') {
      hintLabelText.setVisible(false);
      return;
    }

    const { radarX, radarY, colors } = GAME_CONFIG;
    const focusCandidates = data.targets.filter(
      (t) =>
        !t.isJammer &&
        !t.isTerrainHugger &&
        !t.isRecon &&
        !t.isTargeted &&
        !t.markedAs &&
        t.alpha > 0.05,
    );
    let focusTarget: GameTarget | null = null;
    let bestDist = Infinity;
    for (const candidate of focusCandidates) {
      const d = Math.hypot(candidate.x - radarX, candidate.y - radarY);
      if (d < bestDist) {
        bestDist = d;
        focusTarget = candidate;
      }
    }

    if (!focusTarget) {
      hintLabelText.setVisible(false);
      return;
    }

    const fadeAlpha = Math.min(1, focusTarget.alpha * 1.35);
    const tx = focusTarget.x;
    const ty = focusTarget.y;

    const cycle = ((data.timeNow * 0.001) / RADAR_ONBOARDING_CONFIG.ringPeriodSec) % 1;
    const ringR = Phaser.Math.Linear(
      RADAR_ONBOARDING_CONFIG.ringMaxRadius,
      RADAR_ONBOARDING_CONFIG.ringMinRadius,
      cycle,
    );
    const ringAlpha = Math.sin(cycle * Math.PI) * 0.85 * fadeAlpha;

    dynamicGraphics.lineStyle(1.4, colors.selectedBox, ringAlpha);
    dynamicGraphics.strokeCircle(tx, ty, ringR);

    // 4 диагональные риски прицеливания под 45°
    const rIn = RADAR_ONBOARDING_CONFIG.reticleInner;
    const rOut = RADAR_ONBOARDING_CONFIG.reticleOuter;
    dynamicGraphics.lineStyle(1.4, colors.blipCore, 0.72 * fadeAlpha);
    dynamicGraphics.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.25 + (i * Math.PI) / 2;
      dynamicGraphics.moveTo(tx + Math.cos(a) * rIn, ty + Math.sin(a) * rIn);
      dynamicGraphics.lineTo(tx + Math.cos(a) * rOut, ty + Math.sin(a) * rOut);
    }
    dynamicGraphics.strokePath();

    // Внутренняя выноска-лидер всегда направлена к центру круга, чтобы оставаться внутри купола
    const dirX = tx >= radarX ? -1 : 1;
    const dirY = ty >= radarY ? -1 : 1;
    const elbowX = tx + dirX * RADAR_ONBOARDING_CONFIG.elbowOffset;
    const elbowY = ty + dirY * RADAR_ONBOARDING_CONFIG.elbowOffset;
    const shelfLen = Math.max(
      RADAR_ONBOARDING_CONFIG.shelfLength,
      Math.ceil(hintLabelText.width) + 10,
    );
    const shelfEndX = elbowX + dirX * shelfLen;

    dynamicGraphics.lineStyle(1.2, colors.selectedBox, 0.75 * fadeAlpha);
    dynamicGraphics.beginPath();
    dynamicGraphics.moveTo(tx + dirX * 9, ty + dirY * 9);
    dynamicGraphics.lineTo(elbowX, elbowY);
    dynamicGraphics.lineTo(shelfEndX, elbowY);
    dynamicGraphics.strokePath();

    hintLabelText.setOrigin(dirX > 0 ? 0 : 1, 1);
    hintLabelText.setPosition(
      Math.round(elbowX + dirX * 4),
      Math.round(elbowY - 3),
    );
    hintLabelText.setAlpha(0.92 * fadeAlpha);
    hintLabelText.setVisible(true);
  };

  // Отрисовываем сетку сразу при создании
  renderStaticGrid();

  return {
    staticGraphics,
    dynamicGraphics,
    get beamAngle() {
      return beamAngle;
    },
    get beamDirection() {
      return currentBeamDirection;
    },
    get currentBeamSpeed() {
      return currentBeamSpeed;
    },
    reset,
    setWaveSpeed,
    updateBeam,
    renderStaticGrid,
    renderDynamic,
    setVisible: (visible: boolean) => {
      staticGraphics.setVisible(visible);
      dynamicGraphics.setVisible(visible);
      if (!visible) hintLabelText.setVisible(false);
    },
  };
}
