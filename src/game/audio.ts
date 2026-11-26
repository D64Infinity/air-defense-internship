import type { TargetType } from './gameConfig';

/**
 * Звуковая подсистема радара на базе Web Audio API.
 * Полностью автономна, не требует аудиофайлов и внешних библиотек.
 */
export interface SoundSystem {
  resume: () => void;
  playRadarPing: (pitch?: number) => void;
  playExplosion: (targetType: TargetType, pan?: number) => void;
  playBaseDamage: () => void;
  playDenyClick: () => void;
  playLaunch: () => void;
  playDroneBurst: (pan?: number) => void;
  playWaveTransition: (isCleanWave?: boolean) => void;
  playSalvoAlert: () => void;
  playSectorWarningPing: () => void;
  playBarrageRocketLaunch: () => void;
  playAirburst: (pan?: number) => void;
  playFlareSizzle: () => void;
  playJammerShutdown: (pan?: number) => void;
  playTerrainHuggerPopUp: () => void;
  playReconAlert: () => void;
  playThunderClap: (pan?: number) => void;
  playMenuHover: () => void;
  playMenuSelect: () => void;
  playDegauss: () => void;
  stopAll: () => void;
  toggleMute: () => boolean;
  readonly isMuted: boolean;
}

/**
 * Фабрика системы процедурного синтеза звуков радиолокатора
 */
