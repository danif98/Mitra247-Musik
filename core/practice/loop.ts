/** Loop A-B rules (pure, unit-tested). Times are seconds in media time. */

export const MIN_LOOP_SEC = 0.5;

export interface LoopRange {
  a: number | null;
  b: number | null;
}

export const NO_LOOP: LoopRange = { a: null, b: null };

/** True when both points are set and form a usable range. */
export function isActive(loop: LoopRange): loop is { a: number; b: number } {
  return loop.a !== null && loop.b !== null && loop.b - loop.a >= MIN_LOOP_SEC;
}

/** Set point A at `position`. A later B that would sit before the new A is dropped. */
export function setA(loop: LoopRange, position: number): LoopRange {
  const a = Math.max(0, position);
  return { a, b: loop.b !== null && loop.b - a >= MIN_LOOP_SEC ? loop.b : null };
}

/**
 * Set point B at `position`. Without A the loop starts at 0:00. A B too close to A is ignored
 * (the loop stays as it was).
 */
export function setB(loop: LoopRange, position: number): LoopRange {
  const a = loop.a ?? 0;
  if (position - a < MIN_LOOP_SEC) return loop;
  return { a, b: position };
}

/**
 * Where to jump when playback has reached the end of the loop, or null to keep playing.
 * `lead` compensates for the polling interval (jump slightly before B).
 */
export function loopJumpTarget(loop: LoopRange, position: number, lead = 0.03): number | null {
  if (!isActive(loop)) return null;
  // Only while playback is at B. A position well past B (the user seeked out of the loop on
  // purpose) is left alone so the loop never traps the user.
  if (position >= loop.b - lead && position <= loop.b + 0.5) return loop.a;
  return null;
}

/** A position before A or after B is outside the loop. Used to decide whether to keep looping. */
export function insideLoop(loop: LoopRange, position: number): boolean {
  return isActive(loop) && position >= loop.a - 0.05 && position <= loop.b + 0.25;
}
