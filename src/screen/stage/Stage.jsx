import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBox } from '../components/slides/occasionParts.jsx';

/**
 * The Countdown STAGE: one frame that stays mounted for the whole slide, so its acts (hero, the day, why, story, coming
 * up) are moments of one scene instead of separate pages.
 *
 *   ┌ rail (the persistent anchor) ───────────────────────────────────────────┐
 *   │ hero: today's date ............................................ pager  │
 *   │ other acts: [the name] ................ today · [27] DAYS  pager       │
 *   │ ───────────●──────────── one hairline: the lead-up marker / ticks      │
 *   └──────────────────────────────────────────────────────────────────────────┘
 *     act area: the current act (keyed: its lines rise in once), or the style's Reveal around it
 *     shared layers: the NUMBER and the NAME are single elements, absolutely placed at their hero size; each act only
 *     says where they go (a [data-slot] box) and the Stage moves them there with ONE transform (translate + scale),
 *     transition = the style's glide. Minimal motion / reduced motion: they jump.
 * Measured in layout px (offsetLeft/Top), so ScreenScaler's transform never skews it.
 *
 * Props: plan(areaW, areaH) -> { num: { w, h, node } | null, name: { w, h, box, node(compact) } | null } (the shared
 * elements at hero size); renderAct(geo) -> the act content; rail: { left, right(compact), progress, compact }; act
 * { id, secs, reveal }; actKey; recipe (styles.js); motion; light; portrait; hype { level, intensity }; countAttrs (data
 * attributes for the act area while counting); flashKey (changes = the rail flashes its accent once).
 */
export const RAIL_NUM_H = 40;
export const RAIL_NAME_H = 50;

