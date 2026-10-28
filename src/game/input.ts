import Phaser from 'phaser';
import type { DecisionChoice } from './gameConfig';

/**
 * Интерфейс действий пользователя, инициируемых через события мыши и клавиатуры
 */
export interface GameInputActions {
  /**
   * Клик по экрану радара (x, y) для захвата цели
   */
  onSelectRadarTarget: (x: number, y: number) => void;

  /**
   * Переключение тактической паузы (клавиша P)
   */
  onTogglePause: () => void;

  /**
   * Принятие решения по классификации цели:
   * 1 - Свой борт ('friend')
   * 2 - Угроза / Перехват ('threat')
   * 3 - Игнорировать ('ignore')
   */
  onDecision: (choice: DecisionChoice) => void;

  /**
   * Запуск глубокого анализа сигнатуры цели (клавиша 4)
   */
  onScan: () => void;

  /**
   * Дозакупка ракеты-перехватчика (клавиша 5, NumPad 5)
   */
  onBuyMissile: () => void;

  /**
   * Дозакупка заряда сканирования (клавиша 6, NumPad 6)
   */
  onBuyScan: () => void;

  /**
   * Перезапуск игры после поражения (Пробел)
   */
  onRestart: () => void;

  /**
   * Закрытие экрана инструктажа (Пробел / Кнопка)
   */
  onCloseBriefing?: () => void;

  /**
   * Проверка активного состояния игры
   */
  isGameOver: () => boolean;
  isPaused: () => boolean;
  isBriefingOpen?: () => boolean;
}

/**
 * Настройка подписок на события пользовательского ввода (мышь и клавиатура)
 */
export function setupGameInputs(
  scene: Phaser.Scene,
  actions: GameInputActions,
): void {
  // Клик по экрану радара (зона левее консоли x < 640)
  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (
      actions.isGameOver() ||
      actions.isPaused() ||
      actions.isBriefingOpen?.() ||
      pointer.x >= 640
    ) {
      return;
    }
    actions.onSelectRadarTarget(pointer.x, pointer.y);
  });

  if (!scene.input.keyboard) return;

  const canAct = () =>
    !actions.isGameOver() &&
    !actions.isPaused() &&
    !actions.isBriefingOpen?.();

  const bindActiveKey = (key: string, callback: () => void) => {
    scene.input.keyboard!.on(key, () => {
      if (canAct()) callback();
    });
  };

  // Тактическая пауза / меню (P / Esc)
  const handleTogglePause = () => {
    if (actions.isBriefingOpen?.()) {
      if (actions.isPaused()) {
        actions.onCloseBriefing?.();
      }
    } else {
      actions.onTogglePause();
    }
  };

  scene.input.keyboard.on('keydown-P', handleTogglePause);
  scene.input.keyboard.on('keydown-ESC', handleTogglePause);

  // Классификация целей (1, 2, 3)
  bindActiveKey('keydown-ONE', () => actions.onDecision('friend'));
  bindActiveKey('keydown-TWO', () => actions.onDecision('threat'));
  bindActiveKey('keydown-THREE', () => actions.onDecision('ignore'));

  // Сканирование сигнатуры (4)
  bindActiveKey('keydown-FOUR', () => actions.onScan());

  // Снабжение: дозакупка ракет (5 / NumPad 5) и сканов (6 / NumPad 6)
  bindActiveKey('keydown-FIVE', () => actions.onBuyMissile());
  bindActiveKey('keydown-NUMPAD_FIVE', () => actions.onBuyMissile());
  bindActiveKey('keydown-SIX', () => actions.onBuyScan());
  bindActiveKey('keydown-NUMPAD_SIX', () => actions.onBuyScan());

  // Пробел: закрытие инструктажа или перезапуск после поражения
  scene.input.keyboard.on('keydown-SPACE', () => {
    if (actions.isBriefingOpen?.()) {
      actions.onCloseBriefing?.();
    } else if (actions.isGameOver()) {
      actions.onRestart();
    }
  });

  // Клавиша R: быстрый перезапуск из меню паузы или после поражения
  scene.input.keyboard.on('keydown-R', () => {
    if (actions.isPaused() || actions.isGameOver()) {
      actions.onRestart();
    }
  });
}
