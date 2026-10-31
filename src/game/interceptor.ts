import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from './gameConfig';

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

    // Гиперзвуковой расчёт времени полёта: от 0.20с на ближней дистанции до 0.28с на границе радара
    const duration = 0.18 + Math.min(0.12, (dist / GAME_CONFIG.radarRadius) * 0.12);

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
        const curvedProgress = Math.pow(progress, 1.35);

        flight.currentX =
          flight.startX + (flight.target.x - flight.startX) * curvedProgress;
        flight.currentY =
          flight.startY + (flight.target.y - flight.startY) * curvedProgress;

        // Добавление новой точки в инверсионный след
        flight.trail.push({
          x: flight.currentX,
          y: flight.currentY,
          age: 0,
          maxLife: 0.35, // время таяния следа на люминофоре (0.35 сек)
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
  for (const flight of units) {
    // 1. Отрисовка инверсионного следа
    if (flight.trail.length > 1) {
      for (let k = 1; k < flight.trail.length; k++) {
        const p1 = flight.trail[k - 1];
        const p2 = flight.trail[k];
        const alpha = Math.max(0, 1 - p2.age / p2.maxLife) * 0.75;
        if (alpha > 0.02) {
          graphics.lineStyle(1.8, 0x38bdf8, alpha);
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
      graphics.fillStyle(0x38bdf8, 0.55);
      graphics.fillCircle(flight.currentX, flight.currentY, 4.5);

      // Яркое белое ядро
      graphics.fillStyle(0xd4ffea, 0.95);
      graphics.fillCircle(flight.currentX, flight.currentY, 2.2);
    }
  }
}
