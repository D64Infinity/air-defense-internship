import Phaser from 'phaser';
import { GAME_CONFIG, type GameTarget } from '../gameConfig';

/**
 * Конфигурация бонусного юнита 4+ волны: Сверхзвуковой разведчик «Сокол»
 */
export const SUPERSONIC_RECON_CONFIG = {
  minWave: 4, // Появляется с 4-й волны
  waveChance: 0.42, // 42% шанс вылета в допустимой волне (с отдыхом через волну)
  delayMin: 5.0, // мин. задержка от старта волны (сек)
  delayMax: 13.0, // макс. задержка от старта волны (сек)
  speed: 150, // высокая скорость прохода по хорде (px/сек)
  spawnRadiusFactor: 0.97,
  chordOffsetMinFrac: 0.44, // мин. удаление хорды от центра (никогда не задевает базу)
  chordOffsetMaxFrac: 0.72, // макс. удаление хорды от центра (~2.57–3.23 сек до выхода на 4-й волне)
  trailMaxPoints: 14, // длина инверсионного следа
  trailSampleIntervalSec: 0.028,
  scoreReward: 300, // очки за сбитие перехватчиком [2]
  creditsReward: 200, // кредиты за сбитие перехватчиком [2]
  fullScanBonusCredits: 75, // компенсация кредитами, если сканеры уже полные (3/3)
  scanScoreReward: 150, // очки за перехват данных сканером [4]
  scanCreditsReward: 150, // кредиты за перехват данных сканером [4]
  colors: {
    bodyCore: 0xf0f9ff,
    bodyGlow: 0x38bdf8,
    machCone: 0x7dd3fc,
    trail: 0x38bdf8,
    accentGold: 0xfacc15,
  },
} as const;

interface TrailSample {
  x: number;
  y: number;
}

/**
 * Интерфейс менеджера сверхзвукового разведчика
 */
export interface SupersonicReconManager {
  readonly isActive: boolean;
  readonly activeTarget: GameTarget | null;
  spawn: (wave: number) => GameTarget;
  update: (dt: number) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  onTargetRemoved: (targetId: number) => void;
  reset: () => void;
}

/**
 * Фабрика изолированного менеджера сверхзвукового разведчика
 */
export function createSupersonicReconManager(): SupersonicReconManager {
  let active = false;
  let targetRef: GameTarget | null = null;
  let trail: TrailSample[] = [];
  let trailTimer = 0;
  let pulseTime = 0;

  const reset = (): void => {
    active = false;
    targetRef = null;
    trail = [];
    trailTimer = 0;
    pulseTime = 0;
  };

  const spawn = (wave: number): GameTarget => {
    active = true;
    trail = [];
    trailTimer = 0;
    pulseTime = 0;

    const r = GAME_CONFIG.radarRadius * SUPERSONIC_RECON_CONFIG.spawnRadiusFactor;
    const normalAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const offsetFrac = Phaser.Math.FloatBetween(
      SUPERSONIC_RECON_CONFIG.chordOffsetMinFrac,
      SUPERSONIC_RECON_CONFIG.chordOffsetMaxFrac,
    );
    const dirSign = Math.random() < 0.5 ? 1 : -1;
    const heading = normalAngle + (Math.PI / 2) * dirSign;

    const midX = GAME_CONFIG.radarX + Math.cos(normalAngle) * r * offsetFrac;
    const midY = GAME_CONFIG.radarY + Math.sin(normalAngle) * r * offsetFrac;
    const halfLen = Math.sqrt(Math.max(0, r * r * (1 - offsetFrac * offsetFrac)));

    const x = midX - Math.cos(heading) * halfLen;
    const y = midY - Math.sin(heading) * halfLen;

    const waveBonus = 1 + Math.min(0.15, Math.max(0, wave - 4) * 0.03);
    const speed = Math.round(SUPERSONIC_RECON_CONFIG.speed * waveBonus);

    let deg = Math.round(Phaser.Math.RadToDeg(heading));
    if (deg < 0) deg += 360;

    const target: GameTarget = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'supersonic_recon',
      x,
      y,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      speed,
      headingDeg: deg,
      headingRad: heading,
      targetHeadingRad: heading,
      turnRate: 0,
      signal: Phaser.Math.Between(88, 96),
      alpha: 1.0,
      isRecon: true,
    };

    targetRef = target;
    trail.push({ x, y });
    return target;
  };

  const update = (dt: number): void => {
    if (!active || !targetRef) return;

    pulseTime += dt;
    // Держим высокий уровень люминофора, чтобы быстрая цель не пропадала между оборотами луча
    targetRef.alpha = 1.0;

    trailTimer += dt;
    if (trailTimer >= SUPERSONIC_RECON_CONFIG.trailSampleIntervalSec) {
      trailTimer = 0;
      trail.push({ x: targetRef.x, y: targetRef.y });
      if (trail.length > SUPERSONIC_RECON_CONFIG.trailMaxPoints) {
        trail.shift();
      }
    }
  };

  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!active || !targetRef) return;

    const t = targetRef;
    const colors = SUPERSONIC_RECON_CONFIG.colors;
    const pulse = 0.55 + 0.45 * Math.sin(pulseTime * 14);

    // 1. Инверсионный сверхзвуковой шлейф
    if (trail.length >= 2) {
      for (let i = 1; i < trail.length; i++) {
        const frac = i / (trail.length - 1);
        graphics.lineStyle(1.2 + frac * 2.4, colors.trail, 0.1 + frac * 0.55);
        graphics.lineBetween(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
      }
      const last = trail[trail.length - 1];
      graphics.lineStyle(3.2, colors.bodyCore, 0.72);
      graphics.lineBetween(last.x, last.y, t.x, t.y);
    }

    // 2. Конус Маха (V-образная ударная волна от носа борта)
    const backAngle = t.headingRad + Math.PI;
    const wingLen = 15;
    const coneHalfAngle = 0.46;
    graphics.lineStyle(1.4, colors.machCone, 0.78);
    graphics.beginPath();
    graphics.moveTo(
      t.x + Math.cos(backAngle + coneHalfAngle) * wingLen,
      t.y + Math.sin(backAngle + coneHalfAngle) * wingLen,
    );
    graphics.lineTo(t.x, t.y);
    graphics.lineTo(
      t.x + Math.cos(backAngle - coneHalfAngle) * wingLen,
      t.y + Math.sin(backAngle - coneHalfAngle) * wingLen,
    );
    graphics.strokePath();

    // 3. Пульсирующее золотисто-бирюзовое кольцо бонусной цели
    graphics.lineStyle(1.3, colors.accentGold, 0.4 + 0.45 * pulse);
    graphics.strokeCircle(t.x, t.y, 11 + pulse * 4);

    // 4. Ядро отметки
    graphics.fillStyle(colors.bodyGlow, 0.42);
    graphics.fillCircle(t.x, t.y, 8.5);
    graphics.fillStyle(colors.bodyCore, 1.0);
    graphics.fillCircle(t.x, t.y, 3.2);
  };

  const onTargetRemoved = (targetId: number): void => {
    if (targetRef && targetRef.id === targetId) {
      reset();
    }
  };

  return {
    get isActive() {
      return active;
    },
    get activeTarget() {
      return targetRef;
    },
    spawn,
    update,
    render,
    onTargetRemoved,
    reset,
  };
}
