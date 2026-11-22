import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from '../gameConfig';

/**
 * Параметры настройки самолёта РЭБ (Electronic Warfare Jammer Aircraft)
 */
export const JAMMER_CONFIG = {
  minWave: 3, // Доступен с 3-й волны
  waveChance: 0.28, // 28% шанс появления на волне 3+
  delayMin: 4.0, // мин. задержка вылета от старта волны (сек)
  delayMax: 14.0, // макс. задержка вылета (сек)
  maxOrbitDuration: 28.0, // время активного барражирования РЭБ на орбите до ухода из сектора (сек)
  speed: 26, // Скорость орбитального облёта (px/сек)
  orbitRadiusFactor: 0.82, // Дистанция орбиты (82% радиуса радара)
  strobeHalfAngle: 0.26, // Полуширина конуса помех (~30 градусов суммарно)
  strobeNoiseSpikesCount: 9, // Количество мерцающих лучевых игл шума
  pulseRingMaxRadius: 18, // Радиус расходящихся волн излучения антенны РЭБ
  colors: {
    strobeBeam: 0xf59e0b, // Янтарно-золотой фон строба помех
    strobeNoise: 0xfef08a, // Иглы белого шума в стробе
    strobeEdge: 0xd97706, // Ограничительные лучи сектора помех
    jammerBody: 0xf59e0b, // Корпус самолёта РЭБ
    jammerCore: 0xffedd5, // Раскалённое ядро антенны
    jammerPulse: 0xfbbf24, // Волны радиоизлучения антенны
  },
};

/**
 * Интерфейс менеджера самолёта РЭБ
 */
export interface JammerAircraftManager {
  readonly isActive: boolean;
  readonly activeTarget: GameTarget | null;
  readonly strobeAngle: number;
  readonly strobeHalfAngle: number;
  isTargetJammed: (target: GameTarget) => boolean;
  spawn: (wave: number) => GameTarget;
  update: (dt: number) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  reset: () => void;
  onTargetDestroyed: (targetId: number) => void;
}

/**
 * Фабрика изолированного менеджера самолёта РЭБ
 */
