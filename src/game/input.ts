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
   * Закрытие журнала боевых дежурств (Пробел / Esc / Кнопка)
   */
  onCloseArchive?: () => void;

  /**
   * Активация выбранной спецспособности (Пробел) и выбор карточки драфта (1/2/3)
   */
  onActivateAbility?: () => void;
  onPickAbilityDraft?: (index: number) => void;

  /**
   * Проверка активного состояния игры
   */
  isGameOver: () => boolean;
  isPaused: () => boolean;
  isBriefingOpen?: () => boolean;
  isArchiveOpen?: () => boolean;
  isAbilityDraftOpen?: () => boolean;
  isGameStarted?: () => boolean;
}

/**
 * Настройка подписок на события пользовательского ввода (мышь и клавиатура)
 */
export function setupGameInputs(
  scene: Phaser.Scene,
  actions: GameInputActions,
): () => void {
  // Клик по экрану радара (зона левее консоли x < 640, исключая угловые виджеты)
  const onPointerDown = (pointer: Phaser.Input.Pointer) => {
    if (
      actions.isGameStarted?.() === false ||
      actions.isGameOver() ||
      actions.isPaused() ||
      actions.isBriefingOpen?.() ||
      actions.isArchiveOpen?.() ||
      actions.isAbilityDraftOpen?.() ||
      pointer.x >= 640 ||
      (pointer.x < 150 && pointer.y < 65) ||
      (pointer.x > 540 && pointer.y > 515)
    ) {
      return;
    }
    actions.onSelectRadarTarget(pointer.x, pointer.y);
  };

  scene.input.on('pointerdown', onPointerDown);

  const keyBindings: Array<{ key: string; handler: () => void }> = [];

  const bindKey = (key: string, handler: () => void) => {
    if (!scene.input.keyboard) return;
    scene.input.keyboard.on(key, handler);
    keyBindings.push({ key, handler });
  };

  const canAct = () =>
    actions.isGameStarted?.() !== false &&
    !actions.isGameOver() &&
    !actions.isPaused() &&
    !actions.isBriefingOpen?.() &&
    !actions.isArchiveOpen?.() &&
    !actions.isAbilityDraftOpen?.();

  const bindActiveKey = (key: string, callback: () => void) => {
    bindKey(key, () => {
      if (canAct()) callback();
    });
  };

  // Тактическая пауза / меню (P / Esc) и закрытие открытых терминальных окон
  const handleTogglePause = () => {
    if (actions.isArchiveOpen?.()) {
      actions.onCloseArchive?.();
      return;
    }
    if (actions.isAbilityDraftOpen?.()) return;
    if (actions.isGameStarted?.() === false) return;
    if (actions.isBriefingOpen?.()) {
      if (actions.isPaused()) {
        actions.onCloseBriefing?.();
      }
    } else {
      actions.onTogglePause();
    }
  };

  bindKey('keydown-P', () => {
    if (actions.isArchiveOpen?.()) return;
    handleTogglePause();
  });
  bindKey('keydown-ESC', handleTogglePause);

  // Классификация целей (1, 2, 3 / NumPad 1, 2, 3) или выбор карточки абилки в драфте
  const handleNumberKey = (idx: number, choice: DecisionChoice) => {
    if (actions.isAbilityDraftOpen?.()) {
      actions.onPickAbilityDraft?.(idx);
      return;
    }
    if (canAct()) {
      actions.onDecision(choice);
    }
  };

  bindKey('keydown-ONE', () => handleNumberKey(0, 'friend'));
  bindKey('keydown-NUMPAD_ONE', () => handleNumberKey(0, 'friend'));
  bindKey('keydown-TWO', () => handleNumberKey(1, 'threat'));
  bindKey('keydown-NUMPAD_TWO', () => handleNumberKey(1, 'threat'));
  bindKey('keydown-THREE', () => handleNumberKey(2, 'ignore'));
  bindKey('keydown-NUMPAD_THREE', () => handleNumberKey(2, 'ignore'));

  // Сканирование сигнатуры (4 / NumPad 4)
  bindActiveKey('keydown-FOUR', () => actions.onScan());
  bindActiveKey('keydown-NUMPAD_FOUR', () => actions.onScan());

  // Снабжение: дозакупка ракет (5 / NumPad 5) и сканов (6 / NumPad 6)
  bindActiveKey('keydown-FIVE', () => actions.onBuyMissile());
  bindActiveKey('keydown-NUMPAD_FIVE', () => actions.onBuyMissile());
  bindActiveKey('keydown-SIX', () => actions.onBuyScan());
  bindActiveKey('keydown-NUMPAD_SIX', () => actions.onBuyScan());

  // Пробел: закрытие окон, перезапуск после поражения или активация спецспособности в бою
  bindKey('keydown-SPACE', () => {
    if (actions.isBriefingOpen?.()) {
      actions.onCloseBriefing?.();
    } else if (actions.isArchiveOpen?.()) {
      actions.onCloseArchive?.();
    } else if (actions.isGameOver()) {
      actions.onRestart();
    } else if (canAct()) {
      actions.onActivateAbility?.();
    }
  });

  // Клавиша R: быстрый перезапуск из меню паузы или после поражения
  bindKey('keydown-R', () => {
    if (actions.isPaused() || actions.isGameOver()) {
      actions.onRestart();
    }
  });

  // Очистка подписок при перезапуске или закрытии сцены (защита от накопления слушателей)
  const cleanup = () => {
    scene.input.off('pointerdown', onPointerDown);
    if (scene.input.keyboard) {
      for (const { key, handler } of keyBindings) {
        scene.input.keyboard.off(key, handler);
      }
    }
    keyBindings.length = 0;
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  return cleanup;
}
