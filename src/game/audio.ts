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

  /**
   * Инициализация студийного мастер-тракта обработки (Сатурация + Компрессор + Лимитер + Атмосферный диффузор)
   */
  const setupMasterChain = (audioCtx: AudioContext): void => {
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
    if (typeof audioCtx.createStereoPanner === 'function') {
      const pannerL = audioCtx.createStereoPanner();
      pannerL.pan.value = -0.65;
      dampL.connect(pannerL);
      pannerL.connect(masterIn);

      const pannerR = audioCtx.createStereoPanner();
      pannerR.pan.value = 0.65;
      dampR.connect(pannerR);
      pannerR.connect(masterIn);
    } else {
      dampL.connect(masterIn);
      dampR.connect(masterIn);
    }
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
   * Воспроизведение аутентичного радиолокационного "пилика" при засветке метки лучом
   */
  const playRadarPing = (pitch = 1200): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    const startTime = Math.max(now, lastPingTime + 0.035);
    lastPingTime = startTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, startTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.8, startTime + 0.08);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(0.12, startTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);

    osc.connect(gain);
    gain.connect(getMasterIn(audioCtx));

    osc.start(startTime);
    osc.stop(startTime + 0.09);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
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
    const v = 0.96 + Math.random() * 0.08; // Микродисперсия частот для живого нецифрового звука
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
    const v = 0.96 + Math.random() * 0.08; // Органическая микродисперсия (±4%)

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
    const v = 0.96 + Math.random() * 0.08; // Органическая микродисперсия (±4%)

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

    // Фаза 5: Тонкий мажорный аккорд стратегической победы (G5 784 Гц + D6 1175 Гц)
    const chordRoot = audioCtx.createOscillator();
    const chordFifth = audioCtx.createOscillator();
    const chordGain = audioCtx.createGain();
    chordRoot.type = 'sine';
    chordFifth.type = 'sine';
    chordRoot.frequency.setValueAtTime(784, secondaryTime + 0.02);
    chordFifth.frequency.setValueAtTime(1175, secondaryTime + 0.02);

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
    toggleMute,
    get isMuted() {
      return isMuted;
    },
  };
}
