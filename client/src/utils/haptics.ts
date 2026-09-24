/**
 * Lightweight safe haptic vibration helper for mobile devices.
 * Uses navigator.vibrate when available; completely silent/no-op on desktop or unsupported devices.
 */
export function triggerHaptic(type: 'tap' | 'lock' | 'correct' | 'wrong' | 'reaction' = 'tap') {
  if (typeof window === 'undefined' || !('navigator' in window) || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'tap':
        // Ultra-light 15ms tick on option click
        navigator.vibrate(15);
        break;
      case 'lock':
        // Crisp 30ms pulse on answer submission lock-in
        navigator.vibrate(30);
        break;
      case 'correct':
        // Cheerful double buzz for correct answer
        navigator.vibrate([40, 60, 45]);
        break;
      case 'wrong':
        // Single gentle low buzz for wrong answer
        navigator.vibrate([85]);
        break;
      case 'reaction':
        // Micro-tick on reaction emoji tap
        navigator.vibrate(12);
        break;
    }
  } catch {
    // Ignore restricted execution without user gesture
  }
}
