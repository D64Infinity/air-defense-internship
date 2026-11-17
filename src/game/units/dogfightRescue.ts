import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from '../gameConfig';

/**
 * Конфигурация сцены воздушного боя и спасения союзника
 */
export const DOGFIGHT_CONFIG = {
  pursuerCount: 3, // число истребителей перехвата
  pursuerSpeed: 235, // скорость захода врагов на хвост (px/сек)
  pursuerColor: 0xf97316, // агрессивный оранжевый цвет вражеских истребителей (Tailwind Orange-500)
  pursuerCoreColor: 0xffedd5, // ядро метки врага
  pursuerTracerColor: 0xfdba74, // цвет трассеров врага
  heroDroneSpeed: 310, // скорость дрона-спасателя на форсаже
  heroDroneColor: 0x38bdf8, // фирменный синий цвет союзного дрона
  heroCoreColor: 0xf0f9ff,
  heroTracerColor: 0xbae6fd,
  allyTracerColor: 0x86efac, // цвет ответных трассеров союзника
  blipRadius: 3.2,
};

/**
 * Состояние вражеского истребителя
 */
interface PursuerFighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  offsetAngle: number;
  offsetDist: number;
  isAlive: boolean;
  trail: { x: number; y: number; age: number }[];
}

/**
 * Трассер пули в бою
 */
interface DogfightTracer {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  color: number;
}

/**
 * Фазы кинематографичного эпизода
 */
type DogfightPhase = 'idle' | 'ambush' | 'rescue' | 'cleared';

/**
 * Интерфейс управления сценой воздушного боя
 */
export interface DogfightRescueManager {
  readonly isActive: boolean;
  readonly isCombatActive: boolean;
  start: (ally: GameTarget) => void;
  update: (
    dt: number,
    onPursuerKilled: (x: number, y: number) => void,
    onCompleted: (ally: GameTarget) => void,
    playBurstSound?: (pan: number) => void,
  ) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  reset: () => void;
}

/**
 * Фабрика менеджера сцены воздушного боя и спасения
 */
