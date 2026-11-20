import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from '../gameConfig';

/**
 * Конфигурация низковысотного штурмовика ПМВ «Стриж» (Terrain Hugger)
 */
export const TERRAIN_HUGGER_CONFIG = {
  minWave: 2, // Доступен со 2-й волны
  waveChance: 0.30, // 30% шанс появления на волне
  delayMin: 6.0, // мин. задержка вылета от старта волны (сек)
  delayMax: 18.0, // макс. задержка вылета (сек)
  speed: 34, // Скорость крейсерского полёта (px/сек)
  damage: 25, // Урон базе при прорыве (HP)
  scoreReward: 250, // Базовые очки за сбитие
  creditsReward: 150, // Кредиты за перехват (CR)

  // Тайминги цикла скрытности над рельефом
  submergedDuration: 1.8, // время полёта в тени рельефа (сек)
  revealedDuration: 1.4, // время нахождения над холмами / окно перехвата (сек)

  // Геометрия маршрута
  flankDuration: 3.2, // фаза 1: фланговый обход по касательной (сек)
  turnDuration: 1.4, // фаза 2: резкий излом курса в ущелье (сек)
  turnAngleRad: 0.95, // угол излома курса (~55 градусов)
  slalomAmplitude: 16, // амплитуда змейки в ущелье (px)
  slalomFrequency: 2.8, // частота колебаний змейки (рад/сек)

  // Экстраполяция СУО (Dead Reckoning)
  predictionPipsCount: 5, // количество точек прогнозируемого вектора

  // Цвета рендера
  colors: {
    body: 0x38bdf8, // Голубой тактический силуэт (морская штурмовая авиация)
    core: 0xffedd5, // Яркое белое сопло
    predictionPip: 0x0284c7, // Пунктирные точки инерционного прогноза СУО
    predictionBracket: 0xfacc15, // Пульсирующая рамка расчетной зоны выхода [ ? ]
    groundClutter: 0x0ea5e9, // Стохастическая рябь помех рельефа
  },
};

/**
 * Точка экстраполяции прогноза СУО
 */
export interface PredictionPoint {
  x: number;
  y: number;
}

/**
 * Интерфейс менеджера штурмовика ПМВ
 */
export interface TerrainHuggerManager {
  readonly isActive: boolean;
  readonly activeTarget: GameTarget | null;
  readonly isSubmerged: boolean;
  readonly isPermanentlyRevealed: boolean;
  spawn: (wave: number) => GameTarget;
  update: (
    dt: number,
    onPopUp?: () => void,
  ) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  onTargetScanned: (targetId: number) => void;
  onTargetDestroyed: (targetId: number) => void;
  reset: () => void;
}

/**
 * Фабрика изолированного менеджера штурмовика ПМВ
 */
