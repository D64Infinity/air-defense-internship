import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from '../gameConfig';

/**
 * Режимы вылета синего технического/патрульного дрона:
 * - 'sweep': зачистка ложных целей или подозрительных отметок огнём автопушки
 * - 'escort': вылет на визуальное опознание и сопровождение «союзника» (проверка эхо)
 */
export type SweeperDroneMode = 'sweep' | 'escort';

/**
 * Параметры конфигурации патрульного дрона-чистильщика / эскорта
 */
export const SWEEPER_DRONE_CONFIG = {
  speed: 280, // пикселей в секунду (в ~6 раз быстрее обычных целей)
  attackDistance: 48, // дистанция открытия огня / сближения (px)
  burstDuration: 0.22, // длительность пулеметной очереди (сек)
  scanDuration: 0.35, // длительность радиосканирования при эскорте (сек)
  roundsCount: 3, // количество очередей / трассеров
  blipColor: 0x38bdf8, // технический небесно-синий цвет (Tailwind Sky-400)
  blipCoreColor: 0xf0f9ff, // белое ядро отметки
  tracerColor: 0xbae6fd, // цвет светящихся трассеров пуль
  scanRingColor: 0x38bdf8, // цвет круговой волны сканирования
  trailMaxLife: 0.22, // длительность угасания следа за дроном
};

/**
 * Точка инверсионного следа за дроном
 */
interface DroneTrailPoint {
  x: number;
  y: number;
  age: number;
}

/**
 * Трассер пули в очереди автопушки
 */
interface BulletTracer {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
}

/**
 * Фаза поведения дрона
 */
type DronePhase = 'approach' | 'firing' | 'exit';

/**
 * Интерфейс управления декоративным дроном зачистки и сопровождения
 */
export interface SweeperDroneManager {
  readonly isActive: boolean;
  readonly mode: SweeperDroneMode;
  dispatch: (target: GameTarget, mode?: SweeperDroneMode) => void;
  update: (
    dt: number,
    onTargetHit: (target: GameTarget) => void,
    onExited: () => void,
    playBurstSound?: (pan: number) => void,
  ) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  reset: () => void;
}

/**
 * Фабрика менеджера декоративного дрона зачистки и сопровождения
 */
