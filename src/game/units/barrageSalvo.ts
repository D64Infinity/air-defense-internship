import Phaser from 'phaser';
import { GAME_CONFIG } from '../gameConfig';

/**
 * Конфигурация заградительного ракетного налёта (Barrage Salvo Event)
 */
export const BARRAGE_CONFIG = {
  minWave: 2, // стартовая волна (на 1-й волне отключено для комфортного обучения)
  waveChance: 0.35, // 35% шанс возникновения налёта в допустимой волне
  delayMin: 8, // мин. задержка от старта волны (сек)
  delayMax: 22, // макс. задержка от старта волны (сек)
  warningDuration: 2.0, // время предварительного мигания ограничительных лучей (сек)
  warningBlinkRate: 3.5, // частота пульсации предупреждающих точек (Гц)
  warningDotStep: 15, // шаг между точками вдоль радиусов сектора (px)
  rocketCount: 16, // количество заградительных ракет в залпе
  rocketSpawnSpread: 1.0, // временной разброс пуска ракет (сек)
  rocketSpeedMin: 125, // мин. скорость ракеты (px/сек)
  rocketSpeedMax: 195, // макс. скорость ракеты (px/сек)
  trailMaxLife: 0.22, // время угасания инверсионного следа ракеты (сек)
  flareCountMin: 4, // мин. количество фаеров на один воздушный разрыв
  flareCountMax: 7, // макс. количество фаеров на один воздушный разрыв
  flareLifeMin: 2.4, // мин. время горения фаера (сек)
  flareLifeMax: 4.2, // макс. время горения фаера (сек)
  flareTracerLenMin: 4, // мин. длина трассера при медленном дрейфе вниз (px)
  flareTracerLenMax: 19, // макс. длина трассера на высокой скорости разлёта (px)
  sectorBloomFadeSpeed: 1.4, // скорость затухания фонового засвета сектора (сек^-1)
  sectorBloomMaxAlpha: 0.07, // макс. мягкая яркость засвета сектора на ЭЛТ (7% непрозрачности)
  colors: {
    warningDot: 0xf97316, // янтарно-оранжевый луч
    warningDotBright: 0xffedd5, // белое ядро точек луча
    rocket: 0xf97316, // отметка заградительной ракеты
    rocketCore: 0xffedd5, // яркое ядро ракеты
    rocketTrail: 0xfdba74, // след люминофора
    flareCore: 0xffedd5, // белое раскалённое ядро фаера
    flareGlow: 0xfb923c, // оранжевое сияние фаера
    flareHalo: 0xea580c, // внешнее гало фаера
    airburstFlash: 0xffedd5, // мгновенная вспышка разрыва
  },
};

/**
 * Заградительная ракета залпа
 */
interface BarrageRocket {
  spawnDelay: number;
  isLaunched: boolean;
  isDetonated: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  speed: number;
  fuseTimer: number;
  trail: { x: number; y: number; age: number }[];
}

/**
 * Горящий и падающий осветительный фаер
 */
interface BarrageFlare {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  twinkleOffset: number;
}

/**
 * Вспышка воздушного разрыва (Airburst Flash)
 */
