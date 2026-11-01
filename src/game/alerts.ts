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
  const alertContainer = scene.add.container(GAME_CONFIG.radarX, 104);
  alertContainer.setDepth(28);
  alertContainer.setAlpha(0);
  alertContainer.setVisible(false);

  const alertBg = scene.add.graphics();
  const alertTitleText = scene.add.text(0, -9, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '15px',
    color: GAME_CONFIG.colors.text.white,
    fontStyle: 'bold',
  }).setOrigin(0.5);

  const alertOutcomeText = scene.add.text(0, 13, '', {
    fontFamily: 'Consolas, monospace',
    fontSize: '13px',
    color: GAME_CONFIG.colors.text.friendlyBonus,
    fontStyle: 'bold',
  }).setOrigin(0.5);

  alertContainer.add([alertBg, alertTitleText, alertOutcomeText]);

  let alertTimer = 0;
  const alertTotalDuration = 2.2;

  const renderAlert = (
    title: string,
    outcome: string,
    titleColor: string,
    outcomeColor: string,
    bgColor: number,
    borderColor: number,
    pipColor: number,
    boxW = 380,
  ) => {
    const boxH = 64;
    const halfW = boxW / 2;
    const halfH = boxH / 2;

    alertBg.clear();

    // Полупрозрачный тактический фон
    alertBg.fillStyle(bgColor, 0.94);
    alertBg.fillRoundedRect(-halfW, -halfH, boxW, boxH, 4);

    // Рамка терминала
    alertBg.lineStyle(1.5, borderColor, 0.85);
    alertBg.strokeRoundedRect(-halfW, -halfH, boxW, boxH, 4);

    // Левый вертикальный цветовой индикатор (Status Pip)
    alertBg.fillStyle(pipColor, 1);
    alertBg.fillRect(-halfW + 2, -halfH + 4, 4, boxH - 8);

    // Угловые засечки
    const corner = 8;
    alertBg.lineStyle(2, pipColor, 0.95);
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
    alertContainer.setScale(0.96);
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
    } else if (data.unitType === 'friend') {
      title = '[ ТРЕВОГА ] ОГОНЬ ПО СВОИМ: СОЮЗНИК!';
      outcome = `${data.points} ОЧК  |  ${data.credits} CR  |  СЕРИЯ СБРОШЕНА`;
      titleColor = text.criticalPenalty;
      outcomeColor = text.redLight;
      bgColor = alerts.bgDanger;
      borderColor = alerts.borderDanger;
      pipColor = alerts.pipDanger;
    } else {
      // decoy
      title = '[ ЛОЖНАЯ ЦЕЛЬ ] ПЕРЕХВАТ ВПУСТУЮ';
      const ammoStr = data.ammoLeft !== undefined ? `  |  РАКЕТ: ${data.ammoLeft}` : '';
      outcome = `0 ОЧК  |  СЕРИЯ СБРОШЕНА${ammoStr}`;
      titleColor = text.warning;
      outcomeColor = text.amberLight;
      bgColor = alerts.bgWarning;
      borderColor = alerts.borderWarning;
      pipColor = alerts.pipWarning;
    }

    renderAlert(title, outcome, titleColor, outcomeColor, bgColor, borderColor, pipColor, 380);
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

    renderAlert(title, outcome, titleColor, outcomeColor, bgColor, borderColor, pipColor, 380);
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
      const fadeInDuration = 0.14;
      const fadeOutDuration = 0.55;

      let alpha = 1.0;
      let scale = 1.0;

      if (elapsed < fadeInDuration) {
        const progress = elapsed / fadeInDuration;
        alpha = progress;
        scale = 0.96 + 0.04 * progress;
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