export function createSweeperDroneManager(): SweeperDroneManager {
  let active = false;
  let mode: SweeperDroneMode = 'sweep';
  let targetRef: GameTarget | null = null;
  let phase: DronePhase = 'approach';

  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let heading = 0;

  let fireTimer = 0;
  let soundPlayed = false;
  let targetDestroyed = false;

  const trail: DroneTrailPoint[] = [];
  const tracers: BulletTracer[] = [];

  const reset = (): void => {
    active = false;
    mode = 'sweep';
    targetRef = null;
    phase = 'approach';
    trail.length = 0;
    tracers.length = 0;
    fireTimer = 0;
    soundPlayed = false;
    targetDestroyed = false;
  };

  /**
   * Запуск дрона из ближайшего сектора кромки радара на перехват цели
   */
  const dispatch = (target: GameTarget, droneMode: SweeperDroneMode = 'sweep'): void => {
    if (active) return;

    reset();
    active = true;
    mode = droneMode;
    targetRef = target;
    phase = 'approach';

    // Вычисляем угол цели относительно центра радара
    const angleToTarget = Math.atan2(
      target.y - GAME_CONFIG.radarY,
      target.x - GAME_CONFIG.radarX,
    );

    // Дрон спавнится на кромке радара под небольшим угловым смещением (~35 градусов)
    const spawnAngle = angleToTarget + (Math.random() < 0.5 ? 0.6 : -0.6);
    x = GAME_CONFIG.radarX + Math.cos(spawnAngle) * (GAME_CONFIG.radarRadius * 0.96);
    y = GAME_CONFIG.radarY + Math.sin(spawnAngle) * (GAME_CONFIG.radarRadius * 0.96);

    // Курс на цель
    heading = Math.atan2(target.y - y, target.x - x);
    vx = Math.cos(heading) * SWEEPER_DRONE_CONFIG.speed;
    vy = Math.sin(heading) * SWEEPER_DRONE_CONFIG.speed;
  };

  const update = (
    dt: number,
    onTargetHit: (target: GameTarget) => void,
    onExited: () => void,
    playBurstSound?: (pan: number) => void,
  ): void => {
    if (!active) return;

    // 1. Обновление инверсионного следа
    trail.push({ x, y, age: 0 });
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].age += dt;
      if (trail[i].age >= SWEEPER_DRONE_CONFIG.trailMaxLife) {
        trail.splice(i, 1);
      }
    }

    // 2. Логика фаз движения
    if (phase === 'approach') {
      if (targetRef) {
        // Коррекция курса на движущуюся цель
        const currentTargetAngle = Math.atan2(targetRef.y - y, targetRef.x - x);
        heading = Phaser.Math.Angle.RotateTo(heading, currentTargetAngle, 3.5 * dt);
        vx = Math.cos(heading) * SWEEPER_DRONE_CONFIG.speed;
        vy = Math.sin(heading) * SWEEPER_DRONE_CONFIG.speed;

        const dist = Math.hypot(targetRef.x - x, targetRef.y - y);
        if (dist <= SWEEPER_DRONE_CONFIG.attackDistance) {
          phase = 'firing';
          fireTimer =
            mode === 'escort'
              ? SWEEPER_DRONE_CONFIG.scanDuration
              : SWEEPER_DRONE_CONFIG.burstDuration;

          if (mode === 'sweep') {
            // Звуковой эффект очереди автопушки
            if (!soundPlayed && playBurstSound) {
              soundPlayed = true;
              const pan = Math.max(
                -1,
                Math.min(1, (x - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius),
              );
              playBurstSound(pan);
            }

            // Генерируем пачку тире-трассеров в сторону цели
            tracers.length = 0;
            for (let r = 0; r < SWEEPER_DRONE_CONFIG.roundsCount; r++) {
              const jitterX = Phaser.Math.FloatBetween(-3, 3);
              const jitterY = Phaser.Math.FloatBetween(-3, 3);
              tracers.push({
                startX: x,
                startY: y,
                endX: targetRef.x + jitterX,
                endY: targetRef.y + jitterY,
                progress: 0,
              });
            }
          }
        }
      }

      x += vx * dt;
      y += vy * dt;
    } else if (phase === 'firing') {
      fireTimer -= dt;

      if (mode === 'sweep') {
        // Обновляем прогресс полёта трассеров
        for (const tracer of tracers) {
          tracer.progress = Math.min(1, tracer.progress + dt * 6.5);
        }
      }

      x += vx * dt;
      y += vy * dt;

      // По окончании фазы (очереди выстрелов или сенсорного сканирования)
      if (fireTimer <= 0) {
        if (!targetDestroyed && targetRef) {
          targetDestroyed = true;
          onTargetHit(targetRef);
        }
        phase = 'exit';
        tracers.length = 0;

        // Поворот на отход к ближайшей границе радара
        const exitAngle = Math.atan2(y - GAME_CONFIG.radarY, x - GAME_CONFIG.radarX);
        heading = exitAngle;
        vx = Math.cos(heading) * SWEEPER_DRONE_CONFIG.speed;
        vy = Math.sin(heading) * SWEEPER_DRONE_CONFIG.speed;
      }
    } else if (phase === 'exit') {
      // Дрон на крейсерской скорости уходит за пределы радара
      x += vx * dt;
      y += vy * dt;

      const distFromCenter = Math.hypot(x - GAME_CONFIG.radarX, y - GAME_CONFIG.radarY);
      if (distFromCenter > GAME_CONFIG.radarRadius * 1.08) {
        active = false;
        onExited();
      }
    }
  };

  /**
   * Отрисовка декоративного дрона, трассеров, сканера и следа в экранных координатах радара
   */
  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!active) return;

    // 1. Инверсионный след (светло-синий люминофор)
    for (let i = 0; i < trail.length - 1; i++) {
      const p1 = trail[i];
      const p2 = trail[i + 1];
      const alpha = Math.max(0, 1 - p1.age / SWEEPER_DRONE_CONFIG.trailMaxLife) * 0.55;
      graphics.lineStyle(1.5, SWEEPER_DRONE_CONFIG.blipColor, alpha);
      graphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }

    // 2. Трассеры автопушки (в режиме зачистки)
    for (const tracer of tracers) {
      const t = tracer.progress;
      const headX = tracer.startX + (tracer.endX - tracer.startX) * t;
      const headY = tracer.startY + (tracer.endY - tracer.startY) * t;
      const tailProgress = Math.max(0, t - 0.28);
      const tailX = tracer.startX + (tracer.endX - tracer.startX) * tailProgress;
      const tailY = tracer.startY + (tracer.endY - tracer.startY) * tailProgress;

      graphics.lineStyle(2, SWEEPER_DRONE_CONFIG.tracerColor, 0.95);
      graphics.lineBetween(tailX, tailY, headX, headY);
    }

    // 3. Расширяющееся кольцо радиосканирования (в режиме эскорта при контакте)
    if (mode === 'escort' && phase === 'firing') {
      const scanProgress = 1 - Math.max(0, fireTimer / SWEEPER_DRONE_CONFIG.scanDuration);
      const scanRadius = scanProgress * 32;
      const alpha = (1 - scanProgress) * 0.85;
      graphics.lineStyle(1.5, SWEEPER_DRONE_CONFIG.scanRingColor, alpha);
      graphics.strokeCircle(x, y, scanRadius);
    }

    // 4. Отметка дрона на радаре (синий цвет союзного технического судна)
    // Внешнее кольцо
    graphics.lineStyle(1.5, SWEEPER_DRONE_CONFIG.blipColor, 0.9);
    graphics.strokeCircle(x, y, GAME_CONFIG.blipRadius + 1);

    // Внутреннее яркое ядро
    graphics.fillStyle(SWEEPER_DRONE_CONFIG.blipCoreColor, 0.95);
    graphics.fillCircle(x, y, 2.2);

    // Носик курсоуказателя дрона
    const noseX = x + Math.cos(heading) * (GAME_CONFIG.blipRadius + 4);
    const noseY = y + Math.sin(heading) * (GAME_CONFIG.blipRadius + 4);
    graphics.lineStyle(1.5, SWEEPER_DRONE_CONFIG.blipColor, 0.85);
    graphics.lineBetween(x, y, noseX, noseY);
  };

  return {
    get isActive() {
      return active;
    },
    get mode() {
      return mode;
    },
    dispatch,
    update,
    render,
    reset,
  };
}
