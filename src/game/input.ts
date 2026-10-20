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
   * Проверка активного состояния игры
   */
  isGameOver: () => boolean;
  isPaused: () => boolean;
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
    if (actions.isGameOver() || actions.isPaused() || pointer.x >= 640) {
      return;
    }
    actions.onSelectRadarTarget(pointer.x, pointer.y);
  });

  if (!scene.input.keyboard) return;

  // Тактическая пауза (P)
  scene.input.keyboard.on('keydown-P', () => {
    actions.onTogglePause();
  });

  // Классификация целей (1, 2, 3)
  scene.input.keyboard.on('keydown-ONE', () => {
    if (!actions.isGameOver() && !actions.isPaused()) {
      actions.onDecision('friend');
    }
  });

  scene.input.keyboard.on('keydown-TWO', () => {
    if (!actions.isGameOver() && !actions.isPaused()) {
      actions.onDecision('threat');
    }
  });

  scene.input.keyboard.on('keydown-THREE', () => {
    if (!actions.isGameOver() && !actions.isPaused()) {
      actions.onDecision('ignore');
    }
  });

  // Сканирование сигнатуры (4)
  scene.input.keyboard.on('keydown-FOUR', () => {
    if (!actions.isGameOver() && !actions.isPaused()) {
      actions.onScan();
    }
  });

  // Снабжение: дозакупка ракет (5 / NumPad 5)
  const triggerBuyMissile = () => {
    if (!actions.isGameOver() && !actions.isPaused()) {
      actions.onBuyMissile();
    }
  };
  scene.input.keyboard.on('keydown-FIVE', triggerBuyMissile);
  scene.input.keyboard.on('keydown-NUMPAD_FIVE', triggerBuyMissile);

  // Снабжение: дозакупка сканов (6 / NumPad 6)
  const triggerBuyScan = () => {
    if (!actions.isGameOver() && !actions.isPaused()) {
      actions.onBuyScan();
    }
  };
  scene.input.keyboard.on('keydown-SIX', triggerBuyScan);
  scene.input.keyboard.on('keydown-NUMPAD_SIX', triggerBuyScan);

  // Перезапуск игры при поражении (Пробел)
  scene.input.keyboard.on('keydown-SPACE', () => {
    if (actions.isGameOver()) {
      actions.onRestart();
    }
  });
}
