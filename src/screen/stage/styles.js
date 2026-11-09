/**
 * Kiosk side of the stage-style registry (ids, labels and the reveal timing live in src/shared/stageStyles.js).
 * A recipe (see the interface comment there):
 *   glide   { ms, ease, slam }   shared elements (number, name) between acts; `slam` = the easing used from hype level 2 up
 *   enter   { ms, stagger, delay }  an act's own lines (CSS class tt-act, [data-s] children with --i)
 *   Reveal  component | null     wraps the reveal acts (why / step / vort): props { closing, openMs, closeMs, light, children }
 * Adding a style: write its file in this folder, add it here and in src/shared/stageStyles.js. Nothing else changes.
 */
import { STAGE_REVEAL_MS, stageStyleOf } from '../../shared/stageStyles.js';
import { ScrollReveal } from './ScrollReveal.jsx';

const GLIDE = { ms: 820, ease: 'cubic-bezier(.22,.8,.24,1)', slam: 'cubic-bezier(.3,1.32,.42,1)' };
const ENTER = { ms: 560, stagger: 90, delay: 260 };

export const STAGE_RECIPES = Object.freeze({
  scroll: Object.freeze({ id: 'scroll', glide: GLIDE, enter: ENTER, Reveal: ScrollReveal, reveal: STAGE_REVEAL_MS.scroll }),
  calm: Object.freeze({ id: 'calm', glide: GLIDE, enter: ENTER, Reveal: null, reveal: STAGE_REVEAL_MS.calm }),
});

export const recipeOf = (id) => STAGE_RECIPES[stageStyleOf(id)] || STAGE_RECIPES.calm;
