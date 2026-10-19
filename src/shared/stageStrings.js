/**
 * Every fixed word the "attention stages" put on the kiosk, in ONE table so the owner or a native
 * speaker can reword them here (and nowhere else). English is primary; the Hebrew is an extra that
 * only appears when the block has a Hebrew name. `{name}` is replaced by the block's name.
 *
 * Hebrew choices (all gender-neutral: none of them has to agree with the gender of the thing named):
 *   just started   "כעת: {name}"       "Now: X". Short and formal enough for signage. (Was "עכשיו: X".)
 *   in session     "בעיצומו של" + name a construct ("in the midst of ...") above the Hebrew name, so it
 *                                      reads "בעיצומו של / סדר ב'". No verb, so no gender.
 * Alternatives considered: "עכשיו: X" (colloquial), "X - בעיצומו" (masculine, clashes with feminine
 * names like ארוחה), "התחיל: X" / "מתחיל: X" (verbs, gendered), "התחלנו: X" ("we started": neutral but chatty).
 */
export const STAGE_STRINGS = {
  started: { en: '{name} just started', he: 'כעת: {name}' },
  session: { en: 'Now in session', he: 'בעיצומו של' },
  sessionEnds: { en: 'ends', until: 'until' },
};

const fill = (tpl, name) => String(tpl).replace('{name}', name);

/** The "just started" banner lines for a started block ({ name, nameHe }): '' when that language has no name. */
export function startedLines(started) {
  return {
    en: started?.name ? fill(STAGE_STRINGS.started.en, started.name) : '',
    he: started?.nameHe ? fill(STAGE_STRINGS.started.he, started.nameHe) : '',
  };
}

/** The in-session badge kicker: English always, the Hebrew construct only when the block has a Hebrew name. */
export function sessionKicker(item) {
  return { en: STAGE_STRINGS.session.en, he: item?.nameHe ? STAGE_STRINGS.session.he : '' };
}
