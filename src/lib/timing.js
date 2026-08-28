/**
 * The mix animation timeline, in one place.
 *
 * These numbers mirror the --dur-* custom properties in global.css.
 * JS drives the phase changes, CSS drives the motion inside each
 * phase, so both need to agree on how long a phase lasts.
 */
export const TIMELINE = {
  shuffle: 1000, // quick riffle shuffle: "mixing"
  reveal: 2900, // face-up card carousel that decelerates and lands: "choosing"
  hold: 360, // landed-but-static beat before handing off to Result
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
