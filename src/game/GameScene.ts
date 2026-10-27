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
  type ExplosionEffect,
} from './effects';
import {
  createGameOverOverlay,
  createPauseOverlay,
  createBriefingOverlay,
  createHud,
  type GameOverOverlay,
  type PauseOverlay,
  type BriefingOverlay,
  type HudManager,
  type GameSessionStats,
} from './ui';
import { setupGameInputs } from './input';
import { createRadarRender, type RadarRender } from './radarRender';
import { createSpawner, type TargetSpawner } from './spawner';


export class GameScene extends Phaser.Scene {
  private static hasSeenBriefing = false;

  private radarRender!: RadarRender;
  private hud!: HudManager;
  private gameOverOverlay!: GameOverOverlay;
  private pauseOverlay!: PauseOverlay;
  private briefingOverlay!: BriefingOverlay;
  private spawner: TargetSpawner = createSpawner();
  private isPaused = false;
  private isGameStarted = false;

  // Динамические параметры луча и волн
  private currentBeamSpeed = GAME_CONFIG.beamSpeedBase;
  private beamAngle = 0;
  private targets: GameTarget[] = [];
  private selectedTarget: GameTarget | null = null;
  private explosions: ExplosionEffect[] = [];

  // Ресурсы и механика сканирования
  private interceptors = GAME_CONFIG.startInterceptors;
  private scansAvailable = GAME_CONFIG.maxScansPerWave;
  private isScanning = false;
  private scanningTarget: GameTarget | null = null;
  private scanProgress = 0;

  // Состояние игры
  private baseHealth = GAME_CONFIG.maxBaseHealth;
  private score = 0;
  private credits = GAME_CONFIG.startCredits;
  private streak = 0;
  private bestStreak = 0;
  private wave = 1;
  private waveTargetsToSpawn = 7;
  private waveHadFlaws = false;
  private isGameOver = false;
  private highScore = 0;
  private stats: GameSessionStats = { missilesShot: 0, bombersShot: 0, friendsSaved: 0, decoysFiltered: 0, threatsMissed: 0, friendlyFireCount: 0, correctDecisions: 0, totalDecisions: 0, sessionTime: 0 };

  // Таймеры эффектов
  private baseFlashTimer = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.isGameOver = false;
    this.isPaused = false;
    this.isGameStarted = false;
    this.baseHealth = GAME_CONFIG.maxBaseHealth;
    this.score = 0;
    this.credits = GAME_CONFIG.startCredits;
    this.streak = 0;
    this.bestStreak = 0;
    this.wave = 1;
    this.waveTargetsToSpawn = 7;
    this.waveHadFlaws = false;
    this.stats = { missilesShot: 0, bombersShot: 0, friendsSaved: 0, decoysFiltered: 0, threatsMissed: 0, friendlyFireCount: 0, correctDecisions: 0, totalDecisions: 0, sessionTime: 0 };
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

    // 1. Рендер экрана радара (статическая сетка и динамические слои)
    this.radarRender = createRadarRender(this);

    // 3. Панель консоли оператора
    this.hud = createHud(this, {
      onDecision: (choice) => this.resolveDecision(choice),
      onScan: () => this.startScanning(),
      onBuyMissile: () => this.buyInterceptor(),
      onBuyScan: () => this.buyScan(),
    });
    this.pauseOverlay = createPauseOverlay(this, {
      onResume: () => this.togglePause(),
      onOpenBriefing: () => this.openBriefing(),
    });
    this.briefingOverlay = createBriefingOverlay(this, () => this.handleBriefingClose());
    this.gameOverOverlay = createGameOverOverlay(this, () => this.restartGame());
    setupGameInputs(this, {
      onSelectRadarTarget: (x, y) => {
        this.selectedTarget = this.findTargetNear(x, y);
        this.updateTargetSelectionUI();
      },
      onTogglePause: () => this.togglePause(),
      onDecision: (choice) => this.resolveDecision(choice),
      onScan: () => this.startScanning(),
      onBuyMissile: () => this.buyInterceptor(),
      onBuyScan: () => this.buyScan(),
      onRestart: () => this.restartGame(),
      onCloseBriefing: () => this.handleBriefingClose(),
      isGameOver: () => this.isGameOver,
      isPaused: () => this.isPaused,
      isBriefingOpen: () => this.briefingOverlay.isVisible(),
    });