interface AirburstFlash {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/**
 * Интерфейс управления заградительным ракетным налётом
 */
export interface BarrageSalvoManager {
  readonly isActive: boolean;
  readonly isWarning: boolean;
  trigger: (sectorAngle?: number) => void;
  update: (
    dt: number,
    playAirburst?: (pan: number) => void,
    playWarningPing?: () => void,
    playLaunchSound?: () => void,
    playFlareSound?: () => void,
  ) => void;
  render: (graphics: Phaser.GameObjects.Graphics) => void;
  reset: () => void;
}

/**
 * Фабрика менеджера заградительного ракетного налёта
 */
export function createBarrageSalvoManager(): BarrageSalvoManager {
  let active = false;
  let phase: 'idle' | 'warning' | 'firing' = 'idle';
  let phaseTimer = 0;
  let centerAngle = 0;
  let warningAngle1 = 0;
  let warningAngle2 = 0;

  let pingTimer = 0;
  let flareSoundPlayed = false;
  let sectorBloomIntensity = 0;

  const rockets: BarrageRocket[] = [];
  const flares: BarrageFlare[] = [];
  const flashes: AirburstFlash[] = [];

  const reset = (): void => {
    active = false;
    phase = 'idle';
    phaseTimer = 0;
    pingTimer = 0;
    flareSoundPlayed = false;
    sectorBloomIntensity = 0;
    rockets.length = 0;
    flares.length = 0;
    flashes.length = 0;
  };

  /**
   * Инициализация залпа в полусекторе 180 градусов
   */
  const trigger = (sectorAngle?: number): void => {
    if (active) return;

    reset();
    active = true;
    phase = 'warning';
    phaseTimer = 0;
    pingTimer = 0;
    flareSoundPlayed = false;

    // Центральный азимут полудуги (180 градусов)
    centerAngle = sectorAngle ?? Phaser.Math.FloatBetween(0, Math.PI * 2);
    warningAngle1 = centerAngle - Math.PI / 2;
    warningAngle2 = centerAngle + Math.PI / 2;

    // Формируем эшелон из 16 ракет
    for (let i = 0; i < BARRAGE_CONFIG.rocketCount; i++) {
      // Случайный азимут на дуге 180°
      const angle = Phaser.Math.FloatBetween(warningAngle1, warningAngle2);
      const spawnX = GAME_CONFIG.radarX + Math.cos(angle) * (GAME_CONFIG.radarRadius * 0.98);
      const spawnY = GAME_CONFIG.radarY + Math.sin(angle) * (GAME_CONFIG.radarRadius * 0.98);

      // Вектор полёта внутрь сектора с небольшим угловым разбросом
      const baseInwardAngle = Math.atan2(GAME_CONFIG.radarY - spawnY, GAME_CONFIG.radarX - spawnX);
      const heading = baseInwardAngle + Phaser.Math.FloatBetween(-0.25, 0.25);
      const speed = Phaser.Math.FloatBetween(BARRAGE_CONFIG.rocketSpeedMin, BARRAGE_CONFIG.rocketSpeedMax);

      // Дистанция полёта до воздушного подрыва (разлёт по всей глубине радара)
      const travelDist = Phaser.Math.FloatBetween(65, GAME_CONFIG.radarRadius * 0.82);
      const fuseTimer = travelDist / speed;

      rockets.push({
        spawnDelay: Phaser.Math.FloatBetween(0, BARRAGE_CONFIG.rocketSpawnSpread),
        isLaunched: false,
        isDetonated: false,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        heading,
        speed,
        fuseTimer,
        trail: [],
      });
    }
  };

  const update = (
    dt: number,
    playAirburst?: (pan: number) => void,
    playWarningPing?: () => void,
    playLaunchSound?: () => void,
    playFlareSound?: () => void,
  ): void => {
    if (!active) return;

    phaseTimer += dt;

    // 1. ФАЗА ПРЕДУПРЕЖДЕНИЯ (2 секунды мигающих лучей сектора)
    if (phase === 'warning') {
      pingTimer -= dt;
      if (pingTimer <= 0) {
        pingTimer = 1.0 / BARRAGE_CONFIG.warningBlinkRate;
        playWarningPing?.();
      }

      if (phaseTimer >= BARRAGE_CONFIG.warningDuration) {
        phase = 'firing';
        phaseTimer = 0;
        playLaunchSound?.();
      }
      return;
    }

    // 2. ФАЗА ПОЛЁТА ЗАЛПА И ВОЗДУШНЫХ РАЗРЫВОВ
    let allRocketsDone = true;

    for (const r of rockets) {
      if (!r.isLaunched) {
        if (phaseTimer >= r.spawnDelay) {
          r.isLaunched = true;
        } else {
          allRocketsDone = false;
          continue;
        }
      }

      if (r.isDetonated) continue;

      allRocketsDone = false;
      r.fuseTimer -= dt;

      // Движение ракеты
      r.x += r.vx * dt;
      r.y += r.vy * dt;

      // Инверсионный след
      r.trail.push({ x: r.x, y: r.y, age: 0 });
      for (let k = r.trail.length - 1; k >= 0; k--) {
        r.trail[k].age += dt;
        if (r.trail[k].age >= BARRAGE_CONFIG.trailMaxLife) {
          r.trail.splice(k, 1);
        }
      }

      // Воздушный разрыв (Airburst)
      if (r.fuseTimer <= 0) {
        r.isDetonated = true;

        // Вспышка
        flashes.push({
          x: r.x,
          y: r.y,
          radius: 18,
          alpha: 1.0,
        });

        // Импульс фонового янтарного засвета сектора
        sectorBloomIntensity = Math.min(1.0, sectorBloomIntensity + 0.35);

        // Звук разрыва со стерео-панорамой
        const pan = Phaser.Math.Clamp((r.x - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius, -1, 1);
        playAirburst?.(pan);

        // Генерация пучка горящих фаеров
        const count = Phaser.Math.Between(BARRAGE_CONFIG.flareCountMin, BARRAGE_CONFIG.flareCountMax);
        for (let f = 0; f < count; f++) {
          const flareAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const flareSpeed = Phaser.Math.FloatBetween(22, 65);
          const life = Phaser.Math.FloatBetween(BARRAGE_CONFIG.flareLifeMin, BARRAGE_CONFIG.flareLifeMax);

          flares.push({
            x: r.x,
            y: r.y,
            vx: Math.cos(flareAngle) * flareSpeed,
            vy: Math.sin(flareAngle) * flareSpeed,
            size: Phaser.Math.FloatBetween(1.8, 3.8),
            life,
            maxLife: life,
            twinkleOffset: Math.random() * Math.PI * 2,
          });
        }

        if (!flareSoundPlayed) {
          flareSoundPlayed = true;
          playFlareSound?.();
        }
      }
    }

    // 3. ОБНОВЛЕНИЕ ФАЕРОВ (дрейф по ветру, торможение, мерцание и затухание)
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i];
      f.life -= dt;

      if (f.life <= 0) {
        flares.splice(i, 1);
        continue;
      }

      // Торможение среды (аэродинамическое сопротивление) + лёгкий дрейф вниз
      f.vx *= Math.pow(0.55, dt);
      f.vy = f.vy * Math.pow(0.55, dt) + 7 * dt;

      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }

    // 4. ОБНОВЛЕНИЕ ВСПЫШЕК
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].alpha -= dt * 6.0;
      flashes[i].radius += dt * 35.0;
      if (flashes[i].alpha <= 0) {
        flashes.splice(i, 1);
      }
    }

    // 5. ЗАТУХАНИЕ ЗАСВЕТА СЕКТОРА ЛЮМИНОФОРА
    if (sectorBloomIntensity > 0) {
      sectorBloomIntensity = Math.max(
        0,
        sectorBloomIntensity - dt * BARRAGE_CONFIG.sectorBloomFadeSpeed,
      );
    }

    // Завершение ивента, когда все ракеты, фаеры и эффекты рассеялись
    if (allRocketsDone && flares.length === 0 && flashes.length === 0 && sectorBloomIntensity <= 0.01) {
      active = false;
      phase = 'idle';
    }
  };

  /**
   * Отрисовка всех визуальных элементов залпа
   */
  const render = (graphics: Phaser.GameObjects.Graphics): void => {
    if (!active) return;

    // 0. МЯГКИЙ ЯНТАРНЫЙ ЗАСВЕТ СЕКТОРА (Phosphor Horizon Bloom) С ПЛАВНЫМ ГРАДИЕНТОМ К ТЁМНОЙ ЗОНЕ
    if (sectorBloomIntensity > 0.005) {
      const bloomAlpha = sectorBloomIntensity * BARRAGE_CONFIG.sectorBloomMaxAlpha;

      // Параметры градиентного рассеивания люминофора:
      // Вместо резкого плоского среза полукруга по диаметру, сектор разбивается на плавные
      // угловые клинья с косинусным затуханием (cosine ease-out) на боковых границах
      // и деликатным рассеиванием (~16 градусов) в нетронутую область радара.
      const featherAngle = 0.28; // мягкий шлейф рассеивания света за пределы 180° дуги
      const halfSpan = Math.PI * 0.5 + featherAngle;
      const numSlices = 36; // 36 сегментов формируют непрерывный аналоговый градиент
      const coreLimit = Math.PI * 0.5 - 0.32; // центральная область полной яркости (~144°)
      const fadeWidth = halfSpan - coreLimit; // ширина зоны спада до нуля (~35°)

      const rOuter = GAME_CONFIG.radarRadius * 0.98;
      const rInner = GAME_CONFIG.baseRadius + 8;

      for (let i = 0; i < numSlices; i++) {
        const a1 = centerAngle - halfSpan + (i / numSlices) * (halfSpan * 2);
        const a2 = centerAngle - halfSpan + ((i + 1) / numSlices) * (halfSpan * 2);
        const aMid = (a1 + a2) * 0.5;

        // Кратчайшее угловое отклонение от центральной оси налёта
        const angleDist = Math.abs(Phaser.Math.Angle.Wrap(aMid - centerAngle));

        let angularFactor = 1.0;
        if (angleDist > coreLimit) {
          const t = Phaser.Math.Clamp((angleDist - coreLimit) / fadeWidth, 0, 1);
          // Косинусный C1-гладкий спад: f(0)=1, f(1)=0, нулевая производная на обоих концах
          angularFactor = 0.5 * (1 + Math.cos(t * Math.PI));
        }

        if (angularFactor <= 0.002) continue;

        const sliceAlpha = bloomAlpha * angularFactor;

        // Заполнение сегмента с плавно спадающей альфой
        graphics.fillStyle(BARRAGE_CONFIG.colors.warningDot, sliceAlpha);
        graphics.beginPath();
        graphics.arc(
          GAME_CONFIG.radarX,
          GAME_CONFIG.radarY,
          rOuter,
          a1,
          a2,
          false,
        );
        graphics.arc(
          GAME_CONFIG.radarX,
          GAME_CONFIG.radarY,
          rInner,
          a2,
          a1,
          true,
        );
        graphics.closePath();
        graphics.fillPath();

        // Внешняя светящаяся кромка с тем же градиентным затуханием (без резких обрывов)
        if (sectorBloomIntensity > 0.02 && angularFactor > 0.04) {
          const edgeAlpha = sectorBloomIntensity * 0.20 * angularFactor;
          graphics.lineStyle(1.6, BARRAGE_CONFIG.colors.warningDot, edgeAlpha);
          graphics.beginPath();
          graphics.arc(
            GAME_CONFIG.radarX,
            GAME_CONFIG.radarY,
            rOuter,
            a1,
            a2,
            false,
          );
          graphics.strokePath();
        }
      }
    }

    // 1. ПРЕДУПРЕЖДАЮЩИЙ СЕКТОР (мигающие точки вдоль двух ограничительных радиусов 180° полудуги)
    if (phase === 'warning') {
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phaseTimer * Math.PI * 2 * BARRAGE_CONFIG.warningBlinkRate));
      const minR = GAME_CONFIG.baseRadius + 10;
      const maxR = GAME_CONFIG.radarRadius * 0.98;

      // Радиус 1 и Радиус 2
      const angles = [warningAngle1, warningAngle2];

      for (const ang of angles) {
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        for (let r = minR; r <= maxR; r += BARRAGE_CONFIG.warningDotStep) {
          const px = GAME_CONFIG.radarX + cosA * r;
          const py = GAME_CONFIG.radarY + sinA * r;

          // Внешнее янтарное свечение
          graphics.fillStyle(BARRAGE_CONFIG.colors.warningDot, pulse * 0.85);
          graphics.fillCircle(px, py, 2.5);

          // Яркое белое ядро в пике пульсации
          if (pulse > 0.6) {
            graphics.fillStyle(BARRAGE_CONFIG.colors.warningDotBright, (pulse - 0.6) * 2.5);
            graphics.fillCircle(px, py, 1.2);
          }
        }
      }

      // Пульсирующая внешняя ограничительная дуга полусектора
      const arcDots = 24;
      for (let i = 0; i <= arcDots; i++) {
        const a = warningAngle1 + (i / arcDots) * Math.PI;
        const px = GAME_CONFIG.radarX + Math.cos(a) * maxR;
        const py = GAME_CONFIG.radarY + Math.sin(a) * maxR;

        graphics.fillStyle(BARRAGE_CONFIG.colors.warningDot, pulse * 0.65);
        graphics.fillCircle(px, py, 2.0);
      }
    }

    // 2. ОТРИСОВКА ВСПЫШЕК ВОЗДУШНЫХ РАЗРЫВОВ
    for (const fl of flashes) {
      graphics.fillStyle(BARRAGE_CONFIG.colors.airburstFlash, fl.alpha * 0.9);
      graphics.fillCircle(fl.x, fl.y, fl.radius);
    }

    // 3. ОТРИСОВКА ЗАГРАДИТЕЛЬНЫХ РАКЕТ И ИХ СЛЕДОВ
    for (const r of rockets) {
      if (!r.isLaunched || r.isDetonated) continue;

      // Инверсионный след (светло-оранжевый дымный шлейф)
      for (let i = 0; i < r.trail.length - 1; i++) {
        const p1 = r.trail[i];
        const p2 = r.trail[i + 1];
        const alpha = Math.max(0, 1 - p1.age / BARRAGE_CONFIG.trailMaxLife) * 0.65;
        graphics.lineStyle(1.6, BARRAGE_CONFIG.colors.rocketTrail, alpha);
        graphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
      }

      // Корпус отметки ракеты (янтарная точка радара)
      graphics.lineStyle(1.4, BARRAGE_CONFIG.colors.rocket, 0.95);
      graphics.strokeCircle(r.x, r.y, GAME_CONFIG.blipRadius);

      // Яркое ядро
      graphics.fillStyle(BARRAGE_CONFIG.colors.rocketCore, 0.95);
      graphics.fillCircle(r.x, r.y, 1.8);

      // Носик вектора скорости
      const noseX = r.x + Math.cos(r.heading) * (GAME_CONFIG.blipRadius + 3);
      const noseY = r.y + Math.sin(r.heading) * (GAME_CONFIG.blipRadius + 3);
      graphics.lineStyle(1.2, BARRAGE_CONFIG.colors.rocket, 0.85);
      graphics.lineBetween(r.x, r.y, noseX, noseY);
    }

    // 4. ОТРИСОВКА ОСВЕТИТЕЛЬНЫХ ФАЕРОВ (парящие горящие искры и трассеры)
    for (const f of flares) {
      const lifeRatio = f.life / f.maxLife;
      // Лёгкое естественное мерцание пламени
      const twinkle = 0.85 + 0.15 * Math.sin(phaseTimer * 14 + f.twinkleOffset);
      const alpha = Math.min(1, lifeRatio * 1.3) * twinkle;

      // Тонкий линейный трассер (векторная нить шлейфа против вектора движения)
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > 1.5) {
        const nx = f.vx / speed;
        const ny = f.vy / speed;
        // Длина трассера от 4px при вертикальном дрейфе до 19px на пиковой скорости разлёта
        const trailLen = Phaser.Math.Clamp(
          speed * 0.30,
          BARRAGE_CONFIG.flareTracerLenMin,
          BARRAGE_CONFIG.flareTracerLenMax,
        );

        const tailX = f.x - nx * trailLen;
        const tailY = f.y - ny * trailLen;
        const midX = f.x - nx * (trailLen * 0.45);
        const midY = f.y - ny * (trailLen * 0.45);

        // Хвостовая часть (тонкая, плавно угасающая нить 0.8px)
        graphics.lineStyle(0.8, BARRAGE_CONFIG.colors.flareHalo, alpha * 0.45);
        graphics.lineBetween(tailX, tailY, midX, midY);

        // Головная часть (яркая оранжевая линия 1.3px)
        graphics.lineStyle(1.3, BARRAGE_CONFIG.colors.flareGlow, alpha * 0.85);
        graphics.lineBetween(midX, midY, f.x, f.y);

        // Раскалённая белая сердцевина трассера у основания фаера
        if (alpha > 0.35) {
          graphics.lineStyle(0.8, BARRAGE_CONFIG.colors.flareCore, alpha * 0.9);
          graphics.lineBetween(f.x - nx * (trailLen * 0.25), f.y - ny * (trailLen * 0.25), f.x, f.y);
        }
      }

      // Внешнее рассеянное гало
      graphics.fillStyle(BARRAGE_CONFIG.colors.flareHalo, alpha * 0.35);
      graphics.fillCircle(f.x, f.y, f.size * 2.2);

      // Оранжевое тело фаера
      graphics.fillStyle(BARRAGE_CONFIG.colors.flareGlow, alpha * 0.85);
      graphics.fillCircle(f.x, f.y, f.size);

      // Раскалённое ядро
      graphics.fillStyle(BARRAGE_CONFIG.colors.flareCore, alpha * 0.95);
      graphics.fillCircle(f.x, f.y, Math.max(1, f.size * 0.45));
    }
  };

  return {
    get isActive() {
      return active;
    },
    get isWarning() {
      return active && phase === 'warning';
    },
    trigger,
    update,
    render,
    reset,
  };
}