export function createJammerAircraftManager(): JammerAircraftManager {
  let active = false;
  let jammerTarget: GameTarget | null = null;
  let isEgressing = false;

  // Орбитальные координаты движения
  let currentOrbitAngle = 0;
  let orbitDirection = 1; // 1 = по часовой, -1 = против
  let activeTimer = 0;
  let pulseTimer = 0;

  const reset = (): void => {
    active = false;
    jammerTarget = null;
    isEgressing = false;
    currentOrbitAngle = 0;
    orbitDirection = 1;
    activeTimer = 0;
    pulseTimer = 0;
  };

  /**
   * Проверка, перекрыта ли цель конусом радиоэлектронных помех
   */
  const isTargetJammed = (target: GameTarget): boolean => {
    if (!active || !jammerTarget) return false;
    // Сам самолёт РЭБ не глушит сам себя
    if (target.id === jammerTarget.id || target.isJammer) return false;

    // Азимут цели относительно базы
    const targetAngle = Math.atan2(
      target.y - GAME_CONFIG.radarY,
      target.x - GAME_CONFIG.radarX,
    );

    // Центральный азимут конуса помех (от самолёта прямо в центр базы)
    const jammerAngle = Math.atan2(
      jammerTarget.y - GAME_CONFIG.radarY,
      jammerTarget.x - GAME_CONFIG.radarX,
    );

    const diff = Math.abs(Phaser.Math.Angle.Wrap(targetAngle - jammerAngle));
    return diff <= JAMMER_CONFIG.strobeHalfAngle;
  };

  /**
   * Спавн самолёта РЭБ на внешней орбите радара
   */
  const spawn = (wave: number): GameTarget => {
    active = true;
    isEgressing = false;
    activeTimer = 0;
    pulseTimer = 0;

    // Случайный сектор старта
    currentOrbitAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    orbitDirection = Math.random() < 0.5 ? 1 : -1;

    const orbitRadius = GAME_CONFIG.radarRadius * JAMMER_CONFIG.orbitRadiusFactor;
    const x = GAME_CONFIG.radarX + Math.cos(currentOrbitAngle) * orbitRadius;
    const y = GAME_CONFIG.radarY + Math.sin(currentOrbitAngle) * orbitRadius;

    // Тангенциальный курс по орбите
    const tangentHeading = currentOrbitAngle + (Math.PI / 2) * orbitDirection;
    const speed = JAMMER_CONFIG.speed * (1 + Math.min(0.2, (wave - 3) * 0.03));

    let deg = Math.round(Phaser.Math.RadToDeg(tangentHeading));
    if (deg < 0) deg += 360;

    const target: GameTarget = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'jammer',
      x,
      y,
      vx: Math.cos(tangentHeading) * speed,
      vy: Math.sin(tangentHeading) * speed,
      speed,
      headingDeg: deg,
      headingRad: tangentHeading,
      targetHeadingRad: tangentHeading,
      turnRate: 0,
      signal: 92,
      alpha: 1.0,
      isJammer: true,
    };

    jammerTarget = target;
    return target;
  };

  /**
   * Обновление положения борта по орбите и физики конуса глушения
   */
  const update = (dt: number): void => {
    if (!jammerTarget) return;

    activeTimer += dt;
    pulseTimer += dt;

    // Завершение времени боевого дежурства РЭБ: уход из сектора наружу
    if (activeTimer >= JAMMER_CONFIG.maxOrbitDuration && !isEgressing) {
      isEgressing = true;
      active = false; // выключаем строб глушения помех
      const outwardAngle = Math.atan2(
        jammerTarget.y - GAME_CONFIG.radarY,
        jammerTarget.x - GAME_CONFIG.radarX,
      );
      jammerTarget.headingRad = outwardAngle;
      jammerTarget.targetHeadingRad = outwardAngle;
      jammerTarget.speed = jammerTarget.speed * 1.6;
      jammerTarget.vx = Math.cos(outwardAngle) * jammerTarget.speed;
      jammerTarget.vy = Math.sin(outwardAngle) * jammerTarget.speed;
      let deg = Math.round(Phaser.Math.RadToDeg(outwardAngle));
      if (deg < 0) deg += 360;
      jammerTarget.headingDeg = deg;
      jammerTarget.isEgressing = true;
    }

    if (isEgressing) {
      jammerTarget.x += jammerTarget.vx * dt;
      jammerTarget.y += jammerTarget.vy * dt;
      return;
    }

    // Обновление орбитального угла (постоянная круговая дуга)
    const orbitRadius = GAME_CONFIG.radarRadius * JAMMER_CONFIG.orbitRadiusFactor;
    const angularSpeed = (jammerTarget.speed / orbitRadius) * orbitDirection;
    currentOrbitAngle += angularSpeed * dt;

    // Координаты на орбите
    jammerTarget.x = GAME_CONFIG.radarX + Math.cos(currentOrbitAngle) * orbitRadius;
    jammerTarget.y = GAME_CONFIG.radarY + Math.sin(currentOrbitAngle) * orbitRadius;

    // Курс строго по касательной
    const tangentHeading = currentOrbitAngle + (Math.PI / 2) * orbitDirection;
    jammerTarget.headingRad = tangentHeading;
    jammerTarget.targetHeadingRad = tangentHeading;
    jammerTarget.vx = Math.cos(tangentHeading) * jammerTarget.speed;
    jammerTarget.vy = Math.sin(tangentHeading) * jammerTarget.speed;

    let deg = Math.round(Phaser.Math.RadToDeg(tangentHeading));
    if (deg < 0) deg += 360;
    jammerTarget.headingDeg = deg;
  };

  /**
   * Обработка уничтожения цели
   */
  const onTargetDestroyed = (targetId: number): void => {
    if (jammerTarget && jammerTarget.id === targetId) {
      active = false;
      isEgressing = false;
      jammerTarget = null;
    }
  };

  /**
   * Отрисовка конуса радиопомех («Шумовой Строб») и антенны РЭБ
   */
  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!jammerTarget) return;

    if (active && !isEgressing) {
      const { radarX, radarY, radarRadius } = GAME_CONFIG;
      const jammerAngle = Math.atan2(jammerTarget.y - radarY, jammerTarget.x - radarX);
      const half = JAMMER_CONFIG.strobeHalfAngle;
      const aStart = jammerAngle - half;
      const aEnd = jammerAngle + half;

      // Пульсация помех
      const pulse = 0.7 + 0.3 * Math.sin(activeTimer * 12);
      const orbitRadius = radarRadius * JAMMER_CONFIG.orbitRadiusFactor;

      // 1. ПОЛУПРОЗРАЧНЫЙ СЕКТОР ГЛУШЕНИЯ (Шумовой клин от базы до самолёта РЭБ)
      graphics.fillStyle(JAMMER_CONFIG.colors.strobeBeam, 0.08 * pulse);
      graphics.beginPath();
      graphics.moveTo(radarX, radarY);
      graphics.arc(radarX, radarY, orbitRadius + 10, aStart, aEnd, false);
      graphics.closePath();
      graphics.fillPath();

      // 2. БОКОВЫЕ ОГРАНИЧИТЕЛЬНЫЕ ЛУЧИ КОНУСА
      graphics.lineStyle(1.2, JAMMER_CONFIG.colors.strobeEdge, 0.35 * pulse);
      graphics.beginPath();
      graphics.moveTo(radarX, radarY);
      graphics.lineTo(
        radarX + Math.cos(aStart) * (orbitRadius + 8),
        radarY + Math.sin(aStart) * (orbitRadius + 8),
      );
      graphics.moveTo(radarX, radarY);
      graphics.lineTo(
        radarX + Math.cos(aEnd) * (orbitRadius + 8),
        radarY + Math.sin(aEnd) * (orbitRadius + 8),
      );
      graphics.strokePath();

      // 3. МЕРЦАЮЩИЕ РАДИАЛЬНЫЕ ИГЛЫ БЕЛОГО ШУМА (CRT Hash / Interference Strobe)
      const spikeCount = JAMMER_CONFIG.strobeNoiseSpikesCount;
      for (let i = 0; i < spikeCount; i++) {
        // Псевдослучайный сдвиг угла иглы внутри сектора
        const phaseOffset = Math.sin(activeTimer * 35 + i * 1.7);
        const spikeAngle = jammerAngle + (phaseOffset * half * 0.92);
        const spikeLen = orbitRadius * (0.35 + 0.65 * ((Math.sin(activeTimer * 40 + i * 2.3) + 1) * 0.5));
        const spikeAlpha = 0.25 + 0.5 * Math.abs(Math.cos(activeTimer * 28 + i));

        graphics.lineStyle(1.0, JAMMER_CONFIG.colors.strobeNoise, spikeAlpha * 0.45);
        graphics.beginPath();
        graphics.moveTo(radarX, radarY);
        graphics.lineTo(
          radarX + Math.cos(spikeAngle) * spikeLen,
          radarY + Math.sin(spikeAngle) * spikeLen,
        );
        graphics.strokePath();
      }

      // 4. РАСХОДЯЩИЕСЯ ИМПУЛЬСНЫЕ КОЛЬЦА АНТЕННЫ РЭБ
      const ringProgress = (pulseTimer * 1.8) % 1.0;
      const ringRadius = 6 + ringProgress * JAMMER_CONFIG.pulseRingMaxRadius;
      const ringAlpha = (1.0 - ringProgress) * 0.75;
      graphics.lineStyle(1.4, JAMMER_CONFIG.colors.jammerPulse, ringAlpha);
      graphics.strokeCircle(jammerTarget.x, jammerTarget.y, ringRadius);
    }

    // 5. СПЕЦИАЛЬНАЯ ОТМЕТКА САМОЛЁТА РЭБ (Ромбовидный маркер с антенными усиками)
    const jx = jammerTarget.x;
    const jy = jammerTarget.y;
    const r = 5.0;

    // Внешнее ромбовидное свечение
    graphics.lineStyle(1.6, JAMMER_CONFIG.colors.jammerBody, 0.95);
    graphics.beginPath();
    graphics.moveTo(jx, jy - r);
    graphics.lineTo(jx + r, jy);
    graphics.lineTo(jx, jy + r);
    graphics.lineTo(jx - r, jy);
    graphics.closePath();
    graphics.strokePath();

    // Горящее ядро излучателя в центре
    graphics.fillStyle(JAMMER_CONFIG.colors.jammerCore, 0.95);
    graphics.fillCircle(jx, jy, 2.0);

    // Антенные микро-риски по бокам
    const antLen = 4;
    graphics.lineStyle(1.2, JAMMER_CONFIG.colors.jammerBody, 0.85);
    graphics.lineBetween(jx - r - antLen, jy, jx - r, jy);
    graphics.lineBetween(jx + r, jy, jx + r + antLen, jy);
  };

  return {
    get isActive() {
      return active;
    },
    get activeTarget() {
      return jammerTarget;
    },
    get strobeAngle() {
      if (!jammerTarget) return 0;
      return Math.atan2(jammerTarget.y - GAME_CONFIG.radarY, jammerTarget.x - GAME_CONFIG.radarX);
    },
    get strobeHalfAngle() {
      return JAMMER_CONFIG.strobeHalfAngle;
    },
    isTargetJammed,
    spawn,
    update,
    render,
    reset,
    onTargetDestroyed,
  };
}
