import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type DecisionChoice,
  type GameTarget,
} from './gameConfig';
import { calculateStreakMultiplier } from './scoring';
import type { GameSessionStats } from './stats';

export type { GameSessionStats };

/**
 * Интерфейс управления оверлеем поражения
 */
export interface GameOverOverlay {
  container: Phaser.GameObjects.Container;
  show: (
    score: number,
    highScore: number,
    wave: number,
    bestStreak: number,
    isNewRecord: boolean,
    stats: GameSessionStats,
  ) => void;
  hide: () => void;
}

/**
 * Интерфейс управления оверлеем тактической паузы
 */
export interface PauseOverlay {
  container: Phaser.GameObjects.Container;
  show: () => void;
  hide: () => void;
  setVisible: (visible: boolean) => void;
}

/**
 * Интерфейс управления оверлеем боевого инструктажа / стартового экрана
 */
export interface BriefingOverlay {
  container: Phaser.GameObjects.Container;
  show: (isFirstTime?: boolean) => void;
  hide: () => void;
  isVisible: () => boolean;
}

/**
 * Фабрика экрана поражения (Game Over)
 */
export function createGameOverOverlay(
  scene: Phaser.Scene,
  onRestart: () => void,
): GameOverOverlay {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0);
  container.setDepth(100);
  container.setVisible(false);

  // Полупрозрачное затемнение (блокирует клики под модальным окном)
  const darkBg = scene.add.rectangle(
    width / 2,
    height / 2,
    width,
    height,
    0x020a05,
    0.88,
  );
  darkBg.setInteractive();

  // Рамка модального окна
  const modal = scene.add.rectangle(
    width / 2,
    height / 2,
    480,
    360,
    0x071b0f,
    0.96,
  );
  modal.setStrokeStyle(2, 0xef4444, 0.9);

  const title = scene.add.text(
    width / 2,
    height / 2 - 120,
    'СИСТЕМА ОБОРОНЫ ПРОРВАНА\n[ БАЗА УНИЧТОЖЕНА ]',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '20px',
      color: '#ef4444',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 6,
    },
  );
  title.setOrigin(0.5);

  const scoreText = scene.add.text(
    width / 2,
    height / 2 - 50,
    'ИТОГОВЫЙ СЧЁТ: 0',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '17px',
      color: '#facc15',
      fontStyle: 'bold',
    },
  );
  scoreText.setOrigin(0.5);

  const recordText = scene.add.text(
    width / 2,
    height / 2 - 22,
    'ЛУЧШИЙ РЕКОРД: 0',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#86efac',
    },
  );
  recordText.setOrigin(0.5);

  const wavesText = scene.add.text(
    width / 2,
    height / 2 + 2,
    'ВОЛНА: 1 | МАКС. СЕРИЯ: 0',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#94a3b8',
    },
  );
  wavesText.setOrigin(0.5);

  const statsText = scene.add.text(width / 2, height / 2 + 42, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '12px',
    color: '#cbd5e1',
    align: 'center',
    lineSpacing: 4,
  }).setOrigin(0.5);

  // Кнопка рестарта
  const restartBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 115,
    260,
    42,
    0x16a34a,
    0.9,
  );
  restartBtn.setStrokeStyle(1.5, 0x4ade80, 1);
  restartBtn.setInteractive({ useHandCursor: true });

  const restartText = scene.add.text(
    width / 2,
    height / 2 + 115,
    'ЕЩЁ РАЗ (ПРОБЕЛ)',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    },
  );
  restartText.setOrigin(0.5);

  restartBtn.on('pointerover', () => restartBtn.setFillStyle(0x22c55e, 1));
  restartBtn.on('pointerout', () => restartBtn.setFillStyle(0x16a34a, 0.9));
  restartBtn.on('pointerdown', () => onRestart());

  container.add([
    darkBg,
    modal,
    title,
    scoreText,
    recordText,
    wavesText,
    statsText,
    restartBtn,
    restartText,
  ]);

  return {
    container,
    show: (score, highScore, wave, bestStreak, isNewRecord, stats) => {
      scoreText.setText(
        `ИТОГОВЫЙ СЧЁТ: ${score}` + (isNewRecord ? ' (НОВЫЙ РЕКОРД!)' : ''),
      );
      recordText.setText(`ЛУЧШИЙ РЕКОРД: ${highScore}`);
      wavesText.setText(`ВОЛНА: ${wave} | МАКС. СЕРИЯ: ${bestStreak}`);

      const acc = stats.totalDecisions > 0
        ? Math.round((stats.correctDecisions / stats.totalDecisions) * 100)
        : 100;
      const mins = Math.floor(stats.sessionTime / 60);
      const secs = Math.floor(stats.sessionTime % 60);
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      statsText.setText(
        `СБИТО: ${stats.missilesShot} РАКЕТ, ${stats.bombersShot} БОМБАРДИРОВЩИКОВ, ${stats.friendlyFireCount} СВОИХ\n` +
        `СПАСЕНО СОЮЗНИКОВ: ${stats.friendsSaved} | ОТСЛЕЖЕНО ЛОВУШЕК: ${stats.decoysFiltered} | УПУЩЕНО УГРОЗ: ${stats.threatsMissed}\n` +
        `ТОЧНОСТЬ: ${acc}% | ВРЕМЯ ДЕЖУРСТВА: ${timeStr}`,
      );
      container.setVisible(true);
    },
    hide: () => {
      container.setVisible(false);
    },
  };
}