    if (!GameScene.hasSeenBriefing) {
      this.isGameStarted = false;
      this.briefingOverlay.show(true);
      this.updateScoreBoard();
      this.drawHealthBar();
    } else {
      this.startCombat();
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);

    if (!this.isGameStarted) {
      this.updateBeam(dt * 0.5);
      this.radarRender.renderDynamic({
        beamAngle: this.beamAngle,
        baseFlashTimer: 0,
        targets: [],
        selectedTarget: null,
        isScanning: false,
        scanningTarget: null,
        timeNow: this.time.now,
        explosions: [],
      });
      return;
    }

    if (this.isGameOver || this.isPaused) return;

    this.stats.sessionTime += dt;

    this.updateBeam(dt);
    this.updateTargets(dt);
    const newTarget = this.spawner.update(
      dt,
      this.wave,
      this.targets.length,
      this.waveTargetsToSpawn,
    );
    if (newTarget) {
      this.targets.push(newTarget);
      this.waveTargetsToSpawn--;
    }
    this.updateScanning(dt);
    updateExplosions(this.explosions, dt);
    this.radarRender.renderDynamic({
      beamAngle: this.beamAngle,
      baseFlashTimer: this.baseFlashTimer,
      targets: this.targets,
      selectedTarget: this.selectedTarget,
      isScanning: this.isScanning,
      scanningTarget: this.scanningTarget,
      timeNow: this.time.now,
      explosions: this.explosions,
    });
    this.hud.updateFeedback(dt);
    this.updateTelemetry();
    this.hud.updateWaveBanner(dt);