export function createSoundSystem(): SoundSystem {
  let ctx: AudioContext | null = null;
  let isMuted = false;
  let lastPingTime = 0;
  let cachedWhiteNoiseBuffer: AudioBuffer | null = null;
  let cachedBrownNoiseBuffer: AudioBuffer | null = null;
  let cachedFriedlanderMissile: AudioBuffer | null = null;
  let cachedFriedlanderBomber: AudioBuffer | null = null;
  let cachedFriedlanderDecoy: AudioBuffer | null = null;
  let masterIn: GainNode | null = null;
  let masterGain: GainNode | null = null;
  let skyEchoIn: GainNode | null = null;
  let teardownMasterChain: (() => void) | null = null;

  /**
   * Инициализация студийного мастер-тракта обработки (Сатурация + Компрессор + Лимитер + Атмосферный диффузор)
   */
  const setupMasterChain = (audioCtx: AudioContext): void => {
    teardownMasterChain?.();
    masterIn = audioCtx.createGain();

    // 1. Асимметричная аналоговая сатурация (WaveShaper):
    // Формула tanh(1.5x + 0.15x^2) обогащает сигнал чётными гармониками (2-я гармоника октавы),
    // устраняя цифровую резкость и делая низкие частоты взрыва массивными и теплыми.
    const saturator = audioCtx.createWaveShaper();
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(1.5 * x + 0.15 * x * x);
    }
    saturator.curve = curve;
    saturator.oversample = '2x';

    // 2. Студийный компрессор-лимитер (DynamicsCompressor):
    // Поднимает общую громкость и плотность (RMS), склеивает слои и защищает от цифрового хрипа
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-16, 0);
    compressor.knee.setValueAtTime(8, 0);
    compressor.ratio.setValueAtTime(10, 0);
    compressor.attack.setValueAtTime(0.002, 0); // Быстрая атака пропускает начальный тактильный щелчок
    compressor.release.setValueAtTime(0.18, 0);

    // 3. Мастер-громкость
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(isMuted ? 0 : 1, 0);

    masterIn.connect(saturator);
    saturator.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    // 4. Стереодиффузор открытого горизонта (Tropospheric Haas Scatter)
    // Разделяет атмосферные отражения на левое (23 мс) и правое (37 мс) плечо,
    // формируя в наушниках масштаб бескрайнего открытого военного полигона
    skyEchoIn = audioCtx.createGain();
    skyEchoIn.gain.value = 0.65;

    const delayL = audioCtx.createDelay(0.1);
    delayL.delayTime.value = 0.023;
    const dampL = audioCtx.createBiquadFilter();
    dampL.type = 'lowpass';
    dampL.frequency.value = 520;
    const feedbackL = audioCtx.createGain();
    feedbackL.gain.value = 0.28;

    const delayR = audioCtx.createDelay(0.1);
    delayR.delayTime.value = 0.037;
    const dampR = audioCtx.createBiquadFilter();
    dampR.type = 'lowpass';
    dampR.frequency.value = 440;
    const feedbackR = audioCtx.createGain();
    feedbackR.gain.value = 0.32;

    skyEchoIn.connect(delayL);
    delayL.connect(dampL);
    dampL.connect(feedbackL);
    feedbackL.connect(delayL);

    skyEchoIn.connect(delayR);
    delayR.connect(dampR);
    dampR.connect(feedbackR);
    feedbackR.connect(delayR);

    // Панорамирование эха: левое отражение слегка влево, правое — вправо
    let pannerL: StereoPannerNode | null = null;
    let pannerR: StereoPannerNode | null = null;
    if (typeof audioCtx.createStereoPanner === 'function') {
      pannerL = audioCtx.createStereoPanner();
      pannerL.pan.value = -0.65;
      dampL.connect(pannerL);
      pannerL.connect(masterIn);

      pannerR = audioCtx.createStereoPanner();
      pannerR.pan.value = 0.65;
      dampR.connect(pannerR);
      pannerR.connect(masterIn);
    } else {
      dampL.connect(masterIn);
      dampR.connect(masterIn);
    }

    const currentMasterIn = masterIn;
    const currentMasterGain = masterGain;
    const currentSkyEchoIn = skyEchoIn;
    teardownMasterChain = () => {
      currentMasterIn.disconnect();
      currentSkyEchoIn.disconnect();
      delayL.disconnect();
      dampL.disconnect();
      feedbackL.disconnect();
      delayR.disconnect();
      dampR.disconnect();
      feedbackR.disconnect();
      pannerL?.disconnect();
      pannerR?.disconnect();
      saturator.disconnect();
      compressor.disconnect();
      currentMasterGain.disconnect();
    };
  };

  const getContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;

    if (!ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
        setupMasterChain(ctx);
      }
    }

    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    return ctx;
  };

  const getMasterIn = (audioCtx: AudioContext): AudioNode => {
    return masterIn || audioCtx.destination;
  };

  const getSkyEchoIn = (): AudioNode | null => {
    return skyEchoIn;
  };

  /**
   * Генератор белого шума (равномерный спектр для радиопомех, щелчков и высокочастотного скрежета)
   */
  const getWhiteNoiseBuffer = (audioCtx: AudioContext): AudioBuffer => {
    if (!cachedWhiteNoiseBuffer || cachedWhiteNoiseBuffer.sampleRate !== audioCtx.sampleRate) {
      const bufferSize = audioCtx.sampleRate;
      cachedWhiteNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = cachedWhiteNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return cachedWhiteNoiseBuffer;
  };

  /**
   * Генератор коричневого шума (Brownian / Red Noise $1/f^2$):
   * Двухполюсный каскадный интегратор (спад -12 дБ/октава) с пиковой нормализацией к [-1.0, 1.0].
   * Концентрирует энергию в глубоком инфразвуке (20-60 Гц), создавая натуральный физический
   * рокот расширяющегося огненного шара и сотрясение земли без высокочастотного шипения.
   */
  const getBrownNoiseBuffer = (audioCtx: AudioContext): AudioBuffer => {
    if (!cachedBrownNoiseBuffer || cachedBrownNoiseBuffer.sampleRate !== audioCtx.sampleRate) {
      const bufferSize = audioCtx.sampleRate;
      cachedBrownNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = cachedBrownNoiseBuffer.getChannelData(0);
      let y1 = 0.0;
      let y2 = 0.0;
      let maxAmp = 0.0001;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        y1 = (y1 + 0.04 * white) / 1.04;
        y2 = (y2 + 0.035 * y1) / 1.035;
        data[i] = y2;
        const abs = Math.abs(y2);
        if (abs > maxAmp) maxAmp = abs;
      }

      // Пиковая нормализация для идеального динамического диапазона без перегруза
      const normFactor = 1.0 / maxAmp;
      for (let i = 0; i < bufferSize; i++) {
        data[i] *= normFactor;
      }
    }
    return cachedBrownNoiseBuffer;
  };

  /**
   * Генератор физической ударной волны Фридлендера с микротурбулентностью (Jittered Friedlander Waveform):
   * P(t) = (1 - t / t+) * exp(-alpha * t) * (1 + jitter)
   * Фундаментальная формула акустики взрыва (Andy Farnell, "Designing Sound", MIT Press):
   * Мгновенный положительный скачок сверхзвукового давления (+P) со стохастическим микрохрустом,
   * за которым НЕМЕДЛЕННО следует фаза отрицательного вакуумного разрежения (-P).
   */
  const getFriedlanderBuffer = (
    audioCtx: AudioContext,
    tPlus: number,
    alpha: number,
    duration = 0.15,
  ): AudioBuffer => {
    const sampleRate = audioCtx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const base = (1 - t / tPlus) * Math.exp(-alpha * t);
      // Микротурбулентность давления фронта (затухает в 2.2 раза быстрее основного спада)
      const jitter = (Math.random() * 2 - 1) * 0.14 * Math.exp(-alpha * 2.2 * t);
      data[i] = base + jitter;
    }
    return buffer;
  };

  const getFriedlanderMissileBuffer = (audioCtx: AudioContext): AudioBuffer => {
    if (!cachedFriedlanderMissile || cachedFriedlanderMissile.sampleRate !== audioCtx.sampleRate) {
      cachedFriedlanderMissile = getFriedlanderBuffer(audioCtx, 0.015, 35, 0.12);
    }
    return cachedFriedlanderMissile;
  };

  const getFriedlanderBomberBuffer = (audioCtx: AudioContext): AudioBuffer => {
    if (!cachedFriedlanderBomber || cachedFriedlanderBomber.sampleRate !== audioCtx.sampleRate) {
      cachedFriedlanderBomber = getFriedlanderBuffer(audioCtx, 0.025, 20, 0.20);
    }
    return cachedFriedlanderBomber;
  };

  const getFriedlanderDecoyBuffer = (audioCtx: AudioContext): AudioBuffer => {
    if (!cachedFriedlanderDecoy || cachedFriedlanderDecoy.sampleRate !== audioCtx.sampleRate) {
      cachedFriedlanderDecoy = getFriedlanderBuffer(audioCtx, 0.008, 55, 0.08);
    }
    return cachedFriedlanderDecoy;
  };

  const resume = (): void => {
    getContext();
  };

  /**
   * Воспроизведение аутентичного радиолокационного отклика при засветке метки лучом:
   * 1. Тактильный щелчок приёмного тракта в момент фиксации метки (3 мс);
   * 2. Основной плотный тон радиолокатора (920 -> 755 Гц);
   * 3. Благородный стеклянно-металлический обертон колбы ЭЛТ (октава pitch * 2.0 с колокольным хвостом 110 мс);
   * 4. Мягкий отклик в атмосферный стереодиффузор skyEcho для ощущения объёма операторской рубки.
   */
  const playRadarPing = (pitch = 920): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);
    const skyEcho = getSkyEchoIn();

    const startTime = Math.max(now, lastPingTime + 0.035);
    lastPingTime = startTime;

    // Слой 1: Тактильный щелчок поляризации луча на датчике (2.5 мс)
    const clickOsc = audioCtx.createOscillator();
    const clickGain = audioCtx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1600, startTime);
    clickOsc.frequency.exponentialRampToValueAtTime(320, startTime + 0.007);

    clickGain.gain.setValueAtTime(0.0001, startTime);
    clickGain.gain.linearRampToValueAtTime(0.08, startTime + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.007);

    clickOsc.connect(clickGain);
    clickGain.connect(masterDest);

    // Слой 2: Основной фундаментный тон радиолокатора
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(pitch, startTime);
    osc1.frequency.exponentialRampToValueAtTime(pitch * 0.82, startTime + 0.075);

    gain1.gain.setValueAtTime(0.0001, startTime);
    gain1.gain.linearRampToValueAtTime(0.10, startTime + 0.003);
    gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.075);

    osc1.connect(gain1);
    gain1.connect(masterDest);

    // Слой 3: Стеклянно-металлический резонансный обертон колбы ЭЛТ (октава + мягкий колокольный спад)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(pitch * 2.0, startTime);
    osc2.frequency.exponentialRampToValueAtTime(pitch * 1.95, startTime + 0.11);

    gain2.gain.setValueAtTime(0.0001, startTime);
    gain2.gain.linearRampToValueAtTime(0.045, startTime + 0.004);
    gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.11);

    osc2.connect(gain2);
    gain2.connect(masterDest);
    if (skyEcho) {
      gain2.connect(skyEcho);
    }

    // Запуск узлов
    clickOsc.start(startTime);
    clickOsc.stop(startTime + 0.009);

    osc1.start(startTime);
    osc1.stop(startTime + 0.08);

    osc2.start(startTime);
    osc2.stop(startTime + 0.12);

    osc2.onended = () => {
      clickOsc.disconnect();
      clickGain.disconnect();
      osc1.disconnect();
      gain1.disconnect();
      osc2.disconnect();
      gain2.disconnect();
    };
  };

  /**
   * Сухой металлический щелчок при попытке пуска с пустым боекомплектом
   */
  const playDenyClick = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.setValueAtTime(140, now + 0.02);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.10, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain);
    gain.connect(getMasterIn(audioCtx));
    osc.start(now);
    osc.stop(now + 0.06);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  };

  /**
   * Звуковой эффект старта ракеты-перехватчика из шахты (пневматический толчок + форсаж твердотопливного ускорителя)
   */
  const playLaunch = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);

    // 1. Кинетический пневмо-толчок катапульты шахты (Pneumatic Ejection Thump)
    const thumpOsc = audioCtx.createOscillator();
    const thumpGain = audioCtx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(155, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(42, now + 0.08);

    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(0.30, now + 0.004);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(masterDest);

    // 2. Свистящий форсаж твердотопливного ускорителя (Booster Ignition Whoosh)
    const boostNoise = audioCtx.createBufferSource();
    boostNoise.buffer = getWhiteNoiseBuffer(audioCtx);

    const boostFilter = audioCtx.createBiquadFilter();
    boostFilter.type = 'bandpass';
    boostFilter.frequency.setValueAtTime(950, now);
    boostFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.16);
    boostFilter.Q.value = 2.0;

    const boostGain = audioCtx.createGain();
    boostGain.gain.setValueAtTime(0.0001, now);
    boostGain.gain.linearRampToValueAtTime(0.25, now + 0.008);
    boostGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    boostNoise.connect(boostFilter);
    boostFilter.connect(boostGain);
    boostGain.connect(masterDest);

    thumpOsc.start(now);
    thumpOsc.stop(now + 0.09);
    boostNoise.start(now);
    boostNoise.stop(now + 0.19);

    boostNoise.onended = () => {
      thumpOsc.disconnect();
      thumpGain.disconnect();
      boostNoise.disconnect();
      boostFilter.disconnect();
      boostGain.disconnect();
    };
  };

  interface AudioOutputRoute {
    destination: AudioNode;
    skyEcho: AudioNode | null;
    cleanup: () => void;
  }

  /**
   * Подготовка маршрута вывода звука с поддержкой стерео-панорамирования (StereoPannerNode)
   * Все звуки направляются в студийный мастер-тракт (сатуратор + компрессор) и атмосферный диффузор
   */
  const createOutputRoute = (
    audioCtx: AudioContext,
    pan?: number,
    now: number = audioCtx.currentTime,
  ): AudioOutputRoute => {
    const masterDest = getMasterIn(audioCtx);
    const skyEcho = getSkyEchoIn();

    if (
      pan !== undefined &&
      typeof audioCtx.createStereoPanner === 'function'
    ) {
      const clampedPan = Math.max(-1, Math.min(1, pan));
      const panner = audioCtx.createStereoPanner();
      panner.pan.setValueAtTime(clampedPan, now);
      panner.connect(masterDest);
      return {
        destination: panner,
        skyEcho,
        cleanup: () => {
          panner.disconnect();
        },
      };
    }
    return {
      destination: masterDest,
      skyEcho,
      cleanup: () => {},
    };
  };

  /**
   * Пресеты вариаций подрыва ложных целей (зенитный воздушный хлопок в облаке диполей)
   */
  const DECOY_VARIANTS = [
    { pitch: 0.90 }, // глуховатый рассеянный разрыв
    { pitch: 1.00 }, // стандартный сбалансированный хлопок
    { pitch: 1.12 }, // хлёсткий звонкий щелчок
  ] as const;

  /**
   * Пресеты вариаций перехвата крылатых ракет (титановый скрежет + громовой раскат)
   */
  const MISSILE_VARIANTS = [
    { pitch: 0.92 }, // попадание в хвостовой отсек (низкий раскат)
    { pitch: 1.00 }, // стандартный разрыв боевой части
    { pitch: 1.08 }, // попадание в корпус/сопло (хлёсткий скрежет)
  ] as const;

  /**
   * Пресеты вариаций крушения тяжёлого бомбардировщика (огненный шар + победный аккорд)
   */
  const BOMBER_VARIANTS = [
    { pitch: 0.94, chordRoot: 698.5, chordFifth: 1046.5 }, // Тональность Фа (F5 + C6)
    { pitch: 1.00, chordRoot: 784.0, chordFifth: 1175.0 }, // Тональность Соль (G5 + D6)
    { pitch: 1.06, chordRoot: 880.0, chordFifth: 1318.5 }, // Тональность Ля (A5 + E6)
  ] as const;

  /**
   * 1. ЛОЖНАЯ ЦЕЛЬ: Зенитный воздушный подрыв БЧ в облаке диполей (Airburst Flak Snap, 0.48 сек).
   * Ракета перехватчика детонирует на высоте: сверхзвуковая ударная волна Фридлендера малой БЧ
   * + быстрое рассеяние в атмосфере + шуршащее облако распыляемой металлической фольги (диполей).
   */
  const playDecoyExplosion = (
    audioCtx: AudioContext,
    route: AudioOutputRoute,
    now: number,
  ): void => {
    const duration = 0.48;

    // Слой 1: Физическая ударная волна зенитного разрыва (Friedlander Airburst Shock)
    const shock = audioCtx.createBufferSource();
    shock.buffer = getFriedlanderDecoyBuffer(audioCtx);

    const shockGain = audioCtx.createGain();
    shockGain.gain.setValueAtTime(0.70, now);

    shock.connect(shockGain);
    shockGain.connect(route.destination);
    if (route.skyEcho) {
      shockGain.connect(route.skyEcho);
    }

    // Слой 2: Воздушная каверна разрыва в атмосфере (Air Cavity Pop)
    const variant = DECOY_VARIANTS[Math.floor(Math.random() * DECOY_VARIANTS.length)];
    const v = variant.pitch;
    const popNoise = audioCtx.createBufferSource();
    popNoise.buffer = getBrownNoiseBuffer(audioCtx);

    const popFilter = audioCtx.createBiquadFilter();
    popFilter.type = 'lowpass';
    popFilter.frequency.setValueAtTime(550 * v, now);
    popFilter.frequency.exponentialRampToValueAtTime(100 * v, now + 0.25);
    popFilter.Q.value = 1.6;

    const popGain = audioCtx.createGain();
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.linearRampToValueAtTime(0.45, now + 0.002);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    popNoise.connect(popFilter);
    popFilter.connect(popGain);
    popGain.connect(route.destination);

    // Слой 3: Россыпь и шелест облака металлизированных диполей (Chaff Scatter)
    const chaffNoise = audioCtx.createBufferSource();
    chaffNoise.buffer = getWhiteNoiseBuffer(audioCtx);

    const chaffFilter = audioCtx.createBiquadFilter();
    chaffFilter.type = 'bandpass';
    chaffFilter.frequency.setValueAtTime(2800 * v, now);
    chaffFilter.frequency.exponentialRampToValueAtTime(850 * v, now + duration);
    chaffFilter.Q.value = 1.5;

    const chaffGain = audioCtx.createGain();
    chaffGain.gain.setValueAtTime(0.0001, now);
    chaffGain.gain.linearRampToValueAtTime(0.30, now + 0.006);
    chaffGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    chaffNoise.connect(chaffFilter);
    chaffFilter.connect(chaffGain);
    chaffGain.connect(route.destination);

    shock.start(now);
    shock.stop(now + 0.09);
    popNoise.start(now);
    popNoise.stop(now + 0.30);
    chaffNoise.start(now);
    chaffNoise.stop(now + duration);

    chaffNoise.onended = () => {
      shock.disconnect();
      shockGain.disconnect();
      popNoise.disconnect();
      popFilter.disconnect();
      popGain.disconnect();
      chaffNoise.disconnect();
      chaffFilter.disconnect();
      chaffGain.disconnect();
      route.cleanup();
    };
  };

  /**
   * 2. РАКЕТА (100 CR): Физический перехват гиперзвуковой боеголовки (0.80 сек).
   * 1. Ударная волна Фридлендера (сверхзвуковой пик давления + мгновенное вакуумное всасывание).
   * 2. Скрежет разлетающегося титанового корпуса и осколочное поле вольфрама.
   * 3. Раскатистый громовой хвост рассеяния взрыва в открытом небе (Thunder Roll).
   * Никаких резиновых шаров: физически достоверная аэродинамическая детонация.
   */
  const playMissileExplosion = (
    audioCtx: AudioContext,
    route: AudioOutputRoute,
    now: number,
  ): void => {
    const duration = 0.80;
    const variant = MISSILE_VARIANTS[Math.floor(Math.random() * MISSILE_VARIANTS.length)];
    const v = variant.pitch;

    // Слой 1: Физическая ударная волна детонации Фридлендера (Friedlander Shock Front)
    // Устраняет эффект лопнувшего шара за счёт фазы глубокого вакуумного разрежения (-P)
    const shock = audioCtx.createBufferSource();
    shock.buffer = getFriedlanderMissileBuffer(audioCtx);

    const shockGain = audioCtx.createGain();
    shockGain.gain.setValueAtTime(0.90, now);

    shock.connect(shockGain);
    shockGain.connect(route.destination);
    if (route.skyEcho) {
      shockGain.connect(route.skyEcho);
    }

    // Слой 2: Сверхзвуковой скрежет титанового корпуса и фрагментация (Titanium Metal Shred)
    const shredNoise = audioCtx.createBufferSource();
    shredNoise.buffer = getWhiteNoiseBuffer(audioCtx);

    const shredFilter = audioCtx.createBiquadFilter();
    shredFilter.type = 'bandpass';
    shredFilter.frequency.setValueAtTime(3200 * v, now);
    shredFilter.frequency.exponentialRampToValueAtTime(700 * v, now + 0.35);
    shredFilter.Q.value = 3.2;

    const shredGain = audioCtx.createGain();
    shredGain.gain.setValueAtTime(0.0001, now);
    shredGain.gain.linearRampToValueAtTime(0.60, now + 0.002);
    shredGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    shredNoise.connect(shredFilter);
    shredFilter.connect(shredGain);
    shredGain.connect(route.destination);

    // Слой 3: Раскатистый грохот расширяющихся газов (Atmospheric Gas Turbulence - коричневый шум)
    // Длительность 0.80 с даёт полноценный масштабный громовой хвост открытого пространства
    const blastNoise = audioCtx.createBufferSource();
    blastNoise.buffer = getBrownNoiseBuffer(audioCtx);

    const blastFilter = audioCtx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(750 * v, now);
    blastFilter.frequency.exponentialRampToValueAtTime(48 * v, now + duration);
    blastFilter.Q.value = 2.4;

    const blastGain = audioCtx.createGain();
    blastGain.gain.setValueAtTime(0.0001, now);
    blastGain.gain.linearRampToValueAtTime(0.68, now + 0.004);
    blastGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    blastNoise.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(route.destination);
    if (route.skyEcho) {
      blastGain.connect(route.skyEcho);
    }

    shock.start(now);
    shock.stop(now + 0.15);
    shredNoise.start(now);
    shredNoise.stop(now + 0.40);
    blastNoise.start(now);
    blastNoise.stop(now + duration);

    blastNoise.onended = () => {
      shock.disconnect();
      shockGain.disconnect();
      shredNoise.disconnect();
      shredFilter.disconnect();
      shredGain.disconnect();
      blastNoise.disconnect();
      blastFilter.disconnect();
      blastGain.disconnect();
      route.cleanup();
    };
  };

  /**
   * 3. БОМБАРДИРОВЩИК (150 CR): Двухфазная сокрушительная катастрофа тяжёлого борта (1.40 сек).
   * Фаза 1 (t=0): разрыв ракеты перехватчика.
   * Фаза 2 (t=+0.065с): вторичный колоссальный взрыв топливных цистерн керосина и бомбовых отсеков.
   * Ударная волна Фридлендера тяжёлой мощности + инфразвуковой сейсмический гул + многокилометровый раскат грома.
   */
  const playBomberExplosion = (
    audioCtx: AudioContext,
    route: AudioOutputRoute,
    now: number,
  ): void => {
    const duration = 1.40;
    const secondaryTime = now + 0.065; // Вторичная детонация топлива через 65 мс
    const variant = BOMBER_VARIANTS[Math.floor(Math.random() * BOMBER_VARIANTS.length)];
    const v = variant.pitch;

    // Фаза 1: Начальный удар ракеты по фюзеляжу (t = now)
    const strikeShock = audioCtx.createBufferSource();
    strikeShock.buffer = getFriedlanderDecoyBuffer(audioCtx);

    const strikeGain = audioCtx.createGain();
    strikeGain.gain.setValueAtTime(0.55, now);

    strikeShock.connect(strikeGain);
    strikeGain.connect(route.destination);

    // Фаза 2: Колоссальная вторичная ударная волна Фридлендера (тяжелый заряд)
    const heavyShock = audioCtx.createBufferSource();
    heavyShock.buffer = getFriedlanderBomberBuffer(audioCtx);

    const heavyShockGain = audioCtx.createGain();
    heavyShockGain.gain.setValueAtTime(0.0001, now);
    heavyShockGain.gain.setValueAtTime(0.95, secondaryTime);

    heavyShock.connect(heavyShockGain);
    heavyShockGain.connect(route.destination);
    if (route.skyEcho) {
      heavyShockGain.connect(route.skyEcho);
    }

    // Фаза 3: Взрыв 50 000 литров авиатоплива (Kerosene Fireball Blast - коричневый шум)
    const fuelNoise = audioCtx.createBufferSource();
    fuelNoise.buffer = getBrownNoiseBuffer(audioCtx);

    const fuelFilter = audioCtx.createBiquadFilter();
    fuelFilter.type = 'lowpass';
    fuelFilter.frequency.setValueAtTime(950 * v, secondaryTime);
    fuelFilter.frequency.exponentialRampToValueAtTime(24 * v, now + duration);
    fuelFilter.Q.value = 3.2;

    const fuelGain = audioCtx.createGain();
    fuelGain.gain.setValueAtTime(0.0001, now);
    fuelGain.gain.setValueAtTime(0.0001, secondaryTime);
    fuelGain.gain.linearRampToValueAtTime(0.85, secondaryTime + 0.008);
    fuelGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    fuelNoise.connect(fuelFilter);
    fuelFilter.connect(fuelGain);
    fuelGain.connect(route.destination);
    if (route.skyEcho) {
      fuelGain.connect(route.skyEcho);
    }

    // Фаза 4: Инфразвуковая сейсмическая вибрация (Acoustic Pressure Flutter 44 Гц и 40 Гц)
    const subOsc1 = audioCtx.createOscillator();
    const subOsc2 = audioCtx.createOscillator();
    const subFilter = audioCtx.createBiquadFilter();
    const subGain = audioCtx.createGain();

    subOsc1.type = 'sine';
    subOsc2.type = 'triangle';

    subFilter.type = 'lowpass';
    subFilter.frequency.value = 65;

    subOsc1.frequency.setValueAtTime(44 * v, secondaryTime);
    subOsc1.frequency.exponentialRampToValueAtTime(18 * v, now + duration);

    subOsc2.frequency.setValueAtTime(40 * v, secondaryTime);
    subOsc2.frequency.exponentialRampToValueAtTime(16 * v, now + duration);

    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.setValueAtTime(0.0001, secondaryTime);
    subGain.gain.linearRampToValueAtTime(0.60, secondaryTime + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);

    subOsc1.connect(subFilter);
    subOsc2.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(route.destination);

    // Фаза 5: Тонкий мажорный аккорд стратегической победы (варьируемый победный перезвон)
    const chordRoot = audioCtx.createOscillator();
    const chordFifth = audioCtx.createOscillator();
    const chordGain = audioCtx.createGain();
    chordRoot.type = 'sine';
    chordFifth.type = 'sine';
    chordRoot.frequency.setValueAtTime(variant.chordRoot, secondaryTime + 0.02);
    chordFifth.frequency.setValueAtTime(variant.chordFifth, secondaryTime + 0.02);

    chordGain.gain.setValueAtTime(0.0001, now);
    chordGain.gain.setValueAtTime(0.0001, secondaryTime + 0.02);
    chordGain.gain.linearRampToValueAtTime(0.04, secondaryTime + 0.03);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, secondaryTime + 0.28);

    chordRoot.connect(chordGain);
    chordFifth.connect(chordGain);
    chordGain.connect(route.destination);

    // Запуск узлов
    strikeShock.start(now);
    strikeShock.stop(now + 0.09);

    heavyShock.start(secondaryTime);
    heavyShock.stop(secondaryTime + 0.22);

    fuelNoise.start(now);
    fuelNoise.stop(now + duration);

    subOsc1.start(now);
    subOsc2.start(now);
    subOsc1.stop(now + duration);
    subOsc2.stop(now + duration);

    chordRoot.start(now);
    chordFifth.start(now);
    chordRoot.stop(now + 0.35);
    chordFifth.stop(now + 0.35);

    fuelNoise.onended = () => {
      strikeShock.disconnect();
      strikeGain.disconnect();
      heavyShock.disconnect();
      heavyShockGain.disconnect();
      fuelNoise.disconnect();
      fuelFilter.disconnect();
      fuelGain.disconnect();
      subOsc1.disconnect();
      subOsc2.disconnect();
      subFilter.disconnect();
      subGain.disconnect();
      chordRoot.disconnect();
      chordFifth.disconnect();
      chordGain.disconnect();
      route.cleanup();
    };
  };

  /**
   * 4. СОЮЗНИК (-150 CR, -1 ЖИЗНЬ): Звук катастрофы и потери связи (0.45 сек).
   * Далёкий глухой удар (без басового триумфа) + громкий аварийный военный зуммер Mayday +
   * реалистичный шум эфира рации с обрывом несущей.
   */
  const playFriendExplosion = (
    audioCtx: AudioContext,
    route: AudioOutputRoute,
    now: number,
  ): void => {
    // Слой 1: Глухой, далёкий приглушённый удар (коричневый шум, срезанный до 180 Гц)
    const thudNoise = audioCtx.createBufferSource();
    thudNoise.buffer = getBrownNoiseBuffer(audioCtx);

    const thudFilter = audioCtx.createBiquadFilter();
    thudFilter.type = 'lowpass';
    thudFilter.frequency.setValueAtTime(180, now);
    thudFilter.frequency.exponentialRampToValueAtTime(35, now + 0.32);
    thudFilter.Q.value = 1.0;

    const thudGain = audioCtx.createGain();
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(0.24, now + 0.004);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    thudNoise.connect(thudFilter);
    thudFilter.connect(thudGain);
    thudGain.connect(route.destination);
    if (route.skyEcho) {
      thudGain.connect(route.skyEcho);
    }

    const lowOsc = audioCtx.createOscillator();
    const lowFilter = audioCtx.createBiquadFilter();
    const lowGain = audioCtx.createGain();
    lowOsc.type = 'sine';
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 75;

    lowOsc.frequency.setValueAtTime(65, now);
    lowOsc.frequency.exponentialRampToValueAtTime(28, now + 0.22);

    lowGain.gain.setValueAtTime(0.0001, now);
    lowGain.gain.linearRampToValueAtTime(0.18, now + 0.005);
    lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    lowOsc.connect(lowFilter);
    lowFilter.connect(lowGain);
    lowGain.connect(route.destination);

    // Слой 2: Пронзительный сигнал аварийного маяка транспондера (Mayday A5 -> D5)
    // Пропущен через полосовой радиофильтр кабины самолёта (600 - 2600 Гц)
    const radioFilter = audioCtx.createBiquadFilter();
    radioFilter.type = 'bandpass';
    radioFilter.frequency.value = 1200;
    radioFilter.Q.value = 1.2;

    const beaconGain = audioCtx.createGain();
    radioFilter.connect(beaconGain);
    beaconGain.connect(route.destination);

    const beacon1 = audioCtx.createOscillator();
    beacon1.type = 'sawtooth';
    beacon1.frequency.setValueAtTime(880, now + 0.015);
    beacon1.connect(radioFilter);

    const beacon2 = audioCtx.createOscillator();
    beacon2.type = 'sawtooth';
    beacon2.frequency.setValueAtTime(587, now + 0.115);
    beacon2.connect(radioFilter);

    beaconGain.gain.setValueAtTime(0.0001, now);
    beaconGain.gain.setValueAtTime(0.0001, now + 0.015);
    beaconGain.gain.linearRampToValueAtTime(0.32, now + 0.02);
    beaconGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);

    beaconGain.gain.setValueAtTime(0.0001, now + 0.115);
    beaconGain.gain.linearRampToValueAtTime(0.34, now + 0.12);
    beaconGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.225);

    // Слой 3: Шипение обрыва радиосвязи с бортом (0.20 - 0.39 с)
    const staticNoise = audioCtx.createBufferSource();
    staticNoise.buffer = getWhiteNoiseBuffer(audioCtx);

    const staticFilter = audioCtx.createBiquadFilter();
    staticFilter.type = 'bandpass';
    staticFilter.frequency.value = 1500;
    staticFilter.Q.value = 2.4;

    const staticGain = audioCtx.createGain();
    staticGain.gain.setValueAtTime(0.0001, now);
    staticGain.gain.setValueAtTime(0.0001, now + 0.20);
    staticGain.gain.linearRampToValueAtTime(0.26, now + 0.21);
    staticGain.gain.setValueAtTime(0.26, now + 0.38);
    // Резкий щелчок пропажи несущей частоты рации
    staticGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.39);

    staticNoise.connect(staticFilter);
    staticFilter.connect(staticGain);
    staticGain.connect(route.destination);

    thudNoise.start(now);
    thudNoise.stop(now + 0.33);

    lowOsc.start(now);
    lowOsc.stop(now + 0.23);

    beacon1.start(now + 0.015);
    beacon1.stop(now + 0.11);

    beacon2.start(now + 0.115);
    beacon2.stop(now + 0.23);

    staticNoise.start(now + 0.20);
    staticNoise.stop(now + 0.40);

    staticNoise.onended = () => {
      thudNoise.disconnect();
      thudFilter.disconnect();
      thudGain.disconnect();
      lowOsc.disconnect();
      lowFilter.disconnect();
      lowGain.disconnect();
      beacon1.disconnect();
      beacon2.disconnect();
      radioFilter.disconnect();
      beaconGain.disconnect();
      staticNoise.disconnect();
      staticFilter.disconnect();
      staticGain.disconnect();
      route.cleanup();
    };
  };

  /**
   * 5. САМОЛЁТ РЭБ «СТРОБ» (150 CR):
   * Катастрофа генератора активных помех (0.85 сек):
   * - Кинетический разрыв корпуса с ударной волной Фридлендера;
   * - Глубокий атмосферный грохот разрушения фюзеляжа (коричневый шум 680 -> 42 Гц);
   * - Массивный индуктивный срыв контура генератора РЭБ (EMP Spindown: треугольная волна с 360 Гц до 36 Гц);
   * - Высоковольтная дуга короткого замыкания и схлопывание эфирного шума (полосовой фильтр 1200 -> 240 Гц).
   */
  const playJammerExplosion = (
    audioCtx: AudioContext,
    route: AudioOutputRoute,
    now: number,
  ): void => {
    const duration = 0.85;

    // Слой 1: Физическая ударная волна Фридлендера (Friedlander Shock Front)
    const shock = audioCtx.createBufferSource();
    shock.buffer = getFriedlanderMissileBuffer(audioCtx);

    const shockGain = audioCtx.createGain();
    shockGain.gain.setValueAtTime(0.85, now);

    shock.connect(shockGain);
    shockGain.connect(route.destination);
    if (route.skyEcho) {
      shockGain.connect(route.skyEcho);
    }

    // Слой 2: Глубокий грохот взрыва фюзеляжа и керосина (Brownian Gas Turbulence)
    const blastNoise = audioCtx.createBufferSource();
    blastNoise.buffer = getBrownNoiseBuffer(audioCtx);

    const blastFilter = audioCtx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(680, now);
    blastFilter.frequency.exponentialRampToValueAtTime(42, now + duration);
    blastFilter.Q.value = 2.0;

    const blastGain = audioCtx.createGain();
    blastGain.gain.setValueAtTime(0.0001, now);
    blastGain.gain.linearRampToValueAtTime(0.65, now + 0.004);
    blastGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    blastNoise.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(route.destination);
    if (route.skyEcho) {
      blastGain.connect(route.skyEcho);
    }

    // Слой 3: Мощный индуктивный срыв контура генератора РЭБ (EMP Generator Coil Spindown)
    // Сочный треугольный осциллятор, падающий с 360 Гц (плотный гул) в инфразвук 36 Гц
    const empOsc = audioCtx.createOscillator();
    empOsc.type = 'triangle';
    empOsc.frequency.setValueAtTime(360, now);
    empOsc.frequency.exponentialRampToValueAtTime(36, now + 0.38);

    const empFilter = audioCtx.createBiquadFilter();
    empFilter.type = 'lowpass';
    empFilter.frequency.setValueAtTime(750, now);
    empFilter.frequency.exponentialRampToValueAtTime(120, now + 0.38);
    empFilter.Q.value = 2.5;

    const empGain = audioCtx.createGain();
    empGain.gain.setValueAtTime(0.0001, now);
    empGain.gain.linearRampToValueAtTime(0.55, now + 0.006);
    empGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);

    empOsc.connect(empFilter);
    empFilter.connect(empGain);
    empGain.connect(route.destination);

    // Слой 4: Электрическая дуга короткого замыкания и распад эфирного шума (Arc Discharge & Static Collapse)
    const arcNoise = audioCtx.createBufferSource();
    arcNoise.buffer = getWhiteNoiseBuffer(audioCtx);

    const arcFilter = audioCtx.createBiquadFilter();
    arcFilter.type = 'bandpass';
    arcFilter.frequency.setValueAtTime(1200, now);
    arcFilter.frequency.exponentialRampToValueAtTime(240, now + 0.28);
    arcFilter.Q.value = 1.8;

    const arcGain = audioCtx.createGain();
    arcGain.gain.setValueAtTime(0.0001, now);
    arcGain.gain.linearRampToValueAtTime(0.42, now + 0.003);
    arcGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);

    arcNoise.connect(arcFilter);
    arcFilter.connect(arcGain);
    arcGain.connect(route.destination);

    // Старт источников
    shock.start(now);
    shock.stop(now + 0.16);

    blastNoise.start(now);
    blastNoise.stop(now + duration);

    empOsc.start(now);
    empOsc.stop(now + 0.40);

    arcNoise.start(now);
    arcNoise.stop(now + 0.32);

    blastNoise.onended = () => {
      shock.disconnect();
      shockGain.disconnect();
      blastNoise.disconnect();
      blastFilter.disconnect();
      blastGain.disconnect();
      empOsc.disconnect();
      empFilter.disconnect();
      empGain.disconnect();
      arcNoise.disconnect();
      arcFilter.disconnect();
      arcGain.disconnect();
      route.cleanup();
    };
  };

  /**
   * 6. ШТУРМОВИК ПМВ «СТРИЖ» (150 CR):
   * Скоростной кинетический разрыв титанового фюзеляжа на бреющем полёте (0.75 сек):
   * - Хлёсткая ударная волна детонации ракеты;
   * - Грохот взрыва спаренных турбин и авиатоплива (коричневый шум 720 -> 40 Гц);
   * - Свистящий скрежет разрушающегося компрессора двигателя (440 -> 75 Гц).
   */
  const playTerrainHuggerExplosion = (
    audioCtx: AudioContext,
    route: AudioOutputRoute,
    now: number,
  ): void => {
    const duration = 0.75;

    // Слой 1: Ударная волна Фридлендера (сверхзвуковой хлёсткий хлопок)
    const shock = audioCtx.createBufferSource();
    shock.buffer = getFriedlanderMissileBuffer(audioCtx);

    const shockGain = audioCtx.createGain();
    shockGain.gain.setValueAtTime(0.88, now);

    shock.connect(shockGain);
    shockGain.connect(route.destination);
    if (route.skyEcho) {
      shockGain.connect(route.skyEcho);
    }

    // Слой 2: Раскатистый грохот керосинового шара (коричневый шум)
    const blastNoise = audioCtx.createBufferSource();
    blastNoise.buffer = getBrownNoiseBuffer(audioCtx);

    const blastFilter = audioCtx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(720, now);
    blastFilter.frequency.exponentialRampToValueAtTime(40, now + duration);
    blastFilter.Q.value = 2.2;

    const blastGain = audioCtx.createGain();
    blastGain.gain.setValueAtTime(0.0001, now);
    blastGain.gain.linearRampToValueAtTime(0.64, now + 0.003);
    blastGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    blastNoise.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(route.destination);
    if (route.skyEcho) {
      blastGain.connect(route.skyEcho);
    }

    // Слой 3: Срыв компрессора форсированных двигателей (свистящий спад с 440 Гц)
    const engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(440, now);
    engineOsc.frequency.exponentialRampToValueAtTime(75, now + 0.32);

    const engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(650, now);
    engineFilter.frequency.exponentialRampToValueAtTime(120, now + 0.32);
    engineFilter.Q.value = 2.0;

    const engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0.0001, now);
    engineGain.gain.linearRampToValueAtTime(0.40, now + 0.005);
    engineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(route.destination);

    shock.start(now);
    shock.stop(now + 0.14);

    blastNoise.start(now);
    blastNoise.stop(now + duration);

    engineOsc.start(now);
    engineOsc.stop(now + 0.35);

    blastNoise.onended = () => {
      shock.disconnect();
      shockGain.disconnect();
      blastNoise.disconnect();
      blastFilter.disconnect();
      blastGain.disconnect();
      engineOsc.disconnect();
      engineFilter.disconnect();
      engineGain.disconnect();
      route.cleanup();
    };
  };

  /**
   * Синтез звука детонации цели с дифференциацией по типу и стерео-панорамированием (pan: -1.0 .. +1.0)
   */
  const playExplosion = (targetType: TargetType, pan?: number): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const route = createOutputRoute(audioCtx, pan, now);

    switch (targetType) {
      case 'decoy':
        playDecoyExplosion(audioCtx, route, now);
        break;
      case 'missile':
        playMissileExplosion(audioCtx, route, now);
        break;
      case 'bomber':
        playBomberExplosion(audioCtx, route, now);
        break;
      case 'jammer':
        playJammerExplosion(audioCtx, route, now);
        break;
      case 'terrain_hugger':
        playTerrainHuggerExplosion(audioCtx, route, now);
        break;
      case 'supersonic_recon':
        playTerrainHuggerExplosion(audioCtx, route, now);
        break;
      case 'friend':
        playFriendExplosion(audioCtx, route, now);
        break;
    }
  };

  /**
   * Звуковой эффект прямого урона по базе (Сейсмический удар + сирена аварии бункера)
   * Длительность ~0.56с (согласована с baseFlashTimer = 0.6с в GameScene)
   */
  const playBaseDamage = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);

    // Слой 1: Тяжёлый кинетический удар по конструкции базы (коричневый шум)
    const subOsc = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(115, now);
    subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.45);

    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.40, now + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    subOsc.connect(subGain);
    subGain.connect(masterDest);
    subOsc.start(now);
    subOsc.stop(now + 0.46);

    const noise = audioCtx.createBufferSource();
    noise.buffer = getBrownNoiseBuffer(audioCtx);

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(340, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(45, now + 0.42);
    noiseFilter.Q.value = 2.0;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.35, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterDest);
    noise.start(now);
    noise.stop(now + 0.43);

    // Слой 2: Двухтоновый вой аварийного клаксона бункера (0.10 - 0.54с)
    const siren = audioCtx.createOscillator();
    const sirenFilter = audioCtx.createBiquadFilter();
    const sirenGain = audioCtx.createGain();

    siren.type = 'sawtooth';
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1500;

    siren.frequency.setValueAtTime(540, now + 0.10);
    siren.frequency.exponentialRampToValueAtTime(360, now + 0.28);
    siren.frequency.setValueAtTime(580, now + 0.32);
    siren.frequency.exponentialRampToValueAtTime(380, now + 0.54);

    sirenGain.gain.setValueAtTime(0.0001, now);
    sirenGain.gain.setValueAtTime(0.0001, now + 0.10);
    sirenGain.gain.linearRampToValueAtTime(0.12, now + 0.12);
    sirenGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    sirenGain.gain.setValueAtTime(0.0001, now + 0.32);
    sirenGain.gain.linearRampToValueAtTime(0.12, now + 0.34);
    sirenGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.54);

    siren.connect(sirenFilter);
    sirenFilter.connect(sirenGain);
    sirenGain.connect(masterDest);
    siren.start(now + 0.10);
    siren.stop(now + 0.55);

    subOsc.onended = () => {
      subOsc.disconnect();
      subGain.disconnect();
    };
    noise.onended = () => {
      noise.disconnect();
      noiseFilter.disconnect();
      noiseGain.disconnect();
    };
    siren.onended = () => {
      siren.disconnect();
      sirenFilter.disconnect();
      sirenGain.disconnect();
    };
  };

  /**
   * Секвенция перехода к новой волне (адаптирована под 3.0-3.6с паузы):
   * 1. 0.00..0.45с: Механическая подача боекомплекта в шахты (пневматика + двойной лязг замка);
   * 2. 0.45..1.60с: Разгон сервопривода/турбины антенны РЛС (Antenna Spool-Up) + щелчок реле;
   * 3. 1.68..2.70с: Строгий тактический секторный интервал (Ready Chime F4 -> C5);
   * 4. 1.95..3.20с: Торжественный мажорный обертон при чистой волне (Clean Wave A5 + F5).
   */
  const playWaveTransition = (isCleanWave = false): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);
    const skyEcho = getSkyEchoIn();

    // -----------------------------------------------------------------
    // ФАЗА 1: Снабжение шахт (пневмо-сброс воздуха + фиксация обоймы)
    // -----------------------------------------------------------------
    // 1.1 Пневматический сброс давления (0.00 - 0.20с)
    const ventNoise = audioCtx.createBufferSource();
    ventNoise.buffer = getWhiteNoiseBuffer(audioCtx);

    const ventFilter = audioCtx.createBiquadFilter();
    ventFilter.type = 'bandpass';
    ventFilter.frequency.setValueAtTime(1400, now);
    ventFilter.Q.value = 1.8;

    const ventGain = audioCtx.createGain();
    ventGain.gain.setValueAtTime(0.0001, now);
    ventGain.gain.linearRampToValueAtTime(0.18, now + 0.008);
    ventGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    ventNoise.connect(ventFilter);
    ventFilter.connect(ventGain);
    ventGain.connect(masterDest);

    // 1.2 Механические двойные щелчки направляющих ракет (clack-clack)
    // Щелчок 1 (t = 0.10c)
    const clack1 = audioCtx.createOscillator();
    const clackGain1 = audioCtx.createGain();
    clack1.type = 'triangle';
    clack1.frequency.setValueAtTime(380, now + 0.10);
    clack1.frequency.exponentialRampToValueAtTime(110, now + 0.14);

    clackGain1.gain.setValueAtTime(0.0001, now);
    clackGain1.gain.setValueAtTime(0.0001, now + 0.10);
    clackGain1.gain.linearRampToValueAtTime(0.18, now + 0.103);
    clackGain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    clack1.connect(clackGain1);
    clackGain1.connect(masterDest);

    // Щелчок 2 (t = 0.22c - тяжелый замок)
    const clack2 = audioCtx.createOscillator();
    const clackGain2 = audioCtx.createGain();
    clack2.type = 'triangle';
    clack2.frequency.setValueAtTime(440, now + 0.22);
    clack2.frequency.exponentialRampToValueAtTime(130, now + 0.27);

    clackGain2.gain.setValueAtTime(0.0001, now);
    clackGain2.gain.setValueAtTime(0.0001, now + 0.22);
    clackGain2.gain.linearRampToValueAtTime(0.22, now + 0.223);
    clackGain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);

    clack2.connect(clackGain2);
    clackGain2.connect(masterDest);

    // -----------------------------------------------------------------
    // ФАЗА 2: Разгон привода антенны РЛС (0.45 - 1.60с)
    // -----------------------------------------------------------------
    // Свист/гул набора оборотов турбины локатора
    const spoolOsc = audioCtx.createOscillator();
    const spoolFilter = audioCtx.createBiquadFilter();
    const spoolGain = audioCtx.createGain();

    spoolOsc.type = 'sawtooth';
    spoolFilter.type = 'lowpass';
    spoolFilter.Q.value = 3.5;

    spoolOsc.frequency.setValueAtTime(95, now + 0.45);
    spoolOsc.frequency.exponentialRampToValueAtTime(480, now + 1.55);

    spoolFilter.frequency.setValueAtTime(220, now + 0.45);
    spoolFilter.frequency.exponentialRampToValueAtTime(1150, now + 1.55);

    spoolGain.gain.setValueAtTime(0.0001, now);
    spoolGain.gain.setValueAtTime(0.0001, now + 0.45);
    spoolGain.gain.linearRampToValueAtTime(0.14, now + 1.35);
    spoolGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.60);

    spoolOsc.connect(spoolFilter);
    spoolFilter.connect(spoolGain);
    spoolGain.connect(masterDest);

    // Щелчок высоковольтного реле питания (t = 1.55c)
    const relayOsc = audioCtx.createOscillator();
    const relayFilter = audioCtx.createBiquadFilter();
    const relayGain = audioCtx.createGain();

    relayOsc.type = 'square';
    relayFilter.type = 'lowpass';
    relayFilter.frequency.value = 650;

    relayOsc.frequency.setValueAtTime(180, now + 1.55);
    relayOsc.frequency.exponentialRampToValueAtTime(45, now + 1.60);

    relayGain.gain.setValueAtTime(0.0001, now);
    relayGain.gain.setValueAtTime(0.0001, now + 1.55);
    relayGain.gain.linearRampToValueAtTime(0.20, now + 1.553);
    relayGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.61);

    relayOsc.connect(relayFilter);
    relayFilter.connect(relayGain);
    relayGain.connect(masterDest);

    // -----------------------------------------------------------------
    // ФАЗА 3: Строгий тактический секторный интервал (1.68 - 2.70с)
    // -----------------------------------------------------------------
    const chime1 = audioCtx.createOscillator();
    const chimeGain1 = audioCtx.createGain();
    chime1.type = 'sine';
    chime1.frequency.setValueAtTime(349.2, now + 1.68); // Нота F4

    chimeGain1.gain.setValueAtTime(0.0001, now);
    chimeGain1.gain.setValueAtTime(0.0001, now + 1.68);
    chimeGain1.gain.linearRampToValueAtTime(0.18, now + 1.69);
    chimeGain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.96);

    chime1.connect(chimeGain1);
    chimeGain1.connect(masterDest);

    const chime2 = audioCtx.createOscillator();
    const chimeGain2 = audioCtx.createGain();
    chime2.type = 'sine';
    chime2.frequency.setValueAtTime(523.3, now + 1.95); // Нота C5

    chimeGain2.gain.setValueAtTime(0.0001, now);
    chimeGain2.gain.setValueAtTime(0.0001, now + 1.95);
    chimeGain2.gain.linearRampToValueAtTime(0.22, now + 1.96);
    chimeGain2.gain.exponentialRampToValueAtTime(0.0001, now + 2.70);

    chime2.connect(chimeGain2);
    chimeGain2.connect(masterDest);
    if (skyEcho) {
      chimeGain2.connect(skyEcho);
    }

    // -----------------------------------------------------------------
    // ФАЗА 4: Торжественный мажорный аккорд чистой волны (1.95 - 3.20с)
    // -----------------------------------------------------------------
    let bonusRoot: OscillatorNode | null = null;
    let bonusFifth: OscillatorNode | null = null;
    let bonusGain: GainNode | null = null;

    if (isCleanWave) {
      bonusRoot = audioCtx.createOscillator();
      bonusFifth = audioCtx.createOscillator();
      bonusGain = audioCtx.createGain();

      bonusRoot.type = 'sine';
      bonusFifth.type = 'sine';
      bonusRoot.frequency.setValueAtTime(698.5, now + 1.95); // F5
      bonusFifth.frequency.setValueAtTime(880.0, now + 1.95); // A5

      bonusGain.gain.setValueAtTime(0.0001, now);
      bonusGain.gain.setValueAtTime(0.0001, now + 1.95);
      bonusGain.gain.linearRampToValueAtTime(0.14, now + 1.97);
      bonusGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.20);

      bonusRoot.connect(bonusGain);
      bonusFifth.connect(bonusGain);
      bonusGain.connect(masterDest);
      if (skyEcho) {
        bonusGain.connect(skyEcho);
      }
    }

    // Запуск узлов
    ventNoise.start(now);
    ventNoise.stop(now + 0.20);

    clack1.start(now + 0.10);
    clack1.stop(now + 0.15);

    clack2.start(now + 0.22);
    clack2.stop(now + 0.28);

    spoolOsc.start(now + 0.45);
    spoolOsc.stop(now + 1.62);

    relayOsc.start(now + 1.55);
    relayOsc.stop(now + 1.62);

    chime1.start(now + 1.68);
    chime1.stop(now + 1.98);

    const endMarker = bonusRoot || chime2;
    chime2.start(now + 1.95);
    chime2.stop(now + 2.72);

    if (bonusRoot && bonusFifth) {
      bonusRoot.start(now + 1.95);
      bonusFifth.start(now + 1.95);
      bonusRoot.stop(now + 3.22);
      bonusFifth.stop(now + 3.22);
    }

    endMarker.onended = () => {
      ventNoise.disconnect();
      ventFilter.disconnect();
      ventGain.disconnect();
      clack1.disconnect();
      clackGain1.disconnect();
      clack2.disconnect();
      clackGain2.disconnect();
      spoolOsc.disconnect();
      spoolFilter.disconnect();
      spoolGain.disconnect();
      relayOsc.disconnect();
      relayFilter.disconnect();
      relayGain.disconnect();
      chime1.disconnect();
      chimeGain1.disconnect();
      chime2.disconnect();
      chimeGain2.disconnect();
      if (bonusRoot && bonusFifth && bonusGain) {
        bonusRoot.disconnect();
        bonusFifth.disconnect();
        bonusGain.disconnect();
      }
    };
  };

  /**
   * Тактический сигнал тревоги при массированном залпе (глубокий, низкий и звонкий резонансный боевой ревун ПВО)
   */
  const playSalvoAlert = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);

    // Двойной раскатистый импульс боевого корабельного ревуна (тяжелый низкий гул с металлической формантой)
    const pulses = [
      { start: 0, dur: 0.22, baseFreq: 142 },
      { start: 0.25, dur: 0.28, baseFreq: 138 },
    ];

    pulses.forEach(({ start, dur, baseFreq }) => {
      const t = now + start;

      // Два взаимно расстроенных пилообразных осциллятора для низкого вибрирующего баса
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      // Квадратная волна октавы для металлического звонкого обертона трубы
      const oscSub = audioCtx.createOscillator();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      oscSub.type = 'square';

      // Легкий нисходящий питч-глиссандо для ощущения тяжелой массы ревуна
      osc1.frequency.setValueAtTime(baseFreq * 1.08, t);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq, t + dur * 0.6);

      osc2.frequency.setValueAtTime(baseFreq * 1.08 + 3.2, t);
      osc2.frequency.exponentialRampToValueAtTime(baseFreq + 3.0, t + dur * 0.6);

      oscSub.frequency.setValueAtTime(baseFreq * 2.0, t);
      oscSub.frequency.exponentialRampToValueAtTime(baseFreq * 1.96, t + dur * 0.6);

      // Резонансный фильтр для металлического формантного тембра клаксона (звонкий раструб)
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, t);
      filter.frequency.exponentialRampToValueAtTime(520, t + dur);
      filter.Q.setValueAtTime(3.8, t);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.018); // Быстрая плотная атака
      gain.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      // Микширование в фильтр
      const subGain = audioCtx.createGain();
      subGain.gain.setValueAtTime(0.35, t);

      osc1.connect(filter);
      osc2.connect(filter);
      oscSub.connect(subGain);
      subGain.connect(filter);

      filter.connect(gain);
      gain.connect(masterDest);

      osc1.start(t);
      osc2.start(t);
      oscSub.start(t);

      const stopTime = t + dur + 0.02;
      osc1.stop(stopTime);
      osc2.stop(stopTime);
      oscSub.stop(stopTime);

      osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        oscSub.disconnect();
        subGain.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    });
  };

  /**
   * Быстрая очередь импульсов ("пиу-пиу-пиу") автопушки патрульного дрона
   */
  const playDroneBurst = (pan?: number): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const route = createOutputRoute(audioCtx, pan, now);

    // Серия из 3 быстрых импульсов автопушки
    for (let i = 0; i < 3; i++) {
      const shotTime = now + i * 0.055;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1250, shotTime);
      osc.frequency.exponentialRampToValueAtTime(320, shotTime + 0.045);

      gain.gain.setValueAtTime(0.0001, shotTime);
      gain.gain.linearRampToValueAtTime(0.22, shotTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, shotTime + 0.045);

      osc.connect(gain);
      gain.connect(route.destination);

      osc.start(shotTime);
      osc.stop(shotTime + 0.05);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  };

  /**
   * Мягкий тактический импульс предупреждения о секторе обстрела
   */
  const playSectorWarningPing = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(510, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(masterDest);

    osc.start(now);
    osc.stop(now + 0.13);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  };

  /**
   * Двойной высокий пинг РЛС при обнаружении сверхзвукового разведчика
   */
  const playReconAlert = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);

    [0, 0.11].forEach((offset, idx) => {
      const t = now + offset;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const freq = idx === 0 ? 1280 : 1680;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.12, t + 0.075);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

      osc.connect(gain);
      gain.connect(masterDest);

      osc.start(t);
      osc.stop(t + 0.085);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  };

  /**
   * Раскатистый низкий гул множественного старта заградительных ракет
   */
  const playBarrageRocketLaunch = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);
    const noiseBuffer = getWhiteNoiseBuffer(audioCtx);

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.4;
    filter.frequency.setValueAtTime(95, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.65);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.24, now + 0.12);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    const subOsc = audioCtx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(58, now);
    subOsc.frequency.exponentialRampToValueAtTime(44, now + 0.7);

    const subGain = audioCtx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.18, now + 0.08);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterDest);

    subOsc.connect(subGain);
    subGain.connect(masterDest);

    noiseSource.start(now);
    noiseSource.stop(now + 0.86);
    subOsc.start(now);
    subOsc.stop(now + 0.76);

    noiseSource.onended = () => {
      noiseSource.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
      subOsc.disconnect();
      subGain.disconnect();
    };
  };

  /**
   * Хлёсткий высотный разрыв заградительной ракеты (Airburst Pop)
   */
  const playAirburst = (pan?: number): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const route = createOutputRoute(audioCtx, pan, now);

    const noiseBuffer = getWhiteNoiseBuffer(audioCtx);
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;

    const bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 1100 + Math.random() * 300;
    bpf.Q.value = 3.2;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.22, now + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    const thump = audioCtx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(130, now);
    thump.frequency.exponentialRampToValueAtTime(45, now + 0.12);

    const thumpGain = audioCtx.createGain();
    thumpGain.gain.setValueAtTime(0.001, now);
    thumpGain.gain.linearRampToValueAtTime(0.20, now + 0.006);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    noise.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(route.destination);

    thump.connect(thumpGain);
    thumpGain.connect(route.destination);

    noise.start(now);
    noise.stop(now + 0.09);
    thump.start(now);
    thump.stop(now + 0.13);

    noise.onended = () => {
      noise.disconnect();
      bpf.disconnect();
      noiseGain.disconnect();
      thump.disconnect();
      thumpGain.disconnect();
    };
  };

  /**
   * Тихое шипение / треск горящих фаеров в атмосфере
   */
  const playFlareSizzle = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);
    const noiseBuffer = getWhiteNoiseBuffer(audioCtx);

    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;

    const hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3400;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    noise.connect(hpf);
    hpf.connect(gain);
    gain.connect(masterDest);

    noise.start(now);
    noise.stop(now + 0.56);
    noise.onended = () => {
      noise.disconnect();
      hpf.disconnect();
      gain.disconnect();
    };
  };

  /**
   * Схлопывание помех и катастрофа самолёта РЭБ (с панорамированием)
   */
  const playJammerShutdown = (pan?: number): void => {
    playExplosion('jammer', pan);
  };

  /**
   * Свистящий турбинный форсаж при выходе штурмовика ПМВ из тени рельефа (Pop-up cue)
   */
  const playTerrainHuggerPopUp = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = masterIn || audioCtx.destination;

    // 1. Поток рассекаемого воздуха на форсаже (воздушный шквал)
    const noise = audioCtx.createBufferSource();
    noise.buffer = getWhiteNoiseBuffer(audioCtx);

    const bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(600, now);
    bpf.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
    bpf.frequency.exponentialRampToValueAtTime(750, now + 0.25);
    bpf.Q.value = 2.4;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.08);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    noise.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(masterDest);

    // 2. Свист раскрутки турбин
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);

    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.linearRampToValueAtTime(0.14, now + 0.06);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(oscGain);
    oscGain.connect(masterDest);

    noise.start(now);
    noise.stop(now + 0.26);
    osc.start(now);
    osc.stop(now + 0.24);

    noise.onended = () => {
      noise.disconnect();
      bpf.disconnect();
      noiseGain.disconnect();
      osc.disconnect();
      oscGain.disconnect();
    };
  };

  /**
   * Процедурный раскат грома ионизационного фронта (Thunderclap & Tropospheric Rumble)
   */
  const playThunderClap = (pan?: number): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const route = createOutputRoute(audioCtx, pan, now);

    // 1. Начальный треск статики в приёмнике (Static Discharge Crackle)
    const crackle = audioCtx.createBufferSource();
    crackle.buffer = getWhiteNoiseBuffer(audioCtx);

    const crackleFilter = audioCtx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 2400 + Math.random() * 400;
    crackleFilter.Q.value = 3.5;

    const crackleGain = audioCtx.createGain();
    crackleGain.gain.setValueAtTime(0.0001, now);
    crackleGain.gain.linearRampToValueAtTime(0.12, now + 0.003);
    crackleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    crackle.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(route.destination);

    crackle.start(now);
    crackle.stop(now + 0.04);

    // 2. Глубокий раскат грома (Low-Frequency Tropospheric Rumble)
    const rumble = audioCtx.createBufferSource();
    rumble.buffer = getBrownNoiseBuffer(audioCtx);

    const rumbleFilter = audioCtx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(145, now);
    rumbleFilter.frequency.exponentialRampToValueAtTime(45, now + 1.2);
    rumbleFilter.Q.value = 2.2;

    const rumbleGain = audioCtx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, now);
    rumbleGain.gain.linearRampToValueAtTime(0.28, now + 0.05);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(route.destination);

    rumble.start(now);
    rumble.stop(now + 1.45);

    rumble.onended = () => {
      crackle.disconnect();
      crackleFilter.disconnect();
      crackleGain.disconnect();
      rumble.disconnect();
      rumbleFilter.disconnect();
      rumbleGain.disconnect();
    };
  };

  /**
   * Сухой тактильный микрощелчок реле при наведении на клавишу пульта
   */
  const playMenuHover = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.012);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);

    osc.connect(gain);
    gain.connect(getMasterIn(audioCtx));

    osc.start(now);
    osc.stop(now + 0.016);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  };

  /**
   * Тяжёлый индустриальный «клак» срабатывания соленоида кнопки пульта
   */
  const playMenuSelect = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);

    // 1. Металлический удар клавиши
    const thump = audioCtx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(280, now);
    thump.frequency.exponentialRampToValueAtTime(80, now + 0.038);

    const thumpGain = audioCtx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(0.20, now + 0.003);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    thump.connect(thumpGain);
    thumpGain.connect(masterDest);

    // 2. Механический контактный щелчок
    const click = audioCtx.createOscillator();
    click.type = 'square';
    click.frequency.setValueAtTime(950, now);
    click.frequency.exponentialRampToValueAtTime(240, now + 0.015);

    const clickGain = audioCtx.createGain();
    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.linearRampToValueAtTime(0.08, now + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

    click.connect(clickGain);
    clickGain.connect(masterDest);

    thump.start(now);
    thump.stop(now + 0.055);
    click.start(now);
    click.stop(now + 0.025);

    thump.onended = () => {
      thump.disconnect();
      thumpGain.disconnect();
      click.disconnect();
      clickGain.disconnect();
    };
  };

  /**
   * Размагничивание кинескопа ЭЛТ при пуске комплекса (CRT Degauss Thump)
   */
  const playDegauss = (): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const masterDest = getMasterIn(audioCtx);

    // Низкочастотный затухающий волновой спад катушки размагничивания
    const degauss = audioCtx.createOscillator();
    degauss.type = 'sine';
    degauss.frequency.setValueAtTime(85, now);
    degauss.frequency.exponentialRampToValueAtTime(34, now + 0.65);

    const degaussGain = audioCtx.createGain();
    degaussGain.gain.setValueAtTime(0.0001, now);
    degaussGain.gain.linearRampToValueAtTime(0.35, now + 0.04);
    degaussGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.70);

    degauss.connect(degaussGain);
    degaussGain.connect(masterDest);

    degauss.start(now);
    degauss.stop(now + 0.72);
    degauss.onended = () => {
      degauss.disconnect();
      degaussGain.disconnect();
    };
  };

  const stopAll = (): void => {
    lastPingTime = 0;
    if (!ctx) return;

    teardownMasterChain?.();
    teardownMasterChain = null;
    setupMasterChain(ctx);

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };

  const toggleMute = (): boolean => {
    isMuted = !isMuted;
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(isMuted ? 0 : 1, ctx.currentTime);
    }
    return isMuted;
  };

  return {
    resume,
    playRadarPing,
    playExplosion,
    playBaseDamage,
    playDenyClick,
    playLaunch,
    playDroneBurst,
    playWaveTransition,
    playSalvoAlert,
    playSectorWarningPing,
    playBarrageRocketLaunch,
    playAirburst,
    playFlareSizzle,
    playJammerShutdown,
    playTerrainHuggerPopUp,
    playReconAlert,
    playThunderClap,
    playMenuHover,
    playMenuSelect,
    playDegauss,
    stopAll,
    toggleMute,
    get isMuted() {
      return isMuted;
    },
  };
}
