import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type TargetType,
  type DecisionChoice,
  type GameTarget,
} from './gameConfig';
import {
  createExplosion,
  updateExplosions,
  renderExplosions,
  type ExplosionEffect,
} from './effects';
import {
  createGameOverOverlay,
  createPauseOverlay,
  type GameOverOverlay,
  type PauseOverlay,
} from './ui';

// Реэкспорт для сохранения полной обратной совместимости
export { GAME_CONFIG, GAME_CONFIG as RADAR_CONFIG };
export type { TargetType, DecisionChoice, GameTarget, GameTarget as RadarTarget };


interface ButtonItem {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  setEnabled: (enabled: boolean) => void;
}

export class GameScene extends Phaser.Scene {
  private staticGraphics!: Phaser.GameObjects.Graphics;
  private dynamicGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private gameOverOverlay!: GameOverOverlay;
  private pauseOverlay!: PauseOverlay;
  private isPaused = false;

  // Динамические параметры луча и волн
  private currentBeamSpeed = GAME_CONFIG.beamSpeedBase;
  private beamAngle = 0;
  private targets: GameTarget[] = [];
  private selectedTarget: GameTarget | null = null;
  private explosions: ExplosionEffect[] = [];
  private nextTargetId = 1;
  private spawnTimer = 1.2;

  // Ресурсы и механика сканирования
  private interceptors = GAME_CONFIG.startInterceptors;
  private scansAvailable = GAME_CONFIG.maxScansPerWave;
  private isScanning = false;
  private scanningTarget: GameTarget | null = null;
  private scanProgress = 0;

  // Состояние игры
  private baseHealth = GAME_CONFIG.maxBaseHealth;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private wave = 1;
  private waveTargetsToSpawn = 7;
  private isGameOver = false;
  private highScore = 0;

  // Таймеры эффектов
  private baseFlashTimer = 0;
  private feedbackTimer = 0;
  private waveBannerTimer = 0;

  // Текстовые индикаторы HUD
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private interceptorsText!: Phaser.GameObjects.Text;
  private scansText!: Phaser.GameObjects.Text;
  private targetTelemetryTitle!: Phaser.GameObjects.Text;
  private targetTelemetryText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private waveBannerText!: Phaser.GameObjects.Text;

  // Кнопки решений и скана
  private buttons: Record<
    DecisionChoice | 'scan' | 'buyMissile' | 'buyScan',
    ButtonItem
  > = {} as Record<
    DecisionChoice | 'scan' | 'buyMissile' | 'buyScan',
    ButtonItem
  >;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.isGameOver = false;
    this.isPaused = false;
    this.baseHealth = GAME_CONFIG.maxBaseHealth;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.wave = 1;
    this.waveTargetsToSpawn = 7;
    this.currentBeamSpeed = GAME_CONFIG.beamSpeedBase;
    this.interceptors = GAME_CONFIG.startInterceptors;
    this.scansAvailable = GAME_CONFIG.maxScansPerWave;
    this.isScanning = false;
    this.scanningTarget = null;
    this.scanProgress = 0;
    this.targets = [];
    this.selectedTarget = null;
    this.explosions = [];

    // Загрузка рекорда из localStorage
    const savedRecord = localStorage.getItem('radar_station_record');
    this.highScore = savedRecord ? parseInt(savedRecord, 10) || 0 : 0;

    // 1. Статическая графика радара
    this.staticGraphics = this.add.graphics();
    this.drawRadarGrid();

    // 2. Динамическая графика (луч, шлейф, метки, маркер базы)
    this.dynamicGraphics = this.add.graphics();

    // 3. Панель консоли оператора
    this.hudGraphics = this.add.graphics();
    this.drawHudPanel();
    this.createHudElements();
    this.createDecisionButtons();
    this.createWaveBanner();
    this.pauseOverlay = createPauseOverlay(this, () => this.togglePause());
    this.gameOverOverlay = createGameOverOverlay(this, () => this.restartGame());
    this.setupInputs();

