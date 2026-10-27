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
} from './ui';
import { setupGameInputs } from './input';
import { createRadarRender, type RadarRender } from './radarRender';
import { createSpawner, type TargetSpawner } from './spawner';
import { createScoreTracker, type ScoreTracker } from './scoring';
import { createArmory, type ArmoryTracker } from './armory';
import { createStatsTracker, type StatsTracker } from './stats';
import {
  getDistToBase,
  findTargetNear,
  updateTargetMotion,
  disengageTarget,
} from './targetSimulation';


export class GameScene extends Phaser.Scene {
  private static hasSeenBriefing = false;

  private radarRender!: RadarRender;
  private hud!: HudManager;
  private gameOverOverlay!: GameOverOverlay;
  private pauseOverlay!: PauseOverlay;
  private briefingOverlay!: BriefingOverlay;
  private spawner: TargetSpawner = createSpawner();
  private scoring: ScoreTracker = createScoreTracker();
  private armory: ArmoryTracker = createArmory();
  private stats: StatsTracker = createStatsTracker();
  private isPaused = false;
  private isGameStarted = false;

  private targets: GameTarget[] = [];
  private selectedTarget: GameTarget | null = null;
  private explosions: ExplosionEffect[] = [];

  // Состояние игры
  private baseHealth = GAME_CONFIG.maxBaseHealth;
  private wave = 1;
  private waveTargetsToSpawn = 7;
  private waveHadFlaws = false;
  private isGameOver = false;
  private highScore = 0;

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
    this.scoring.reset();
    this.armory.reset();
    this.stats.reset();
    this.wave = 1;
    this.waveTargetsToSpawn = 7;
    this.waveHadFlaws = false;
    this.targets = [];
    this.selectedTarget = null;
    this.explosions = [];

    // Загрузка рекорда из localStorage
    const savedRecord = localStorage.getItem('radar_station_record');
    this.highScore = savedRecord ? parseInt(savedRecord, 10) || 0 : 0;

