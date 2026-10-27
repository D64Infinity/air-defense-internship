/**
 * КОНФИГУРАЦИЯ И СИСТЕМА НАЧИСЛЕНИЯ ОЧКОВ
 * Полная настройка базовых очков, множителей комбо-серии, бонусов за дистанцию и штрафов.
 */
export const SCORING_CONFIG = {
  // Базовые очки
  scorePerCorrect: 15, // базовые очки за подтверждённую цель (перехват / посадка)
  cleanWaveBonus: 50, // бонус к счёту за волну без урона базе и без огня по своим
  friendlyFirePenalty: 40, // штраф к счёту за уничтожение союзного судна

  // Параметры множителя серии (комбо)
  streakStep: 3, // каждые 3 правильных действия множитель увеличивается
  multiplierStep: 0.5, // шаг прироста множителя (+0.5x)
  maxMultiplier: 2.5, // максимальный потолок множителя серии (x2.5)

  // Бонус за дальность перехвата
  distanceBonusMax: 0.5, // максимальная надбавка (+50% на границе зоны)
  longRangeThreshold: 0.7, // порог радара (>=70% радиуса) для статуса «ДАЛЬНИЙ РУБЕЖ»
};

/**
 * Расчёт текущего комбо-множителя на основе длины серии
 */
export function calculateStreakMultiplier(streak: number): number {
  const steps = Math.floor(streak / SCORING_CONFIG.streakStep);
  return Math.min(
    SCORING_CONFIG.maxMultiplier,
    1 + steps * SCORING_CONFIG.multiplierStep,
  );
}

/**
 * Расчёт очков за перехват угрозы (ракета / бомбардировщик) с учётом дистанции и множителя
 */
export function calculateThreatScore(
  streak: number,
  distToBase: number,
  radarRadius: number,
): { points: number; isLongRange: boolean } {
  const multiplier = calculateStreakMultiplier(streak);
  const distRatio = Math.min(1.0, distToBase / radarRadius);
  const distFactor = 1 + distRatio * SCORING_CONFIG.distanceBonusMax;
  const points = Math.round(SCORING_CONFIG.scorePerCorrect * multiplier * distFactor);
  const isLongRange = distToBase >= radarRadius * SCORING_CONFIG.longRangeThreshold;

  return { points, isLongRange };
}

/**
 * Расчёт очков за успешную посадку или транзитный пролёт союзника
 */
export function calculateFriendlyScore(streak: number): number {
  const multiplier = calculateStreakMultiplier(streak);
  return Math.round(SCORING_CONFIG.scorePerCorrect * multiplier);
}

/**
 * Интерфейс менеджера состояния счёта и серий
 */
export interface ScoreTracker {
  readonly score: number;
  readonly streak: number;
  readonly bestStreak: number;
  getMultiplier: () => number;
  addThreatScore: (distToBase: number, radarRadius: number) => { points: number; isLongRange: boolean };
  addFriendlyScore: () => number;
  addDecoySuccess: () => void;
  resetStreak: () => void;
  applyFriendlyFirePenalty: () => number;
  applyCleanWaveBonus: () => number;
  reset: () => void;
}

/**
 * Фабрика системы отслеживания очков и комбо-серий
 */
export function createScoreTracker(): ScoreTracker {
  let score = 0;
  let streak = 0;
  let bestStreak = 0;

  const updateBest = () => {
    if (streak > bestStreak) bestStreak = streak;
  };

  return {
    get score() {
      return score;
    },
    get streak() {
      return streak;
    },
    get bestStreak() {
      return bestStreak;
    },
    getMultiplier: () => calculateStreakMultiplier(streak),
    addThreatScore: (distToBase: number, radarRadius: number) => {
      const result = calculateThreatScore(streak, distToBase, radarRadius);
      score += result.points;
      streak++;
      updateBest();
      return result;
    },
    addFriendlyScore: () => {
      const points = calculateFriendlyScore(streak);
      score += points;
      streak++;
      updateBest();
      return points;
    },
    addDecoySuccess: () => {
      streak++;
      updateBest();
    },
    resetStreak: () => {
      streak = 0;
    },
    applyFriendlyFirePenalty: () => {
      streak = 0;
      score = Math.max(0, score - SCORING_CONFIG.friendlyFirePenalty);
      return SCORING_CONFIG.friendlyFirePenalty;
    },
    applyCleanWaveBonus: () => {
      score += SCORING_CONFIG.cleanWaveBonus;
      return SCORING_CONFIG.cleanWaveBonus;
    },
    reset: () => {
      score = 0;
      streak = 0;
      bestStreak = 0;
    },
  };
}