    if (this.baseFlashTimer > 0) {
      this.baseFlashTimer -= dt;
    }
  }

  /**
   * Запуск боевого дежурства (старт спавна и появление первых целей)
   */
  private startCombat(): void {
    this.isGameStarted = true;
    this.spawner.reset();
    // Стартовые цели спавнятся ДАЛЕКО от базы для комфортного старта
    this.targets = this.spawner.spawnInitialTargets(3, this.wave);
    this.updateTargetSelectionUI();
    this.updateScoreBoard();
    this.drawHealthBar();
  }

  /**
   * Открытие окна боевого инструктажа (из меню паузы)
   */
  private openBriefing(): void {
    this.pauseOverlay.hide();
    this.briefingOverlay.show(false);
  }

  /**
   * Обработка закрытия окна инструктажа
   */
  private handleBriefingClose(): void {
    if (!this.isGameStarted) {
      GameScene.hasSeenBriefing = true;
      this.briefingOverlay.hide();
      this.startCombat();
    } else {
      this.briefingOverlay.hide();
      this.isPaused = false;
      this.pauseOverlay.hide();
    }
  }

  /**
   * Отрисовка полосы здоровья базы (делегирование в HUD)
   */
  private drawHealthBar(): void {
    this.hud.drawHealthBar(this.baseHealth);
  }

  /**
   * Отображение баннера волны (делегирование в HUD)
   */
  private showWaveBanner(text: string): void {
    this.hud.showWaveBanner(text);
  }

  /**
   * Переключение паузы (безопасный тогл без накопления состояния)
   */
  private togglePause(): void {
    if (this.isGameOver || !this.isGameStarted) return;
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
    this.briefingOverlay.hide();
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
      this.stats,
    );
  }

  /**
   * Перезапуск игры
   */
  private restartGame(): void {
    this.isPaused = false;
    this.explosions = [];
    this.pauseOverlay.hide();
    this.briefingOverlay.hide();
    this.gameOverOverlay.hide();
    this.scene.restart();
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

  private getDistToBase(x: number, y: number): number {
    return Math.hypot(x - GAME_CONFIG.radarX, y - GAME_CONFIG.radarY);
  }

  /**
   * Корректное удаление цели: снятие выделения, сброс сканирования и проверка волны
   */
  private removeTarget(target: GameTarget): void {
    const idx = this.targets.indexOf(target);
    if (idx !== -1) {
      this.targets.splice(idx, 1);
    }
    if (this.selectedTarget === target) {
      this.selectedTarget = null;
      this.updateTargetSelectionUI();
    }
    if (this.scanningTarget === target) {
      this.isScanning = false;
      this.scanningTarget = null;
    }
    this.checkWaveProgress();
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
   * Универсальная дозакупка снабжения за кредиты базы
   */
  private buySupplyItem(
    current: number,
    max: number,
    cost: number,
    maxFeedback: string,
    maxColor: string,
    successFeedback: string,
    onSuccess: () => void,
  ): void {
    if (this.isGameOver || this.isPaused) return;

    if (current >= max) {
      this.showFeedback(maxFeedback, maxColor);
      return;
    }

    if (this.credits < cost) {
      this.showFeedback(`[БЮДЖЕТ] НЕ ХВАТАЕТ КРЕДИТОВ (НУЖНО ${cost} CR)!`, '#ef4444');
      return;
    }

    this.credits -= cost;
    onSuccess();
    this.showFeedback(successFeedback, '#22c55e');
    this.updateScoreBoard();
    this.updateTargetSelectionUI();
  }

  private buyInterceptor(): void {
    this.buySupplyItem(
      this.interceptors,
      GAME_CONFIG.maxInterceptors,
      GAME_CONFIG.interceptorCost,
      `[СКЛАД] МАКСИМУМ РАКЕТ (${GAME_CONFIG.maxInterceptors}/${GAME_CONFIG.maxInterceptors})!`,
      '#facc15',
      `[СНАБЖЕНИЕ] +1 РАКЕТА (-${GAME_CONFIG.interceptorCost} CR)`,
      () => this.interceptors++,
    );
  }

  private buyScan(): void {
    this.buySupplyItem(
      this.scansAvailable,
      GAME_CONFIG.maxScansPerWave,
      GAME_CONFIG.scanCost,
      `[СЕНСОРЫ] МАКСИМУМ СКАНОВ (${GAME_CONFIG.maxScansPerWave}/${GAME_CONFIG.maxScansPerWave})!`,
      '#38bdf8',
      `[СНАБЖЕНИЕ] +1 СКАН (-${GAME_CONFIG.scanCost} CR)`,
      () => this.scansAvailable++,
    );
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

    this.stats.totalDecisions++;

    if (choice === correctCategory) {
      this.stats.correctDecisions++;
      const isThreat = target.type === 'missile' || target.type === 'bomber';
      const distToBase = this.getDistToBase(target.x, target.y);
      const distFactor = isThreat
        ? 1 + (distToBase / GAME_CONFIG.radarRadius) * GAME_CONFIG.distanceBonusMax
        : 1.0;

      const isDecoy = target.type === 'decoy';
      const basePoints = isDecoy
        ? GAME_CONFIG.scorePerDecoyIgnored
        : GAME_CONFIG.scorePerCorrect;
      const points = Math.round(basePoints * multiplier * distFactor);
      this.score += points;
      this.streak += 1;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;

      const isLongRange = isThreat && distToBase >= GAME_CONFIG.radarRadius * 0.7;
      const rangeTag = isLongRange ? ' [ДАЛЬНИЙ РУБЕЖ]' : '';

      if (target.type === 'missile') {
        this.stats.missilesShot++;
        this.credits += GAME_CONFIG.creditsPerMissile;
        feedback = `[ВЕРНО!] РАКЕТА СБИТА (+${points}, +${GAME_CONFIG.creditsPerMissile} CR)${rangeTag}`;
      } else if (target.type === 'bomber') {
        this.stats.bombersShot++;
        this.credits += GAME_CONFIG.creditsPerBomber;
        feedback = `[ВЕРНО!] БОМБАРДИРОВЩИК СБИТ (+${points}, +${GAME_CONFIG.creditsPerBomber} CR)${rangeTag}`;
      } else if (target.type === 'friend') {
        this.stats.friendsSaved++;
        feedback = `[ВЕРНО!] СОЮЗНИК ПРОПУЩЕН (+${points})`;
      } else {
        this.stats.decoysFiltered++;
        feedback =
          points > 0
            ? `[ВЕРНО!] ЛОЖНАЯ ЦЕЛЬ ОТФИЛЬТРОВАНА (+${points})`
            : `[ВЕРНО!] ЛОЖНАЯ ЦЕЛЬ ОТФИЛЬТРОВАНА (СЕРИЯ +1)`;
      }
    } else {
      this.streak = 0;
      feedbackColor = '#f87171';

      if (target.type === 'friend' && choice === 'threat') {
        this.stats.friendlyFireCount++;
        this.waveHadFlaws = true;
        this.score = Math.max(0, this.score - GAME_CONFIG.friendlyFirePenalty);
        this.credits = Math.max(0, this.credits - GAME_CONFIG.creditsFriendlyFirePenalty);
        feedback = `[ОШИБКА!] СБИТ СВОЙ БОРТ! (-${GAME_CONFIG.friendlyFirePenalty} очк, -${GAME_CONFIG.creditsFriendlyFirePenalty} CR)`;
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
    this.removeTarget(target);
  }

  private showFeedback(text: string, color: string): void {
    this.hud.showFeedback(text, color);
  }

  private updateScoreBoard(): void {
    this.hud.updateScoreBoard({
      score: this.score,
      credits: this.credits,
      streak: this.streak,
      wave: this.wave,
      highScore: this.highScore,
      interceptors: this.interceptors,
      scansAvailable: this.scansAvailable,
    });
  }

  private updateTargetSelectionUI(): void {
    this.hud.updateTargetSelectionUI({
      selectedTarget: this.selectedTarget,
      interceptors: this.interceptors,
      scansAvailable: this.scansAvailable,
      isScanning: this.isScanning,
    });
  }

  private updateTelemetry(): void {
    this.hud.updateTelemetry({
      selectedTarget: this.selectedTarget,
      isScanning: this.isScanning,
      scanningTarget: this.scanningTarget,
      scanProgress: this.scanProgress,
    });
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

      const distToBase = this.getDistToBase(target.x, target.y);

      // Цель проникла на базу
      if (distToBase < 18) {
        if (target.type === 'missile') {
          this.stats.threatsMissed++;
          this.waveHadFlaws = true;
          this.baseHealth = Math.max(0, this.baseHealth - GAME_CONFIG.damageMissile);
          this.showFeedback(
            `[УДАР!] ПРОПУЩЕНА РАКЕТА! (-${GAME_CONFIG.damageMissile} HP)`,
            '#ef4444',
          );
          this.baseFlashTimer = 0.6;
        } else if (target.type === 'bomber') {
          if (target.hasBombedBase) {
            continue;
          }
          target.hasBombedBase = true;
          this.stats.threatsMissed++;
          this.waveHadFlaws = true;
          this.baseHealth = Math.max(0, this.baseHealth - GAME_CONFIG.damageBomber);
          this.showFeedback(
            `[УДАР!] БОМБАРДИРОВКА БАЗЫ! (-${GAME_CONFIG.damageBomber} HP)`,
            '#ef4444',
          );
          this.baseFlashTimer = 0.6;
          this.drawHealthBar();

          // Бомбардировщик сбросил бомбы и уходит по прямой за пределы зоны
          target.targetHeadingRad = target.headingRad;
          target.turnRate = 0;
          target.vx = Math.cos(target.headingRad) * target.speed;
          target.vy = Math.sin(target.headingRad) * target.speed;

          if (this.baseHealth <= 0 && !this.isGameOver) {
            this.triggerGameOver();
            return;
          }
          continue;
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
        this.removeTarget(target);

        if (this.baseHealth <= 0 && !this.isGameOver) {
          this.triggerGameOver();
          return;
        }
      } else if (distToBase > GAME_CONFIG.radarRadius * 1.05) {
        this.removeTarget(target);
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

      const waveCredits =
        GAME_CONFIG.creditsWaveBase +
        (this.wave - 1) * GAME_CONFIG.creditsWavePerLevel;
      this.credits += waveCredits;

      let cleanBonusText = '';
      if (!this.waveHadFlaws) {
        this.score += GAME_CONFIG.cleanWaveBonus;
        cleanBonusText = `\nЧИСТАЯ ВОЛНА! (+${GAME_CONFIG.cleanWaveBonus} ОЧК)`;
      }
      this.waveHadFlaws = false;

      this.updateScoreBoard();
      this.showWaveBanner(
        `ВОЛНА ${this.wave}\nСНАБЖЕНИЕ: +${addedAmmo} РАКЕТЫ, +${waveCredits} CR, СКАНЫ 3/3${cleanBonusText}`,
      );
    }
  }
}


