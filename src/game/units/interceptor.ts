import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from '../gameConfig';

/**
 * Конфигурация противоракетного комплекса ПВО (Interceptors)
 */
export const INTERCEPTOR_CONFIG = {
  // Параметры гиперзвукового полёта ракеты-перехватчика
  minFlightDuration: 0.18, // базовая длительность полёта на ближней дистанции (сек)
  flightDurationScale: 0.12, // добавка времени на максимальной дальности радара (сек)
  accelerationExponent: 1.35, // нелинейный разгон твердотопливного ускорителя (t^1.35)

  // Инверсионный след на люминофоре ЭЛТ
  trailMaxLife: 0.35, // время таяния следа на экране (сек)
  trailLineWidth: 1.8, // толщина линии следа (px)
  trailMaxAlpha: 0.75, // максимальная яркость следа
  trailAlphaThreshold: 0.02, // порог отсечки затухающего следа

  // Геометрия боевой головной части
  haloRadius: 4.5, // радиус бирюзового ореола ракеты (px)
  haloAlpha: 0.55, // прозрачность ореола
  coreRadius: 2.2, // радиус яркого ядра (px)
  coreAlpha: 0.95, // непрозрачность ядра
} as const;

/**
 * Точка высокотемпературного инверсионного следа ракеты на люминофоре
 */
export interface InterceptorTrailPoint {
  x: number;
  y: number;
  age: number;
  maxLife: number;
}

/**
 * Описание состояния ракеты-перехватчика в полёте
 */
export interface InterceptorUnit {
  id: number;
  startX: number;
  startY: number;
  target: GameTarget;
  currentX: number;
  currentY: number;
  age: number;
  duration: number;
  isImpacted: boolean;
  trail: InterceptorTrailPoint[];
  onImpact: (target: GameTarget) => void;
}

/**
 * Интерфейс подсистемы управления ракетами-перехватчиками ПВО
 */
export interface InterceptorManager {
  readonly activeUnits: readonly InterceptorUnit[];
  launch: (target: GameTarget, onImpact: (target: GameTarget) => void) => void;
  update: (dt: number) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  reset: () => void;
}

/**
 * Фабрика менеджера ракет-перехватчиков ПВО
 */
export function createInterceptorManager(): InterceptorManager {
  let nextId = 1;
  const units: InterceptorUnit[] = [];

  /**
   * Пуск ракеты-перехватчика из центра базы к назначенной цели
   */
  const launch = (
    target: GameTarget,
    onImpact: (target: GameTarget) => void,
  ): void => {
    const startX = GAME_CONFIG.radarX;
    const startY = GAME_CONFIG.radarY;
    const dist = Math.hypot(target.x - startX, target.y - startY);

    // Гиперзвуковой расчёт времени полёта: от 0.18с на ближней дистанции до 0.30с на границе радара
    const duration =
      INTERCEPTOR_CONFIG.minFlightDuration +
      Math.min(
        INTERCEPTOR_CONFIG.flightDurationScale,
        (dist / GAME_CONFIG.radarRadius) * INTERCEPTOR_CONFIG.flightDurationScale,
      );

    units.push({
      id: nextId++,
      startX,
      startY,
      target,
      currentX: startX,
      currentY: startY,
      age: 0,
      duration,
      isImpacted: false,
      trail: [],
      onImpact,
    });
  };

  /**
   * Обновление физики полёта, нелинейного разгона и угасания трассеров
   */
  const update = (dt: number): void => {
    for (let i = units.length - 1; i >= 0; i--) {
      const flight = units[i];
      flight.age += dt;

      // Обновление точек инверсионного следа
      for (let k = flight.trail.length - 1; k >= 0; k--) {
        flight.trail[k].age += dt;
        if (flight.trail[k].age >= flight.trail[k].maxLife) {
          flight.trail.splice(k, 1);
        }
      }

      if (!flight.isImpacted) {
        const progress = Math.min(1, flight.age / flight.duration);
        // Нелинейный разгон твердотопливного ускорителя (t^1.35)
        const curvedProgress = Math.pow(progress, INTERCEPTOR_CONFIG.accelerationExponent);

        flight.currentX =
          flight.startX + (flight.target.x - flight.startX) * curvedProgress;
        flight.currentY =
          flight.startY + (flight.target.y - flight.startY) * curvedProgress;

        // Добавление новой точки в инверсионный след
        flight.trail.push({
          x: flight.currentX,
          y: flight.currentY,
          age: 0,
          maxLife: INTERCEPTOR_CONFIG.trailMaxLife,
        });

        // Момент встречи с целью
        if (progress >= 1) {
          flight.isImpacted = true;
          flight.onImpact(flight.target);
        }
      }

      // Полная утилизация ракеты после детонации и растворения следа
      if (flight.isImpacted && flight.trail.length === 0) {
        units.splice(i, 1);
      }
    }
  };

  /**
   * Отрисовка летящих перехватчиков и инверсионных следов на холсте радара
   */
  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    renderInterceptors(graphics, units);
  };

  const reset = (): void => {
    units.length = 0;
  };

  return {
    get activeUnits() {
      return units;
    },
    launch,
    update,
    render,
    reset,
  };
}

/**
 * Отрисовка летящих перехватчиков и инверсионных следов на холсте радара
 */
export function renderInterceptors(
  graphics: Phaser.GameObjects.Graphics,
  units: readonly InterceptorUnit[],
): void {
  const { colors } = GAME_CONFIG;

  for (const flight of units) {
    // 1. Отрисовка инверсионного следа
    if (flight.trail.length > 1) {
      for (let k = 1; k < flight.trail.length; k++) {
        const p1 = flight.trail[k - 1];
        const p2 = flight.trail[k];
        const alpha = Math.max(0, 1 - p2.age / p2.maxLife) * INTERCEPTOR_CONFIG.trailMaxAlpha;
        if (alpha > INTERCEPTOR_CONFIG.trailAlphaThreshold) {
          graphics.lineStyle(INTERCEPTOR_CONFIG.trailLineWidth, colors.interceptorTrail, alpha);
          graphics.beginPath();
          graphics.moveTo(p1.x, p1.y);
          graphics.lineTo(p2.x, p2.y);
          graphics.strokePath();
        }
      }
    }

    // 2. Головная часть противоракеты (боевой блок)
    if (!flight.isImpacted) {
      // Мягкий бирюзовый ореол
      graphics.fillStyle(colors.interceptorHalo, INTERCEPTOR_CONFIG.haloAlpha);
      graphics.fillCircle(flight.currentX, flight.currentY, INTERCEPTOR_CONFIG.haloRadius);

      // Яркое белое ядро
      graphics.fillStyle(colors.interceptorCore, INTERCEPTOR_CONFIG.coreAlpha);
      graphics.fillCircle(flight.currentX, flight.currentY, INTERCEPTOR_CONFIG.coreRadius);
    }
  }
}
