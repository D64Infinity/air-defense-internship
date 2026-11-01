/**
 * КОНФИГУРАЦИЯ БАЛАНСА И ПАРАМЕТРОВ ИГРЫ
 * Все ключевые числовые настройки, параметры целей и визуальная палитра.
 */
export const GAME_CONFIG = {
  // Геометрия дисплея радара
  radarX: 345,
  radarY: 320,
  radarRadius: 265,

  // Базовые параметры луча
  beamSpeedBase: 2.4, // базовая скорость вращения (~2.62 сек на полный оборот вместо 4.83 сек)
  trailAngle: 0.45, // ширина шлейфа затухания (в радианах)
  trailSteps: 14, // плавность градиента шлейфа

  // Затухание вспышки цели
  blipFadeDuration: 2.5, // секунд до полного угасания метки (согласовано с периодом луча)
  blipRadius: 4, // размер точки цели
  selectionHitRadius: 26, // радиус клика по цели на радаре

  // Эффект люминофора и радиошума ЭЛТ (CRT Phosphor Noise)
  crtNoise: {
    maxSpecks: 24, // максимальное количество одновременных микро-помех на экране
    spawnChancePerFrame: 0.70, // умеренная вероятность генерации микро-помехи в кадре
    minRadiusFraction: 0.35, // сосредоточены ближе к периферии (где SNR ниже)
    speckLifeMin: 0.16, // быстрое таяние микро-вспышки (сек)
    speckLifeMax: 0.32,
    minAlpha: 0.18, // мягкая начальная яркость без ослепления
    maxAlpha: 0.34, // деликатный пик яркости
    scanlineStep: 3, // шаг строк кинескопа (px)
    scanlineAlpha: 0.22, // глубина затемнения строк кинескопа
    scanlineSpeed: 9, // скорость плавного сползания строк вниз (px/сек)
    humBarSpeed: 26, // скорость мягкой волны вертикальной развёртки (px/сек)
    humBarHeight: 95, // высота мягкой волны развёртки (px)
    humBarWaveInterval: 4.2, // период повтора горизонтальной волны (сек)
    humBarWaveDuration: 1.10, // время пробега волны слева направо (сек)
    humBarWaveWidth: 115, // полуширина пакета синусоидальной волны (px)
    humBarWaveAmplitude: 3.8, // амплитуда колебания линий (px)
    humBarWaveSpatialFreq: 0.075, // пространственная частота синусоиды (длина волны ~84 px)
  },

  // Спавн целей (скорректированы для удобной реакции на ноутбуках)
  spawnIntervalMinBase: 2.8,
  spawnIntervalMaxBase: 4.8,
  maxActiveTargetsBase: 7,
  waveTargetsBase: 7, // количество целей в 1-й волне
  waveTargetsIncrement: 2, // прирост целей с каждой следующей волной

  // Здоровье базы и урон
  maxBaseHealth: 100,
  baseRadius: 18, // радиус центра базы для детекции попаданий и посадки
  damageMissile: 30,
  damageBomber: 20,

  // Экономика (кредиты и снабжение базы)
  startCredits: 200,
  creditsPerMissile: 100,
  creditsPerBomber: 150,
  creditsWaveBase: 150,
  creditsWavePerLevel: 25,
  creditsFriendlyFirePenalty: 150,
  unidentifiedFriendPenalty: 25, // штраф в кредитах за посадку/пролёт неопознанного союзника

  // Ресурс перехватчиков (боезапас ПВО)
  maxInterceptors: 6,
  startInterceptors: 5,
  interceptorRefillPerWave: 3,
  interceptorCost: 150, // стоимость закупки 1 ракеты в кредитах

  // Параметры сканирования
  maxScansPerWave: 3,
  scanDuration: 1, // секунд на дешифровку сигнатуры
  scanCost: 75, // стоимость закупки 1 заряда скана в кредитах

  // Характеристики типов целей (скорости сбалансированы для честного времени реакции)
  targetTypes: {
    missile: {
      label: 'Ракета',
      category: 'threat',
      weight: 35,
      speedRange: [44, 58], // повышенная скорость: быстрее бомбардировщиков, пересекается с ловушками
      signalRange: [40, 75],
      headingJitter: 0.0, // летит строго по прямой в центр базы
    },
    bomber: {
      label: 'Бомбардировщик',
      category: 'threat',
      weight: 25,
      speedRange: [22, 34],
      signalRange: [65, 92],
      headingJitter: 0.18,
    },
    friend: {
      label: 'Союзный борт',
      category: 'friend',
      weight: 20,
      speedRange: [20, 32],
      signalRange: [75, 98],
      headingJitter: 0.45,
    },
    decoy: {
      label: 'Ложная цель (помеха)',
      category: 'ignore',
      weight: 20,
      speedRange: [18, 48],
      signalRange: [15, 48],
      headingJitter: 0.85,
    },
  },

  // Цветовая палитра CRT-радара
  colors: {
    radarBg: 0x071b0f,
    radarBorder: 0x00ff66,
    gridRing: 0x00cc55,
    gridAxis: 0x00aa44,
    dangerRing: 0xef4444,
    beam: 0x99ffbb,
    trail: 0x00ff66,
    blipCore: 0xd4ffea,
    blipHalo: 0x00ff66,
    selectedBox: 0xfacc15,
    scanCyan: 0x38bdf8,
    hudBorder: 0x005522,
    hudBg: 0x04130a,
    btnFriend: 0x16a34a,
    btnThreat: 0xd97706,
    btnIgnore: 0x475569,
    btnScan: 0x0284c7,
    btnSupply: 0x0f766e,
    healthGreen: 0x22c55e,
    healthYellow: 0xeab308,
    healthRed: 0xef4444,

    // ЭЛТ-строки кинескопа
    scanline: 0x000000,

    // Ракеты-перехватчики ПВО
    interceptorTrail: 0x38bdf8,
    interceptorHalo: 0x38bdf8,
    interceptorCore: 0xd4ffea,

    // Тактические маркеры захвата, идентификации и окантовки целей
    targetLocked: 0xf59e0b,
    tagThreat: 0xef4444,
    tagFriend: 0x22c55e,
    tagNeutral: 0x94a3b8,
    markFriend: 0x22c55e,
    markIgnore: 0x94a3b8,

    // Холст и фон страницы
    canvasBg: '#051209',

    // Текстовая палитра оперативных сообщений и телеметрии (CSS-строки)
    text: {
      success: '#4ade80', // успешный перехват, союзник
      danger: '#ef4444', // тревога, критический урон базе
      warning: '#fbbf24', // предупреждение СУО, ловушка
      info: '#38bdf8', // пуск ракеты, глубокое сканирование
      friendlyBonus: '#86efac', // посадка/транзит союзника
      criticalPenalty: '#f87171', // огонь по своим, штрафы
      muted: '#94a3b8', // фильтрация ложной цели, помеха
      subtle: '#64748b', // нейтральное рассеивание сигнала
      white: '#ffffff', // стандартный светлый текст
      gold: '#facc15', // золотистый акцент боекомплекта
      cyanLight: '#7dd3fc', // светлый бирюзовый акцент
      blueLight: '#93c5fd', // светлый синий акцент
      amberLight: '#fcd34d', // светлый янтарный акцент
      redLight: '#fca5a5', // светлый красный акцент
    },

    // Модальные окна терминала (Game Over, Меню паузы, Инструктаж)
    modal: {
      overlay: 0x020a05,
      bgDark: 0x06130c,
      bgTerminal: 0x071b0f,
      borderAlert: 0xef4444,
      borderAlertCorner: 0xf87171,
      borderAlertSubtle: 0x7f1d1d,
      borderInfo: 0x38bdf8,
      borderSuccess: 0x4ade80,
      dividerGreen: 0x14532d,
      panelDark: 0x081f14,
      panelBorderGold: 0xca8a04,
      btnRestartBg: 0x16a34a,
      btnRestartHover: 0x22c55e,
      btnRestartBorder: 0x4ade80,
      btnResumeBg: 0x0284c7,
      btnResumeHover: 0x0369a1,
      btnResumeBorder: 0x38bdf8,
      btnBriefingBg: 0x0f3b25,
      btnBriefingHover: 0x166534,
      btnBriefingBorder: 0x4ade80,
      btnDangerBg: 0x450a0a,
      btnDangerHover: 0x7f1d1d,
      btnDangerBorder: 0xef4444,
    },

    // Всплывающие карточки оперативных оповещений (Alerts)
    alerts: {
      bgSuccess: 0x02170f,
      borderSuccess: 0x22c55e,
      pipSuccess: 0x4ade80,

      bgInfo: 0x021622,
      borderInfo: 0x0284c7,
      pipInfo: 0x38bdf8,

      bgDanger: 0x1f0707,
      borderDanger: 0xdc2626,
      pipDanger: 0xef4444,

      bgWarning: 0x1a1203,
      borderWarning: 0xd97706,
      pipWarning: 0xf59e0b,

      bgWarningWarm: 0x191103,
      borderWarningWarm: 0xb45309,
      pipWarningWarm: 0xd97706,

      bgGold: 0x171204,
      borderGold: 0xca8a04,
      pipGold: 0xfacc15,

      bgSupplyDeep: 0x061424,
      borderSupplyDeep: 0x0369a1,
    },
  },
};

export type TargetType = keyof typeof GAME_CONFIG.targetTypes;
export type DecisionChoice = 'friend' | 'threat' | 'ignore';

export interface GameTarget {
  id: number;
  type: TargetType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  headingDeg: number;
  headingRad: number; // текущий угол курса в радианах
  targetHeadingRad: number; // целевой угол курса в радианах (куда доворачивает борт)
  turnRate: number; // скорость доворота (рад/сек, 0 = без манёвра)
  maneuverTimer?: number; // таймер до смены курса пилотом
  hasManeuvered?: boolean; // флаг выполнения манёвра
  signal: number;
  alpha: number; // 0..1 (яркость люминофора)
  isScanned?: boolean; // Раскрыт ли точный тип цели
  markedAs?: 'friend' | 'ignore' | null; // Пользовательская тактическая метка цели
  isTargeted?: boolean; // Флаг: цель уже атакована летящей ракетой ПВО
  decoyPassesThroughBase?: boolean; // Пролетает ли ловушка сквозь базу
  hasPassedBase?: boolean; // Флаг фиксации пролёта через базу
  hasBombedBase?: boolean; // Флаг: бомбардировщик уже сбросил бомбы на базу
}
