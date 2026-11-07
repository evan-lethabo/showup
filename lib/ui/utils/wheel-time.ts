const DAY = 1440;

/** Convert SHOWUP's linear minute value to the picker's time-of-day value. */
export function wheelMinute(minutes: number): number {
  return ((minutes % DAY) + DAY) % DAY;
}

/**
 * Lift an Until value from the picker onto SHOWUP's linear minute axis.
 * Midnight and later times become values above 1440 when they follow From.
 */
export function untilFromWheel(minutes: number, from: number): number {
  let result = Math.floor(from / DAY) * DAY + wheelMinute(minutes);
  if (result <= from) result += DAY;
  return result;
}

/**
 * Lift a time-of-day value into an organiser window, including a window that
 * crosses midnight (for example 1020–1500 for 5pm–1am).
 */
export function minuteInWindow(minutes: number, window: { s: number; e: number }): number {
  let result = wheelMinute(minutes);
  while (result < window.s) result += DAY;
  while (result > window.e && result - DAY >= window.s) result -= DAY;
  return Math.max(window.s, Math.min(window.e, result));
}
