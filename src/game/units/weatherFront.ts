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

  // Геометрия облачного массива
  radius: 72, // Базовый радиус рассеивания метеоэхо (px)
  particleCount: 135, // Количество точек люминофора (rain clutter)
  angularSpanRad: 0.82, // Угловая ширина фронта (~47 градусов)
  driftSpeed: 22, // Скорость дрейфа центра фронта (px/сек)

  // Физика люминофора
  clutterFadeSpeed: 0.85, // Скорость затухания свечения частиц облака (1/сек)

  // Разряды молний и зарниц
  lightningIntervalMin: 2.2, // Мин. интервал между сильными разрядами (сек)
  lightningIntervalMax: 3.8, // Макс. интервал между сильными разрядами (сек)
  lightningDuration: 0.14, // Длительность вспышки разряда (сек)
  sheetFlashDuration: 0.22, // Длительность зарницы внутри тучи (сек)

  // Вторичное эхо (радио-призраки)
  ghostEchoDistance: 15, // Отставание вторичного эхо от истинной цели (px)
  ghostEchoAlpha: 0.32, // Прозрачность вторичного эхо

  // Палитра отображения на CRT-экране
  colors: {
    clutterCore: 0x2dd4bf, // Изумрудно-бирюзовое плотное ядро метеоэхо
    clutterEdge: 0x0f766e, // Глубокое бирюзовое рассеяние периферии
    clutterWash: 0x0d9488, // Мягкая фоновая водность облака
    lightning: 0xf0fdfa, // Ослепительно-белая нить разряда
    lightningGlow: 0x5eead4, // Ореол разряда
    sheetFlash: 0x99f6e4, // Зарница внутри ячейки
    ghostEcho: 0x0284c7, // Бледно-голубое вторичное эхо цели
  },
};

/**
 * Одиночная частица гранулированного метеоэхо с вихревой кинематикой
 */
interface ClutterParticle {
  cellIndex: 0 | 1 | 2; // Принадлежность к одной из 3 конвективных ячеек
  baseRadius: number; // Базовое расстояние от центра ячейки (px)
  angle: number; // Полярный угол вращения в циклоне (рад)
  orbitSpeed: number; // Скорость вихревого вращения (рад/сек)
  phase: number; // Фаза гидродинамической пульсации
  freq: number; // Частота пульсации формы
  baseSize: number; // Размер световой точки
  isCore: boolean; // Относится ли к плотному ядру осадков
  alpha: number; // Текущая яркость послесвечения люминофора (0..1)
  currentX: number; // Мировые координаты текущего кадра
  currentY: number;
}

/**
 * Сегмент процедурной молнии статического разряда
 */
interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isFork?: boolean;
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
 * Генерация пула частиц, распределённых по 3 конвективным ячейкам грозового массива:
 * Ячейка 0: Главный грозовой супершторм (Supercell Core)
 * Ячейка 1: Боковой восходящий поток (Flank Updraft Cell)
 * Ячейка 2: Ветровой шлейф осадков (Trailing Rain Veil)
 */
function generateClutterParticles(count: number): ClutterParticle[] {
  const particles: ClutterParticle[] = [];

  for (let i = 0; i < count; i++) {
    // Распределение частиц: 55% в ядро, 30% во вторую ячейку, 15% в шлейф
    let cellIndex: 0 | 1 | 2 = 0;
    let maxR = 48;
    if (i > count * 0.85) {
      cellIndex = 2;
      maxR = 38;
    } else if (i > count * 0.55) {
      cellIndex = 1;
      maxR = 34;
    }

    // Гауссово уплотнение к центру соответствующей ячейки
    const u1 = Math.random();
    const u2 = Math.random();
    const randStd = Math.sqrt(-2.0 * Math.log(Math.max(0.0001, u1))) * Math.cos(2.0 * Math.PI * u2);
    const dist = Math.min(maxR, Math.abs(randStd) * (maxR * 0.44));
    const angle = Math.random() * Math.PI * 2;

    const isCore = dist < maxR * 0.48;
    // Циклоническое вихревое вращение (ядро крутится быстрее периферии)
    const baseOrbit = isCore
      ? Phaser.Math.FloatBetween(0.28, 0.48)
      : Phaser.Math.FloatBetween(0.12, 0.24);
    const orbitSpeed = baseOrbit * (Math.random() < 0.2 ? -1 : 1);

    particles.push({
      cellIndex,
      baseRadius: dist,
      angle,
      orbitSpeed,
      phase: Math.random() * Math.PI * 2,
      freq: Phaser.Math.FloatBetween(1.2, 2.2),
      baseSize: isCore ? (Math.random() < 0.4 ? 1.8 : 1.3) : (Math.random() < 0.3 ? 1.4 : 0.9),
      isCore,
      alpha: 0,
      currentX: 0,
      currentY: 0,
    });
  }

  return particles;
}

