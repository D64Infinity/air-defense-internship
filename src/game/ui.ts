import Phaser from 'phaser';

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
    320,
    0x071b0f,
    0.96,
  );
  modal.setStrokeStyle(2, 0xef4444, 0.9);

  const title = scene.add.text(
    width / 2,
    height / 2 - 110,
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
    height / 2 - 35,
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
    height / 2,
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
    height / 2 + 30,
    'ОТРАЖЕНО ВОЛН: 1',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#94a3b8',
    },
  );
  wavesText.setOrigin(0.5);

  // Кнопка рестарта
  const restartBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 85,
    260,
    42,
    0x16a34a,
    0.9,
  );
  restartBtn.setStrokeStyle(1.5, 0x4ade80, 1);
  restartBtn.setInteractive({ useHandCursor: true });

  const restartText = scene.add.text(
    width / 2,
    height / 2 + 85,
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
    restartBtn,
    restartText,
  ]);

  return {
    container,
    show: (score, highScore, wave, bestStreak, isNewRecord) => {
      scoreText.setText(
        `ИТОГОВЫЙ СЧЁТ: ${score}` + (isNewRecord ? ' (НОВЫЙ РЕКОРД!)' : ''),
      );
      recordText.setText(`ЛУЧШИЙ РЕКОРД: ${highScore}`);
      wavesText.setText(`ВОЛНА: ${wave} | МАКС. СЕРИЯ: ${bestStreak}`);
      container.setVisible(true);
    },
    hide: () => {
      container.setVisible(false);
    },
  };
}

/**
 * Фабрика экрана тактической паузы
 */
export function createPauseOverlay(
  scene: Phaser.Scene,
  onResume: () => void,
): PauseOverlay {
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
    180,
    0x071b0f,
    0.96,
  );
  modal.setStrokeStyle(2, 0x38bdf8, 0.9);

  const title = scene.add.text(
    width / 2,
    height / 2 - 35,
    '// ТАКТИЧЕСКАЯ ПАУЗА //',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '20px',
      color: '#38bdf8',
      fontStyle: 'bold',
    },
  );
  title.setOrigin(0.5);

  // Кнопка продолжения
  const resumeBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 35,
    240,
    40,
    0x0284c7,
    0.9,
  );
  resumeBtn.setStrokeStyle(1.5, 0x38bdf8, 1);
  resumeBtn.setInteractive({ useHandCursor: true });

  const resumeText = scene.add.text(
    width / 2,
    height / 2 + 35,
    'ПРОДОЛЖИТЬ (P)',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    },
  );
  resumeText.setOrigin(0.5);

  resumeBtn.on('pointerover', () => resumeBtn.setFillStyle(0x0369a1, 1));
  resumeBtn.on('pointerout', () => resumeBtn.setFillStyle(0x0284c7, 0.9));
  resumeBtn.on('pointerdown', () => onResume());

  container.add([darkBg, modal, title, resumeBtn, resumeText]);

  return {
    container,
    show: () => container.setVisible(true),
    hide: () => container.setVisible(false),
    setVisible: (visible) => container.setVisible(visible),
  };
}