export function createDogfightRescueManager(): DogfightRescueManager {
  let active = false;
  let allyTarget: GameTarget | null = null;
  let phase: DogfightPhase = 'idle';

  let phaseTimer = 0;
  let fireCooldown = 0;

  // Дрон-спасатель
  let heroActive = false;
  let heroX = 0;
  let heroY = 0;
  let heroVx = 0;
  let heroVy = 0;
  let heroHeading = 0;
  const heroTrail: { x: number; y: number; age: number }[] = [];

  const pursuers: PursuerFighter[] = [];
  const tracers: DogfightTracer[] = [];

  const reset = (): void => {
    active = false;
    allyTarget = null;
    phase = 'idle';
    phaseTimer = 0;
    fireCooldown = 0;
    heroActive = false;
    pursuers.length = 0;
    tracers.length = 0;
    heroTrail.length = 0;
  };

  /**
   * Запуск воздушной засады позади союзника
   */
  const start = (ally: GameTarget): void => {
    if (active) return;
    reset();

    active = true;
    allyTarget = ally;
    phase = 'ambush';
    phaseTimer = 0;

    // Враги появляются на кромке радара позади союзника
    const reverseHeading = ally.headingRad + Math.PI;

    // Расставляем 3 истребителя веером на хвосте
    const offsets = [-0.28, 0, 0.28];
    for (let i = 0; i < DOGFIGHT_CONFIG.pursuerCount; i++) {
      const spawnAngle = reverseHeading + offsets[i];
      const spawnDist = GAME_CONFIG.radarRadius * 0.98;
      const x = GAME_CONFIG.radarX + Math.cos(spawnAngle) * spawnDist;
      const y = GAME_CONFIG.radarY + Math.sin(spawnAngle) * spawnDist;

      pursuers.push({
        x,
        y,
        vx: 0,
        vy: 0,
        heading: ally.headingRad,
        offsetAngle: offsets[i],
        offsetDist: 34 + Math.abs(offsets[i]) * 15, // расстояние удержания строя позади
        isAlive: true,
        trail: [],
      });
    }
  };

  const update = (
    dt: number,
    onPursuerKilled: (x: number, y: number) => void,
    onCompleted: (ally: GameTarget) => void,
    playBurstSound?: (pan: number) => void,
  ): void => {
    if (!active || !allyTarget) return;

    phaseTimer += dt;
    fireCooldown -= dt;

    // 1. Обновление прогресса летящих трассеров
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].progress += dt * 7.0;
      if (tracers[i].progress >= 1.2) {
        tracers.splice(i, 1);
      }
    }

    // 2. Фаза 1: Преследование и взаимная перестрелка (до 2.2 секунд)
    if (phase === 'ambush') {
      // Истребители настигают союзника и занимают боевой порядок
      for (const p of pursuers) {
        if (!p.isAlive) continue;

        // Точка позиции на хвосте союзника
        const targetX =
          allyTarget.x - Math.cos(allyTarget.headingRad + p.offsetAngle) * p.offsetDist;
        const targetY =
          allyTarget.y - Math.sin(allyTarget.headingRad + p.offsetAngle) * p.offsetDist;

        const distToSlot = Math.hypot(targetX - p.x, targetY - p.y);
        const desiredHeading = Math.atan2(targetY - p.y, targetX - p.x);
        p.heading = Phaser.Math.Angle.RotateTo(p.heading, desiredHeading, 4.0 * dt);

        const currentSpeed = distToSlot > 15 ? DOGFIGHT_CONFIG.pursuerSpeed : allyTarget.speed;
        p.vx = Math.cos(p.heading) * currentSpeed;
        p.vy = Math.sin(p.heading) * currentSpeed;

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Шлейф истребителя
        p.trail.push({ x: p.x, y: p.y, age: 0 });
        for (let k = p.trail.length - 1; k >= 0; k--) {
          p.trail[k].age += dt;
          if (p.trail[k].age >= 0.2) p.trail.splice(k, 1);
        }
      }

      // Стрельба очередями каждые 0.28 сек
      if (fireCooldown <= 0) {
        fireCooldown = 0.28;
        const livePursuers = pursuers.filter((p) => p.isAlive);
        if (livePursuers.length > 0) {
          const shooter = livePursuers[Math.floor(Math.random() * livePursuers.length)];
          // Выстрел врага по союзнику
          tracers.push({
            startX: shooter.x,
            startY: shooter.y,
            endX: allyTarget.x + Phaser.Math.FloatBetween(-6, 6),
            endY: allyTarget.y + Phaser.Math.FloatBetween(-6, 6),
            progress: 0,
            color: DOGFIGHT_CONFIG.pursuerTracerColor,
          });

          // Ответный огонь турели союзника
          tracers.push({
            startX: allyTarget.x,
            startY: allyTarget.y,
            endX: shooter.x + Phaser.Math.FloatBetween(-5, 5),
            endY: shooter.y + Phaser.Math.FloatBetween(-5, 5),
            progress: 0,
            color: DOGFIGHT_CONFIG.allyTracerColor,
          });

          if (playBurstSound) {
            const pan = Math.max(-1, Math.min(1, (allyTarget.x - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius));
            playBurstSound(pan);
          }
        }
      }

      // Через 2.0 секунды прилетает наш дрон-спасатель!
      if (phaseTimer >= 2.0) {
        phase = 'rescue';
        phaseTimer = 0;
        heroActive = true;

        // Дрон вылетает из внешней кромки под углом к преследователям
        const angle = allyTarget.headingRad + Math.PI + 0.85;
        heroX = GAME_CONFIG.radarX + Math.cos(angle) * (GAME_CONFIG.radarRadius * 0.98);
        heroY = GAME_CONFIG.radarY + Math.sin(angle) * (GAME_CONFIG.radarRadius * 0.98);

        // Курс прямо на первого преследователя
        const firstEnemy = pursuers.find((p) => p.isAlive) || pursuers[0];
        heroHeading = Math.atan2(firstEnemy.y - heroY, firstEnemy.x - heroX);
        heroVx = Math.cos(heroHeading) * DOGFIGHT_CONFIG.heroDroneSpeed;
        heroVy = Math.sin(heroHeading) * DOGFIGHT_CONFIG.heroDroneSpeed;
      }
    } else if (phase === 'rescue') {
      // Истребители продолжают держаться за союзником
      for (const p of pursuers) {
        if (!p.isAlive) continue;
        p.x += allyTarget.vx * dt;
        p.y += allyTarget.vy * dt;
      }

      // Дрон на форсаже летит к ближайшему живому врагу
      const liveEnemy = pursuers.find((p) => p.isAlive);
      if (liveEnemy) {
        const aimAngle = Math.atan2(liveEnemy.y - heroY, liveEnemy.x - heroX);
        heroHeading = Phaser.Math.Angle.RotateTo(heroHeading, aimAngle, 6.0 * dt);
        heroVx = Math.cos(heroHeading) * DOGFIGHT_CONFIG.heroDroneSpeed;
        heroVy = Math.sin(heroHeading) * DOGFIGHT_CONFIG.heroDroneSpeed;

        const dist = Math.hypot(liveEnemy.x - heroX, liveEnemy.y - heroY);
        if (dist <= 65 && fireCooldown <= 0) {
          fireCooldown = 0.22;
          // Очередь дрона
          tracers.push({
            startX: heroX,
            startY: heroY,
            endX: liveEnemy.x,
            endY: liveEnemy.y,
            progress: 0,
            color: DOGFIGHT_CONFIG.heroTracerColor,
          });

          if (playBurstSound) {
            const pan = Math.max(-1, Math.min(1, (heroX - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius));
            playBurstSound(pan);
          }

          // Поражение врага
          liveEnemy.isAlive = false;
          onPursuerKilled(liveEnemy.x, liveEnemy.y);
        }
      } else {
        // Все враги уничтожены! Переходим в режим безопасного ухода
        phase = 'cleared';
        phaseTimer = 0;
        onCompleted(allyTarget);
      }

      heroX += heroVx * dt;
      heroY += heroVy * dt;

      heroTrail.push({ x: heroX, y: heroY, age: 0 });
      for (let k = heroTrail.length - 1; k >= 0; k--) {
        heroTrail[k].age += dt;
        if (heroTrail[k].age >= 0.22) heroTrail.splice(k, 1);
      }
    } else if (phase === 'cleared') {
      // Дрон улетает по инерции за пределы экрана
      heroX += heroVx * dt;
      heroY += heroVy * dt;

      const heroDist = Math.hypot(heroX - GAME_CONFIG.radarX, heroY - GAME_CONFIG.radarY);
      if (heroDist > GAME_CONFIG.radarRadius * 1.1) {
        active = false;
      }
    }
  };

  /**
   * Отрисовка всех участников воздушного боя на графике радара
   */
  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!active) return;

    // 1. Трассеры перестрелки
    for (const tr of tracers) {
      const t = tr.progress;
      const headX = tr.startX + (tr.endX - tr.startX) * Math.min(1, t);
      const headY = tr.startY + (tr.endY - tr.startY) * Math.min(1, t);
      const tailP = Math.max(0, t - 0.28);
      const tailX = tr.startX + (tr.endX - tr.startX) * Math.min(1, tailP);
      const tailY = tr.startY + (tr.endY - tr.startY) * Math.min(1, tailP);

      graphics.lineStyle(2, tr.color, 0.95);
      graphics.lineBetween(tailX, tailY, headX, headY);
    }

    // 2. Вражеские истребители
    for (const p of pursuers) {
      if (!p.isAlive) continue;

      // Инверсионный след
      for (let i = 0; i < p.trail.length - 1; i++) {
        const pt1 = p.trail[i];
        const pt2 = p.trail[i + 1];
        const alpha = Math.max(0, 1 - pt1.age / 0.2) * 0.45;
        graphics.lineStyle(1.2, DOGFIGHT_CONFIG.pursuerColor, alpha);
        graphics.lineBetween(pt1.x, pt1.y, pt2.x, pt2.y);
      }

      // Отметка истребителя
      graphics.lineStyle(1.4, DOGFIGHT_CONFIG.pursuerColor, 0.9);
      graphics.strokeCircle(p.x, p.y, DOGFIGHT_CONFIG.blipRadius);
      graphics.fillStyle(DOGFIGHT_CONFIG.pursuerCoreColor, 0.95);
      graphics.fillCircle(p.x, p.y, 1.6);
    }

    // 3. Дрон-спасатель (синий союзный борт)
    if (heroActive) {
      for (let i = 0; i < heroTrail.length - 1; i++) {
        const pt1 = heroTrail[i];
        const pt2 = heroTrail[i + 1];
        const alpha = Math.max(0, 1 - pt1.age / 0.22) * 0.55;
        graphics.lineStyle(1.5, DOGFIGHT_CONFIG.heroDroneColor, alpha);
        graphics.lineBetween(pt1.x, pt1.y, pt2.x, pt2.y);
      }

      graphics.lineStyle(1.5, DOGFIGHT_CONFIG.heroDroneColor, 0.95);
      graphics.strokeCircle(heroX, heroY, GAME_CONFIG.blipRadius + 1);
      graphics.fillStyle(DOGFIGHT_CONFIG.heroCoreColor, 0.95);
      graphics.fillCircle(heroX, heroY, 2.2);
    }
  };

  return {
    get isActive() {
      return active;
    },
    get isCombatActive() {
      return active && (phase === 'ambush' || phase === 'rescue');
    },
    start,
    update,
    render,
    reset,
  };
}
