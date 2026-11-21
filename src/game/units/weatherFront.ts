import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from '../gameConfig';

/**
 * Конфигурация ионизационного грозового фронта (Ionization Weather Front)
 */
export const WEATHER_FRONT_CONFIG = {
  minWave: 4, // Событие активируется с 4-й волны
  waveChance: 0.35, // 35% шанс появления на подходящей волне
  delayMin: 5.0, // Минимальная задержка до входа фронта (сек)
  delayMax: 14.0, // Максимальная задержка до входа фронта (сек)
  duration: 14.0, // Полное время прохождения сектора (сек)

  // Геометрия облака
  radius: 64, // Радиус рассеивания метеоэхо (px)
  particleCount: 85, // Количество точек люминофора (rain clutter)
  angularSpanRad: 0.82, // Угловая ширина фронта (~47 градусов)
  driftSpeed: 22, // Скорость дрейфа центра фронта (px/сек)

  // Физика люминофора
  clutterFadeSpeed: 0.85, // Скорость затухания свечения частиц облака (1/сек)

  // Микроразряды молний
  lightningIntervalMin: 2.8, // Мин. интервал между разрядами (сек)
  lightningIntervalMax: 4.2, // Макс. интервал между разрядами (сек)
  lightningDuration: 0.09, // Длительность вспышки разряда (сек)

  // Вторичное эхо (радио-призраки)
  ghostEchoDistance: 15, // Отставание вторичного эхо от истинной цели (px)
  ghostEchoAlpha: 0.32, // Прозрачность вторичного эхо

  // Палитра отображения на CRT-экране
  colors: {
    clutterCore: 0x2dd4bf, // Изумрудно-бирюзовое плотное ядро метеоэхо
    clutterEdge: 0x0f766e, // Глубокое бирюзовое рассеяние периферии
    lightning: 0xf0fdfa, // Ослепительно-белая нить разряда
    lightningGlow: 0x5eead4, // Ореол разряда
    ghostEcho: 0x0284c7, // Бледно-голубое вторичное эхо цели
  },
};

/**
 * Одиночная частица гранулированного метеоэхо
 */
interface ClutterParticle {
  // Полярное смещение относительно дрейфующего центра фронта
  offsetX: number;
  offsetY: number;
  baseSize: number;
  isCore: boolean;
  alpha: number; // Текущая яркость послесвечения люминофора (0..1)
}

/**
 * Сегмент процедурной молнии статического разряда
 */
interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Интерфейс менеджера грозового фронта
 */
export interface WeatherFrontManager {
  readonly isActive: boolean;
  readonly progress: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  trigger: () => void;
  update: (
    dt: number,
    beamAngle: number,
    onThunder?: (pan: number) => void,
  ) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  renderGhostEchoes: (
    graphics: Phaser.GameObjects.Graphics,
    targets: GameTarget[],
  ) => void;
  isTargetInside: (target: GameTarget) => boolean;
  reset: () => void;
}

/**
 * Создание статического пула частиц для формы грозовой тучи
 */
function generateClutterParticles(count: number, maxRadius: number): ClutterParticle[] {
  const particles: ClutterParticle[] = [];

  for (let i = 0; i < count; i++) {
    // Гауссово распределение плотности к центру облака
    const u1 = Math.random();
    const u2 = Math.random();
    const randStd = Math.sqrt(-2.0 * Math.log(Math.max(0.0001, u1))) * Math.cos(2.0 * Math.PI * u2);
    const dist = Math.min(maxRadius, Math.abs(randStd) * (maxRadius * 0.42));
    const angle = Math.random() * Math.PI * 2;

    const isCore = dist < maxRadius * 0.45;
    particles.push({
      offsetX: Math.cos(angle) * dist,
      offsetY: Math.sin(angle) * dist,
      baseSize: isCore ? (Math.random() < 0.4 ? 1.8 : 1.2) : (Math.random() < 0.3 ? 1.4 : 0.9),
      isCore,
      alpha: 0,
    });
  }

  return particles;
}

/**
 * Генерация случайной ломаной нити молнии внутри облака
 */
function generateLightningBolt(
  centerX: number,
  centerY: number,
  radius: number,
): LightningSegment[] {
  const segments: LightningSegment[] = [];
  const startAngle = Math.random() * Math.PI * 2;
  const startDist = Phaser.Math.FloatBetween(radius * 0.1, radius * 0.4);
  let curX = centerX + Math.cos(startAngle) * startDist;
  let curY = centerY + Math.sin(startAngle) * startDist;

  const steps = Phaser.Math.Between(3, 5);
  const mainAngle = startAngle + Math.PI + Phaser.Math.FloatBetween(-0.6, 0.6);
  const stepLen = (radius * 0.75) / steps;

  for (let i = 0; i < steps; i++) {
    const branchAngle = mainAngle + Phaser.Math.FloatBetween(-0.85, 0.85);
    const nextX = curX + Math.cos(branchAngle) * stepLen;
    const nextY = curY + Math.sin(branchAngle) * stepLen;

    segments.push({
      x1: curX,
      y1: curY,
      x2: nextX,
      y2: nextY,
    });

    curX = nextX;
    curY = nextY;
  }

  return segments;
}

