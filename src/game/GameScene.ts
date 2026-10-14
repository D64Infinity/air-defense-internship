import Phaser from 'phaser';

/**
 * КОНФИГУРАЦИЯ БАЛАНСА И ПАРАМЕТРОВ РАДАРА
 * Все ключевые числовые настройки вынесены сюда для быстрой подкрутки.
 */
export const RADAR_CONFIG = {
  // Геометрия дисплея радара
  radarX: 345,
  radarY: 320,
  radarRadius: 265,

  // Луч сканирования
  beamSpeed: 1.35, // скорость вращения в рад/сек (~4.6 сек на полный оборот)
  trailAngle: 0.4, // ширина шлейфа затухания (в радианах)
  trailSteps: 14, // плавность градиента шлейфа

  // Затухание вспышки цели
  blipFadeDuration: 2.4, // секунд до полного угасания метки
  blipRadius: 4, // размер точки цели

  // Спавн целей
  spawnIntervalMin: 2.2,
  spawnIntervalMax: 4.2,
  maxActiveTargets: 9,

  // Характеристики типов целей (для спавна и будущих этапов)
  targetTypes: {
    missile: {
      label: 'Ракета',
      weight: 35,
      speedRange: [50, 75],
      signalRange: [40, 75],
      headingJitter: 0.08, // летит строго на базу
    },
    bomber: {
      label: 'Бомбардировщик',
      weight: 25,
      speedRange: [24, 40],
      signalRange: [65, 92],
      headingJitter: 0.2,
    },
    friend: {
      label: 'Свой борт',
      weight: 20,
      speedRange: [22, 36],
      signalRange: [75, 98],
      headingJitter: 0.45,
    },
    decoy: {
      label: 'Ложная цель',
      weight: 20,
      speedRange: [18, 65],
      signalRange: [15, 48],
      headingJitter: 0.85,
    },
  },

  // Цветовая палитра зелёного люминофора (CRT)
  colors: {
    radarBg: 0x071b0f,
    radarBorder: 0x00ff66,
    gridRing: 0x00cc55,
    gridAxis: 0x00aa44,
    beam: 0x99ffbb,
    trail: 0x00ff66,
    blipCore: 0xd4ffea,
    blipHalo: 0x00ff66,
    hudBorder: 0x005522,
    hudBg: 0x04130a,
  },
};

export type TargetType = keyof typeof RADAR_CONFIG.targetTypes;

export interface RadarTarget {
  id: number;
  type: TargetType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  headingDeg: number;
  signal: number;
  alpha: number; // 0..1 (яркость свечения люминофора)
}

export class GameScene extends Phaser.Scene {
  private staticGraphics!: Phaser.GameObjects.Graphics;
  private dynamicGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;

  private beamAngle = 0;
  private targets: RadarTarget[] = [];
  private nextTargetId = 1;
  private spawnTimer = 1.0;

  // Текстовые индикаторы консоли
  private headerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private targetsCountText!: Phaser.GameObjects.Text;
  private activeBlipsText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    // 1. Статическая графика радара (сетка, кольца, шкалы)
    this.staticGraphics = this.add.graphics();
    this.drawRadarGrid();

    // 2. Динамическая графика (луч, шлейф, метки целей)
    this.dynamicGraphics = this.add.graphics();

    // 3. Панель консоли справа
    this.hudGraphics = this.add.graphics();
    this.drawHudPanel();
    this.createHudTexts();

