/**
 * The mix animation timeline, in one place.
 *
 * These numbers mirror the --dur-* custom properties in global.css.
 * JS drives the phase changes, CSS drives the motion inside each
 * phase, so both need to agree on how long a phase lasts.
 */
export const TIMELINE = {
  shuffle: 1000, // quick riffle shuffle: "mixing"
  // TEMP: slowed 2900 -> 7000 for on-device diagnosis of the mobile
  // backface-visibility flash - revert once confirmed fixed.
  reveal: 7000, // face-up card carousel that decelerates and lands: "choosing"
}

export const TOTAL_MS = TIMELINE.shuffle + TIMELINE.reveal

/**
 * True when the user has asked their OS to cut down on animation.
 * We keep the reveal but drop the theatre.
 */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