/**
 * Генерация ветвистой ломаной молнии с боковыми отростками (Forked Lightning Bolt)
 */
function generateBranchedLightning(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
): LightningSegment[] {
  const segments: LightningSegment[] = [];
  const steps = Phaser.Math.Between(4, 6);
  const totalDx = targetX - startX;
  const totalDy = targetY - startY;

  let curX = startX;
  let curY = startY;

  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    const baseTargetX = startX + totalDx * fraction;
    const baseTargetY = startY + totalDy * fraction;

    // Зигзагообразный излом нити
    const jitter = (1 - Math.abs(fraction - 0.5) * 1.5) * 14;
    const nextX = i === steps ? targetX : baseTargetX + Phaser.Math.FloatBetween(-jitter, jitter);
    const nextY = i === steps ? targetY : baseTargetY + Phaser.Math.FloatBetween(-jitter, jitter);

    segments.push({
      x1: curX,
      y1: curY,
      x2: nextX,
      y2: nextY,
      isFork: false,
    });

    // Боковое ветвление (развилка молнии)
    if (i === 2 || i === 3) {
      const mainDir = Math.atan2(nextY - curY, nextX - curX);
      const forkAngle = mainDir + Phaser.Math.FloatBetween(-0.85, 0.85);
      const forkLen = Phaser.Math.FloatBetween(12, 24);
      segments.push({
        x1: nextX,
        y1: nextY,
        x2: nextX + Math.cos(forkAngle) * forkLen,
        y2: nextY + Math.sin(forkAngle) * forkLen,
        isFork: true,
      });
    }

    curX = nextX;
    curY = nextY;
  }

  return segments;
}

/**
 * Фабрика динамического гидрометеорологического грозового фронта
 */