export interface PauseOverlayCallbacks {
  onResume: () => void;
  onOpenBriefing?: () => void;
  onRestart?: () => void;
}

/**
 * Фабрика экрана тактической паузы
 */
export function createPauseOverlay(
  scene: Phaser.Scene,
  callbacks: PauseOverlayCallbacks | (() => void),
): PauseOverlay {
  const cbs: PauseOverlayCallbacks =
    typeof callbacks === 'function' ? { onResume: callbacks } : callbacks;

  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0);
  container.setDepth(90);
  container.setVisible(false);

  // Полупрозрачное затемнение (блокирует клики сквозь паузу)
  const darkBg = scene.add.rectangle(
    width / 2,
    height / 2,
    width,
    height,
    0x020a05,
    0.82,
  );
  darkBg.setInteractive();

  // Рамка окна паузы
  const modal = scene.add.rectangle(
    width / 2,
    height / 2,
    400,
    270,
    0x071b0f,
    0.96,
  );
  modal.setStrokeStyle(2, 0x38bdf8, 0.9);

  const title = scene.add.text(
    width / 2,
    height / 2 - 85,
    '// ТАКТИЧЕСКАЯ ПАУЗА //',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '20px',
      color: '#38bdf8',
      fontStyle: 'bold',
    },
  );
  title.setOrigin(0.5);

  // 1. Кнопка продолжения
  const resumeBtn = scene.add.rectangle(
    width / 2,
    height / 2 - 28,
    260,
    36,
    0x0284c7,
    0.9,
  );
  resumeBtn.setStrokeStyle(1.5, 0x38bdf8, 1);
  resumeBtn.setInteractive({ useHandCursor: true });

  const resumeText = scene.add.text(
    width / 2,
    height / 2 - 28,
    'ПРОДОЛЖИТЬ (P)',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    },
  );
  resumeText.setOrigin(0.5);

  resumeBtn.on('pointerover', () => resumeBtn.setFillStyle(0x0369a1, 1));
  resumeBtn.on('pointerout', () => resumeBtn.setFillStyle(0x0284c7, 0.9));
  resumeBtn.on('pointerdown', () => cbs.onResume());

  // 2. Кнопка инструктажа
  const briefingBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 18,
    260,
    36,
    0x0f3b25,
    0.9,
  );
  briefingBtn.setStrokeStyle(1.5, 0x4ade80, 0.9);
  briefingBtn.setInteractive({ useHandCursor: true });

  const briefingText = scene.add.text(
    width / 2,
    height / 2 + 18,
    'ИНСТРУКТАЖ / СПРАВКА',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#86efac',
      fontStyle: 'bold',
    },
  );
  briefingText.setOrigin(0.5);

  briefingBtn.on('pointerover', () => briefingBtn.setFillStyle(0x166534, 1));
  briefingBtn.on('pointerout', () => briefingBtn.setFillStyle(0x0f3b25, 0.9));
  briefingBtn.on('pointerdown', () => cbs.onOpenBriefing?.());

  // 3. Кнопка перезапуска игры
  const restartBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 64,
    260,
    36,
    0x450a0a,
    0.9,
  );
  restartBtn.setStrokeStyle(1.5, 0xef4444, 0.9);
  restartBtn.setInteractive({ useHandCursor: true });

  const restartText = scene.add.text(
    width / 2,
    height / 2 + 64,
    'НАЧАТЬ ЗАНОВО (R)',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#fca5a5',
      fontStyle: 'bold',
    },
  );
  restartText.setOrigin(0.5);

  restartBtn.on('pointerover', () => restartBtn.setFillStyle(0x7f1d1d, 1));
  restartBtn.on('pointerout', () => restartBtn.setFillStyle(0x450a0a, 0.9));
  restartBtn.on('pointerdown', () => cbs.onRestart?.());

  container.add([
    darkBg,
    modal,
    title,
    resumeBtn,
    resumeText,
    briefingBtn,
    briefingText,
    restartBtn,
    restartText,
  ]);

  return {
    container,
    show: () => container.setVisible(true),
    hide: () => container.setVisible(false),
    setVisible: (visible) => container.setVisible(visible),
  };
}

