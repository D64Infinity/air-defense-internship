import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget, type TargetType } from './gameConfig';

/**
 * Расчёт расстояния от координат (x, y) до центра базы
 */
export function getDistToBase(x: number, y: number): number {
  return Math.hypot(x - GAME_CONFIG.radarX, y - GAME_CONFIG.radarY);
}

/**
 * Поиск ближайшей цели к координатам курсора в радиусе захвата
 */
export function findTargetNear(
  targets: GameTarget[],
  x: number,
  y: number,
  minDist: number = GAME_CONFIG.selectionHitRadius,
): GameTarget | null {
  let closest: GameTarget | null = null;
  let minD = minDist;

  for (const target of targets) {
    if (target.alpha > 0.04) {
      const d = Math.hypot(target.x - x, target.y - y);
      if (d < minD) {
        minD = d;
        closest = target;
      }
    }
  }
  return closest;
}

/**
 * Таблица стратегий поведения ИИ при манёвре для каждого типа цели
 */
export const TARGET_MANEUVERS: Record<TargetType, (target: GameTarget) => void> = {
  missile: () => {
    // Ракеты идут по прямолинейной траектории к базе без манёвров
  },
  decoy: () => {
    // Ловушки следуют заданной хордовой траектории
  },
  bomber: (target) => {
    // 70% шанс доворота прямо на базу для атаки, 30% транзитный уход
    if (Math.random() < 0.7) {
      target.targetHeadingRad = Math.atan2(
        GAME_CONFIG.radarY - target.y,
        GAME_CONFIG.radarX - target.x,
      );
    } else {
      target.targetHeadingRad =
        target.headingRad + Phaser.Math.FloatBetween(-0.6, 0.6);
    }
  },
  friend: (target) => {
    // Союзник: 50% заход на базу (посадка), 50% транзитный пролёт
    if (Math.random() < 0.5) {
      target.targetHeadingRad = Math.atan2(
        GAME_CONFIG.radarY - target.y,
        GAME_CONFIG.radarX - target.x,
      );
    } else {
      target.targetHeadingRad =
        target.headingRad + Phaser.Math.FloatBetween(-0.5, 0.5);
    }
  },
};

/**
 * Выполнение манёвра цели в соответствии с её типом
 */
export function executeTargetManeuver(target: GameTarget): void {
  TARGET_MANEUVERS[target.type]?.(target);
}

/**
 * Перевод судна в прямолинейный отход (после сброса бомб)
 */
export function disengageTarget(target: GameTarget): void {
  target.targetHeadingRad = target.headingRad;
  target.turnRate = 0;
  target.vx = Math.cos(target.headingRad) * target.speed;
  target.vy = Math.sin(target.headingRad) * target.speed;
}

/**
 * Обновление физики движения, доворота курса и затухания люминофора цели
 */
export function updateTargetMotion(target: GameTarget, dt: number): void {
  // 1. Проверка таймера запланированного манёвра
  if (target.maneuverTimer !== undefined && !target.hasManeuvered) {
    target.maneuverTimer -= dt;
    if (target.maneuverTimer <= 0) {
      target.hasManeuvered = true;
      executeTargetManeuver(target);
    }
  }

  // 2. Плавный доворот судна к целевому курсу
  if (target.turnRate > 0 && target.headingRad !== target.targetHeadingRad) {
    target.headingRad = Phaser.Math.Angle.RotateTo(
      target.headingRad,
      target.targetHeadingRad,
      target.turnRate * dt,
    );
    target.vx = Math.cos(target.headingRad) * target.speed;
    target.vy = Math.sin(target.headingRad) * target.speed;

    let deg = Math.round(Phaser.Math.RadToDeg(target.headingRad));
    if (deg < 0) deg += 360;
    target.headingDeg = deg;
  }

  // 3. Линейное перемещение
  target.x += target.vx * dt;
  target.y += target.vy * dt;

  // 4. Затухание люминофора
  if (target.alpha > 0) {
    target.alpha = Math.max(0, target.alpha - dt / GAME_CONFIG.blipFadeDuration);
  }
}

/**
 * События перемещения и пересечения границ целей
 */
export type TargetSimulationEvent =
  | { type: 'missile_hit'; target: GameTarget }
  | { type: 'bomber_bomb'; target: GameTarget }
  | { type: 'friend_landed'; target: GameTarget }
  | { type: 'friend_exited'; target: GameTarget }
  | { type: 'decoy_passed_base'; target: GameTarget }
  | { type: 'decoy_dissipated'; target: GameTarget }
  | { type: 'decoy_exited'; target: GameTarget }
  | { type: 'target_escaped'; target: GameTarget };

/**
 * Результат одного тика симуляции массива целей
 */
export interface SimulationStepResult {
  events: TargetSimulationEvent[];
  targetsToRemove: GameTarget[];
}

/**
 * Полный шаг симуляции целей: движение, маневры, угасание и детекция достижения базы или границы
 */
export function updateTargetsSimulation(
  targets: GameTarget[],
  dt: number,
): SimulationStepResult {
  const events: TargetSimulationEvent[] = [];
  const targetsToRemove: GameTarget[] = [];
  const baseRadius = GAME_CONFIG.baseRadius;
  const exitRadius = GAME_CONFIG.radarRadius * 1.05;

  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    updateTargetMotion(target, dt);

    const distToBase = getDistToBase(target.x, target.y);

    if (distToBase < baseRadius) {
      if (target.type === 'missile') {
        events.push({ type: 'missile_hit', target });
        targetsToRemove.push(target);
      } else if (target.type === 'bomber') {
        if (!target.hasBombedBase) {
          target.hasBombedBase = true;
          disengageTarget(target);
          events.push({ type: 'bomber_bomb', target });
        }
      } else if (target.type === 'friend') {
        events.push({ type: 'friend_landed', target });
        targetsToRemove.push(target);
      } else if (target.type === 'decoy') {
        if (target.decoyPassesThroughBase && !target.hasPassedBase) {
          target.hasPassedBase = true;
          events.push({ type: 'decoy_passed_base', target });
        } else if (!target.decoyPassesThroughBase) {
          events.push({ type: 'decoy_dissipated', target });
          targetsToRemove.push(target);
        }
      }
    } else if (distToBase > exitRadius) {
      if (target.type === 'friend') {
        events.push({ type: 'friend_exited', target });
      } else if (target.type === 'decoy') {
        events.push({ type: 'decoy_exited', target });
      } else {
        events.push({ type: 'target_escaped', target });
      }
      targetsToRemove.push(target);
    }
  }

  return { events, targetsToRemove };
}