export function createWeatherFrontManager(): WeatherFrontManager {
  let active = false;
  let elapsed = 0;
  let startX = 0;
  let startY = 0;
  let targetEndX = 0;
  let targetEndY = 0;

  // Главный центр фронта
  let curX = 0;
  let curY = 0;

  // Динамические центры 3 конвективных ячеек
  let cell0X = 0;
  let cell0Y = 0;
  let cell1X = 0;
  let cell1Y = 0;
  let cell2X = 0;
  let cell2Y = 0;

  // Тайминги молний и зарниц
  let nextLightningTimer = Phaser.Math.FloatBetween(
    WEATHER_FRONT_CONFIG.lightningIntervalMin,
    WEATHER_FRONT_CONFIG.lightningIntervalMax,
  );
  let lightningFlashTimer = 0;
  let sheetFlashTimer = 0;
  let sheetFlashX = 0;
  let sheetFlashY = 0;
  let currentLightning: LightningSegment[] = [];

  // Микроразряды статики между ячейками
  let nextMicroSparkTimer = 1.0;
  let microSparkTimer = 0;
  let microSparkSegments: LightningSegment[] = [];

  // Пул динамических частиц
  const particles = generateClutterParticles(WEATHER_FRONT_CONFIG.particleCount);

  const reset = (): void => {
    active = false;
    elapsed = 0;
    lightningFlashTimer = 0;
    sheetFlashTimer = 0;
    microSparkTimer = 0;
    currentLightning = [];
    microSparkSegments = [];
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
    const startAngle = Phaser.Math.FloatBetween(Math.PI * 0.15, Math.PI * 0.85);
    const startRadius = GAME_CONFIG.radarRadius * 0.88;
    startX = GAME_CONFIG.radarX + Math.cos(startAngle) * startRadius;
    startY = GAME_CONFIG.radarY - Math.sin(startAngle) * startRadius;

    // Конечная точка дрейфа: противоположный фланг
    const driftAngleDelta = Phaser.Math.FloatBetween(0.7, 1.2) * (Math.random() < 0.5 ? 1 : -1);
    const endAngle = startAngle + driftAngleDelta;
    targetEndX = GAME_CONFIG.radarX + Math.cos(endAngle) * (startRadius * 0.82);
    targetEndY = GAME_CONFIG.radarY - Math.sin(endAngle) * (startRadius * 0.82);

    curX = startX;
    curY = startY;

    cell0X = curX;
    cell0Y = curY;
    cell1X = curX - 30;
    cell1Y = curY + 15;
    cell2X = curX + 25;
    cell2Y = curY - 20;

    for (const p of particles) {
      p.alpha = Math.random() * 0.4;
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

    // 1. Дрейф фронта по гладкой синусоидальной траектории
    const t = elapsed / WEATHER_FRONT_CONFIG.duration;
    const smoothT = Math.sin((t * Math.PI) / 2);
    curX = startX + (targetEndX - startX) * smoothT;
    curY = startY + (targetEndY - startY) * smoothT;

    // Направление движения для расчёта ветрового сноса
    const motionDx = targetEndX - startX;
    const motionDy = targetEndY - startY;
    const motionLen = Math.max(1, Math.hypot(motionDx, motionDy));
    const dirX = motionDx / motionLen;
    const dirY = motionDy / motionLen;

    // 2. ДИНАМИЧЕСКИЕ КОНВЕКТИВНЫЕ ЯЧЕЙКИ (дышат и смещаются друг относительно друга)
    // Ячейка 0: Главный грозовой супершторм
    cell0X = curX + Math.sin(elapsed * 0.85) * 6;
    cell0Y = curY + Math.cos(elapsed * 0.75) * 6;

    // Ячейка 1: Боковой вихревой поток (орбитирует вокруг ядра)
    const cell1OrbitAngle = 1.35 + elapsed * 0.22;
    const cell1OrbitDist = 34 + Math.sin(elapsed * 1.4) * 5;
    cell1X = cell0X + Math.cos(cell1OrbitAngle) * cell1OrbitDist;
    cell1Y = cell0Y + Math.sin(cell1OrbitAngle) * cell1OrbitDist;

    // Ячейка 2: Ветровой шлейф осадков (отстаёт назад по вектору движения)
    cell2X = cell0X - dirX * 42 + Math.sin(elapsed * 1.6) * 7;
    cell2Y = cell0Y - dirY * 42 + Math.cos(elapsed * 1.5) * 7;

    // 3. ВИХРЕВОЕ ВРАЩЕНИЕ И ГИДРОДИНАМИЧЕСКАЯ ТУРБУЛЕНТНОСТЬ ЧАСТИЦ
    const normBeam = Phaser.Math.Angle.Normalize(beamAngle);
    const beamSweepTolerance = 0.14; // ~8 градусов полуширина захвата луча

    for (const p of particles) {
      // Циклоническое вращение внутри ячейки
      p.angle += p.orbitSpeed * dt;

      // Выбираем текущий центр ячейки
      let cX = cell0X;
      let cY = cell0Y;
      if (p.cellIndex === 1) {
        cX = cell1X;
        cY = cell1Y;
      } else if (p.cellIndex === 2) {
        cX = cell2X;
        cY = cell2Y;
      }

      // Пульсация радиуса (кипение конвективного облака)
      const r = p.baseRadius * (1 + 0.16 * Math.sin(elapsed * p.freq + p.phase));

      // Мировые координаты частицы с учётом вихря и микро-флаттера
      p.currentX = cX + Math.cos(p.angle) * r + Math.sin(elapsed * 1.8 + p.phase) * 3;
      p.currentY = cY + Math.sin(p.angle) * r + Math.cos(elapsed * 1.6 + p.phase) * 3;

      // Проверка прохождения луча радара и возбуждение люминофора
      const particleAngle = Phaser.Math.Angle.Normalize(
        Math.atan2(p.currentY - GAME_CONFIG.radarY, p.currentX - GAME_CONFIG.radarX),
      );

      const diff = Math.abs(Phaser.Math.Angle.ShortestBetween(
        Phaser.Math.RadToDeg(normBeam),
        Phaser.Math.RadToDeg(particleAngle),
      ));

      if (Phaser.Math.DegToRad(diff) < beamSweepTolerance) {
        // Луч возбуждает частицу: яркая вспышка с эффектом ядра
        p.alpha = p.isCore ? 0.85 : 0.58;
      } else if (p.alpha > 0) {
        // Естественное затухание люминофора ЭЛТ
        p.alpha = Math.max(0, p.alpha - dt * WEATHER_FRONT_CONFIG.clutterFadeSpeed);
      }
    }

    // 4. ТАЙМЕР ВЕТВИСТЫХ МОЛНИЙ И ЗАРНИЦ
    if (lightningFlashTimer > 0) {
      lightningFlashTimer -= dt;
      if (lightningFlashTimer <= 0) {
        currentLightning = [];
      }
    }

    if (sheetFlashTimer > 0) {
      sheetFlashTimer -= dt;
    }

    // Микро-разряды статики между ячейками
    if (microSparkTimer > 0) {
      microSparkTimer -= dt;
      if (microSparkTimer <= 0) {
        microSparkSegments = [];
      }
    } else {
      nextMicroSparkTimer -= dt;
      if (nextMicroSparkTimer <= 0) {
        nextMicroSparkTimer = Phaser.Math.FloatBetween(0.8, 1.6);
        microSparkTimer = 0.06;
        // Короткий искровой разряд между ячейками
        const startX = cell0X + Phaser.Math.FloatBetween(-12, 12);
        const startY = cell0Y + Phaser.Math.FloatBetween(-12, 12);
        const endX = cell1X + Phaser.Math.FloatBetween(-10, 10);
        const endY = cell1Y + Phaser.Math.FloatBetween(-10, 10);
        microSparkSegments = [
          {
            x1: startX,
            y1: startY,
            x2: (startX + endX) / 2 + Phaser.Math.FloatBetween(-8, 8),
            y2: (startY + endY) / 2 + Phaser.Math.FloatBetween(-8, 8),
          },
          {
            x1: (startX + endX) / 2 + Phaser.Math.FloatBetween(-8, 8),
            y1: (startY + endY) / 2 + Phaser.Math.FloatBetween(-8, 8),
            x2: endX,
            y2: endY,
          },
        ];
      }
    }

    // Генерация главного разряда молнии
    nextLightningTimer -= dt;
    if (nextLightningTimer <= 0) {
      nextLightningTimer = Phaser.Math.FloatBetween(
        WEATHER_FRONT_CONFIG.lightningIntervalMin,
        WEATHER_FRONT_CONFIG.lightningIntervalMax,
      );
      lightningFlashTimer = WEATHER_FRONT_CONFIG.lightningDuration;
      sheetFlashTimer = WEATHER_FRONT_CONFIG.sheetFlashDuration;

      // Источник молнии — ядро суперячейки, цель — боковая ячейка или периферия
      const strikeStartX = cell0X + Phaser.Math.FloatBetween(-14, 14);
      const strikeStartY = cell0Y + Phaser.Math.FloatBetween(-14, 14);
      sheetFlashX = cell0X;
      sheetFlashY = cell0Y;

      const strikeAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const strikeDist = Phaser.Math.FloatBetween(WEATHER_FRONT_CONFIG.radius * 0.55, WEATHER_FRONT_CONFIG.radius * 0.95);
      const strikeEndX = cell0X + Math.cos(strikeAngle) * strikeDist;
      const strikeEndY = cell0Y + Math.sin(strikeAngle) * strikeDist;

      currentLightning = generateBranchedLightning(
        strikeStartX,
        strikeStartY,
        strikeEndX,
        strikeEndY,
      );

      // Панорама грома
      const pan = Phaser.Math.Clamp(
        (cell0X - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius,
        -1,
        1,
      );
      onThunder?.(pan);

      // Зарница возбуждает ВСЕ частицы ядра тучи до максимального свечения
      for (const p of particles) {
        if (p.isCore || p.cellIndex === 0) {
          p.alpha = Math.min(1.0, p.alpha + 0.65);
        }
      }
    }
  };

  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!active) return;

    const breathing = 0.85 + 0.15 * Math.sin(elapsed * 2.5);

    // ========================================================
    // 1. ОБЪЁМНАЯ ВОДНОСТЬ ОБЛАКА (Мягкое фоновое метеоэхо)
    // ========================================================
    const cells = [
      { x: cell0X, y: cell0Y, rx: 46, ry: 40, coreR: 24 },
      { x: cell1X, y: cell1Y, rx: 32, ry: 28, coreR: 16 },
      { x: cell2X, y: cell2Y, rx: 36, ry: 26, coreR: 14 },
    ];

    for (const c of cells) {
      const distFromCenter = Math.hypot(c.x - GAME_CONFIG.radarX, c.y - GAME_CONFIG.radarY);
      if (distFromCenter > GAME_CONFIG.radarRadius + 40) continue;

      // Внешний контур умеренных осадков
      graphics.fillStyle(
        WEATHER_FRONT_CONFIG.colors.clutterWash,
        0.08 * breathing,
      );
      graphics.fillEllipse(c.x, c.y, c.rx * 2, c.ry * 2);

      // Внутреннее плотное ядро ливня
      graphics.fillStyle(
        WEATHER_FRONT_CONFIG.colors.clutterCore,
        0.14 * breathing,
      );
      graphics.fillEllipse(c.x, c.y, c.coreR * 2, c.coreR * 1.8);
    }

    // ========================================================
    // 2. ВНУТРЕННЯЯ ЗАРНИЦА (Sheet Lightning Flash внутри тучи)
    // ========================================================
    if (sheetFlashTimer > 0) {
      const flashAlpha = (sheetFlashTimer / WEATHER_FRONT_CONFIG.sheetFlashDuration) * 0.38;
      graphics.fillStyle(WEATHER_FRONT_CONFIG.colors.sheetFlash, flashAlpha);
      graphics.fillCircle(sheetFlashX, sheetFlashY, WEATHER_FRONT_CONFIG.radius * 0.85);

      graphics.fillStyle(0xffffff, flashAlpha * 0.7);
      graphics.fillCircle(sheetFlashX, sheetFlashY, WEATHER_FRONT_CONFIG.radius * 0.45);
    }

    // ========================================================
    // 3. ЗЕРНИСТЫЕ ТОЧКИ ЛЮМИНОФОРА (Rain Clutter с вихрем)
    // ========================================================
    for (const p of particles) {
      if (p.alpha <= 0.04) continue;

      // Проверка на физический круг радара
      const distFromCenter = Math.hypot(p.currentX - GAME_CONFIG.radarX, p.currentY - GAME_CONFIG.radarY);
      if (distFromCenter > GAME_CONFIG.radarRadius) continue;

      const color = p.isCore
        ? WEATHER_FRONT_CONFIG.colors.clutterCore
        : WEATHER_FRONT_CONFIG.colors.clutterEdge;

      graphics.fillStyle(color, p.alpha);
      graphics.fillCircle(p.currentX, p.currentY, p.baseSize);
    }

    // ========================================================
    // 4. МИКРОРАЗРЯДЫ СТАТИКИ МЕЖДУ ЯЧЕЙКАМИ
    // ========================================================
    if (microSparkTimer > 0 && microSparkSegments.length > 0) {
      graphics.lineStyle(1.4, WEATHER_FRONT_CONFIG.colors.lightningGlow, 0.75);
      for (const seg of microSparkSegments) {
        graphics.beginPath();
        graphics.moveTo(seg.x1, seg.y1);
        graphics.lineTo(seg.x2, seg.y2);
        graphics.strokePath();
      }
    }

    // ========================================================
    // 5. ВЕТВИСТАЯ МОЛНИЯ С БОКОВЫМИ ОТРОСТКАМИ
    // ========================================================
    if (lightningFlashTimer > 0 && currentLightning.length > 0) {
      // Неоновый ореол разряда
      graphics.lineStyle(3.8, WEATHER_FRONT_CONFIG.colors.lightningGlow, 0.55);
      for (const seg of currentLightning) {
        graphics.beginPath();
        graphics.moveTo(seg.x1, seg.y1);
        graphics.lineTo(seg.x2, seg.y2);
        graphics.strokePath();
      }

      // Белая яркая сердцевина молнии
      graphics.lineStyle(1.6, WEATHER_FRONT_CONFIG.colors.lightning, 0.98);
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
    // Проверка попадания в любую из 3 конвективных ячеек
    const d0 = Math.hypot(target.x - cell0X, target.y - cell0Y);
    if (d0 <= 48) return true;
    const d1 = Math.hypot(target.x - cell1X, target.y - cell1Y);
    if (d1 <= 36) return true;
    const d2 = Math.hypot(target.x - cell2X, target.y - cell2Y);
    if (d2 <= 38) return true;
    return false;
  };

  const renderGhostEchoes = (
    graphics: Phaser.GameObjects.Graphics,
    targets: GameTarget[],
  ): void => {
    if (!active) return;

    for (const target of targets) {
      if (!isTargetInside(target) || target.speed <= 0) continue;

      const speedNorm = Math.hypot(target.vx, target.vy);
      if (speedNorm <= 0.1) continue;

      const dirX = target.vx / speedNorm;
      const dirY = target.vy / speedNorm;

      const ghostX = target.x - dirX * WEATHER_FRONT_CONFIG.ghostEchoDistance;
      const ghostY = target.y - dirY * WEATHER_FRONT_CONFIG.ghostEchoDistance;

      const ghostAlpha = target.alpha * WEATHER_FRONT_CONFIG.ghostEchoAlpha;
      if (ghostAlpha <= 0.05) continue;

      graphics.fillStyle(WEATHER_FRONT_CONFIG.colors.ghostEcho, ghostAlpha);
      graphics.fillCircle(ghostX, ghostY, 2.2);

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
