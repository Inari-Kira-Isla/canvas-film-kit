// bad fixture — only 2 of 9 beats have a matching visual event (22% < 70% threshold). Must WARN.
export const DURATION = 5;
export const BEATS: number[] = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5];
export const VISUAL_EVENTS: number[] = [0.5, 1.0]; // the film never reacts to beats 3-9
