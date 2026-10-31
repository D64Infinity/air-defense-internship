import Phaser from 'phaser';
import { GAME_CONFIG, type TargetType } from './gameConfig';

/**
 * Описание состояния световой вспышки на внешнем козырьке радара
 */
interface BezelFlash {
  color: number;
  maxAlpha: number;
  duration: number;
  age: number;
}

/**
 * Модуль амбиентного окружения и световых отблесков корпуса радара
 * Создаёт ощущение настоящей физической консоли в тёмной операторской рубке:
 * 1. Матовый приборный корпус вокруг экрана с угловыми винтами и технической маркировкой;
 * 2. Мягкое постоянное свечение стеклянной колбы кинескопа наружу (CRT Bezel Halo);
 * 3. Динамический отблеск на стенках козырька от вращающегося луча развёртки;
 * 4. Интерактивная реакция на события (вспышки при взрывах техники и уроне базы).
 */
export class AmbientBackground {
  private staticGraphics: Phaser.GameObjects.Graphics;
  private dynamicGraphics: Phaser.GameObjects.Graphics;
  private activeFlash: BezelFlash | null = null;

  // Геометрия консольного корпуса радара (согласована с правой панелью HUD)
  private readonly housingX = 55;
  private readonly housingY = 32;
  private readonly housingW = 570;
  private readonly housingH = 576;

  constructor(scene: Phaser.Scene) {
    this.staticGraphics = scene.add.graphics();
    this.dynamicGraphics = scene.add.graphics();

    // Задаём нижний слой отрисовки, чтобы свечение лежало под интерактивными элементами
    this.staticGraphics.setDepth(0);
    this.dynamicGraphics.setDepth(0);

    this.renderStaticHousing();
  }

  /**
   * Отрисовка постоянной физической панели консоли и фаски козырька
   */
  private renderStaticHousing(): void {
    const { radarX, radarY, radarRadius, colors } = GAME_CONFIG;

    this.staticGraphics.clear();

    // 1. Металлическая основа корпуса приборной панели
    this.staticGraphics.fillStyle(0x020a05, 0.96);
    this.staticGraphics.fillRoundedRect(
      this.housingX,
      this.housingY,
      this.housingW,
      this.housingH,
      8,
    );

    // Внешняя тонкая рамка корпуса
    this.staticGraphics.lineStyle(1.5, colors.hudBorder, 0.75);
    this.staticGraphics.strokeRoundedRect(
      this.housingX,
      this.housingY,
      this.housingW,
      this.housingH,
      8,
    );

    // 2. Угловые винты крепления приборной панели (4 угла)
    const boltOffsets = [
      { x: this.housingX + 14, y: this.housingY + 14 },
      { x: this.housingX + this.housingW - 14, y: this.housingY + 14 },
      { x: this.housingX + 14, y: this.housingY + this.housingH - 14 },
      { x: this.housingX + this.housingW - 14, y: this.housingY + this.housingH - 14 },
    ];

    for (const b of boltOffsets) {
      this.staticGraphics.fillStyle(0x061a0e, 0.95);
      this.staticGraphics.fillCircle(b.x, b.y, 4);
      this.staticGraphics.lineStyle(1, colors.hudBorder, 0.6);
      this.staticGraphics.strokeCircle(b.x, b.y, 4);
      // Шлиц винта
      this.staticGraphics.lineBetween(b.x - 2, b.y, b.x + 2, b.y);
    }

    // 3. Заглублённая круглая ниша под стеклянную колбу (Bezel Recess)
    // Тёмный внутренний скос/тень, создающий глубину посадки линзы
    const recessSteps = [
      { r: radarRadius + 14, alpha: 0.35, color: 0x010502 },
      { r: radarRadius + 8, alpha: 0.55, color: 0x010502 },
      { r: radarRadius + 3, alpha: 0.80, color: 0x010301 },
    ];

    for (const step of recessSteps) {
      this.staticGraphics.lineStyle(4, step.color, step.alpha);
      this.staticGraphics.strokeCircle(radarX, radarY, step.r);
    }

    // Тонкий металлический прижимной обод вокруг стекла радара
    this.staticGraphics.lineStyle(1.5, colors.hudBorder, 0.85);
    this.staticGraphics.strokeCircle(radarX, radarY, radarRadius + 2);

    // 4. Постоянное мягкое рассеивание люминофора наружу (Ambient Glass Halo)
    // Нежные полупрозрачные кольца свечения, озаряющие корпус вокруг экрана
    const haloSteps = [
      { r: radarRadius + 6, alpha: 0.07 },
      { r: radarRadius + 15, alpha: 0.04 },
      { r: radarRadius + 26, alpha: 0.02 },
      { r: radarRadius + 40, alpha: 0.008 },
    ];

    for (const step of haloSteps) {
      this.staticGraphics.lineStyle(6, colors.blipHalo, step.alpha);
      this.staticGraphics.strokeCircle(radarX, radarY, step.r);
    }
  }

