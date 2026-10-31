import { GAME_CONFIG, type GameTarget } from './gameConfig';

export interface BuyResult {
  success: boolean;
  message: string;
  color: string;
  reason?: 'max_capacity' | 'no_credits';
}

export interface ScanStartResult {
  success: boolean;
  message: string;
  color: string;
}

export interface ScanUpdateResult {
  completed: boolean;
  cancelled?: boolean;
  target?: GameTarget;
  message?: string;
  color?: string;
}

/**
 * Интерфейс подсистемы арсенала, снабжения и сканирования базы
 */
export interface ArmoryTracker {
  readonly credits: number;
  readonly interceptors: number;
  readonly scansAvailable: number;
  readonly isScanning: boolean;
  readonly scanningTarget: GameTarget | null;
  readonly scanProgress: number;

  reset: () => void;
  addCredits: (amount: number) => void;
  deductCredits: (amount: number) => void;
  consumeInterceptor: () => boolean;
  buyInterceptor: () => BuyResult;
  buyScan: () => BuyResult;
  startScan: (target: GameTarget) => ScanStartResult;
  cancelScan: () => void;
  cancelScanIfTarget: (target: GameTarget) => void;
  updateScanning: (dt: number, activeTargets: GameTarget[]) => ScanUpdateResult | null;
  refillForWave: (wave: number) => { addedAmmo: number; waveCredits: number };
}

/**
 * Фабрика системы арсенала, снабжения и глубокого сканирования
 */
export function createArmory(config = GAME_CONFIG): ArmoryTracker {
  let credits = config.startCredits;
  let interceptors = config.startInterceptors;
  let scansAvailable = config.maxScansPerWave;
  let isScanning = false;
  let scanningTarget: GameTarget | null = null;
  let scanProgress = 0;

  const buySupplyItem = (
    current: number,
    max: number,
    cost: number,
    maxFeedback: string,
    maxColor: string,
    successFeedback: string,
    onSuccess: () => void,
  ): BuyResult => {
    if (current >= max) {
      return { success: false, message: maxFeedback, color: maxColor, reason: 'max_capacity' };
    }
    if (credits < cost) {
      return {
        success: false,
        message: `[БЮДЖЕТ] НЕ ХВАТАЕТ КРЕДИТОВ (НУЖНО ${cost} CR)!`,
        color: '#ef4444',
        reason: 'no_credits',
      };
    }
    credits -= cost;
    onSuccess();
    return { success: true, message: successFeedback, color: '#22c55e' };
  };

  return {
    get credits() {
      return credits;
    },
    get interceptors() {
      return interceptors;
    },
    get scansAvailable() {
      return scansAvailable;
    },
    get isScanning() {
      return isScanning;
    },
    get scanningTarget() {
      return scanningTarget;
    },
    get scanProgress() {
      return scanProgress;
    },

    reset: () => {
      credits = config.startCredits;
      interceptors = config.startInterceptors;
      scansAvailable = config.maxScansPerWave;
      isScanning = false;
      scanningTarget = null;
      scanProgress = 0;
    },

    addCredits: (amount: number) => {
      credits += amount;
    },

    deductCredits: (amount: number) => {
      credits = Math.max(0, credits - amount);
    },

    consumeInterceptor: (): boolean => {
      if (interceptors <= 0) return false;
      interceptors--;
      return true;
    },

    buyInterceptor: (): BuyResult => {
      return buySupplyItem(
        interceptors,
        config.maxInterceptors,
        config.interceptorCost,
        `[СКЛАД] МАКСИМУМ РАКЕТ (${config.maxInterceptors}/${config.maxInterceptors})!`,
        '#facc15',
        `[СНАБЖЕНИЕ] +1 РАКЕТА (-${config.interceptorCost} CR)`,
        () => {
          interceptors++;
        },
      );
    },

    buyScan: (): BuyResult => {
      return buySupplyItem(
        scansAvailable,
        config.maxScansPerWave,
        config.scanCost,
        `[СЕНСОРЫ] МАКСИМУМ СКАНОВ (${config.maxScansPerWave}/${config.maxScansPerWave})!`,
        '#38bdf8',
        `[СНАБЖЕНИЕ] +1 СКАН (-${config.scanCost} CR)`,
        () => {
          scansAvailable++;
        },
      );
    },

    startScan: (target: GameTarget): ScanStartResult => {
      if (target.isScanned) {
        return {
          success: false,
          message: '[СКАН] ЦЕЛЬ УЖЕ ОПОЗНАНА',
          color: '#38bdf8',
        };
      }
      if (scansAvailable <= 0) {
        return {
          success: false,
          message: '[ОТКАЗ] НЕТ ЗАРЯДОВ СКАНИРОВАНИЯ (0 шт.)!',
          color: '#ef4444',
        };
      }

      scansAvailable--;
      isScanning = true;
      scanningTarget = target;
      scanProgress = 0;
      return {
        success: true,
        message: `[СИСТЕМА] АНАЛИЗ СИГНАТУРЫ... (${GAME_CONFIG.scanDuration} СЕК)`,
        color: '#38bdf8',
      };
    },

    cancelScan: () => {
      isScanning = false;
      scanningTarget = null;
      scanProgress = 0;
    },

    cancelScanIfTarget: (target: GameTarget) => {
      if (scanningTarget === target) {
        isScanning = false;
        scanningTarget = null;
        scanProgress = 0;
      }
    },

    updateScanning: (
      dt: number,
      activeTargets: GameTarget[],
    ): ScanUpdateResult | null => {
      if (!isScanning || !scanningTarget) return null;

      if (!activeTargets.includes(scanningTarget)) {
        isScanning = false;
        scanningTarget = null;
        scanProgress = 0;
        return { completed: false, cancelled: true };
      }

      scanProgress += dt;
      if (scanProgress >= config.scanDuration) {
        const target = scanningTarget;
        isScanning = false;
        scanningTarget = null;
        scanProgress = 0;
        target.isScanned = true;

        const typeCfg = config.targetTypes[target.type];
        return {
          completed: true,
          target,
          message: `[ОПОЗНАНО!] СИГНАТУРА: ${typeCfg.label.toUpperCase()}`,
          color: '#38bdf8',
        };
      }

      return null;
    },

    refillForWave: (
      wave: number,
    ): { addedAmmo: number; waveCredits: number } => {
      const addedAmmo = Math.min(
        config.maxInterceptors - interceptors,
        config.interceptorRefillPerWave,
      );
      interceptors = Math.min(
        config.maxInterceptors,
        interceptors + config.interceptorRefillPerWave,
      );
      scansAvailable = config.maxScansPerWave;

      const waveCredits =
        config.creditsWaveBase + (wave - 1) * config.creditsWavePerLevel;
      credits += waveCredits;

      return { addedAmmo, waveCredits };
    },
  };
}
