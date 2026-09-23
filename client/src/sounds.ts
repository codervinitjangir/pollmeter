/**
 * Projector sound effects, synthesised in the browser with the Web Audio API.
 *
 * Deliberately no audio files. A missing or slow mp3 is a silent failure in
 * front of a room, and sourcing licensed fanfare samples is a bigger job than
 * the sound is worth. Every cue here is a handful of oscillators and an
 * envelope: nothing to fetch, nothing to 404, nothing to license.
 *
 * Host page only. A hundred phones chiming slightly out of sync would be noise
 * rather than atmosphere, so students stay silent.
 *
 * Nothing in this module may throw. Audio is decoration — if a browser refuses
 * to co-operate the quiz carries on in silence and nobody in the room notices.
 */

const LS_KEY = 'pollsync_muted';

export type SoundCue = 'start' | 'tick' | 'reveal' | 'leaderboard' | 'podium';

const AudioCtor =
  typeof window === 'undefined'
    ? undefined
    : window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Returns the new state so the caller can drive a toggle without re-reading. */
export function toggleMuted(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(LS_KEY, muted ? '1' : '0');
  } catch {
    /* private mode — the toggle still works for this session */
  }
  if (muted && master && ctx) {
    // Cut anything mid-flight, otherwise a fanfare keeps playing after the mute.
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* ignore */
    }
  }
  return muted;
}

/**
 * Browsers refuse to start audio until the user has interacted with the page.
 * The host clicks "Start" before any cue is needed, so calling this from the
 * presenter controls is enough to unlock everything that follows.
 */
export function unlockAudio(): void {
  try {
    if (!AudioCtor) return;
    if (!ctx) {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    master = null;
  }
}

/** One oscillator with an attack/decay envelope, optionally sweeping in pitch. */
function tone(
  at: number,
  freq: number,
  duration: number,
  opts: {
    type?: OscillatorType;
    gain?: number;
    sweepTo?: number;
    attack?: number;
  } = {}
): void {
  if (!ctx || !master) return;

  const { type = 'sine', gain = 0.2, sweepTo, attack = 0.008 } = opts;

  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (sweepTo != null) osc.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);

  // Exponential ramps cannot reach zero, hence the tiny floor.
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

export function playCue(cue: SoundCue): void {
  try {
    if (muted) return;
    unlockAudio();
    if (!ctx || !master || ctx.state !== 'running') return;

    // Restore the master level in case a previous mute zeroed it.
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0.9, ctx.currentTime);

    const t = ctx.currentTime + 0.01;

    switch (cue) {
      // Question opens: a short rising blip. "Go."
      case 'start':
        tone(t, 440, 0.16, { type: 'triangle', gain: 0.18, sweepTo: 880 });
        break;

      // Final seconds. Dry and quiet — this fires repeatedly, so it must not
      // become the loudest thing in the room.
      case 'tick':
        tone(t, 1200, 0.05, { type: 'square', gain: 0.07 });
        break;

      // Answers locked, results on screen: a two-note ding.
      case 'reveal':
        tone(t, 1046.5, 0.14, { type: 'sine', gain: 0.22 }); // C6
        tone(t + 0.1, 1318.5, 0.3, { type: 'sine', gain: 0.22 }); // E6
        break;

      // Standings racing into place: an upward sweep under the animation.
      case 'leaderboard':
        tone(t, 260, 0.55, { type: 'sine', gain: 0.16, sweepTo: 940 });
        tone(t + 0.42, 1318.5, 0.28, { type: 'triangle', gain: 0.18 });
        break;

      // Podium. Sawtooth triad arpeggio, held on the last note — as close to a
      // trumpet as three lines of oscillator gets.
      case 'podium': {
        const fanfare: Array<[number, number, number]> = [
          [392.0, 0.0, 0.16], // G4
          [523.25, 0.14, 0.16], // C5
          [659.25, 0.28, 0.16], // E5
          [783.99, 0.42, 0.9], // G5, held
        ];
        for (const [freq, offset, dur] of fanfare) {
          tone(t + offset, freq, dur, { type: 'sawtooth', gain: 0.16 });
          tone(t + offset, freq * 2, dur, { type: 'sine', gain: 0.07 }); // octave shimmer
        }
        // Root underneath the held note, for weight on projector speakers.
        tone(t + 0.42, 261.63, 0.9, { type: 'triangle', gain: 0.12 }); // C4
        break;
      }
    }
  } catch {
    /* audio is decoration — never let it break the presenter view */
  }
}