function offsetIn(el, root) {
  let x = 0; let y = 0; let e = el;
  while (e && e !== root) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
  return e === root ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
}

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function Stage({ plan, renderAct, rail, act, actKey, recipe, motion, light, portrait, hype, countAttrs, flashKey, settle }) {
  const rootRef = useRef(null);
  const [areaRef, areaW, areaH] = useBox(portrait ? 716 : 952, portrait ? 1100 : 680);
  const geo = plan(areaW, areaH);
  const hero = act.id === 'main';
  const [tf, setTf] = useState({ num: null, name: null });
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const still = motion === 'minimal' || reduced();

  // where the shared elements go in this act: its own slot (hero) or the rail
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const at = (q) => { const el = root.querySelector(q); return el ? offsetIn(el, root) : null; };
    const place = (item, own, inRail, prev) => {
      if (!item) return null;
      const r = own || inRail;
      if (!r || !item.h) return { t: prev?.t || 'translate3d(0,0,0) scale(1)', o: 0 };
      const s = r.h / item.h;
      return { t: `translate3d(${Math.round(r.x)}px, ${Math.round(r.y)}px, 0) scale(${s.toFixed(4)})`, o: 1, rail: !own };
    };
    const num = place(geo.num, at('[data-slot=num]'), hero ? null : at('[data-slot=railnum]'), tf.num);
    const name = place(geo.name, at('[data-slot=name]'), hero || geo.name?.long ? null : at('[data-slot=railname]'), tf.name);
    const sig = JSON.stringify({ num, name });
    if (sig !== JSON.stringify(tf)) setTf({ num, name });
    if (!ready) requestAnimationFrame(() => setReady(true));
  });

  // every act leaves the same way: its lines fade up and out just before the next act; the LAST reveal act instead rolls
  // the reveal (the paper scroll) back up, which stays open across the reveal acts before it
  const revealOn = !!(act.reveal && recipe.Reveal);
  useEffect(() => {
    setClosing(false); setLeaving(false);
    if (still || !act.turns) return undefined;
    const ms = act.secs * 1000;
    const t = revealOn && act.closes
      ? setTimeout(() => setClosing(true), Math.max(1000, ms - recipe.reveal.close - 120))
      : setTimeout(() => setLeaving(true), Math.max(1000, ms - 320));
    return () => clearTimeout(t);
  }, [actKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ease = hype.level >= 2 ? recipe.glide.slam : recipe.glide.ease;
  const trans = ready && !still ? `transform ${recipe.glide.ms}ms ${ease}, opacity 420ms ease-out` : 'none';
  // a shared element with no place in this act (a long name outside the hero) fades out and is then really hidden, so it
  // can never sit (invisible) over the rail's text
  const layer = (t, w, h, extra) => {
    const on = !!(t && t.o);
    return { position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '0 0', transform: t?.t || 'translate3d(0,0,0)', opacity: on ? 1 : 0, visibility: on ? 'visible' : 'hidden',
      transition: trans === 'none' ? 'none' : `${trans}, visibility 0s linear ${on ? 0 : 420}ms`, willChange: 'transform', zIndex: 2, pointerEvents: 'none', ...extra };
  };
  const content = renderAct({ ...geo, areaW, areaH, closing });
  const Reveal = revealOn ? recipe.Reveal : null;
  const railName = geo.name && !geo.name.long ? { w: Math.round(geo.name.w * (RAIL_NAME_H / geo.name.box)), h: Math.round(geo.name.h * (RAIL_NAME_H / geo.name.box)) } : null;
  const railNum = geo.num ? { w: Math.round(geo.num.w * (RAIL_NUM_H / geo.num.h)), h: RAIL_NUM_H } : null;
  const actEl = (
    <div key={actKey} className={`tt-act${leaving ? ' tt-act-out' : ''}${settle && hero ? ' tt-hype-settle' : ''}`} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...(settle && hero ? { '--settle': `${settle}px` } : null) }}>
      {content}
    </div>
  );
  return (
    <div ref={rootRef} data-occ-stage={act.id} style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Rail rail={rail} hero={hero} railName={railName} railNum={railNum} still={still} flashKey={flashKey} />
      <div ref={areaRef} data-occ-col="" {...(countAttrs || {})} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: portrait ? 36 : 24 }}>
        {/* the reveal stays mounted from the first reveal act to the last: only the act on it changes */}
        {Reveal ? <Reveal key="reveal" closing={closing} openMs={recipe.reveal.open} closeMs={recipe.reveal.close} light={light} portrait={portrait}>{actEl}</Reveal> : actEl}
        {geo.num && <div data-occ-numlayer="" style={layer(tf.num, geo.num.w, geo.num.h)}>{geo.num.node}</div>}
        {geo.name && <div data-occ-namelayer={tf.name?.rail ? 'rail' : 'hero'} style={layer(tf.name, geo.name.w, geo.name.h)}>{geo.name.node(!!tf.name?.rail, trans)}</div>}
      </div>
    </div>
  );
}

/** The persistent anchor: one row of quiet text and one hairline that carries the progress. */
function Rail({ rail, hero, railName, railNum, still, flashKey }) {
  const fade = (on) => ({ opacity: on ? 1 : 0, transition: still ? 'none' : 'opacity 420ms ease-out', visibility: on ? 'visible' : 'hidden' });
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  return (
    <header data-occ-block="rail" style={{ position: 'relative', flex: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, minHeight: RAIL_NAME_H }}>
        <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'flex-end', minHeight: RAIL_NAME_H }}>
          <div style={{ ...fade(hero || !railName), minWidth: 0 }}>{rail.left}</div>
          {railName && <div data-slot="railname" style={{ position: 'absolute', left: 0, top: 0, width: railName.w, maxWidth: '100%', height: railName.h, pointerEvents: 'none' }} />}
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 18 }}>
          <div style={{ ...fade(!hero), display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            {!hero && rail.right}
            {railNum && <div data-slot="railnum" style={{ width: railNum.w, height: railNum.h, flex: 'none' }} />}
            {!hero && rail.compact}
          </div>
          {rail.pager}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        {rail.progress || <div aria-hidden style={{ height: 2, background: 'var(--line)' }} />}
        {flashKey > 0 && <div key={flashKey} aria-hidden className="tt-rail-flash" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'var(--accentText)' }} />}
      </div>
    </header>
  );
}
