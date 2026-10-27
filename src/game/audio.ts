import type { TargetType } from './gameConfig';

/**
 * Звуковая подсистема радара на базе Web Audio API.
 * Полностью автономна, не требует аудиофайлов и внешних библиотек.
 */
export interface SoundSystem {
  resume: () => void;
  playRadarPing: (pitch?: number) => void;
  playExplosion: (targetType: TargetType) => void;
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
  let cachedNoiseBuffer: AudioBuffer | null = null;

  const getContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;

    if (!ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }

    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    return ctx;
  };

  const getNoiseBuffer = (audioCtx: AudioContext): AudioBuffer => {
    if (!cachedNoiseBuffer || cachedNoiseBuffer.sampleRate !== audioCtx.sampleRate) {
      const bufferSize = audioCtx.sampleRate; // 1 секунда моно-шума
      cachedNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = cachedNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return cachedNoiseBuffer;
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

    // Небольшое смещение (35мс), если несколько меток задеты одновременно,
    // чтобы звуки не сливались в клиппирующий шум, а звучали серией микро-кликов
    const startTime = Math.max(now, lastPingTime + 0.035);
    lastPingTime = startTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';

    // Короткий аналоговый спад частоты (1200 Гц -> ~960 Гц) за 80 миллисекунд
    osc.frequency.setValueAtTime(pitch, startTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.8, startTime + 0.08);

    // Огибающая громкости: быстрая мягкая атака 4 мс (без щелчка) и экспоненциальный спад
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(0.07, startTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

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
    gain.gain.linearRampToValueAtTime(0.06, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  };

  /**
   * Синтез звука детонации (Концепт 3: Ретро-взрыв ПВО) с дифференциацией по типу цели
   * Длительности согласованы с визуальными эффектами: flashDuration (0.35с) и waveDuration (0.55с)
   */
  const playExplosion = (targetType: TargetType): void => {
    if (isMuted) return;
    const audioCtx = getContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    if (targetType === 'decoy') {
      // 1. ЛОЖНАЯ ЦЕЛЬ: Слабый, глухой "пшик/хлопок" (0.24 сек)
      // Вспышка в коде длится 0.35с, ударной волны нет.
      // Ракета разорвалась впустую — только облако фольги/диполей, нет детонации корпуса цели
      const noise = audioCtx.createBufferSource();
      noise.buffer = getNoiseBuffer(audioCtx);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(750, now);
      filter.frequency.exponentialRampToValueAtTime(220, now + 0.22);
      filter.Q.value = 1.6;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      noise.start(now);
      noise.stop(now + 0.24);

      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      return;
    }

    // 2. БОЕВЫЕ ЦЕЛИ (Техника: missile, bomber, friend — у всех есть ударная волна 0.55 сек)
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer(audioCtx);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';

    const noiseGain = audioCtx.createGain();

    // Суб-басовый кинетический удар (Sine Sub-Bass Drop)
    const subOsc = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    subOsc.type = 'sine';

    if (targetType === 'bomber') {
      // БОМБАРДИРОВЩИК (150 CR): Самый тяжёлый, раскатистый взрыв (0.50 сек под волну 0.55с)
      const duration = 0.50;
      filter.frequency.setValueAtTime(1100, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + duration);
      filter.Q.value = 3.6;

      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.005);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Глубокий суб-бас 125 Гц -> 30 Гц
      subOsc.frequency.setValueAtTime(125, now);
      subOsc.frequency.exponentialRampToValueAtTime(30, now + duration);

      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.linearRampToValueAtTime(0.22, now + 0.008);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Тон подтверждения ценной стратегической цели (высокий чистый обертон 1760 Гц)
      const chime = audioCtx.createOscillator();
      const chimeGain = audioCtx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(1760, now);
      chimeGain.gain.setValueAtTime(0.0001, now);
      chimeGain.gain.linearRampToValueAtTime(0.04, now + 0.004);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      chime.connect(chimeGain);
      chimeGain.connect(audioCtx.destination);
      chime.start(now);
      chime.stop(now + 0.13);
      chime.onended = () => {
        chime.disconnect();
        chimeGain.disconnect();
      };

      noise.start(now);
      noise.stop(now + duration);
      subOsc.start(now);
      subOsc.stop(now + duration);
    } else if (targetType === 'missile') {
      // РАКЕТА (100 CR): Хлёсткий, резкий взрыв кинетического перехвата боеголовки (0.40 сек)
      const duration = 0.40;
      filter.frequency.setValueAtTime(1700, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + duration);
      filter.Q.value = 2.2;

      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.15, now + 0.004);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Чёткий упругий бас 160 Гц -> 48 Гц
      subOsc.frequency.setValueAtTime(160, now);
      subOsc.frequency.exponentialRampToValueAtTime(48, now + duration);

      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.linearRampToValueAtTime(0.18, now + 0.005);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      noise.start(now);
      noise.stop(now + duration);
      subOsc.start(now);
      subOsc.stop(now + duration);
    } else if (targetType === 'friend') {
      // СОЮЗНИК (-150 CR): Глухой взрыв + диссонирующий тревожный зуммер катастрофы (0.45 сек)
      const duration = 0.45;
      filter.frequency.setValueAtTime(850, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + duration);
      filter.Q.value = 1.8;

      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.13, now + 0.005);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      subOsc.frequency.setValueAtTime(110, now);
      subOsc.frequency.exponentialRampToValueAtTime(36, now + duration);
      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.linearRampToValueAtTime(0.14, now + 0.006);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Тревожный диссонанс тритона (Eb4 311 Гц + A4 440 Гц пилообразной формы)
      const alarm1 = audioCtx.createOscillator();
      const alarm2 = audioCtx.createOscillator();
      const alarmGain = audioCtx.createGain();
      alarm1.type = 'sawtooth';
      alarm2.type = 'sawtooth';
      alarm1.frequency.setValueAtTime(311, now);
      alarm2.frequency.setValueAtTime(440, now);

      alarmGain.gain.setValueAtTime(0.0001, now);
      alarmGain.gain.linearRampToValueAtTime(0.06, now + 0.008);
      alarmGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      alarm1.connect(alarmGain);
      alarm2.connect(alarmGain);
      alarmGain.connect(audioCtx.destination);
      alarm1.start(now);
      alarm2.start(now);
      alarm1.stop(now + 0.36);
      alarm2.stop(now + 0.36);

      alarm1.onended = () => {
        alarm1.disconnect();
        alarm2.disconnect();
        alarmGain.disconnect();
      };

      noise.start(now);
      noise.stop(now + duration);
      subOsc.start(now);
      subOsc.stop(now + duration);
    }

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    subOsc.connect(subGain);
    subGain.connect(audioCtx.destination);

    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
      subOsc.disconnect();
      subGain.disconnect();
    };
  };

  const toggleMute = (): boolean => {
    isMuted = !isMuted;
    return isMuted;
  };

  return {
    resume,
    playRadarPing,
    playExplosion,
    playDenyClick,
    toggleMute,
    get isMuted() {
      return isMuted;
    },
  };
}