    // 1. Рендер экрана радара (статическая сетка, луч и динамические слои)
    this.radarRender = createRadarRender(this);
    this.radarRender.reset();

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
        this.selectedTarget = findTargetNear(this.targets, x, y);
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
      this.radarRender.updateBeam(dt * 0.5);
      this.radarRender.renderDynamic({
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

    this.stats.updateTime(dt);

    this.radarRender.updateBeam(dt, this.targets);
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
      baseFlashTimer: this.baseFlashTimer,
      targets: this.targets,
      selectedTarget: this.selectedTarget,
      isScanning: this.armory.isScanning,
      scanningTarget: this.armory.scanningTarget,
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
    this.armory.cancelScan();
    this.updateTargetSelectionUI();

    let isNewRecord = false;
    if (this.scoring.score > this.highScore) {
      this.highScore = this.scoring.score;
      localStorage.setItem('radar_station_record', this.highScore.toString());
      isNewRecord = true;
    }

    this.gameOverOverlay.show(
      this.scoring.score,
      this.highScore,
      this.wave,
      this.scoring.bestStreak,
      isNewRecord,
      this.stats.snapshot,
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
    this.armory.cancelScanIfTarget(target);
    this.checkWaveProgress();
  }

  /**
   * Запуск глубокого сканирования сигнатуры цели (1.5 сек)
   */
  private startScanning(): void {
    if (!this.selectedTarget || this.isGameOver || this.armory.isScanning) return;
    const res = this.armory.startScan(this.selectedTarget);
    this.showFeedback(res.message, res.color);
    if (res.success) {
      this.updateScoreBoard();
      this.updateTargetSelectionUI();
    }
  }

  private buyInterceptor(): void {
    if (this.isGameOver || this.isPaused) return;
    const res = this.armory.buyInterceptor();
    this.showFeedback(res.message, res.color);
    if (res.success) {
      this.updateScoreBoard();
      this.updateTargetSelectionUI();
    }
  }

  private buyScan(): void {
    if (this.isGameOver || this.isPaused) return;
    const res = this.armory.buyScan();
    this.showFeedback(res.message, res.color);
    if (res.success) {
      this.updateScoreBoard();
      this.updateTargetSelectionUI();
    }
  }

  /**
   * Обновление таймера сканирования (время в игре идёт непрерывно)
   */
  private updateScanning(dt: number): void {
    const res = this.armory.updateScanning(dt, this.targets);
    if (!res) return;
    if (res.completed && res.message && res.color) {
      this.showFeedback(res.message, res.color);
    }
    this.updateTargetSelectionUI();
  }

  /**
   * Обработка решения игрока
   */
  private resolveDecision(choice: DecisionChoice): void {
    if (!this.selectedTarget || this.isGameOver) return;
    const target = this.selectedTarget;

    // 1. Пометка цели (Свой / Помеха) без немедленного удаления с карты
    if (choice === 'friend' || choice === 'ignore') {
      target.markedAs = choice;
      if (choice === 'friend') {
        this.showFeedback('[МЕТКА] ЦЕЛЬ ПРИНЯТА КАК СОЮЗНИК', '#4ade80');
      } else {
        this.showFeedback('[МЕТКА] ЦЕЛЬ ОТМЕЧЕНА КАК ПОМЕХА', '#94a3b8');
      }
      this.updateTelemetry();
      this.updateTargetSelectionUI();
      return;
    }

    // 2. Боевой перехват (Угроза) — немедленный пуск ракеты
    if (!this.armory.consumeInterceptor()) {
      this.showFeedback('[ОТКАЗ!] БОЕКОМПЛЕКТ ПУСТ! ОЖИДАЙТЕ СНАБЖЕНИЯ', '#ef4444');
      return;
    }

    // Эффект взрыва: для техники - с ударной волной, для ловушки - только вспышка
    const hasShockwave = target.type !== 'decoy';
    this.explosions.push(createExplosion(target.x, target.y, hasShockwave));

    if (target.type === 'missile' || target.type === 'bomber') {
      const distToBase = getDistToBase(target.x, target.y);
      const { points, isLongRange } = this.scoring.addThreatScore(
        distToBase,
        GAME_CONFIG.radarRadius,
      );
      const rangeTag = isLongRange ? ' [ДАЛЬНИЙ РУБЕЖ]' : '';

      if (target.type === 'missile') {
        this.stats.recordMissileIntercept();
        this.armory.addCredits(GAME_CONFIG.creditsPerMissile);
        this.showFeedback(
          `[ВЕРНО!] РАКЕТА СБИТА (+${points}, +${GAME_CONFIG.creditsPerMissile} CR)${rangeTag}`,
          '#4ade80',
        );
      } else {
        this.stats.recordBomberIntercept();
        this.armory.addCredits(GAME_CONFIG.creditsPerBomber);
        this.showFeedback(
          `[ВЕРНО!] БОМБАРДИРОВЩИК СБИТ (+${points}, +${GAME_CONFIG.creditsPerBomber} CR)${rangeTag}`,
          '#4ade80',
        );
      }
    } else if (target.type === 'friend') {
      // Огонь по своим
      this.stats.recordFriendlyFire();
      this.waveHadFlaws = true;
      const penalty = this.scoring.applyFriendlyFirePenalty();
      this.armory.deductCredits(GAME_CONFIG.creditsFriendlyFirePenalty);
      this.showFeedback(
        `[ОШИБКА!] СБИТ СВОЙ БОРТ! (-${penalty} очк, -${GAME_CONFIG.creditsFriendlyFirePenalty} CR)`,
        '#f87171',
      );
    } else {
      // Ловушка
      this.stats.recordDecoyIntercept();
      this.scoring.resetStreak();
      this.showFeedback(
        `[ПРОМАХ!] ПЕРЕХВАТЧИК ВПУСТУЮ НА ЛОВУШКУ! (Ост: ${this.armory.interceptors})`,
        '#fbbf24',
      );
    }

    this.updateScoreBoard();
    this.removeTarget(target);
  }

  /**
   * Обработка завершения маршрута союзного судна (посадка или транзитный пролёт)
   */
  private handleFriendCompletion(target: GameTarget, isLanding: boolean): void {
    if (target.markedAs === 'friend') {
      this.stats.recordFriendSaved();
      const points = this.scoring.addFriendlyScore();

      const action = isLanding ? 'БЕЗОПАСНО СЕЛ НА БАЗУ' : 'БЕЗОПАСНО ПОКИНУЛ СЕКТОР';
      const tag = isLanding ? '[ПОСАДКА]' : '[ТРАНЗИТ]';
      this.showFeedback(`${tag} СОЮЗНИК ${action} (+${points}, СЕРИЯ +1)`, '#86efac');
    } else {
      this.stats.recordFriendMissed();
      this.scoring.resetStreak();
      this.waveHadFlaws = true;
      const penalty = GAME_CONFIG.unidentifiedFriendPenalty;
      this.armory.deductCredits(penalty);

      const cause = target.markedAs === 'ignore' ? 'ПРИНЯТ ЗА ПОМЕХУ' : 'ПРОПУЩЕН БЕЗ ОПОЗНАНИЯ';
      this.showFeedback(`[ОШИБКА!] СОЮЗНИК ${cause} (-${penalty} CR, СЕРИЯ СБРОШЕНА)`, '#f87171');
    }

    this.updateScoreBoard();
  }

  /**
   * Обработка завершения пути ложной цели (выход из сектора или рассеивание)
   */
  private handleDecoyCompletion(target: GameTarget, isDissipated = false): void {
    if (target.markedAs === 'ignore') {
      this.stats.recordDecoyFiltered();
      this.scoring.addDecoySuccess();
      const reason = isDissipated ? 'СИГНАЛ РАССЕЯЛСЯ' : 'ПОКИНУЛА СЕКТОР';
      this.showFeedback(`[ФИЛЬТР] ЛОЖНАЯ ЦЕЛЬ (${reason}) (СЕРИЯ +1)`, '#94a3b8');
    } else if (target.markedAs === 'friend') {
      this.stats.recordDecoyMistake();
      this.scoring.resetStreak();
      this.waveHadFlaws = true;
      this.showFeedback(`[ОШИБКА!] ЛОЖНАЯ ЦЕЛЬ БЫЛА ПРИНЯТА ЗА СОЮЗНИКА!`, '#f87171');
    } else if (isDissipated) {
      this.showFeedback(`[БАЗА] ЛОЖНЫЙ СИГНАЛ РАССЕЯЛСЯ (0 УРОНА)`, '#64748b');
    }

    this.updateScoreBoard();
  }

  private showFeedback(text: string, color: string): void {
    this.hud.showFeedback(text, color);
  }

  private updateScoreBoard(): void {
    this.hud.updateScoreBoard({
      score: this.scoring.score,
      credits: this.armory.credits,
      streak: this.scoring.streak,
      wave: this.wave,
      highScore: this.highScore,
      interceptors: this.armory.interceptors,
      scansAvailable: this.armory.scansAvailable,
    });
  }

  private updateTargetSelectionUI(): void {
    this.hud.updateTargetSelectionUI({
      selectedTarget: this.selectedTarget,
      interceptors: this.armory.interceptors,
      scansAvailable: this.armory.scansAvailable,
      isScanning: this.armory.isScanning,
    });
  }

  private updateTelemetry(): void {
    this.hud.updateTelemetry({
      selectedTarget: this.selectedTarget,
      isScanning: this.armory.isScanning,
      scanningTarget: this.armory.scanningTarget,
      scanProgress: this.armory.scanProgress,
    });
  }

  /**
   * Движение целей и проверка достижения базы
   */
  private updateTargets(dt: number): void {
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i];
      updateTargetMotion(target, dt);

      const distToBase = getDistToBase(target.x, target.y);

      // Цель проникла на базу
      if (distToBase < 18) {
        if (target.type === 'missile') {
          this.stats.recordThreatMissed();
          this.waveHadFlaws = true;
          this.scoring.resetStreak();
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
          this.stats.recordThreatMissed();
          this.waveHadFlaws = true;
          this.scoring.resetStreak();
          this.baseHealth = Math.max(0, this.baseHealth - GAME_CONFIG.damageBomber);
          this.showFeedback(
            `[УДАР!] БОМБАРДИРОВКА БАЗЫ! (-${GAME_CONFIG.damageBomber} HP)`,
            '#ef4444',
          );
          this.baseFlashTimer = 0.6;
          this.drawHealthBar();

          // Бомбардировщик сбросил бомбы и уходит по прямой за пределы зоны
          disengageTarget(target);

          if (this.baseHealth <= 0 && !this.isGameOver) {
            this.triggerGameOver();
            return;
          }
          continue;
        } else if (target.type === 'friend') {
          this.handleFriendCompletion(target, true);
        } else if (target.type === 'decoy') {
          if (target.decoyPassesThroughBase && !target.hasPassedBase) {
            target.hasPassedBase = true;
            this.showFeedback(`[БАЗА] ЛОЖНАЯ ЦЕЛЬ ПРОШЛА НАВЫЛЕТ (0 УРОНА)`, '#64748b');
            continue;
          } else if (target.hasPassedBase) {
            continue;
          } else {
            this.handleDecoyCompletion(target, true);
          }
        }

        this.drawHealthBar();
        this.removeTarget(target);

        if (this.baseHealth <= 0 && !this.isGameOver) {
          this.triggerGameOver();
          return;
        }
      } else if (distToBase > GAME_CONFIG.radarRadius * 1.05) {
        if (target.type === 'friend') {
          this.handleFriendCompletion(target, false);
        } else if (target.type === 'decoy') {
          this.handleDecoyCompletion(target, false);
        }
        this.removeTarget(target);
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
      this.radarRender.setWaveSpeed(this.wave);

      // Пополнение боекомплекта перехватчиков, зарядов сканирования и начисление кредитов за волну
      const { addedAmmo, waveCredits } = this.armory.refillForWave(this.wave);

      let cleanBonusText = '';
      if (!this.waveHadFlaws) {
        const bonus = this.scoring.applyCleanWaveBonus();
        cleanBonusText = `\nЧИСТАЯ ВОЛНА! (+${bonus} ОЧК)`;
      }
      this.waveHadFlaws = false;

      this.updateScoreBoard();
      this.showWaveBanner(
        `ВОЛНА ${this.wave}\nСНАБЖЕНИЕ: +${addedAmmo} РАКЕТЫ, +${waveCredits} CR, СКАНЫ 3/3${cleanBonusText}`,
      );
    }
  }
}


