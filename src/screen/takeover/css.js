/**
 * Takeover stylesheet (round 3b). Generated from docs/design/2026-10-14-takeovers-r3/takeovers.html
 * and then maintained here. Every selector is scoped under `.tkr`; the stage's
 * light variant is the class `.light` ON the `.stage` element.
 *
 * Roles: base roles (--bg --text --dim --muted --accent --onAccent --lift
 * --liftPct, set by DesignRoot) -> per-style STAGE roles (--s-bg --s-ink ...,
 * derived with color-mix()) -> everything paints with the stage roles. Font
 * ROLES only (--f-he-d/--f-en-d/--f-th/--f-te/--f-he/--f-en/--f-num, mapped to
 * the mockup's names on .stage), so any uploaded font works.
 *
 * MOTION: entrance (<= 1.2 s) + gentle ambient loops, takeovers only. Only
 * transform and opacity are animated; no filter / blur / backdrop-filter /
 * blend / box-shadow animation; every moving thing is its own small layer
 * (.lp); every loop is seamless; everything is off under prefers-reduced-motion
 * and `.anim-off`. See docs/claude/GOTCHAS.md "Takeover animation rules".
 */
export const TAKEOVER_CSS = `
.tkr { position: relative; color: var(--text); font-family: var(--f-en); -webkit-font-smoothing: antialiased; }
.tkr *, .tkr *::before, .tkr *::after { box-sizing: border-box; margin: 0; padding: 0; }
.tkr .he { direction: rtl; font-family: var(--f-he); font-synthesis: none; }
.tkr .num { font-family: var(--f-big); font-variant-numeric: lining-nums tabular-nums; font-feature-settings: "lnum" 1, "tnum" 1; }
.tkr .stage {
  --f-he-disp: var(--f-he-d); --f-en-disp: var(--f-en-d); --f-th-he: var(--f-th); --f-th-en: var(--f-te);
  --s-bg: var(--bg); --s-ink: var(--text); --s-dim: var(--dim);
  --s-acc: var(--accent); --s-onacc: var(--onAccent); --s-accText: var(--s-acc);
  --s-fill: var(--s-acc); --s-fillInk: var(--s-onacc);
  --s-line: color-mix(in srgb, var(--s-ink) 16%, transparent);
  --a1: var(--s-acc); --a2: var(--s-acc); --a3: var(--s-acc); --a4: var(--s-acc);
  --sheet: var(--raised);
  --f-disp-he: var(--f-he-disp); --f-disp-en: var(--f-en-disp); --f-big: var(--f-num);
  --disp-w: 700; --en-w: 600; --tile-w: 700; --qt-w: 300; --en-track: -.03em;
  /* SPACING SCALE (8 px base on the 1600x900 canvas): every gap between headline / sub line / tile / place uses these */
  --sp1: 8px; --sp2: 16px; --sp3: 24px; --sp4: 32px; --sp5: 48px; --sp6: 64px;
  position: relative; overflow: hidden; background: var(--s-bg); color: var(--s-ink);
}
.tkr .stage.light { --s-dim: color-mix(in srgb, var(--s-ink) 74%, transparent); }
.tkr .art { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.tkr .lay { position: absolute; }
.tkr .lp { position: absolute; inset: 0; }
.tkr .lay svg { display: block; width: 100%; height: 100%; overflow: visible; }
.tkr .chrome { position: absolute; z-index: 4; font-size: 28px; font-weight: 600; color: var(--s-dim); line-height: 1; }
.tkr .chrome.bh { font-family: var(--f-he); font-size: calc(30px * var(--he-scale)); font-weight: 500; direction: rtl; }
.tkr .box { position: absolute; z-index: 3; }
.tkr .box > .lyt { position: absolute; inset: 0; }
.tkr .ln { fill: none; stroke: var(--a1); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.tkr .fit { overflow: hidden; line-height: 1.14; }
.tkr .fit.wrap { white-space: normal; text-wrap: balance; }
.tkr .fit.nw { white-space: nowrap; }
.tkr .disp-he { font-family: var(--f-disp-he); font-weight: var(--disp-w); direction: rtl; font-synthesis: none; }
.tkr .disp-en { font-family: var(--f-disp-en); font-weight: var(--disp-w); letter-spacing: var(--en-track); }
.tkr .kick { font-size: 34px; font-weight: 600; color: var(--s-accText); display: flex; gap: 22px; align-items: baseline; margin-bottom: var(--sp2); white-space: nowrap; }
.tkr .kick .he { font-size: 1.06em; font-weight: 600; }
.tkr .center .kick { justify-content: center; }
.tkr .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--s-line); display: inline-block; align-self: center; flex: none; }
.tkr .w, .tkr .dg { display: inline-block; vertical-align: top; line-height: inherit; }
.tkr .bw { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.tkr .start .bw { align-items: flex-start; text-align: left; }
.tkr .bw .w-he { height: 44%; width: 100%; color: var(--s-accText); text-align: center; line-height: 1.12; }
.tkr .start .bw .w-he { text-align: left; }
.tkr .bw .w-en { height: 26%; width: 96%; font-weight: var(--en-w); letter-spacing: -.02em; margin-top: var(--sp2); line-height: 1.16; font-family: var(--f-disp-en); text-align: center; }
.tkr .start .bw .w-en { width: 100%; text-align: left; }
.tkr .bw .sub { margin-top: var(--sp3); width: 100%; max-height: 110px; font-size: 32px; color: var(--s-dim); font-weight: 500; text-align: center; line-height: 1.3; }
.tkr .start .bw .sub { text-align: left; }
.tkr .bw .sub .he { font-size: 1.06em; }
.tkr .ev { display: flex; flex-direction: column; }
.tkr .ev .titles { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
.tkr .ev .h-he { height: 54%; text-align: left; }
.tkr .ev .h-en { height: 38%; }
.tkr .center .ev .titles { align-items: center; text-align: center; }
.tkr .center .ev .h-he { text-align: center; width: 100%; }
.tkr .center .ev .h-en { width: 100%; }
.tkr .ev .foot { flex: none; display: flex; align-items: center; gap: var(--sp5); padding-top: var(--sp3); }
.tkr .center .ev .foot { justify-content: center; }
.tkr .narrow .ev .foot { flex-direction: column; align-items: flex-start; gap: var(--sp2); }
.tkr .center.narrow .ev .foot { align-items: center; }
.tkr .tile { background: var(--s-fill); color: var(--s-fillInk); border-radius: 30px; padding: 22px 40px 26px; display: flex; align-items: center; gap: 34px; flex: none; }
.tkr .tile .day { font-size: 38px; font-weight: 600; line-height: 1.15; white-space: nowrap; }
.tkr .tile .day.he { font-size: calc(32px * var(--he-scale)); font-weight: 500; color: color-mix(in srgb, currentColor 80%, transparent); }
.tkr .tile .t { font-size: var(--tile-size, 140px); font-weight: var(--tile-w); letter-spacing: -.05em; line-height: .9; white-space: nowrap; }
.tkr .tile .t small { font-size: max(20px, .28em); letter-spacing: 0; font-weight: 600; margin-left: 10px; color: color-mix(in srgb, currentColor 78%, transparent); }
.tkr .tile.only .when { display: none; }
.tkr .tile.stackt { flex-direction: column; align-items: flex-start; gap: 6px; padding: 18px 32px 22px; }
.tkr .tile.stackt .when { display: flex; gap: 16px; align-items: baseline; }
.tkr .place { min-width: 0; max-width: 100%; }
.tkr .place .en { font-size: calc(42px * var(--k, 1)); font-weight: 600; line-height: 1.15; }
.tkr .place .en2 { font-size: max(20px, calc(30px * var(--k, 1))); color: var(--s-dim); font-weight: 500; margin-top: var(--sp1); line-height: 1.2; }
.tkr .place .he { font-size: max(20px, calc(34px * var(--he-scale) * var(--k, 1))); color: var(--s-dim); font-weight: 500; text-align: left; margin-top: var(--sp1); line-height: 1.2; }
.tkr .center .place .he, .tkr .center .place { text-align: center; }
.tkr .ls { display: flex; flex-direction: column; }
.tkr .ls .hd { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp4); margin-bottom: var(--sp3); }
.tkr .ls .hd .en { flex: 1 1 56%; min-width: 0; line-height: 1.15; }
.tkr .ls .hd .he { flex: 0 1 38%; min-width: 0; line-height: 1.15; color: var(--s-accText); text-align: left; }
.tkr .ls .items { flex: 1; display: grid; grid-auto-rows: minmax(0, 1fr); min-height: 0; }
.tkr .li { display: grid; grid-template-columns: 210px 1fr auto; align-items: center; column-gap: 28px; border-top: 2px solid var(--s-line); min-height: 0; overflow: hidden; }
.tkr .li.nod { grid-template-columns: 1fr auto; }
.tkr .li .d { font-size: 32px; font-weight: 600; color: var(--s-dim); line-height: 1.15; }
.tkr .li .d.soon, .tkr .li.soon .tm { color: var(--s-accText); }
.tkr .li .x { font-size: calc(var(--lf, 42) * 1px); font-weight: 600; line-height: 1.16; letter-spacing: -.01em; min-width: 0; }
.tkr .li .x .he { display: block; font-size: max(20px, calc(var(--lf, 42) * .78px * var(--he-scale))); font-weight: 500; color: var(--s-dim); text-align: left; margin-top: 2px; }
.tkr .li .tm { font-size: calc(var(--lf, 42) * 1.28px); font-weight: 650; letter-spacing: -.035em; white-space: nowrap; }
.tkr .li .tm small { font-size: 20px; font-weight: 600; letter-spacing: 0; margin-left: 6px; color: var(--s-dim); }
.tkr .narrow .li { grid-template-columns: 150px 1fr auto; column-gap: 20px; }
.tkr .narrow .li .d { font-size: 25px; }
.tkr .qt { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.tkr .start .qt { align-items: flex-start; text-align: left; }
.tkr .qt .nm { display: flex; align-items: baseline; gap: calc(34px * var(--k, 1)); max-width: 100%; white-space: nowrap; }
.tkr .qt .nm.stack { flex-direction: column; align-items: inherit; gap: 0; white-space: nowrap; }
.tkr .nt { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.tkr .nt .pre, .tkr .nt .post { width: 94%; color: var(--s-dim); font-weight: 600; line-height: 1.2; text-align: center; }
.tkr .nt .pre .he, .tkr .nt .post .he { font-size: 1.06em; }
.tkr .nt .pre { margin-bottom: var(--sp3); }
.tkr .nt .f-he { width: 100%; height: 40%; color: var(--s-accText); line-height: 1.1; text-align: center; }
.tkr .nt .f-en { width: 100%; height: 40%; color: var(--s-accText); line-height: 1.08; text-align: center; font-family: var(--f-disp-en); font-weight: var(--disp-w); letter-spacing: var(--en-track); }
.tkr .nt.two .f-he, .tkr .nt.two .f-en { height: 26%; }
.tkr .nt .rule { width: 72px; height: 3px; border-radius: 2px; background: var(--s-accText); margin: var(--sp4) 0 var(--sp3); flex: none; }
.tkr .lyt > *, .tkr .nt > *, .tkr .qt > *, .tkr .ev > *, .tkr .bw > *, .tkr .qq > * { flex-shrink: 0; }
.tkr .ev > .titles { flex-shrink: 1; }
.tkr .qt .nm .he { font-size: calc(90px * var(--he-scale) * var(--k, 1)); line-height: 1.1; }
.tkr .qt .nm .en { font-size: calc(78px * var(--k, 1)); line-height: 1.1; }
.tkr .pw { width: 100%; height: 42%; }
.tkr .qt .big { height: 100%; width: 100%; font-weight: var(--qt-w); letter-spacing: -.06em; line-height: 1; color: var(--s-accText); text-align: inherit; }
.tkr .qt .big small { font-size: .22em; font-weight: 500; letter-spacing: 0; margin-left: .18em; color: inherit; }
.tkr .qt .big .pre { font-size: .2em; font-weight: 500; letter-spacing: 0; margin-right: .25em; color: var(--s-dim); }
.tkr .qt .was { font-size: 34px; color: var(--s-dim); font-weight: 500; margin-top: -4px; display: flex; gap: 14px; align-items: baseline; }
.tkr .qt .was s { text-decoration-thickness: 3px; color: var(--s-dim); }
.tkr .qt .where { font-size: 36px; color: var(--s-dim); font-weight: 500; margin-top: var(--sp3); max-width: 100%; line-height: 1.25; text-align: inherit; }
.tkr .qt .where .he { font-size: 1.04em; }
.tkr .times { display: flex; width: 100%; margin: var(--sp4) 0 var(--sp1); }
.tkr .port .times { flex-direction: column; gap: 14px; }
.tkr .tcol { flex: 1; min-width: 0; padding: 4px 44px 0; }
.tkr .start .tcol:first-child { padding-left: 0; }
.tkr .tcol + .tcol { border-left: 2px solid var(--s-line); }
.tkr .port .tcol { padding: 0; }
.tkr .port .tcol + .tcol { border-left: 0; border-top: 2px solid var(--s-line); padding-top: 14px; }
.tkr .tcol .lab { display: flex; flex-direction: column; gap: 4px; }
.tkr .start .tcol .lab { align-items: flex-start; }
.tkr .center .tcol .lab { align-items: center; }
.tkr .tcol .lab .he { font-size: calc(40px * var(--he-scale)); font-weight: 600; }
.tkr .tcol .lab .en { font-size: 28px; color: var(--s-dim); font-weight: 500; }
.tkr .tcol .t { font-size: var(--t2-size, 150px); font-weight: var(--qt-w); letter-spacing: -.055em; line-height: 1; margin-top: 10px; color: var(--s-accText); white-space: nowrap; }
.tkr .tcol .t small { font-size: .26em; font-weight: 500; letter-spacing: 0; margin-left: .16em; }
.tkr .qq { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.tkr .qq .q-he { width: 94%; height: 42%; font-family: var(--f-th-he); font-weight: 500; direction: rtl; text-align: center; line-height: 1.22; }
.tkr .qq .q-en { width: 86%; height: 22%; font-family: var(--f-th-en); font-style: italic; font-weight: 400; color: var(--s-dim); line-height: 1.25; margin-top: var(--sp3); text-align: center; }
.tkr .qq .rule { width: 72px; height: 3px; border-radius: 2px; background: var(--s-accText); margin: var(--sp4) 0 var(--sp3); flex: none; }
.tkr .qq .attr { font-size: 30px; color: var(--s-dim); font-weight: 500; max-width: 100%; text-align: center; }
.tkr .qq .attr .he { font-family: var(--f-th-he); font-size: 1.06em; }
.tkr .sc { display: flex; flex-direction: column; }
.tkr .port .hd > * { flex: 0 0 auto !important; }
.tkr .port .hd { flex-direction: column; align-items: stretch !important; gap: 6px !important; }
.tkr .sc .hd { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp3); padding-bottom: var(--sp3); border-bottom: 2px solid var(--s-line); }
.tkr .sc .hd .en { flex: 1 1 58%; min-width: 0; font-family: var(--f-th-en); font-weight: 600; letter-spacing: -.01em; }
.tkr .sc .hd .he { flex: 0 1 38%; min-width: 0; font-family: var(--f-th-he); font-weight: 500; color: var(--s-accText); text-align: left; }
.tkr .sc .body { flex: 1; min-height: 0; overflow: hidden; margin-top: var(--sp3); font-family: var(--f-th-en); font-size: 38px; line-height: 1.5; font-weight: 400; text-wrap: pretty; }
.tkr .sc .body p + p { margin-top: .6em; }
.tkr .ft { display: flex; align-items: center; justify-content: space-between; gap: var(--sp3); margin-top: var(--sp2); font-size: 26px; color: var(--s-dim); font-weight: 500; }
.tkr .ft > span:first-child { min-width: 0; }
.tkr .ft .pg { display: flex; align-items: center; gap: 14px; flex: none; }
.tkr .ft .pg i { width: 34px; height: 5px; border-radius: 3px; background: var(--s-line); }
.tkr .ft .pg i.on { background: var(--s-accText); }
.tkr .lt { display: flex; flex-direction: column; direction: rtl; }
.tkr .lt .top { font-family: var(--f-th-he); color: var(--s-dim); font-size: calc(28px * var(--he-scale)); line-height: 1.4; }
.tkr .lt .sal { font-family: var(--f-th-he); font-size: calc(42px * var(--he-scale)); font-weight: 700; margin: 14px 0 8px; color: var(--s-accText); }
.tkr .lt .body { flex: 1; min-height: 0; overflow: hidden; font-family: var(--f-th-he); font-size: calc(35px * var(--he-scale)); line-height: 1.6; text-align: right; text-wrap: pretty; }
.tkr .lt .close { font-family: var(--f-th-he); font-size: calc(36px * var(--he-scale)); font-weight: 700; text-align: left; margin-top: 20px; }
.tkr .lt .ft { direction: ltr; }
.tkr .st-classic .panelbg { position: absolute; inset: 28px; border-radius: 40px; z-index: 0;
  background: radial-gradient(ellipse 70% 62% at 50% 44%, color-mix(in srgb, var(--s-acc) 9%, var(--raised)), var(--raised) 72%); }
.tkr .stage.light.st-classic { --s-fill: color-mix(in srgb, var(--s-acc) 88%, #000); }
.tkr .st-grand { --s-bg: color-mix(in srgb, #000 26%, var(--bg)); --s-acc: #D6AF5C; --s-onacc: #1A1408;
  --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --f-big: var(--f-th-en); --disp-w: 600; --en-w: 600; --tile-w: 500; --en-track: -.01em; }
.tkr .stage.light.st-grand { --s-bg: color-mix(in srgb, #FFF 50%, var(--bg)); --s-acc: #87631A; --s-onacc: #FFF; }
.tkr .st-grand .tile { box-shadow: 0 0 0 2px var(--s-bg), 0 0 0 4px color-mix(in srgb, var(--s-acc) 60%, transparent); border-radius: 6px; }
.tkr .st-emergency { --s-bg: #A3170F; --s-ink: #FFFFFF; --s-dim: rgba(255,255,255,.92); --s-acc: #FFFFFF; --s-onacc: #A3170F;
  --s-line: rgba(255,255,255,.32); --a1: #FFFFFF; --a2: rgba(0,0,0,.30); --disp-w: 800; }
.tkr .stage.light.st-emergency { --s-bg: #A91F17; --s-onacc: #A91F17; --s-dim: rgba(255,255,255,.92); --a2: rgba(255,255,255,.26); }
.tkr .st-sleek { --s-acc: var(--s-ink); --s-onacc: var(--s-bg); --s-accText: var(--s-ink); --a1: color-mix(in srgb, var(--s-ink) 42%, transparent);
  --a2: color-mix(in srgb, var(--s-ink) 20%, transparent); --disp-w: 500; --tile-w: 300; --qt-w: 200; }
.tkr .st-sleek .tile { background: transparent; color: var(--s-ink); box-shadow: inset 0 0 0 2px var(--s-line); }
.tkr .st-celebration { --s-bg: color-mix(in srgb, #2A0E22 74%, var(--bg)); --s-ink: color-mix(in srgb, #FFF4E6 78%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 70%, transparent); --s-acc: #EDBE5E; --s-onacc: #2A0E22;
  --a1: #EDBE5E; --a2: #E68C9F; --a3: #6CC7B8; --a4: #F4E7CC; --disp-w: 800; }
.tkr .stage.light.st-celebration { --s-bg: color-mix(in srgb, #FFF8EC 66%, var(--bg)); --s-ink: color-mix(in srgb, #3A1026 72%, var(--text));
  --s-acc: #A8325A; --s-onacc: #FFF; --a1: #D9A23A; --a2: #C9486F; --a3: #2F9A8C; --a4: #6E8FD6; }
.tkr .st-urgent { --s-acc: #F2A33A; --s-onacc: #1E1405; --s-bg: color-mix(in srgb, #F2A33A 7%, var(--bg)); }
.tkr .stage.light.st-urgent { --s-acc: #B05C08; --s-onacc: #FFF; --s-bg: color-mix(in srgb, #F2A33A 9%, color-mix(in srgb, #FFF 40%, var(--bg))); }
.tkr .st-torah { --s-bg: color-mix(in srgb, #C9A46A 7%, var(--bg)); --sheet: color-mix(in srgb, #C9A46A 13%, var(--raised));
  --s-acc: #CFA155; --s-onacc: #1C1206; --a1: #CFA155; --a2: color-mix(in srgb, #CFA155 30%, var(--s-bg));
  --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --disp-w: 600; --en-w: 600; --en-track: -.01em; }
.tkr .stage.light.st-torah { --s-bg: color-mix(in srgb, #C9A46A 30%, var(--bg)); --sheet: color-mix(in srgb, #FBF1DA 80%, #FFF);
  --s-acc: #7A5520; --s-onacc: #FFF; --a1: #8E6A2E; --a2: color-mix(in srgb, #C9A46A 45%, #FFF); }
.tkr .st-trip { --s-acc: #5BBCD0; --s-onacc: #06181C; --s-bg: color-mix(in srgb, #5BBCD0 7%, var(--bg)); }
.tkr .stage.light.st-trip { --s-acc: #156E7E; --s-onacc: #FFF; --s-bg: color-mix(in srgb, #5BBCD0 9%, color-mix(in srgb, #FFF 40%, var(--bg))); }
.tkr .st-phone { --s-acc: #A3AEFF; --s-onacc: #0B0F2A; --s-bg: color-mix(in srgb, #7D8BFF 7%, var(--bg)); --tile-w: 600; }
.tkr .stage.light.st-phone { --s-acc: #3E4CC0; --s-onacc: #FFF; --s-bg: color-mix(in srgb, #7D8BFF 8%, color-mix(in srgb, #FFF 40%, var(--bg))); }
.tkr .st-phone .tile { background: transparent; color: var(--s-acc); box-shadow: inset 0 0 0 4px var(--s-acc); }
.tkr .st-memorial { --s-bg: color-mix(in srgb, #000 42%, var(--bg)); --s-ink: color-mix(in srgb, var(--text) 86%, var(--s-bg));
  --s-dim: color-mix(in srgb, var(--s-ink) 64%, transparent); --s-acc: var(--s-ink); --s-onacc: var(--s-bg); --s-accText: var(--s-ink);
  --a1: color-mix(in srgb, var(--s-ink) 46%, transparent); --a2: #EDB566; --a3: #FFF0CC;
  --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --f-big: var(--f-th-en); --disp-w: 500; --en-w: 500; --tile-w: 400; --qt-w: 400; --en-track: -.005em; }
.tkr .stage.light.st-memorial { --s-bg: color-mix(in srgb, var(--text) 6%, color-mix(in srgb, #FFF 30%, var(--bg))); --s-ink: var(--text);
  --a1: color-mix(in srgb, var(--s-ink) 52%, transparent); --a2: #D48A24; --a3: #FFF6DE; }
.tkr .st-memorial .tile { background: transparent; color: var(--s-ink); box-shadow: inset 0 0 0 2px var(--s-line); }
.tkr .st-hype { --s-acc: #FF6A45; --s-onacc: #1A0904; --s-bg: color-mix(in srgb, #FF5B3A 8%, var(--bg)); --disp-w: 800; --qt-w: 800; }
.tkr .stage.light.st-hype { --s-acc: #D23A1A; --s-onacc: #FFF; --s-bg: color-mix(in srgb, #FF5B3A 6%, color-mix(in srgb, #FFF 45%, var(--bg))); }
.tkr .st-shabbos { --s-bg: color-mix(in srgb, #0A1536 74%, var(--bg)); --s-ink: color-mix(in srgb, #F6EFE2 72%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #F2C46A; --s-onacc: #0A1536;
  --a1: color-mix(in srgb, var(--s-ink) 52%, transparent); --a2: #F6C35E; --a3: #FFF4D6; --a4: #F3EEE4;
  --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --disp-w: 600; --en-w: 600; --qt-w: 300; --en-track: -.01em; }
.tkr .stage.light.st-shabbos { --s-bg: color-mix(in srgb, #FCF8F0 62%, var(--bg)); --s-ink: color-mix(in srgb, #16224A 74%, var(--text));
  --s-acc: #2B4796; --s-onacc: #FFF; --a1: color-mix(in srgb, #8C6A2A 70%, transparent); --a2: #E3A02E; --a3: #FFF7E2; --a4: #FFFFFF; }
.tkr .st-yomtov { --s-bg: color-mix(in srgb, #0B2B2A 72%, var(--bg)); --s-ink: color-mix(in srgb, #F2EEDF 72%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #DDB664; --s-onacc: #0B2B2A; --a1: #DDB664; --a2: #4FB5A5;
  --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --disp-w: 700; --en-w: 600; --en-track: -.01em; }
.tkr .stage.light.st-yomtov { --s-bg: color-mix(in srgb, #F8F3E6 62%, var(--bg)); --s-ink: color-mix(in srgb, #0F2E2C 74%, var(--text));
  --s-acc: #1D6B63; --s-onacc: #FFF; --a1: #B58A33; --a2: #1D6B63; }
.tkr .st-siyum { --s-bg: color-mix(in srgb, #2B1512 66%, var(--bg)); --s-ink: color-mix(in srgb, #F5EBDC 72%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #DDB26A; --s-onacc: #2B1512;
  --a1: color-mix(in srgb, var(--s-ink) 20%, transparent); --a2: #B8404E; --a3: #DDB26A; --sheet: color-mix(in srgb, #F5EBDC 6%, var(--s-bg));
  --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --disp-w: 700; --en-w: 600; --en-track: -.01em; }
.tkr .stage.light.st-siyum { --s-bg: color-mix(in srgb, #FBF5E8 62%, var(--bg)); --s-ink: color-mix(in srgb, #2A1210 74%, var(--text));
  --s-acc: #8A2A38; --s-onacc: #FFF; --a1: color-mix(in srgb, var(--s-ink) 22%, transparent); --a2: #9E2B3B; --a3: #B88A3A; --sheet: #FFFDF8; }
.tkr .st-farbrengen { --s-bg: color-mix(in srgb, #24150D 72%, var(--bg)); --s-ink: color-mix(in srgb, #F7EADB 72%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #E39B60; --s-onacc: #24150D; --a1: #E39B60; --a2: #F2B36A; --disp-w: 700; }
.tkr .stage.light.st-farbrengen { --s-bg: color-mix(in srgb, #F8EEDF 64%, var(--bg)); --s-ink: color-mix(in srgb, #2D170B 74%, var(--text));
  --s-acc: #9A4B1C; --s-onacc: #FFF; --a1: #A0582A; --a2: #F0B060; }
.tkr .st-mivtzoim { --s-acc: #84C273; --s-onacc: #0C1A08; --s-bg: color-mix(in srgb, #84C273 6%, var(--bg)); }
.tkr .stage.light.st-mivtzoim { --s-acc: #2E7A3B; --s-onacc: #FFF; --s-bg: color-mix(in srgb, #84C273 9%, color-mix(in srgb, #FFF 40%, var(--bg))); }
.tkr .st-welcome { --s-bg: color-mix(in srgb, #1F1A13 62%, var(--bg)); --s-ink: color-mix(in srgb, #F6EEDF 72%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #D8B983; --s-onacc: #1F1A13;
  --sheet: color-mix(in srgb, #FFF 5%, var(--s-bg)); --a1: #D8B983; --a2: color-mix(in srgb, var(--s-ink) 7%, transparent);
  --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --disp-w: 700; --en-w: 600; --en-track: -.01em; }
.tkr .stage.light.st-welcome { --s-bg: color-mix(in srgb, #E9DCC4 58%, var(--bg)); --s-ink: color-mix(in srgb, #2A1E0E 74%, var(--text));
  --s-acc: #87602C; --s-onacc: #FFF; --sheet: color-mix(in srgb, #FFF 62%, var(--s-bg)); --a1: #A07A40; --a2: color-mix(in srgb, #87602C 12%, transparent); }
.tkr .st-simcha { --s-bg: color-mix(in srgb, #0F2233 72%, var(--bg)); --s-ink: color-mix(in srgb, #F5F1EA 72%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #F4A869; --s-onacc: #0F2233;
  --a1: #F4A869; --a2: #EBCB6A; --a3: #74C7B4; --a4: #E98DA2; --disp-w: 800; }
.tkr .stage.light.st-simcha { --s-bg: color-mix(in srgb, #FFF8F1 64%, var(--bg)); --s-ink: color-mix(in srgb, #1E2A3A 72%, var(--text));
  --s-acc: #B8492A; --s-onacc: #FFF; --a1: #E08A5A; --a2: #D9B347; --a3: #3FA390; --a4: #D4708A; }
.tkr .st-schedule { --s-acc: #7AA8EA; --s-onacc: #08142A; --s-bg: color-mix(in srgb, #6F9FE0 6%, var(--bg));
  --a1: color-mix(in srgb, var(--s-ink) 40%, transparent); --a2: color-mix(in srgb, var(--s-ink) 24%, transparent); }
.tkr .stage.light.st-schedule { --s-acc: #2A5AA8; --s-onacc: #FFF; --s-bg: color-mix(in srgb, #6F9FE0 8%, color-mix(in srgb, #FFF 45%, var(--bg))); }
.tkr .st-quiet { --s-bg: color-mix(in srgb, var(--text) 3%, var(--bg)); --s-ink: color-mix(in srgb, var(--text) 88%, var(--s-bg));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: var(--s-ink); --s-onacc: var(--s-bg); --s-accText: var(--s-ink); --disp-w: 500; --en-w: 500; --qt-w: 300; --tile-w: 400; }
.tkr .st-quiet .tile { background: transparent; color: var(--s-ink); box-shadow: inset 0 0 0 2px var(--s-line); }
.tkr .st-chanukah { --s-bg: color-mix(in srgb, #0D1538 76%, var(--bg)); --s-ink: color-mix(in srgb, #F3EEE2 72%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #EEC064; --s-onacc: #0D1538; --a1: #D9AE5A; --a2: #F7C65A; --a3: #FFF4D6; --a4: #F3EEE4; }
.tkr .stage.light.st-chanukah { --s-bg: color-mix(in srgb, #F8F6EF 62%, var(--bg)); --s-ink: color-mix(in srgb, #15204A 74%, var(--text));
  --s-acc: #24408E; --s-onacc: #FFF; --a1: #B4882E; --a2: #E39B25; --a3: #FFF7E2; --a4: #FFFFFF; }
.tkr .st-purim { --s-bg: color-mix(in srgb, #2B1146 74%, var(--bg)); --s-ink: color-mix(in srgb, #FBEFE0 78%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 70%, transparent); --s-acc: #F1C45A; --s-onacc: #2B1146;
  --a1: #F1C45A; --a2: #E0589C; --a3: #59C9B5; --a4: #F6E3C8; --disp-w: 800; }
.tkr .stage.light.st-purim { --s-bg: color-mix(in srgb, #FFF6E8 66%, var(--bg)); --s-ink: color-mix(in srgb, #3A1546 74%, var(--text));
  --s-acc: #8E2A74; --s-onacc: #FFF; --a1: #D9A02E; --a2: #C2408A; --a3: #2E9C8C; --a4: #6B4FB5; }
.tkr .st-pesach { --s-bg: color-mix(in srgb, #2A0F18 74%, var(--bg)); --s-ink: color-mix(in srgb, #F6EBDD 76%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #E8C068; --s-onacc: #2A0F18;
  --a1: #E8C068; --a2: #B03A50; --a3: #8FB08A; --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --disp-w: 700; --en-w: 600; --en-track: -.01em; }
.tkr .stage.light.st-pesach { --s-bg: color-mix(in srgb, #FBF5EA 66%, var(--bg)); --s-ink: color-mix(in srgb, #3A1620 76%, var(--text));
  --s-acc: #8C2438; --s-onacc: #FFF; --a1: #B08A3A; --a2: #9E2B3F; --a3: #5F8A5A; }
.tkr .st-roshchodesh { --s-bg: color-mix(in srgb, #101A30 76%, var(--bg)); --s-ink: color-mix(in srgb, #EEF1F8 78%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #D3DDF7; --s-onacc: #101A30;
  --a1: color-mix(in srgb, var(--s-ink) 48%, transparent); --a2: #E9D49A; --a3: #D3DDF7; --disp-w: 600; --en-w: 600; }
.tkr .stage.light.st-roshchodesh { --s-bg: color-mix(in srgb, #F1F2F7 66%, var(--bg)); --s-ink: color-mix(in srgb, #1A2340 76%, var(--text));
  --s-acc: #2F4A8F; --s-onacc: #FFF; --a1: color-mix(in srgb, var(--s-ink) 50%, transparent); --a2: #B8913A; --a3: #2F4A8F; }
.tkr .st-lagbaomer { --s-bg: color-mix(in srgb, #1E1710 74%, var(--bg)); --s-ink: color-mix(in srgb, #F7EBDA 76%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #F29A3E; --s-onacc: #1E1710;
  --a1: #F29A3E; --a2: #F6D36A; --a3: #E2573B; --a4: #6B4A2B; --disp-w: 800; }
.tkr .stage.light.st-lagbaomer { --s-bg: color-mix(in srgb, #FBF1E0 66%, var(--bg)); --s-ink: color-mix(in srgb, #2E1A0C 76%, var(--text));
  --s-acc: #B4511A; --s-onacc: #FFF; --a1: #E27A22; --a2: #F2B93E; --a3: #CC4A28; --a4: #7A5330; }
.tkr .st-chassidic { --s-bg: color-mix(in srgb, #2A1013 74%, var(--bg)); --s-ink: color-mix(in srgb, #F8ECDD 76%, var(--text));
  --s-dim: color-mix(in srgb, var(--s-ink) 68%, transparent); --s-acc: #E7B866; --s-onacc: #2A1013;
  --a1: #E7B866; --a2: #F7D58A; --a3: #FFF3D2; --f-disp-he: var(--f-th-he); --f-disp-en: var(--f-th-en); --disp-w: 700; --en-w: 600; --en-track: -.01em; }
.tkr .stage.light.st-chassidic { --s-bg: color-mix(in srgb, #FBF3E6 66%, var(--bg)); --s-ink: color-mix(in srgb, #2E1114 76%, var(--text));
  --s-acc: #8A2530; --s-onacc: #FFF; --a1: #B3862E; --a2: #D9A53A; --a3: #FFF1CF; }
.tkr .enter .stage-in { animation: aFade 260ms ease-out both; }
.tkr .enter .lay[data-a] { animation-name: var(--an); animation-duration: var(--dur); animation-delay: var(--d); animation-timing-function: var(--ease, cubic-bezier(.22,.7,.2,1)); animation-fill-mode: backwards; }
.tkr .enter [data-s] { animation: var(--tx-an, smIn) var(--tx-dur, 520ms) var(--tx-ease, cubic-bezier(.22,.7,.2,1)) backwards; animation-delay: calc(var(--tx-d0, 120ms) + min(var(--i, 0), 5) * var(--tx-step, 60ms)); }
.tkr .enter .tile[data-s] { --tx-an: tilePop; --tx-dur: 600ms; --tx-ease: cubic-bezier(.2,1.25,.3,1); }
.tkr .enter .kick[data-s] { --tx-an: kickIn; }
.tkr .mo-calm { --tx-an: fadeIn; --tx-dur: 720ms; --tx-step: 70ms; --tx-d0: 120ms; --tx-ease: ease-out; }
.tkr .mo-rise { --tx-an: smIn;  --tx-dur: 560ms; --tx-step: 70ms; --tx-d0: 160ms; }
.tkr .mo-lively { --tx-an: liIn;  --tx-dur: 560ms; --tx-step: 60ms; --tx-d0: 180ms; --tx-ease: cubic-bezier(.2,.9,.25,1.12); }
.tkr .mo-snap { --tx-an: snIn;  --tx-dur: 240ms; --tx-step: 0ms;  --tx-d0: 60ms;  --tx-ease: ease-out; }
.tkr .mo-drop { --tx-an: dropIn; --tx-dur: 640ms; --tx-step: 70ms; --tx-d0: 200ms; --tx-ease: cubic-bezier(.2,.9,.3,1.1); }
.tkr .mo-slide { --tx-an: slideIn; --tx-dur: 600ms; --tx-step: 70ms; --tx-d0: 160ms; }
.tkr .enter.x-lively .w { animation: wIn 520ms cubic-bezier(.2,1.1,.3,1) backwards; animation-delay: calc(260ms + min(var(--wi, 0), 8) * 45ms); }
.tkr .enter.x-lively .dg { animation: dgIn 480ms cubic-bezier(.2,1,.3,1) backwards; animation-delay: calc(380ms + min(var(--wi, 0), 6) * 55ms); }
.tkr .enter.x-lively .li[data-s] { --tx-an: slideIn; }
@keyframes fadeIn { from { opacity: 0; } }
@keyframes aFade { from { opacity: 0; } }
@keyframes smIn { from { opacity: 0; transform: translateY(16px); } }
@keyframes liIn { from { opacity: 0; transform: translateY(30px) scale(.98); } }
@keyframes snIn { from { opacity: 0; transform: scale(.985); } }
@keyframes dropIn { from { opacity: 0; transform: translateY(-26px); } }
@keyframes slideIn { from { opacity: 0; transform: translateX(-34px); } }
@keyframes kickIn { from { opacity: 0; transform: translateX(-20px); } }
@keyframes tilePop { from { opacity: 0; transform: translateY(20px) scale(.9); } }
@keyframes wIn { from { opacity: 0; transform: translateY(.28em) scale(.96); } }
@keyframes dgIn { from { opacity: 0; transform: translateY(.18em); } }
@keyframes aDrop { from { opacity: 0; transform: translateY(-80px); } }
@keyframes aDropS { from { opacity: 0; transform: translateY(-36px); } }
@keyframes aRise { from { opacity: 0; transform: translateY(40px); } }
@keyframes aGrow { from { opacity: 0; transform: scale(.94); } }
@keyframes aGrowS { from { opacity: 0; transform: scale(.985); } }
@keyframes aGrowY { from { opacity: 0; transform: scaleY(.55); } }
@keyframes aSlideL { from { opacity: 0; transform: translateX(-140px); } }
@keyframes aSlideR { from { opacity: 0; transform: translateX(140px); } }
@keyframes aOpenL { from { opacity: 0; transform: translateX(240px); } }
@keyframes aOpenR { from { opacity: 0; transform: translateX(-240px); } }
@keyframes aUnroll { from { opacity: 0; transform: scaleX(.7); } }
@keyframes aInsert { from { opacity: 0; transform: translateY(-60px); } }
@keyframes aSlash { from { opacity: 0; transform: translate(-46px, -46px); } }
@keyframes aFlame { from { opacity: 0; transform: scale(.4); } }
@keyframes aTurnM { from { transform: rotate(-180deg); } }
@keyframes aTurnH { from { transform: rotate(-15deg); } }
@keyframes aSpin { from { opacity: 0; transform: rotate(-9deg); } }
@keyframes aBand { from { opacity: 0; transform: translateY(-50px); } }
@keyframes aBandU { from { opacity: 0; transform: translateY(50px); } }
@keyframes aBalloon { from { opacity: 0; transform: translateY(60px); } }
.tkr .anim-full .lp[data-loop] { animation: var(--lk) calc(var(--ld) * var(--ts, 1) * 1s) var(--le, ease-in-out) calc(var(--ldl, 0) * 1s) infinite var(--ldir, alternate); }
@keyframes kBreathe { 0%, 100% { opacity: var(--o0, .65); } 50% { opacity: 1; } }
@keyframes kTwinkle { 0%, 100% { opacity: .22; } 50% { opacity: 1; } }
@keyframes kPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(var(--ps, 1.05)); } }
@keyframes kSway { 0%, 100% { transform: rotate(calc(var(--sa, 1.2) * -1deg)); } 50% { transform: rotate(calc(var(--sa, 1.2) * 1deg)); } }
@keyframes kBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(var(--by, -5px)); } }
@keyframes kGlide { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(var(--dx)); } }
@keyframes kFlameA { 0%, 100% { transform: scale(1, 1) rotate(0deg); } 17% { transform: scale(.96, 1.06) rotate(-1.8deg); } 38% { transform: scale(1.03, .96) rotate(1.3deg); } 61% { transform: scale(.97, 1.07) rotate(-.9deg); } 83% { transform: scale(1.02, .98) rotate(1.6deg); } }
@keyframes kFlameB { 0%, 100% { transform: scale(1, 1.02) rotate(.6deg); } 22% { transform: scale(1.03, .96) rotate(-1.4deg); } 47% { transform: scale(.96, 1.07) rotate(1.7deg); } 69% { transform: scale(1.02, 1) rotate(-1deg); } 88% { transform: scale(.98, 1.05) rotate(.8deg); } }
@keyframes kFall { from { transform: translateY(0); } to { transform: translateY(var(--fy)); } }
@keyframes kDrift { from { transform: translateX(0); } to { transform: translateX(var(--dx)); } }
@keyframes kSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes kRipple { 0% { opacity: 0; transform: scale(.6); } 14% { opacity: var(--ro, .9); } 100% { opacity: 0; transform: scale(1.16); } }
@keyframes kRing { 0% { opacity: 0; transform: scale(.7); } 20% { opacity: var(--ro, .6); } 100% { opacity: 0; transform: scale(1.5); } }
@keyframes kRise { 0% { opacity: 0; transform: translateY(0); } 12% { opacity: var(--ro, .9); } 82% { opacity: var(--ro, .9); } 100% { opacity: 0; transform: translateY(var(--ry)); } }
@keyframes kPhase { 0%, 100% { opacity: .35; } 8%, 16% { opacity: 1; } 28% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
.tkr .stage, .tkr .stage * { animation: none !important; }
 }
.tkr .anim-entrance .lp[data-loop], .tkr .anim-off .lp[data-loop] { animation: none; }
.tkr .anim-off, .tkr .anim-off * { animation: none !important; }
.tkr .anim-full .st-hype .pw { animation: kPulse 3.2s ease-in-out infinite; --ps: 1.03; transform-origin: 50% 60%; }


/* ── additions beyond the mockup: real content has missing pieces ── */
.tkr .bw.only-he .w-he { height: 70%; }
.tkr .bw.only-en .w-en { height: 62%; font-family: var(--f-disp-en); font-weight: var(--disp-w); letter-spacing: var(--en-track); }
.tkr .bw.only-en .w-en { color: var(--s-ink); }
.tkr .ev .titles.only-he .h-he { height: 88%; }
.tkr .ev .titles.only-en .h-en { height: 88%; }
.tkr .tile .day:empty { display: none; }
.tkr .tile.dayonly { padding: 22px 40px 26px; }
.tkr .tile.dayonly .day { font-size: 64px; font-weight: 700; }
.tkr .tile.dayonly .day.he { font-size: calc(56px * var(--he-scale)); }
.tkr .li .x.hx { direction: rtl; font-family: var(--f-he); font-size: calc(var(--lf, 42) * 1px * var(--he-scale)); font-weight: 600; text-align: left; }
.tkr .li .x .en2 { display: block; font-size: max(20px, calc(var(--lf, 42) * .7px)); font-weight: 500; color: var(--s-dim); margin-top: 2px; }
.tkr .sc .body.rtl, .tkr .lt.ltr .body { direction: rtl; }
.tkr .sc .body.rtl { font-family: var(--f-th-he); font-size: calc(38px * var(--he-scale)); line-height: 1.55; text-align: right; }
.tkr .lt.ltr { direction: ltr; }
.tkr .lt.ltr .top, .tkr .lt.ltr .sal, .tkr .lt.ltr .body, .tkr .lt.ltr .close { font-family: var(--f-th-en); direction: ltr; text-align: left; }
.tkr .lt.ltr .top { font-size: 28px; } .tkr .lt.ltr .sal { font-size: 42px; } .tkr .lt.ltr .body { font-size: 35px; line-height: 1.5; } .tkr .lt.ltr .close { font-size: 36px; text-align: right; }
.tkr .qq .q-he:empty, .tkr .qq .q-en:empty { display: none; }
.tkr .qq .attr:empty, .tkr .qq .rule.off { display: none; }
.tkr .kick:empty { display: none; }
/* Static states (Animation = Entrance only / Off, and prefers-reduced-motion): loops that are only meaningful in motion
   (ripples, rings) stay hidden; rising pieces (balloons, sparks) rest half way up; everything else rests at its design pose. */
.tkr .anim-off .lp[data-loop="kRipple"], .tkr .anim-off .lp[data-loop="kRing"],
.tkr .anim-entrance .lp[data-loop="kRipple"], .tkr .anim-entrance .lp[data-loop="kRing"] { opacity: 0; }
.tkr .anim-off .lp[data-loop="kRise"], .tkr .anim-entrance .lp[data-loop="kRise"] { transform: translateY(calc(var(--ry) * .5)); opacity: var(--ro, .9); }
@media (prefers-reduced-motion: reduce) {
  .tkr .stage .lp[data-loop="kRipple"], .tkr .stage .lp[data-loop="kRing"] { opacity: 0; }
  .tkr .stage .lp[data-loop="kRise"] { transform: translateY(calc(var(--ry) * .5)); opacity: var(--ro, .9); }
}

/* ── type round (2026-10-15): bidi, bilingual alignment, wrapping ──
   BIDI: every text run carries dir="rtl|ltr" from its content (layouts.js + src/shared/bidi.js) and isolates,
   so a Hebrew line's trailing "!" / "?" sits at its LEFT end inside the LTR stage. */
.tkr .box [dir] { unicode-bidi: isolate; }
.tkr .box [dir="rtl"] { direction: rtl; }
.tkr .box [dir="ltr"] { direction: ltr; }
.tkr .li .x .xl { display: block; }
/* Lining figures everywhere in the stage (Playfair Display / Fraunces default to old-style); a Latin/time run inside a
   Hebrew display line ("יום ה׳, 2:00 PM") takes the English display face: Hebrew display fonts (Suez One) draw old-style digits. */
.tkr .box { font-variant-numeric: lining-nums; }
.tkr .box .disp-he [dir="ltr"] { font-family: var(--f-disp-en); }
/* big words with a kicker above: give the kicker's row back from the two title budgets (stack stays inside the box) */
.tkr .bw:not(.only-he):not(.only-en) .kick ~ .w-he { height: 40%; }
.tkr .bw:not(.only-he):not(.only-en) .kick ~ .w-en { height: 23%; }
/* ALIGNMENT RULE (README "Bilingual alignment"): start-aligned layouts put Hebrew AND English on the same start
   (left) edge, whatever their direction; centred layouts centre both on one axis. Header rows (list / sicha) are the
   one two-column exception: English flush start, Hebrew flush end; stacked in portrait both go to the start edge. */
.tkr .start .box :is(.bw, .ev, .qt, .ls) [dir] { text-align: left; }
.tkr .center .box :is(.bw, .ev, .qt, .qq) [dir] { text-align: center; }
.tkr .box .lyt .hd > .he[dir] { text-align: right; }
.tkr .port .box .lyt .hd > .he[dir] { text-align: left; }
/* WRAPPING: headlines balance (fit.js also steps down a little to avoid a lone last word); smaller lines wrap "pretty". */
.tkr .place > *, .tkr .li .x > *, .tkr .li .x.hx, .tkr .tcol .lab > * { text-wrap: pretty; }
`;

let injected = false;
/** Inject once per document (kiosk and the admin's preview share it). */
export function ensureTakeoverCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-tt-takeover', '');
  el.textContent = TAKEOVER_CSS;
  document.head.appendChild(el);
}
