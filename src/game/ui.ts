import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type DecisionChoice,
  type GameTarget,
} from './gameConfig';

export interface GameSessionStats {
  missilesShot: number;
  bombersShot: number;
  friendsSaved: number;
  threatsMissed: number;
  friendlyFireCount: number;
}

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
    340,
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
    height / 2 + 25,
    'ВОЛНА: 1 | МАКС. СЕРИЯ: 0',
    {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#94a3b8',
    },
  );
  wavesText.setOrigin(0.5);

  const statsText = scene.add.text(width / 2, height / 2 + 55, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '12px',
    color: '#cbd5e1',
    align: 'center',
    lineSpacing: 3,
  }).setOrigin(0.5);

  // Кнопка рестарта
  const restartBtn = scene.add.rectangle(
    width / 2,
    height / 2 + 105,
    260,
    42,
    0x16a34a,
    0.9,
  );
  restartBtn.setStrokeStyle(1.5, 0x4ade80, 1);
  restartBtn.setInteractive({ useHandCursor: true });

  const restartText = scene.add.text(
    width / 2,
    height / 2 + 105,
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
      statsText.setText(
        `СБИТО: ${stats.missilesShot} РАКЕТ, ${stats.bombersShot} БОМБ.\n` +
        `СОЮЗНИКИ: ${stats.friendsSaved} | ПРОПУЩЕНО: ${stats.threatsMissed}` +
        (stats.friendlyFireCount > 0 ? ` | СВОИ: -${stats.friendlyFireCount}` : ''),
      );
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

  // 2. Текстовые элементы консоли
  const monoStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'Consolas, monospace',
    fontSize: '13px',
    color: '#4ade80',
  };

  scene.add.text(660, 44, '[ КОНСОЛЬ ОПЕРАТОРА ПВО ]', {
    ...monoStyle,
    fontSize: '13px',
    color: '#86efac',
    fontStyle: 'bold',
  });

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

  const feedbackText = scene.add.text(660, 448, '', {
    ...monoStyle,
    fontSize: '11px',
    fontStyle: 'bold',
  });

  scene.add.text(
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

  // 3. Баннер волны
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
    },
  );
  waveBannerText.setOrigin(0.5);
  waveBannerText.setAlpha(0);

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

  const startY = 295;
  const btnW = 255;
  const btnH = 26;
  const gap = 4;

  const buttons = {
    friend: createButton(
      660,
      startY,
      btnW,
      btnH,
      '[1] СВОЙ БОРТ',
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
      '[3] ИГНОРИРОВАТЬ',
      GAME_CONFIG.colors.btnIgnore,
      () => callbacks.onDecision('ignore'),
    ),
    scan: createButton(
      660,
      startY + (btnH + gap) * 3,
      btnW,
      btnH,
      '[4] СКАН СИГНАТУРЫ (1.5с)',
      GAME_CONFIG.colors.btnScan,
      () => callbacks.onScan(),
    ),
    buyMissile: createButton(
      660,
      startY + (btnH + gap) * 4,
      124,
      btnH,
      `[5] +РАКЕТА (${GAME_CONFIG.interceptorCost} CR)`,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyMissile(),
      '11px',
    ),
    buyScan: createButton(
      660 + 124 + 7,
      startY + (btnH + gap) * 4,
      124,
      btnH,
      `[6] +СКАН (${GAME_CONFIG.scanCost} CR)`,
      GAME_CONFIG.colors.btnSupply,
      () => callbacks.onBuyScan(),
      '11px',
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
    const mult = (
      1 +
      Math.floor(data.streak / GAME_CONFIG.streakStepForMultiplier) * 0.5
    ).toFixed(1);
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

    targetTelemetryTitle.setText(`ОБЪЕКТ СЛЕЖЕНИЯ: #TRK-${t.id}`);
    targetTelemetryTitle.setColor('#facc15');

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

  return {
    drawHealthBar,
    updateScoreBoard,
    updateTargetSelectionUI,
    updateTelemetry,
    showFeedback,
    updateFeedback,
    showWaveBanner,
    updateWaveBanner,
  };
}

