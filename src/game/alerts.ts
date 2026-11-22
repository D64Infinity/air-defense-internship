import Phaser from 'phaser';
import { GAME_CONFIG, type TargetType } from './gameConfig';

/**
 * Данные оперативного оповещения о сбитии/перехвате цели
 */
export interface InterceptAlertData {
  unitType: TargetType;
  points: number;
  credits: number;
  isLongRange?: boolean;
  streakReset?: boolean;
  ammoLeft?: number;
}

/**
 * Данные оперативного оповещения о снабжении (покупка ракет/сканов)
 */
export interface SupplyAlertData {
  type: 'missile' | 'scan';
  success: boolean;
  current: number;
  max: number;
  cost: number;
  credits: number;
  reason?: 'max_capacity' | 'no_credits';
}

/**
 * Конфигурация всплывающих карточек оповещений (Alerts)
 */
export const ALERT_CONFIG = {
  boxY: 104, // высота расположения над радаром
  boxW: 430, // базовая ширина плашки оповещения
  boxH: 62, // высота плашки
  totalDuration: 2.2, // общее время показа оповещения (сек)
  fadeInDuration: 0.14, // время появления карточки (сек)
  fadeOutDuration: 0.55, // время затухания карточки (сек)
  cornerLength: 8, // длина засечек по углам
  cornerLineWidth: 2, // толщина угловых засечек
  statusPipWidth: 4, // ширина цветового индикатора статуса
  bgAlpha: 0.94, // непрозрачность фона
  borderAlpha: 0.85, // прозрачность рамки
  initialScale: 0.96, // стартовый масштаб при появлении
} as const;

/**
 * Интерфейс подсистемы оперативных оповещений
 */
export interface AlertManager {
  readonly container: Phaser.GameObjects.Container;
  showInterceptAlert: (data: InterceptAlertData) => void;
  showSupplyAlert: (data: SupplyAlertData) => void;
  update: (dt: number) => void;
}

/**
 * Фабрика системы оперативных оповещений (всплывающие тактические плашки над радаром)
 */
