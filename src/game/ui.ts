import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type DecisionChoice,
  type GameTarget,
} from './gameConfig';
import { calculateStreakMultiplier } from './scoring';
import type { GameSessionStats } from './stats';
import {
  MAX_ARCHIVE_ENTRIES,
  formatArchiveDate,
  formatShiftDuration,
  type DutyArchiveData,
} from './archive';

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
  show: (modeOrFirstTime?: boolean | 'menu') => void;
  hide: () => void;
  isVisible: () => boolean;
}

/**
 * Интерфейс управления модальным окном «Архив дежурств»
 */
export interface ArchiveOverlay {
  container: Phaser.GameObjects.Container;
  show: (data: DutyArchiveData) => void;
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
  // Вертикальный разделитель 2-колоночной таблицы сводки
  modalGraphics.moveTo(cx, cy + 28);
  modalGraphics.lineTo(cx, cy + 108);
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
      color: '#b91c1c',
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

  const statsRowY = cy + 68;
  const statsLabelStyle = {
    ...modalTextStyle,
    fontSize: '13px',
    color: '#94a3b8',
    align: 'left' as const,
    lineSpacing: 8,
  };
  const statsValueStyle = {
    ...modalTextStyle,
    fontSize: '13px',
    color: '#f8fafc',
    fontStyle: 'bold',
    align: 'right' as const,
    lineSpacing: 8,
  };

  const statsLeftLabels = scene.add.text(
    cx - 296,
    statsRowY,
    'РАКЕТ СБИТО:\nБОМБАРДИРОВЩИКОВ СБИТО:\nСВОИХ СБИТО:\nСВОИХ СПАСЕНО:',
    statsLabelStyle,
  ).setOrigin(0, 0.5);

  const statsLeftValues = scene.add.text(
    cx - 20,
    statsRowY,
    '0\n0\n0\n0',
    statsValueStyle,
  ).setOrigin(1, 0.5);

  const statsRightLabels = scene.add.text(
    cx + 20,
    statsRowY,
    'ЛОВУШЕК ОПОЗНАНО:\nУГРОЗ ПРОПУЩЕНО:\nТОЧНОСТЬ РЕШЕНИЙ:\nВРЕМЯ ДЕЖУРСТВА:',
    statsLabelStyle,
  ).setOrigin(0, 0.5);

  const statsRightValues = scene.add.text(
    cx + 296,
    statsRowY,
    '0\n0\n100%\n00:00',
    statsValueStyle,
  ).setOrigin(1, 0.5);

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
    GAME_CONFIG.isMobile ? 'НАЧАТЬ ЗАНОВО' : 'НАЧАТЬ ЗАНОВО (ПРОБЕЛ / R)',
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
    statsLeftLabels,
    statsLeftValues,
    statsRightLabels,
    statsRightValues,
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

      statsLeftValues.setText(
        `${stats.missilesShot}\n${stats.bombersShot}\n${stats.friendlyFireCount}\n${stats.friendsSaved}`,
      );
      statsRightValues.setText(
        `${stats.decoysFiltered}\n${stats.threatsMissed}\n${acc}%\n${timeStr}`,
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
    height / 2 - 84,
    '// ТАКТИЧЕСКАЯ ПАУЗА //',
    {
      ...pauseTextStyle,
      fontSize: '20px',
      color: '#38bdf8',
      fontStyle: 'bold',
    },
  );
  title.setOrigin(0.5);

  const titleDivider = scene.add.rectangle(
    width / 2,
    height / 2 - 56,
    320,
    1,
    GAME_CONFIG.colors.modal.borderInfo,
    0.35,
  );

