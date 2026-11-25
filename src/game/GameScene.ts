import Phaser from 'phaser';
import {
  GAME_CONFIG,
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
  TELEMETRY_HINT_CONFIG,
  type GameOverOverlay,
  type PauseOverlay,
  type BriefingOverlay,
  type HudManager,
} from './ui';
import { createAlertManager, type AlertManager } from './alerts';
import { createMainMenu, type MainMenuManager } from './mainMenu';
import { setupGameInputs } from './input';
import { createRadarRender, type OnboardingStage, type RadarRender } from './radarRender';
import { createSpawner, type TargetSpawner } from './spawner';
import {
  createTacticalEventsManager,
  type TacticalEventManager,
  EVENT_CONFIG,
} from './events';
import { createScoreTracker, type ScoreTracker } from './scoring';
import { createArmory, type ArmoryTracker } from './armory';
import { createStatsTracker, type StatsTracker } from './stats';
import { createSoundSystem, type SoundSystem } from './audio';
import { AmbientBackground } from './background';
import {
  createInterceptorManager,
  type InterceptorManager,
  getDistToBase,
  findTargetNear,
  updateTargetsSimulation,
  type TargetSimulationEvent,
  createSweeperDroneManager,
  type SweeperDroneManager,
  createDogfightRescueManager,
  type DogfightRescueManager,
  createBarrageSalvoManager,
  type BarrageSalvoManager,
  BARRAGE_CONFIG,
  createJammerAircraftManager,
  type JammerAircraftManager,
  JAMMER_CONFIG,
  createTerrainHuggerManager,
  type TerrainHuggerManager,
  TERRAIN_HUGGER_CONFIG,
  createWeatherFrontManager,
  type WeatherFrontManager,
  WEATHER_FRONT_CONFIG,
} from './units';


export class GameScene extends Phaser.Scene {
  private static hasSeenBriefing = true; /* !!! ВРЕМЕННО TRUE !!! НЕ ТРОГАТЬ!!! */

  private ambientBg!: AmbientBackground;
  private radarRender!: RadarRender;
  private hud!: HudManager;
  private alerts!: AlertManager;
  private gameOverOverlay!: GameOverOverlay;
  private pauseOverlay!: PauseOverlay;
  private briefingOverlay!: BriefingOverlay;
  private mainMenu!: MainMenuManager;
  private spawner: TargetSpawner = createSpawner();
  private tacticalEvents: TacticalEventManager = createTacticalEventsManager(this.spawner);
  private scoring: ScoreTracker = createScoreTracker();
  private armory: ArmoryTracker = createArmory();
  private stats: StatsTracker = createStatsTracker();
  private soundSystem: SoundSystem = createSoundSystem();
  private isPaused = false;
  private isGameStarted = false;

  private targets: GameTarget[] = [];
  private selectedTarget: GameTarget | null = null;
  private explosions: ExplosionEffect[] = [];
  private interceptorManager: InterceptorManager = createInterceptorManager();
  private sweeperDrone: SweeperDroneManager = createSweeperDroneManager();
  private dogfightRescue: DogfightRescueManager = createDogfightRescueManager();
  private barrageSalvo: BarrageSalvoManager = createBarrageSalvoManager();
  private jammerAircraft: JammerAircraftManager = createJammerAircraftManager();
  private terrainHugger: TerrainHuggerManager = createTerrainHuggerManager();
  private weatherFront: WeatherFrontManager = createWeatherFrontManager();

  // Тайминги и контроль частоты заградительного налёта
  private barrageTimer = 0;
  private nextBarrageDelay = -1;
  private hadBarrageLastWave = false;

  // Тайминги и контроль появления самолёта РЭБ помех
  private jammerTimer = 0;
  private nextJammerDelay = -1;
  private hadJammerLastWave = false;

  // Тайминги и контроль появления штурмовика ПМВ «Стриж»
  private terrainHuggerTimer = 0;
  private nextTerrainHuggerDelay = -1;
  private hadTerrainHuggerLastWave = false;

  // Тайминги и контроль прохождения ионизационного грозового фронта
  private weatherFrontTimer = 0;
  private nextWeatherFrontDelay = -1;
  private hadWeatherFrontLastWave = false;

  // Состояние игры
  private baseHealth = GAME_CONFIG.maxBaseHealth;
  private wave = 1;
  private waveTargetsToSpawn = GAME_CONFIG.waveTargetsBase;
  private waveHadFlaws = false;
  private isSpecialWaveCurrent = false;
  private isGameOver = false;
  private highScore = 0;
  private hasSelectedAnyTarget = false;
  private hasCompletedFirstAction = false;

  // Таймеры эффектов
  private baseFlashTimer = 0;

  constructor() {
    super('GameScene');
  }

