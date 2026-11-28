import Phaser from 'phaser';

export type AbilityId =
  | 'radar_pulse'
  | 'tactical_stasis'
  | 'volley_barrage'
  | 'emp_sweep'
  | 'field_drop';

/**
 * Конфигурация системы активных способностей и их ротации каждые 3 волны
 */
export const ABILITY_CONFIG = {
  firstUnlockWave: 3, // Первая выдача/выбор способности на 3-й волне
  intervalWaves: 3, // Перезапись способности каждые 3 волны (3, 6, 9...)
  draftChoicesCount: 3, // Количество карточек на выбор
  stasisDurationSec: 4.5, // Длительность замедления времени (сек)
  stasisSpeedFactor: 0.3, // Скорость целей в стазисе (30%)
  pulseDurationSec: 1.25, // Длительность волны РЛС-импульса (сек)
  empDurationSec: 0.9, // Длительность ЭМИ-волны (сек)
  empJammerSuppressSec: 4.0, // Подавление самолёта РЭБ от ЭМИ (сек)
  volleyCount: 3, // Количество бесплатных ракет при залпе ЗРК
  fieldDropMissiles: 2, // Бонус ракет от полевого сброса
  fieldDropHeal: 12, // Лечение базы от полевого сброса (HP)
  chargeOnThreatKill: 1.0, // Заряд за сбитую угрозу
  chargeOnCorrectMark: 0.5, // Заряд за спасённого союзника / ловушку
  passiveChargePerSec: 0.08, // Медленная фоновая подзарядка в бою
} as const;

export interface AbilityDefinition {
  readonly id: AbilityId;
  readonly title: string;
  readonly shortLabel: string;
  readonly subtitle: string;
  readonly tooltipDesc: string;
  readonly chargeTierLabel: string;
  readonly chargeNeeded: number;
  readonly accentColor: string;
  readonly borderColor: number;
}

/**
 * Каталог 5 активных способностей с разной тактической ролью
 */
export const ABILITY_DEFS: readonly AbilityDefinition[] = [
  {
    id: 'radar_pulse',
    title: 'РЛС-ИМПУЛЬС',
    shortLabel: 'ИМПУЛЬС',
    subtitle: 'Мгновенный просвет сектора:\nраскрывает типы всех целей на радаре\nи выводит «Стрижа» из тени рельефа.',
    tooltipDesc: 'РАСКРЫВАЕТ ВСЕ ЦЕЛИ НА ЭКРАНЕ И ТЕНЬ ПМВ',
    chargeTierLabel: 'БЫСТРЫЙ ЗАРЯД',
    chargeNeeded: 4,
    accentColor: '#38bdf8',
    borderColor: 0x0284c7,
  },
  {
    id: 'tactical_stasis',
    title: 'КРИО-СТАЗИС',
    shortLabel: 'СТАЗИС',
    subtitle: 'Тормозит все враждебные цели до 30%\nскорости на 4.5 сек. Луч РЛС и ваши\nракеты работают без замедления.',
    tooltipDesc: 'ЗАМЕДЛЯЕТ ЦЕЛИ ДО 30% НА 4.5 СЕК',
    chargeTierLabel: 'СРЕДНИЙ ЗАРЯД',
    chargeNeeded: 5,
    accentColor: '#67e8f9',
    borderColor: 0x06b6d4,
  },
  {
    id: 'volley_barrage',
    title: 'ЗАЛП ЗРК',
    shortLabel: 'ЗАЛП ×3',
    subtitle: 'Экстренный пуск 3 бесплатных ракет\nв ближайшие к базе угрозы.\nНе трогает союзников и ловушки.',
    tooltipDesc: '3 БЕСПЛАТНЫЕ РАКЕТЫ ПО БЛИЖАЙШИМ УГРОЗАМ',
    chargeTierLabel: 'ТЯЖЁЛЫЙ ЗАРЯД',
    chargeNeeded: 6,
    accentColor: '#facc15',
    borderColor: 0xeab308,
  },
  {
    id: 'emp_sweep',
    title: 'ЭМИ-ЗАЧИСТКА',
    shortLabel: 'ЭМИ',
    subtitle: 'Сжигает все ложные цели в секторе\nс зачётом в серию и глушит строб\nсамолёта РЭБ на 4 секунды.',
    tooltipDesc: 'УНИЧТОЖАЕТ ЛОВУШКИ И ГЛУШИТ РЭБ НА 4 СЕК',
    chargeTierLabel: 'БЫСТРЫЙ ЗАРЯД',
    chargeNeeded: 4,
    accentColor: '#c084fc',
    borderColor: 0xa855f7,
  },
  {
    id: 'field_drop',
    title: 'ПОЛЕВОЙ СБРОС',
    shortLabel: 'СБРОС',
    subtitle: 'Сброс аварийного контейнера:\nдобавляет +2 ракеты в боекомплект\nи восстанавливает +12 HP базе.',
    tooltipDesc: '+2 РАКЕТЫ В БК И РЕМОНТ БАЗЫ +12 HP',
    chargeTierLabel: 'СРЕДНИЙ ЗАРЯД',
    chargeNeeded: 5,
    accentColor: '#4ade80',
    borderColor: 0x22c55e,
  },
];