export function createTerrainHuggerManager(): TerrainHuggerManager {
  let active = false;
  let targetRef: GameTarget | null = null;

  // Фазы полёта и состояние маскировки
  let flightTimer = 0;
  let cycleTimer = 0;
  let isSubmerged = false;
  let isPermanentlyRevealed = false;

  // Параметры траектории
  let startAngle = 0;
  let flankDirection = 1; // 1 = по часовой, -1 = против
  let baseHeading = 0;
  let hasTurned = false;

  // Данные инерционной экстраполяции СУО (Dead Reckoning)
  let lastObservedPos = { x: 0, y: 0 };
  let lastObservedVel = { vx: 0, vy: 0 };
  const predictionPips: PredictionPoint[] = [];
  let estimatedEmergencePoint = { x: 0, y: 0 };

  const reset = (): void => {
    active = false;
    targetRef = null;
    flightTimer = 0;
    cycleTimer = 0;
    isSubmerged = false;
    isPermanentlyRevealed = false;
    startAngle = 0;
    flankDirection = 1;
    baseHeading = 0;
    hasTurned = false;
    predictionPips.length = 0;
  };

  /**
   * Расчёт инерционного прогноза движения СУО (Dead Reckoning)
   */
  const computeDeadReckoning = (): void => {
    predictionPips.length = 0;
    const count = TERRAIN_HUGGER_CONFIG.predictionPipsCount;
    const totalTime = TERRAIN_HUGGER_CONFIG.submergedDuration;

    for (let i = 1; i <= count; i++) {
      const t = (i / count) * totalTime;
      predictionPips.push({
        x: lastObservedPos.x + lastObservedVel.vx * t,
        y: lastObservedPos.y + lastObservedVel.vy * t,
      });
    }

    if (predictionPips.length > 0) {
      estimatedEmergencePoint = { ...predictionPips[predictionPips.length - 1] };
    }
  };

  /**
   * Спавн штурмовика на дальней кромке сектора
   */
  const spawn = (wave: number): GameTarget => {
    active = true;
    flightTimer = 0;
    cycleTimer = 0;
    isSubmerged = false;
    isPermanentlyRevealed = false;
    hasTurned = false;

    // Случайный сектор старта
    startAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    flankDirection = Math.random() < 0.5 ? 1 : -1;

    const spawnRadius = GAME_CONFIG.radarRadius * 0.98;
    const x = GAME_CONFIG.radarX + Math.cos(startAngle) * spawnRadius;
    const y = GAME_CONFIG.radarY + Math.sin(startAngle) * spawnRadius;

    // Фаза 1: Фланговый заход по касательной с наклоном к базе
    const directToBase = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
    baseHeading = directToBase + flankDirection * 0.72; // угол смещения фланга ~41 градус

    const speed = TERRAIN_HUGGER_CONFIG.speed * (1 + Math.min(0.2, (wave - 2) * 0.03));
    const vx = Math.cos(baseHeading) * speed;
    const vy = Math.sin(baseHeading) * speed;

    let deg = Math.round(Phaser.Math.RadToDeg(baseHeading));
    if (deg < 0) deg += 360;

    const target: GameTarget = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'terrain_hugger',
      x,
      y,
      vx,
      vy,
      speed,
      headingDeg: deg,
      headingRad: baseHeading,
      targetHeadingRad: baseHeading,
      turnRate: 0,
      signal: 82,
      alpha: 1.0,
      isTerrainHugger: true,
      isSubmerged: false,
    };

    targetRef = target;
    lastObservedPos = { x, y };
    lastObservedVel = { vx, vy };

    return target;
  };

  /**
   * Обновление физики полёта штурмовика и цикла видимости
   */
  const update = (
    dt: number,
    onPopUp?: () => void,
  ): void => {
    if (!active || !targetRef) return;

    flightTimer += dt;
    cycleTimer += dt;

    // 1. УПРАВЛЕНИЕ ТРЁХФАЗНОЙ ТРАЕКТОРИЕЙ
    const speed = targetRef.speed;
    const toBaseAngle = Math.atan2(
      GAME_CONFIG.radarY - targetRef.y,
      GAME_CONFIG.radarX - targetRef.x,
    );

    if (flightTimer < TERRAIN_HUGGER_CONFIG.flankDuration) {
      // Фаза 1: Фланговый обход по касательной
      targetRef.vx = Math.cos(baseHeading) * speed;
      targetRef.vy = Math.sin(baseHeading) * speed;
      targetRef.headingRad = baseHeading;
    } else if (
      flightTimer <
      TERRAIN_HUGGER_CONFIG.flankDuration + TERRAIN_HUGGER_CONFIG.turnDuration
    ) {
      // Фаза 2: Резкий тактический излом курса в ущелье (Dogleg Turn к базе)
      hasTurned = true;
      baseHeading = Phaser.Math.Angle.RotateTo(
        baseHeading,
        toBaseAngle,
        TERRAIN_HUGGER_CONFIG.turnAngleRad * dt * 1.5,
      );
      targetRef.vx = Math.cos(baseHeading) * speed;
      targetRef.vy = Math.sin(baseHeading) * speed;
      targetRef.headingRad = baseHeading;
    } else {
      // Фаза 3: Бреющий слалом-змейка к базе по синусоиде
      const normalAngle = baseHeading + Math.PI / 2;
      const slalomOffset =
        Math.sin((flightTimer - 4.5) * TERRAIN_HUGGER_CONFIG.slalomFrequency) *
        TERRAIN_HUGGER_CONFIG.slalomAmplitude;

      // Направляющий вектор к базе + поперечное синусоидальное смещение
      const courseX = Math.cos(toBaseAngle) * speed + Math.cos(normalAngle) * slalomOffset;
      const courseY = Math.sin(toBaseAngle) * speed + Math.sin(normalAngle) * slalomOffset;
      const actualCourse = Math.atan2(courseY, courseX);

      targetRef.vx = Math.cos(actualCourse) * speed;
      targetRef.vy = Math.sin(actualCourse) * speed;
      targetRef.headingRad = actualCourse;
    }

    let deg = Math.round(Phaser.Math.RadToDeg(targetRef.headingRad));
    if (deg < 0) deg += 360;
    targetRef.headingDeg = deg;

    // Прямолинейное перемещение координаты за тик
    targetRef.x += targetRef.vx * dt;
    targetRef.y += targetRef.vy * dt;

    // 2. ЦИКЛ СКРЫТНОСТИ (ПОЛЁТ В ТЕНИ РЕЛЬЕФА / ВСПЫШКА НАД ХОЛМАМИ)
    if (isPermanentlyRevealed || targetRef.isScanned) {
      // Доплеровский захват СУО: цель раскрыта навсегда
      isSubmerged = false;
      targetRef.isSubmerged = false;
    } else {
      const cyclePeriod =
        TERRAIN_HUGGER_CONFIG.revealedDuration +
        TERRAIN_HUGGER_CONFIG.submergedDuration;
      const normalizedCycle = cycleTimer % cyclePeriod;

      const wasSubmerged = isSubmerged;

      if (normalizedCycle < TERRAIN_HUGGER_CONFIG.revealedDuration) {
        // Окно видимости над рельефом
        isSubmerged = false;
        targetRef.isSubmerged = false;
        lastObservedPos = { x: targetRef.x, y: targetRef.y };
        lastObservedVel = { vx: targetRef.vx, vy: targetRef.vy };

        // Звуковой и визуальный триггер появления
        if (wasSubmerged) {
          onPopUp?.();
        }
      } else {
        // Нырок в складку рельефа
        isSubmerged = true;
        targetRef.isSubmerged = true;

        // В момент ухода в тень рассчитываем инерционный прогноз СУО
        if (!wasSubmerged) {
          computeDeadReckoning();
        }
      }
    }
  };

  /**
   * Фиксация сканирования: снятие маскировки навсегда
   */
  const onTargetScanned = (targetId: number): void => {
    if (active && targetRef && targetRef.id === targetId) {
      isPermanentlyRevealed = true;
      isSubmerged = false;
      targetRef.isSubmerged = false;
      targetRef.isScanned = true;
    }
  };

  /**
   * Обработка уничтожения цели
   */
  const onTargetDestroyed = (targetId: number): void => {
    if (active && targetRef && targetRef.id === targetId) {
      active = false;
      targetRef = null;
    }
  };

  /**
   * Отрисовка элементов штурмовика и подсказок экстраполяции СУО
   */
  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!active || !targetRef) return;

    const { colors } = TERRAIN_HUGGER_CONFIG;

    // 1. КОГДА БОРТ В ТЕНИ РЕЛЬЕФА: ПУНКТИР ИНЕРЦИОННОГО ПРОГНОЗА СУО
    if (isSubmerged && !isPermanentlyRevealed) {
      // 1.1. Едва заметная рябь помех рельефа в реальной точке борта (Ground Clutter)
      if (Math.random() < 0.40) {
        const jx = targetRef.x + (Math.random() - 0.5) * 8;
        const jy = targetRef.y + (Math.random() - 0.5) * 8;
        graphics.fillStyle(colors.groundClutter, 0.22);
        graphics.fillCircle(jx, jy, 1.4);
      }

      // 1.2. Пунктирные точки инерционной экстраполяции СУО (Dead Reckoning)
      for (let i = 0; i < predictionPips.length; i++) {
        const pip = predictionPips[i];
        const pipAlpha = 0.35 + (i / predictionPips.length) * 0.45;
        graphics.fillStyle(colors.predictionPip, pipAlpha);
        graphics.fillCircle(pip.x, pip.y, 2.0);
      }

      // 1.3. Пульсирующая тактическая рамка расчетной зоны выхода [ ? ]
      const bracketPulse = 0.5 + 0.5 * Math.sin(cycleTimer * 10);
      const ex = estimatedEmergencePoint.x;
      const ey = estimatedEmergencePoint.y;
      const bSize = 6;

      graphics.lineStyle(1.4, colors.predictionBracket, 0.45 + bracketPulse * 0.45);
      // Угловые засечки рамки [ ? ]
      graphics.beginPath();
      // Левый угол
      graphics.moveTo(ex - bSize, ey - bSize + 2);
      graphics.lineTo(ex - bSize, ey - bSize);
      graphics.lineTo(ex - bSize + 2, ey - bSize);
      // Правый угол
      graphics.moveTo(ex + bSize, ey - bSize + 2);
      graphics.lineTo(ex + bSize, ey - bSize);
      graphics.lineTo(ex + bSize - 2, ey - bSize);
      // Нижний левый
      graphics.moveTo(ex - bSize, ey + bSize - 2);
      graphics.lineTo(ex - bSize, ey + bSize);
      graphics.lineTo(ex - bSize + 2, ey + bSize);
      // Нижний правый
      graphics.moveTo(ex + bSize, ey + bSize - 2);
      graphics.lineTo(ex + bSize, ey + bSize);
      graphics.lineTo(ex + bSize - 2, ey + bSize);
      graphics.strokePath();

      return;
    }

    // 2. КОГДА БОРТ НАД ХОЛМАМИ (ИЛИ ПОЛНОСТЬЮ РАСКРЫТ СКАНЕРОМ)
    const tx = targetRef.x;
    const ty = targetRef.y;
    const h = targetRef.headingRad;

    // Векторы ориентации стреловидного силуэта
    const forwardX = Math.cos(h);
    const forwardY = Math.sin(h);
    const rightX = -forwardY;
    const rightY = forwardX;

    // Силуэт хищного штурмовика переменной стреловидности (Su-24 / Tornado IDS)
    const noseLen = 7;
    const tailLen = 5;
    const wingSpan = 6.5;

    graphics.lineStyle(1.6, colors.body, 0.95);
    graphics.beginPath();
    // Нос
    graphics.moveTo(tx + forwardX * noseLen, ty + forwardY * noseLen);
    // Правое крыло
    graphics.lineTo(
      tx - forwardX * (tailLen * 0.3) + rightX * wingSpan,
      ty - forwardY * (tailLen * 0.3) + rightY * wingSpan,
    );
    // Правый хвостовой срез
    graphics.lineTo(
      tx - forwardX * tailLen + rightX * 2,
      ty - forwardY * tailLen + rightY * 2,
    );
    // Хвост / сопло
    graphics.lineTo(tx - forwardX * tailLen, ty - forwardY * tailLen);
    // Левый хвостовой срез
    graphics.lineTo(
      tx - forwardX * tailLen - rightX * 2,
      ty - forwardY * tailLen - rightY * 2,
    );
    // Левое крыло
    graphics.lineTo(
      tx - forwardX * (tailLen * 0.3) - rightX * wingSpan,
      ty - forwardY * (tailLen * 0.3) - rightY * wingSpan,
    );
    graphics.closePath();
    graphics.strokePath();

    // Яркое белое сопло форсажа в хвосте
    graphics.fillStyle(colors.core, 0.95);
    graphics.fillCircle(
      tx - forwardX * (tailLen + 1),
      ty - forwardY * (tailLen + 1),
      1.8,
    );
  };

  return {
    get isActive() {
      return active;
    },
    get activeTarget() {
      return targetRef;
    },
    get isSubmerged() {
      return isSubmerged;
    },
    get isPermanentlyRevealed() {
      return isPermanentlyRevealed;
    },
    spawn,
    update,
    render,
    onTargetScanned,
    onTargetDestroyed,
    reset,
  };
}
