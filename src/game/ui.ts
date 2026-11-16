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
    GAME_CONFIG.colors.modal.overlay,
    0.88,
  );
  darkBg.setInteractive();

  // Рамка модального окна
  const cx = width / 2;
  const cy = height / 2;
  const boxW = 680;
  const boxH = 490;
  const halfW = boxW / 2;
  const halfH = boxH / 2;

  // Стилизованное окно военного терминала тревоги
  const modalGraphics = scene.add.graphics();

  // Тёмный тактический фон с высокой непрозрачностью
  modalGraphics.fillStyle(GAME_CONFIG.colors.modal.bgDark, 0.97);
  modalGraphics.fillRoundedRect(cx - halfW, cy - halfH, boxW, boxH, 6);

  // Контур терминала (красная тревожная рамка)
  modalGraphics.lineStyle(1.5, GAME_CONFIG.colors.modal.borderAlert, 0.85);
  modalGraphics.strokeRoundedRect(cx - halfW, cy - halfH, boxW, boxH, 6);

  // Верхняя сигнальная полоса тревоги
  modalGraphics.lineStyle(3, GAME_CONFIG.colors.modal.borderAlert, 1);
  modalGraphics.beginPath();
  modalGraphics.moveTo(cx - halfW + 20, cy - halfH);
  modalGraphics.lineTo(cx + halfW - 20, cy - halfH);
  modalGraphics.strokePath();

  // Тактические угловые скобки (Corner Reticles)
  const corner = 14;
  modalGraphics.lineStyle(2.5, GAME_CONFIG.colors.modal.borderAlertCorner, 0.95);
  modalGraphics.beginPath();
  // Top-left
  modalGraphics.moveTo(cx - halfW, cy - halfH + corner);
  modalGraphics.lineTo(cx - halfW, cy - halfH);
  modalGraphics.lineTo(cx - halfW + corner, cy - halfH);
  // Top-right
  modalGraphics.moveTo(cx + halfW - corner, cy - halfH);
  modalGraphics.lineTo(cx + halfW, cy - halfH);
  modalGraphics.lineTo(cx + halfW, cy - halfH + corner);
  // Bottom-left
  modalGraphics.moveTo(cx - halfW, cy + halfH - corner);
  modalGraphics.lineTo(cx - halfW, cy + halfH);
  modalGraphics.lineTo(cx - halfW + corner, cy + halfH);
  // Bottom-right
  modalGraphics.moveTo(cx + halfW - corner, cy + halfH);
  modalGraphics.lineTo(cx + halfW, cy + halfH);
  modalGraphics.lineTo(cx + halfW, cy + halfH - corner);
  modalGraphics.strokePath();

  // Разделительные линии разделов сводки
  modalGraphics.lineStyle(1, GAME_CONFIG.colors.modal.borderAlertSubtle, 0.55);
  modalGraphics.beginPath();
  // Разделитель 1: под заголовком
  modalGraphics.moveTo(cx - halfW + 36, cy - 135);
  modalGraphics.lineTo(cx + halfW - 36, cy - 135);
  // Разделитель 2: перед оперативной сводкой
  modalGraphics.moveTo(cx - halfW + 36, cy - 16);
  modalGraphics.lineTo(cx + halfW - 36, cy - 16);
  // Разделитель 3: перед кнопкой перезапуска
  modalGraphics.moveTo(cx - halfW + 36, cy + 128);
  modalGraphics.lineTo(cx + halfW - 36, cy + 128);
  modalGraphics.strokePath();

  // Базовый стиль шрифта для модального окна поражения
  const modalTextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  };

  // Тактические маркеры в углах окна
  const tagText = scene.add.text(
    cx - halfW + 24,
    cy - halfH + 16,
    '[ ТРЕВОГА ]',
    {
      ...modalTextStyle,
      fontSize: '11px',
      color: '#f87171',
      fontStyle: 'bold',
    },
  );

  const codeText = scene.add.text(
    cx + halfW - 24,
    cy - halfH + 16,
    'КОД: 0xDEFEAT',
    {
      ...modalTextStyle,
      fontSize: '11px',
      color: '#7f1d1d',
      fontStyle: 'bold',
    },
  ).setOrigin(1, 0);

  const title = scene.add.text(
    cx,
    cy - 180,
    'СИСТЕМА ОБОРОНЫ ПРОРВАНА\n[ БАЗА УНИЧТОЖЕНА ]',
    {
      ...modalTextStyle,
      fontSize: '22px',
      color: '#ef4444',
      fontStyle: 'bold',
      align: 'center',
      lineSpacing: 6,
    },
  ).setOrigin(0.5);

  const scoreText = scene.add.text(
    cx,
    cy - 105,
    'ИТОГОВЫЙ СЧЁТ: 0',
    {
      ...modalTextStyle,
      fontSize: '22px',
      color: '#facc15',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);

  const recordText = scene.add.text(
    cx,
    cy - 72,
    'ЛУЧШИЙ РЕКОРД: 0',
    {
      ...modalTextStyle,
      fontSize: '15px',
      color: '#86efac',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);

  const wavesText = scene.add.text(
    cx,
    cy - 44,
    'ПРОЙДЕНО ВОЛН: 1  |  МАКС. СЕРИЯ: 0',
    {
      ...modalTextStyle,
      fontSize: '14px',
      color: '#94a3b8',
    },
  ).setOrigin(0.5);

  const statsHeader = scene.add.text(
    cx,
    cy + 6,
    '// ИТОГОВАЯ БОЕВАЯ СВОДКА ДЕЖУРСТВА //',
    {
      ...modalTextStyle,
      fontSize: '11px',
      color: '#64748b',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);

  const statsText = scene.add.text(
    cx,
    cy + 64,
    '',
    {
      ...modalTextStyle,
      fontSize: '13px',
      color: '#cbd5e1',
      align: 'center',
      lineSpacing: 9,
    },
  ).setOrigin(0.5);

  // Кнопка рестарта
  const restartBtn = scene.add.rectangle(
    cx,
    cy + 185,
    300,
    46,
    GAME_CONFIG.colors.modal.btnRestartBg,
    0.92,
  );
  restartBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnRestartBorder, 1);
  restartBtn.setInteractive({ useHandCursor: true });

  const restartText = scene.add.text(
    cx,
    cy + 185,
    'НАЧАТЬ ЗАНОВО (ПРОБЕЛ / R)',
    {
      ...modalTextStyle,
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);

  restartBtn.on('pointerover', () => restartBtn.setFillStyle(GAME_CONFIG.colors.modal.btnRestartHover, 1));
  restartBtn.on('pointerout', () => restartBtn.setFillStyle(GAME_CONFIG.colors.modal.btnRestartBg, 0.92));
  restartBtn.on('pointerdown', () => onRestart());

  container.add([
    darkBg,
    modalGraphics,
    tagText,
    codeText,
    title,
    scoreText,
    recordText,
    wavesText,
    statsHeader,
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
      wavesText.setText(`ПРОЙДЕНО ВОЛН: ${wave}  |  МАКС. СЕРИЯ: ${bestStreak}`);

      const acc = stats.totalDecisions > 0
        ? Math.round((stats.correctDecisions / stats.totalDecisions) * 100)
        : 100;
      const mins = Math.floor(stats.sessionTime / 60);
      const secs = Math.floor(stats.sessionTime % 60);
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      statsText.setText(
        `УНИЧТОЖЕНО: ${stats.missilesShot} РАКЕТ  |  ${stats.bombersShot} БОМБАРДИРОВЩИКОВ  |  ${stats.friendlyFireCount} СВОИХ\n` +
        `${stats.friendsSaved} СВОИХ СПАСЕНО  |  ${stats.decoysFiltered} ЛОВУШЕК ОТФИЛЬТРОВАНО  |  ${stats.threatsMissed} УГРОЗ ПРОПУЩЕНО\n` +
        `ЭФФЕКТИВНОСТЬ: ${acc}% ТОЧНОСТЬ  |  ВРЕМЯ ДЕЖУРСТВА: ${timeStr}`,
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
    GAME_CONFIG.colors.modal.overlay,
    0.82,
  );
  darkBg.setInteractive();

  // Рамка окна паузы
  const modal = scene.add.rectangle(
    width / 2,
    height / 2,
    400,
    270,
    GAME_CONFIG.colors.modal.bgTerminal,
    0.96,
  );
  modal.setStrokeStyle(2, GAME_CONFIG.colors.modal.borderInfo, 0.9);

  const pauseTextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  };

  const title = scene.add.text(
    width / 2,
    height / 2 - 85,
    '// ТАКТИЧЕСКАЯ ПАУЗА //',
    {
      ...pauseTextStyle,
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
    GAME_CONFIG.colors.modal.btnResumeBg,
    0.9,
  );
  resumeBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnResumeBorder, 1);
  resumeBtn.setInteractive({ useHandCursor: true });

  const resumeText = scene.add.text(
    width / 2,
    height / 2 - 28,
    'ПРОДОЛЖИТЬ (P)',
    {
      ...pauseTextStyle,
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    },
  );
  resumeText.setOrigin(0.5);

  resumeBtn.on('pointerover', () => resumeBtn.setFillStyle(GAME_CONFIG.colors.modal.btnResumeHover, 1));
  resumeBtn.on('pointerout', () => resumeBtn.setFillStyle(GAME_CONFIG.colors.modal.btnResumeBg, 0.9));
  resumeBtn.on('pointerdown', () => cbs.onResume());

  // 2. Кнопка инструктажа
  const briefingBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 18,
    260,
    36,
    GAME_CONFIG.colors.modal.btnBriefingBg,
    0.9,
  );
  briefingBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnBriefingBorder, 0.9);
  briefingBtn.setInteractive({ useHandCursor: true });

  const briefingText = scene.add.text(
    width / 2,
    height / 2 + 18,
    'ИНСТРУКТАЖ / СПРАВКА',
    {
      ...pauseTextStyle,
      fontSize: '13px',
      color: '#86efac',
      fontStyle: 'bold',
    },
  );
  briefingText.setOrigin(0.5);

  briefingBtn.on('pointerover', () => briefingBtn.setFillStyle(GAME_CONFIG.colors.modal.btnBriefingHover, 1));
  briefingBtn.on('pointerout', () => briefingBtn.setFillStyle(GAME_CONFIG.colors.modal.btnBriefingBg, 0.9));
  briefingBtn.on('pointerdown', () => cbs.onOpenBriefing?.());

  // 3. Кнопка перезапуска игры
  const restartBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 64,
    260,
    36,
    GAME_CONFIG.colors.modal.btnDangerBg,
    0.9,
  );
  restartBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnDangerBorder, 0.9);
  restartBtn.setInteractive({ useHandCursor: true });

  const restartText = scene.add.text(
    width / 2,
    height / 2 + 64,
    'НАЧАТЬ ЗАНОВО (R)',
    {
      ...pauseTextStyle,
      fontSize: '13px',
      color: '#fca5a5',
      fontStyle: 'bold',
    },
  );
  restartText.setOrigin(0.5);

  restartBtn.on('pointerover', () => restartBtn.setFillStyle(GAME_CONFIG.colors.modal.btnDangerHover, 1));
  restartBtn.on('pointerout', () => restartBtn.setFillStyle(GAME_CONFIG.colors.modal.btnDangerBg, 0.9));
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
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const halfW = 320;
  const halfH = 255;
  const modalW = halfW * 2;
  const modalH = halfH * 2;

  const container = scene.add.container(0, 0);
  container.setDepth(110);
  container.setVisible(false);

  // Полупрозрачный фон-затемнение
  const darkBg = scene.add.rectangle(cx, cy, width, height, GAME_CONFIG.colors.modal.overlay, 0.92);
  darkBg.setInteractive();

  // Графика модального терминального окна с тактическими уголками
  const modalGraphics = scene.add.graphics();
  modalGraphics.fillStyle(GAME_CONFIG.colors.modal.bgTerminal, 0.98);
  modalGraphics.fillRect(cx - halfW, cy - halfH, modalW, modalH);

  // Основной контур окна
  modalGraphics.lineStyle(1.5, GAME_CONFIG.colors.modal.borderSuccess, 0.85);
  modalGraphics.strokeRect(cx - halfW, cy - halfH, modalW, modalH);

  // Тактические угловые скобки (Corner Reticles)
  const corner = 16;
  modalGraphics.lineStyle(2.5, GAME_CONFIG.colors.modal.borderSuccess, 1);
  modalGraphics.beginPath();
  // Top-left
  modalGraphics.moveTo(cx - halfW, cy - halfH + corner);
  modalGraphics.lineTo(cx - halfW, cy - halfH);
  modalGraphics.lineTo(cx - halfW + corner, cy - halfH);
  // Top-right
  modalGraphics.moveTo(cx + halfW - corner, cy - halfH);
  modalGraphics.lineTo(cx + halfW, cy - halfH);
  modalGraphics.lineTo(cx + halfW, cy - halfH + corner);
  // Bottom-left
  modalGraphics.moveTo(cx - halfW, cy + halfH - corner);
  modalGraphics.lineTo(cx - halfW, cy + halfH);
  modalGraphics.lineTo(cx - halfW + corner, cy + halfH);
  // Bottom-right
  modalGraphics.moveTo(cx + halfW - corner, cy + halfH);
  modalGraphics.lineTo(cx + halfW, cy + halfH);
  modalGraphics.lineTo(cx + halfW, cy + halfH - corner);
  modalGraphics.strokePath();

  // Разделительная линия под заголовком
  modalGraphics.lineStyle(1, GAME_CONFIG.colors.modal.dividerGreen, 0.9);
  modalGraphics.beginPath();
  modalGraphics.moveTo(cx - halfW + 30, cy - 186);
  modalGraphics.lineTo(cx + halfW - 30, cy - 186);
  modalGraphics.strokePath();

  const briefingTextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  };

  const title = scene.add.text(
    cx,
    cy - 210,
    '[ БОЕВОЙ ИНСТРУКТАЖ: СЕКТОР «РУБЕЖ» ]',
    {
      ...briefingTextStyle,
      fontSize: '18px',
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

  const addRow = (x: number, y: number, segments: TextSegment[], fontSize = '13px') => {
    let curX = Math.round(x);
    const roundedY = Math.round(y);
    for (const seg of segments) {
      const txt = scene.add.text(curX, roundedY, seg.text, {
        ...briefingTextStyle,
        fontSize,
        color: seg.color,
        fontStyle: seg.bold ? 'bold' : 'normal',
      });
      contentObjects.push(txt);
      curX = Math.round(curX + txt.width);
    }
  };

  const startX = cx - halfW + 30; // 190px при cx = 480

  // 1. Угрозы (красный акцент)
  addRow(startX, cy - 156, [
    { text: '• УГРОЗЫ: ', color: '#ef4444', bold: true },
    { text: 'Крылатые ракеты (прямой курс / доворот) и бомбардировщики.', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 132, [
    { text: '  ДЕЙСТВИЕ: ', color: '#94a3b8' },
    { text: 'УНИЧТОЖИТЬ [2]', color: '#f87171', bold: true },
    { text: ' (требует ракеты-перехватчики)', color: '#94a3b8' },
  ]);

  // 2. Союзники (зелёный акцент)
  addRow(startX, cy - 102, [
    { text: '• СОЮЗНИКИ: ', color: '#4ade80', bold: true },
    { text: 'Зелёные метки и юниты с сильным сигналом — свои борта.', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 78, [
    { text: '  ДЕЙСТВИЕ: ПОМЕТКА ', color: '#94a3b8' },
    { text: 'ПРОПУСТИТЬ [1]', color: '#4ade80', bold: true },
    { text: ' (огонь по своим карается ', color: '#94a3b8' },
    { text: `ШТРАФОМ ${GAME_CONFIG.creditsFriendlyFirePenalty} CR`, color: '#f87171', bold: true },
    { text: '!)', color: '#94a3b8' },
  ]);

  // 3. Ловушки (серый/нейтральный акцент)
  addRow(startX, cy - 48, [
    { text: '• ЛОВУШКИ: ', color: '#94a3b8', bold: true },
    { text: 'Имитаторы копируют поведение других юнитов (урон не наносят).', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 24, [
    { text: '  ДЕЙСТВИЕ: ПОМЕТКА ', color: '#94a3b8' },
    { text: 'ЛОЖНАЯ ЦЕЛЬ [3]', color: '#cbd5e1', bold: true },
    { text: ' (не упускайте пустышки)', color: '#94a3b8' },
  ]);

  // 4. Сенсоры и снабжение (голубой / бирюзовый акцент)
  addRow(startX, cy + 6, [
    { text: '• СЕНСОРЫ: ', color: '#38bdf8', bold: true },
    { text: 'Клавиша ', color: '#e2e8f0' },
    { text: '[4] СКАН', color: '#38bdf8', bold: true },
    { text: ` раскрывает тип цели за ${GAME_CONFIG.scanDuration} с (расходует заряд).`, color: '#e2e8f0' },
  ]);
  addRow(startX, cy + 34, [
    { text: '• СНАБЖЕНИЕ: ', color: '#2dd4bf', bold: true },
    { text: 'Докупка ракет ', color: '#e2e8f0' },
    { text: '[5]', color: '#facc15', bold: true },
    { text: ` (${GAME_CONFIG.interceptorCost} CR)   |   Докупка сканов `, color: '#e2e8f0' },
    { text: '[6]', color: '#facc15', bold: true },
    { text: ` (${GAME_CONFIG.scanCost} CR)`, color: '#e2e8f0' },
  ]);

  // 5. Панель быстрого управления (жёлтый акцент)
  const cmdPanel = scene.add.rectangle(cx, cy + 96, 580, 36, GAME_CONFIG.colors.modal.panelDark, 0.95);
  cmdPanel.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.panelBorderGold, 0.75);
  contentObjects.push(cmdPanel);

  const cmdText = scene.add.text(
    cx,
    cy + 96,
    'УПРАВЛЕНИЕ (КЛАВИАТУРА): [1] СВОЙ  [2] УГРОЗА  [3] ЛОЖНАЯ ЦЕЛЬ  [4] СКАН  [P] ПАУЗА',
    {
      ...briefingTextStyle,
      fontSize: '11.5px',
      color: '#facc15',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);
  contentObjects.push(cmdText);

  // Кнопка действия
  const actionBtn = scene.add.rectangle(
    cx,
    cy + 186,
    340,
    44,
    GAME_CONFIG.colors.modal.btnRestartBg,
    0.95,
  );
  actionBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnRestartBorder, 1);
  actionBtn.setInteractive({ useHandCursor: true });

  const actionText = scene.add.text(cx, cy + 186, 'ЗАСТУПИТЬ НА СМЕНУ (ПРОБЕЛ)', {
    ...briefingTextStyle,
    fontSize: '14px',
    color: '#ffffff',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  actionBtn.on('pointerover', () => actionBtn.setFillStyle(GAME_CONFIG.colors.modal.btnRestartHover, 1));
  actionBtn.on('pointerout', () => actionBtn.setFillStyle(GAME_CONFIG.colors.modal.btnRestartBg, 0.95));
  actionBtn.on('pointerdown', () => onClose());

  container.add([
    darkBg,
    modalGraphics,
    title,
    ...contentObjects,
    actionBtn,
    actionText,
  ]);

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
 * Процедурная генерация векторных тактических текстур (иконки ракеты и сканера)
 */
function ensureHudTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('icon_hud_missile')) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    // Боевая ракета: обтекатель и оперение
    g.fillStyle(0xfacc15, 1);
    g.beginPath();
    g.moveTo(11, 2);
    g.lineTo(14, 7);
    g.lineTo(14, 15);
    g.lineTo(18, 18);
    g.lineTo(14, 17);
    g.lineTo(13, 19);
    g.lineTo(9, 19);
    g.lineTo(8, 17);
    g.lineTo(4, 18);
    g.lineTo(8, 15);
    g.lineTo(8, 7);
    g.closePath();
    g.fillPath();

    // Яркий контур
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokePath();

    // Сопловое микро-пламя
    g.fillStyle(0x38bdf8, 0.95);
    g.fillRect(10, 19, 2, 2);

    g.generateTexture('icon_hud_missile', 22, 22);
    g.destroy();
  }

  if (!scene.textures.exists('icon_hud_scan')) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    // Радиоволновые дуги
    g.lineStyle(1.8, 0x38bdf8, 0.95);
    g.beginPath();
    g.arc(11, 15, 10, Phaser.Math.DegToRad(-145), Phaser.Math.DegToRad(-35), false);
    g.strokePath();

    g.lineStyle(1.5, 0x38bdf8, 0.65);
    g.beginPath();
    g.arc(11, 15, 6, Phaser.Math.DegToRad(-145), Phaser.Math.DegToRad(-35), false);
    g.strokePath();

    // Излучатель в центре
    g.fillStyle(0xd4ffea, 1);
    g.fillCircle(11, 15, 2.2);

    // Ножка антенны
    g.lineStyle(1.5, 0x38bdf8, 0.85);
    g.beginPath();
    g.moveTo(8, 20);
    g.lineTo(11, 16);
    g.lineTo(14, 20);
    g.strokePath();

    g.generateTexture('icon_hud_scan', 22, 22);
    g.destroy();
  }
}

/**
 * Фабрика консоли оператора и кнопок управления
 */
export function createHud(
  scene: Phaser.Scene,
  callbacks: HudCallbacks,
): HudManager {
  ensureHudTextures(scene);
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
  hudGraphics.moveTo(panelX + 16, 168);
  hudGraphics.lineTo(panelX + panelW - 16, 168);
  hudGraphics.moveTo(panelX + 16, 294);
  hudGraphics.lineTo(panelX + panelW - 16, 294);
  hudGraphics.moveTo(panelX + 16, 558);
  hudGraphics.lineTo(panelX + panelW - 16, 558);
  hudGraphics.strokePath();

  // Приборная подложка блока боезапаса и сенсоров под кнопками взаимодействия
  const ammoCardX = panelX + 16;
  const ammoCardY = 498;
  const ammoCardW = panelW - 32;
  const ammoCardH = 48;
  const leftW = Math.floor(ammoCardW / 2);
  const rightW = ammoCardW - leftW;

  hudGraphics.fillStyle(0x061910, 0.75);
  hudGraphics.fillRoundedRect(ammoCardX, ammoCardY, ammoCardW, ammoCardH, 4);
  hudGraphics.lineStyle(1, colors.hudBorder, 0.7);
  hudGraphics.strokeRoundedRect(ammoCardX, ammoCardY, ammoCardW, ammoCardH, 4);
  // Вертикальный внутренний разделитель между ракетами и сканами
  hudGraphics.lineStyle(1, colors.hudBorder, 0.5);
  hudGraphics.beginPath();
  hudGraphics.moveTo(ammoCardX + leftW, ammoCardY + 4);
  hudGraphics.lineTo(ammoCardX + leftW, ammoCardY + ammoCardH - 4);
  hudGraphics.strokePath();

  // Световые контуры подсветки половинок блока при расходе/пополнении ресурсов
  const missileHighlight = scene.add.graphics();
  missileHighlight.setAlpha(0);

  const scanHighlight = scene.add.graphics();
  scanHighlight.setAlpha(0);

  let missileTween: Phaser.Tweens.TweenChain | Phaser.Tweens.Tween | null = null;
  let scanTween: Phaser.Tweens.TweenChain | Phaser.Tweens.Tween | null = null;

  // Параметры тактических оповещений о дефиците ресурсов
  const MISSILE_ALERT_EMPTY_INTERVAL = 0.95; // Частое настойчивое мигание при 0 ракет
  const MISSILE_ALERT_LOW_INTERVAL = 1.7;    // Предупреждающее подмигивание при <=2 ракет (почаще)
  const SCAN_ALERT_EMPTY_INTERVAL = 1.5;     // Сокращённый интервал подмигивания при 0 сканов
  const SCAN_ALERT_LOW_INTERVAL = 2.6;       // Предупреждающее напоминание о последнем скане (почаще)

  let currentInterceptors = GAME_CONFIG.startInterceptors;
  let currentScans = GAME_CONFIG.maxScansPerWave;
  let missileAlertTimer = 0;
  let scanAlertTimer = 0;

  const flashMissileBorder = (isGain: boolean) => {
    if (missileTween) missileTween.stop();
    missileAlertTimer = 0;
    const glowColor = isGain ? 0x22c55e : 0xef4444;
    const coreColor = isGain ? 0x86efac : 0xfca5a5;
    missileHighlight.clear();

    // 1. Сочная неоновая подсветка ячейки
    missileHighlight.fillStyle(glowColor, 0.22);
    missileHighlight.fillRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
      tl: 4,
      tr: 0,
      bl: 4,
      br: 0,
    });

    // 2. Внешний мягкий ореол свечения (Bloom)
    missileHighlight.lineStyle(3.5, glowColor, 0.55);
    missileHighlight.strokeRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
      tl: 4,
      tr: 0,
      bl: 4,
      br: 0,
    });

    // 3. Чёткая яркая сердцевина контура (Core)
    missileHighlight.lineStyle(2, coreColor, 1.0);
    missileHighlight.strokeRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
      tl: 4,
      tr: 0,
      bl: 4,
      br: 0,
    });

    missileHighlight.setAlpha(1);

    // Тактическое «подмигивание» (strobe-blink): яркая вспышка -> просадка -> повторный импульс -> спад
    missileTween = scene.tweens.chain({
      targets: missileHighlight,
      tweens: [
        { alpha: 0.35, duration: 80, ease: 'Linear' },
        { alpha: 1.0, duration: 80, ease: 'Linear' },
        { alpha: 0, duration: 320, ease: 'Quad.easeOut' },
      ],
    });
  };

  const flashScanBorder = (isGain: boolean) => {
    if (scanTween) scanTween.stop();
    scanAlertTimer = 0;
    const glowColor = isGain ? 0x0284c7 : 0xef4444;
    const coreColor = isGain ? 0x7dd3fc : 0xfca5a5;
    scanHighlight.clear();

    // 1. Сочная неоновая подсветка ячейки
    scanHighlight.fillStyle(glowColor, 0.22);
    scanHighlight.fillRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
      tl: 0,
      tr: 4,
      bl: 0,
      br: 4,
    });

    // 2. Внешний мягкий ореол свечения (Bloom)
    scanHighlight.lineStyle(3.5, glowColor, 0.55);
    scanHighlight.strokeRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
      tl: 0,
      tr: 4,
      bl: 0,
      br: 4,
    });

    // 3. Чёткая яркая сердцевина контура (Core)
    scanHighlight.lineStyle(2, coreColor, 1.0);
    scanHighlight.strokeRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
      tl: 0,
      tr: 4,
      bl: 0,
      br: 4,
    });

    scanHighlight.setAlpha(1);

    // Тактическое «подмигивание» (strobe-blink): яркая вспышка -> просадка -> повторный импульс -> спад
    scanTween = scene.tweens.chain({
      targets: scanHighlight,
      tweens: [
        { alpha: 0.35, duration: 80, ease: 'Linear' },
        { alpha: 1.0, duration: 80, ease: 'Linear' },
        { alpha: 0, duration: 320, ease: 'Quad.easeOut' },
      ],
    });
  };

  // Автоматические сигналы предупреждения при критическом остатке ресурсов
  const pulseMissileAlert = (level: 'low' | 'empty') => {
    if (missileTween) missileTween.stop();

    if (level === 'empty') {
      // Настойчивое аварийное мигание: яркий двойной строб тревоги
      const glowColor = 0xef4444;
      const coreColor = 0xfca5a5;
      missileHighlight.clear();
      missileHighlight.fillStyle(glowColor, 0.24);
      missileHighlight.fillRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
        tl: 4,
        tr: 0,
        bl: 4,
        br: 0,
      });
      missileHighlight.lineStyle(3.5, glowColor, 0.6);
      missileHighlight.strokeRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
        tl: 4,
        tr: 0,
        bl: 4,
        br: 0,
      });
      missileHighlight.lineStyle(2, coreColor, 1.0);
      missileHighlight.strokeRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
        tl: 4,
        tr: 0,
        bl: 4,
        br: 0,
      });
      missileHighlight.setAlpha(1);

      missileTween = scene.tweens.chain({
        targets: missileHighlight,
        tweens: [
          { alpha: 0.2, duration: 80, ease: 'Linear' },
          { alpha: 0.95, duration: 80, ease: 'Linear' },
          { alpha: 0, duration: 260, ease: 'Quad.easeOut' },
        ],
      });
    } else {
      // Предупреждающее мягкое подмигивание (осталось <=2 ракет)
      const glowColor = 0xef4444;
      const coreColor = 0xf87171;
      missileHighlight.clear();
      missileHighlight.fillStyle(glowColor, 0.14);
      missileHighlight.fillRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
        tl: 4,
        tr: 0,
        bl: 4,
        br: 0,
      });
      missileHighlight.lineStyle(2, coreColor, 0.9);
      missileHighlight.strokeRoundedRect(ammoCardX, ammoCardY, leftW, ammoCardH, {
        tl: 4,
        tr: 0,
        bl: 4,
        br: 0,
      });
      missileHighlight.setAlpha(1);

      missileTween = scene.tweens.add({
        targets: missileHighlight,
        alpha: 0,
        duration: 450,
        ease: 'Quad.easeOut',
      });
    }
  };

  const pulseScanAlert = (level: 'low' | 'empty') => {
    if (scanTween) scanTween.stop();

    if (level === 'empty') {
      // Сокращённое и более заметное подмигивание об отсутствии сканов (тёплый янтарный оттенок)
      const glowColor = 0xf97316;
      const coreColor = 0xfdba74;
      scanHighlight.clear();
      scanHighlight.fillStyle(glowColor, 0.18);
      scanHighlight.fillRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
        tl: 0,
        tr: 4,
        bl: 0,
        br: 4,
      });
      scanHighlight.lineStyle(2.5, glowColor, 0.5);
      scanHighlight.strokeRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
        tl: 0,
        tr: 4,
        bl: 0,
        br: 4,
      });
      scanHighlight.lineStyle(1.8, coreColor, 0.95);
      scanHighlight.strokeRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
        tl: 0,
        tr: 4,
        bl: 0,
        br: 4,
      });
      scanHighlight.setAlpha(1);

      scanTween = scene.tweens.add({
        targets: scanHighlight,
        alpha: 0,
        duration: 450,
        ease: 'Quad.easeOut',
      });
    } else {
      // Деликатное напоминание о последнем заряде сканера
      const glowColor = 0x38bdf8;
      const coreColor = 0x7dd3fc;
      scanHighlight.clear();
      scanHighlight.fillStyle(glowColor, 0.12);
      scanHighlight.fillRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
        tl: 0,
        tr: 4,
        bl: 0,
        br: 4,
      });
      scanHighlight.lineStyle(1.8, coreColor, 0.85);
      scanHighlight.strokeRoundedRect(ammoCardX + leftW, ammoCardY, rightW, ammoCardH, {
        tl: 0,
        tr: 4,
        bl: 0,
        br: 4,
      });
      scanHighlight.setAlpha(1);

      scanTween = scene.tweens.add({
        targets: scanHighlight,
        alpha: 0,
        duration: 420,
        ease: 'Quad.easeOut',
      });
    }
  };

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
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: '13px',
      color: '#38bdf8',
      fontStyle: 'bold',
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
      resolution: GAME_CONFIG.textResolution,
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
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: '13px',
    color: '#4ade80',
    fontStyle: 'bold',
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  };

  const healthText = scene.add.text(656, 46, `ЦЕЛОСТНОСТЬ БАЗЫ: ${GAME_CONFIG.maxBaseHealth}%`, {
    ...monoStyle,
    fontSize: '13px',
    color: '#22c55e',
    fontStyle: 'bold',
  });

  const scoreText = scene.add.text(656, 98, 'СЧЁТ: 0000', {
    ...monoStyle,
    fontSize: '15px',
    color: '#facc15',
    fontStyle: 'bold',
  });

  const highScoreText = scene.add.text(788, 98, 'РЕКОРД: 0', {
    ...monoStyle,
    fontSize: '13px',
    color: '#cbd5e1',
    fontStyle: 'bold',
  });

  const creditsText = scene.add.text(656, 118, `КРЕДИТЫ: ${GAME_CONFIG.startCredits} CR`, {
    ...monoStyle,
    fontSize: '13px',
    color: '#38bdf8',
    fontStyle: 'bold',
  });

  const waveText = scene.add.text(788, 118, 'ВОЛНА: 1', {
    ...monoStyle,
    fontSize: '13px',
    color: '#38bdf8',
    fontStyle: 'bold',
  });

  const streakText = scene.add.text(656, 138, 'СЕРИЯ: 0 (x1.0)', {
    ...monoStyle,
    fontSize: '13px',
    color: '#86efac',
    fontStyle: 'bold',
  });

  const targetTelemetryTitle = scene.add.text(656, 175, 'ОБЪЕКТ СЛЕЖЕНИЯ: НЕТ', {
    ...monoStyle,
    fontSize: '13px',
    color: '#facc15',
    fontStyle: 'bold',
  });

  const targetTelemetryType = scene.add.text(656, 193, '', {
    ...monoStyle,
    fontSize: '13px',
    color: '#94a3b8',
    fontStyle: 'bold',
  });

  const targetTelemetryText = scene.add.text(656, 195, '', {
    ...monoStyle,
    fontSize: '13px',
    color: '#cbd5e1',
    fontStyle: 'bold',
    lineSpacing: 4,
  });

  const feedbackText = scene.add.text(656, 570, '', {
    ...monoStyle,
    fontSize: '12px',
    fontStyle: 'bold',
    wordWrap: { width: 263 },
  });

  // 3. Баннер волны и стартовые подсказки
  const waveContainer = scene.add.container(GAME_CONFIG.radarX, GAME_CONFIG.radarY - 35);
  waveContainer.setDepth(30);
  waveContainer.setAlpha(0);
  waveContainer.setVisible(false);

  const bgBox = scene.add.graphics();

  const titleText = scene.add.text(0, -20, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '28px',
    color: '#ffffff',
    fontStyle: 'bold',
    resolution: GAME_CONFIG.textResolution,
  }).setOrigin(0.5);

  const subtitleText = scene.add.text(0, 30, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '16px',
    color: '#86efac',
    fontStyle: 'bold',
    resolution: GAME_CONFIG.textResolution,
  }).setOrigin(0.5);

  const bonusText = scene.add.text(0, 46, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '16px',
    color: '#facc15',
    fontStyle: 'bold',
    resolution: GAME_CONFIG.textResolution,
  }).setOrigin(0.5);

  waveContainer.add([bgBox, titleText, subtitleText, bonusText]);

  const notificationText = scene.add.text(
    GAME_CONFIG.radarX,
    GAME_CONFIG.radarY + 58,
    '',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#86efac',
      backgroundColor: '#031a0ce6',
      padding: { x: 16, y: 7 },
      fontStyle: 'bold',
      align: 'center',
      resolution: GAME_CONFIG.textResolution,
    },
  );
  notificationText.setOrigin(0.5);
  notificationText.setDepth(30);
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
    fontSize = '13px',
  ): ButtonItem {
    const bg = scene.add.rectangle(x + w / 2, y + h / 2, w, h, color, 0.45);
    bg.setStrokeStyle(1, color, 0.9);
    bg.setInteractive({ useHandCursor: true });

    const text = scene.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize,
      color: '#f8fafc',
      fontStyle: 'bold',
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
      resolution: GAME_CONFIG.textResolution,
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

  const startY = 306;
  const btnX = panelX + 16;
  const btnW = panelW - 32;
  const btnH = 30;
  const gap = 7;

  const buttons = {
    friend: createButton(
      btnX,
      startY,
      btnW,
      btnH,
      '[1] СВОЙ БОРТ (ДРУГ)',
      GAME_CONFIG.colors.btnFriend,
      () => callbacks.onDecision('friend'),
    ),
    threat: createButton(
      btnX,
      startY + (btnH + gap),
      btnW,
      btnH,
      '[2] УГРОЗА (ПЕРЕХВАТ)',
      GAME_CONFIG.colors.btnThreat,
      () => callbacks.onDecision('threat'),
    ),
    ignore: createButton(
      btnX,
      startY + (btnH + gap) * 2,
      btnW,
      btnH,
      '[3] ЛОЖНАЯ ЦЕЛЬ',
      GAME_CONFIG.colors.btnIgnore,
      () => callbacks.onDecision('ignore'),
    ),
    scan: createButton(
      btnX,
      startY + (btnH + gap) * 3,
      btnW,
      btnH,
      `[4] СКАН СИГНАТУРЫ (${GAME_CONFIG.scanDuration} сек.)`,
      GAME_CONFIG.colors.btnScan,
      () => callbacks.onScan(),
    ),
    buyMissile: createButton(
      btnX,
      startY + (btnH + gap) * 4,
      135,
      btnH,
      `[5] +РАКЕТА (${GAME_CONFIG.interceptorCost} CR)`,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyMissile(),
      '11px',
    ),
    buyScan: createButton(
      btnX + 135 + 8,
      startY + (btnH + gap) * 4,
      120,
      btnH,
      `[6] +СКАН (${GAME_CONFIG.scanCost} CR)`,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyScan(),
      '11px',
    ),
  };

  // 4.5. Приборный блок наглядного отображения боезапаса и сканеров под кнопками взаимодействия
  // Левая секция: Ракеты-перехватчики
  const missileIcon = scene.add.image(ammoCardX + 18, ammoCardY + 24, 'icon_hud_missile');
  scene.add.text(ammoCardX + 36, ammoCardY + 8, 'БОЕКОМПЛЕКТ', {
    ...monoStyle,
    fontSize: '10px',
    color: '#94a3b8',
    fontStyle: 'bold',
  });
  const ammoCountText = scene.add.text(
    ammoCardX + 36,
    ammoCardY + 21,
    `${GAME_CONFIG.startInterceptors}/${GAME_CONFIG.maxInterceptors}`,
    {
      ...monoStyle,
      fontSize: '17px',
      color: '#facc15',
      fontStyle: 'bold',
    },
  );

  // Правая секция: Сканеры
  const scanColX = ammoCardX + leftW + 6;
  const scanIcon = scene.add.image(scanColX + 18, ammoCardY + 24, 'icon_hud_scan');
  scene.add.text(scanColX + 36, ammoCardY + 8, 'СКАНЕРЫ', {
    ...monoStyle,
    fontSize: '10px',
    color: '#94a3b8',
    fontStyle: 'bold',
  });
  const scanCountText = scene.add.text(
    scanColX + 36,
    ammoCardY + 21,
    `${GAME_CONFIG.maxScansPerWave}/${GAME_CONFIG.maxScansPerWave}`,
    {
      ...monoStyle,
      fontSize: '17px',
      color: '#38bdf8',
      fontStyle: 'bold',
    },
  );

  // 5. Отрисовка полосы здоровья
  const drawHealthBar = (baseHealth: number) => {
    const barX = panelX + 16;
    const barY = 72;
    const barW = panelW - 32;
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

  // Вспомогательная функция для всплывающей тактической анимации изменения боезапаса (+1, -1)
  const spawnDeltaText = (x: number, y: number, diff: number, gainColor = '#4ade80') => {
    const textStr = diff > 0 ? `+${diff}` : `${diff}`;
    const colorStr = diff > 0 ? gainColor : '#ef4444';
    const deltaText = scene.add.text(x, y, textStr, {
      ...monoStyle,
      fontSize: '14px',
      color: colorStr,
      fontStyle: 'bold',
    });
    deltaText.setDepth(15);

    scene.tweens.add({
      targets: deltaText,
      x: x + 16,
      y: y - 8,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        deltaText.destroy();
      },
    });
  };

  let prevInterceptors = -1;
  let prevScans = -1;

  // 6. Обновление счета и ресурсов
  const updateScoreBoard = (data: ScoreBoardData) => {
    const mult = calculateStreakMultiplier(data.streak).toFixed(1);
    scoreText.setText(`СЧЁТ: ${data.score.toString().padStart(4, '0')}`);
    creditsText.setText(`КРЕДИТЫ: ${data.credits} CR`);
    streakText.setText(`СЕРИЯ: ${data.streak} (x${mult})`);
    waveText.setText(`ВОЛНА: ${data.wave}`);
    highScoreText.setText(`РЕКОРД: ${data.highScore}`);

    // Анимация дельты боезапаса ракет и подсветка контура ячейки
    if (prevInterceptors === -1) {
      prevInterceptors = data.interceptors;
    } else {
      const diffMissiles = data.interceptors - prevInterceptors;
      if (diffMissiles !== 0) {
        spawnDeltaText(ammoCardX + 76, ammoCardY + 22, diffMissiles, '#4ade80');
        flashMissileBorder(diffMissiles > 0);
        prevInterceptors = data.interceptors;
      }
    }

    // Анимация дельты зарядов сканера и подсветка контура ячейки
    if (prevScans === -1) {
      prevScans = data.scansAvailable;
    } else {
      const diffScans = data.scansAvailable - prevScans;
      if (diffScans !== 0) {
        spawnDeltaText(scanColX + 74, ammoCardY + 22, diffScans, '#38bdf8');
        flashScanBorder(diffScans > 0);
        prevScans = data.scansAvailable;
      }
    }

    currentInterceptors = data.interceptors;
    currentScans = data.scansAvailable;
    if (currentInterceptors > 2) missileAlertTimer = 0;
    if (currentScans > 1) scanAlertTimer = 0;

    ammoCountText.setText(`${data.interceptors}/${GAME_CONFIG.maxInterceptors}`);
    ammoCountText.setColor(data.interceptors > 1 ? '#facc15' : '#ef4444');
    missileIcon.setAlpha(data.interceptors > 0 ? 1.0 : 0.4);

    scanCountText.setText(`${data.scansAvailable}/${GAME_CONFIG.maxScansPerWave}`);
    scanCountText.setColor(data.scansAvailable > 0 ? '#38bdf8' : '#64748b');
    scanIcon.setAlpha(data.scansAvailable > 0 ? 1.0 : 0.4);

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
      targetTelemetryType.setText('');
      targetTelemetryText.setY(195);
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
    let typeColor = '#94a3b8';

    if (t.isScanned) {
      const cfg = GAME_CONFIG.targetTypes[t.type];
      const catTag =
        cfg.category === 'threat'
          ? 'УГРОЗА!'
          : cfg.category === 'friend'
            ? 'СОЮЗНИК'
            : 'ЛОВУШКА';
      typeStr = `ТИП:        ${cfg.label.toUpperCase()} (${catTag})`;
      typeColor =
        cfg.category === 'threat'
          ? '#ef4444'
          : cfg.category === 'friend'
            ? '#4ade80'
            : '#fbbf24';
    } else if (data.isScanning && data.scanningTarget === t) {
      const pct = Math.min(
        100,
        Math.round((data.scanProgress / GAME_CONFIG.scanDuration) * 100),
      );
      typeStr = `АНАЛИЗ:     [${'#'.repeat(Math.floor(pct / 10))}${'.'.repeat(10 - Math.floor(pct / 10))}] ${pct}%`;
      typeColor = '#38bdf8';
    }

    targetTelemetryType.setText(typeStr);
    targetTelemetryType.setColor(typeColor);

    targetTelemetryText.setY(211);
    targetTelemetryText.setText(
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

  const updateResourceAlerts = (dt: number) => {
    // 1. Контроль дефицита боезапаса ракет
    if (currentInterceptors === 0) {
      missileAlertTimer += dt;
      if (missileAlertTimer >= MISSILE_ALERT_EMPTY_INTERVAL) {
        missileAlertTimer = 0;
        pulseMissileAlert('empty');
      }
    } else if (currentInterceptors <= 2) {
      missileAlertTimer += dt;
      if (missileAlertTimer >= MISSILE_ALERT_LOW_INTERVAL) {
        missileAlertTimer = 0;
        pulseMissileAlert('low');
      }
    } else {
      missileAlertTimer = 0;
    }

    // 2. Контроль дефицита сканеров (более мягкая и ненавязчивая реакция)
    if (currentScans === 0) {
      scanAlertTimer += dt;
      if (scanAlertTimer >= SCAN_ALERT_EMPTY_INTERVAL) {
        scanAlertTimer = 0;
        pulseScanAlert('empty');
      }
    } else if (currentScans === 1) {
      scanAlertTimer += dt;
      if (scanAlertTimer >= SCAN_ALERT_LOW_INTERVAL) {
        scanAlertTimer = 0;
        pulseScanAlert('low');
      }
    } else {
      scanAlertTimer = 0;
    }
  };

  const updateFeedback = (dt: number) => {
    if (feedbackTimer > 0) {
      feedbackTimer -= dt;
      if (feedbackTimer <= 0) {
        feedbackText.setText('');
      }
    }
    updateResourceAlerts(dt);
  };

  let waveBannerTimer = 0;
  let waveBannerTotalDuration = 3.0;

  const showWaveBanner = (text: string) => {
    const rawLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const title = rawLines[0] || 'ВОЛНА';
    const subtitle = rawLines[1] || '';
    const bonus = rawLines[2] || '';

    const hasBonus = bonus.length > 0;
    const boxW = 440;
    const boxH = hasBonus ? 152 : 116;
    const halfW = boxW / 2;
    const halfH = boxH / 2;

    bgBox.clear();

    // Полупрозрачный фон (тактическое стекло терминала)
    bgBox.fillStyle(0x021622, 0.94);
    bgBox.fillRoundedRect(-halfW, -halfH, boxW, boxH, 4);

    // Рамка терминала
    bgBox.lineStyle(1.5, 0x38bdf8, 0.85);
    bgBox.strokeRoundedRect(-halfW, -halfH, boxW, boxH, 4);

    // Верхняя акцентная полоса
    bgBox.lineStyle(2.5, 0x38bdf8, 1);
    bgBox.beginPath();
    bgBox.moveTo(-halfW + 16, -halfH);
    bgBox.lineTo(halfW - 16, -halfH);
    bgBox.strokePath();

    // Тактические угловые засечки прицела/окна
    const corner = 11;
    bgBox.lineStyle(2, 0x7dd3fc, 0.95);
    bgBox.beginPath();
    // Top-left
    bgBox.moveTo(-halfW, -halfH + corner);
    bgBox.lineTo(-halfW, -halfH);
    bgBox.lineTo(-halfW + corner, -halfH);
    // Top-right
    bgBox.moveTo(halfW - corner, -halfH);
    bgBox.lineTo(halfW, -halfH);
    bgBox.lineTo(halfW, -halfH + corner);
    // Bottom-left
    bgBox.moveTo(-halfW, halfH - corner);
    bgBox.lineTo(-halfW, halfH);
    bgBox.lineTo(-halfW + corner, halfH);
    // Bottom-right
    bgBox.moveTo(halfW - corner, halfH);
    bgBox.lineTo(halfW, halfH);
    bgBox.lineTo(halfW, halfH - corner);
    bgBox.strokePath();

    // Разделительная линия между заголовком и дополнительной информацией
    const dividerY = hasBonus ? -10 : 8;
    bgBox.lineStyle(1, 0x38bdf8, 0.28);
    bgBox.beginPath();
    bgBox.moveTo(-halfW + 24, dividerY);
    bgBox.lineTo(halfW - 24, dividerY);
    bgBox.strokePath();

    // Позиционирование текстов с выверенными пропорциями
    titleText.setText(title);
    titleText.setPosition(0, hasBonus ? -38 : -20);

    subtitleText.setText(subtitle);
    subtitleText.setPosition(0, hasBonus ? 16 : 30);

    if (hasBonus) {
      bonusText.setText(bonus);
      bonusText.setPosition(0, 46);
      bonusText.setVisible(true);
    } else {
      bonusText.setText('');
      bonusText.setVisible(false);
    }

    waveBannerTotalDuration = hasBonus ? 3.6 : 3.0;
    waveBannerTimer = waveBannerTotalDuration;
    waveContainer.setScale(0.94);
    waveContainer.setAlpha(0);
    waveContainer.setVisible(true);
  };

  const updateWaveBanner = (dt: number) => {
    if (waveBannerTimer > 0) {
      waveBannerTimer -= dt;
      if (waveBannerTimer <= 0) {
        waveContainer.setVisible(false);
        waveContainer.setAlpha(0);
        return;
      }

      const elapsed = waveBannerTotalDuration - waveBannerTimer;
      const fadeInDuration = 0.22;
      const fadeOutDuration = 0.65;

      let alpha = 1.0;
      let scale = 1.0;

      if (elapsed < fadeInDuration) {
        const progress = elapsed / fadeInDuration;
        alpha = progress;
        scale = 0.94 + 0.06 * progress;
      } else if (waveBannerTimer < fadeOutDuration) {
        alpha = waveBannerTimer / fadeOutDuration;
        scale = 1.0;
      }

      waveContainer.setAlpha(alpha);
      waveContainer.setScale(scale);
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