export interface AbilityManager {
  readonly activeAbility: AbilityDefinition | null;
  readonly charge: number;
  readonly chargeRatio: number;
  readonly isReady: boolean;
  readonly stasisRemaining: number;
  readonly pulseProgress: number | null;
  readonly empProgress: number | null;
  shouldOfferDraftOnWave: (wave: number) => boolean;
  rollDraftChoices: () => AbilityDefinition[];
  selectAbility: (id: AbilityId) => AbilityDefinition;
  addCharge: (amount: number) => boolean;
  consumeAndTrigger: () => AbilityDefinition | null;
  update: (dt: number) => boolean;
  reset: () => void;
}

/**
 * Фабрика менеджера активных способностей и их обязательной ротации
 */
export function createAbilityManager(): AbilityManager {
  let activeAbility: AbilityDefinition | null = null;
  let charge = 0;
  let stasisRemaining = 0;
  let pulseAge = -1;
  let empAge = -1;

  const reset = (): void => {
    activeAbility = null;
    charge = 0;
    stasisRemaining = 0;
    pulseAge = -1;
    empAge = -1;
  };

  const shouldOfferDraftOnWave = (wave: number): boolean =>
    wave >= ABILITY_CONFIG.firstUnlockWave &&
    (wave - ABILITY_CONFIG.firstUnlockWave) % ABILITY_CONFIG.intervalWaves === 0;

  const rollDraftChoices = (): AbilityDefinition[] => {
    // Строго исключаем текущую активную способность, вынуждая менять стиль каждые 3 волны
    const candidates = ABILITY_DEFS.filter(
      (def) => !activeAbility || def.id !== activeAbility.id,
    );
    const shuffled = Phaser.Utils.Array.Shuffle([...candidates]);
    return shuffled.slice(0, ABILITY_CONFIG.draftChoicesCount);
  };

  const selectAbility = (id: AbilityId): AbilityDefinition => {
    const found = ABILITY_DEFS.find((d) => d.id === id) ?? ABILITY_DEFS[0];
    activeAbility = found;
    // Новая способность выдаётся сразу полностью заряженной для мгновенной отдачи
    charge = found.chargeNeeded;
    stasisRemaining = 0;
    pulseAge = -1;
    empAge = -1;
    return found;
  };

  const addCharge = (amount: number): boolean => {
    if (!activeAbility || amount <= 0) return false;
    const wasReady = charge >= activeAbility.chargeNeeded;
    charge = Math.min(activeAbility.chargeNeeded, charge + amount);
    return !wasReady && charge >= activeAbility.chargeNeeded;
  };

  const consumeAndTrigger = (): AbilityDefinition | null => {
    if (!activeAbility || charge < activeAbility.chargeNeeded) return null;
    charge = 0;

    if (activeAbility.id === 'tactical_stasis') {
      stasisRemaining = ABILITY_CONFIG.stasisDurationSec;
    } else if (activeAbility.id === 'radar_pulse') {
      pulseAge = 0;
    } else if (activeAbility.id === 'emp_sweep') {
      empAge = 0;
    }

    return activeAbility;
  };

  const update = (dt: number): boolean => {
    if (stasisRemaining > 0) {
      stasisRemaining = Math.max(0, stasisRemaining - dt);
    }
    if (pulseAge >= 0) {
      pulseAge += dt;
      if (pulseAge >= ABILITY_CONFIG.pulseDurationSec) {
        pulseAge = -1;
      }
    }
    if (empAge >= 0) {
      empAge += dt;
      if (empAge >= ABILITY_CONFIG.empDurationSec) {
        empAge = -1;
      }
    }

    return addCharge(ABILITY_CONFIG.passiveChargePerSec * dt);
  };

  return {
    get activeAbility() {
      return activeAbility;
    },
    get charge() {
      return charge;
    },
    get chargeRatio() {
      if (!activeAbility || activeAbility.chargeNeeded <= 0) return 0;
      return Math.min(1, charge / activeAbility.chargeNeeded);
    },
    get isReady() {
      return Boolean(activeAbility && charge >= activeAbility.chargeNeeded);
    },
    get stasisRemaining() {
      return stasisRemaining;
    },
    get pulseProgress() {
      if (pulseAge < 0) return null;
      return Math.min(1, pulseAge / ABILITY_CONFIG.pulseDurationSec);
    },
    get empProgress() {
      if (empAge < 0) return null;
      return Math.min(1, empAge / ABILITY_CONFIG.empDurationSec);
    },
    shouldOfferDraftOnWave,
    rollDraftChoices,
    selectAbility,
    addCharge,
    consumeAndTrigger,
    update,
    reset,
  };
}