  // 1. Кнопка продолжения
  const resumeBtn = scene.add.rectangle(
    width / 2,
    height / 2 - 18,
    260,
    36,
    GAME_CONFIG.colors.modal.btnResumeBg,
    0.9,
  );
  resumeBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnResumeBorder, 1);
  resumeBtn.setInteractive({ useHandCursor: true });

  const resumeText = scene.add.text(
    width / 2,
    height / 2 - 18,
    GAME_CONFIG.isMobile ? 'ПРОДОЛЖИТЬ' : 'ПРОДОЛЖИТЬ (P)',
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
    height / 2 + 28,
    260,
    36,
    GAME_CONFIG.colors.modal.btnBriefingBg,
    0.9,
  );
  briefingBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnBriefingBorder, 0.9);
  briefingBtn.setInteractive({ useHandCursor: true });

  const briefingText = scene.add.text(
    width / 2,
    height / 2 + 28,
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
    height / 2 + 74,
    260,
    36,
    GAME_CONFIG.colors.modal.btnDangerBg,
    0.9,
  );
  restartBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnDangerBorder, 0.9);
  restartBtn.setInteractive({ useHandCursor: true });

  const restartText = scene.add.text(
    width / 2,
    height / 2 + 74,
    GAME_CONFIG.isMobile ? 'НАЧАТЬ ЗАНОВО' : 'НАЧАТЬ ЗАНОВО (R)',
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
    titleDivider,
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

  const segmentPadX = 2;
  const briefingTextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: segmentPadX, right: segmentPadX, top: 1, bottom: 1 },
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
      // Компенсируем двусторонний padding на стыке сегментов, чтобы не появлялся лишний зазор
      curX = Math.round(curX + txt.width - segmentPadX * 2);
    }
  };

  const startX = cx - halfW + 34; // 194px при cx = 480
  const isMobile = GAME_CONFIG.isMobile;

  // 1. Угрозы (красный акцент)
  addRow(startX, cy - 156, [
    { text: '• УГРОЗЫ: ', color: '#ef4444', bold: true },
    { text: 'Ракеты (средний ЭПР) и бомбардировщики (высокий ЭПР) врага.', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 132, [
    { text: '  ДЕЙСТВИЕ: ', color: '#94a3b8' },
    { text: isMobile ? 'УНИЧТОЖИТЬ' : 'УНИЧТОЖИТЬ [2]', color: '#f87171', bold: true },
    { text: ' (требует боекомплект)', color: '#94a3b8' },
  ]);

  // 2. Союзники (зелёный акцент)
  addRow(startX, cy - 102, [
    { text: '• СОЮЗНИКИ: ', color: '#4ade80', bold: true },
    { text: 'Борта с плавным курсом и очень высоким ЭПР.', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 78, [
    { text: '  ДЕЙСТВИЕ: ПОМЕТКА ', color: '#94a3b8' },
    { text: isMobile ? 'СОЮЗНИК' : 'СОЮЗНИК [1]', color: '#4ade80', bold: true },
    { text: ' (огонь по своим карается ', color: '#94a3b8' },
    { text: `ШТРАФОМ ${GAME_CONFIG.creditsFriendlyFirePenalty} CR`, color: '#f87171', bold: true },
    { text: '!)', color: '#94a3b8' },
  ]);

  // 3. Ловушки (серый/нейтральный акцент)
  addRow(startX, cy - 48, [
    { text: '• ЛОВУШКИ: ', color: '#94a3b8', bold: true },
    { text: 'Имитаторы копируют чужие профили (урон базе не наносят).', color: '#e2e8f0' },
  ]);
  addRow(startX, cy - 24, [
    { text: '  ДЕЙСТВИЕ: ПОМЕТКА ', color: '#94a3b8' },
    { text: isMobile ? 'ЛОВУШКА' : 'ЛОВУШКА [3]', color: '#cbd5e1', bold: true },
    { text: ' (не упускайте пустышки)', color: '#94a3b8' },
  ]);

  // 4. Сенсоры и снабжение (голубой / бирюзовый акцент)
  addRow(startX, cy + 6, [
    { text: '• СЕНСОРЫ: ', color: '#38bdf8', bold: true },
    { text: isMobile ? 'Кнопка ' : 'Клавиша ', color: '#e2e8f0' },
    { text: isMobile ? 'СКАНЕР' : '[4] СКАН', color: '#38bdf8', bold: true },
    { text: ` раскрывает тип цели за ${GAME_CONFIG.scanDuration} с `, color: '#e2e8f0' },
    { text: `(требует сканер).`, color: '#94a3b8' },
  ]);
  addRow(startX, cy + 34, isMobile
    ? [
        { text: '• СНАБЖЕНИЕ: ', color: '#2dd4bf', bold: true },
        { text: `Докупка ракет (${GAME_CONFIG.interceptorCost} CR)   |   Докупка сканов (${GAME_CONFIG.scanCost} CR)`, color: '#e2e8f0' },
      ]
    : [
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
    isMobile
      ? 'УПРАВЛЕНИЕ: ТАП ПО МЕТКЕ НА РАДАРЕ → ВЫБОР ДЕЙСТВИЯ НА ПАНЕЛИ СПРАВА'
      : 'УПРАВЛЕНИЕ (КЛАВИАТУРА): [1] СВОЙ  [2] УГРОЗА  [3] ЛОЖНАЯ ЦЕЛЬ  [4] СКАН  [P] ПАУЗА',
    {
      ...briefingTextStyle,
      fontSize: '11px',
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

  const startLabel = isMobile ? 'ЗАСТУПИТЬ НА СМЕНУ' : 'ЗАСТУПИТЬ НА СМЕНУ (ПРОБЕЛ)';
  const resumeLabel = isMobile ? 'ВЕРНУТЬСЯ В ИГРУ' : 'ВЕРНУТЬСЯ В ИГРУ (ПРОБЕЛ)';
  const menuLabel = isMobile ? 'ЗАКРЫТЬ РЕГЛАМЕНТ' : 'ЗАКРЫТЬ РЕГЛАМЕНТ (ПРОБЕЛ)';
  const actionText = scene.add.text(cx, cy + 186, startLabel, {
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
    show: (modeOrFirstTime = false) => {
      if (modeOrFirstTime === 'menu') {
        actionText.setText(menuLabel);
      } else {
        actionText.setText(modeOrFirstTime ? startLabel : resumeLabel);
      }
      container.setVisible(true);
    },
    hide: () => container.setVisible(false),
    isVisible: () => container.visible,
  };
}

export interface ArchiveOverlayCallbacks {
  onClose: () => void;
  onClear: () => DutyArchiveData;
}

/**
 * Фабрика модального окна «Архив дежурств» (Топ-5 + последняя смена)
 */
export function createArchiveOverlay(
  scene: Phaser.Scene,
  callbacks: ArchiveOverlayCallbacks,
): ArchiveOverlay {
  const { width, height } = scene.scale;
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const halfW = 340;
  const halfH = 245;
  const boxW = halfW * 2;
  const boxH = halfH * 2;

  const container = scene.add.container(0, 0);
  container.setDepth(110);
  container.setVisible(false);

  const darkBg = scene.add.rectangle(cx, cy, width, height, GAME_CONFIG.colors.modal.overlay, 0.92);
  darkBg.setInteractive();

  const modalGraphics = scene.add.graphics();
  modalGraphics.fillStyle(GAME_CONFIG.colors.modal.bgTerminal, 0.98);
  modalGraphics.fillRoundedRect(cx - halfW, cy - halfH, boxW, boxH, 6);
  modalGraphics.lineStyle(1.5, GAME_CONFIG.colors.modal.borderInfo, 0.85);
  modalGraphics.strokeRoundedRect(cx - halfW, cy - halfH, boxW, boxH, 6);

  // Угловые скобки
  const corner = 14;
  modalGraphics.lineStyle(2.5, GAME_CONFIG.colors.modal.borderInfo, 1);
  modalGraphics.beginPath();
  modalGraphics.moveTo(cx - halfW, cy - halfH + corner);
  modalGraphics.lineTo(cx - halfW, cy - halfH);
  modalGraphics.lineTo(cx - halfW + corner, cy - halfH);
  modalGraphics.moveTo(cx + halfW - corner, cy - halfH);
  modalGraphics.lineTo(cx + halfW, cy - halfH);
  modalGraphics.lineTo(cx + halfW, cy - halfH + corner);
  modalGraphics.moveTo(cx - halfW, cy + halfH - corner);
  modalGraphics.lineTo(cx - halfW, cy + halfH);
  modalGraphics.lineTo(cx - halfW + corner, cy + halfH);
  modalGraphics.moveTo(cx + halfW - corner, cy + halfH);
  modalGraphics.lineTo(cx + halfW, cy + halfH);
  modalGraphics.lineTo(cx + halfW, cy + halfH - corner);
  modalGraphics.strokePath();

  // Горизонтальные разделители разделов
  modalGraphics.lineStyle(1, GAME_CONFIG.colors.modal.borderInfo, 0.35);
  modalGraphics.beginPath();
  modalGraphics.moveTo(cx - halfW + 36, cy - 148);
  modalGraphics.lineTo(cx + halfW - 36, cy - 148);
  modalGraphics.moveTo(cx - halfW + 42, cy - 115);
  modalGraphics.lineTo(cx + halfW - 42, cy - 115);
  modalGraphics.moveTo(cx - halfW + 36, cy + 52);
  modalGraphics.lineTo(cx + halfW - 36, cy + 52);
  modalGraphics.strokePath();

  const archiveTextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  };

  const tagLeft = scene.add.text(cx - halfW + 24, cy - halfH + 16, '[ РЕЕСТР ]', {
    ...archiveTextStyle,
    fontSize: '11px',
    color: '#38bdf8',
    fontStyle: 'bold',
  });
  const tagRight = scene.add.text(cx + halfW - 24, cy - halfH + 16, 'ПАМЯТЬ: ЛОКАЛЬНАЯ', {
    ...archiveTextStyle,
    fontSize: '11px',
    color: '#64748b',
    fontStyle: 'bold',
  }).setOrigin(1, 0);

  const title = scene.add.text(cx, cy - 202, '[ ЖУРНАЛ БОЕВЫХ ДЕЖУРСТВ // 1РЛ-134 ]', {
    ...archiveTextStyle,
    fontSize: '18px',
    color: '#38bdf8',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  const summaryText = scene.add.text(cx, cy - 170, '', {
    ...archiveTextStyle,
    fontSize: '12.5px',
    color: '#cbd5e1',
    align: 'center',
  }).setOrigin(0.5);

  // Фиксированные колонки таблицы Топ-5
  const cols = {
    rankX: cx - 296,
    dateX: cx - 252,
    scoreX: cx - 48,
    waveX: cx + 38,
    streakX: cx + 124,
    accX: cx + 210,
    timeX: cx + 296,
  } as const;

  const headerY = cy - 130;
  const headerStyle = {
    ...archiveTextStyle,
    fontSize: '11.5px',
    color: '#64748b',
    fontStyle: 'bold',
  };
  const headerTexts = [
    scene.add.text(cols.rankX, headerY, '№', headerStyle).setOrigin(0, 0.5),
    scene.add.text(cols.dateX, headerY, 'ДАТА', headerStyle).setOrigin(0, 0.5),
    scene.add.text(cols.scoreX, headerY, 'СЧЁТ', headerStyle).setOrigin(1, 0.5),
    scene.add.text(cols.waveX, headerY, 'ВОЛНА', headerStyle).setOrigin(1, 0.5),
    scene.add.text(cols.streakX, headerY, 'СЕРИЯ', headerStyle).setOrigin(1, 0.5),
    scene.add.text(cols.accX, headerY, 'ТОЧН.', headerStyle).setOrigin(1, 0.5),
    scene.add.text(cols.timeX, headerY, 'ВРЕМЯ', headerStyle).setOrigin(1, 0.5),
  ];

  const topHighlightBar = scene.add.rectangle(cx, cy - 92, 598, 24, 0x0c273b, 0.78);

  interface ArchiveRowView {
    rank: Phaser.GameObjects.Text;
    date: Phaser.GameObjects.Text;
    score: Phaser.GameObjects.Text;
    wave: Phaser.GameObjects.Text;
    streak: Phaser.GameObjects.Text;
    acc: Phaser.GameObjects.Text;
    time: Phaser.GameObjects.Text;
  }

  const rowViews: ArchiveRowView[] = [];
  const rowObjects: Phaser.GameObjects.GameObject[] = [];
  const rowStyle = { ...archiveTextStyle, fontSize: '13px', color: '#cbd5e1' };

  for (let i = 0; i < MAX_ARCHIVE_ENTRIES; i++) {
    const ry = cy - 92 + i * 28;
    const row: ArchiveRowView = {
      rank: scene.add.text(cols.rankX, ry, '', { ...rowStyle, fontStyle: 'bold' }).setOrigin(0, 0.5),
      date: scene.add.text(cols.dateX, ry, '', rowStyle).setOrigin(0, 0.5),
      score: scene.add.text(cols.scoreX, ry, '', { ...rowStyle, fontStyle: 'bold' }).setOrigin(1, 0.5),
      wave: scene.add.text(cols.waveX, ry, '', rowStyle).setOrigin(1, 0.5),
      streak: scene.add.text(cols.streakX, ry, '', rowStyle).setOrigin(1, 0.5),
      acc: scene.add.text(cols.accX, ry, '', rowStyle).setOrigin(1, 0.5),
      time: scene.add.text(cols.timeX, ry, '', rowStyle).setOrigin(1, 0.5),
    };
    rowViews.push(row);
    rowObjects.push(row.rank, row.date, row.score, row.wave, row.streak, row.acc, row.time);
  }

  const emptyTopText = scene.add.text(
    cx,
    cy - 36,
    '// ДАННЫЕ ДЕЖУРСТВ ОТСУТСТВУЮТ — ЗАВЕРШИТЕ ХОТЯ БЫ ОДНУ СМЕНУ //',
    {
      ...archiveTextStyle,
      fontSize: '12.5px',
      color: '#64748b',
      align: 'center',
    },
  ).setOrigin(0.5);

  // Блок последней завершённой смены
  const lastShiftHeader = scene.add.text(cx, cy + 68, '// ПОСЛЕДНЯЯ ЗАВЕРШЁННАЯ СМЕНА //', {
    ...archiveTextStyle,
    fontSize: '11px',
    color: '#64748b',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  const lastShiftPanel = scene.add.rectangle(cx, cy + 100, 596, 36, 0x071824, 0.92);
  lastShiftPanel.setStrokeStyle(1.2, GAME_CONFIG.colors.modal.borderInfo, 0.55);

  const lastShiftText = scene.add.text(cx, cy + 100, '', {
    ...archiveTextStyle,
    fontSize: '12px',
    color: '#e2e8f0',
    align: 'center',
  }).setOrigin(0.5);

  // Нижние кнопки: Закрыть + Очистить (2-кликовое подтверждение)
  const closeBtn = scene.add.rectangle(
    cx - 93,
    cy + 186,
    320,
    42,
    GAME_CONFIG.colors.modal.btnResumeBg,
    0.95,
  );
  closeBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnResumeBorder, 1);
  closeBtn.setInteractive({ useHandCursor: true });

  const closeText = scene.add.text(
    cx - 93,
    cy + 186,
    GAME_CONFIG.isMobile ? 'ЗАКРЫТЬ ЖУРНАЛ' : 'ЗАКРЫТЬ ЖУРНАЛ (ПРОБЕЛ)',
    {
      ...archiveTextStyle,
      fontSize: '13.5px',
      color: '#ffffff',
      fontStyle: 'bold',
    },
  ).setOrigin(0.5);

  closeBtn.on('pointerover', () => closeBtn.setFillStyle(GAME_CONFIG.colors.modal.btnResumeHover, 1));
  closeBtn.on('pointerout', () => closeBtn.setFillStyle(GAME_CONFIG.colors.modal.btnResumeBg, 0.95));
  closeBtn.on('pointerdown', () => callbacks.onClose());

  const clearBtn = scene.add.rectangle(
    cx + 168,
    cy + 186,
    170,
    42,
    GAME_CONFIG.colors.modal.btnDangerBg,
    0.9,
  );
  clearBtn.setStrokeStyle(1.5, GAME_CONFIG.colors.modal.btnDangerBorder, 0.9);
  clearBtn.setInteractive({ useHandCursor: true });

  const clearText = scene.add.text(cx + 168, cy + 186, 'ОЧИСТИТЬ', {
    ...archiveTextStyle,
    fontSize: '13px',
    color: '#fca5a5',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  let isConfirmingClear = false;
  let hasArchiveEntries = false;
  let confirmTimerId: number | null = null;

  const clearConfirmTimer = () => {
    if (confirmTimerId !== null) {
      window.clearTimeout(confirmTimerId);
      confirmTimerId = null;
    }
  };

  const resetClearConfirm = () => {
    isConfirmingClear = false;
    clearConfirmTimer();
    if (!clearText.scene) return;
    clearText.setText('ОЧИСТИТЬ');
    clearText.setColor(hasArchiveEntries ? '#fca5a5' : '#64748b');
  };

  const renderArchive = (data: DutyArchiveData) => {
    summaryText.setText(
      `ВСЕГО СМЕН: ${data.totalShifts}   |   ЛУЧШИЙ СЧЁТ: ${data.bestScore}   |   МАКС. ВОЛНА: ${data.bestWave}`,
    );

    const hasTop = data.topShifts.length > 0;
    topHighlightBar.setVisible(hasTop);
    emptyTopText.setVisible(!hasTop);
    if (!hasTop && data.totalShifts > 0) {
      emptyTopText.setText('// В ТОП-5 ПОПАДАЮТ СМЕНЫ С РЕЗУЛЬТАТОМ ВЫШЕ 0 ОЧКОВ //');
    } else if (!hasTop) {
      emptyTopText.setText('// ДАННЫЕ ДЕЖУРСТВ ОТСУТСТВУЮТ — ЗАВЕРШИТЕ ХОТЯ БЫ ОДНУ СМЕНУ //');
    }

    for (let i = 0; i < MAX_ARCHIVE_ENTRIES; i++) {
      const entry = data.topShifts[i];
      const row = rowViews[i];
      const visible = Boolean(entry);
      row.rank.setVisible(visible);
      row.date.setVisible(visible);
      row.score.setVisible(visible);
      row.wave.setVisible(visible);
      row.streak.setVisible(visible);
      row.acc.setVisible(visible);
      row.time.setVisible(visible);
      if (!entry) continue;

      const isTopOne = i === 0;
      const isLastPlayed = data.lastShift?.id === entry.id;
      const rankColor = isTopOne ? '#facc15' : '#94a3b8';
      const valueColor = isTopOne ? '#facc15' : isLastPlayed ? '#38bdf8' : '#e2e8f0';
      const dateColor = isLastPlayed ? '#38bdf8' : '#cbd5e1';

      row.rank.setText(`#${i + 1}`).setColor(rankColor);
      row.date.setText(`${formatArchiveDate(entry.playedAt)}${isLastPlayed ? ' •' : ''}`).setColor(dateColor);
      row.score.setText(`${entry.score}`).setColor(valueColor);
      row.wave.setText(`${entry.wave}`).setColor('#cbd5e1');
      row.streak.setText(`${entry.bestStreak}`).setColor('#cbd5e1');
      row.acc.setText(`${entry.accuracy}%`).setColor('#86efac');
      row.time.setText(formatShiftDuration(entry.sessionTime)).setColor('#94a3b8');
    }

    if (data.lastShift) {
      const last = data.lastShift;
      lastShiftText
        .setText(
          `${formatArchiveDate(last.playedAt)}  |  СЧЁТ: ${last.score}  |  ВОЛНА: ${last.wave}  |  СЕРИЯ: ${last.bestStreak}  |  ТОЧН.: ${last.accuracy}%  |  ${formatShiftDuration(last.sessionTime)}`,
        )
        .setColor('#e2e8f0');
    } else {
      lastShiftText.setText('ПОСЛЕДНЯЯ СМЕНА НЕ ЗАФИКСИРОВАНА').setColor('#64748b');
    }

    hasArchiveEntries = data.totalShifts > 0 || data.bestScore > 0 || data.topShifts.length > 0;
    resetClearConfirm();
    clearBtn.setAlpha(hasArchiveEntries ? 1 : 0.42);
    if (clearBtn.input) {
      clearBtn.input.cursor = hasArchiveEntries ? 'pointer' : 'default';
    }
  };

  clearBtn.on('pointerover', () => {
    if (!hasArchiveEntries) return;
    clearBtn.setFillStyle(GAME_CONFIG.colors.modal.btnDangerHover, 1);
  });
  clearBtn.on('pointerout', () => {
    clearBtn.setFillStyle(GAME_CONFIG.colors.modal.btnDangerBg, 0.9);
  });
  clearBtn.on('pointerdown', () => {
    if (!hasArchiveEntries) return;
    if (!isConfirmingClear) {
      isConfirmingClear = true;
      clearText.setText('ПОДТВЕРДИТЬ?');
      clearText.setColor('#fef08a');
      confirmTimerId = window.setTimeout(() => {
        resetClearConfirm();
      }, 3000);
      return;
    }
    const cleared = callbacks.onClear();
    renderArchive(cleared);
  });

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, clearConfirmTimer);
  scene.events.once(Phaser.Scenes.Events.DESTROY, clearConfirmTimer);

  container.add([
    darkBg,
    modalGraphics,
    tagLeft,
    tagRight,
    title,
    summaryText,
    ...headerTexts,
    topHighlightBar,
    ...rowObjects,
    emptyTopText,
    lastShiftHeader,
    lastShiftPanel,
    lastShiftText,
    closeBtn,
    closeText,
    clearBtn,
    clearText,
  ]);

  return {
    container,
    show: (data) => {
      renderArchive(data);
      container.setVisible(true);
    },
    hide: () => {
      resetClearConfirm();
      container.setVisible(false);
    },
    isVisible: () => container.visible,
  };
}

/**
 * Элемент интерактивной кнопки консоли
 */
export interface ButtonItem {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  elements?: Phaser.GameObjects.GameObject[];
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
  showActionHint?: boolean;
  highlightedRows?: [boolean, boolean, boolean, boolean];
}

/**
 * Пороги интерактивной подсветки аномалий телеметрии (без прямых подсказок кнопок)
 */
export const TELEMETRY_HINT_CONFIG = {
  maxAssistedDecisions: 4, // после 4 верных классификаций подсказки в цифрах отключаются
  speedDisplayScale: 20, // коэффициент перевода скорости px/сек в реалистичные тактические км/ч
  highSpeedThreshold: 42, // порог быстрой цели (крылатые ракеты / быстрые ловушки, >= 840 км/ч)
  lowEprThreshold: 48, // порог слабого отражения ЭПР (ловушки и часть ракет)
  highEprThreshold: 75, // порог плотного сигнала (союзники и бомбардировщики)
  denseEprMaxSpeed: 35, // верхняя граница скорости для интриги «союзник / бомбардировщик» (<= 700 км/ч)
  rowStartY: 212,
  rowStepY: 19,
} as const;

export interface TelemetryData {
  selectedTarget: GameTarget | null;
  isScanning: boolean;
  scanningTarget: GameTarget | null;
  scanProgress: number;
  showTelemetryHints?: boolean;
  showCourseHint?: boolean;
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
  setVisible: (visible: boolean) => void;
  slideIn: (duration?: number) => void;
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

  const hudContainer = scene.add.container(0, 0);
  hudContainer.setDepth(20);

  const menuBtnContainer = scene.add.container(0, 0);
  menuBtnContainer.setDepth(21);

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
  let menuBtnRef: Phaser.GameObjects.Rectangle | null = null;
  let menuTextRef: Phaser.GameObjects.Text | null = null;

  if (callbacks.onTogglePause) {
    const btnX = 82;
    const btnY = 38;
    const btnW = 116;
    const btnH = 32;

    const menuBtn = scene.add.rectangle(btnX, btnY, btnW, btnH, 0x071b0f, 0.92);
    menuBtn.setStrokeStyle(1.5, 0x38bdf8, 0.85);
    menuBtn.setDepth(20);
    menuBtn.setInteractive({ useHandCursor: true });

    const menuText = scene.add.text(
      btnX,
      btnY,
      GAME_CONFIG.isMobile ? 'МЕНЮ' : 'МЕНЮ (P)',
      {
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

    menuBtnRef = menuBtn;
    menuTextRef = menuText;
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

  const telemetryAccentGfx = scene.add.graphics();
  const telemetryLines: Phaser.GameObjects.Text[] = Array.from({ length: 4 }, (_, idx) => {
    const line = scene.add.text(
      656,
      TELEMETRY_HINT_CONFIG.rowStartY + idx * TELEMETRY_HINT_CONFIG.rowStepY,
      '',
      {
        ...monoStyle,
        fontSize: '13px',
        color: '#cbd5e1',
        fontStyle: 'bold',
      },
    );
    line.setVisible(false);
    return line;
  });

  const feedbackText = scene.add.text(656, 583, '', {
    ...monoStyle,
    fontSize: '11px',
    fontStyle: 'bold',
    lineSpacing: 2,
    wordWrap: { width: 263 },
  }).setOrigin(0, 0.5);

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
    fontSize: '15px',
    color: '#86efac',
    fontStyle: 'bold',
    align: 'center',
    resolution: GAME_CONFIG.textResolution,
  }).setOrigin(0.5);

  const bonusText = scene.add.text(0, 46, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '14px',
    color: '#facc15',
    fontStyle: 'bold',
    align: 'center',
    lineSpacing: 4,
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

    return { bg, text, elements: [bg, text], setEnabled };
  }

  function createSupplyButton(
    x: number,
    y: number,
    w: number,
    h: number,
    keyNum: string,
    iconKey: 'icon_hud_missile' | 'icon_hud_scan',
    cost: number,
    color: number,
    onClick: () => void,
  ): ButtonItem {
    const bg = scene.add.rectangle(x + w / 2, y + h / 2, w, h, color, 0.45);
    bg.setStrokeStyle(1, color, 0.9);
    bg.setInteractive({ useHandCursor: true });

    const btnTextStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: '11px',
      color: '#f8fafc',
      fontStyle: 'bold',
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      resolution: GAME_CONFIG.textResolution,
    };

    const prefixStr = GAME_CONFIG.isMobile ? '+1' : `[${keyNum}] +1`;
    const prefix = scene.add.text(0, y + h / 2, prefixStr, btnTextStyle);
    prefix.setOrigin(0, 0.5);

    const icon = scene.add.image(0, y + h / 2, iconKey);
    icon.setScale(0.72);
    icon.setOrigin(0.5, 0.5);

    const costText = scene.add.text(0, y + h / 2, `(${cost} CR)`, btnTextStyle);
    costText.setOrigin(0, 0.5);

    const iconEffectiveW = Math.round(22 * 0.72);
    const itemGap = 3;
    const totalW = prefix.width + itemGap + iconEffectiveW + itemGap + costText.width;
    const startX = Math.round(x + (w - totalW) / 2);

    prefix.setX(startX);
    icon.setX(startX + prefix.width + itemGap + Math.round(iconEffectiveW / 2));
    costText.setX(startX + prefix.width + itemGap + iconEffectiveW + itemGap);

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
      const alpha = enabled ? 1.0 : 0.3;
      bg.setAlpha(alpha);
      prefix.setAlpha(alpha);
      icon.setAlpha(alpha);
      costText.setAlpha(alpha);
    };

    return { bg, text: prefix, elements: [bg, prefix, icon, costText], setEnabled };
  }

  const startY = 306;
  const btnX = panelX + 16;
  const btnW = panelW - 32;
  const btnH = 30;
  const gap = 7;

  const formatHudBtnLabel = (hotkey: string, label: string): string =>
    GAME_CONFIG.isMobile ? label : `[${hotkey}] ${label}`;

  const buttons = {
    friend: createButton(
      btnX,
      startY,
      btnW,
      btnH,
      formatHudBtnLabel('1', 'СОЮЗНИК (ПОМЕТИТЬ)'),
      GAME_CONFIG.colors.btnFriend,
      () => callbacks.onDecision('friend'),
    ),
    threat: createButton(
      btnX,
      startY + (btnH + gap),
      btnW,
      btnH,
      formatHudBtnLabel('2', 'УГРОЗА (УНИЧТОЖИТЬ)'),
      GAME_CONFIG.colors.btnThreat,
      () => callbacks.onDecision('threat'),
    ),
    ignore: createButton(
      btnX,
      startY + (btnH + gap) * 2,
      btnW,
      btnH,
      formatHudBtnLabel('3', 'ЛОВУШКА (ОТМЕТИТЬ)'),
      GAME_CONFIG.colors.btnIgnore,
      () => callbacks.onDecision('ignore'),
    ),
    scan: createButton(
      btnX,
      startY + (btnH + gap) * 3,
      btnW,
      btnH,
      formatHudBtnLabel('4', `ПРИМЕНИТЬ СКАНЕР (${GAME_CONFIG.scanDuration} сек.)`),
      GAME_CONFIG.colors.btnScan,
      () => callbacks.onScan(),
    ),
    buyMissile: createSupplyButton(
      btnX,
      startY + (btnH + gap) * 4,
      128,
      btnH,
      '5',
      'icon_hud_missile',
      GAME_CONFIG.interceptorCost,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyMissile(),
    ),
    buyScan: createSupplyButton(
      btnX + 128 + gap,
      startY + (btnH + gap) * 4,
      128,
      btnH,
      '6',
      'icon_hud_scan',
      GAME_CONFIG.scanCost,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyScan(),
    ),
  };

  // 4.5. Приборный блок наглядного отображения боезапаса и сканеров под кнопками взаимодействия
  // Левая секция: Ракеты-перехватчики
  const missileIcon = scene.add.image(ammoCardX + 18, ammoCardY + 24, 'icon_hud_missile');
  const ammoTitle = scene.add.text(ammoCardX + 36, ammoCardY + 8, 'БОЕКОМПЛЕКТ', {
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
  const scanTitle = scene.add.text(scanColX + 36, ammoCardY + 8, 'СКАНЕРЫ', {
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

  hudContainer.add([
    hudGraphics,
    missileHighlight,
    scanHighlight,
    healthText,
    scoreText,
    highScoreText,
    creditsText,
    waveText,
    streakText,
    targetTelemetryTitle,
    targetTelemetryType,
    telemetryAccentGfx,
    targetTelemetryText,
    ...telemetryLines,
    feedbackText,
    ...(buttons.friend.elements ?? [buttons.friend.bg, buttons.friend.text]),
    ...(buttons.threat.elements ?? [buttons.threat.bg, buttons.threat.text]),
    ...(buttons.ignore.elements ?? [buttons.ignore.bg, buttons.ignore.text]),
    ...(buttons.scan.elements ?? [buttons.scan.bg, buttons.scan.text]),
    ...(buttons.buyMissile.elements ?? [buttons.buyMissile.bg, buttons.buyMissile.text]),
    ...(buttons.buyScan.elements ?? [buttons.buyScan.bg, buttons.buyScan.text]),
    missileIcon,
    ammoTitle,
    ammoCountText,
    scanIcon,
    scanTitle,
    scanCountText,
  ]);

  // Слой визуальной подсветки-подсказки кнопок решений [1]–[4] после первого захвата цели
  const ACTION_HINT_CONFIG = {
    padX: 5,
    padY: 5,
    cornerLen: 8,
    cascadePeriodSec: 1.35,
    flashDecayRate: 3.6,
    rowGlowColors: [0x4ade80, 0xfbbf24, 0x94a3b8, 0x38bdf8] as const,
    keycapLegends: ['1', '2', '3', '4'] as const,
    keycapLegendColors: ['#86efac', '#fde047', '#cbd5e1', '#7dd3fc'] as const,
    keycapX: 625, // левый край 3D-клавиши на стыке консоли (правее корпуса радара 625, левее кнопок 656)
    keycapW: 24,
    keycapH: 24,
    keycapPressDepth: 1.6, // ход имитации нажатия клавиши при проходе волны
  } as const;

  const decisionHintGfx = scene.add.graphics();
  hudContainer.add(decisionHintGfx);

  const keycapTexts: Phaser.GameObjects.Text[] = [];
  if (!GAME_CONFIG.isMobile) {
    for (let i = 0; i < 4; i++) {
      const rowCenterY = startY + i * (btnH + gap) + btnH / 2;
      const keyTxt = scene.add.text(
        ACTION_HINT_CONFIG.keycapX + ACTION_HINT_CONFIG.keycapW / 2,
        rowCenterY - 1,
        ACTION_HINT_CONFIG.keycapLegends[i],
        {
          ...monoStyle,
          fontSize: '11px',
          color: ACTION_HINT_CONFIG.keycapLegendColors[i],
          fontStyle: 'bold',
        },
      );
      keyTxt.setOrigin(0.5);
      keyTxt.setVisible(false);
      keycapTexts.push(keyTxt);
      hudContainer.add(keyTxt);
    }
  }

  let actionHintActive = false;
  let actionHintTime = 0;
  let actionHintFlash = 0;
  let actionHintEnabledRows: [boolean, boolean, boolean, boolean] = [false, false, false, false];

  /**
   * Отрисовка объёмной иконки-клавиши клавиатуры (только для ПК) с анимацией нажатия
   */
  const drawDesktopKeycap = (
    rowIndex: number,
    rowY: number,
    glowColor: number,
    waveBoost: number,
  ) => {
    const kx = ACTION_HINT_CONFIG.keycapX;
    const kw = ACTION_HINT_CONFIG.keycapW;
    const kh = ACTION_HINT_CONFIG.keycapH;
    const ky = rowY + (btnH - kh) / 2;

    const pressRatio = waveBoost > 0.35 ? (waveBoost - 0.35) / 0.65 : 0;
    const pressY = pressRatio * ACTION_HINT_CONFIG.keycapPressDepth;
    const capAlpha = Math.min(1, 0.72 + 0.28 * waveBoost + actionHintFlash * 0.3);

    // 1. Внешний ореол клавиши при подсветке волной
    if (waveBoost > 0.1 || actionHintFlash > 0.1) {
      decisionHintGfx.lineStyle(
        3,
        glowColor,
        Math.min(0.6, 0.35 * waveBoost + 0.45 * actionHintFlash),
      );
      decisionHintGfx.strokeRoundedRect(kx - 1.5, ky - 1.5, kw + 3, kh + 3, 5);
    }

    // 2. Тень и объёмный нижний бортик (юбка механической клавиши)
    decisionHintGfx.fillStyle(0x000000, 0.55);
    decisionHintGfx.fillRoundedRect(kx + 1, ky + 2, kw, kh, 4);

    decisionHintGfx.fillStyle(0x09131d, 0.96);
    decisionHintGfx.fillRoundedRect(kx, ky, kw, kh, 4);
    decisionHintGfx.lineStyle(1.3, glowColor, capAlpha);
    decisionHintGfx.strokeRoundedRect(kx, ky, kw, kh, 4);

    // 3. Верхняя площадка клавиши (слегка опускается при имитации нажатия)
    const faceW = kw - 4;
    const faceH = kh - 6;
    const faceX = kx + 2;
    const faceY = ky + 1.5 + pressY;
    const faceColor = waveBoost > 0.45 || actionHintFlash > 0.4 ? 0x163142 : 0x111f2d;

    decisionHintGfx.fillStyle(faceColor, 0.98);
    decisionHintGfx.fillRoundedRect(faceX, faceY, faceW, faceH, 3);
    decisionHintGfx.lineStyle(1, 0xffffff, 0.22 + 0.35 * waveBoost);
    decisionHintGfx.beginPath();
    decisionHintGfx.moveTo(faceX + 2, faceY + 0.5);
    decisionHintGfx.lineTo(faceX + faceW - 2, faceY + 0.5);
    decisionHintGfx.strokePath();

    // 4. Светодиодный проводник от клавиши к самой кнопке справа
    const midY = rowY + btnH / 2;
    const traceAlpha = Math.min(1, 0.4 + 0.6 * waveBoost + actionHintFlash * 0.4);
    decisionHintGfx.lineStyle(1.4, glowColor, traceAlpha);
    decisionHintGfx.lineBetween(kx + kw + 1, midY, btnX - 3, midY);
    decisionHintGfx.fillStyle(glowColor, traceAlpha);
    decisionHintGfx.fillTriangle(btnX - 5, midY - 2.5, btnX - 5, midY + 2.5, btnX - 1.5, midY);

    // 5. Цифра на клавише (вспыхивает ярко-белым на пике нажатия)
    const keyTxt = keycapTexts[rowIndex];
    if (keyTxt) {
      keyTxt.setY(Math.round(faceY + faceH / 2));
      keyTxt.setColor(
        waveBoost > 0.55 || actionHintFlash > 0.4
          ? '#ffffff'
          : ACTION_HINT_CONFIG.keycapLegendColors[rowIndex],
      );
      keyTxt.setAlpha(capAlpha);
      keyTxt.setVisible(true);
    }
  };

  const renderActionHint = () => {
    decisionHintGfx.clear();
    if (!actionHintActive) {
      for (const kt of keycapTexts) kt.setVisible(false);
      return;
    }

    const pulse = 0.5 + 0.5 * Math.sin(actionHintTime * 4.5);
    let firstHighlighted = -1;
    let lastHighlighted = -1;
    let highlightedCount = 0;
    for (let i = 0; i < 4; i++) {
      if (actionHintEnabledRows[i]) {
        if (firstHighlighted === -1) firstHighlighted = i;
        lastHighlighted = i;
        highlightedCount++;
      }
    }
    if (highlightedCount === 0) {
      for (const kt of keycapTexts) kt.setVisible(false);
      return;
    }

    const spanTopIdx = highlightedCount === 1 ? firstHighlighted : 0;
    const spanBottomIdx = highlightedCount === 1 ? lastHighlighted : 3;
    const groupTop = startY + spanTopIdx * (btnH + gap) - ACTION_HINT_CONFIG.padY;
    const groupBottom = startY + spanBottomIdx * (btnH + gap) + btnH + ACTION_HINT_CONFIG.padY;
    const groupLeft = btnX - ACTION_HINT_CONFIG.padX;
    const groupRight = btnX + btnW + ACTION_HINT_CONFIG.padX;
    const corner = ACTION_HINT_CONFIG.cornerLen;

    // 1. Тактические угловые скобки вокруг целевой кнопки (или блока кнопок)
    const singleGlowColor = ACTION_HINT_CONFIG.rowGlowColors[firstHighlighted] ?? 0xfacc15;
    const groupAlpha = Math.min(1, 0.55 + 0.35 * pulse + actionHintFlash * 0.45);
    const groupColor =
      actionHintFlash > 0.35
        ? 0xfef08a
        : highlightedCount === 1
          ? singleGlowColor
          : 0xfacc15;
    decisionHintGfx.lineStyle(1.8, groupColor, groupAlpha);
    decisionHintGfx.beginPath();
    decisionHintGfx.moveTo(groupLeft, groupTop + corner);
    decisionHintGfx.lineTo(groupLeft, groupTop);
    decisionHintGfx.lineTo(groupLeft + corner, groupTop);
    decisionHintGfx.moveTo(groupRight - corner, groupTop);
    decisionHintGfx.lineTo(groupRight, groupTop);
    decisionHintGfx.lineTo(groupRight, groupTop + corner);
    decisionHintGfx.moveTo(groupLeft, groupBottom - corner);
    decisionHintGfx.lineTo(groupLeft, groupBottom);
    decisionHintGfx.lineTo(groupLeft + corner, groupBottom);
    decisionHintGfx.moveTo(groupRight - corner, groupBottom);
    decisionHintGfx.lineTo(groupRight, groupBottom);
    decisionHintGfx.lineTo(groupRight, groupBottom - corner);
    decisionHintGfx.strokePath();

    // 2. Каскадная волна и акцентная подсветка доступных кнопок (с клавишами-дубликатами для ПК)
    const wavePos = ((actionHintTime / ACTION_HINT_CONFIG.cascadePeriodSec) % 1) * 4;
    for (let i = 0; i < 4; i++) {
      if (!actionHintEnabledRows[i]) {
        keycapTexts[i]?.setVisible(false);
        continue;
      }

      const rowY = startY + i * (btnH + gap);
      const isKeyAction = i === 1 || i === 3;
      const waveDist = Math.min(Math.abs(wavePos - i), 4 - Math.abs(wavePos - i));
      const waveBoost = Math.max(0, 1 - waveDist / 1.15);
      const glowColor = actionHintFlash > 0.4 ? 0xfef08a : ACTION_HINT_CONFIG.rowGlowColors[i];

      const borderAlpha = Math.min(
        1,
        (isKeyAction ? 0.48 : 0.24) + 0.48 * waveBoost + actionHintFlash * 0.5,
      );
      decisionHintGfx.lineStyle(isKeyAction ? 2.0 : 1.4, glowColor, borderAlpha);
      decisionHintGfx.strokeRoundedRect(btnX - 1, rowY - 1, btnW + 2, btnH + 2, 3);

      // Мягкий внешний ореол на волне каскада
      if (waveBoost > 0.05 || actionHintFlash > 0.05) {
        const fillAlpha = 0.08 * waveBoost + 0.16 * actionHintFlash;
        decisionHintGfx.fillStyle(glowColor, fillAlpha);
        decisionHintGfx.fillRect(btnX, rowY, btnW, btnH);
      }

      if (!GAME_CONFIG.isMobile) {
        drawDesktopKeycap(i, rowY, glowColor, waveBoost);
      } else {
        // На мобильных устройствах — только чистый световой указатель без иконки клавиатуры
        const pipAlpha = Math.min(1, 0.35 + 0.65 * waveBoost + actionHintFlash * 0.4);
        const midY = rowY + btnH / 2;
        decisionHintGfx.fillStyle(glowColor, pipAlpha);
        decisionHintGfx.fillTriangle(
          btnX - 8,
          midY - 3.5,
          btnX - 8,
          midY + 3.5,
          btnX - 3,
          midY,
        );
      }
    }
  };

  if (menuBtnRef && menuTextRef) {
    menuBtnContainer.add([menuBtnRef, menuTextRef]);
  }

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

  // Кэш последних строк и цветов телеметрии (чтобы не перерисовывать WebGL-текстуру текста каждый кадр)
  const textRenderCache = new WeakMap<
    Phaser.GameObjects.Text,
    { text: string; color?: string }
  >();

  const syncTextObject = (
    obj: Phaser.GameObjects.Text,
    nextText: string,
    nextColor?: string,
  ) => {
    const prev = textRenderCache.get(obj);
    if (!prev || prev.text !== nextText) {
      obj.setText(nextText);
    }
    if (nextColor !== undefined && (!prev || prev.color !== nextColor)) {
      obj.setColor(nextColor);
    }
    textRenderCache.set(obj, { text: nextText, color: nextColor ?? prev?.color });
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

    const defaultRows: [boolean, boolean, boolean, boolean] = [
      isSelected,
      isSelected && data.interceptors > 0,
      isSelected,
      canScan,
    ];
    const requestedRows = data.highlightedRows;
    const nextRows: [boolean, boolean, boolean, boolean] = requestedRows
      ? [
          defaultRows[0] && requestedRows[0],
          defaultRows[1] && requestedRows[1],
          defaultRows[2] && requestedRows[2],
          defaultRows[3] && requestedRows[3],
        ]
      : defaultRows;

    const nextHintActive = Boolean(data.showActionHint && isSelected && nextRows.some(Boolean));
    const maskChanged = nextRows.some((val, idx) => val !== actionHintEnabledRows[idx]);
    actionHintEnabledRows = nextRows;
    if (nextHintActive && (!actionHintActive || maskChanged)) {
      actionHintTime = 0;
      actionHintFlash = 1.0;
    }
    actionHintActive = nextHintActive;
    renderActionHint();

    if (!isSelected) {
      telemetryAccentGfx.clear();
      for (const line of telemetryLines) line.setVisible(false);
      syncTextObject(targetTelemetryTitle, 'ОБЪЕКТ СЛЕЖЕНИЯ: НЕТ', '#94a3b8');
      syncTextObject(targetTelemetryType, '');
      targetTelemetryText.setY(195);
      targetTelemetryText.setVisible(true);
      syncTextObject(
        targetTelemetryText,
        GAME_CONFIG.isMobile
          ? 'Коснитесь вспыхнувшей\nцели на радаре, затем\nоцените данные или\nнажмите СКАНЕР.'
          : 'Кликните по вспыхнувшей\nцели на радаре, затем\nоцените данные или\nпроверьте [4] СКАНОМ.',
      );
    }
  };

  /**
   * Тихий боковой акцент и подложка для выделяющейся строки телеметрии
   */
  const drawTelemetryRowAccent = (rowIndex: number, colorHex: number) => {
    const rowY =
      TELEMETRY_HINT_CONFIG.rowStartY + rowIndex * TELEMETRY_HINT_CONFIG.rowStepY;
    telemetryAccentGfx.fillStyle(colorHex, 0.09);
    telemetryAccentGfx.fillRect(654, rowY - 1, 265, 17);
    telemetryAccentGfx.fillStyle(colorHex, 0.9);
    telemetryAccentGfx.fillRect(649, rowY + 1, 3, 13);
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
    syncTextObject(
      targetTelemetryTitle,
      `ОБЪЕКТ СЛЕЖЕНИЯ: #TRK-${t.id}${markBadge}`,
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

    syncTextObject(targetTelemetryType, typeStr, typeColor);
    targetTelemetryText.setVisible(false);
    telemetryAccentGfx.clear();

    const showHints = Boolean(data.showTelemetryHints && !t.isScanned);

    // 1. Скорость (аномально быстрые цели: крылатые ракеты / редкие быстрые ловушки)
    const displaySpeedKmh = Math.round(t.speed * TELEMETRY_HINT_CONFIG.speedDisplayScale);
    let speedText = `СКОРОСТЬ:   ${displaySpeedKmh} км/ч`;
    let speedColor = '#cbd5e1';
    if (showHints && t.speed >= TELEMETRY_HINT_CONFIG.highSpeedThreshold) {
      speedText += ' ▲ БЫСТРАЯ';
      speedColor = '#fbbf24';
      drawTelemetryRowAccent(0, 0xfbbf24);
    }

    // 2. Курс относительно базы (ориентир геометрии на первых целях)
    let courseText = `КУРС:       ${t.headingDeg}°`;
    let courseColor = '#cbd5e1';
    if (data.showCourseHint && !t.isScanned) {
      const toBaseX = GAME_CONFIG.radarX - t.x;
      const toBaseY = GAME_CONFIG.radarY - t.y;
      const speedSq = t.vx * t.vx + t.vy * t.vy;
      const dot = toBaseX * t.vx + toBaseY * t.vy;
      if (dot > 0 && speedSq > 0) {
        const perpDist = Math.abs(toBaseX * t.vy - toBaseY * t.vx) / Math.sqrt(speedSq);
        if (perpDist <= GAME_CONFIG.dangerCloseRadius * 0.72) {
          courseText += ' → НА БАЗУ';
          courseColor = '#fca5a5';
          drawTelemetryRowAccent(1, 0xef4444);
        } else {
          courseText += ' ↗ МИМО';
          courseColor = '#94a3b8';
        }
      } else {
        courseText += ' ↗ ОТ БАЗЫ';
        courseColor = '#94a3b8';
      }
    }

    // 3. Сигнал ЭПР (слабое отражение vs плотный силуэт при умеренной скорости)
    let eprText = `СИГНАЛ ЭПР: ${t.signal}%`;
    let eprColor = '#cbd5e1';
    if (showHints && t.signal < TELEMETRY_HINT_CONFIG.lowEprThreshold) {
      eprText += ' ▼ СЛАБЫЙ';
      eprColor = '#94a3b8';
      drawTelemetryRowAccent(2, 0x94a3b8);
    } else if (
      showHints &&
      t.signal >= TELEMETRY_HINT_CONFIG.highEprThreshold &&
      t.speed <= TELEMETRY_HINT_CONFIG.denseEprMaxSpeed
    ) {
      eprText += ' ▲ ПЛОТНЫЙ';
      eprColor = '#7dd3fc';
      drawTelemetryRowAccent(2, 0x38bdf8);
    }

    const rows: Array<{ text: string; color: string }> = [
      { text: speedText, color: speedColor },
      { text: courseText, color: courseColor },
      { text: eprText, color: eprColor },
      { text: `ДИСТАНЦИЯ:  ${dist} км`, color: '#cbd5e1' },
    ];

    rows.forEach((row, idx) => {
      syncTextObject(telemetryLines[idx], row.text, row.color);
      telemetryLines[idx].setVisible(true);
    });
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
    if (actionHintActive) {
      actionHintTime += dt;
      if (actionHintFlash > 0) {
        actionHintFlash = Math.max(0, actionHintFlash - dt * ACTION_HINT_CONFIG.flashDecayRate);
      }
      renderActionHint();
    }
    updateResourceAlerts(dt);
  };

  const WAVE_BANNER_CONFIG = {
    minWidth: 450,
    maxWidth: 500,
    paddingX: 48,
    heights: {
      noBonus: 114,
      singleBonus: 148,
      multiBonus: 176,
    },
    dividers: {
      noBonus: 6,
      singleBonus: -12,
      multiBonus: -22,
    },
    positions: {
      noBonus: { titleY: -20, subtitleY: 28 },
      singleBonus: { titleY: -38, subtitleY: 14, bonusY: 44 },
      multiBonus: { titleY: -48, subtitleY: 4, bonusY: 46 },
    },
    durations: {
      noBonus: 3.0,
      singleBonus: 3.6,
      multiBonus: 4.0,
    },
  } as const;

  let waveBannerTimer = 0;
  let waveBannerTotalDuration: number = WAVE_BANNER_CONFIG.durations.noBonus;

  const showWaveBanner = (text: string) => {
    const rawLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const title = rawLines[0] || 'ВОЛНА';
    const subtitle = rawLines[1] || '';
    const bonusLines = rawLines.slice(2).join('\n');
    const bonusCount = rawLines.length > 2 ? rawLines.length - 2 : 0;
    const hasBonus = bonusCount > 0;

    titleText.setText(title);
    subtitleText.setText(subtitle);

    if (hasBonus) {
      bonusText.setText(bonusLines);
      bonusText.setVisible(true);
    } else {
      bonusText.setText('');
      bonusText.setVisible(false);
    }

    // Вычисляем ширину окна с учётом реального размера текста, чтобы рамка не нарушалась
    const contentW = Math.max(
      titleText.width,
      subtitleText.width,
      hasBonus ? bonusText.width : 0,
    );
    const boxW = Math.max(
      WAVE_BANNER_CONFIG.minWidth,
      Math.min(WAVE_BANNER_CONFIG.maxWidth, Math.round(contentW + WAVE_BANNER_CONFIG.paddingX)),
    );

    let boxH: number = WAVE_BANNER_CONFIG.heights.noBonus;
    let dividerY: number = WAVE_BANNER_CONFIG.dividers.noBonus;
    if (bonusCount === 1) {
      boxH = WAVE_BANNER_CONFIG.heights.singleBonus;
      dividerY = WAVE_BANNER_CONFIG.dividers.singleBonus;
      titleText.setPosition(0, WAVE_BANNER_CONFIG.positions.singleBonus.titleY);
      subtitleText.setPosition(0, WAVE_BANNER_CONFIG.positions.singleBonus.subtitleY);
      bonusText.setPosition(0, WAVE_BANNER_CONFIG.positions.singleBonus.bonusY);
    } else if (bonusCount >= 2) {
      boxH = WAVE_BANNER_CONFIG.heights.multiBonus;
      dividerY = WAVE_BANNER_CONFIG.dividers.multiBonus;
      titleText.setPosition(0, WAVE_BANNER_CONFIG.positions.multiBonus.titleY);
      subtitleText.setPosition(0, WAVE_BANNER_CONFIG.positions.multiBonus.subtitleY);
      bonusText.setPosition(0, WAVE_BANNER_CONFIG.positions.multiBonus.bonusY);
    } else {
      titleText.setPosition(0, WAVE_BANNER_CONFIG.positions.noBonus.titleY);
      subtitleText.setPosition(0, WAVE_BANNER_CONFIG.positions.noBonus.subtitleY);
    }

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
    bgBox.lineStyle(1, 0x38bdf8, 0.28);
    bgBox.beginPath();
    bgBox.moveTo(-halfW + 24, dividerY);
    bgBox.lineTo(halfW - 24, dividerY);
    bgBox.strokePath();

    waveBannerTotalDuration = hasBonus
      ? bonusCount > 1
        ? WAVE_BANNER_CONFIG.durations.multiBonus
        : WAVE_BANNER_CONFIG.durations.singleBonus
      : WAVE_BANNER_CONFIG.durations.noBonus;
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

  const setVisible = (visible: boolean) => {
    hudContainer.setVisible(visible);
    menuBtnContainer.setVisible(visible);
  };

  const slideIn = (duration = 450) => {
    hudContainer.setVisible(true);
    hudContainer.setAlpha(0);
    hudContainer.x = 80;
    menuBtnContainer.setVisible(true);
    menuBtnContainer.setAlpha(0);

    scene.tweens.add({
      targets: hudContainer,
      x: 0,
      alpha: 1,
      duration,
      ease: 'Cubic.easeOut',
    });
    scene.tweens.add({
      targets: menuBtnContainer,
      alpha: 1,
      duration,
      ease: 'Quad.easeOut',
    });
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
    setVisible,
    slideIn,
  };
}

