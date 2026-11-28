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
  readonly interceptorCost: number;
  readonly isScanBlocked: boolean;

  reset: () => void;
  setWaveRestrictions: (
    opts: { scanDisabled?: boolean; interceptorCostOverride?: number } | null,
  ) => void;
  addCredits: (amount: number) => void;
  addBonusScan: () => boolean;
  addBonusInterceptors: (count: number) => number;
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
  let scanDisabled = false;
  let interceptorCostOverride: number | undefined = undefined;

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
        color: config.colors.text.danger,
        reason: 'no_credits',
      };
    }
    credits -= cost;
    onSuccess();
    return {
      success: true,
      message: successFeedback,
      color: config.colors.text.success,
    };
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
    get interceptorCost() {
      return interceptorCostOverride ?? config.interceptorCost;
    },
    get isScanBlocked() {
      return scanDisabled;
    },

    reset: () => {
      credits = config.startCredits;
      interceptors = config.startInterceptors;
      scansAvailable = config.maxScansPerWave;
      isScanning = false;
      scanningTarget = null;
      scanProgress = 0;
      scanDisabled = false;
      interceptorCostOverride = undefined;
    },

    setWaveRestrictions: (opts) => {
      scanDisabled = Boolean(opts?.scanDisabled);
      interceptorCostOverride = opts?.interceptorCostOverride;
      if (scanDisabled && isScanning) {
        isScanning = false;
        scanningTarget = null;
        scanProgress = 0;
      }
    },

    addCredits: (amount: number) => {
      credits += amount;
    },

    addBonusScan: (): boolean => {
      if (scansAvailable >= config.maxScansPerWave) return false;
      scansAvailable++;
      return true;
    },

    addBonusInterceptors: (count: number): number => {
      if (count <= 0) return 0;
      const room = Math.max(0, config.maxInterceptors - interceptors);
      const added = Math.min(room, count);
      interceptors += added;
      return added;
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
      const activeCost = interceptorCostOverride ?? config.interceptorCost;
      return buySupplyItem(
        interceptors,
        config.maxInterceptors,
        activeCost,
        `[СКЛАД] МАКСИМУМ РАКЕТ (${config.maxInterceptors}/${config.maxInterceptors})!`,
        config.colors.text.gold,
        `[СНАБЖЕНИЕ] +1 РАКЕТА (-${activeCost} CR)`,
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
        config.colors.text.info,
        `[СЕНСОРЫ] +1 СКАН (-${config.scanCost} CR)`,
        () => {
          scansAvailable++;
        },
      );
    },

    startScan: (target: GameTarget): ScanStartResult => {
      if (scanDisabled) {
        return {
          success: false,
          message: '[РЭБ-ФОН] СКАНЕР ОТКЛЮЧЁН ПРАВИЛОМ ВОЛНЫ!',
          color: config.colors.text.danger,
        };
      }
      if (target.isScanned) {
        return {
          success: false,
          message: '[СКАН] ЦЕЛЬ УЖЕ ОПОЗНАНА',
          color: config.colors.text.info,
        };
      }
      if (scansAvailable <= 0) {
        return {
          success: false,
          message: '[ОТКАЗ] НЕТ ЗАРЯДОВ СКАНИРОВАНИЯ (0 шт.)!',
          color: config.colors.text.danger,
        };
      }

      scansAvailable--;
      isScanning = true;
      scanningTarget = target;
      scanProgress = 0;
      return {
        success: true,
        message: `[СИСТЕМА] АНАЛИЗ СИГНАТУРЫ... (${GAME_CONFIG.scanDuration} СЕК)`,
        color: config.colors.text.info,
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
          color: config.colors.text.info,
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
