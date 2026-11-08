/**
 * The Countdown page's STAGE STYLES: one list shared by the data side (src/shared/occasions.js accepts any id here,
 * unknown -> DEFAULT_STAGE_STYLE), the admin (the 'How the explanation appears' select lists it) and the kiosk
 * (src/screen/stage/styles.js maps each id to its renderer recipe). Pure data, no React.
 *
 * Adding a style = one entry here + one file in src/screen/stage/ registered in src/screen/stage/styles.js. Nothing else
 * changes (Stage, acts, data model, admin all read the registry). A style's kiosk recipe must implement
 * (see src/screen/stage/styles.js for the exact shape):
 *   glide       { ms, ease }            how the shared elements (number, name) move between acts (transform only)
 *   enter       { ms, stagger, ease }   how an act's own lines come in (opacity + translate, finite)
 *   Reveal      React component | null  wraps the explanation acts ('why', 'story', 'step'): gets { phase, children, ... }
 *                                       and draws the reveal (the flagship: a plain paper scroll); null = plain act
 *   revealMs    { open, close }         extra time the reveal needs (added to the act's seconds by actsFor())
 */
export const STAGE_STYLE_LIST = Object.freeze([
  Object.freeze({ id: 'scroll', label: 'Scroll', description: 'A plain paper scroll unrolls from the top for the why and the story.' }),
  Object.freeze({ id: 'calm', label: 'Calm', description: 'The text simply glides in; the quietest choice.' }),
]);
export const STAGE_STYLES = Object.freeze(STAGE_STYLE_LIST.map((s) => s.id));
export const DEFAULT_STAGE_STYLE = 'scroll';
/** Extra seconds a style's reveal adds to an explanation act (open + close), so the rotation is asked for enough time. */
export const STAGE_REVEAL_MS = Object.freeze({ scroll: Object.freeze({ open: 1600, close: 1000 }), calm: Object.freeze({ open: 0, close: 0 }) });
export const stageStyleOf = (id) => (STAGE_STYLES.includes(id) ? id : DEFAULT_STAGE_STYLE);