  create(data?: { autoStartCombat?: boolean }): void {
    this.isGameOver = false;
    this.isPaused = false;
    this.isGameStarted = false;
    this.hasSelectedAnyTarget = false;
    this.hasCompletedFirstAction = false;
    this.baseHealth = GAME_CONFIG.maxBaseHealth;
    this.scoring.reset();
    this.armory.reset();
    this.stats.reset();
    this.tacticalEvents.reset();
    this.wave = 1;
    this.waveTargetsToSpawn = GAME_CONFIG.waveTargetsBase;
    this.waveHadFlaws = false;
    this.isSpecialWaveCurrent = false;
    const waveInit = this.tacticalEvents.startWave(this.wave, this.waveTargetsToSpawn);
    this.isSpecialWaveCurrent = waveInit.isSpecialWave;
    if (waveInit.isSpecialWave && waveInit.specialWaveTargetsCount) {
      this.waveTargetsToSpawn = waveInit.specialWaveTargetsCount;
    }
    if (waveInit.creditsGrant && waveInit.creditsGrant > 0) {
      this.armory.addCredits(waveInit.creditsGrant);
    }
    this.targets = [];
    this.sweeperDrone.reset();
    this.dogfightRescue.reset();
    this.barrageSalvo.reset();
    this.barrageTimer = 0;
    this.nextBarrageDelay = -1;
    this.hadBarrageLastWave = false;
    this.jammerAircraft.reset();
    this.jammerTimer = 0;
    this.nextJammerDelay = -1;
    this.hadJammerLastWave = false;
    this.terrainHugger.reset();
    this.terrainHuggerTimer = 0;
    this.nextTerrainHuggerDelay = -1;
    this.hadTerrainHuggerLastWave = false;
    this.weatherFront.reset();
    this.weatherFrontTimer = 0;
    this.nextWeatherFrontDelay = -1;
    this.hadWeatherFrontLastWave = false;
    this.selectedTarget = null;
    this.explosions = [];
    this.interceptorManager.reset();

    // Загрузка рекорда из localStorage
    const savedRecord = localStorage.getItem('radar_station_record');
    this.highScore = savedRecord ? parseInt(savedRecord, 10) || 0 : 0;

    // 0. Амбиентный фон и корпус консоли
    this.ambientBg = new AmbientBackground(this);

    // 1. Рендер экрана радара (статическая сетка, луч и динамические слои)
    this.radarRender = createRadarRender(this, {
      onTargetSwept: () => this.soundSystem.playRadarPing(),
    });
    this.radarRender.reset();

    // Разблокировка Web Audio по первому клику или клавише (требование браузеров)
    this.input.once('pointerdown', () => this.soundSystem.resume());
    this.input.keyboard?.once('keydown', () => this.soundSystem.resume());

    // 3. Панель консоли оператора и система оперативных оповещений
    this.hud = createHud(this, {
      onDecision: (choice) => this.resolveDecision(choice),
      onScan: () => this.startScanning(),
      onBuyMissile: () => this.buyInterceptor(),
      onBuyScan: () => this.buyScan(),
      onTogglePause: () => this.togglePause(),
    });
    this.alerts = createAlertManager(this);
    this.pauseOverlay = createPauseOverlay(this, {
      onResume: () => this.togglePause(),
      onOpenBriefing: () => this.openBriefing(),
      onRestart: () => this.restartGame(),
    });
    this.briefingOverlay = createBriefingOverlay(this, () => this.handleBriefingClose());
    this.gameOverOverlay = createGameOverOverlay(this, () => this.restartGame());

    // 4. Главное меню с аутентичным 2.5D радаром и светосигнальными табло-клавишами (Вариант А)
    this.mainMenu = createMainMenu(this, {
      onStartCombat: () => {
        this.ambientBg.setVisible(true);
        this.radarRender.setVisible(true);
        this.hud.slideIn(450);
        this.startCombat();
      },
      onOpenBriefing: () => this.openBriefing(),
      onToggleSound: () => this.soundSystem.toggleMute(),
      isMuted: () => this.soundSystem.isMuted,
      getHighScore: () => this.highScore,
      playHoverSound: () => this.soundSystem.playMenuHover(),
      playSelectSound: () => this.soundSystem.playMenuSelect(),
      playDegauss: () => this.soundSystem.playDegauss(),
      isBriefingOpen: () => this.briefingOverlay.isVisible(),
    });

    setupGameInputs(this, {
      onSelectRadarTarget: (x, y) => {
        // Проверка клика по штурмовику ПМВ в тени рельефа
        if (
          this.terrainHugger.isActive &&
          this.terrainHugger.isSubmerged &&
          !this.terrainHugger.isPermanentlyRevealed
        ) {
          const hugger = this.terrainHugger.activeTarget;
          if (
            hugger &&
            Math.hypot(hugger.x - x, hugger.y - y) < GAME_CONFIG.selectionHitRadius * 1.6
          ) {
            this.soundSystem.playDenyClick();
            this.showFeedback(
              '[ОТКАЗ] НЕТ ПРЯМОГО КОНТАКТА! ЦЕЛЬ В ТЕНИ РЕЛЬЕФА',
              GAME_CONFIG.colors.text.warning,
            );
            return;
          }
        }

        const found = findTargetNear(this.targets, x, y);
        if (found && this.jammerAircraft.isTargetJammed(found)) {
          this.soundSystem.playDenyClick();
          this.showFeedback(
            '[ОТКАЗ] СИГНАЛ ПОДАВЛЕН РЭБ! ЗАХВАТ ЦЕЛИ НЕВОЗМОЖЕН',
            GAME_CONFIG.colors.text.warning,
          );
          return;
        }
        this.selectedTarget = found;
        if (found && !this.hasSelectedAnyTarget) {
          this.hasSelectedAnyTarget = true;
        }
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
      isGameStarted: () => this.isGameStarted,
    });

    if (data?.autoStartCombat) {
      this.ambientBg.setVisible(true);
      this.radarRender.setVisible(true);
      this.hud.setVisible(true);
      this.mainMenu.hide(undefined, true);
      this.startCombat();
    } else {
      this.isGameStarted = false;
      this.ambientBg.setVisible(false);
      this.radarRender.setVisible(false);
      this.hud.setVisible(false);
      this.mainMenu.show();
      this.updateScoreBoard();
      this.drawHealthBar();
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);

    if (!this.isGameStarted) {
      if (this.mainMenu && this.mainMenu.isVisible()) {
        this.mainMenu.update(dt);
      }
      return;
    }

    if (this.isGameOver || this.isPaused) return;

    this.stats.updateTime(dt);

    // 1. Физика целей и спавн новых бортов до расчёта луча радара
    this.updateTargets(dt);

    // Обработка динамических тактических событий (массированные залпы)
    const eventResult = this.tacticalEvents.update(dt, {
      wave: this.wave,
      activeTargetsCount: this.targets.length,
      targetsLeftInWave: this.waveTargetsToSpawn,
      activeTargets: this.targets,
    });
    if (eventResult.playAlarmSound) {
      this.soundSystem.playSalvoAlert();
    }
    for (const target of eventResult.spawnedTargets) {
      this.targets.push(target);
      this.waveTargetsToSpawn = Math.max(0, this.waveTargetsToSpawn - 1);
    }

    if (!this.tacticalEvents.isSpecialWaveActive()) {
      const newTarget = this.spawner.update(
        dt,
        this.wave,
        this.targets.length,
        this.waveTargetsToSpawn,
        this.radarRender.beamAngle,
      );
      if (newTarget) {
        this.targets.push(newTarget);
        this.waveTargetsToSpawn--;
      }
    }

    // 2. Движение луча радара и детекция (включая свежезаспавненные цели текущего кадра)
    this.ambientBg.update(dt);
    this.ambientBg.render(this.radarRender.beamAngle);
    this.radarRender.updateBeam(dt, this.targets);
    this.updateScanning(dt);
    this.interceptorManager.update(dt);
    this.checkSectorEndgameSweep();
    this.sweeperDrone.update(
      dt,
      (target) => this.handleSweeperDroneKill(target),
      () => this.checkWaveProgress(),
      (pan) => this.soundSystem.playDroneBurst(pan),
    );
    this.dogfightRescue.update(
      dt,
      (x, y) => {
        const pan = (x - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius;
        this.soundSystem.playExplosion('decoy', pan);
        this.explosions.push(createExplosion(x, y, false));
      },
      (ally) => this.handleDogfightCompleted(ally),
      (pan) => this.soundSystem.playDroneBurst(pan),
    );

    // Заградительный ракетный налёт (ADHD-крючок визуального хаоса и осветительных ракет)
    if (!this.barrageSalvo.isActive && this.nextBarrageDelay > 0) {
      this.barrageTimer += dt;
      if (this.barrageTimer >= this.nextBarrageDelay) {
        this.nextBarrageDelay = -1; // строго один залп на волну максимум
        this.barrageSalvo.trigger();
      }
    }

    this.barrageSalvo.update(
      dt,
      (pan) => this.soundSystem.playAirburst(pan),
      () => this.soundSystem.playSectorWarningPing(),
      () => this.soundSystem.playBarrageRocketLaunch(),
      () => this.soundSystem.playFlareSizzle(),
    );

    // Самолёт РЭБ постановщик помех («Шумовой Строб»)
    if (!this.jammerAircraft.isActive && this.nextJammerDelay > 0) {
      this.jammerTimer += dt;
      if (this.jammerTimer >= this.nextJammerDelay) {
        this.nextJammerDelay = -1; // строго один самолёт РЭБ на волну максимум
        const jammerTarget = this.jammerAircraft.spawn(this.wave);
        this.targets.push(jammerTarget);
        this.soundSystem.playSectorWarningPing();
        this.hud.showNotification(
          '[ ВНИМАНИЕ: В СЕКТОРЕ ОБНАРУЖЕН САМОЛЁТ РЭБ ПРОТИВНИКА! ]',
          4.5,
        );
      }
    }

    this.jammerAircraft.update(dt);

    // Низковысотный штурмовик ПМВ «Стриж» (огибание рельефа и слепая экстраполяция)
    if (!this.terrainHugger.isActive && this.nextTerrainHuggerDelay > 0) {
      this.terrainHuggerTimer += dt;
      if (this.terrainHuggerTimer >= this.nextTerrainHuggerDelay) {
        this.nextTerrainHuggerDelay = -1; // строго один штурмовик на волну максимум
        const thTarget = this.terrainHugger.spawn(this.wave);
        this.targets.push(thTarget);
      }
    }

    this.terrainHugger.update(dt, () => this.soundSystem.playTerrainHuggerPopUp());

    // Ионизационный грозовой фронт (метеопомехи, молнии и вторичное эхо)
    if (!this.weatherFront.isActive && this.nextWeatherFrontDelay > 0) {
      this.weatherFrontTimer += dt;
      if (this.weatherFrontTimer >= this.nextWeatherFrontDelay) {
        this.nextWeatherFrontDelay = -1; // строго один фронт на волну максимум
        this.weatherFront.trigger();
        this.soundSystem.playSectorWarningPing();
        this.hud.showNotification(
          '[ МЕТЕОСЛУЖБА: В СЕКТОРЕ ОБНАРУЖЕН ИОНИЗАЦИОННЫЙ ГРОЗОВОЙ ФРОНТ! ]',
          5.0,
        );
      }
    }

    this.weatherFront.update(dt, this.radarRender.beamAngle, (pan) => {
      this.soundSystem.playThunderClap(pan);
    });

    const onboardingStage: OnboardingStage = !this.hasSelectedAnyTarget
      ? 'acquire'
      : 'none';

    updateExplosions(this.explosions, dt);
    this.radarRender.renderDynamic({
      baseFlashTimer: this.baseFlashTimer,
      targets: this.targets,
      selectedTarget: this.selectedTarget,
      isScanning: this.armory.isScanning,
      scanningTarget: this.armory.scanningTarget,
      timeNow: this.time.now,
      interceptors: this.interceptorManager.activeUnits,
      sweeperDrone: this.sweeperDrone,
      dogfightRescue: this.dogfightRescue,
      barrageSalvo: this.barrageSalvo,
      jammerAircraft: this.jammerAircraft,
      terrainHugger: this.terrainHugger,
      weatherFront: this.weatherFront,
      explosions: this.explosions,
      warningArc: eventResult.warningArc,
      onboardingStage,
    });
    this.hud.updateFeedback(dt);
    this.updateTelemetry();
    this.hud.updateWaveBanner(dt);
    this.hud.updateNotification(dt);
    this.alerts.update(dt);

    if (this.baseFlashTimer > 0) {
      this.baseFlashTimer -= dt;
    }
  }

  /**
   * Назначение заградительного налёта на волну (редкий ивент с обязательным отдыхом)
   */
  private scheduleBarrageForWave(): void {
    this.barrageSalvo.reset();
    this.barrageTimer = 0;

    // В особой волне любые побочные события и спец-юниты строго отключены
    if (this.isSpecialWaveCurrent) {
      this.nextBarrageDelay = -1;
      return;
    }

    // Волна 1: отключен (обучение). Волна 2+: шанс 35%, если в прошлой волне налёта не было
    const canTrigger = this.wave >= BARRAGE_CONFIG.minWave && !this.hadBarrageLastWave;
    const willTrigger = canTrigger && Math.random() < BARRAGE_CONFIG.waveChance;

    if (willTrigger) {
      this.nextBarrageDelay = Phaser.Math.FloatBetween(BARRAGE_CONFIG.delayMin, BARRAGE_CONFIG.delayMax);
      this.hadBarrageLastWave = true;
    } else {
      this.nextBarrageDelay = -1;
      this.hadBarrageLastWave = false;
    }
  }

  /**
   * Назначение вылета самолёта РЭБ на волну (орбитальный постановщик помех)
   */
  private scheduleJammerForWave(): void {
    this.jammerAircraft.reset();
    this.jammerTimer = 0;

    // В особой волне любые побочные события и спец-юниты строго отключены
    if (this.isSpecialWaveCurrent) {
      this.nextJammerDelay = -1;
      return;
    }

    // Волна 3+: шанс 28%, если в прошлой волне РЭБ не было
    const canTrigger = this.wave >= JAMMER_CONFIG.minWave && !this.hadJammerLastWave;
    const willTrigger = canTrigger && Math.random() < JAMMER_CONFIG.waveChance;

    if (willTrigger) {
      this.nextJammerDelay = Phaser.Math.FloatBetween(
        JAMMER_CONFIG.delayMin,
        JAMMER_CONFIG.delayMax,
      );
      this.hadJammerLastWave = true;
    } else {
      this.nextJammerDelay = -1;
      this.hadJammerLastWave = false;
    }
  }

  /**
   * Назначение вылета штурмовика ПМВ «Стриж» на волну
   */
  private scheduleTerrainHuggerForWave(): void {
    this.terrainHugger.reset();
    this.terrainHuggerTimer = 0;

    // В особой волне любые побочные события и спец-юниты строго отключены
    if (this.isSpecialWaveCurrent) {
      this.nextTerrainHuggerDelay = -1;
      return;
    }

    // Волна 2+: шанс 30%, если в прошлой волне штурмовика не было
    const canTrigger = this.wave >= TERRAIN_HUGGER_CONFIG.minWave && !this.hadTerrainHuggerLastWave;
    const willTrigger = canTrigger && Math.random() < TERRAIN_HUGGER_CONFIG.waveChance;

    if (willTrigger) {
      this.nextTerrainHuggerDelay = Phaser.Math.FloatBetween(
        TERRAIN_HUGGER_CONFIG.delayMin,
        TERRAIN_HUGGER_CONFIG.delayMax,
      );
      this.hadTerrainHuggerLastWave = true;
    } else {
      this.nextTerrainHuggerDelay = -1;
      this.hadTerrainHuggerLastWave = false;
    }
  }

  /**
   * Назначение прохождения ионизационного грозового фронта на волну
   */
  private scheduleWeatherFrontForWave(): void {
    this.weatherFront.reset();
    this.weatherFrontTimer = 0;

    // В особой волне любые побочные события и спец-юниты строго отключены
    if (this.isSpecialWaveCurrent) {
      this.nextWeatherFrontDelay = -1;
      return;
    }

    // Волна 4+: шанс 35%, если в прошлой волне грозового фронта не было
    const canTrigger = this.wave >= WEATHER_FRONT_CONFIG.minWave && !this.hadWeatherFrontLastWave;
    const willTrigger = canTrigger && Math.random() < WEATHER_FRONT_CONFIG.waveChance;

    if (willTrigger) {
      this.nextWeatherFrontDelay = Phaser.Math.FloatBetween(
        WEATHER_FRONT_CONFIG.delayMin,
        WEATHER_FRONT_CONFIG.delayMax,
      );
      this.hadWeatherFrontLastWave = true;
    } else {
      this.nextWeatherFrontDelay = -1;
      this.hadWeatherFrontLastWave = false;
    }
  }

  /**
   * Запуск боевого дежурства (старт спавна и появление первых целей)
   */
  private startCombat(): void {
    this.isGameStarted = true;
    this.spawner.reset();
    const waveInit = this.tacticalEvents.startWave(this.wave, this.waveTargetsToSpawn);
    this.isSpecialWaveCurrent = waveInit.isSpecialWave;
    if (waveInit.isSpecialWave && waveInit.specialWaveTargetsCount) {
      this.waveTargetsToSpawn = waveInit.specialWaveTargetsCount;
    }
    if (waveInit.creditsGrant && waveInit.creditsGrant > 0) {
      this.armory.addCredits(waveInit.creditsGrant);
    }
    this.targets = [];
    this.sweeperDrone.reset();
    this.dogfightRescue.reset();
    this.hadBarrageLastWave = false;
    this.hadJammerLastWave = false;
    this.hadTerrainHuggerLastWave = false;
    this.hadWeatherFrontLastWave = false;
    this.scheduleBarrageForWave();
    this.scheduleJammerForWave();
    this.scheduleTerrainHuggerForWave();
    this.scheduleWeatherFrontForWave();
    this.soundSystem.playWaveTransition(false);
    this.showWaveBanner('ВОЛНА 1\nБОЕВОЕ ДЕЖУРСТВО');
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
    this.soundSystem.resume();
    this.briefingOverlay.hide();
    if (!this.isGameStarted) {
      if (this.mainMenu && this.mainMenu.isVisible()) {
        return;
      }
      GameScene.hasSeenBriefing = true;
      this.startCombat();
    } else {
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
    this.barrageSalvo.reset();
  }

  /**
   * Перезапуск игры
   */
  private restartGame(autoStartCombat = true): void {
    this.isPaused = false;
    this.soundSystem.stopAll();
    this.explosions = [];
    this.interceptorManager.reset();
    this.sweeperDrone.reset();
    this.dogfightRescue.reset();
    this.barrageSalvo.reset();
    this.barrageTimer = 0;
    this.nextBarrageDelay = -1;
    this.hadBarrageLastWave = false;
    this.jammerAircraft.reset();
    this.jammerTimer = 0;
    this.nextJammerDelay = -1;
    this.hadJammerLastWave = false;
    this.terrainHugger.reset();
    this.terrainHuggerTimer = 0;
    this.nextTerrainHuggerDelay = -1;
    this.hadTerrainHuggerLastWave = false;
    this.weatherFront.reset();
    this.weatherFrontTimer = 0;
    this.nextWeatherFrontDelay = -1;
    this.hadWeatherFrontLastWave = false;
    this.ambientBg.reset();
    this.pauseOverlay.hide();
    this.briefingOverlay.hide();
    this.gameOverOverlay.hide();
    this.scene.restart({ autoStartCombat });
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
    this.jammerAircraft.onTargetDestroyed(target.id);
    this.terrainHugger.onTargetDestroyed(target.id);
    this.checkWaveProgress();
  }

  /**
   * Запуск сканирования сигнатуры цели
   */
  private startScanning(): void {
    if (!this.selectedTarget || this.isGameOver || this.armory.isScanning) return;
    if (this.jammerAircraft.isTargetJammed(this.selectedTarget)) {
      this.soundSystem.playDenyClick();
      this.showFeedback(
        '[ОТКАЗ] СИГНАЛ ПОДАВЛЕН РЭБ! СКАНИРОВАНИЕ НЕВОЗМОЖНО',
        GAME_CONFIG.colors.text.warning,
      );
      return;
    }
    const res = this.armory.startScan(this.selectedTarget);
    this.showFeedback(res.message, res.color);
    if (res.success) {
      this.hasCompletedFirstAction = true;
      this.updateScoreBoard();
      this.updateTargetSelectionUI();
    }
  }

  private buyInterceptor(): void {
    if (this.isGameOver || this.isPaused) return;
    const res = this.armory.buyInterceptor();
    this.showFeedback(res.message, res.color);
    if (res.success) {
      this.hasCompletedFirstAction = true;
      this.updateScoreBoard();
      this.updateTargetSelectionUI();
    }
    this.alerts.showSupplyAlert({
      type: 'missile',
      success: res.success,
      current: this.armory.interceptors,
      max: GAME_CONFIG.maxInterceptors,
      cost: GAME_CONFIG.interceptorCost,
      credits: this.armory.credits,
      reason: res.reason,
    });
  }

  private buyScan(): void {
    if (this.isGameOver || this.isPaused) return;
    const res = this.armory.buyScan();
    this.showFeedback(res.message, res.color);
    if (res.success) {
      this.hasCompletedFirstAction = true;
      this.updateScoreBoard();
      this.updateTargetSelectionUI();
    }
    this.alerts.showSupplyAlert({
      type: 'scan',
      success: res.success,
      current: this.armory.scansAvailable,
      max: GAME_CONFIG.maxScansPerWave,
      cost: GAME_CONFIG.scanCost,
      credits: this.armory.credits,
      reason: res.reason,
    });
  }

  /**
   * Обновление таймера сканирования (время в игре идёт непрерывно)
   */
  private updateScanning(dt: number): void {
    const res = this.armory.updateScanning(dt, this.targets);
    if (!res) return;
    if (res.completed && res.message && res.color) {
      if (res.target?.type === 'terrain_hugger') {
        this.terrainHugger.onTargetScanned(res.target.id);
        this.hud.showNotification(
          '[ СУО: ДОПЛЕРОВСКИЙ ЗАХВАТ УСТАНОВЛЕН — МАСКИРОВКА РЕЛЬЕФА СНЯТА! ]',
          4.0,
        );
      }
      this.showFeedback(res.message, res.color);
    }
    this.updateTargetSelectionUI();
  }

  /**
   * Обработка решения игрока
   */
  private resolveDecision(choice: DecisionChoice): void {
    if (!this.selectedTarget || this.isGameOver) return;
    if (this.jammerAircraft.isTargetJammed(this.selectedTarget)) {
      this.soundSystem.playDenyClick();
      this.showFeedback(
        '[ОТКАЗ] СИГНАЛ ПОДАВЛЕН РЭБ! ЗАХВАТ СУО СОРВАН',
        GAME_CONFIG.colors.text.warning,
      );
      return;
    }
    const target = this.selectedTarget;

    // 1. Пометка цели (Свой / Помеха) без немедленного удаления с карты
    if (choice === 'friend' || choice === 'ignore') {
      if (target.eventTriggered) {
        this.soundSystem.playDenyClick();
        this.showFeedback(
          '[ОТКАЗ] ПО ЦЕЛИ УЖЕ ЗАПУЩЕН ПРОТОКОЛ ОПЕРАЦИИ!',
          GAME_CONFIG.colors.text.warning,
        );
        return;
      }
      target.markedAs = choice;
      this.hasCompletedFirstAction = true;
      if (choice === 'friend') {
        this.showFeedback(
          '[МЕТКА] ЦЕЛЬ ПРИНЯТА КАК СОЮЗНИК',
          GAME_CONFIG.colors.text.success,
        );
      } else {
        this.showFeedback(
          '[МЕТКА] ЦЕЛЬ ОТМЕЧЕНА КАК ПОМЕХА',
          GAME_CONFIG.colors.text.muted,
        );
      }
      this.updateTelemetry();
      this.updateTargetSelectionUI();
      this.checkSectorEndgameSweep();
      return;
    }

    // 2. Боевой перехват (Угроза) — пуск ракеты-перехватчика
    if (target.isTargeted || target.eventTriggered) {
      this.soundSystem.playDenyClick();
      this.showFeedback(
        target.eventTriggered
          ? '[ОТКАЗ] ПО ЦЕЛИ УЖЕ ЗАПУЩЕН ПРОТОКОЛ ОПЕРАЦИИ!'
          : '[СУО] ЦЕЛЬ УЖЕ В ЗАХВАТЕ! РАКЕТА В ВОЗДУХЕ',
        GAME_CONFIG.colors.text.warning,
      );
      return;
    }

    if (!this.armory.consumeInterceptor()) {
      this.soundSystem.playDenyClick();
      this.showFeedback(
        '[ОТКАЗ!] БОЕКОМПЛЕКТ ПУСТ! ОЖИДАЙТЕ СНАБЖЕНИЯ',
        GAME_CONFIG.colors.text.danger,
      );
      return;
    }

    target.isTargeted = true;
    this.hasCompletedFirstAction = true;
    this.soundSystem.playLaunch();
    this.showFeedback(
      '[ПУСК] ПЕРЕХВАТЧИК В ВОЗДУХЕ!',
      GAME_CONFIG.colors.text.info,
    );

    // Мгновенный сброс захвата цели для игрока (свобода переключения)
    this.selectedTarget = null;
    this.armory.cancelScanIfTarget(target);
    this.updateTargetSelectionUI();
    this.updateScoreBoard();

    // Запуск полёта ракеты-перехватчика
    this.interceptorManager.launch(target, (impactTarget) => {
      this.handleInterceptorImpact(impactTarget);
    });
  }

  /**
   * Обработка достижения цели ракетой-перехватчиком и детонация БЧ
   */
  private handleInterceptorImpact(target: GameTarget): void {
    if (!this.targets.includes(target)) return;

    // Эффект взрыва: для техники - с ударной волной, для ловушки - только вспышка
    const hasShockwave = target.type !== 'decoy';
    this.explosions.push(createExplosion(target.x, target.y, hasShockwave));
    this.ambientBg.triggerExplosionFlash(target.type);
    const pan = Phaser.Math.Clamp(
      (target.x - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius,
      -1,
      1,
    );
    this.soundSystem.playExplosion(target.type, pan);

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
          `[ВЕРНО!] КРЫЛАТАЯ РАКЕТА СБИТА (+${points}, +${GAME_CONFIG.creditsPerMissile} CR)${rangeTag}`,
          GAME_CONFIG.colors.text.success,
        );
        this.alerts.showInterceptAlert({
          unitType: 'missile',
          points,
          credits: GAME_CONFIG.creditsPerMissile,
          isLongRange,
        });
      } else {
        this.stats.recordBomberIntercept();
        this.armory.addCredits(GAME_CONFIG.creditsPerBomber);
        this.showFeedback(
          `[ВЕРНО!] БОМБАРДИРОВЩИК УНИЧТОЖЕН (+${points}, +${GAME_CONFIG.creditsPerBomber} CR)${rangeTag}`,
          GAME_CONFIG.colors.text.success,
        );
        this.alerts.showInterceptAlert({
          unitType: 'bomber',
          points,
          credits: GAME_CONFIG.creditsPerBomber,
          isLongRange,
        });
      }
    } else if (target.type === 'jammer') {
      const distToBase = getDistToBase(target.x, target.y);
      const { points, isLongRange } = this.scoring.addThreatScore(
        distToBase,
        GAME_CONFIG.radarRadius,
      );
      const bonusScore = points + 200;
      const creditsReward = 150;
      this.armory.addCredits(creditsReward);
      this.scoring.addDirectScore(200);
      this.stats.recordBomberIntercept();
      this.showFeedback(
        `[ВЕРНО!] САМОЛЁТ РЭБ СБИТ! ЭФИР РАСЧИЩЕН (+${bonusScore}, +${creditsReward} CR)`,
        GAME_CONFIG.colors.text.success,
      );
      this.alerts.showInterceptAlert({
        unitType: 'jammer',
        points: bonusScore,
        credits: creditsReward,
        isLongRange,
      });
      this.jammerAircraft.onTargetDestroyed(target.id);
    } else if (target.type === 'terrain_hugger') {
      const distToBase = getDistToBase(target.x, target.y);
      const { points, isLongRange } = this.scoring.addThreatScore(
        distToBase,
        GAME_CONFIG.radarRadius,
      );
      const bonusScore = points + 250;
      const creditsReward = 150;
      this.armory.addCredits(creditsReward);
      this.scoring.addDirectScore(250);
      this.stats.recordBomberIntercept();
      this.showFeedback(
        `[ВЕРНО!] ШТУРМОВИК «СТРИЖ» СБИТ (+${bonusScore}, +${creditsReward} CR)`,
        GAME_CONFIG.colors.text.success,
      );
      this.alerts.showInterceptAlert({
        unitType: 'terrain_hugger',
        points: bonusScore,
        credits: creditsReward,
        isLongRange,
      });
      this.terrainHugger.onTargetDestroyed(target.id);
    } else if (target.type === 'friend') {
      // Огонь по своим
      this.stats.recordFriendlyFire();
      this.waveHadFlaws = true;
      const penalty = this.scoring.applyFriendlyFirePenalty();
      this.armory.deductCredits(GAME_CONFIG.creditsFriendlyFirePenalty);
      this.showFeedback(
        `[ОШИБКА!] СБИТ СВОЙ БОРТ! (-${penalty} очк, -${GAME_CONFIG.creditsFriendlyFirePenalty} CR)`,
        GAME_CONFIG.colors.text.criticalPenalty,
      );
      this.alerts.showInterceptAlert({
        unitType: 'friend',
        points: -penalty,
        credits: -GAME_CONFIG.creditsFriendlyFirePenalty,
        streakReset: true,
      });
    } else {
      // Ловушка
      this.stats.recordDecoyIntercept();
      this.scoring.resetStreak();
      this.showFeedback(
        `[ПРОМАХ!] ПЕРЕХВАТЧИК ВПУСТУЮ НА ЛОВУШКУ! (Ост: ${this.armory.interceptors})`,
        GAME_CONFIG.colors.text.warning,
      );
      this.alerts.showInterceptAlert({
        unitType: 'decoy',
        points: 0,
        credits: 0,
        streakReset: true,
        ammoLeft: this.armory.interceptors,
      });
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

      const action = isLanding ? 'УСПЕШНО СЕЛ НА БАЗУ' : 'ПОКИНУЛ СЕКТОР';
      const tag = isLanding ? '[ПОСАДКА]' : '[ТРАНЗИТ]';
      this.showFeedback(
        `${tag} СОЮЗНИК ${action} (+${points}, СЕРИЯ +1)`,
        GAME_CONFIG.colors.text.friendlyBonus,
      );
    } else {
      this.stats.recordFriendMissed();
      this.scoring.resetStreak();
      this.waveHadFlaws = true;
      const penalty = GAME_CONFIG.unidentifiedFriendPenalty;
      this.armory.deductCredits(penalty);

      const cause = target.markedAs === 'ignore' ? 'ПРИНЯТ ЗА ПОМЕХУ!' : 'ПРОПУЩЕН БЕЗ ОТМЕТКИ!';
      this.showFeedback(
        `[ОШИБКА!] СОЮЗНИК ${cause} (-${penalty} CR, СБРОС)`,
        GAME_CONFIG.colors.text.criticalPenalty,
      );
    }

    this.updateScoreBoard();
  }

  /**
   * Обработка завершения пути ложной цели (выход из сектора, рассеивание или уничтожение патрулем)
   */
  private handleDecoyCompletion(
    target: GameTarget,
    isDissipated = false,
    isDestroyedByDrone = false,
  ): void {
    if (target.markedAs === 'ignore') {
      this.stats.recordDecoyFiltered();
      this.scoring.addDecoySuccess();
      const reason = isDestroyedByDrone
        ? 'СБИТА ПАТРУЛЕМ'
        : isDissipated
          ? 'СИГНАЛ РАССЕЯЛСЯ'
          : 'ПОКИНУЛА ЗОНУ';
      this.showFeedback(
        `[ФИЛЬТР] ЛОЖНАЯ ЦЕЛЬ (${reason}) (СЕРИЯ +1)`,
        isDestroyedByDrone ? '#38bdf8' : GAME_CONFIG.colors.text.muted,
      );
    } else if (target.markedAs === 'friend') {
      this.stats.recordDecoyMistake();
      this.scoring.resetStreak();
      this.waveHadFlaws = true;
      this.showFeedback(
        `[ОШИБКА!] ЛОЖНАЯ ЦЕЛЬ ПРИНЯТА ЗА СОЮЗНИКА!`,
        GAME_CONFIG.colors.text.criticalPenalty,
      );
    } else if (isDissipated) {
      this.showFeedback(
        `[БАЗА] ЛОЖНЫЙ СИГНАЛ РАССЕЯЛСЯ (0 УРОНА)`,
        GAME_CONFIG.colors.text.subtle,
      );
    }

    this.updateScoreBoard();
  }

  /**
   * Проверка наличия не нейтрализованных боевых угроз на радаре (ракеты и бомбардировщики)
   */
  private hasActiveThreats(): boolean {
    return this.targets.some(
      (t) =>
        t.type === 'missile' ||
        t.type === 'bomber' ||
        t.type === 'jammer' ||
        t.type === 'terrain_hugger',
    );
  }

  /**
   * Проверка: находится ли цель в комфортной зоне контакта (Engagement Zone) для мини-ивента
   * (не в упор к базе и не на самой кромке радара)
   */
  private isTargetInEngagementZone(target: GameTarget): boolean {
    const dist = getDistToBase(target.x, target.y);
    const minSafeDist = GAME_CONFIG.baseRadius + 28; // ~46 px от центра базы
    const maxSafeDist = GAME_CONFIG.radarRadius * 0.85; // ~178 px от центра базы
    return dist >= minSafeDist && dist <= maxSafeDist;
  }

  /**
   * Обзор воздушной обстановки в финале волны (Sector Endgame Sweep):
   * когда пул волны исчерпан и нет боевых угроз, оставшиеся мирные цели
   * (союзники и ловушки) обслуживаются мини-ивентами в безопасной зоне контакта
   */
  private checkSectorEndgameSweep(): void {
    if (this.isGameOver || !this.isGameStarted) return;
    if (this.waveTargetsToSpawn > 0) return;
    if (this.hasActiveThreats()) return;

    // 1. Проверяем цели, помеченные как СОЮЗНИК
    if (!this.dogfightRescue.isActive && !this.sweeperDrone.isActive) {
      const candidateFriend = this.targets.find(
        (t) => t.markedAs === 'friend' && !t.eventTriggered,
      );

      if (candidateFriend) {
        if (candidateFriend.type === 'friend') {
          // Истинный союзник: за ним охотятся перехватчики врага, база высылает дрон-спасатель
          if (this.isTargetInEngagementZone(candidateFriend)) {
            candidateFriend.eventTriggered = true;
            this.dogfightRescue.start(candidateFriend);
            this.showFeedback(
              '[ТРЕВОГА] ПЕРЕХВАТЧИКИ ВРАГА НА ХВОСТЕ СОЮЗНИКА!',
              '#f97316',
            );
            this.soundSystem.playSalvoAlert();
          } else {
            // Если борт уже у самой базы или у кромки — не запускаем засаду, а даём безопасный форсаж
            candidateFriend.eventTriggered = true;
            candidateFriend.speed = Math.max(68, Math.round(candidateFriend.speed * 2.2));
            candidateFriend.turnRate = 0;
            candidateFriend.vx = Math.cos(candidateFriend.headingRad) * candidateFriend.speed;
            candidateFriend.vy = Math.sin(candidateFriend.headingRad) * candidateFriend.speed;
          }
        } else if (candidateFriend.type === 'decoy') {
          // Ловушка, ошибочно принятая за союзника:
          // Враги не атакуют свою ловушку. Наша база высылает синий технический борт эскорта для проводки на базу!
          if (this.isTargetInEngagementZone(candidateFriend)) {
            candidateFriend.eventTriggered = true;
            this.sweeperDrone.dispatch(candidateFriend, 'escort');
            this.showFeedback(
              '[ЭСКОРТ] ВЫСЛАН БОРТ НА ВСТРЕЧУ СОЮЗНИКА',
              '#38bdf8',
            );
          } else {
            candidateFriend.eventTriggered = true;
          }
        }
      }
    }

    // 2. Проверяем цели, помеченные как ЛОВУШКА (включая ошибочные метки на союзниках)
    if (!this.sweeperDrone.isActive && !this.dogfightRescue.isActive) {
      const candidateDecoy = this.targets.find(
        (t) => t.markedAs === 'ignore' && !t.eventTriggered,
      );

      if (candidateDecoy) {
        if (this.isTargetInEngagementZone(candidateDecoy)) {
          candidateDecoy.eventTriggered = true;
          this.sweeperDrone.dispatch(candidateDecoy, 'sweep');
          this.showFeedback(
            candidateDecoy.type === 'friend'
              ? '[ПАТРУЛЬ] ДРОН ЗАЧИСТКИ НАПРАВЛЕН НА ЦЕЛЬ'
              : '[ПАТРУЛЬ] ДРОН НАПРАВЛЕН НА ЛОЖНУЮ ЦЕЛЬ',
            '#38bdf8',
          );
        } else {
          // Если ловушка уже на выходе или в упор к базе — помечаем, чтобы не висела
          candidateDecoy.eventTriggered = true;
        }
      }
    }
  }

  /**
   * Обработка достижения цели патрульным дроном зачистки или бортом сопровождения
   */
  private handleSweeperDroneKill(target: GameTarget): void {
    const pan = (target.x - GAME_CONFIG.radarX) / GAME_CONFIG.radarRadius;

    // Режим сопровождения ('escort'): борт подлетел к «союзнику» и обнаружил пустое облако помех!
    if (this.sweeperDrone.mode === 'escort') {
      this.soundSystem.playExplosion('decoy', pan);
      this.explosions.push(createExplosion(target.x, target.y, false));
      this.stats.recordDecoyMistake();
      this.scoring.resetStreak();
      this.waveHadFlaws = true;
      this.showFeedback(
        '[ЭСКОРТ] "ВИЗУАЛЬНО ПУСТО! В ТОЧКЕ ОБЛАКО ДИПОЛЕЙ!"',
        GAME_CONFIG.colors.text.criticalPenalty,
      );
      this.alerts.showInterceptAlert({
        unitType: 'decoy',
        points: 0,
        credits: 0,
        streakReset: true,
      });
      this.updateScoreBoard();
      this.removeTarget(target);
      return;
    }

    // Режим зачистки ('sweep'): расстрел цели из курсовой автопушки
    this.soundSystem.playExplosion(target.type, pan);
    this.explosions.push(createExplosion(target.x, target.y, target.type === 'friend'));

    if (target.type === 'friend') {
      // ОГОНЬ ПО СВОИМ: Дрон расстрелял союзника, принятого за ловушку!
      this.stats.recordFriendlyFire();
      this.waveHadFlaws = true;
      const penalty = this.scoring.applyFriendlyFirePenalty();
      this.armory.deductCredits(GAME_CONFIG.creditsFriendlyFirePenalty);
      this.showFeedback(
        `[ОГОНЬ ПО СВОИМ!] СБИТ СОЮЗНИК! (-${penalty} очк, -${GAME_CONFIG.creditsFriendlyFirePenalty} CR)`,
        GAME_CONFIG.colors.text.criticalPenalty,
      );
      this.alerts.showInterceptAlert({
        unitType: 'friend',
        points: -penalty,
        credits: -GAME_CONFIG.creditsFriendlyFirePenalty,
        streakReset: true,
      });
      this.updateScoreBoard();
    } else {
      this.handleDecoyCompletion(target, false, true);
    }
    this.removeTarget(target);
  }

  /**
   * Завершение сцены воздушного боя: перевод спасённого союзника на форсаж с перерасчётом маршрута
   */
  private handleDogfightCompleted(ally: GameTarget): void {
    // Включаем союзнику форсаж (~75-80 px/с)
    ally.speed = Math.max(72, Math.round(ally.speed * 2.8));
    ally.turnRate = 0; // прямой скоростной вектор без блужданий
    ally.hasManeuvered = true; // блокируем повторный таймер манёвра
    ally.maneuverTimer = undefined;

    // 50% шанс: аварийный заход на базу для ремонта, 50% скоростной уход из сектора
    const goesToBase = Math.random() < 0.5;
    let targetAngle: number;

    if (goesToBase) {
      targetAngle = Math.atan2(
        GAME_CONFIG.radarY - ally.y,
        GAME_CONFIG.radarX - ally.x,
      );
      this.showFeedback(
        '[СОЮЗНИК] "ХВОСТ ЧИСТ! ИДУ НА ПОСАДКУ НА БАЗУ"',
        GAME_CONFIG.colors.text.success,
      );
    } else {
      targetAngle = Math.atan2(
        ally.y - GAME_CONFIG.radarY,
        ally.x - GAME_CONFIG.radarX,
      );
      this.showFeedback(
        '[СОЮЗНИК] "ХВОСТ ЧИСТ! НА ФОРСАЖЕ ВЫХОЖУ ИЗ ЗОНЫ"',
        GAME_CONFIG.colors.text.success,
      );
    }

    ally.headingRad = targetAngle;
    ally.targetHeadingRad = targetAngle;
    ally.vx = Math.cos(targetAngle) * ally.speed;
    ally.vy = Math.sin(targetAngle) * ally.speed;

    let deg = Math.round(Phaser.Math.RadToDeg(targetAngle));
    if (deg < 0) deg += 360;
    ally.headingDeg = deg;
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
      showActionHint: this.selectedTarget !== null && !this.hasCompletedFirstAction,
    });
  }

  private updateTelemetry(): void {
    this.hud.updateTelemetry({
      selectedTarget: this.selectedTarget,
      isScanning: this.armory.isScanning,
      scanningTarget: this.armory.scanningTarget,
      scanProgress: this.armory.scanProgress,
      showTelemetryHints:
        this.stats.snapshot.correctDecisions < TELEMETRY_HINT_CONFIG.maxAssistedDecisions,
    });
  }

  /**
   * Шаг движения целей и диспетчеризация событий пересечения границ
   */
  private updateTargets(dt: number): void {
    const { events, targetsToRemove } = updateTargetsSimulation(this.targets, dt);

    for (const ev of events) {
      this.handleTargetSimulationEvent(ev);
      if (this.isGameOver) break;
    }

    for (const target of targetsToRemove) {
      if (this.dogfightRescue.isCombatActive && target.type === 'friend') {
        continue;
      }
      this.removeTarget(target);
    }
  }

  /**
   * Реакция на события физической симуляции целей
   */
  private handleTargetSimulationEvent(ev: TargetSimulationEvent): void {
    switch (ev.type) {
      case 'missile_hit':
        this.stats.recordThreatMissed();
        this.waveHadFlaws = true;
        this.scoring.resetStreak();
        this.applyBaseDamage(
          GAME_CONFIG.damageMissile,
          `[УРОН!] ПРОПУЩЕНА КРЫЛАТАЯ РАКЕТА! (-${GAME_CONFIG.damageMissile} HP)`,
        );
        break;

      case 'bomber_bomb':
        this.stats.recordThreatMissed();
        this.waveHadFlaws = true;
        this.scoring.resetStreak();
        this.applyBaseDamage(
          GAME_CONFIG.damageBomber,
          `[УРОН!] БОМБАРДИРОВКА БАЗЫ! (-${GAME_CONFIG.damageBomber} HP)`,
        );
        break;

      case 'terrain_hugger_hit':
        this.stats.recordThreatMissed();
        this.waveHadFlaws = true;
        this.scoring.resetStreak();
        this.applyBaseDamage(
          TERRAIN_HUGGER_CONFIG.damage,
          `[ПРОРЫВ!] ШТУРМОВИК С ПМВ АТАКОВАЛ БАЗУ! (-${TERRAIN_HUGGER_CONFIG.damage} HP)`,
        );
        this.terrainHugger.onTargetDestroyed(ev.target.id);
        break;

      case 'friend_landed':
        if (this.dogfightRescue.isCombatActive) break;
        this.handleFriendCompletion(ev.target, true);
        break;

      case 'friend_exited':
        if (this.dogfightRescue.isCombatActive) break;
        this.handleFriendCompletion(ev.target, false);
        break;

      case 'decoy_passed_base':
        this.showFeedback(
          '[БАЗА] ЛОЖНАЯ ЦЕЛЬ ПРОШЛА НАВЫЛЕТ (-0 HP)',
          GAME_CONFIG.colors.text.subtle,
        );
        break;

      case 'decoy_dissipated':
        this.handleDecoyCompletion(ev.target, true);
        break;

      case 'decoy_exited':
        this.handleDecoyCompletion(ev.target, false);
        break;

      case 'target_escaped':
        if (ev.target.type === 'jammer') {
          this.hud.showNotification(
            '[ РЛС: САМОЛЁТ РЭБ ПОКИНУЛ СЕКТОР ]',
            3.5,
          );
        } else if (ev.target.type === 'terrain_hugger') {
          this.terrainHugger.onTargetDestroyed(ev.target.id);
        }
        break;
    }
  }

  /**
   * Применение урона базе с эффектом вспышки и проверкой Game Over
   */
  private applyBaseDamage(damage: number, feedback: string): void {
    this.baseHealth = Math.max(0, this.baseHealth - damage);
    this.baseFlashTimer = 0.6;
    this.ambientBg.triggerBaseDamageFlash();
    this.soundSystem.playBaseDamage();
    this.showFeedback(feedback, GAME_CONFIG.colors.text.danger);
    this.drawHealthBar();

    if (this.baseHealth <= 0 && !this.isGameOver) {
      this.triggerGameOver();
    }
  }

  /**
   * Проверка перехода к следующей волне
   */
  private checkWaveProgress(): void {
    if (this.targets.length === 0) {
      this.sweeperDrone.reset();
      this.dogfightRescue.reset();
    }
    if (this.sweeperDrone.isActive || this.dogfightRescue.isActive) {
      return;
    }
    if (this.waveTargetsToSpawn <= 0 && this.targets.length === 0 && !this.isGameOver) {
      const completedSpecialWave = this.isSpecialWaveCurrent;
      this.wave++;
      this.waveTargetsToSpawn =
        GAME_CONFIG.waveTargetsBase + this.wave * GAME_CONFIG.waveTargetsIncrement;
      const waveInit = this.tacticalEvents.startWave(this.wave, this.waveTargetsToSpawn);
      this.isSpecialWaveCurrent = waveInit.isSpecialWave;
      if (waveInit.isSpecialWave && waveInit.specialWaveTargetsCount) {
        this.waveTargetsToSpawn = waveInit.specialWaveTargetsCount;
      }

      // Луч ускоряется с каждой волной
      this.radarRender.setWaveSpeed(this.wave);

      // Запланировать редкий заградительный налёт в новой волне
      this.scheduleBarrageForWave();
      this.scheduleJammerForWave();
      this.scheduleTerrainHuggerForWave();
      this.scheduleWeatherFrontForWave();

      // Пополнение боекомплекта перехватчиков, зарядов сканирования и начисление кредитов за волну
      let { addedAmmo, waveCredits } = this.armory.refillForWave(this.wave);
      const swarmCfg = EVENT_CONFIG.general.maneuverSwarm;
      if (completedSpecialWave) {
        // Увеличенный бонус по кредитам за завершение особого манёвренного прорыва
        const mult: number = swarmCfg.creditsRewardMultiplier;
        const extraCredits = Math.round(waveCredits * (mult - 1));
        if (extraCredits > 0) {
          this.armory.addCredits(extraCredits);
        }
        waveCredits = Math.round(waveCredits * mult);
      }

      if (waveInit.creditsGrant && waveInit.creditsGrant > 0) {
        this.armory.addCredits(waveInit.creditsGrant);
      }

      const mult: number = swarmCfg.creditsRewardMultiplier;
      const rewardLabel =
        mult === 2
          ? '★ НАГРАДА УДВОЕНА ЗА ПРОРЫВ ★'
          : `★ БОНУС ЗА ПРОРЫВ (+${Math.round((mult - 1) * 100)}%) ★`;

      const bonusLines: string[] = [];
      if (completedSpecialWave && mult > 1) {
        bonusLines.push(rewardLabel);
      }

      const isCleanWave = !this.waveHadFlaws;
      if (isCleanWave) {
        const bonus = this.scoring.applyCleanWaveBonus();
        bonusLines.push(`★ ЧИСТАЯ ВОЛНА! (+${bonus} ОЧК) ★`);
      }
      this.waveHadFlaws = false;

      this.soundSystem.playWaveTransition(isCleanWave);
      this.updateScoreBoard();

      if (waveInit.isSpecialWave && waveInit.bannerTitle && waveInit.bannerSubtitle) {
        const lines = [
          waveInit.bannerTitle,
          waveInit.bannerSubtitle,
        ];
        if (waveInit.creditsGrant && waveInit.creditsGrant > 0) {
          lines.push(`★ СУБСИДИЯ ПВО: +${waveInit.creditsGrant} CR ★`);
        }
        if (completedSpecialWave && mult > 1) {
          lines.push(rewardLabel);
        }
        this.showWaveBanner(lines.join('\n'));
        const grant = waveInit.creditsGrant || swarmCfg.startCreditsGrant;
        this.hud.showNotification(
          `[ ОСОБЫЙ СЕКТОР: СУБСИДИЯ ПВО +${grant} CR НА ОТРАЖЕНИЕ ${swarmCfg.echelonCount} ЭШЕЛОНОВ ]`,
          swarmCfg.interEchelonPause,
        );
      } else {
        const doubleTag = completedSpecialWave && mult > 1 ? ` (${mult}x)` : '';
        const lines = [
          `ВОЛНА ${this.wave}`,
          `СНАБЖЕНИЕ: +${addedAmmo} РАКЕТЫ | +${waveCredits} CR${doubleTag} | СКАНЫ ${GAME_CONFIG.maxScansPerWave}/${GAME_CONFIG.maxScansPerWave}`,
          ...bonusLines,
        ];
        this.showWaveBanner(lines.join('\n'));
      }
    }
  }
}