    // Начальные цели для мгновенного теста
    this.spawnInitialTargets(3);
  }

  update(_time: number, delta: number): void {
    // Ограничиваем шаг времени при возможных лагах браузера
    const dt = Math.min(delta / 1000, 0.1);

    this.updateBeam(dt);
    this.updateTargets(dt);
    this.handleSpawning(dt);
    this.renderDynamicElements();
    this.updateHudTexts();
  }

  /**
   * Отрисовка постоянной сетки радара (кольца дальности, оси, деления)
   */
  private drawRadarGrid(): void {
    const { radarX, radarY, radarRadius, colors } = RADAR_CONFIG;

    // Тёмный фон экрана радара
    this.staticGraphics.fillStyle(colors.radarBg, 0.85);
    this.staticGraphics.fillCircle(radarX, radarY, radarRadius);

    // Кольца дальности (25%, 50%, 75%, 100%)
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ringSteps.forEach((fraction, index) => {
      const isOuter = index === ringSteps.length - 1;
      this.staticGraphics.lineStyle(
        isOuter ? 2 : 1,
        colors.gridRing,
        isOuter ? 0.9 : 0.22,
      );
      this.staticGraphics.strokeCircle(radarX, radarY, radarRadius * fraction);
    });

    // Оси (перекрестие)
    this.staticGraphics.lineStyle(1, colors.gridAxis, 0.25);
    this.staticGraphics.beginPath();
    // Горизонтальная ось
    this.staticGraphics.moveTo(radarX - radarRadius, radarY);
    this.staticGraphics.lineTo(radarX + radarRadius, radarY);
    // Вертикальная ось
    this.staticGraphics.moveTo(radarX, radarY - radarRadius);
    this.staticGraphics.lineTo(radarX, radarY + radarRadius);
    this.staticGraphics.strokePath();

    // Засечки по окружности (каждые 30 градусов)
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = Phaser.Math.DegToRad(deg);
      const isMajor = deg % 90 === 0;
      const tickLength = isMajor ? 10 : 5;

      const x1 = radarX + Math.cos(rad) * (radarRadius - tickLength);
      const y1 = radarY + Math.sin(rad) * (radarRadius - tickLength);
      const x2 = radarX + Math.cos(rad) * radarRadius;
      const y2 = radarY + Math.sin(rad) * radarRadius;

      this.staticGraphics.lineStyle(1, colors.gridRing, isMajor ? 0.7 : 0.35);
      this.staticGraphics.beginPath();
      this.staticGraphics.moveTo(x1, y1);
      this.staticGraphics.lineTo(x2, y2);
      this.staticGraphics.strokePath();
    }

    // Маркер базы по центру
    this.staticGraphics.lineStyle(1.5, colors.gridRing, 0.8);
    this.staticGraphics.strokeCircle(radarX, radarY, 7);
    this.staticGraphics.fillStyle(colors.gridRing, 0.9);
    this.staticGraphics.fillCircle(radarX, radarY, 2.5);
  }

  /**
   * Отрисовка правой панели консоли
   */
  private drawHudPanel(): void {
    const { colors } = RADAR_CONFIG;
    const panelX = 645;
    const panelY = 55;
    const panelW = 285;
    const panelH = 530;

    this.hudGraphics.fillStyle(colors.hudBg, 0.9);
    this.hudGraphics.fillRoundedRect(panelX, panelY, panelW, panelH, 6);

    this.hudGraphics.lineStyle(1.5, colors.hudBorder, 0.85);
    this.hudGraphics.strokeRoundedRect(panelX, panelY, panelW, panelH, 6);

    // Разделитель
    this.hudGraphics.lineStyle(1, colors.hudBorder, 0.5);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(panelX + 16, panelY + 160);
    this.hudGraphics.lineTo(panelX + panelW - 16, panelY + 160);
    this.hudGraphics.strokePath();
  }

  /**
   * Создание текстовых элементов консоли
   */
  private createHudTexts(): void {
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#4ade80',
    };

    this.headerText = this.add.text(665, 75, '[ RADAR-STATION // СТ-01 ]\nРЕЖИМ: ОБЗОР 360°', {
      ...baseStyle,
      fontSize: '14px',
      color: '#86efac',
      fontStyle: 'bold',
      lineSpacing: 6,
    });

    this.statusText = this.add.text(665, 125, 'ЛУЧ: СКАНИРОВАНИЕ', {
      ...baseStyle,
      color: '#22c55e',
    });

    this.targetsCountText = this.add.text(665, 180, 'ЦЕЛЕЙ В ЗОНЕ: 0', baseStyle);
    this.activeBlipsText = this.add.text(665, 205, 'ВИДИМЫХ ЗАСВЕТОК: 0', baseStyle);

    this.hintText = this.add.text(
      665,
      250,
      '--- ЭТАП 1: ТЕСТ РАДАРА ---\n\n' +
        '• Зеленый луч вращается\n  с заданной скоростью\n\n' +
        '• Цели спавнятся с края\n  и движутся к базе\n\n' +
        '• В момент прохода луча\n  цель вспыхивает яркой\n  зеленой точкой\n\n' +
        '• Вспышка плавно затухает\n  до следующего оборота\n\n' +
        '--------------------------\n' +
        'Ожидание команды «дальше»',
      {
        ...baseStyle,
        fontSize: '12px',
        color: '#86efac',
        lineSpacing: 4,
      },
    );
  }

  /**
   * Обновление угла луча и проверка пересечения с целями
   */
  private updateBeam(dt: number): void {
    const prevAngle = this.beamAngle;
    const twoPi = Math.PI * 2;
    this.beamAngle = (this.beamAngle + RADAR_CONFIG.beamSpeed * dt) % twoPi;

    // Проверяем, прошел ли луч над каждой целью
    for (const target of this.targets) {
      const dx = target.x - RADAR_CONFIG.radarX;
      const dy = target.y - RADAR_CONFIG.radarY;
      const dist = Math.hypot(dx, dy);

      if (dist <= RADAR_CONFIG.radarRadius) {
        let targetAngle = Math.atan2(dy, dx);
        if (targetAngle < 0) targetAngle += twoPi;

        if (this.isAngleBetween(targetAngle, prevAngle, this.beamAngle)) {
          // Вспышка люминофора
          target.alpha = 1.0;
        }
      }
    }
  }

  /**
   * Вспомогательная проверка: лежит ли угол между prev и current по часовой стрелке
   */
  private isAngleBetween(target: number, from: number, to: number): boolean {
    if (to >= from) {
      return target >= from && target <= to;
    }
    // Переход через 0 (2*PI)
    return target >= from || target <= to;
  }

  /**
   * Обновление координат целей и затухание люминофора
   */
  private updateTargets(dt: number): void {
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i];

      // Движение цели
      target.x += target.vx * dt;
      target.y += target.vy * dt;

      // Затухание вспышки
      if (target.alpha > 0) {
        target.alpha = Math.max(0, target.alpha - dt / RADAR_CONFIG.blipFadeDuration);
      }

      // Проверка дистанции до базы (центра)
      const distToBase = Math.hypot(
        target.x - RADAR_CONFIG.radarX,
        target.y - RADAR_CONFIG.radarY,
      );

      // Если цель дошла до базы или вылетела далеко за пределы радара — удаляем
      if (distToBase < 15 || distToBase > RADAR_CONFIG.radarRadius * 1.15) {
        this.targets.splice(i, 1);
      }
    }
  }

  /**
   * Спавн новых целей по таймеру
   */
  private handleSpawning(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.targets.length < RADAR_CONFIG.maxActiveTargets) {
        this.spawnTargetAtEdge();
      }
      this.spawnTimer = Phaser.Math.FloatBetween(
        RADAR_CONFIG.spawnIntervalMin,
        RADAR_CONFIG.spawnIntervalMax,
      );
    }
  }

  /**
   * Создание стартовых целей внутри радара, чтобы сразу видеть работу системы
   */
  private spawnInitialTargets(count: number): void {
    for (let i = 0; i < count; i++) {
      const dist = Phaser.Math.FloatBetween(80, RADAR_CONFIG.radarRadius * 0.85);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.createTargetAt(
        RADAR_CONFIG.radarX + Math.cos(angle) * dist,
        RADAR_CONFIG.radarY + Math.sin(angle) * dist,
      );
    }
  }

  /**
   * Спавн одной цели с границы радара
   */
  private spawnTargetAtEdge(): void {
    const spawnAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const spawnDist = RADAR_CONFIG.radarRadius - 2;

    const x = RADAR_CONFIG.radarX + Math.cos(spawnAngle) * spawnDist;
    const y = RADAR_CONFIG.radarY + Math.sin(spawnAngle) * spawnDist;

    this.createTargetAt(x, y);
  }

  /**
   * Фабрика создания цели со случайными параметрами в пределах своего типа
   */
  private createTargetAt(x: number, y: number): void {
    const type = this.pickRandomType();
    const typeCfg = RADAR_CONFIG.targetTypes[type];

    // Направление преимущественно к центру (базе) с разбросом
    const angleToCenter = Math.atan2(RADAR_CONFIG.radarY - y, RADAR_CONFIG.radarX - x);
    const heading =
      angleToCenter +
      Phaser.Math.FloatBetween(-typeCfg.headingJitter, typeCfg.headingJitter);

    const speed = Phaser.Math.FloatBetween(typeCfg.speedRange[0], typeCfg.speedRange[1]);
    const signal = Math.round(
      Phaser.Math.FloatBetween(typeCfg.signalRange[0], typeCfg.signalRange[1]),
    );

    const vx = Math.cos(heading) * speed;
    const vy = Math.sin(heading) * speed;

    let headingDeg = Math.round(Phaser.Math.RadToDeg(heading));
    if (headingDeg < 0) headingDeg += 360;

    this.targets.push({
      id: this.nextTargetId++,
      type,
      x,
      y,
      vx,
      vy,
      speed: Math.round(speed),
      headingDeg,
      signal,
      alpha: 0, // Невидима до первого прохода луча
    });
  }

  /**
   * Выбор типа цели на основе весов вероятности
   */
  private pickRandomType(): TargetType {
    const types = Object.keys(RADAR_CONFIG.targetTypes) as TargetType[];
    const totalWeight = types.reduce(
      (sum, t) => sum + RADAR_CONFIG.targetTypes[t].weight,
      0,
    );
    let rnd = Phaser.Math.Between(1, totalWeight);

    for (const t of types) {
      rnd -= RADAR_CONFIG.targetTypes[t].weight;
      if (rnd <= 0) return t;
    }
    return 'missile';
  }

  /**
   * Отрисовка динамических элементов (шлейф луча, луч, вспыхивающие метки)
   */
  private renderDynamicElements(): void {
    const { radarX, radarY, radarRadius, colors, trailSteps, trailAngle, blipRadius } =
      RADAR_CONFIG;

    this.dynamicGraphics.clear();

    // 1. Шлейф затухания луча (градиентный сектор позади луча)
    for (let i = 0; i < trailSteps; i++) {
      const a1 = this.beamAngle - (trailAngle * (trailSteps - i)) / trailSteps;
      const a2 = this.beamAngle - (trailAngle * (trailSteps - (i + 1))) / trailSteps;
      const sliceAlpha = (i / trailSteps) * 0.22;

      this.dynamicGraphics.fillStyle(colors.trail, sliceAlpha);
      this.dynamicGraphics.beginPath();
      this.dynamicGraphics.moveTo(radarX, radarY);
      this.dynamicGraphics.arc(radarX, radarY, radarRadius, a1, a2, false);
      this.dynamicGraphics.closePath();
      this.dynamicGraphics.fillPath();
    }

    // 2. Линия луча
    const beamEndX = radarX + Math.cos(this.beamAngle) * radarRadius;
    const beamEndY = radarY + Math.sin(this.beamAngle) * radarRadius;

    this.dynamicGraphics.lineStyle(2, colors.beam, 0.95);
    this.dynamicGraphics.beginPath();
    this.dynamicGraphics.moveTo(radarX, radarY);
    this.dynamicGraphics.lineTo(beamEndX, beamEndY);
    this.dynamicGraphics.strokePath();

    // 3. Метки целей (засветка люминофора)
    for (const target of this.targets) {
      if (target.alpha > 0.02) {
        // Ореол люминофора
        this.dynamicGraphics.fillStyle(colors.blipHalo, target.alpha * 0.38);
        this.dynamicGraphics.fillCircle(target.x, target.y, blipRadius * 2.4);

        // Яркое ядро метки
        this.dynamicGraphics.fillStyle(colors.blipCore, target.alpha);
        this.dynamicGraphics.fillCircle(target.x, target.y, blipRadius);
      }
    }
  }

  /**
   * Обновление показателей консоли
   */
  private updateHudTexts(): void {
    this.targetsCountText.setText(`ЦЕЛЕЙ В ЗОНЕ: ${this.targets.length}`);
    const visibleCount = this.targets.filter((t) => t.alpha > 0.05).length;
    this.activeBlipsText.setText(`ВИДИМЫХ ЗАСВЕТОК: ${visibleCount}`);
  }
}

