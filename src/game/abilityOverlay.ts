import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig';
import type { AbilityDefinition, AbilityId } from './abilities';

/**
 * Конфигурация угловой кнопки активной способности в правом нижнем углу корпуса радара
 */
export const ABILITY_WIDGET_CONFIG = {
  centerX: 578,
  centerY: 556,
  size: 54,
  tooltipGapX: 14,
} as const;

/**
 * Авторские векторные иконки 5 активных способностей (для кнопки и карточек выбора)
 */
const ABILITY_ICONS: Record<
  AbilityId,
  (g: Phaser.GameObjects.Graphics, cx: number, cy: number, alpha: number) => void
> = {
  radar_pulse: (g, cx, cy, alpha) => {
    for (const [r, a] of [
      [15, 0.45],
      [10, 0.72],
      [5, 0.95],
    ] as const) {
      g.lineStyle(1.4, 0x38bdf8, a * alpha);
      g.strokeCircle(cx, cy, r);
    }
    g.fillStyle(0xe0f2fe, alpha);
    g.fillCircle(cx, cy, 2.5);
    g.lineStyle(1.3, 0x7dd3fc, 0.9 * alpha);
    g.lineBetween(cx, cy - 18, cx, cy - 12);
    g.lineBetween(cx, cy + 12, cx, cy + 18);
    g.lineBetween(cx - 18, cy, cx - 12, cy);
    g.lineBetween(cx + 12, cy, cx + 18, cy);
  },

  tactical_stasis: (g, cx, cy, alpha) => {
    g.lineStyle(1.7, 0x67e8f9, 0.95 * alpha);
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI / 3) * i;
      const dx = Math.cos(a) * 14;
      const dy = Math.sin(a) * 14;
      g.lineBetween(cx - dx, cy - dy, cx + dx, cy + dy);

      // Кристаллические усики на концах лучей
      const bx = Math.cos(a) * 9.5;
      const by = Math.sin(a) * 9.5;
      const px = -Math.sin(a) * 4;
      const py = Math.cos(a) * 4;
      g.lineBetween(cx + bx, cy + by, cx + dx - px * 0.5 + px, cy + dy - py * 0.5 + py);
      g.lineBetween(cx + bx, cy + by, cx + dx + px * 0.5 - px, cy + dy + py * 0.5 - py);
      g.lineBetween(cx - bx, cy - by, cx - dx + px, cy - dy + py);
      g.lineBetween(cx - bx, cy - by, cx - dx - px, cy - dy - py);
    }
    g.fillStyle(0xe0f2fe, alpha);
    g.fillCircle(cx, cy, 3);
  },

  defense_dome: (g, cx, cy, alpha) => {
    // Защитная дуга энергетического купола
    g.lineStyle(4, 0xfacc15, 0.2 * alpha);
    g.beginPath();
    g.arc(cx, cy + 7, 16, Math.PI, 0, false);
    g.strokePath();

    g.lineStyle(2, 0xfacc15, 0.95 * alpha);
    g.beginPath();
    g.arc(cx, cy + 7, 16, Math.PI, 0, false);
    g.strokePath();

    g.lineStyle(1.1, 0xfef08a, 0.7 * alpha);
    g.beginPath();
    g.arc(cx, cy + 7, 11.5, Math.PI + 0.25, -0.25, false);
    g.strokePath();

    // База под куполом
    g.lineStyle(1.2, 0xfacc15, 0.65 * alpha);
    g.lineBetween(cx - 17, cy + 8, cx + 17, cy + 8);
    g.fillStyle(0xfef08a, alpha);
    g.fillCircle(cx, cy + 4, 2.8);
  },

  emp_sweep: (g, cx, cy, alpha) => {
    g.lineStyle(1.4, 0xc084fc, 0.65 * alpha);
    g.strokeCircle(cx, cy, 15);
    g.lineStyle(1.1, 0xa855f7, 0.35 * alpha);
    g.strokeCircle(cx, cy, 10);

    // Молния высокого напряжения
    g.fillStyle(0xf3e8ff, alpha);
    g.beginPath();
    g.moveTo(cx + 3, cy - 13);
    g.lineTo(cx - 6, cy + 1);
    g.lineTo(cx, cy + 1);
    g.lineTo(cx - 3, cy + 13);
    g.lineTo(cx + 6, cy - 1);
    g.lineTo(cx, cy - 1);
    g.closePath();
    g.fillPath();
  },

  field_drop: (g, cx, cy, alpha) => {
    // Купол парашюта
    g.lineStyle(1.6, 0x4ade80, alpha);
    g.beginPath();
    g.arc(cx, cy - 4, 13, Math.PI, 0, false);
    g.strokePath();
    g.lineStyle(1, 0x86efac, 0.75 * alpha);
    g.lineBetween(cx - 13, cy - 4, cx - 5, cy + 4);
    g.lineBetween(cx + 13, cy - 4, cx + 5, cy + 4);
    g.lineBetween(cx, cy - 17, cx, cy + 4);

    // Контейнер снабжения с крестом
    g.fillStyle(0x14532d, 0.95 * alpha);
    g.fillRect(cx - 7, cy + 4, 14, 11);
    g.lineStyle(1.4, 0x4ade80, alpha);
    g.strokeRect(cx - 7, cy + 4, 14, 11);
    g.lineStyle(1.6, 0xdcfce7, alpha);
    g.lineBetween(cx - 3, cy + 9.5, cx + 3, cy + 9.5);
    g.lineBetween(cx, cy + 6.5, cx, cy + 12.5);
  },
};

function drawPadlockIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  g.lineStyle(1.6, 0x475569, 0.85);
  g.beginPath();
  g.arc(cx, cy - 4, 5, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(0x1e293b, 0.95);
  g.fillRoundedRect(cx - 7, cy - 3, 14, 11, 2);
  g.lineStyle(1.3, 0x475569, 0.9);
  g.strokeRoundedRect(cx - 7, cy - 3, 14, 11, 2);
  g.fillStyle(0x64748b, 0.9);
  g.fillCircle(cx, cy + 2.5, 1.5);
}

export interface AbilityButtonWidget {
  setVisible: (visible: boolean) => void;
  sync: (
    ability: AbilityDefinition | null,
    chargeRatio: number,
    isReady: boolean,
    stasisRemaining: number,
    showHotkeyHint: boolean,
  ) => void;
}

/**
 * Угловая кнопка активной способности в правом нижнем углу корпуса радара (578, 556)
 */
export function createAbilityButtonWidget(
  scene: Phaser.Scene,
  onActivate: () => void,
): AbilityButtonWidget {
  const { centerX: ax, centerY: ay, size: aSize, tooltipGapX } =
    ABILITY_WIDGET_CONFIG;
  const monoStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  };

  const bgGfx = scene.add.graphics().setDepth(21);
  const iconGfx = scene.add.graphics().setDepth(22);

  const labelText = scene.add
    .text(ax, ay + aSize / 2 + 9, 'ПУСТО', {
      ...monoStyle,
      fontSize: '9px',
      color: '#64748b',
      fontStyle: 'bold',
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(22);

  // Всплывающая подсказка слева от угловой кнопки
  const tooltipContainer = scene.add
    .container(ax - aSize / 2 - tooltipGapX, ay)
    .setDepth(35)
    .setVisible(false);
  const tooltipBg = scene.add.graphics();
  const tooltipTitle = scene.add
    .text(-12, -10, '', { ...monoStyle, fontSize: '12px', fontStyle: 'bold' })
    .setOrigin(1, 0.5);
  const tooltipDesc = scene.add
    .text(-12, 10, '', {
      ...monoStyle,
      fontSize: '11px',
      color: '#e2e8f0',
      fontStyle: 'bold',
    })
    .setOrigin(1, 0.5);
  tooltipContainer.add([tooltipBg, tooltipTitle, tooltipDesc]);

  const hitArea = scene.add
    .rectangle(ax, ay + 5, aSize + 8, aSize + 18, 0x000000, 0)
    .setDepth(23)
    .setInteractive({ useHandCursor: true });

  let canClick = false;
  let isHovered = false;
  let lastRenderKey = '';

  const redraw = (
    ability: AbilityDefinition | null,
    chargeRatio: number,
    isReady: boolean,
    stasisRemaining: number,
    showHotkeyHint: boolean,
  ) => {
    const pct = Math.round(chargeRatio * 100);
    const key = `${ability?.id ?? 'locked'}|${Math.round(chargeRatio * 20)}|${isReady ? 1 : 0}|${stasisRemaining > 0 ? 1 : 0}|${showHotkeyHint ? 1 : 0}|${isHovered ? 1 : 0}`;
    if (key === lastRenderKey) return;
    lastRenderKey = key;

    const half = aSize / 2;
    const borderCol = !ability
      ? 0x1e293b
      : isReady
        ? ability.borderColor
        : 0x334155;
    const accentHex = !ability ? '#64748b' : ability.accentColor;

    bgGfx.clear();
    bgGfx.fillStyle(0x030c09, 0.96);
    bgGfx.fillRoundedRect(ax - half, ay - half, aSize, aSize, 4);

    if (ability && chargeRatio > 0) {
      const innerPad = 3;
      const innerH = aSize - innerPad * 2;
      const fillH = Math.max(2, Math.round(innerH * chargeRatio));
      bgGfx.fillStyle(
        ability.borderColor,
        isReady ? (isHovered ? 0.28 : 0.18) : 0.12,
      );
      bgGfx.fillRect(
        ax - half + innerPad,
        ay + half - innerPad - fillH,
        aSize - innerPad * 2,
        fillH,
      );
    }

    // Сканлайны дисплея кнопки
    bgGfx.lineStyle(1, ability ? ability.borderColor : 0x475569, isReady ? 0.12 : 0.04);
    for (let sy = ay - half + 5; sy < ay + half - 3; sy += 4) {
      bgGfx.lineBetween(ax - half + 3, sy, ax + half - 3, sy);
    }

    bgGfx.lineStyle(isReady ? 2 : 1.4, borderCol, isReady ? 0.98 : 0.65);
    bgGfx.strokeRoundedRect(ax - half, ay - half, aSize, aSize, 4);

    // Засечки углов
    const c = 6;
    bgGfx.lineStyle(1.5, isReady && ability ? ability.borderColor : 0x334155, 0.95);
    bgGfx.beginPath();
    bgGfx.moveTo(ax - half, ay - half + c);
    bgGfx.lineTo(ax - half, ay - half);
    bgGfx.lineTo(ax - half + c, ay - half);
    bgGfx.moveTo(ax + half - c, ay - half);
    bgGfx.lineTo(ax + half, ay - half);
    bgGfx.lineTo(ax + half, ay - half + c);
    bgGfx.moveTo(ax - half, ay + half - c);
    bgGfx.lineTo(ax - half, ay + half);
    bgGfx.lineTo(ax - half + c, ay + half);
    bgGfx.moveTo(ax + half - c, ay + half);
    bgGfx.lineTo(ax + half, ay + half);
    bgGfx.lineTo(ax + half, ay + half - c);
    bgGfx.strokePath();

    // Индикатор готовности в углу
    bgGfx.fillStyle(
      ability && isReady ? ability.borderColor : 0x475569,
      isReady ? 1 : 0.4,
    );
    bgGfx.fillCircle(ax + half - 6, ay - half + 6, 2);

    iconGfx.clear();
    if (!ability) {
      drawPadlockIcon(iconGfx, ax, ay);
      labelText.setText('ПУСТО').setColor('#64748b');
    } else {
      ABILITY_ICONS[ability.id](iconGfx, ax, ay, isReady ? 1.0 : 0.48);
      if (stasisRemaining > 0) {
        labelText.setText(`${stasisRemaining.toFixed(1)}С`).setColor(accentHex);
      } else if (isReady) {
        const readyLabel =
          !GAME_CONFIG.isMobile && showHotkeyHint
            ? 'ПРОБЕЛ'
            : ability.shortLabel;
        labelText.setText(readyLabel).setColor(accentHex);
      } else {
        labelText.setText(`${pct}%`).setColor('#94a3b8');
      }
    }

    // Обновление контекстного тултипа
    tooltipTitle.setText(
      ability
        ? `[ ${ability.title} • ${isReady ? (GAME_CONFIG.isMobile ? 'ГОТОВО' : 'ГОТОВО • ПРОБЕЛ') : `ЗАРЯД ${pct}%`} ]`
        : '[ МОДУЛЬ СПЕЦСРЕДСТВ ]',
    );
    tooltipTitle.setColor(ability ? accentHex : '#94a3b8');
    tooltipDesc.setText(
      ability ? ability.tooltipDesc : 'ОТКРОЕТСЯ НА 3-Й ВОЛНЕ',
    );

    const tipW = Math.max(tooltipTitle.width, tooltipDesc.width) + 28;
    const tipH = 48;
    tooltipBg.clear();
    tooltipBg.fillStyle(0x020b12, 0.97);
    tooltipBg.fillRoundedRect(-tipW, -tipH / 2, tipW, tipH, 4);
    tooltipBg.lineStyle(1.4, ability ? ability.borderColor : 0x475569, 0.92);
    tooltipBg.strokeRoundedRect(-tipW, -tipH / 2, tipW, tipH, 4);
    tooltipBg.fillStyle(ability ? ability.borderColor : 0x475569, 1);
    tooltipBg.fillRect(-tipW, -tipH / 2 + 4, 3, tipH - 8);
  };

  let latestArgs: [AbilityDefinition | null, number, boolean, number, boolean] = [
    null,
    0,
    false,
    0,
    true,
  ];

  hitArea.on('pointerover', () => {
    isHovered = true;
    tooltipContainer.setVisible(true);
    redraw(...latestArgs);
  });
  hitArea.on('pointerout', () => {
    isHovered = false;
    tooltipContainer.setVisible(false);
    redraw(...latestArgs);
  });
  hitArea.on('pointerdown', () => {
    if (canClick) {
      onActivate();
    }
  });

  redraw(null, 0, false, 0, true);

  return {
    setVisible: (visible: boolean) => {
      bgGfx.setVisible(visible);
      iconGfx.setVisible(visible);
      labelText.setVisible(visible);
      hitArea.setVisible(visible);
      if (!visible) {
        isHovered = false;
        tooltipContainer.setVisible(false);
      }
    },
    sync: (ability, chargeRatio, isReady, stasisRemaining, showHotkeyHint) => {
      canClick = Boolean(ability && isReady);
      latestArgs = [ability, chargeRatio, isReady, stasisRemaining, showHotkeyHint];
      redraw(ability, chargeRatio, isReady, stasisRemaining, showHotkeyHint);
    },
  };
}

export interface AbilityDraftOverlay {
  readonly isVisible: boolean;
  show: (
    choices: AbilityDefinition[],
    wave: number,
    replacedAbility: AbilityDefinition | null,
  ) => void;
  hide: () => void;
  pickByIndex: (index: number) => void;
}

/**
 * Окно выбора активной способности каждые 3 волны (с обязательной заменой прошлой)
 */
export function createAbilityDraftOverlay(
  scene: Phaser.Scene,
  onSelect: (id: AbilityId) => void,
): AbilityDraftOverlay {
  const container = scene.add.container(0, 0).setDepth(62).setVisible(false);
  const { canvasWidth, canvasHeight } = GAME_CONFIG;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const boxW = 756;
  const boxH = 358;
  const halfW = boxW / 2;
  const halfH = boxH / 2;

  const monoStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  };

  // Блокирующий фон
  const backdrop = scene.add
    .rectangle(cx, cy, canvasWidth, canvasHeight, 0x010704, 0.8)
    .setInteractive();
  container.add(backdrop);

  const frameGfx = scene.add.graphics();
  frameGfx.fillStyle(0x031118, 0.97);
  frameGfx.fillRoundedRect(cx - halfW, cy - halfH, boxW, boxH, 6);
  frameGfx.lineStyle(1.6, 0x38bdf8, 0.9);
  frameGfx.strokeRoundedRect(cx - halfW, cy - halfH, boxW, boxH, 6);
  frameGfx.lineStyle(3, 0x38bdf8, 1);
  frameGfx.lineBetween(cx - halfW + 24, cy - halfH, cx + halfW - 24, cy - halfH);
  container.add(frameGfx);

  const headerText = scene.add
    .text(cx, cy - halfH + 28, '', {
      ...monoStyle,
      fontSize: '18px',
      color: '#f8fafc',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  const subHeaderText = scene.add
    .text(cx, cy - halfH + 54, '', {
      ...monoStyle,
      fontSize: '12px',
      color: '#facc15',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  container.add([headerText, subHeaderText]);

  const cardW = 220;
  const cardH = 228;
  const cardGap = 18;
  const startX = cx - (cardW * 3 + cardGap * 2) / 2 + cardW / 2;
  const cardCenterY = cy + 28;

  let currentChoices: AbilityDefinition[] = [];

  const cards = [0, 1, 2].map((idx) => {
    const cardX = startX + idx * (cardW + cardGap);
    const cardBg = scene.add.graphics();
    const cardIcon = scene.add.graphics();

    const hotkeyText = scene.add
      .text(cardX + cardW / 2 - 12, cardCenterY - cardH / 2 + 14, `[${idx + 1}]`, {
        ...monoStyle,
        fontSize: '11px',
        color: '#94a3b8',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setVisible(!GAME_CONFIG.isMobile);

    const tierText = scene.add
      .text(cardX - cardW / 2 + 14, cardCenterY - cardH / 2 + 14, '', {
        ...monoStyle,
        fontSize: '10px',
        color: '#94a3b8',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    const nameText = scene.add
      .text(cardX, cardCenterY - 8, '', {
        ...monoStyle,
        fontSize: '15px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const descText = scene.add
      .text(cardX, cardCenterY + 46, '', {
        ...monoStyle,
        fontSize: '12px',
        color: '#cbd5e1',
        align: 'center',
        lineSpacing: 5,
      })
      .setOrigin(0.5);

    const hit = scene.add
      .rectangle(cardX, cardCenterY, cardW, cardH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    const drawCardFrame = (hovered: boolean) => {
      const def = currentChoices[idx];
      if (!def) return;
      const cw = cardW / 2;
      const ch = cardH / 2;
      cardBg.clear();
      cardBg.fillStyle(hovered ? 0x09202e : 0x04131c, 0.96);
      cardBg.fillRoundedRect(cardX - cw, cardCenterY - ch, cardW, cardH, 5);
      cardBg.fillStyle(def.borderColor, hovered ? 0.14 : 0.05);
      cardBg.fillRoundedRect(cardX - cw, cardCenterY - ch, cardW, cardH, 5);
      cardBg.lineStyle(hovered ? 2.2 : 1.4, def.borderColor, hovered ? 1 : 0.78);
      cardBg.strokeRoundedRect(cardX - cw, cardCenterY - ch, cardW, cardH, 5);

      // Мини-окошко под иконку
      const iconCy = cardCenterY - 58;
      cardBg.fillStyle(0x02090d, 0.95);
      cardBg.fillRoundedRect(cardX - 26, iconCy - 26, 52, 52, 4);
      cardBg.lineStyle(1.2, def.borderColor, 0.75);
      cardBg.strokeRoundedRect(cardX - 26, iconCy - 26, 52, 52, 4);
    };

    hit.on('pointerover', () => drawCardFrame(true));
    hit.on('pointerout', () => drawCardFrame(false));
    hit.on('pointerdown', () => {
      const def = currentChoices[idx];
      if (def) {
        container.setVisible(false);
        onSelect(def.id);
      }
    });

    container.add([
      cardBg,
      cardIcon,
      hotkeyText,
      tierText,
      nameText,
      descText,
      hit,
    ]);

    return {
      render: (def: AbilityDefinition) => {
        drawCardFrame(false);
        cardIcon.clear();
        ABILITY_ICONS[def.id](cardIcon, cardX, cardCenterY - 58, 1.0);
        tierText.setText(def.chargeTierLabel).setColor(def.accentColor);
        nameText.setText(def.title).setColor(def.accentColor);
        descText.setText(def.subtitle);
      },
    };
  });

  const show = (
    choices: AbilityDefinition[],
    wave: number,
    replacedAbility: AbilityDefinition | null,
  ) => {
    currentChoices = choices;
    headerText.setText(`[ АРСЕНАЛ • ВОЛНА ${wave} ]`);
    subHeaderText.setText(
      replacedAbility
        ? `ЗАМЕНА «${replacedAbility.title}» НА СЛЕДУЮЩИЕ 3 ВОЛНЫ`
        : GAME_CONFIG.isMobile
          ? 'НА 3 ВОЛНЫ • ЗАПУСК КНОПКОЙ В УГЛУ'
          : 'НА 3 ВОЛНЫ • ЗАПУСК: ПРОБЕЛ ИЛИ КНОПКА В УГЛУ',
    );

    choices.forEach((def, idx) => {
      cards[idx]?.render(def);
    });
    container.setVisible(true);
  };

  const hide = () => {
    container.setVisible(false);
  };

  const pickByIndex = (index: number) => {
    if (!container.visible) return;
    const def = currentChoices[index];
    if (!def) return;
    container.setVisible(false);
    onSelect(def.id);
  };

  return {
    get isVisible() {
      return container.visible;
    },
    show,
    hide,
    pickByIndex,
  };
}