  /**
   * Срабатывание амбиентного светового отсвета при уничтожении цели
   */
  triggerExplosionFlash(targetType: TargetType): void {
    switch (targetType) {
      case 'missile':
        this.activeFlash = {
          color: 0x22c55e, // изумрудный отблеск
          maxAlpha: 0.28,
          duration: 0.38,
          age: 0,
        };
        break;
      case 'bomber':
        this.activeFlash = {
          color: 0xf59e0b, // глубокий огненный янтарь от детонации керосина
          maxAlpha: 0.42,
          duration: 0.55,
          age: 0,
        };
        break;
      case 'friend':
        this.activeFlash = {
          color: 0xef4444, // тревожный красный отсвет катастрофы
          maxAlpha: 0.36,
          duration: 0.45,
          age: 0,
        };
        break;
      case 'decoy':
        this.activeFlash = {
          color: 0x94a3b8, // нейтральный серебристый отсвет фольги
          maxAlpha: 0.16,
          duration: 0.24,
          age: 0,
        };
        break;
    }
  }

  /**
   * Срабатывание драматичного алого светового импульса при прямом уроне базе
   */
  triggerBaseDamageFlash(): void {
    this.activeFlash = {
      color: 0xef4444,
      maxAlpha: 0.50,
      duration: 0.60,
      age: 0,
    };
  }

  /**
   * Обновление таймеров динамического окружения
   */
  update(dt: number): void {
    if (this.activeFlash) {
      this.activeFlash.age += dt;
      if (this.activeFlash.age >= this.activeFlash.duration) {
        this.activeFlash = null;
      }
    }
  }

  /**
   * Отрисовка динамических световых эффектов вокруг радара:
   * 1. Внешний отблеск луча развёртки на скошенном ободе козырька;
   * 2. Рассеянный световой импульс от детонаций на корпусе терминала.
   */
  render(beamAngle: number): void {
    const { radarX, radarY, radarRadius, colors } = GAME_CONFIG;

    this.dynamicGraphics.clear();

    // 1. Динамический световой блик на фаске козырька (Rim Sweep Reflection)
    // Вдоль внешнего прижимного обода скользит рассеянная световая дуга в такт лучу
    const sweepArcLength = 0.55; // радианы ширины блика
    const a1 = beamAngle - sweepArcLength;
    const a2 = beamAngle;

    this.dynamicGraphics.lineStyle(5, colors.trail, 0.14);
    this.dynamicGraphics.beginPath();
    this.dynamicGraphics.arc(radarX, radarY, radarRadius + 5, a1, a2, false);
    this.dynamicGraphics.strokePath();

    this.dynamicGraphics.lineStyle(2, colors.beam, 0.25);
    this.dynamicGraphics.beginPath();
    this.dynamicGraphics.arc(radarX, radarY, radarRadius + 3, a2 - 0.12, a2, false);
    this.dynamicGraphics.strokePath();

    // 2. Интерактивная амбиентная вспышка (Ambient Explosion / Damage Bloom)
    if (this.activeFlash) {
      const progress = this.activeFlash.age / this.activeFlash.duration;
      // Мягкое экспоненциальное угасание вспышки
      const currentAlpha = this.activeFlash.maxAlpha * (1 - progress) * (1 - progress);

      if (currentAlpha > 0.01) {
        // Радиальный световой ореол вокруг линзы экрана
        const flashRings = [
          { r: radarRadius + 8, width: 6, alpha: currentAlpha * 0.95 },
          { r: radarRadius + 20, width: 12, alpha: currentAlpha * 0.65 },
          { r: radarRadius + 38, width: 18, alpha: currentAlpha * 0.35 },
          { r: radarRadius + 60, width: 24, alpha: currentAlpha * 0.15 },
        ];

        for (const ring of flashRings) {
          this.dynamicGraphics.lineStyle(ring.width, this.activeFlash.color, ring.alpha);
          this.dynamicGraphics.strokeCircle(radarX, radarY, ring.r);
        }

        // Деликатный световой отблеск по контуру приборной панели
        this.dynamicGraphics.lineStyle(2, this.activeFlash.color, currentAlpha * 0.4);
        this.dynamicGraphics.strokeRoundedRect(
          this.housingX,
          this.housingY,
          this.housingW,
          this.housingH,
          8,
        );
      }
    }
  }

  /**
   * Сброс динамического состояния при перезапуске
   */
  reset(): void {
    this.activeFlash = null;
    this.dynamicGraphics.clear();
  }
}
