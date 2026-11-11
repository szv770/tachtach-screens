/**
 * Stylesheet of the Letterhead look (Letter layout). Everything is scoped under `.lhs`.
 *
 * The sheet is a PHYSICAL object (cream paper, black ink, a faint marker, a blue postmark): its colours are
 * tokens of the object, not of the screen theme, so it reads the same on every style behind it. The type still
 * comes from font ROLES (--f-lh letterhead, --f-typed typewriter, --f-th / --f-te Torah text). Layout sizes
 * scale with --k (set from the sheet's box size), so portrait and wide screens both work.
 *
 * MOTION (announcements / takeovers may animate; see GOTCHAS "Takeover animation rules"): every moving thing is
 * driven by the Web Animations API from one timeline (LetterSheet.jsx), transform / opacity / clip-path only,
 * finite (a takeover loops the whole timeline), nothing animates blur, filter or box-shadow.
 */
export const LETTERHEAD_CSS = `
.lhs { position: absolute; inset: 0; perspective: 1800px; --hk: calc(var(--k) * var(--c, 1)); --paper: #f5efdf; --paper2: #ebe2cb; --ink: #1c1913; --ink2: #5b5242; --mark: rgba(236,190,84,.36); --stamp: rgba(34,48,98,.8); }
.lhs *, .lhs *::before, .lhs *::after { box-sizing: border-box; margin: 0; padding: 0; }
.lhs .cam, .lhs .thud { position: absolute; inset: 0; transform-origin: 50% 42%; }
.lhs .sheet { position: absolute; inset: 0; display: flex; flex-direction: column; color: var(--ink); overflow: hidden; border-radius: 5px;
  padding: calc(34px * var(--k)) calc(64px * var(--k)) calc(26px * var(--k));
  background:
    linear-gradient(90deg, rgba(60,40,10,.14) 0, rgba(60,40,10,0) 3.2%),
    radial-gradient(120% 90% at 30% 12%, var(--paper) 0, var(--paper) 55%, var(--paper2) 100%);
  box-shadow: 0 34px 70px -22px rgba(0,0,0,.62), 0 3px 10px rgba(0,0,0,.28);
  will-change: transform, opacity; }
.lhs .sheet::before { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(90,70,30,.12), inset 0 0 60px rgba(110,80,30,.10); }

/* letterhead */
.lhs .head { display: flex; justify-content: space-between; align-items: flex-start; gap: calc(40px * var(--hk)); font-family: var(--f-lh); }
.lhs .hb { min-width: 0; will-change: transform, opacity; }
.lhs .hb.en { text-align: left; }
.lhs .hb.he { text-align: right; direction: rtl; }
.lhs .hb .nm { font-weight: 700; line-height: 1.12; color: var(--ink); }
.lhs .hb.en .nm { font-size: calc(23px * var(--hk)); letter-spacing: .07em; text-transform: uppercase; }
.lhs .hb.he .nm { font-size: calc(38px * var(--he-scale, 1) * var(--hk)); letter-spacing: 0; line-height: 1.05; }
.lhs .hb .ln2 { font-weight: 400; color: var(--ink); line-height: 1.38; }
.lhs .hb.en .ln2 { font-size: calc(18px * var(--hk)); letter-spacing: .03em; }
.lhs .hb.he .ln2 { font-size: calc(25px * var(--he-scale, 1) * var(--hk)); }
.lhs .hb .ln2.mv { font-weight: 700; padding-bottom: calc(4px * var(--hk)); margin-bottom: calc(2px * var(--hk)); border-bottom: calc(1.5px * var(--hk)) solid var(--ink2); display: inline-block; }
.lhs .rule { height: calc(2px * var(--hk)); margin-top: calc(12px * var(--hk)); background: var(--ink); opacity: .78; transform-origin: 0 50%; will-change: transform; }
.lhs.rtl .rule { transform-origin: 100% 50%; }

/* typed lines: one block per visual line, revealed by clip-path with a caret that walks along it */
.lhs .tf { font-family: var(--f-typed); font-weight: 400; }
.lhs.serif .tf { font-family: var(--f-th-en); }
.lhs.rtl .tf { font-family: var(--f-th-he); direction: rtl; text-align: right; }
.lhs .ty { display: block; position: relative; white-space: nowrap; }
.lhs .ty .tx { display: inline-block; will-change: clip-path; }
.lhs .ty .cr { position: absolute; top: 14%; left: 0; width: .5em; height: 72%; background: var(--ink); opacity: 0; pointer-events: none; will-change: transform, opacity; }

/* who / when */
.lhs .meta { display: flex; justify-content: space-between; align-items: flex-start; gap: calc(40px * var(--hk)); margin-top: calc(18px * var(--hk)); }
.lhs.rtl .meta { flex-direction: row-reverse; }
.lhs .meta .to, .lhs .meta .dt { font-size: calc(25px * var(--hk)); line-height: 1.34; min-width: 0; }
.lhs .meta .dt { flex: 0 0 auto; width: 40%; }
.lhs.rtl .meta .dt { text-align: right; }
.lhs .meta .dt .gr { margin-bottom: calc(2px * var(--hk)); }
.lhs .greet { margin-top: calc(20px * var(--hk)); font-size: calc(27px * var(--hk)); line-height: 1.4; }

/* the body: pages stacked, one visible at a time, lines typed */
.lhs .body { position: relative; flex: 1 1 auto; min-height: 0; margin-top: calc(14px * var(--k)); }
.lhs .band { position: absolute; left: -.4em; right: -.4em; top: 0; height: var(--lh); background: var(--mark); border-radius: 3px; opacity: 0; will-change: transform, opacity; }
.lhs .pg { position: absolute; inset: 0; font-size: var(--fs); line-height: var(--lh); }
.lhs .pg p + p { margin-top: calc(var(--lh) * .5); }
.lhs .pg .ty { height: var(--lh); }

/* closing + signature + mailing block */
.lhs .end { display: flex; justify-content: space-between; align-items: flex-end; gap: calc(30px * var(--hk)); min-height: calc(72px * var(--hk)); margin-top: calc(6px * var(--hk)); }
.lhs.rtl .end { flex-direction: row-reverse; }
.lhs .end .cl { display: flex; align-items: center; gap: calc(18px * var(--hk)); min-width: 0; font-size: calc(28px * var(--hk)); }
.lhs.rtl .end .cl { flex-direction: row-reverse; }
.lhs .end .sig { height: calc(76px * var(--hk)); width: auto; display: block; will-change: clip-path, opacity; }
.lhs .end .mb { display: flex; align-items: flex-end; gap: calc(22px * var(--hk)); }
.lhs .end .mail { font-size: calc(19px * var(--hk)); line-height: 1.38; color: var(--ink); will-change: transform, opacity; }
.lhs .end .stamp { width: calc(190px * var(--hk)); height: calc(118px * var(--hk)); will-change: transform, opacity; }
.lhs .end .stamp text { font-family: var(--f-typed); font-weight: 700; fill: var(--stamp); }
.lhs .pn { position: absolute; left: 0; right: 0; bottom: calc(6px * var(--hk)); text-align: center; font-size: calc(22px * var(--hk)); color: var(--ink2); opacity: 0; }

/* portrait page */
.lhs.port .sheet { padding: calc(40px * var(--k)) calc(46px * var(--k)) calc(30px * var(--k)); }
.lhs.port .head { gap: calc(26px * var(--hk)); }
.lhs.port .meta { flex-direction: column; gap: calc(10px * var(--hk)); }
.lhs.port.rtl .meta { flex-direction: column; }
.lhs.port .meta .dt { width: auto; }
.lhs.port .end { flex-direction: column; align-items: flex-start; }
.lhs.port.rtl .end { flex-direction: column; align-items: flex-end; }

@media (prefers-reduced-motion: reduce) { .lhs .cam, .lhs .thud, .lhs .sheet, .lhs .hb, .lhs .rule { animation: none !important; } }
`;

let injected = false;
export function ensureLetterheadCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tt-letterhead', '');
  el.textContent = LETTERHEAD_CSS;
  document.head.appendChild(el);
}
