/**
 * Звуковая подсистема радара на базе Web Audio API.
 * Полностью автономна, не требует аудиофайлов и внешних библиотек.
 */
export interface SoundSystem {
  resume: () => void;
  playRadarPing: (pitch?: number) => void;
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

  const toggleMute = (): boolean => {
    isMuted = !isMuted;
    return isMuted;
  };

  return {
    resume,
    playRadarPing,
    toggleMute,
    get isMuted() {
      return isMuted;
    },
  };
}
