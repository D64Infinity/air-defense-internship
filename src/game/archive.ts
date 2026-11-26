/**
 * Локальный реестр боевых дежурств (Топ-5 + последняя завершённая смена)
 */

const ARCHIVE_STORAGE_KEY = 'radar_station_archive_v1';
const LEGACY_RECORD_KEY = 'radar_station_record';
export const MAX_ARCHIVE_ENTRIES = 5;

export interface DutyShiftRecord {
  id: string;
  score: number;
  wave: number;
  bestStreak: number;
  accuracy: number;
  sessionTime: number;
  playedAt: number;
}

export interface DutyArchiveData {
  totalShifts: number;
  bestScore: number;
  bestWave: number;
  topShifts: DutyShiftRecord[];
  lastShift: DutyShiftRecord | null;
}

function createEmptyArchive(): DutyArchiveData {
  return {
    totalShifts: 0,
    bestScore: 0,
    bestWave: 0,
    topShifts: [],
    lastShift: null,
  };
}

function readLegacyBestScore(): number {
  try {
    const raw = localStorage.getItem(LEGACY_RECORD_KEY);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function normalizeRecord(raw: unknown): DutyShiftRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DutyShiftRecord>;
  if (
    typeof r.score !== 'number' ||
    typeof r.wave !== 'number' ||
    typeof r.bestStreak !== 'number' ||
    typeof r.accuracy !== 'number' ||
    typeof r.sessionTime !== 'number' ||
    typeof r.playedAt !== 'number'
  ) {
    return null;
  }
  return {
    id: typeof r.id === 'string' && r.id.length > 0 ? r.id : `${r.playedAt}_${r.score}`,
    score: Math.max(0, Math.round(r.score)),
    wave: Math.max(1, Math.round(r.wave)),
    bestStreak: Math.max(0, Math.round(r.bestStreak)),
    accuracy: Math.max(0, Math.min(100, Math.round(r.accuracy))),
    sessionTime: Math.max(0, r.sessionTime),
    playedAt: r.playedAt,
  };
}

function sortTopShifts(a: DutyShiftRecord, b: DutyShiftRecord): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.wave !== a.wave) return b.wave - a.wave;
  if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
  return b.playedAt - a.playedAt;
}

function saveDutyArchive(data: DutyArchiveData): void {
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(data));
    if (data.bestScore > 0) {
      localStorage.setItem(LEGACY_RECORD_KEY, data.bestScore.toString());
    }
  } catch {
    // Игнорируем ограничения квоты/приватного режима браузера
  }
}

/**
 * Загрузка архива дежурств из localStorage (с миграцией старого рекорда)
 */
export function loadDutyArchive(): DutyArchiveData {
  const legacyBest = readLegacyBestScore();
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) {
      return {
        ...createEmptyArchive(),
        bestScore: legacyBest,
      };
    }
    const parsed = JSON.parse(raw) as Partial<DutyArchiveData>;
    const topShifts = Array.isArray(parsed.topShifts)
      ? parsed.topShifts
          .map(normalizeRecord)
          .filter((item): item is DutyShiftRecord => item !== null && item.score > 0)
          .sort(sortTopShifts)
          .slice(0, MAX_ARCHIVE_ENTRIES)
      : [];
    const lastShift = normalizeRecord(parsed.lastShift);
    const totalShifts =
      typeof parsed.totalShifts === 'number' && parsed.totalShifts >= 0
        ? Math.round(parsed.totalShifts)
        : topShifts.length;
    const storedBest =
      typeof parsed.bestScore === 'number' && parsed.bestScore >= 0
        ? Math.round(parsed.bestScore)
        : 0;
    const topBest = topShifts[0]?.score ?? 0;
    const bestWave =
      typeof parsed.bestWave === 'number' && parsed.bestWave >= 0
        ? Math.round(parsed.bestWave)
        : topShifts.reduce((max, item) => Math.max(max, item.wave), 0);

    return {
      totalShifts,
      bestScore: Math.max(legacyBest, storedBest, topBest),
      bestWave,
      topShifts,
      lastShift,
    };
  } catch {
    return {
      ...createEmptyArchive(),
      bestScore: legacyBest,
    };
  }
}

/**
 * Сохранение завершённого дежурства в Топ-5 и в «последнюю смену»
 */
export function recordDutyShift(
  entry: Omit<DutyShiftRecord, 'id' | 'playedAt'>,
): DutyArchiveData {
  const current = loadDutyArchive();
  const playedAt = Date.now();
  const record: DutyShiftRecord = {
    id: `${playedAt}_${Math.random().toString(36).slice(2, 7)}`,
    score: Math.max(0, Math.round(entry.score)),
    wave: Math.max(1, Math.round(entry.wave)),
    bestStreak: Math.max(0, Math.round(entry.bestStreak)),
    accuracy: Math.max(0, Math.min(100, Math.round(entry.accuracy))),
    sessionTime: Math.max(0, entry.sessionTime),
    playedAt,
  };

  const nextTop =
    record.score > 0
      ? [...current.topShifts, record].sort(sortTopShifts).slice(0, MAX_ARCHIVE_ENTRIES)
      : [...current.topShifts];

  const nextData: DutyArchiveData = {
    totalShifts: current.totalShifts + 1,
    bestScore: Math.max(current.bestScore, record.score),
    bestWave: Math.max(current.bestWave, record.wave),
    topShifts: nextTop,
    lastShift: record,
  };

  saveDutyArchive(nextData);
  return nextData;
}

/**
 * Полная очистка журнала дежурств и локального рекорда
 */
export function clearDutyArchive(): DutyArchiveData {
  const empty = createEmptyArchive();
  try {
    localStorage.removeItem(ARCHIVE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_RECORD_KEY);
  } catch {
    // Игнорируем ограничения квоты/приватного режима браузера
  }
  return empty;
}

export function formatArchiveDate(timestamp: number): string {
  const d = new Date(timestamp);
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${dd}.${mm} ${hh}:${min}`;
}

export function formatShiftDuration(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
