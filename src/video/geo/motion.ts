import {spring} from 'remotion';

// Entrances (#87): map labels, markers and highlights arrive with a closed-form
// spring that overshoots by about 5% and settles in 11 frames, so each reveal
// lands with a small bounce instead of a linear fade. The spring depends only
// on the frame, so renders stay deterministic.

/** Damping, stiffness and mass for a ~5% overshoot that settles within 11 frames at 30 fps. */
export const POP = {damping: 15, stiffness: 200, mass: .6};

/** Spring progress for an entrance starting at `startFrame`: 0 before it, about 1.05 at the peak, then 1. */
export const pop = (frame: number, startFrame: number, fps: number) => spring({frame: frame - startFrame, fps, config: POP});

/** Labels grow from this share of their size, so the overshoot reads as a small bounce, not a zoom. */
export const LABEL_FROM = .6;

/** A label's scale for spring progress `progress`: LABEL_FROM before it starts, 1 once settled. */
export const labelScale = (progress: number) => LABEL_FROM + (1 - LABEL_FROM) * progress;
