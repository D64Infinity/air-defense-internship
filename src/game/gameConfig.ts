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
  beamSpeedBase: 1.3, // базовая скорость вращения (рад/сек)
  trailAngle: 0.4, // ширина шлейфа затухания (в радианах)
  trailSteps: 14, // плавность градиента шлейфа

  // Затухание вспышки цели
  blipFadeDuration: 2.8, // секунд до полного угасания метки
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

  // Очки и серии
  scorePerCorrect: 100,
  scorePerDecoyIgnored: 0, // за игнорирование ловушки очки не начисляются (только рост серии)
  friendlyFirePenalty: 150,
  streakStepForMultiplier: 2, // каждые 2 правильных ответа множитель растёт на +0.5x
  maxMultiplier: 4.0,

  // Ресурс перехватчиков (боезапас ПВО)
  maxInterceptors: 6,
  startInterceptors: 5,
  interceptorRefillPerWave: 3,
  interceptorCost: 150, // стоимость закупки 1 ракеты за очки (бюджет)

  // Параметры сканирования
  maxScansPerWave: 3,
  scanDuration: 1.5, // секунд на дешифровку сигнатуры
  scanCost: 100, // стоимость закупки 1 заряда скана за очки (бюджет)

  // Характеристики типов целей (скорости сбалансированы для честного времени реакции)
  targetTypes: {
    missile: {
      label: 'Ракета',
      category: 'threat',
      weight: 35,
      speedRange: [40, 56], // комфортная скорость для реакции
      signalRange: [40, 75],
      headingJitter: 0.06, // летит строго на базу
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
  signal: number;
  alpha: number; // 0..1 (яркость люминофора)
  isScanned?: boolean; // Раскрыт ли точный тип цели
  decoyPassesThroughBase?: boolean; // Пролетает ли ловушка сквозь базу
  hasPassedBase?: boolean; // Флаг фиксации пролёта через базу
}

// Псевдонимы для обратной совместимости
export const RADAR_CONFIG = GAME_CONFIG;
export type RadarTarget = GameTarget;