export function createAlertManager(scene: Phaser.Scene): AlertManager {
  const alertContainer = scene.add.container(GAME_CONFIG.radarX, ALERT_CONFIG.boxY);
  alertContainer.setDepth(28);
  alertContainer.setAlpha(0);
  alertContainer.setVisible(false);

  const alertBg = scene.add.graphics();
  const alertTitleText = scene.add.text(0, -10, '', {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: '14px',
    color: GAME_CONFIG.colors.text.white,
    fontStyle: 'bold',
    padding: { left: 4, right: 4, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  }).setOrigin(0.5);

  const alertOutcomeText = scene.add.text(0, 12, '', {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: '12px',
    color: GAME_CONFIG.colors.text.friendlyBonus,
    fontStyle: 'bold',
    padding: { left: 4, right: 4, top: 1, bottom: 1 },
    resolution: GAME_CONFIG.textResolution,
  }).setOrigin(0.5);

  alertContainer.add([alertBg, alertTitleText, alertOutcomeText]);

  let alertTimer = 0;
  const alertTotalDuration = ALERT_CONFIG.totalDuration;

  const renderAlert = (
    title: string,
    outcome: string,
    titleColor: string,
    outcomeColor: string,
    bgColor: number,
    borderColor: number,
    pipColor: number,
    boxW = ALERT_CONFIG.boxW,
  ) => {
    const boxH = ALERT_CONFIG.boxH;
    const halfW = boxW / 2;
    const halfH = boxH / 2;

    alertBg.clear();

    // Полупрозрачный тактический фон
    alertBg.fillStyle(bgColor, ALERT_CONFIG.bgAlpha);
    alertBg.fillRoundedRect(-halfW, -halfH, boxW, boxH, 4);

    // Рамка терминала
    alertBg.lineStyle(1.5, borderColor, ALERT_CONFIG.borderAlpha);
    alertBg.strokeRoundedRect(-halfW, -halfH, boxW, boxH, 4);

    // Левый вертикальный цветовой индикатор (Status Pip)
    alertBg.fillStyle(pipColor, 1);
    alertBg.fillRect(
      -halfW + 2,
      -halfH + 4,
      ALERT_CONFIG.statusPipWidth,
      boxH - 8,
    );

    // Угловые засечки
    const corner = ALERT_CONFIG.cornerLength;
    alertBg.lineStyle(ALERT_CONFIG.cornerLineWidth, pipColor, 0.95);
    alertBg.beginPath();
    // Top-left
    alertBg.moveTo(-halfW, -halfH + corner);
    alertBg.lineTo(-halfW, -halfH);
    alertBg.lineTo(-halfW + corner, -halfH);
    // Top-right
    alertBg.moveTo(halfW - corner, -halfH);
    alertBg.lineTo(halfW, -halfH);
    alertBg.lineTo(halfW, -halfH + corner);
    // Bottom-left
    alertBg.moveTo(-halfW, halfH - corner);
    alertBg.lineTo(-halfW, halfH);
    alertBg.lineTo(-halfW + corner, halfH);
    // Bottom-right
    alertBg.moveTo(halfW - corner, halfH);
    alertBg.lineTo(halfW, halfH);
    alertBg.lineTo(halfW, halfH - corner);
    alertBg.strokePath();

    alertTitleText.setText(title);
    alertTitleText.setColor(titleColor);

    alertOutcomeText.setText(outcome);
    alertOutcomeText.setColor(outcomeColor);

    alertTimer = alertTotalDuration;
    alertContainer.setScale(ALERT_CONFIG.initialScale);
    alertContainer.setAlpha(0);
    alertContainer.setVisible(true);
  };

  const showInterceptAlert = (data: InterceptAlertData) => {
    const { alerts, text } = GAME_CONFIG.colors;
    let title = '';
    let outcome = '';
    let titleColor = text.white;
    let outcomeColor = text.friendlyBonus;
    let bgColor = alerts.bgInfo;
    let borderColor = alerts.borderInfo;
    let pipColor = alerts.pipInfo;

    if (data.unitType === 'bomber') {
      title = '[ ПЕРЕХВАТ ] ТЯЖЁЛЫЙ БОМБАРДИРОВЩИК';
      const rangeTag = data.isLongRange ? ' | ДАЛЬНИЙ РУБЕЖ' : '';
      outcome = `+${data.points} ОЧК  |  +${data.credits} CR${rangeTag}`;
      titleColor = text.success;
      outcomeColor = text.friendlyBonus;
      bgColor = alerts.bgSuccess;
      borderColor = alerts.borderSuccess;
      pipColor = alerts.pipSuccess;
    } else if (data.unitType === 'missile') {
      title = '[ ПЕРЕХВАТ ] КРЫЛАТАЯ РАКЕТА';
      const rangeTag = data.isLongRange ? ' | ДАЛЬНИЙ РУБЕЖ' : '';
      outcome = `+${data.points} ОЧК  |  +${data.credits} CR${rangeTag}`;
      titleColor = text.info;
      outcomeColor = text.cyanLight;
      bgColor = alerts.bgInfo;
      borderColor = alerts.borderInfo;
      pipColor = alerts.pipInfo;
    } else if (data.unitType === 'jammer') {
      title = '[ ПЕРЕХВАТ ] САМОЛЁТ РЭБ «СТРОБ»';
      const rangeTag = data.isLongRange ? ' | ДАЛЬНИЙ РУБЕЖ' : '';
      outcome = `+${data.points} ОЧК | +${data.credits} CR | ЭФИР ЧИСТ${rangeTag}`;
      titleColor = text.gold;
      outcomeColor = text.friendlyBonus;
      bgColor = alerts.bgInfo;
      borderColor = 0xd97706;
      pipColor = 0xf59e0b;
    } else if (data.unitType === 'terrain_hugger') {
      title = '[ ПЕРЕХВАТ ] ШТУРМОВИК ПМВ «СТРИЖ»';
      const rangeTag = data.isLongRange ? ' | ДАЛЬНИЙ РУБЕЖ' : '';
      outcome = `+${data.points} ОЧК | +${data.credits} CR${rangeTag}`;
      titleColor = text.success;
      outcomeColor = text.friendlyBonus;
      bgColor = alerts.bgSuccess;
      borderColor = alerts.borderSuccess;
      pipColor = alerts.pipSuccess;
    } else if (data.unitType === 'friend') {
      title = '[ ТРЕВОГА ] ОГОНЬ ПО СВОИМ: СОЮЗНИК!';
      outcome = `${data.points} ОЧК | ${data.credits} CR | СЕРИЯ СБРОШЕНА`;
      titleColor = text.criticalPenalty;
      outcomeColor = text.redLight;
      bgColor = alerts.bgDanger;
      borderColor = alerts.borderDanger;
      pipColor = alerts.pipDanger;
    } else {
      // decoy
      title = '[ ЛОЖНАЯ ЦЕЛЬ ] ПЕРЕХВАТ ВПУСТУЮ';
      const ammoStr = data.ammoLeft !== undefined ? ` | РАКЕТ: ${data.ammoLeft}` : '';
      outcome = `0 ОЧК | СЕРИЯ СБРОШЕНА${ammoStr}`;
      titleColor = text.warning;
      outcomeColor = text.amberLight;
      bgColor = alerts.bgWarning;
      borderColor = alerts.borderWarning;
      pipColor = alerts.pipWarning;
    }

    renderAlert(title, outcome, titleColor, outcomeColor, bgColor, borderColor, pipColor, 430);
  };

  const showSupplyAlert = (data: SupplyAlertData) => {
    const { alerts, text } = GAME_CONFIG.colors;
    let title = '';
    let outcome = '';
    let titleColor = text.white;
    let outcomeColor = text.friendlyBonus;
    let bgColor = alerts.bgInfo;
    let borderColor = alerts.borderInfo;
    let pipColor = alerts.pipInfo;

    if (data.type === 'missile') {
      if (data.success) {
        title = '[ СНАБЖЕНИЕ ] РАКЕТА-ПЕРЕХВАТЧИК';
        const ammoBars = '|'.repeat(data.current).padEnd(data.max, ' ');
        outcome = `-${data.cost} CR  |  БОЕКОМПЛЕКТ: [${ammoBars}] ${data.current}/${data.max}`;
        titleColor = text.gold;
        outcomeColor = text.friendlyBonus;
        bgColor = alerts.bgGold;
        borderColor = alerts.borderGold;
        pipColor = alerts.pipGold;
      } else if (data.reason === 'max_capacity') {
        title = '[ СКЛАД ] БОЕКОМПЛЕКТ УЖЕ ПОЛОН';
        outcome = `МАКСИМУМ НА СКЛАДЕ: ${data.current}/${data.max} РАКЕТ`;
        titleColor = text.warning;
        outcomeColor = text.amberLight;
        bgColor = alerts.bgWarningWarm;
        borderColor = alerts.borderWarningWarm;
        pipColor = alerts.pipWarning;
      } else {
        // no_credits
        title = '[ ОТКАЗ ] НЕДОСТАТОЧНО КРЕДИТОВ';
        outcome = `ТРЕБУЕТСЯ: ${data.cost} CR  |  В НАЛИЧИИ: ${data.credits} CR`;
        titleColor = text.criticalPenalty;
        outcomeColor = text.redLight;
        bgColor = alerts.bgDanger;
        borderColor = alerts.borderDanger;
        pipColor = alerts.pipDanger;
      }
    } else {
      // scan
      if (data.success) {
        title = '[ СНАБЖЕНИЕ ] ЗАРЯД СКАНИРОВАНИЯ';
        const scanStars = '*'.repeat(data.current).padEnd(data.max, ' ');
        outcome = `-${data.cost} CR  |  СКАНЕРЫ: [${scanStars}] ${data.current}/${data.max}`;
        titleColor = text.info;
        outcomeColor = text.cyanLight;
        bgColor = alerts.bgInfo;
        borderColor = alerts.borderInfo;
        pipColor = alerts.pipInfo;
      } else if (data.reason === 'max_capacity') {
        title = '[ СЕНСОРЫ ] СИСТЕМА СКАНИРОВАНИЯ ПОЛНА';
        outcome = `МАКСИМУМ В СИСТЕМЕ: ${data.current}/${data.max} ЗАРЯДОВ`;
        titleColor = text.info;
        outcomeColor = text.blueLight;
        bgColor = alerts.bgSupplyDeep;
        borderColor = alerts.borderSupplyDeep;
        pipColor = alerts.pipInfo;
      } else {
        // no_credits
        title = '[ ОТКАЗ ] НЕДОСТАТОЧНО КРЕДИТОВ';
        outcome = `ТРЕБУЕТСЯ: ${data.cost} CR  |  В НАЛИЧИИ: ${data.credits} CR`;
        titleColor = text.criticalPenalty;
        outcomeColor = text.redLight;
        bgColor = alerts.bgDanger;
        borderColor = alerts.borderDanger;
        pipColor = alerts.pipDanger;
      }
    }

    renderAlert(title, outcome, titleColor, outcomeColor, bgColor, borderColor, pipColor, 430);
  };

  const update = (dt: number) => {
    if (alertTimer > 0) {
      alertTimer -= dt;
      if (alertTimer <= 0) {
        alertContainer.setVisible(false);
        alertContainer.setAlpha(0);
        return;
      }

      const elapsed = alertTotalDuration - alertTimer;
      const { fadeInDuration, fadeOutDuration, initialScale } = ALERT_CONFIG;

      let alpha = 1.0;
      let scale = 1.0;

      if (elapsed < fadeInDuration) {
        const progress = elapsed / fadeInDuration;
        alpha = progress;
        scale = initialScale + (1.0 - initialScale) * progress;
      } else if (alertTimer < fadeOutDuration) {
        alpha = alertTimer / fadeOutDuration;
        scale = 1.0;
      }

      alertContainer.setAlpha(alpha);
      alertContainer.setScale(scale);
    }
  };

  return {
    container: alertContainer,
    showInterceptAlert,
    showSupplyAlert,
    update,
  };
}
