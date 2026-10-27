/**
 * Метрики сессии для итогового экрана и аналитики игры
 */
export interface GameSessionStats {
  missilesShot: number;
  bombersShot: number;
  friendsSaved: number;
  decoysFiltered: number;
  threatsMissed: number;
  friendlyFireCount: number;
  correctDecisions: number;
  totalDecisions: number;
  sessionTime: number;
}

/**
 * Интерфейс трекера игровой статистики сессии
 */
export interface StatsTracker {
  readonly snapshot: GameSessionStats;
  reset: () => void;
  updateTime: (dt: number) => void;
  recordMissileIntercept: () => void;
  recordBomberIntercept: () => void;
  recordFriendlyFire: () => void;
  recordDecoyIntercept: () => void;
  recordFriendSaved: () => void;
  recordFriendMissed: () => void;
  recordDecoyFiltered: () => void;
  recordDecoyMistake: () => void;
  recordThreatMissed: () => void;
  getAccuracy: () => number;
}

/**
 * Фабрика трекера статистики игровой сессии
 */
export function createStatsTracker(): StatsTracker {
  let missilesShot = 0;
  let bombersShot = 0;
  let friendsSaved = 0;
  let decoysFiltered = 0;
  let threatsMissed = 0;
  let friendlyFireCount = 0;
  let correctDecisions = 0;
  let totalDecisions = 0;
  let sessionTime = 0;

  const getSnapshot = (): GameSessionStats => ({
    missilesShot,
    bombersShot,
    friendsSaved,
    decoysFiltered,
    threatsMissed,
    friendlyFireCount,
    correctDecisions,
    totalDecisions,
    sessionTime,
  });

  return {
    get snapshot() {
      return getSnapshot();
    },
    reset: () => {
      missilesShot = 0;
      bombersShot = 0;
      friendsSaved = 0;
      decoysFiltered = 0;
      threatsMissed = 0;
      friendlyFireCount = 0;
      correctDecisions = 0;
      totalDecisions = 0;
      sessionTime = 0;
    },
    updateTime: (dt: number) => {
      sessionTime += dt;
    },
    recordMissileIntercept: () => {
      missilesShot++;
      correctDecisions++;
      totalDecisions++;
    },
    recordBomberIntercept: () => {
      bombersShot++;
      correctDecisions++;
      totalDecisions++;
    },
    recordFriendlyFire: () => {
      friendlyFireCount++;
      totalDecisions++;
    },
    recordDecoyIntercept: () => {
      totalDecisions++;
    },
    recordFriendSaved: () => {
      friendsSaved++;
      correctDecisions++;
      totalDecisions++;
    },
    recordFriendMissed: () => {
      totalDecisions++;
    },
    recordDecoyFiltered: () => {
      decoysFiltered++;
      correctDecisions++;
      totalDecisions++;
    },
    recordDecoyMistake: () => {
      totalDecisions++;
    },
    recordThreatMissed: () => {
      threatsMissed++;
      totalDecisions++;
    },
    getAccuracy: () =>
      totalDecisions > 0
        ? Math.round((correctDecisions / totalDecisions) * 100)
        : 0,
  };
}