/**
 * Фабрика изолированного менеджера грозового ионизационного фронта
 */
export function createWeatherFrontManager(): WeatherFrontManager {
  let active = false;
  let elapsed = 0;
  let startX = 0;
  let startY = 0;
  let targetEndX = 0;
  let targetEndY = 0;
  let curX = 0;
  let curY = 0;

  // Тайминги молний
  let nextLightningTimer = Phaser.Math.FloatBetween(
    WEATHER_FRONT_CONFIG.lightningIntervalMin,
    WEATHER_FRONT_CONFIG.lightningIntervalMax,
  );
  let lightningFlashTimer = 0;
  let currentLightning: LightningSegment[] = [];

  // Пул частиц
  const particles = generateClutterParticles(
    WEATHER_FRONT_CONFIG.particleCount,
    WEATHER_FRONT_CONFIG.radius,
  );

  const reset = (): void => {
    active = false;
    elapsed = 0;
    lightningFlashTimer = 0;
    currentLightning = [];
    nextLightningTimer = Phaser.Math.FloatBetween(
      WEATHER_FRONT_CONFIG.lightningIntervalMin,
      WEATHER_FRONT_CONFIG.lightningIntervalMax,
    );
    for (const p of particles) {
      p.alpha = 0;
    }
  };

  const trigger = (): void => {
    reset();
    active = true;

    // Выбираем траекторию дрейфа фронта по внешнему периметру радара
    // Заход из случайного сектора на дистанции ~0.8 R и плавный проход по хорде
    const startAngle = Phaser.Math.FloatBetween(Math.PI * 0.15, Math.PI * 0.85);
    const startRadius = GAME_CONFIG.radarRadius * 0.88;
    startX = GAME_CONFIG.radarX + Math.cos(startAngle) * startRadius;
    startY = GAME_CONFIG.radarY - Math.sin(startAngle) * startRadius; // верхняя полусфера радара

    // Конечная точка дрейфа: противоположный фланг
    const driftAngleDelta = Phaser.Math.FloatBetween(0.7, 1.2) * (Math.random() < 0.5 ? 1 : -1);
    const endAngle = startAngle + driftAngleDelta;
    targetEndX = GAME_CONFIG.radarX + Math.cos(endAngle) * (startRadius * 0.82);
    targetEndY = GAME_CONFIG.radarY - Math.sin(endAngle) * (startRadius * 0.82);

    curX = startX;
    curY = startY;

    // Первоначальное возбуждение части частиц
    for (const p of particles) {
      p.alpha = Math.random() * 0.35;
    }
  };

  const update = (
    dt: number,
    beamAngle: number,
    onThunder?: (pan: number) => void,
  ): void => {
    if (!active) return;

    elapsed += dt;
    if (elapsed >= WEATHER_FRONT_CONFIG.duration) {
      reset();
      return;
    }

    // Линейный дрейф центра фронта
    const t = elapsed / WEATHER_FRONT_CONFIG.duration;
    // Плавное сглаживание движения
    const smoothT = Math.sin((t * Math.PI) / 2);
    curX = startX + (targetEndX - startX) * smoothT;
    curY = startY + (targetEndY - startY) * smoothT;

    // 1. Проверка луча радара и возбуждение свечения частиц (Rain Clutter phosphor)
    const normBeam = Phaser.Math.Angle.Normalize(beamAngle);
    const beamSweepTolerance = 0.12; // полуширина пятна возбуждения луча (~7 градусов)

    for (const p of particles) {
      const worldPx = curX + p.offsetX;
      const worldPy = curY + p.offsetY;

      // Угол частицы относительно антенны радара
      const particleAngle = Phaser.Math.Angle.Normalize(
        Math.atan2(worldPy - GAME_CONFIG.radarY, worldPx - GAME_CONFIG.radarX),
      );

      const diff = Math.abs(Phaser.Math.Angle.ShortestBetween(
        Phaser.Math.RadToDeg(normBeam),
        Phaser.Math.RadToDeg(particleAngle),
      ));

      if (Phaser.Math.DegToRad(diff) < beamSweepTolerance) {
        // Луч касается частицы: вспышка до максимума
        p.alpha = p.isCore ? 0.75 : 0.52;
      } else if (p.alpha > 0) {
        // Естественное затухание люминофора
        p.alpha = Math.max(0, p.alpha - dt * WEATHER_FRONT_CONFIG.clutterFadeSpeed);
      }
    }

    // 2. Таймер и генерация микроразрядов молний
    if (lightningFlashTimer > 0) {
      lightningFlashTimer -= dt;
      if (lightningFlashTimer <= 0) {
        currentLightning = [];
      }
    } else {
      nextLightningTimer -= dt;
      if (nextLightningTimer <= 0) {
        nextLightningTimer = Phaser.Math.FloatBetween(
          WEATHER_FRONT_CONFIG.lightningIntervalMin,
          WEATHER_FRONT_CONFIG.lightningIntervalMax,
        );
        lightningFlashTimer = WEATHER_FRONT_CONFIG.lightningDuration;
        currentLightning = generateLightningBolt(
          curX,
          curY,
          WEATHER_FRONT_CONFIG.radius,
        );

        // Расчет панорамы звука грома от положения грозового очага (-1..1)
        const pan = Phaser.Math.Clamp(
          (curX - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius,
          -1,
          1,
        );
        onThunder?.(pan);

        // Вспышка молнии локально подсвечивает все частицы ядра тучи
        for (const p of particles) {
          if (p.isCore) {
            p.alpha = Math.min(1.0, p.alpha + 0.45);
          }
        }
      }
    }
  };

  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!active) return;

    // 1. Отрисовка зернистых точек метеоэхо (Rain Clutter)
    for (const p of particles) {
      if (p.alpha <= 0.04) continue;

      const px = curX + p.offsetX;
      const py = curY + p.offsetY;

      // Не выходим за физический экран радара
      const distFromCenter = Math.hypot(px - GAME_CONFIG.radarX, py - GAME_CONFIG.radarY);
      if (distFromCenter > GAME_CONFIG.radarRadius) continue;

      const color = p.isCore
        ? WEATHER_FRONT_CONFIG.colors.clutterCore
        : WEATHER_FRONT_CONFIG.colors.clutterEdge;

      graphics.fillStyle(color, p.alpha);
      graphics.fillCircle(px, py, p.baseSize);
    }

    // 2. Отрисовка вспышки разряда молнии
    if (lightningFlashTimer > 0 && currentLightning.length > 0) {
      // Ореол разряда
      graphics.lineStyle(3.0, WEATHER_FRONT_CONFIG.colors.lightningGlow, 0.45);
      for (const seg of currentLightning) {
        graphics.beginPath();
        graphics.moveTo(seg.x1, seg.y1);
        graphics.lineTo(seg.x2, seg.y2);
        graphics.strokePath();
      }

      // Белая яркая сердцевина молнии
      graphics.lineStyle(1.2, WEATHER_FRONT_CONFIG.colors.lightning, 0.95);
      for (const seg of currentLightning) {
        graphics.beginPath();
        graphics.moveTo(seg.x1, seg.y1);
        graphics.lineTo(seg.x2, seg.y2);
        graphics.strokePath();
      }
    }
  };

  const isTargetInside = (target: GameTarget): boolean => {
    if (!active) return false;
    const dist = Math.hypot(target.x - curX, target.y - curY);
    return dist <= WEATHER_FRONT_CONFIG.radius * 1.05;
  };

  const renderGhostEchoes = (
    graphics: Phaser.GameObjects.Graphics,
    targets: GameTarget[],
  ): void => {
    if (!active) return;

    for (const target of targets) {
      // Только для движущихся целей внутри грозового фронта
      if (!isTargetInside(target) || target.speed <= 0) continue;

      // Смещение вторичного эхо против вектора скорости
      const speedNorm = Math.hypot(target.vx, target.vy);
      if (speedNorm <= 0.1) continue;

      const dirX = target.vx / speedNorm;
      const dirY = target.vy / speedNorm;

      const ghostX = target.x - dirX * WEATHER_FRONT_CONFIG.ghostEchoDistance;
      const ghostY = target.y - dirY * WEATHER_FRONT_CONFIG.ghostEchoDistance;

      // Вторичное эхо рендерится как бледный люминофорный след
      const ghostAlpha = target.alpha * WEATHER_FRONT_CONFIG.ghostEchoAlpha;
      if (ghostAlpha <= 0.05) continue;

      graphics.fillStyle(WEATHER_FRONT_CONFIG.colors.ghostEcho, ghostAlpha);
      graphics.fillCircle(ghostX, ghostY, 2.2);

      // Маленькая шлейфовая черта к основной цели
      graphics.lineStyle(1.0, WEATHER_FRONT_CONFIG.colors.ghostEcho, ghostAlpha * 0.5);
      graphics.beginPath();
      graphics.moveTo(ghostX, ghostY);
      graphics.lineTo(target.x, target.y);
      graphics.strokePath();
    }
  };

  return {
    get isActive() {
      return active;
    },
    get progress() {
      return active ? elapsed / WEATHER_FRONT_CONFIG.duration : 0;
    },
    get centerX() {
      return curX;
    },
    get centerY() {
      return curY;
    },
    get radius() {
      return WEATHER_FRONT_CONFIG.radius;
    },
    trigger,
    update,
    render,
    renderGhostEchoes,
    isTargetInside,
    reset,
  };
}