/**
 * Фабрика экрана боевого инструктажа / стартового экрана
 */
export function createBriefingOverlay(
  scene: Phaser.Scene,
  onClose: () => void,
): BriefingOverlay {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0);
  container.setDepth(110);
  container.setVisible(false);

  // Полупрозрачный фон-затемнение
  const darkBg = scene.add.rectangle(width / 2, height / 2, width, height, 0x020a05, 0.92);
  darkBg.setInteractive();

  // Модальное окно
  const modal = scene.add.rectangle(width / 2, height / 2, 560, 420, 0x071b0f, 0.98);
  modal.setStrokeStyle(2, 0x4ade80, 0.9);

  const title = scene.add.text(
    width / 2,
    height / 2 - 170,
    '[ БОЕВОЙ ИНСТРУКТАЖ: СЕКТОР «РУБЕЖ» ]',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '17px',
      color: '#86efac',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);

  interface TextSegment {
    text: string;
    color: string;
    bold?: boolean;
  }

  const contentObjects: Phaser.GameObjects.GameObject[] = [];

  const addRow = (x: number, y: number, segments: TextSegment[]) => {
    let curX = x;
    for (const seg of segments) {
      const txt = scene.add.text(curX, y, seg.text, {
        fontFamily: 'Consolas, monospace',
        fontSize: '11px',
        color: seg.color,
        fontStyle: seg.bold ? 'bold' : 'normal',
      });
      contentObjects.push(txt);
      curX += txt.width;
    }
  };

  const startX = width / 2 - 250;
  const cy = height / 2;

  // Разделитель под заголовком
  const dividerTop = scene.add.rectangle(width / 2, cy - 150, 500, 1, 0x14532d, 0.9);
  contentObjects.push(dividerTop);

  // 1. Угрозы (красный акцент)
  addRow(startX, cy - 136, [
    { text: '• УГРОЗЫ: ', color: '#ef4444', bold: true },
    { text: 'Ракеты и бомбардировщики летят к центру базы.', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 118, [
    { text: '  ДЕЙСТВИЕ: ', color: '#94a3b8' },
    { text: 'УНИЧТОЖИТЬ [2]', color: '#f87171', bold: true },
    { text: ' (требует ракеты-перехватчики)', color: '#94a3b8' },
  ]);

  // 2. Союзники (зелёный акцент)
  addRow(startX, cy - 88, [
    { text: '• СОЮЗНИКИ: ', color: '#4ade80', bold: true },
    { text: 'Зелёные метки с курсом в сектор — свои борта.', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 70, [
    { text: '  ДЕЙСТВИЕ: ', color: '#94a3b8' },
    { text: 'ПРОПУСТИТЬ [1]', color: '#4ade80', bold: true },
    { text: ' (огонь по своим карается ', color: '#94a3b8' },
    { text: 'ШТРАФОМ 150 CR', color: '#f87171', bold: true },
    { text: '!)', color: '#94a3b8' },
  ]);

  // 3. Ловушки (серый/нейтральный акцент)
  addRow(startX, cy - 40, [
    { text: '• ЛОВУШКИ: ', color: '#94a3b8', bold: true },
    { text: 'Имитаторы идут по хордам мимо базы (нет урона).', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 22, [
    { text: '  ДЕЙСТВИЕ: ', color: '#94a3b8' },
    { text: 'ЛОЖНАЯ ЦЕЛЬ [3]', color: '#cbd5e1', bold: true },
    { text: ' (фильтруйте пустышки, экономя боезапас)', color: '#94a3b8' },
  ]);

  // 4. Сенсоры и снабжение (голубой / бирюзовый акцент)
  addRow(startX, cy + 8, [
    { text: '• СЕНСОРЫ: ', color: '#38bdf8', bold: true },
    { text: 'Клавиша ', color: '#e2e8f0' },
    { text: '[4] СКАН', color: '#38bdf8', bold: true },
    { text: ' раскрывает тип цели за 1 с (расходует заряд).', color: '#e2e8f0' },
  ]);
  addRow(startX, cy + 26, [
    { text: '• СНАБЖЕНИЕ: ', color: '#2dd4bf', bold: true },
    { text: 'Докупка ракет ', color: '#e2e8f0' },
    { text: '[5]', color: '#facc15', bold: true },
    { text: ' (150 CR)   |   Докупка сканов ', color: '#e2e8f0' },
    { text: '[6]', color: '#facc15', bold: true },
    { text: ' (75 CR)', color: '#e2e8f0' },
  ]);

  // 5. Панель быстрого управления (жёлтый акцент)
  const cmdPanel = scene.add.rectangle(width / 2, cy + 74, 500, 32, 0x081f14, 0.95);
  cmdPanel.setStrokeStyle(1.5, 0xca8a04, 0.7);
  contentObjects.push(cmdPanel);

  const cmdText = scene.add.text(
    width / 2,
    cy + 74,
    'УПРАВЛЕНИЕ:  [1] СВОЙ   [2] УГРОЗА   [3] ИГНОР   [4] СКАН   [P] ПАУЗА',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#facc15',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);
  contentObjects.push(cmdText);

  const actionBtn = scene.add.rectangle(width / 2, cy + 155, 300, 42, 0x16a34a, 0.9);
  actionBtn.setStrokeStyle(1.5, 0x4ade80, 1);
  actionBtn.setInteractive({ useHandCursor: true });

  const actionText = scene.add.text(width / 2, cy + 155, 'ЗАСТУПИТЬ НА СМЕНУ (ПРОБЕЛ)', {
    fontFamily: 'Consolas, monospace',
    fontSize: '13px',
    color: '#ffffff',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  actionBtn.on('pointerover', () => actionBtn.setFillStyle(0x22c55e, 1));
  actionBtn.on('pointerout', () => actionBtn.setFillStyle(0x16a34a, 0.9));
  actionBtn.on('pointerdown', () => onClose());

  container.add([darkBg, modal, title, ...contentObjects, actionBtn, actionText]);

  return {
    container,
    show: (isFirstTime = false) => {
      actionText.setText(isFirstTime ? 'ЗАСТУПИТЬ НА СМЕНУ (ПРОБЕЛ)' : 'ВЕРНУТЬСЯ В ИГРУ (ПРОБЕЛ)');
      container.setVisible(true);
    },
    hide: () => container.setVisible(false),
    isVisible: () => container.visible,
  };
}

/**
 * Элемент интерактивной кнопки консоли
 */
export interface ButtonItem {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  setEnabled: (enabled: boolean) => void;
}

/**
 * Коллбеки действий пользователя в консоли
 */
export interface HudCallbacks {
  onDecision: (choice: DecisionChoice) => void;
  onScan: () => void;
  onBuyMissile: () => void;
  onBuyScan: () => void;
  onTogglePause?: () => void;
}

export interface ScoreBoardData {
  score: number;
  credits: number;
  streak: number;
  wave: number;
  highScore: number;
  interceptors: number;
  scansAvailable: number;
}

export interface TargetSelectionData {
  selectedTarget: GameTarget | null;
  interceptors: number;
  scansAvailable: number;
  isScanning: boolean;
}

export interface TelemetryData {
  selectedTarget: GameTarget | null;
  isScanning: boolean;
  scanningTarget: GameTarget | null;
  scanProgress: number;
}

/**
 * Интерфейс управления консолью оператора (HUD)
 */
export interface HudManager {
  drawHealthBar: (baseHealth: number) => void;
  updateScoreBoard: (data: ScoreBoardData) => void;
  updateTargetSelectionUI: (data: TargetSelectionData) => void;
  updateTelemetry: (data: TelemetryData) => void;
  showFeedback: (text: string, color: string) => void;
  updateFeedback: (dt: number) => void;
  showWaveBanner: (text: string) => void;
  updateWaveBanner: (dt: number) => void;
  showNotification: (text: string, duration?: number) => void;
  updateNotification: (dt: number) => void;
}

/**
 * Фабрика консоли оператора и кнопок управления
 */
export function createHud(
  scene: Phaser.Scene,
  callbacks: HudCallbacks,
): HudManager {
  const { colors } = GAME_CONFIG;
  const panelX = 640;
  const panelY = 32;
  const panelW = 295;
  const panelH = 576;

  const hudGraphics = scene.add.graphics();

  // 1. Панель консоли оператора
  hudGraphics.fillStyle(colors.hudBg, 0.94);
  hudGraphics.fillRoundedRect(panelX, panelY, panelW, panelH, 6);

  hudGraphics.lineStyle(1.5, colors.hudBorder, 0.85);
  hudGraphics.strokeRoundedRect(panelX, panelY, panelW, panelH, 6);

  // Разделительные линии
  hudGraphics.lineStyle(1, colors.hudBorder, 0.5);
  hudGraphics.beginPath();
  hudGraphics.moveTo(panelX + 16, panelY + 125);
  hudGraphics.lineTo(panelX + panelW - 16, panelY + 125);
  hudGraphics.moveTo(panelX + 16, panelY + 284);
  hudGraphics.lineTo(panelX + panelW - 16, panelY + 284);
  hudGraphics.moveTo(panelX + 16, panelY + 452);
  hudGraphics.lineTo(panelX + panelW - 16, panelY + 452);
  hudGraphics.strokePath();

  // 2. Кнопка меню в левом верхнем углу (на фоне позади радара)
  if (callbacks.onTogglePause) {
    const btnX = 82;
    const btnY = 38;
    const btnW = 116;
    const btnH = 32;

    const menuBtn = scene.add.rectangle(btnX, btnY, btnW, btnH, 0x071b0f, 0.92);
    menuBtn.setStrokeStyle(1.5, 0x38bdf8, 0.85);
    menuBtn.setDepth(20);
    menuBtn.setInteractive({ useHandCursor: true });

    const menuText = scene.add.text(btnX, btnY, 'МЕНЮ (P)', {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#38bdf8',
      fontStyle: 'bold',
    });
    menuText.setOrigin(0.5);
    menuText.setDepth(21);

    menuBtn.on('pointerover', () => {
      menuBtn.setFillStyle(0x0284c7, 0.95);
      menuText.setColor('#ffffff');
    });
    menuBtn.on('pointerout', () => {
      menuBtn.setFillStyle(0x071b0f, 0.92);
      menuText.setColor('#38bdf8');
    });
    menuBtn.on('pointerdown', () => callbacks.onTogglePause?.());
  }

  // 3. Текстовые элементы консоли
  const monoStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'Consolas, monospace',
    fontSize: '13px',
    color: '#4ade80',
  };

  const healthText = scene.add.text(660, 68, 'ЦЕЛОСТНОСТЬ БАЗЫ: 100%', {
    ...monoStyle,
    fontSize: '12px',
    color: '#22c55e',
    fontStyle: 'bold',
  });

  const scoreText = scene.add.text(660, 102, 'СЧЁТ: 0000', {
    ...monoStyle,
    fontSize: '14px',
    color: '#facc15',
    fontStyle: 'bold',
  });

  const highScoreText = scene.add.text(785, 102, 'РЕКОРД: 0', {
    ...monoStyle,
    fontSize: '12px',
    color: '#cbd5e1',
  });

  const creditsText = scene.add.text(660, 120, 'КРЕДИТЫ: 200 CR', {
    ...monoStyle,
    fontSize: '12px',
    color: '#38bdf8',
    fontStyle: 'bold',
  });

  const waveText = scene.add.text(785, 120, 'ВОЛНА: 1', {
    ...monoStyle,
    fontSize: '12px',
    color: '#38bdf8',
    fontStyle: 'bold',
  });

  const streakText = scene.add.text(660, 137, 'СЕРИЯ: 0 (x1.0)', {
    ...monoStyle,
    fontSize: '12px',
    color: '#86efac',
  });

  const interceptorsText = scene.add.text(660, 154, 'РАКЕТЫ: [|||||] 5/6', {
    ...monoStyle,
    fontSize: '11px',
    color: '#facc15',
    fontStyle: 'bold',
  });

  const scansText = scene.add.text(785, 154, 'СКАН: [***] 3/3', {
    ...monoStyle,
    fontSize: '11px',
    color: '#38bdf8',
    fontStyle: 'bold',
  });

  const targetTelemetryTitle = scene.add.text(660, 178, 'ОБЪЕКТ СЛЕЖЕНИЯ: НЕТ', {
    ...monoStyle,
    fontSize: '12px',
    color: '#facc15',
    fontStyle: 'bold',
  });

  const targetTelemetryText = scene.add.text(660, 198, '', {
    ...monoStyle,
    fontSize: '12px',
    color: '#cbd5e1',
    lineSpacing: 3,
  });

  const feedbackText = scene.add.text(660, 452, '', {
    ...monoStyle,
    fontSize: '11px',
    fontStyle: 'bold',
  });

  scene.add.text(
    660,
    472,
    '--- ПРИЗНАКИ И СНАБЖЕНИЕ ---\n' +
      '• [4] Скан сигнатуры (1 сек.)\n' +
      '• [5] Ракета (150 CR) | [6] Скан (75 CR)\n' +
      '• Ракета (-30 HP) | Бомбардировщик (-20 HP)\n',
    {
      ...monoStyle,
      fontSize: '11px',
      color: '#64748b',
      lineSpacing: 4,
    },
  );

  // 3. Баннер волны и стартовые подсказки
  const waveBannerText = scene.add.text(
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
      align: 'center',
    },
  );
  waveBannerText.setOrigin(0.5);
  waveBannerText.setAlpha(0);

  const notificationText = scene.add.text(
    GAME_CONFIG.radarX,
    GAME_CONFIG.radarY + 40,
    '',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#86efac',
      backgroundColor: '#031a0ce6',
      padding: { x: 14, y: 6 },
      fontStyle: 'bold',
      align: 'center',
    },
  );
  notificationText.setOrigin(0.5);
  notificationText.setAlpha(0);

  // 4. Кнопки решений и снабжения
  function createButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    color: number,
    onClick: () => void,
    fontSize = '12px',
  ): ButtonItem {
    const bg = scene.add.rectangle(x + w / 2, y + h / 2, w, h, color, 0.45);
    bg.setStrokeStyle(1, color, 0.9);
    bg.setInteractive({ useHandCursor: true });

    const text = scene.add.text(x + w / 2, y + h / 2, label, {
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

  const startY = 292;
  const btnW = 255;
  const btnH = 26;
  const gap = 6;

  const buttons = {
    friend: createButton(
      660,
      startY,
      btnW,
      btnH,
      '[1] СВОЙ БОРТ (ДРУГ)',
      GAME_CONFIG.colors.btnFriend,
      () => callbacks.onDecision('friend'),
    ),
    threat: createButton(
      660,
      startY + (btnH + gap),
      btnW,
      btnH,
      '[2] УГРОЗА (ПЕРЕХВАТ)',
      GAME_CONFIG.colors.btnThreat,
      () => callbacks.onDecision('threat'),
    ),
    ignore: createButton(
      660,
      startY + (btnH + gap) * 2,
      btnW,
      btnH,
      '[3] ЛОЖНАЯ ЦЕЛЬ',
      GAME_CONFIG.colors.btnIgnore,
      () => callbacks.onDecision('ignore'),
    ),
    scan: createButton(
      660,
      startY + (btnH + gap) * 3,
      btnW,
      btnH,
      '[4] СКАН СИГНАТУРЫ (1 сек.)',
      GAME_CONFIG.colors.btnScan,
      () => callbacks.onScan(),
    ),
    buyMissile: createButton(
      660,
      startY + (btnH + gap) * 4,
      132,
      btnH,
      `[5] +РАКЕТА (${GAME_CONFIG.interceptorCost} CR)`,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyMissile(),
      '10px',
    ),
    buyScan: createButton(
      660 + 132 + gap,
      startY + (btnH + gap) * 4,
      117,
      btnH,
      `[6] +СКАН (${GAME_CONFIG.scanCost} CR)`,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyScan(),
      '10px',
    ),
  };

  // 5. Отрисовка полосы здоровья
  const drawHealthBar = (baseHealth: number) => {
    const barX = 660;
    const barY = 90;
    const barW = 255;
    const barH = 10;

    hudGraphics.lineStyle(1, colors.hudBorder, 0.9);
    hudGraphics.strokeRect(barX, barY, barW, barH);

    hudGraphics.fillStyle(0x1e293b, 1);
    hudGraphics.fillRect(barX + 1, barY + 1, barW - 2, barH - 2);

    const healthFraction = Phaser.Math.Clamp(
      baseHealth / GAME_CONFIG.maxBaseHealth,
      0,
      1,
    );
    const fillW = (barW - 2) * healthFraction;

    let barColor = colors.healthGreen;
    if (baseHealth <= 30) {
      barColor = colors.healthRed;
    } else if (baseHealth <= 60) {
      barColor = colors.healthYellow;
    }

    hudGraphics.fillStyle(barColor, 0.95);
    hudGraphics.fillRect(barX + 1, barY + 1, fillW, barH - 2);

    healthText.setText(`ЦЕЛОСТНОСТЬ БАЗЫ: ${baseHealth}%`);
    healthText.setColor(
      baseHealth <= 30 ? '#ef4444' : baseHealth <= 60 ? '#facc15' : '#22c55e',
    );
  };

  // 6. Обновление счета и ресурсов
  const updateScoreBoard = (data: ScoreBoardData) => {
    const mult = calculateStreakMultiplier(data.streak).toFixed(1);
    scoreText.setText(`СЧЁТ: ${data.score.toString().padStart(4, '0')}`);
    creditsText.setText(`КРЕДИТЫ: ${data.credits} CR`);
    streakText.setText(`СЕРИЯ: ${data.streak} (x${mult})`);
    waveText.setText(`ВОЛНА: ${data.wave}`);
    highScoreText.setText(`РЕКОРД: ${data.highScore}`);

    const ammoBars = '|'.repeat(data.interceptors).padEnd(GAME_CONFIG.maxInterceptors, ' ');
    interceptorsText.setText(`РАКЕТЫ: [${ammoBars}] ${data.interceptors}/${GAME_CONFIG.maxInterceptors}`);
    interceptorsText.setColor(data.interceptors > 1 ? '#facc15' : '#ef4444');

    const scanStars = '*'.repeat(data.scansAvailable).padEnd(GAME_CONFIG.maxScansPerWave, ' ');
    scansText.setText(`СКАН:   [${scanStars}] ${data.scansAvailable}/${GAME_CONFIG.maxScansPerWave}`);
    scansText.setColor(data.scansAvailable > 0 ? '#38bdf8' : '#64748b');

    const canBuyMissile =
      data.interceptors < GAME_CONFIG.maxInterceptors &&
      data.credits >= GAME_CONFIG.interceptorCost;
    buttons.buyMissile.setEnabled(canBuyMissile);

    const canBuyScan =
      data.scansAvailable < GAME_CONFIG.maxScansPerWave &&
      data.credits >= GAME_CONFIG.scanCost;
    buttons.buyScan.setEnabled(canBuyScan);
  };

  // 7. Обновление доступности кнопок по выбранной цели
  const updateTargetSelectionUI = (data: TargetSelectionData) => {
    const isSelected = data.selectedTarget !== null;

    buttons.friend.setEnabled(isSelected);
    buttons.threat.setEnabled(isSelected && data.interceptors > 0);
    buttons.ignore.setEnabled(isSelected);

    const canScan =
      isSelected &&
      !data.selectedTarget?.isScanned &&
      data.scansAvailable > 0 &&
      !data.isScanning;
    buttons.scan.setEnabled(canScan);

    if (!isSelected) {
      targetTelemetryTitle.setText('ОБЪЕКТ СЛЕЖЕНИЯ: НЕТ');
      targetTelemetryTitle.setColor('#94a3b8');
      targetTelemetryText.setText(
        'Кликните по вспыхнувшей\n' +
          'зелёной точке на радаре,\n' +
          'чтобы захватить объект\n' +
          'для классификации.',
      );
    }
  };

  // 8. Обновление телеметрии цели
  const updateTelemetry = (data: TelemetryData) => {
    if (!data.selectedTarget) return;

    const t = data.selectedTarget;
    const dist = Math.round(
      Math.hypot(t.x - GAME_CONFIG.radarX, t.y - GAME_CONFIG.radarY),
    );

    const markBadge =
      t.markedAs === 'friend'
        ? ' [СВОЙ]'
        : t.markedAs === 'ignore'
          ? ' [ПОМЕХА]'
          : '';
    targetTelemetryTitle.setText(`ОБЪЕКТ СЛЕЖЕНИЯ: #TRK-${t.id}${markBadge}`);
    targetTelemetryTitle.setColor(
      t.markedAs === 'friend'
        ? '#4ade80'
        : t.markedAs === 'ignore'
          ? '#94a3b8'
          : '#facc15',
    );

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
    } else if (data.isScanning && data.scanningTarget === t) {
      const pct = Math.min(
        100,
        Math.round((data.scanProgress / GAME_CONFIG.scanDuration) * 100),
      );
      typeStr = `АНАЛИЗ:     [${'#'.repeat(Math.floor(pct / 10))}${'.'.repeat(10 - Math.floor(pct / 10))}] ${pct}%`;
    }

    targetTelemetryText.setText(
      `${typeStr}\n` +
        `СКОРОСТЬ:   ${t.speed} км/ч\n` +
        `КУРС:       ${t.headingDeg}°\n` +
        `СИГНАЛ ЭПР: ${t.signal}%\n` +
        `ДИСТАНЦИЯ:  ${dist} км`,
    );
  };

  // 9. Фидбек и таймеры
  let feedbackTimer = 0;
  const showFeedback = (text: string, color: string) => {
    feedbackText.setText(text);
    feedbackText.setColor(color);
    feedbackTimer = 2.8;
  };

  const updateFeedback = (dt: number) => {
    if (feedbackTimer > 0) {
      feedbackTimer -= dt;
      if (feedbackTimer <= 0) {
        feedbackText.setText('');
      }
    }
  };

  let waveBannerTimer = 0;
  const showWaveBanner = (text: string) => {
    waveBannerText.setText(text);
    waveBannerText.setAlpha(1);
    waveBannerTimer = 2.4;
  };

  const updateWaveBanner = (dt: number) => {
    if (waveBannerTimer > 0) {
      waveBannerTimer -= dt;
      if (waveBannerTimer <= 0.5) {
        waveBannerText.setAlpha(Math.max(0, waveBannerTimer / 0.5));
      }
    }
  };

  let notificationTimer = 0;
  const showNotification = (text: string, duration = 4.5) => {
    notificationText.setText(text);
    notificationText.setAlpha(1);
    notificationTimer = duration;
  };

  const updateNotification = (dt: number) => {
    if (notificationTimer > 0) {
      notificationTimer -= dt;
      if (notificationTimer <= 0.8) {
        notificationText.setAlpha(Math.max(0, notificationTimer / 0.8));
      }
    }
  };

  return {
    drawHealthBar,
    updateScoreBoard,
    updateTargetSelectionUI,
    updateTelemetry,
    showFeedback,
    updateFeedback,
    showWaveBanner,
    updateWaveBanner,
    showNotification,
    updateNotification,
  };
}