    // Стартовые цели спавнятся ДАЛЕКО от базы для комфортного старта
    this.spawnInitialTargets(3);
    this.updateTargetSelectionUI();
    this.updateScoreBoard();
    this.drawHealthBar();
  }

  update(_time: number, delta: number): void {
    if (this.isGameOver || this.isPaused) return;

    const dt = Math.min(delta / 1000, 0.1);

    this.updateBeam(dt);
    this.updateTargets(dt);
    this.handleSpawning(dt);
    this.updateScanning(dt);
    updateExplosions(this.explosions, dt);
    this.renderDynamicElements();
    this.updateFeedback(dt);
    this.updateTelemetry();
    this.updateWaveBanner(dt);

    if (this.baseFlashTimer > 0) {
      this.baseFlashTimer -= dt;
    }
  }

  /**
   * Отрисовка постоянной сетки радара
   */
  private drawRadarGrid(): void {
    const { radarX, radarY, radarRadius, colors } = GAME_CONFIG;

    this.staticGraphics.fillStyle(colors.radarBg, 0.88);
    this.staticGraphics.fillCircle(radarX, radarY, radarRadius);

    // Кольца дальности (25%, 50%, 75%, 100%)
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ringSteps.forEach((fraction, index) => {
      const isOuter = index === ringSteps.length - 1;
      this.staticGraphics.lineStyle(
        isOuter ? 2 : 1,
        colors.gridRing,
        isOuter ? 0.9 : 0.2,
      );
      this.staticGraphics.strokeCircle(radarX, radarY, radarRadius * fraction);
    });

    // Зона ближней опасности (danger close ring)
    this.staticGraphics.lineStyle(1, colors.dangerRing, 0.3);
    this.staticGraphics.strokeCircle(radarX, radarY, 70);

    // Оси
    this.staticGraphics.lineStyle(1, colors.gridAxis, 0.22);
    this.staticGraphics.beginPath();
    this.staticGraphics.moveTo(radarX - radarRadius, radarY);
    this.staticGraphics.lineTo(radarX + radarRadius, radarY);
    this.staticGraphics.moveTo(radarX, radarY - radarRadius);
    this.staticGraphics.lineTo(radarX, radarY + radarRadius);
    this.staticGraphics.strokePath();

    // Засечки по окружности
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = Phaser.Math.DegToRad(deg);
      const isMajor = deg % 90 === 0;
      const tickLength = isMajor ? 10 : 5;

      const x1 = radarX + Math.cos(rad) * (radarRadius - tickLength);
      const y1 = radarY + Math.sin(rad) * (radarRadius - tickLength);
      const x2 = radarX + Math.cos(rad) * radarRadius;
      const y2 = radarY + Math.sin(rad) * radarRadius;

      this.staticGraphics.lineStyle(1, colors.gridRing, isMajor ? 0.7 : 0.3);
      this.staticGraphics.beginPath();
      this.staticGraphics.moveTo(x1, y1);
      this.staticGraphics.lineTo(x2, y2);
      this.staticGraphics.strokePath();
    }
  }

  /**
   * Отрисовка правой панели консоли
   */
  private drawHudPanel(): void {
    const { colors } = GAME_CONFIG;
    const panelX = 640;
    const panelY = 32;
    const panelW = 295;
    const panelH = 576;

    this.hudGraphics.fillStyle(colors.hudBg, 0.94);
    this.hudGraphics.fillRoundedRect(panelX, panelY, panelW, panelH, 6);

    this.hudGraphics.lineStyle(1.5, colors.hudBorder, 0.85);
    this.hudGraphics.strokeRoundedRect(panelX, panelY, panelW, panelH, 6);

    // Разделительные линии
    this.hudGraphics.lineStyle(1, colors.hudBorder, 0.5);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(panelX + 16, panelY + 125);
    this.hudGraphics.lineTo(panelX + panelW - 16, panelY + 125);
    this.hudGraphics.moveTo(panelX + 16, panelY + 284);
    this.hudGraphics.lineTo(panelX + panelW - 16, panelY + 284);
    this.hudGraphics.moveTo(panelX + 16, panelY + 452);
    this.hudGraphics.lineTo(panelX + panelW - 16, panelY + 452);
    this.hudGraphics.strokePath();
  }

  /**
   * Создание текстовых элементов консоли
   */
  private createHudElements(): void {
    const monoStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#4ade80',
    };

    this.add.text(660, 44, '[ КОНСОЛЬ ОПЕРАТОРА ПВО ]', {
      ...monoStyle,
      fontSize: '13px',
      color: '#86efac',
      fontStyle: 'bold',
    });

    // Здоровье базы
    this.healthText = this.add.text(660, 68, 'ЦЕЛОСТНОСТЬ БАЗЫ: 100%', {
      ...monoStyle,
      fontSize: '12px',
      color: '#22c55e',
      fontStyle: 'bold',
    });

    // Счёт и рекорд
    this.scoreText = this.add.text(660, 104, 'СЧЁТ: 0000', {
      ...monoStyle,
      fontSize: '15px',
      color: '#facc15',
      fontStyle: 'bold',
    });

    this.highScoreText = this.add.text(785, 104, `РЕКОРД: ${this.highScore}`, {
      ...monoStyle,
      fontSize: '12px',
      color: '#cbd5e1',
    });

    this.streakText = this.add.text(660, 132, 'СЕРИЯ: 0 (x1.0)', {
      ...monoStyle,
      fontSize: '12px',
      color: '#86efac',
    });

    this.waveText = this.add.text(785, 132, 'ВОЛНА: 1', {
      ...monoStyle,
      fontSize: '12px',
      color: '#38bdf8',
      fontStyle: 'bold',
    });

    // Ресурсы: перехватчики и сканы
    this.interceptorsText = this.add.text(660, 154, 'РАКЕТЫ: [|||||] 5/6', {
      ...monoStyle,
      fontSize: '11px',
      color: '#facc15',
      fontStyle: 'bold',
    });

    this.scansText = this.add.text(785, 154, 'СКАН: [***] 3/3', {
      ...monoStyle,
      fontSize: '11px',
      color: '#38bdf8',
      fontStyle: 'bold',
    });

    // Телеметрия
    this.targetTelemetryTitle = this.add.text(660, 178, 'ОБЪЕКТ СЛЕЖЕНИЯ: НЕТ', {
      ...monoStyle,
      fontSize: '12px',
      color: '#facc15',
      fontStyle: 'bold',
    });

    this.targetTelemetryText = this.add.text(660, 198, '', {
      ...monoStyle,
      fontSize: '12px',
      color: '#cbd5e1',
      lineSpacing: 3,
    });

    // Фидбек принятого решения
    this.feedbackText = this.add.text(660, 448, '', {
      ...monoStyle,
      fontSize: '11px',
      fontStyle: 'bold',
    });

    // Шпаргалка
    this.add.text(
      660,
      472,
      '--- ПРИЗНАКИ И СНАБЖЕНИЕ ---\n' +
        '• [4] Скан: сигнатура за 1.5с (время идёт!)\n' +
        '• Снабжение: [5] Ракета (150) | [6] Скан (100)\n' +
        '• Ракета (-30HP) | Бомбардировщик (-20HP)\n' +
        'Горячие клавиши: [1] [2] [3] [4] [5] [6]',
      {
        ...monoStyle,
        fontSize: '11px',
        color: '#64748b',
        lineSpacing: 4,
      },
    );
  }

  /**
   * Отрисовка полосы здоровья базы
   */
  private drawHealthBar(): void {
    const { colors } = GAME_CONFIG;
    const barX = 660;
    const barY = 90;
    const barW = 255;
    const barH = 10;

    this.hudGraphics.lineStyle(1, colors.hudBorder, 0.9);
    this.hudGraphics.strokeRect(barX, barY, barW, barH);

    this.hudGraphics.fillStyle(0x1e293b, 1);
    this.hudGraphics.fillRect(barX + 1, barY + 1, barW - 2, barH - 2);

    const healthFraction = Phaser.Math.Clamp(
      this.baseHealth / GAME_CONFIG.maxBaseHealth,
      0,
      1,
    );
    const fillW = (barW - 2) * healthFraction;

    let barColor = colors.healthGreen;
    if (this.baseHealth <= 30) {
      barColor = colors.healthRed;
    } else if (this.baseHealth <= 60) {
      barColor = colors.healthYellow;
    }

    this.hudGraphics.fillStyle(barColor, 0.95);
    this.hudGraphics.fillRect(barX + 1, barY + 1, fillW, barH - 2);

    this.healthText.setText(`ЦЕЛОСТНОСТЬ БАЗЫ: ${this.baseHealth}%`);
    this.healthText.setColor(
      this.baseHealth <= 30 ? '#ef4444' : this.baseHealth <= 60 ? '#facc15' : '#22c55e',
    );
  }

  /**
   * Баннер оповещения о смене волны
   */
  private createWaveBanner(): void {
    this.waveBannerText = this.add.text(
      GAME_CONFIG.radarX,
      GAME_CONFIG.radarY - 30,
      '',
      {
        fontFamily: 'Consolas, monospace',
        fontSize: '20px',
        color: '#38bdf8',
        backgroundColor: '#021827e6',
        padding: { x: 16, y: 8 },
        fontStyle: 'bold',
      },
    );
    this.waveBannerText.setOrigin(0.5);
    this.waveBannerText.setAlpha(0);
  }

  private showWaveBanner(text: string): void {
    this.waveBannerText.setText(text);
    this.waveBannerText.setAlpha(1);
    this.waveBannerTimer = 2.4;
  }

  private updateWaveBanner(dt: number): void {
    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0.5) {
        this.waveBannerText.setAlpha(Math.max(0, this.waveBannerTimer / 0.5));
      }
    }
  }

  /**
   * Создание кнопок классификации и сканирования
   */
  private createDecisionButtons(): void {
    const startY = 295;
    const btnW = 255;
    const btnH = 26;
    const gap = 4;

    this.buttons.friend = this.createButton(
      660,
      startY,
      btnW,
      btnH,
      '[1] СВОЙ БОРТ',
      GAME_CONFIG.colors.btnFriend,
      () => this.resolveDecision('friend'),
    );

    this.buttons.threat = this.createButton(
      660,
      startY + (btnH + gap),
      btnW,
      btnH,
      '[2] УГРОЗА (ПЕРЕХВАТ)',
      GAME_CONFIG.colors.btnThreat,
      () => this.resolveDecision('threat'),
    );

    this.buttons.ignore = this.createButton(
      660,
      startY + (btnH + gap) * 2,
      btnW,
      btnH,
      '[3] ИГНОРИРОВАТЬ',
      GAME_CONFIG.colors.btnIgnore,
      () => this.resolveDecision('ignore'),
    );

    this.buttons.scan = this.createButton(
      660,
      startY + (btnH + gap) * 3,
      btnW,
      btnH,
      '[4] СКАН СИГНАТУРЫ (1.5с)',
      GAME_CONFIG.colors.btnScan,
      () => this.startScanning(),
    );

    // Кнопки снабжения (дозакупки ракет и сканов за накопленные очки)
    const supplyY = startY + (btnH + gap) * 4;
    const halfW = 124;
    this.buttons.buyMissile = this.createButton(
      660,
      supplyY,
      halfW,
      btnH,
      `[5] +РАКЕТА (${GAME_CONFIG.interceptorCost})`,
      GAME_CONFIG.colors.btnSupply,
      () => this.buyInterceptor(),
      '11px',
    );

    this.buttons.buyScan = this.createButton(
      660 + halfW + 7,
      supplyY,
      halfW,
      btnH,
      `[6] +СКАН (${GAME_CONFIG.scanCost})`,
      GAME_CONFIG.colors.btnSupply,
      () => this.buyScan(),
      '11px',
    );
  }

  private createButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    color: number,
    onClick: () => void,
    fontSize = '12px',
  ): ButtonItem {
    const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, color, 0.45);
    bg.setStrokeStyle(1, color, 0.9);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: 'Consolas, monospace',
      fontSize,
      color: '#f8fafc',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);

    let isEnabled = false;

    bg.on('pointerover', () => {
      if (isEnabled) bg.setFillStyle(color, 0.85);
    });

    bg.on('pointerout', () => {
      if (isEnabled) bg.setFillStyle(color, 0.45);
    });

    bg.on('pointerdown', () => {
      if (isEnabled) onClick();
    });

    const setEnabled = (enabled: boolean) => {
      isEnabled = enabled;
      bg.setAlpha(enabled ? 1.0 : 0.3);
      text.setAlpha(enabled ? 1.0 : 0.3);
    };

    return { bg, text, setEnabled };
  }

  /**
   * Переключение паузы (безопасный тогл без накопления состояния)
   */
  private togglePause(): void {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    this.pauseOverlay.setVisible(this.isPaused);
  }

  /**
   * Срабатывание поражения базы
   */
  private triggerGameOver(): void {
    this.isGameOver = true;
    this.isPaused = false;
    this.pauseOverlay.hide();
    this.selectedTarget = null;
    this.isScanning = false;
    this.scanningTarget = null;
    this.updateTargetSelectionUI();

    let isNewRecord = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('radar_station_record', this.highScore.toString());
      isNewRecord = true;
    }

    this.gameOverOverlay.show(
      this.score,
      this.highScore,
      this.wave,
      this.bestStreak,
      isNewRecord,
    );
  }

  /**
   * Перезапуск игры
   */
  private restartGame(): void {
    this.isPaused = false;
    this.explosions = [];
    this.pauseOverlay.hide();
    this.gameOverOverlay.hide();
    this.scene.restart();
  }

  /**
   * Настройка пользовательского ввода
   */
  private setupInputs(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver || this.isPaused || pointer.x >= 640) return;

      const clicked = this.findTargetNear(pointer.x, pointer.y);
      this.selectedTarget = clicked;
      this.updateTargetSelectionUI();
    });

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-P', () => {
        this.togglePause();
      });
      this.input.keyboard.on('keydown-ONE', () => {
        if (!this.isGameOver && !this.isPaused) this.resolveDecision('friend');
      });
      this.input.keyboard.on('keydown-TWO', () => {
        if (!this.isGameOver && !this.isPaused) this.resolveDecision('threat');
      });
      this.input.keyboard.on('keydown-THREE', () => {
        if (!this.isGameOver && !this.isPaused) this.resolveDecision('ignore');
      });
      this.input.keyboard.on('keydown-FOUR', () => {
        if (!this.isGameOver && !this.isPaused) this.startScanning();
      });
      this.input.keyboard.on('keydown-FIVE', () => {
        if (!this.isGameOver && !this.isPaused) this.buyInterceptor();
      });
      this.input.keyboard.on('keydown-NUMPAD_FIVE', () => {
        if (!this.isGameOver && !this.isPaused) this.buyInterceptor();
      });
      this.input.keyboard.on('keydown-SIX', () => {
        if (!this.isGameOver && !this.isPaused) this.buyScan();
      });
      this.input.keyboard.on('keydown-NUMPAD_SIX', () => {
        if (!this.isGameOver && !this.isPaused) this.buyScan();
      });
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.isGameOver) this.restartGame();
      });
    }
  }

  private findTargetNear(x: number, y: number): GameTarget | null {
    let closest: GameTarget | null = null;
    let minDist = GAME_CONFIG.selectionHitRadius;

    for (const target of this.targets) {
      if (target.alpha > 0.04) {
        const d = Math.hypot(target.x - x, target.y - y);
        if (d < minDist) {
          minDist = d;
          closest = target;
        }
      }
    }
    return closest;
  }

  /**
   * Запуск глубокого сканирования сигнатуры цели (1.5 сек)
   */
  private startScanning(): void {
    if (!this.selectedTarget || this.isGameOver || this.isScanning) return;

    if (this.selectedTarget.isScanned) {
      this.showFeedback('[СКАН] ЦЕЛЬ УЖЕ ОПОЗНАНА', '#38bdf8');
      return;
    }

    if (this.scansAvailable <= 0) {
      this.showFeedback('[ОТКАЗ] НЕТ ЗАРЯДОВ СКАНИРОВАНИЯ (0 шт.)!', '#ef4444');
      return;
    }

    this.scansAvailable--;
    this.isScanning = true;
    this.scanningTarget = this.selectedTarget;
    this.scanProgress = 0;
    this.showFeedback('[СИСТЕМА] АНАЛИЗ СИГНАТУРЫ... (1.5 СЕК)', '#38bdf8');
    this.updateScoreBoard();
    this.updateTargetSelectionUI();
  }

  /**
   * Дозакупка ракеты-перехватчика за накопленные очки (бюджет)
   */
  private buyInterceptor(): void {
    if (this.isGameOver || this.isPaused) return;

    if (this.interceptors >= GAME_CONFIG.maxInterceptors) {
      this.showFeedback(
        `[СКЛАД] МАКСИМУМ РАКЕТ (${GAME_CONFIG.maxInterceptors}/${GAME_CONFIG.maxInterceptors})!`,
        '#facc15',
      );
      return;
    }

    if (this.score < GAME_CONFIG.interceptorCost) {
      this.showFeedback(
        `[БЮДЖЕТ] НЕ ХВАТАЕТ ОЧКОВ (НУЖНО ${GAME_CONFIG.interceptorCost})!`,
        '#ef4444',
      );
      return;
    }

    this.score -= GAME_CONFIG.interceptorCost;
    this.interceptors++;
    this.showFeedback(
      `[СНАБЖЕНИЕ] +1 РАКЕТА (-${GAME_CONFIG.interceptorCost} ОЧКОВ)`,
      '#22c55e',
    );
    this.updateScoreBoard();
    this.updateTargetSelectionUI();
  }

  /**
   * Дозакупка заряда сканирования за накопленные очки (бюджет)
   */
  private buyScan(): void {
    if (this.isGameOver || this.isPaused) return;

    if (this.scansAvailable >= GAME_CONFIG.maxScansPerWave) {
      this.showFeedback(
        `[СЕНСОРЫ] МАКСИМУМ СКАНОВ (${GAME_CONFIG.maxScansPerWave}/${GAME_CONFIG.maxScansPerWave})!`,
        '#38bdf8',
      );
      return;
    }

    if (this.score < GAME_CONFIG.scanCost) {
      this.showFeedback(
        `[БЮДЖЕТ] НЕ ХВАТАЕТ ОЧКОВ (НУЖНО ${GAME_CONFIG.scanCost})!`,
        '#ef4444',
      );
      return;
    }

    this.score -= GAME_CONFIG.scanCost;
    this.scansAvailable++;
    this.showFeedback(
      `[СНАБЖЕНИЕ] +1 СКАН (-${GAME_CONFIG.scanCost} ОЧКОВ)`,
      '#22c55e',
    );
    this.updateScoreBoard();
    this.updateTargetSelectionUI();
  }

  /**
   * Обновление таймера сканирования (время в игре идёт непрерывно)
   */
  private updateScanning(dt: number): void {
    if (!this.isScanning || !this.scanningTarget) return;

    if (!this.targets.includes(this.scanningTarget)) {
      this.isScanning = false;
      this.scanningTarget = null;
      this.scanProgress = 0;
      this.updateTargetSelectionUI();
      return;
    }

    this.scanProgress += dt;
    if (this.scanProgress >= GAME_CONFIG.scanDuration) {
      this.isScanning = false;
      this.scanningTarget.isScanned = true;
      const typeCfg = GAME_CONFIG.targetTypes[this.scanningTarget.type];
      this.showFeedback(
        `[ОПОЗНАНО!] СИГНАТУРА: ${typeCfg.label.toUpperCase()}`,
        '#38bdf8',
      );
      this.scanningTarget = null;
      this.updateTargetSelectionUI();
    }
  }

  /**
   * Обработка решения игрока
   */
  private resolveDecision(choice: DecisionChoice): void {
    if (!this.selectedTarget || this.isGameOver) return;
    const target = this.selectedTarget;

    // Проверка наличия ракет-перехватчиков для «Угрозы»
    if (choice === 'threat') {
      if (this.interceptors <= 0) {
        this.showFeedback('[ОТКАЗ!] БОЕКОМПЛЕКТ ПУСТ! ОЖИДАЙТЕ СНАБЖЕНИЯ', '#ef4444');
        return;
      }
      this.interceptors--;

      // Эффект взрыва: для техники (ракета, бомбардировщик, союзник) - с ударной волной, для ловушки - только вспышка
      const hasShockwave = target.type !== 'decoy';
      this.explosions.push(createExplosion(target.x, target.y, hasShockwave));
    }
    const typeCfg = GAME_CONFIG.targetTypes[target.type];
    const correctCategory = typeCfg.category;

    const multiplier = Math.min(
      GAME_CONFIG.maxMultiplier,
      1 + Math.floor(this.streak / GAME_CONFIG.streakStepForMultiplier) * 0.5,
    );

    let feedback = '';
    let feedbackColor = '#4ade80';

    if (choice === correctCategory) {
      const isDecoy = target.type === 'decoy';
      const basePoints = isDecoy
        ? GAME_CONFIG.scorePerDecoyIgnored
        : GAME_CONFIG.scorePerCorrect;
      const points = Math.round(basePoints * multiplier);
      this.score += points;
      this.streak += 1;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;

      if (target.type === 'missile') {
        feedback = `[ВЕРНО!] РАКЕТА СБИТА (+${points}) [РАКЕТ: ${this.interceptors}]`;
      } else if (target.type === 'bomber') {
        feedback = `[ВЕРНО!] БОМБАРДИРОВЩИК СБИТ (+${points}) [РАКЕТ: ${this.interceptors}]`;
      } else if (target.type === 'friend') {
        feedback = `[ВЕРНО!] СОЮЗНИК ПРОПУЩЕН (+${points})`;
      } else {
        feedback =
          points > 0
            ? `[ВЕРНО!] ЛОЖНАЯ ЦЕЛЬ ОТФИЛЬТРОВАНА (+${points})`
            : `[ВЕРНО!] ЛОЖНАЯ ЦЕЛЬ ОТФИЛЬТРОВАНА (СЕРИЯ +1)`;
      }
    } else {
      this.streak = 0;
      feedbackColor = '#f87171';

      if (target.type === 'friend' && choice === 'threat') {
        this.score = Math.max(0, this.score - GAME_CONFIG.friendlyFirePenalty);
        feedback = `[ОШИБКА!] СБИТ СВОЙ БОРТ! (-${GAME_CONFIG.friendlyFirePenalty})`;
      } else if (target.type === 'decoy' && choice === 'threat') {
        feedback = `[ПРОМАХ!] ПЕРЕХВАТЧИК ВПУСТУЮ НА ЛОВУШКУ! (Ост: ${this.interceptors})`;
        feedbackColor = '#fbbf24';
      } else if (target.type === 'missile' || target.type === 'bomber') {
        feedback = `[ОШИБКА!] ПРОПУЩЕНА УГРОЗА (${typeCfg.label})`;
      } else {
        feedback = `[ОШИБКА!] НЕВЕРНАЯ КЛАССИФИКАЦИЯ`;
      }
    }

    this.showFeedback(feedback, feedbackColor);
    this.updateScoreBoard();

    // Сброс скана, если сканировалась эта цель
    if (this.scanningTarget === target) {
      this.isScanning = false;
      this.scanningTarget = null;
    }

    const idx = this.targets.indexOf(target);
    if (idx !== -1) {
      this.targets.splice(idx, 1);
    }
    this.selectedTarget = null;
    this.updateTargetSelectionUI();

    this.checkWaveProgress();
  }

  private showFeedback(text: string, color: string): void {
    this.feedbackText.setText(text);
    this.feedbackText.setColor(color);
    this.feedbackTimer = 2.8;
  }

  private updateFeedback(dt: number): void {
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) {
        this.feedbackText.setText('');
      }
    }
  }

  private updateScoreBoard(): void {
    const mult = (
      1 +
      Math.floor(this.streak / GAME_CONFIG.streakStepForMultiplier) * 0.5
    ).toFixed(1);
    this.scoreText.setText(`СЧЁТ: ${this.score.toString().padStart(4, '0')}`);
    this.streakText.setText(`СЕРИЯ: ${this.streak} (x${mult})`);
    this.waveText.setText(`ВОЛНА: ${this.wave}`);
    this.highScoreText.setText(`РЕКОРД: ${this.highScore}`);

    // Отображение перехватчиков и зарядов сканирования
    const ammoBars = '|'.repeat(this.interceptors).padEnd(GAME_CONFIG.maxInterceptors, ' ');
    this.interceptorsText.setText(`РАКЕТЫ: [${ammoBars}] ${this.interceptors}/${GAME_CONFIG.maxInterceptors}`);
    this.interceptorsText.setColor(this.interceptors > 1 ? '#facc15' : '#ef4444');

    const scanStars = '*'.repeat(this.scansAvailable).padEnd(GAME_CONFIG.maxScansPerWave, ' ');
    this.scansText.setText(`СКАН:   [${scanStars}] ${this.scansAvailable}/${GAME_CONFIG.maxScansPerWave}`);
    this.scansText.setColor(this.scansAvailable > 0 ? '#38bdf8' : '#64748b');

    // Обновление доступности кнопок снабжения
    const canBuyMissile =
      this.interceptors < GAME_CONFIG.maxInterceptors &&
      this.score >= GAME_CONFIG.interceptorCost;
    if (this.buttons.buyMissile) {
      this.buttons.buyMissile.setEnabled(canBuyMissile);
    }

    const canBuyScan =
      this.scansAvailable < GAME_CONFIG.maxScansPerWave &&
      this.score >= GAME_CONFIG.scanCost;
    if (this.buttons.buyScan) {
      this.buttons.buyScan.setEnabled(canBuyScan);
    }
  }

  private updateTargetSelectionUI(): void {
    const isSelected = this.selectedTarget !== null;

    this.buttons.friend.setEnabled(isSelected);
    this.buttons.threat.setEnabled(isSelected && this.interceptors > 0);
    this.buttons.ignore.setEnabled(isSelected);

    const canScan =
      isSelected &&
      !this.selectedTarget?.isScanned &&
      this.scansAvailable > 0 &&
      !this.isScanning;
    this.buttons.scan.setEnabled(canScan);

    if (!isSelected) {
      this.targetTelemetryTitle.setText('ОБЪЕКТ СЛЕЖЕНИЯ: НЕТ');
      this.targetTelemetryTitle.setColor('#94a3b8');
      this.targetTelemetryText.setText(
        'Кликните по вспыхнувшей\n' +
          'зелёной точке на радаре,\n' +
          'чтобы захватить объект\n' +
          'для классификации.',
      );
    }
  }

  private updateTelemetry(): void {
    if (!this.selectedTarget) return;

    const t = this.selectedTarget;
    const dist = Math.round(
      Math.hypot(t.x - GAME_CONFIG.radarX, t.y - GAME_CONFIG.radarY),
    );

    this.targetTelemetryTitle.setText(`ОБЪЕКТ СЛЕЖЕНИЯ: #TRK-${t.id}`);
    this.targetTelemetryTitle.setColor('#facc15');

    let typeStr = 'ТИП:        [ НЕОПОЗНАН ]';
    if (t.isScanned) {
      const cfg = GAME_CONFIG.targetTypes[t.type];
      const catTag =
        cfg.category === 'threat'
          ? 'УГРОЗА!'
          : cfg.category === 'friend'
            ? 'СОЮЗНИК'
            : 'ЛОВУШКА';
      typeStr = `ТИП:        ${cfg.label.toUpperCase()} (${catTag})`;
    } else if (this.isScanning && this.scanningTarget === t) {
      const pct = Math.min(
        100,
        Math.round((this.scanProgress / GAME_CONFIG.scanDuration) * 100),
      );
      typeStr = `АНАЛИЗ:     [${'#'.repeat(Math.floor(pct / 10))}${'.'.repeat(10 - Math.floor(pct / 10))}] ${pct}%`;
    }

    this.targetTelemetryText.setText(
      `${typeStr}\n` +
        `СКОРОСТЬ:   ${t.speed} км/ч\n` +
        `КУРС:       ${t.headingDeg}°\n` +
        `СИГНАЛ ЭПР: ${t.signal}%\n` +
        `ДИСТАНЦИЯ:  ${dist} км`,
    );
  }

  private updateBeam(dt: number): void {
    const prevAngle = this.beamAngle;
    const twoPi = Math.PI * 2;
    this.beamAngle = (this.beamAngle + this.currentBeamSpeed * dt) % twoPi;

    for (const target of this.targets) {
      const dx = target.x - GAME_CONFIG.radarX;
      const dy = target.y - GAME_CONFIG.radarY;
      const dist = Math.hypot(dx, dy);

      if (dist <= GAME_CONFIG.radarRadius) {
        let targetAngle = Math.atan2(dy, dx);
        if (targetAngle < 0) targetAngle += twoPi;

        if (this.isAngleBetween(targetAngle, prevAngle, this.beamAngle)) {
          target.alpha = 1.0;
        }
      }
    }
  }

  private isAngleBetween(target: number, from: number, to: number): boolean {
    if (to >= from) return target >= from && target <= to;
    return target >= from || target <= to;
  }

  /**
   * Движение целей и проверка достижения базы
   */
  private updateTargets(dt: number): void {
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i];

      // ИИ маневрирования: проверка наступления запланированного манёвра у кораблей
      if (target.maneuverTimer !== undefined && !target.hasManeuvered) {
        target.maneuverTimer -= dt;
        if (target.maneuverTimer <= 0) {
          target.hasManeuvered = true;
          this.executeShipManeuver(target);
        }
      }

      // Плавный доворот судна к целевому курсу
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

      target.x += target.vx * dt;
      target.y += target.vy * dt;

      if (target.alpha > 0) {
        target.alpha = Math.max(0, target.alpha - dt / GAME_CONFIG.blipFadeDuration);
      }

      const distToBase = Math.hypot(
        target.x - GAME_CONFIG.radarX,
        target.y - GAME_CONFIG.radarY,
      );

      // Цель проникла на базу
      if (distToBase < 18) {
        if (target.type === 'missile') {
          this.baseHealth = Math.max(0, this.baseHealth - GAME_CONFIG.damageMissile);
          this.showFeedback(
            `[УДАР!] ПРОПУЩЕНА РАКЕТА! (-${GAME_CONFIG.damageMissile} HP)`,
            '#ef4444',
          );
          this.baseFlashTimer = 0.6;
        } else if (target.type === 'bomber') {
          this.baseHealth = Math.max(0, this.baseHealth - GAME_CONFIG.damageBomber);
          this.showFeedback(
            `[УДАР!] БОМБАРДИРОВКА БАЗЫ! (-${GAME_CONFIG.damageBomber} HP)`,
            '#ef4444',
          );
          this.baseFlashTimer = 0.6;
        } else if (target.type === 'friend') {
          this.showFeedback(`[БАЗА] СОЮЗНИК БЕЗОПАСНО ВОШЁЛ В ЗОНУ`, '#86efac');
        } else if (target.type === 'decoy') {
          if (target.decoyPassesThroughBase && !target.hasPassedBase) {
            target.hasPassedBase = true;
            this.showFeedback(`[БАЗА] ЛОЖНАЯ ЦЕЛЬ ПРОШЛА НАВЫЛЕТ (0 УРОНА)`, '#64748b');
            continue;
          } else if (target.hasPassedBase) {
            continue;
          } else {
            this.showFeedback(`[БАЗА] ЛОЖНЫЙ СИГНАЛ РАССЕЯЛСЯ (0 УРОНА)`, '#64748b');
          }
        }

        this.drawHealthBar();

        if (this.selectedTarget === target) {
          this.selectedTarget = null;
          this.updateTargetSelectionUI();
        }

        if (this.scanningTarget === target) {
          this.isScanning = false;
          this.scanningTarget = null;
        }

        this.targets.splice(i, 1);
        this.checkWaveProgress();

        if (this.baseHealth <= 0 && !this.isGameOver) {
          this.triggerGameOver();
          return;
        }
      } else if (distToBase > GAME_CONFIG.radarRadius * 1.05) {
        if (this.selectedTarget === target) {
          this.selectedTarget = null;
          this.updateTargetSelectionUI();
        }

        if (this.scanningTarget === target) {
          this.isScanning = false;
          this.scanningTarget = null;
        }

        this.targets.splice(i, 1);
        this.checkWaveProgress();
      }
    }
  }

  /**
   * ИИ манёвра кораблей (бомбардировщиков и союзников)
   */
  private executeShipManeuver(target: GameTarget): void {
    if (target.type === 'bomber') {
      // 70% шанс: бомбардировщик доворачивает прямо на базу для атаки
      if (Math.random() < 0.7) {
        target.targetHeadingRad = Math.atan2(
          GAME_CONFIG.radarY - target.y,
          GAME_CONFIG.radarX - target.x,
        );
      } else {
        // 30% шанс: транзитный уход в сторону от базы
        target.targetHeadingRad = target.headingRad + Phaser.Math.FloatBetween(-0.6, 0.6);
      }
    } else if (target.type === 'friend') {
      // Союзник: 50% заход на базу (посадка/дозаправка), 50% транзитный пролёт
      if (Math.random() < 0.5) {
        target.targetHeadingRad = Math.atan2(
          GAME_CONFIG.radarY - target.y,
          GAME_CONFIG.radarX - target.x,
        );
      } else {
        target.targetHeadingRad = target.headingRad + Phaser.Math.FloatBetween(-0.5, 0.5);
      }
    }
  }

  /**
   * Спавн целей текущей волны
   */
  private handleSpawning(dt: number): void {
    if (this.waveTargetsToSpawn <= 0) return;

    this.spawnTimer -= dt;
    const maxActive = GAME_CONFIG.maxActiveTargetsBase + Math.floor(this.wave / 2);

    if (this.spawnTimer <= 0) {
      if (this.targets.length < maxActive) {
        this.spawnTargetAtEdge();
        this.waveTargetsToSpawn--;
      }

      const speedUp = Math.min(1.2, (this.wave - 1) * 0.12);
      this.spawnTimer = Phaser.Math.FloatBetween(
        Math.max(1.6, GAME_CONFIG.spawnIntervalMinBase - speedUp),
        Math.max(2.6, GAME_CONFIG.spawnIntervalMaxBase - speedUp),
      );
    }
  }

  /**
   * Проверка перехода к следующей волне
   */
  private checkWaveProgress(): void {
    if (this.waveTargetsToSpawn <= 0 && this.targets.length === 0 && !this.isGameOver) {
      this.wave++;
      this.waveTargetsToSpawn = 7 + this.wave * 2;

      // Луч ускоряется с каждой волной
      this.currentBeamSpeed =
        GAME_CONFIG.beamSpeedBase * Math.min(1.85, 1 + (this.wave - 1) * 0.09);

      // Пополнение боекомплекта перехватчиков и зарядов сканирования
      const addedAmmo = Math.min(
        GAME_CONFIG.maxInterceptors - this.interceptors,
        GAME_CONFIG.interceptorRefillPerWave,
      );
      this.interceptors = Math.min(
        GAME_CONFIG.maxInterceptors,
        this.interceptors + GAME_CONFIG.interceptorRefillPerWave,
      );
      this.scansAvailable = GAME_CONFIG.maxScansPerWave;

      this.updateScoreBoard();
      this.showWaveBanner(
        `ВОЛНА ${this.wave}\nСНАБЖЕНИЕ: +${addedAmmo} РАКЕТЫ, СКАНЫ 3/3`,
      );
    }
  }

  /**
   * Спавн стартовых целей: строго на внешнем радиусе, чтобы игрок успел среагировать
   */
  private spawnInitialTargets(count: number): void {
    for (let i = 0; i < count; i++) {
      const dist = Phaser.Math.FloatBetween(
        GAME_CONFIG.radarRadius * 0.8,
        GAME_CONFIG.radarRadius * 0.96,
      );
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.createTargetAt(
        GAME_CONFIG.radarX + Math.cos(angle) * dist,
        GAME_CONFIG.radarY + Math.sin(angle) * dist,
      );
    }
  }

  private spawnTargetAtEdge(): void {
    const spawnAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const spawnDist = GAME_CONFIG.radarRadius - 2;

    const x = GAME_CONFIG.radarX + Math.cos(spawnAngle) * spawnDist;
    const y = GAME_CONFIG.radarY + Math.sin(spawnAngle) * spawnDist;

    this.createTargetAt(x, y);
  }

  private createTargetAt(x: number, y: number): void {
    const type = this.pickRandomType();
    const typeCfg = GAME_CONFIG.targetTypes[type];

    let heading: number;
    let decoyPassesThroughBase: boolean | undefined = undefined;
    let turnRate = 0;
    let maneuverTimer: number | undefined = undefined;

    if (type === 'decoy') {
      // Ловушка движется по хордам (включая диаметральные диагонали через базу)
      const angleFromCenter = Math.atan2(y - GAME_CONFIG.radarY, x - GAME_CONFIG.radarX);
      const deltaAngle = Phaser.Math.FloatBetween(-1.15, 1.15); // хорды от центральных до боковых
      const exitAngle = angleFromCenter + Math.PI + deltaAngle;
      const exitX = GAME_CONFIG.radarX + Math.cos(exitAngle) * GAME_CONFIG.radarRadius;
      const exitY = GAME_CONFIG.radarY + Math.sin(exitAngle) * GAME_CONFIG.radarRadius;
      heading = Math.atan2(exitY - y, exitX - x);
      decoyPassesThroughBase = Math.random() < 0.5;
    } else if (type === 'missile') {
      // Ракета летит строго по прямой в центр базы без манёвров
      heading = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
    } else {
      // Корабли (бомбардировщик и союзник): начинают под углом и могут довернуть
      const angleToCenter = Math.atan2(GAME_CONFIG.radarY - y, GAME_CONFIG.radarX - x);
      heading =
        angleToCenter +
        Phaser.Math.FloatBetween(-typeCfg.headingJitter, typeCfg.headingJitter);
      // Способность плавно маневрировать
      turnRate = Phaser.Math.FloatBetween(0.3, 0.55); // ~17..31 град/сек
      maneuverTimer = Phaser.Math.FloatBetween(2.2, 4.2); // секунды до принятия решения о довороте
    }

    const waveSpeedFactor = 1 + Math.min(0.35, (this.wave - 1) * 0.04);
    const speed =
      Phaser.Math.FloatBetween(typeCfg.speedRange[0], typeCfg.speedRange[1]) *
      waveSpeedFactor;

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
      headingRad: heading,
      targetHeadingRad: heading,
      turnRate,
      maneuverTimer,
      signal,
      alpha: 0,
      decoyPassesThroughBase,
    });
  }

  private pickRandomType(): TargetType {
    const types = Object.keys(GAME_CONFIG.targetTypes) as TargetType[];
    const totalWeight = types.reduce(
      (sum, t) => sum + GAME_CONFIG.targetTypes[t].weight,
      0,
    );
    let rnd = Phaser.Math.Between(1, totalWeight);

    for (const t of types) {
      rnd -= GAME_CONFIG.targetTypes[t].weight;
      if (rnd <= 0) return t;
    }
    return 'missile';
  }

  /**
   * Отрисовка динамических объектов радара
   */
  private renderDynamicElements(): void {
    const { radarX, radarY, radarRadius, colors, trailSteps, trailAngle, blipRadius } =
      GAME_CONFIG;

    this.dynamicGraphics.clear();

    // 1. Шлейф луча
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

    // 3. Маркер базы в центре (вспыхивает красным при уроне)
    const baseColor = this.baseFlashTimer > 0 ? 0xef4444 : colors.gridRing;
    this.dynamicGraphics.lineStyle(1.8, baseColor, 0.95);
    this.dynamicGraphics.strokeCircle(radarX, radarY, 8);
    this.dynamicGraphics.fillStyle(baseColor, 0.95);
    this.dynamicGraphics.fillCircle(radarX, radarY, 3);

    // 4. Метки целей (люминофор)
    for (const target of this.targets) {
      if (target.alpha > 0.02) {
        this.dynamicGraphics.fillStyle(colors.blipHalo, target.alpha * 0.38);
        this.dynamicGraphics.fillCircle(target.x, target.y, blipRadius * 2.4);

        this.dynamicGraphics.fillStyle(colors.blipCore, target.alpha);
        this.dynamicGraphics.fillCircle(target.x, target.y, blipRadius);
      }

      // Индикатор опознанной цели
      if (target.isScanned) {
        const typeCfg = GAME_CONFIG.targetTypes[target.type];
        const tagColor =
          typeCfg.category === 'threat'
            ? 0xef4444
            : typeCfg.category === 'friend'
              ? 0x22c55e
              : 0x94a3b8;
        this.dynamicGraphics.lineStyle(1.2, tagColor, 0.85);
        this.dynamicGraphics.strokeCircle(target.x, target.y, blipRadius * 2.8);
      }
    }

    // 5. Анимация сканирования сигнатуры
    if (this.isScanning && this.scanningTarget) {
      const { x, y } = this.scanningTarget;
      const pulse = 16 + Math.sin(this.time.now * 0.015) * 3;
      this.dynamicGraphics.lineStyle(1.5, colors.scanCyan, 0.9);
      this.dynamicGraphics.strokeCircle(x, y, pulse);

      const rot = (this.time.now * 0.005) % (Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2;
        this.dynamicGraphics.beginPath();
        this.dynamicGraphics.moveTo(
          x + Math.cos(a) * (pulse - 4),
          y + Math.sin(a) * (pulse - 4),
        );
        this.dynamicGraphics.lineTo(
          x + Math.cos(a) * (pulse + 4),
          y + Math.sin(a) * (pulse + 4),
        );
        this.dynamicGraphics.strokePath();
      }
    }

    // 6. Маркер захвата выбранной цели [ · ]
    if (this.selectedTarget) {
      const { x, y } = this.selectedTarget;
      const s = 11;
      this.dynamicGraphics.lineStyle(1.5, colors.selectedBox, 0.95);

      this.dynamicGraphics.beginPath();
      this.dynamicGraphics.moveTo(x - s, y - s + 4);
      this.dynamicGraphics.lineTo(x - s, y - s);
      this.dynamicGraphics.lineTo(x - s + 4, y - s);
      this.dynamicGraphics.moveTo(x + s - 4, y - s);
      this.dynamicGraphics.lineTo(x + s, y - s);
      this.dynamicGraphics.lineTo(x + s, y - s + 4);
      this.dynamicGraphics.moveTo(x - s, y + s - 4);
      this.dynamicGraphics.lineTo(x - s, y + s);
      this.dynamicGraphics.lineTo(x - s + 4, y + s);
      this.dynamicGraphics.moveTo(x + s - 4, y + s);
      this.dynamicGraphics.lineTo(x + s, y + s);
      this.dynamicGraphics.lineTo(x + s, y + s - 4);
      this.dynamicGraphics.strokePath();
    }

    // 7. Эффекты взрывов и ударных волн
    renderExplosions(this.dynamicGraphics, this.explosions);
  }
}


