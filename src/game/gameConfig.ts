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

  // Спавн целей (скорректированы для удобной реакции на ноутбуках)
  spawnIntervalMinBase: 2.8,
  spawnIntervalMaxBase: 4.8,
  maxActiveTargetsBase: 7,

  // Здоровье базы и урон
  maxBaseHealth: 100,
  damageMissile: 30,
  damageBomber: 20,

  // Очки и серии (сбалансированы под аккуратный 4-значный счёт без гиперинфляции)
  scorePerCorrect: 15, // базовые очки за подтверждённую цель (перехват / посадка)
  scorePerDecoyIgnored: 0, // за фильтрацию ловушки только рост серии
  friendlyFirePenalty: 40, // штраф к счёту за уничтожение своего борта
  cleanWaveBonus: 50, // бонус к счёту за волну без урона базе и без дружественного огня
  distanceBonusMax: 0.5, // максимальный бонус за дальность перехвата (до +50% на границе радара)
  streakStepForMultiplier: 3, // каждые 3 правильных действия множитель растёт
  multiplierStep: 0.5, // шаг прироста множителя (+0.5x)
  maxMultiplier: 2.5, // потолок комбо-множителя (x2.5)

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
  scanDuration: 1.5, // секунд на дешифровку сигнатуры
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
  decoyPassesThroughBase?: boolean; // Пролетает ли ловушка сквозь базу
  hasPassedBase?: boolean; // Флаг фиксации пролёта через базу
  hasBombedBase?: boolean; // Флаг: бомбардировщик уже сбросил бомбы на базу
}

// Псевдонимы для обратной совместимости
export const RADAR_CONFIG = GAME_CONFIG;
export type RadarTarget = GameTarget;
