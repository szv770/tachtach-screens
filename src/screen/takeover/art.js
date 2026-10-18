/**
 * Static SVG graphics of the 26 takeover styles (one function per style in ART,
 * returning layers). Ported 1:1 from docs/design/2026-10-14-takeovers-r3/takeovers.html.
 * A "layer" is a bbox-sized div holding SVG in stage coordinates; entrance (a) and
 * ambient loop (lp) animations are data attributes + CSS vars, styled by css.js.
 * Only transform/opacity are ever animated (GOTCHAS: takeover animation rules).
 */
let W = 1600, H = 900, PORT = false;
let MAP = { s: 1, ox: 0, oy: 0 };
const ID = { s: 1, ox: 0, oy: 0 };
let SIDE = ID, ARTRECTS = [], UID = 0;   // UID never resets: gradient ids stay unique across stages on one page
let KBUS = 0;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const f1 = n => (+n).toFixed(1);
const side = fn => { const p = MAP; MAP = SIDE; const r = fn(); MAP = p; return r; };
/* a layer = a bbox-sized div holding SVG in stage coordinates.
   a  = entrance {an,dur,d,ease,o}       lp = ambient loop {k,d,dl,e,dir,o,vars:{fy:px,...}}   (px vars scale with MAP) */
function layer(x, y, w, h, inner, a = null, lp = null) {
  const m = MAP, X = m.ox + x * m.s, Y = m.oy + y * m.s, Wd = w * m.s, Ht = h * m.s;
  const ea = a ? ` data-a style="left:${f1(X)}px;top:${f1(Y)}px;width:${f1(Wd)}px;height:${f1(Ht)}px;--an:${a.an};--dur:${a.dur || 700}ms;--d:${a.d || 0}ms;${a.ease ? `--ease:${a.ease};` : ''}transform-origin:${a.o || '50% 50%'}"`
               : ` style="left:${f1(X)}px;top:${f1(Y)}px;width:${f1(Wd)}px;height:${f1(Ht)}px"`;
  let la = '';
  if (lp) { const v = Object.entries(lp.vars || {}).map(([k, val]) => `--${k}:${typeof val === 'number' ? f1(val * m.s) + 'px' : val}`).join(';');
    la = ` data-loop="${lp.k}" style="--lk:${lp.k};--ld:${lp.d};--ldl:${lp.dl || 0};--le:${lp.e || 'ease-in-out'};--ldir:${lp.dir || 'alternate'};transform-origin:${lp.o || '50% 50%'};${v}"`; }
  return `<div class="lay ${(a && a.cls) || ''}"${ea}><div class="lp"${la}><svg viewBox="${x} ${y} ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg></div></div>`;
}
const flame = (cx, by, h, outer = 'var(--a2)', inner = 'var(--a3)') => {
  const w = h * .42;
  return `<path d="M${cx} ${by - h} C${cx + w * .55} ${by - h * .62} ${cx + w * .62} ${by - h * .25} ${cx + w * .4} ${by - h * .08} C${cx + w * .25} ${by + h * .04} ${cx - w * .25} ${by + h * .04} ${cx - w * .4} ${by - h * .08} C${cx - w * .62} ${by - h * .25} ${cx - w * .55} ${by - h * .62} ${cx} ${by - h}Z" style="fill:${outer}"/>
    <path d="M${cx} ${by - h * .55} C${cx + w * .26} ${by - h * .36} ${cx + w * .28} ${by - h * .14} ${cx + w * .14} ${by - h * .05} C${cx + w * .06} ${by} ${cx - w * .06} ${by} ${cx - w * .14} ${by - h * .05} C${cx - w * .28} ${by - h * .14} ${cx - w * .26} ${by - h * .36} ${cx} ${by - h * .55}Z" style="fill:${inner}"/>`;
};
const glow = (cx, cy, r, col, a) => { const id = 'g' + (++UID); return `<defs><radialGradient id="${id}"><stop offset="0" style="stop-color:${col};stop-opacity:${a}"/><stop offset=".45" style="stop-color:${col};stop-opacity:${a * .38}"/><stop offset="1" style="stop-color:${col};stop-opacity:0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`; };
const star4 = (x, y, r, st) => { const i = r * .26; return `<path d="M${f1(x)} ${f1(y - r)} L${f1(x + i)} ${f1(y - i)} L${f1(x + r)} ${f1(y)} L${f1(x + i)} ${f1(y + i)} L${f1(x)} ${f1(y + r)} L${f1(x - i)} ${f1(y + i)} L${f1(x - r)} ${f1(y)} L${f1(x - i)} ${f1(y - i)}Z" style="${st}"/>`; };

/* confetti-like scatter: static top garland + two falling strips on each side (period = H, seamless) */
function rain(G, seed, make, { nTop = 30, nCol = 12, cols = 4 }) {
  const R = rng(seed), [bl, bt, br, bb] = G.box, pad = 30; let out = '';
  const top = [];
  for (let i = 0, t = 0; i < nTop && t < 4000; t++) {
    const x = R() * W, y = R() * H * .24;
    if (x > bl - pad && x < br + pad && y > bt - pad) continue;
    if (y < 96 && (x < 330 || x > W - 330)) continue;
    top.push(make(R, x, y, cols)); i++;
  }
  out += layer(0, 0, W, H * .26, top.join(''), { an: 'aDrop', dur: 760, d: 0, ease: 'cubic-bezier(.2,.8,.3,1)' });
  /* strips: left [0, bl-pad], right [br+pad, W]; two speeds each. Pieces are duplicated one period below so the loop has no seam. */
  const strips = [[0, Math.max(60, bl - pad)], [Math.min(W - 60, br + pad), W]];
  strips.forEach(([x0, x1], si) => [0, 1].forEach(k => {
    const pcs = []; const RR = rng(seed + si * 31 + k * 7);
    for (let i = 0; i < nCol; i++) { const x = x0 + 14 + RR() * (x1 - x0 - 28), y = RR() * H; if (y < 96 && (x < 330 || x > W - 330)) { i--; continue; } pcs.push([x, y, RR]); }
    const mk = (dy) => pcs.map(([x, y, r2]) => make(rng(Math.round(x * 7 + y)), x, y + dy, cols)).join('');
    out += layer(x0, -H, x1 - x0, 2 * H, mk(0) + mk(-H), { an: 'aFade', dur: 700, d: 160 + k * 100 },
      { k: 'kFall', d: k ? 46 : 70, e: 'linear', dir: 'normal', dl: -(si * 11 + k * 23), vars: { fy: H } });
  }));
  return out;
}
const pieceConfetti = (R, x, y, cols) => {
  const c = `var(--a${1 + Math.floor(R() * cols)})`, rot = Math.round(R() * 180), k = R(), op = (.5 + R() * .45).toFixed(2);
  if (k < .42) { const w = 16 + R() * 16, h = 7 + R() * 4; return `<rect x="${f1(x - w / 2)}" y="${f1(y - h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="2" transform="rotate(${rot} ${f1(x)} ${f1(y)})" style="fill:${c};opacity:${op}"/>`; }
  if (k < .64) return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(4 + R() * 5)}" style="fill:${c};opacity:${op}"/>`;
  if (k < .84) { const L = 16 + R() * 10; return `<path d="M${f1(x - L)} ${f1(y)} q${f1(L / 2)} -${f1(L / 2.2)} ${f1(L)} 0 t${f1(L)} 0" transform="rotate(${rot} ${f1(x)} ${f1(y)})" style="fill:none;stroke:${c};stroke-width:4;stroke-linecap:round;opacity:${op}"/>`; }
  return star4(x, y, 7 + R() * 7, `fill:${c};opacity:${op}`);
};
const pieceHaman = (R, x, y, cols) => {   /* hamantaschen: rounded triangle with a filling dot */
  const c = `var(--a${1 + Math.floor(R() * cols)})`, r = 15 + R() * 13, rot = Math.round(R() * 120), op = (.55 + R() * .4).toFixed(2);
  const p = [0, 1, 2].map(j => { const a = (-90 + j * 120) * Math.PI / 180; return [x + r * Math.cos(a), y + r * Math.sin(a)]; });
  if (R() < .3) return star4(x, y, 6 + R() * 6, `fill:var(--a1);opacity:${op}`);
  return `<g transform="rotate(${rot} ${f1(x)} ${f1(y)})" style="opacity:${op}"><path d="M${f1(p[0][0])} ${f1(p[0][1])} L${f1(p[1][0])} ${f1(p[1][1])} L${f1(p[2][0])} ${f1(p[2][1])}Z" style="fill:${c};stroke:${c};stroke-width:5;stroke-linejoin:round"/><circle cx="${f1(x)}" cy="${f1(y + r * .12)}" r="${f1(r * .26)}" style="fill:var(--a4);opacity:.85"/></g>`;
};
const twinkles = (G, seed, n, color, rmin = 5, rmax = 11, region = [0, 0, W, Math.round(H * .24)]) => {
  const R = rng(seed), [bl, bt, br, bb] = G.box; let a = '', b = '';
  for (let i = 0, t = 0; i < n && t < 3000; t++) { const x = region[0] + R() * region[2], y = region[1] + R() * region[3];
    if (x > bl - 24 && x < br + 24 && y > bt - 24 && y < bb + 24) continue; if (y < 96 && (x < 330 || x > W - 330)) continue;
    (i % 2 ? a : b); const s = star4(x, y, rmin + R() * (rmax - rmin), `fill:${color};opacity:.9`); if (i % 2) a += s; else b += s; i++; }
  return layer(region[0], region[1], region[2], region[3], a, { an: 'aFade', dur: 800, d: 300 }, { k: 'kTwinkle', d: 3.6, dl: -1.2 }) + layer(region[0], region[1], region[2], region[3], b, { an: 'aFade', dur: 800, d: 380 }, { k: 'kTwinkle', d: 4.4, dl: -3 });
};

/* ═════════════ ART — one function per style; returns layers.  G = {W,H,port,box:[l,t,r,b],light} ═════════════ */
const ART = {
  classic(G) {
    /* The everyday default: a calm, centred card. Theme-driven (accent at low
       opacity, so it follows dark/light and the owner's accent), static except
       the tiny top bar's slow breathe. Halo behind the text, ornament below. */
    const cx = W / 2, cy = Math.round(H * .46), r1 = Math.round(Math.min(W, H) * .33), r2 = Math.round(Math.min(W, H) * .44);
    const halo = `<circle cx="${cx}" cy="${cy}" r="${r2}" style="fill:none;stroke:var(--s-acc);stroke-width:1.5;opacity:.10"/>
      <circle cx="${cx}" cy="${cy}" r="${r1}" style="fill:none;stroke:var(--s-acc);stroke-width:2;opacity:.16"/>
      <path d="M${cx} ${cy - r1 - 9} l9 9 l-9 9 l-9 -9Z" style="fill:var(--s-acc);opacity:.5"/>`;
    const oy = H - 92, orn = `<path d="M${cx - 150} ${oy} H${cx - 22} M${cx + 22} ${oy} H${cx + 150}" style="stroke:var(--s-acc);stroke-width:1.6;opacity:.45"/>
      <path d="M${cx} ${oy - 8} l8 8 l-8 8 l-8 -8Z" style="fill:var(--s-acc);opacity:.7"/>
      <circle cx="${cx - 168}" cy="${oy}" r="2.6" style="fill:var(--s-acc);opacity:.45"/><circle cx="${cx + 168}" cy="${oy}" r="2.6" style="fill:var(--s-acc);opacity:.45"/>`;
    return `<div class="panelbg"></div>`
      + layer(cx - r2 - 4, cy - r2 - 4, 2 * r2 + 8, 2 * r2 + 8, halo, { an: 'aFade', dur: 900, d: 200 })
      + layer(cx - 180, oy - 12, 360, 24, orn, { an: 'aFade', dur: 700, d: 450 })
      + layer(cx - 52, 28, 104, 10, `<rect x="${cx - 52}" y="28" width="104" height="7" rx="3.5" style="fill:var(--s-acc)"/>`, null, { k: 'kBreathe', d: 4.5, vars: { o0: .45 } });
  },

  grand(G) {
    const notch = (i, r) => `M${i + r} ${i} H${W - i - r} A${r} ${r} 0 0 0 ${W - i} ${i + r} V${H - i - r} A${r} ${r} 0 0 0 ${W - i - r} ${H - i} H${i + r} A${r} ${r} 0 0 0 ${i} ${H - i - r} V${i + r} A${r} ${r} 0 0 0 ${i + r} ${i}Z`;
    const dia = (x, y, s) => `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y}Z" style="fill:var(--s-acc)"/>`;
    const cart = y => `<rect x="${W / 2 - 70}" y="${y - 8}" width="140" height="16" style="fill:var(--s-bg)"/>
      <path d="M${W / 2 - 64} ${y} H${W / 2 - 22} M${W / 2 + 22} ${y} H${W / 2 + 64}" style="stroke:var(--s-acc);stroke-width:1.6"/>
      <circle cx="${W / 2 - 70}" cy="${y}" r="2.6" style="fill:var(--s-acc)"/><circle cx="${W / 2 + 70}" cy="${y}" r="2.6" style="fill:var(--s-acc)"/>`;
    const frame = `<path d="${notch(40, 34)}" style="fill:none;stroke:color-mix(in srgb, var(--s-acc) 75%, transparent);stroke-width:2.4"/>
      <path d="${notch(54, 48)}" style="fill:none;stroke:color-mix(in srgb, var(--s-acc) 42%, transparent);stroke-width:1.2"/>${cart(40)}${cart(H - 40)}`;
    let o = layer(0, 0, W, H, frame, { an: 'aGrowS', dur: 900, d: 0 });
    [[46, 46], [W - 46, 46], [46, H - 46], [W - 46, H - 46], [W / 2, 40], [W / 2, H - 40]].forEach(([x, y], i) =>
      o += layer(x - 14, y - 14, 28, 28, dia(x, y, i > 3 ? 9 : 7), { an: 'aFade', dur: 500, d: 300 + i * 50 }, { k: 'kBreathe', d: 5.5, dl: -i * .9, vars: { o0: .3 } }));
    return o;
  },

  emergency(G) {
    const band = y => { let s = ''; for (let x = -56; x < W + 112; x += 56) s += `<path d="M${x} ${y + 26} L${x + 26} ${y} H${x + 54} L${x + 28} ${y + 26}Z" style="fill:var(--a2)"/>`; return s; };
    const tri = `<path d="M250 268 L432 610 Q440 626 422 626 H78 Q60 626 68 610 Z" style="fill:none;stroke:var(--a1);stroke-width:22;stroke-linejoin:round"/>
      <path d="M250 398 V514" style="stroke:var(--a1);stroke-width:24;stroke-linecap:round"/><circle cx="250" cy="570" r="15" style="fill:var(--a1)"/>`;
    return layer(-56, 0, W + 112, 26, band(0), null, { k: 'kDrift', d: 2.6, e: 'linear', dir: 'normal', vars: { dx: 56 } })
      + layer(-56, H - 26, W + 112, 26, band(H - 26), null, { k: 'kDrift', d: 2.6, e: 'linear', dir: 'normal', vars: { dx: -56 } })
      + side(() => layer(50, 250, 400, 400, tri, { an: 'aGrow', dur: 320, d: 40, ease: 'cubic-bezier(.2,.9,.3,1.2)' }, { k: 'kPulse', d: 1.3, vars: { ps: 1.05 } }));
  },

  sleek(G) {
    let t = `<path d="M96 ${H - 64} H${W - 96}" style="stroke:var(--a1);stroke-width:1.5"/>`;
    for (let x = 96, k = 0; x <= W - 96; x += 17.6, k++) t += `<path d="M${f1(x)} ${H - 64} V${H - 64 - (k % 10 === 0 ? 24 : k % 5 === 0 ? 14 : 8)}" style="stroke:${k % 10 === 0 ? 'var(--a1)' : 'var(--a2)'};stroke-width:1.5"/>`;
    const mk = `<path d="M96 ${H - 66} l-8 -22 h16Z" style="fill:var(--s-ink)"/>`;
    return layer(90, H - 100, W - 180, 50, t, { an: 'aUnroll', dur: 800, d: 0, o: '0% 50%' })
      + layer(88, H - 94, 16, 30, mk, { an: 'aFade', dur: 600, d: 600 }, { k: 'kGlide', d: 30, vars: { dx: W - 192 } });
  },

  celebration(G) {
    let o = rain(G, 7, pieceConfetti, { nTop: 30, nCol: 11, cols: 4 });
    const curl = (x, m, c) => `<path d="M${x} -10 c${40 * m} 30 ${10 * m} 70 ${50 * m} 90 s${50 * m} -6 ${34 * m} 46 s${-16 * m} 34 ${10 * m} 54" style="fill:none;stroke:${c};stroke-width:5;stroke-linecap:round;opacity:.9"/>`;
    o += layer(W * .24 - 80, -10, 160, 200, curl(W * .24, 1, 'var(--a2)'), { an: 'aDrop', dur: 760, d: 60 }, { k: 'kSway', d: 5.5, o: '50% 0%', vars: { sa: 2.2 } });
    o += layer(W * .78 - 80, -10, 160, 200, curl(W * .78, -1, 'var(--a1)'), { an: 'aDrop', dur: 760, d: 120 }, { k: 'kSway', d: 6.5, dl: -2, o: '50% 0%', vars: { sa: 2.2 } });
    return o + twinkles(G, 21, 16, 'var(--a4)', 6, 11);
  },

  urgent(G) {
    const ring = `<rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="40" style="fill:none;stroke:var(--s-acc);stroke-width:10"/>`;
    const bw = 78, x0 = 29, y0 = 29, y1 = H - 29, r = 40;
    const bar = `<path d="M${x0 + bw} ${y0} H${x0 + r} a${r} ${r} 0 0 0 -${r} ${r} V${y1 - r} a${r} ${r} 0 0 0 ${r} ${r} H${x0 + bw}Z" style="fill:var(--s-acc)"/>`;
    const cy = Math.round(G.box[1] + 22), cx = x0 + bw / 2 + 2;   /* glyph sits on the kicker line, cut into the bar */
    const glyph = `<circle cx="${cx}" cy="${cy}" r="25" style="fill:none;stroke:var(--s-onacc);stroke-width:5"/>
      <path d="M${cx} ${cy - 12} V${cy + 3}" style="stroke:var(--s-onacc);stroke-width:5.5;stroke-linecap:round"/><circle cx="${cx}" cy="${cy + 13}" r="3.4" style="fill:var(--s-onacc)"/>`;
    ARTRECTS.push({ x: 24, y: 24, w: bw + 10, h: H - 48 });
    return layer(0, 0, W, H, ring, { an: 'aFade', dur: 500 }, { k: 'kBreathe', d: 3.4, vars: { o0: .6 } })
      + layer(x0, y0, bw, y1 - y0, bar, { an: 'aGrowY', dur: 520, d: 40, o: '50% 0%' })
      + layer(cx - 30, cy - 30, 60, 60, glyph, { an: 'aGrow', dur: 420, d: 420, ease: 'cubic-bezier(.2,1.3,.3,1)', cls: 'glyph' }, { k: 'kPulse', d: 2.2, vars: { ps: 1.1 } });
  },

  torah(G) {
    const rl = PORT ? 70 : 118, rr = W - rl;
    const roller = x => `
      <rect x="${x - 8}" y="58" width="16" height="56" rx="8" class="ln" style="fill:var(--a2)"/>
      <circle cx="${x}" cy="50" r="15" class="ln" style="fill:var(--a2)"/><path d="M${x} 35 V27" class="ln"/>
      <rect x="${x - 50}" y="112" width="100" height="14" rx="7" class="ln" style="fill:var(--a2)"/>
      <rect x="${x - 36}" y="126" width="72" height="${H - 252}" rx="12" class="ln" style="fill:var(--sheet)"/>
      <path d="M${x - 18} 140 V${H - 140} M${x + 14} 140 V${H - 140}" class="ln" style="stroke-width:1.5;opacity:.45"/>
      <rect x="${x - 50}" y="${H - 126}" width="100" height="14" rx="7" class="ln" style="fill:var(--a2)"/>
      <rect x="${x - 9}" y="${H - 112}" width="18" height="70" rx="9" class="ln" style="fill:var(--a2)"/>`;
    const sx0 = rl + 36, sx1 = rr - 36;
    const sheet = `<rect x="${sx0}" y="138" width="${sx1 - sx0}" height="${H - 276}" style="fill:var(--sheet)"/>
      <path d="M${sx0} 138 H${sx1} M${sx0} ${H - 138} H${sx1}" style="stroke:color-mix(in srgb, var(--a1) 45%, transparent);stroke-width:2"/>
      <path d="M${sx0 + 46} 168 H${sx1 - 46} M${sx0 + 46} ${H - 168} H${sx1 - 46}" style="stroke:color-mix(in srgb, var(--a1) 22%, transparent);stroke-width:1.2"/>`;
    return layer(sx0 - 4, 130, sx1 - sx0 + 8, H - 260, sheet, { an: 'aUnroll', dur: 900, d: 0 })
      + layer(sx0 + 40, 150, sx1 - sx0 - 80, H - 300, glow(W / 2, H / 2, Math.min(sx1 - sx0, H - 300) * .55, 'var(--a1)', .16), { an: 'aFade', dur: 900, d: 300 }, { k: 'kBreathe', d: 7.5, vars: { o0: .35 } })
      + layer(rl - 60, 20, 120, H - 40, roller(rl), { an: 'aOpenL', dur: 900, d: 0 })
      + layer(rr - 60, 20, 120, H - 40, roller(rr), { an: 'aOpenR', dur: 900, d: 0 });
  },

  trip(G) {
    const sy = H - 88, d = `M118 ${sy} C ${f1(W * .24)} ${sy + 54}, ${f1(W * .33)} ${sy - 68}, ${f1(W * .5)} ${sy - 20} S ${f1(W * .76)} ${sy + 40}, ${f1(W - 130)} ${sy - 28}`;
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.setAttribute('d', d);
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.style.position = 'absolute'; sv.appendChild(tmp); document.body.appendChild(sv);
    const Lh = tmp.getTotalLength(), at = f => { const p = tmp.getPointAtLength(Lh * f), p2 = tmp.getPointAtLength(Math.min(Lh, Lh * f + 4)); return [p.x, p.y, Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI]; };
    const f0 = .6, [bx0, by0, a0] = at(f0);
    /* bus keyframes: translate/rotate relative to the static pose, sampled along the path (opacity 0 at both ends → seamless) */
    let kf = ''; for (let i = 0; i <= 28; i++) { const f = .04 + .92 * i / 28, [x, y, a] = at(f); kf += `${f1(i / 28 * 100)}%{transform:translate(${f1(x - bx0)}px,${f1(y - by0)}px) rotate(${f1(a - a0)}deg);opacity:${i === 0 || i === 28 ? 0 : i === 1 || i === 27 ? .7 : 1}}`; }
    const kbus = 'kBus' + (++KBUS), kbusCss = `<style>@keyframes ${kbus}{${kf}}</style>`;
    const [px, py] = at(1); sv.remove();
    const route = `<path d="${d}" style="fill:none;stroke:color-mix(in srgb, var(--s-acc) 75%, transparent);stroke-width:7;stroke-linecap:round;stroke-dasharray:.1 19"/>
      <circle cx="118" cy="${sy}" r="13" style="fill:var(--s-acc)"/><circle cx="118" cy="${sy}" r="24" class="ln" style="stroke:color-mix(in srgb, var(--s-acc) 45%, transparent)"/>`;
    const pin = `<path d="M${W - 130} ${sy - 28} c-24 -26 -36 -44 -36 -62 a36 36 0 0 1 72 0 c0 18 -12 36 -36 62z" style="fill:var(--s-acc)"/><circle cx="${W - 130}" cy="${sy - 90}" r="13" style="fill:var(--s-bg)"/>`;
    const bus = `<g transform="translate(${f1(bx0)} ${f1(by0)}) rotate(${f1(a0)})">
      <path d="M-92 -14 V-82 Q-92 -96 -78 -96 H66 Q84 -96 90 -78 L98 -46 V-14 Q98 -8 92 -8 H-86 Q-92 -8 -92 -14Z" class="ln" style="fill:var(--s-bg);stroke:var(--s-acc);stroke-width:4"/>
      ${[0, 1, 2, 3].map(i => `<rect x="${-80 + i * 36}" y="-84" width="28" height="28" rx="5" style="fill:color-mix(in srgb, var(--s-acc) 30%, transparent)"/>`).join('')}
      <path d="M68 -84 H80 Q86 -84 88 -78 L94 -56 H68Z" style="fill:color-mix(in srgb, var(--s-acc) 30%, transparent)"/><path d="M-92 -44 H98" class="ln" style="stroke:var(--s-acc);stroke-width:2.5"/>
      <circle cx="-56" cy="-8" r="14" class="ln" style="fill:var(--s-bg);stroke:var(--s-acc);stroke-width:4"/><circle cx="-56" cy="-8" r="4" style="fill:var(--s-acc)"/>
      <circle cx="60" cy="-8" r="14" class="ln" style="fill:var(--s-bg);stroke:var(--s-acc);stroke-width:4"/><circle cx="60" cy="-8" r="4" style="fill:var(--s-acc)"/></g>`;
    let topo = ''; const R = rng(11), ph = [R() * 6, R() * 6, R() * 6], ts = PORT ? .6 : 1, tx = W - 100 * (PORT ? .6 : 1);
    for (let k = 1; k <= 7; k++) { let dd = ''; for (let i = 0; i <= 72; i++) { const th = i / 72 * Math.PI * 2;
      const r = (k * 46 + 14 * Math.sin(3 * th + ph[0] + k * .25) + 9 * Math.cos(5 * th + ph[1]) + 6 * Math.sin(2 * th + ph[2])) * ts;
      dd += (i ? 'L' : 'M') + f1(tx + r * Math.cos(th)) + ' ' + f1(90 + r * .8 * Math.sin(th)); }
      topo += `<path d="${dd}Z" style="fill:none;stroke:color-mix(in srgb, var(--s-acc) ${k % 3 === 0 ? 34 : 18}%, transparent);stroke-width:${k % 3 === 0 ? 2.4 : 1.6}"/>`; }
    return kbusCss + layer(W - 520, 0, 520, 420, topo, { an: 'aFade', dur: 900 }, { k: 'kBreathe', d: 9, vars: { o0: .5 } })
      + layer(80, sy - 110, W - 160, 190, route + pin, { an: 'aFade', dur: 500 })
      + layer(px - 40, py - 120, 80, 120, `<circle cx="${px}" cy="${py - 90}" r="30" style="fill:none;stroke:var(--s-acc);stroke-width:3"/>`, { an: 'aFade', dur: 500, d: 300 }, { k: 'kRing', d: 3.2, dir: 'normal', e: 'ease-out', vars: { ro: .7 }, o: '50% 75%' })
      + layer(bx0 - 110, by0 - 110, 220, 140, bus, { an: 'aFade', dur: 600, d: 150 }, { k: kbus, d: 24, e: 'linear', dir: 'normal', o: '110px 110px' });
  },

  phone(G) {
    /* "phones away": a phone inside a prohibition sign (ring + diagonal slash). One glance, no explanation needed. */
    const cx = 290, cy = 450, r = 170;
    const sign = `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:none;stroke:var(--s-acc);stroke-width:18"/>
      <rect x="${cx - 62}" y="${cy - 110}" width="124" height="220" rx="26" style="fill:color-mix(in srgb, var(--s-acc) 14%, transparent);stroke:var(--s-ink);stroke-width:9;opacity:.92"/>
      <rect x="${cx - 44}" y="${cy - 86}" width="88" height="150" rx="9" style="fill:color-mix(in srgb, var(--s-ink) 14%, transparent)"/>
      <path d="M${cx - 18} ${cy + 86} H${cx + 18}" style="stroke:var(--s-ink);stroke-width:7;stroke-linecap:round;opacity:.8"/>`;
    const a = Math.PI / 4, dx = r * Math.cos(a), dy = r * Math.sin(a);
    const slash = `<path d="M${f1(cx - dx)} ${f1(cy - dy)} L${f1(cx + dx)} ${f1(cy + dy)}" style="stroke:var(--s-bg);stroke-width:44;stroke-linecap:butt"/>
      <path d="M${f1(cx - dx)} ${f1(cy - dy)} L${f1(cx + dx)} ${f1(cy + dy)}" style="stroke:var(--s-acc);stroke-width:18;stroke-linecap:butt"/>`;
    return side(() => layer(cx - r - 14, cy - r - 14, 2 * r + 28, 2 * r + 28, sign, { an: 'aGrow', dur: 560, d: 80 }, { k: 'kPulse', d: 6, vars: { ps: 1.025 } })
      + layer(cx - r - 14, cy - r - 14, 2 * r + 28, 2 * r + 28, slash, { an: 'aSlash', dur: 520, d: 520, ease: 'cubic-bezier(.2,.9,.3,1.1)' })
      + layer(cx - r - 14, cy - r - 14, 2 * r + 28, 2 * r + 28, `<circle cx="${cx}" cy="${cy}" r="${r + 9}" style="fill:none;stroke:var(--s-acc);stroke-width:3"/>`, { an: 'aFade', dur: 400, d: 700 }, { k: 'kRing', d: 4.2, dir: 'normal', e: 'ease-out', vars: { ro: .5 }, dl: 1.2 }));
  },

  memorial(G) {
    const cx = 290, top = 390, bot = 630;
    const candle = `
      <path d="M${cx - 78} ${top} L${cx - 68} ${bot - 12} Q${cx - 67} ${bot} ${cx - 55} ${bot} H${cx + 55} Q${cx + 67} ${bot} ${cx + 68} ${bot - 12} L${cx + 78} ${top}" style="fill:color-mix(in srgb, var(--s-ink) 5%, transparent);stroke:var(--a1);stroke-width:3;stroke-linejoin:round"/>
      <ellipse cx="${cx}" cy="${top}" rx="78" ry="13" style="fill:none;stroke:var(--a1);stroke-width:3"/>
      <path d="M${cx - 76} ${top + 46} Q${cx} ${top + 62} ${cx + 76} ${top + 46}" style="fill:none;stroke:var(--a1);stroke-width:2"/>
      <path d="M${cx - 50} ${top + 40} L${cx - 44} ${bot - 30}" style="stroke:color-mix(in srgb, var(--s-ink) 22%, transparent);stroke-width:5;stroke-linecap:round"/>
      <path d="M${cx} ${top + 30} V${top + 6}" style="stroke:var(--a1);stroke-width:3.5;stroke-linecap:round"/>`;
    return side(() => layer(cx - 170, top - 190, 340, 340, glow(cx, top - 40, 170, 'var(--a2)', .3), { an: 'aFade', dur: 900, d: 300 }, { k: 'kBreathe', d: 5.2, vars: { o0: .6 } })
      + layer(cx - 90, top - 20, 180, bot - top + 40, candle)
      + layer(cx - 40, top - 110, 80, 120, flame(cx, top + 6, 96), { an: 'aFlame', dur: 700, d: 450, o: '50% 100%' }, { k: 'kFlameA', d: 3.1, o: '50% 100%' }));
  },

  hype(G) {
    const ox = W, oy = H, N = 26, rr = Math.hypot(W, H); let A = '', B = '';
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI + (i / N) * Math.PI / 2, a1 = Math.PI + ((i + 1) / N) * Math.PI / 2;
      const p = `<path d="M${ox} ${oy} L${f1(ox + rr * Math.cos(a0))} ${f1(oy + rr * Math.sin(a0))} L${f1(ox + rr * Math.cos(a1))} ${f1(oy + rr * Math.sin(a1))}Z" style="fill:color-mix(in srgb, var(--s-acc) 9%, transparent)"/>`;
      if (i % 2) B += p; else A += p;
    }
    return layer(0, 0, W, H, A, { an: 'aSpin', dur: 1000, d: 0, o: '100% 100%' })
      + layer(0, 0, W, H, B, { an: 'aSpin', dur: 1000, d: 120, o: '100% 100%' }, { k: 'kBreathe', d: 3.6, vars: { o0: .1 } });
  },

  shabbos(G) {
    const stick = x => `
      <path d="M${x - 58} 790 Q${x - 58} 772 ${x - 30} 768 Q${x - 10} 764 ${x - 9} 740 L${x - 7} 650 Q${x - 22} 640 ${x - 7} 630 L${x - 6} 560 Q${x - 18} 552 ${x - 6} 544 L${x - 6} 528 Q${x - 34} 524 ${x - 38} 500 H${x + 38} Q${x + 34} 524 ${x + 6} 528 L${x + 6} 544 Q${x + 18} 552 ${x + 6} 560 L${x + 7} 630 Q${x + 22} 640 ${x + 7} 650 L${x + 9} 740 Q${x + 10} 764 ${x + 30} 768 Q${x + 58} 772 ${x + 58} 790Z" class="ln" style="fill:color-mix(in srgb, var(--a1) 14%, var(--s-bg));stroke:var(--a1)"/>
      <path d="M${x - 64} 792 H${x + 64}" class="ln" style="stroke:var(--a1)"/>
      <rect x="${x - 15}" y="318" width="30" height="182" rx="4" style="fill:var(--a4);stroke:color-mix(in srgb, var(--s-ink) 25%, transparent);stroke-width:2"/>
      <path d="M${x} 318 V306" style="stroke:color-mix(in srgb, var(--s-ink) 60%, transparent);stroke-width:3;stroke-linecap:round"/>`;
    const R = rng(3), [bl, bt, br, bb] = G.box; let sa = '', sb = '';
    if (!G.light) for (let i = 0, t = 0; i < 64 && t < 4000; t++) { const x = R() * W, y = R() * H; if (x > bl - 20 && x < br + 20 && y > bt - 20 && y < bb + 20) continue; if (y < 96 && (x < 330 || x > W - 330)) continue;
      const s = `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(.9 + R() * 1.8)}" style="fill:var(--s-ink);opacity:${(.3 + R() * .5).toFixed(2)}"/>`; if (x < bl) sa += s; else sb += s; i++; }
    const flames = side(() => [200, 360].map((x, i) => layer(x - 22, 224, 44, 86, flame(x, 306, 70), { an: 'aFlame', dur: 360, d: 420 + i * 260, o: '50% 100%' }, { k: i ? 'kFlameB' : 'kFlameA', d: 2.9 + i * .6, dl: -i * 1.1, o: '50% 100%' })).join(''));
    return (G.light ? '' : layer(0, 0, Math.max(40, bl), H, sa, { an: 'aFade', dur: 900 }, { k: 'kTwinkle', d: 5, dl: -1 }) + layer(Math.max(40, bl), 0, W - Math.max(40, bl), H, sb, { an: 'aFade', dur: 900, d: 100 }, { k: 'kTwinkle', d: 6.2, dl: -3 }))
      + side(() => layer(60, 140, 440, 360, glow(280, 300, 220, 'var(--a2)', G.light ? .16 : .24), { an: 'aFade', dur: 800, d: 350 }, { k: 'kBreathe', d: 4.6, vars: { o0: .6 } })
        + layer(130, 290, 300, 520, stick(200) + stick(360))) + flames;
  },

  yomtov(G) {
    const n = Math.ceil((W + 152) / 76) + 1;
    const frieze = cy => { let s = `<path d="M-76 ${cy - 31} H${W + 76} M-76 ${cy + 31} H${W + 76}" style="stroke:color-mix(in srgb, var(--a1) 70%, transparent);stroke-width:1.6"/>
        <path d="M-76 ${cy - 37} H${W + 76} M-76 ${cy + 37} H${W + 76}" style="stroke:color-mix(in srgb, var(--a1) 35%, transparent);stroke-width:1"/>`;
      for (let k = 0; k < n; k++) { const x = -56 + k * 76, R = 25, tri = o => [0, 1, 2].map(j => { const a = (o + j * 120) * Math.PI / 180; return `${f1(x + R * Math.cos(a))} ${f1(cy + R * Math.sin(a))}`; }).join(' L');
        s += `<path d="M${tri(-90)}Z M${tri(90)}Z" style="fill:none;stroke:var(--a1);stroke-width:2.2;stroke-linejoin:round"/><circle cx="${x + 38}" cy="${cy}" r="3.4" style="fill:var(--a2)"/>`; } return s; };
    return layer(-76, 34, W + 152, 82, frieze(75), { an: 'aBand', dur: 800, d: 0 }, { k: 'kDrift', d: 16, e: 'linear', dir: 'normal', vars: { dx: 76 }, })
      + layer(-76, H - 116, W + 152, 82, frieze(H - 75), { an: 'aBandU', dur: 800, d: 0 }, { k: 'kDrift', d: 16, e: 'linear', dir: 'normal', vars: { dx: -76 } });
  },

  siyum(G) {
    const R = rng(5); let lines = '';
    const block = (x0, x1, y0, y1, gap = 13, h = 5, para = 9) => { let s = ''; for (let y = y0, n = 0; y <= y1; y += gap, n++) {
      const last = n % para === para - 1; const w = (x1 - x0) * (last ? .35 + R() * .4 : .94 + R() * .06);
      s += `<rect x="${x0}" y="${f1(y)}" width="${f1(w)}" height="${h}" rx="${h / 2}" style="fill:var(--a1)"/>`; } return s; };
    const px = 70, py = 104, pw = 420, ph = 700;
    lines += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="6" style="fill:var(--sheet);stroke:color-mix(in srgb, var(--s-ink) 16%, transparent);stroke-width:2"/>`;
    lines += `<rect x="${px + 26}" y="${py + 22}" width="44" height="7" rx="3.5" style="fill:var(--a1)"/><rect x="${pw + px - 70}" y="${py + 22}" width="44" height="7" rx="3.5" style="fill:var(--a1)"/>`;
    lines += block(px + 130, px + 290, py + 114, py + 450, 14, 6, 8) + block(px + 26, px + 118, py + 60, py + 470, 11, 4, 12) + block(px + 302, px + 394, py + 60, py + 470, 11, 4, 14)
      + block(px + 26, px + 200, py + 488, py + 670, 11, 4, 10) + block(px + 220, px + 394, py + 488, py + 670, 11, 4, 16);
    const word = `<rect x="${px + 150}" y="${py + 40}" width="120" height="58" rx="4" style="fill:color-mix(in srgb, var(--a3) 34%, transparent)"/>`;
    const ribbon = `<path d="M${px + 330} ${py - 12} H${px + 366} V${py + 420} L${px + 348} ${py + 398} L${px + 330} ${py + 420}Z" style="fill:var(--a2)"/><path d="M${px + 336} ${py - 12} V${py + 404}" style="stroke:color-mix(in srgb, #FFF 22%, transparent);stroke-width:2"/>`;
    return side(() => layer(60, 96, 440, 716, lines, { an: 'aRise', dur: 700, d: 0 })
      + layer(px + 150, py + 40, 120, 58, word, null, { k: 'kBreathe', d: 5.5, vars: { o0: .35 } })
      + layer(px + 320, py - 20, 56, 450, ribbon, { an: 'aDrop', dur: 700, d: 380, ease: 'cubic-bezier(.2,.9,.3,1.15)' }, { k: 'kSway', d: 5, o: '50% 0%', vars: { sa: 1.6 } }));
  },

  farbrengen(G) {
    const tx = W - 490, tbl = `<path d="M70 ${H - 72} H${W - 70}" style="stroke:color-mix(in srgb, var(--a1) 55%, transparent);stroke-width:3;stroke-linecap:round"/>`;
    const y0 = H - 72;
    const cup = (x, fill) => `<path d="M${x - 17} ${y0 - 58} L${x - 12} ${y0 - 2} H${x + 12} L${x + 17} ${y0 - 58}Z" class="ln" style="fill:var(--s-bg)"/>${fill ? `<path d="M${x - 15} ${y0 - 40} L${x - 12} ${y0 - 6} H${x + 12} L${x + 15} ${y0 - 40}Z" style="fill:color-mix(in srgb, var(--a1) 32%, transparent)"/>` : ''}`;
    const bottle = x => `<path d="M${x - 9} ${y0 - 160} H${x + 9} V${y0 - 116} Q${x + 9} ${y0 - 104} ${x + 22} ${y0 - 92} Q${x + 30} ${y0 - 84} ${x + 30} ${y0 - 68} V${y0 - 10} Q${x + 30} ${y0 - 2} ${x + 22} ${y0 - 2} H${x - 22} Q${x - 30} ${y0 - 2} ${x - 30} ${y0 - 10} V${y0 - 68} Q${x - 30} ${y0 - 84} ${x - 22} ${y0 - 92} Q${x - 9} ${y0 - 104} ${x - 9} ${y0 - 116}Z" class="ln" style="fill:var(--s-bg)"/>
      <rect x="${x - 30}" y="${y0 - 62}" width="60" height="34" style="fill:color-mix(in srgb, var(--a1) 22%, transparent)"/><path d="M${x - 11} ${y0 - 160} H${x + 11}" class="ln" style="stroke-width:5"/>`;
    const plate = x => `<path d="M${x - 78} ${y0 - 10} Q${x} ${y0 + 6} ${x + 78} ${y0 - 10}" class="ln"/>` + [-40, 0, 40].map((d, i) => `<path d="M${x + d - 22} ${y0 - 16 - (i === 1 ? 8 : 0)} q22 -26 44 0" class="ln" style="fill:color-mix(in srgb, var(--a1) 22%, var(--s-bg))"/>`).join('');
    const sefer = `<rect x="150" y="${y0 - 24}" width="150" height="22" rx="3" class="ln" style="fill:color-mix(in srgb, var(--a1) 22%, var(--s-bg))"/><path d="M166 ${y0 - 13} H284" class="ln" style="stroke-width:1.6"/>`;
    const lx = W - 290, lamp = `<path d="M${lx} 0 V96" class="ln" style="stroke-width:2.5"/><path d="M${lx - 48} 150 L${lx - 26} 96 H${lx + 26} L${lx + 48} 150Z" class="ln" style="fill:color-mix(in srgb, var(--a1) 30%, var(--s-bg))"/>
      <path d="M${lx - 14} 150 Q${lx} 166 ${lx + 14} 150" class="ln" style="fill:var(--a2);stroke:var(--a2)"/>`;
    return layer(lx - 350, 0, 700, 620, glow(lx, 220, 380, 'var(--a2)', .22), { an: 'aFade', dur: 1000 }, { k: 'kBreathe', d: 6.2, vars: { o0: .55 } })
      + layer(lx - 60, -10, 120, 190, lamp, { an: 'aDropS', dur: 700, d: 100 }, { k: 'kSway', d: 7.5, o: '50% 0%', vars: { sa: 1.4 } })
      + layer(60, y0 - 170, W - 120, 200, tbl + sefer + plate(tx + 380) + cup(tx + 254, true) + cup(tx + 304, false) + bottle(tx + 394 + 0) + cup(tx + 478, true), { an: 'aRise', dur: 700, d: 200 });
  },

  mivtzoim(G) {
    const ox = PORT ? W / 2 : W + 160, oy = PORT ? H + 150 : H * .6, radii = PORT ? [90, 160, 230, 300, 370] : [130, 215, 300, 385, 470, 555];
    const rmax = radii[radii.length - 1] + 12, R = rng(9);
    const x0 = PORT ? 0 : ox - rmax, w = PORT ? W : W - x0, y0 = PORT ? oy - rmax : 0, h = PORT ? H - y0 : H;
    let out = layer(ox - 100, oy - 100, 200, 200, `<circle cx="${ox}" cy="${oy}" r="96" style="fill:color-mix(in srgb, var(--s-acc) 26%, transparent)"/>`, { an: 'aGrow', dur: 700 }, { k: 'kPulse', d: 5, vars: { ps: 1.08 } });
    radii.forEach((r, k) => {
      const op = [.62, .5, .4, .32, .26, .2][k] || .2;
      let s = `<circle cx="${ox}" cy="${oy}" r="${r}" style="fill:none;stroke:color-mix(in srgb, var(--s-acc) ${Math.round(op * 100)}%, transparent);stroke-width:${k < 2 ? 3 : 2.4}"/>`;
      for (let j = 0; j < 2 + k; j++) { const a = Math.PI * (PORT ? 1.1 + R() * .8 : .62 + R() * .7), x = ox + r * Math.cos(a), y = oy + r * Math.sin(a); if (x < W && y > 0 && y < H) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${k < 3 ? 7 : 5.5}" style="fill:color-mix(in srgb, var(--s-acc) ${Math.round(op * 100 + 20)}%, transparent)"/>`; }
      out += layer(x0, y0, w, h, s, { an: 'aGrow', dur: 700, d: k * 70, o: `${f1((ox - x0) / w * 100)}% ${f1((oy - y0) / h * 100)}%` });
    });
    /* outgoing ripples: three single rings expanding from the core, staggered by a third of the period */
    [0, 1, 2].forEach(i => out += layer(x0, y0, w, h, `<circle cx="${ox}" cy="${oy}" r="${radii[radii.length - 1]}" style="fill:none;stroke:var(--s-acc);stroke-width:2.4"/>`, null,
      { k: 'kRipple', d: 9, dir: 'normal', e: 'ease-out', dl: -i * 3, vars: { ro: .5 }, o: `${f1((ox - x0) / w * 100)}% ${f1((oy - y0) / h * 100)}%` }));
    return out;
  },

  welcome(G) {
    const cx = W / 2, sy = Math.round(H * (PORT ? .45 : .52)), Ro = Math.min(432, W / 2 - 60), Ri = Ro - 36;
    let wall = ''; for (let y = 60, r = 0; y < H; y += 74, r++) { wall += `<path d="M0 ${y} H${W}" style="stroke:var(--a2);stroke-width:2"/>`; for (let x = (r % 2) * 95; x < W; x += 190) wall += `<path d="M${x} ${y} V${y + 74}" style="stroke:var(--a2);stroke-width:2"/>`; }
    const arch = R => `M${cx - R} ${H} V${sy} A${R} ${R} 0 0 1 ${cx + R} ${sy} V${H}`;
    let vous = ''; for (let a = 180; a <= 360; a += 12) { if (Math.abs(a - 270) < 7) continue; const t = a * Math.PI / 180;
      vous += `<path d="M${f1(cx + Ri * Math.cos(t))} ${f1(sy + Ri * Math.sin(t))} L${f1(cx + Ro * Math.cos(t))} ${f1(sy + Ro * Math.sin(t))}" style="stroke:color-mix(in srgb, var(--a1) 55%, transparent);stroke-width:2"/>`; }
    const k0 = 264 * Math.PI / 180, k1 = 276 * Math.PI / 180, kr0 = Ri - 6, kr1 = Ro + 14;
    const key = `<path d="M${f1(cx + kr0 * Math.cos(k0))} ${f1(sy + kr0 * Math.sin(k0))} L${f1(cx + kr1 * Math.cos(k0))} ${f1(sy + kr1 * Math.sin(k0))} L${f1(cx + kr1 * Math.cos(k1))} ${f1(sy + kr1 * Math.sin(k1))} L${f1(cx + kr0 * Math.cos(k1))} ${f1(sy + kr0 * Math.sin(k1))}Z" style="fill:color-mix(in srgb, var(--a1) 30%, var(--s-bg));stroke:var(--a1);stroke-width:2.5;stroke-linejoin:round"/>`;
    const door = `<path d="${arch(Ro)}Z" style="fill:var(--s-bg)"/><path d="${arch(Ri)}Z" style="fill:var(--sheet)"/>
      <path d="${arch(Ro)}" style="fill:none;stroke:var(--a1);stroke-width:3"/><path d="${arch(Ri)}" style="fill:none;stroke:color-mix(in srgb, var(--a1) 70%, transparent);stroke-width:2"/>${vous}${key}
      <path d="M${cx - Ro - 40} ${sy} H${cx - Ro} M${cx + Ro} ${sy} H${cx + Ro + 40}" style="stroke:var(--a1);stroke-width:3;stroke-linecap:round"/>`;
    ARTRECTS.arch = { cx, sy, Ri };
    return layer(0, 0, W, H, wall, { an: 'aFade', dur: 700 })
      + layer(cx - Ro - 50, sy - Ro - 20, 2 * Ro + 100, H - sy + Ro + 20, door, { an: 'aGrowS', dur: 900, d: 60, o: '50% 100%' })
      + layer(cx - Ri, sy - Ri, 2 * Ri, H - sy + Ri, glow(cx, sy + 40, Ri * .95, 'var(--a1)', .16), { an: 'aFade', dur: 700, d: 300 }, { k: 'kBreathe', d: 7, vars: { o0: .4 } });
  },

  simcha(G) {
    const string = (x0, y0, x1, y1, cxp, cyp, step, w, len, op, cols) => {
      const Pt = t => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cxp + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cyp + t * t * y1];
      let s = `<path d="M${x0} ${y0} Q${cxp} ${cyp} ${x1} ${y1}" style="fill:none;stroke:color-mix(in srgb, var(--s-ink) 40%, transparent);stroke-width:2"/>`;
      const N = Math.round((x1 - x0) / step);
      for (let i = 1; i < N; i++) { const t = i / N, [x, y] = Pt(t), [xa, ya] = Pt(t - .01), [xb, yb] = Pt(t + .01);
        const ang = Math.atan2(yb - ya, xb - xa), ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
        const a = [x - ux * w / 2, y - uy * w / 2], b = [x + ux * w / 2, y + uy * w / 2], c = [x + nx * len, y + ny * len];
        s += `<path d="M${f1(a[0])} ${f1(a[1])} L${f1(b[0])} ${f1(b[1])} L${f1(c[0])} ${f1(c[1])}Z" style="fill:${cols[i % cols.length]};opacity:${op}"/>`; }
      return s; };
    const cols = ['var(--a1)', 'var(--a2)', 'var(--a3)', 'var(--a4)'], sc = PORT ? .6 : 1;
    let out = layer(0, 0, W, 200, string(-30, -6, W + 30, 6, W / 2, 150, 64 * sc, 40 * sc, 54 * sc, .5, [cols[2], cols[0], cols[3], cols[1]]), { an: 'aDrop', dur: 900, d: 0, ease: 'cubic-bezier(.2,1.25,.4,1)' }, { k: 'kSway', d: 6.5, o: '50% 0%', vars: { sa: .45 } })
      + layer(0, 0, W, 230, string(-30, 20, W + 30, 34, W / 2, 240, 76 * sc, 52 * sc, 72 * sc, 1, cols), { an: 'aDrop', dur: 900, d: 120, ease: 'cubic-bezier(.2,1.25,.4,1)' }, { k: 'kSway', d: 5.5, dl: -2, o: '50% 0%', vars: { sa: .45 } });
    /* three balloons drift up the margins, fading in and out (period translate, opacity 0 at both ends) */
    const bl = (x, y, c, k, d, dl) => layer(x - 40, y - 60, 80, 170, `<ellipse cx="${x}" cy="${y}" rx="30" ry="38" style="fill:${c}"/><path d="M${x} ${y + 38} l-6 10 h12Z" style="fill:${c}"/><path d="M${x} ${y + 48} q-10 30 4 60" style="fill:none;stroke:color-mix(in srgb, var(--s-ink) 45%, transparent);stroke-width:2"/><ellipse cx="${x - 10}" cy="${y - 12}" rx="6" ry="11" style="fill:#fff;opacity:.28"/>`,
      { an: 'aBalloon', dur: 700, d: 300 + k * 80 }, { k: 'kRise', d, e: 'linear', dir: 'normal', dl, vars: { ry: -(H - 120), ro: .85 } });
    const mx = G.box[0] * .5, mx2 = W - (W - G.box[2]) * .5;
    return out + bl(Math.max(70, mx), H - 80, cols[0], 0, 26, 0) + bl(Math.min(W - 70, mx2), H - 80, cols[3], 1, 30, -9) + bl(Math.min(W - 60, mx2) - (PORT ? 40 : 56), H - 80, cols[2], 2, 34, -20);
  },

  schedule(G) {
    const cx = 280, cy = 470, r = 176;
    let face = `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:color-mix(in srgb, var(--s-ink) 4%, transparent);stroke:var(--a1);stroke-width:3"/>`;
    for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180, big = i % 3 === 0, r0 = r - (big ? 30 : 18);
      face += `<path d="M${f1(cx + r0 * Math.sin(a))} ${f1(cy - r0 * Math.cos(a))} L${f1(cx + (r - 10) * Math.sin(a))} ${f1(cy - (r - 10) * Math.cos(a))}" style="stroke:var(--a1);stroke-width:${big ? 5 : 3};stroke-linecap:round"/>`; }
    const hand = (deg, len, w, col, dash = '') => { const a = deg * Math.PI / 180; return `<path d="M${cx} ${cy} L${f1(cx + len * Math.sin(a))} ${f1(cy - len * Math.cos(a))}" style="stroke:${col};stroke-width:${w};stroke-linecap:round;${dash}"/>`; };
    face += hand(52.5, 92, 7, 'var(--a2)', 'stroke-dasharray:2 13') + hand(270, 136, 5, 'var(--a2)', 'stroke-dasharray:2 12');
    const R2 = r + 30;
    const arc = `<path d="M${cx - R2} ${cy} A${R2} ${R2} 0 0 1 ${cx + R2} ${cy}" style="fill:none;stroke:color-mix(in srgb, var(--s-acc) 70%, transparent);stroke-width:4;stroke-linecap:round"/>
      <path d="M${cx + R2 - 13} ${cy - 16} L${cx + R2} ${cy + 2} L${cx + R2 + 15} ${cy - 15}" style="fill:none;stroke:color-mix(in srgb, var(--s-acc) 70%, transparent);stroke-width:4;stroke-linecap:round;stroke-linejoin:round"/>`;
    const L = (inner, an, d) => layer(cx - 220, cy - 220, 440, 440, inner, { an, dur: 900, d, o: '50% 50%', ease: 'cubic-bezier(.3,.7,.2,1)' });
    return side(() => layer(cx - 220, cy - 220, 440, 440, face) + layer(cx - 230, cy - 230, 460, 260, arc, { an: 'aFade', dur: 500, d: 600 })
      + L(hand(67.5, 92, 9, 'var(--s-acc)'), 'aTurnH', 150) + L(hand(90, 140, 6, 'var(--s-acc)') + `<circle cx="${cx}" cy="${cy}" r="11" style="fill:var(--s-acc)"/>`, 'aTurnM', 150)
      + layer(cx - 220, cy - 220, 440, 440, `<path d="M${cx} ${cy + 24} L${cx} ${cy - 150}" style="stroke:var(--s-ink);stroke-width:2;stroke-linecap:round;opacity:.55"/><circle cx="${cx}" cy="${cy - 150}" r="4" style="fill:var(--s-ink);opacity:.55"/>`, { an: 'aFade', dur: 500, d: 600 }, { k: 'kSpin', d: 60, e: 'linear', dir: 'normal' }));
  },

  quiet() { return ''; },

  chanukah(G) {
    const cx = 280, cupY = 420, sp = 44; let arms = '', cups = '', fl = [];
    const xs = [-4, -3, -2, -1, 1, 2, 3, 4].map(k => cx + k * sp);
    xs.forEach(x => { const d = Math.abs(x - cx); arms += `<path d="M${cx} ${cupY + 26 + d * 1.15} L${x} ${cupY + 14}" class="ln" style="stroke-width:5"/>`; });
    arms += `<path d="M${cx} ${cupY - 54} V790" class="ln" style="stroke-width:7"/><path d="M${cx - 64} 792 Q${cx} 744 ${cx + 64} 792Z" class="ln" style="fill:color-mix(in srgb, var(--a1) 24%, var(--s-bg));stroke-width:4"/>`;
    [...xs, cx].forEach((x, i) => { const y = i === 8 ? cupY - 68 : cupY;
      cups += `<rect x="${x - 15}" y="${y}" width="30" height="14" rx="3" style="fill:var(--a1)"/><rect x="${x - 6}" y="${y - 34}" width="12" height="34" rx="2" style="fill:var(--a4);stroke:color-mix(in srgb, var(--s-ink) 22%, transparent);stroke-width:1.5"/>`;
      fl.push([x, y - 38]); });
    return side(() => {
      let out = layer(80, 240, 400, 570, arms + cups) + layer(40, 120, 480, 420, glow(cx, 360, 230, 'var(--a2)', .17), { an: 'aFade', dur: 800, d: 300 }, { k: 'kBreathe', d: 5.2, vars: { o0: .6 } });
      [8, 7, 6, 5, 4, 3, 2, 1, 0].forEach((idx, k) => { const [x, y] = fl[idx];
        out += layer(x - 16, y - 46, 32, 50, flame(x, y, 40), { an: 'aFlame', dur: 300, d: 300 + k * 70, o: '50% 100%' }, { k: k % 2 ? 'kFlameB' : 'kFlameA', d: 2.4 + (k % 4) * .35, dl: -k * .7, o: '50% 100%' }); });
      return out; });
  },

  purim(G) {
    const crown = `<path d="M130 560 L110 380 L200 460 L290 340 L380 460 L470 380 L450 560Z" style="fill:color-mix(in srgb, var(--a1) 20%, var(--s-bg));stroke:var(--a1);stroke-width:5;stroke-linejoin:round"/>
      <rect x="126" y="560" width="328" height="44" rx="8" style="fill:var(--a1)"/>
      ${[[110, 380], [290, 340], [470, 380]].map(([x, y]) => `<circle cx="${x}" cy="${y - 8}" r="15" style="fill:var(--a2)"/>`).join('')}
      ${[0, 1, 2, 3, 4].map(i => `<circle cx="${170 + i * 60}" cy="582" r="9" style="fill:${['var(--a2)', 'var(--a3)', 'var(--a4)', 'var(--a3)', 'var(--a2)'][i]}"/>`).join('')}`;
    return rain(G, 13, pieceHaman, { nTop: 14, nCol: 6, cols: 4 })
      + side(() => layer(100, 320, 400, 300, crown, { an: 'aInsert', dur: 800, d: 120, ease: 'cubic-bezier(.2,.9,.3,1.15)' }, { k: 'kBob', d: 4.6, vars: { by: -8 } })
        + layer(90, 290, 420, 80, [[110, 372], [290, 332], [470, 372]].map(([x, y]) => star4(x, y - 30, 12, 'fill:var(--a4)')).join(''), { an: 'aFade', dur: 600, d: 500 }, { k: 'kTwinkle', d: 3.3 }));
  },

  pesach(G) {
    const cupSvg = (x, y, s, fill, halo) => `<g transform="translate(${x} ${y}) scale(${s})">${halo ? `<circle cx="0" cy="-70" r="62" style="fill:none;stroke:var(--a1);stroke-width:3;opacity:.7"/>` : ''}
      <path d="M-44 -118 H44 Q44 -58 0 -50 Q-44 -58 -44 -118Z" style="fill:color-mix(in srgb, var(--a2) ${fill ? 55 : 8}%, transparent);stroke:var(--a1);stroke-width:5;stroke-linejoin:round"/>
      <path d="M0 -50 V-12 M-26 -8 H26" style="stroke:var(--a1);stroke-width:6;stroke-linecap:round"/><path d="M-36 -98 H36" style="stroke:var(--a1);stroke-width:2;opacity:.6"/></g>`;
    const by = H - 70, gap = (W - 260) / 3; let out = '';
    out += layer(80, by - 220, W - 160, 280, glow(W / 2, by - 40, (W - 160) * .42, 'var(--a2)', G.light ? .07 : .16), { an: 'aFade', dur: 900, d: 200 }, { k: 'kBreathe', d: 7, vars: { o0: .5 } });
    [0, 1, 2, 3].forEach(i => { const x = 130 + i * gap;
      out += layer(x - 70, by - 150, 140, 170, cupSvg(x, by, 1, i < 3, i === 3), { an: 'aRise', dur: 700, d: 150 + i * 110 }, { k: 'kBob', d: 5.4, dl: -i * 1.3, vars: { by: -5 } }); });
    return out + layer(0, 28, W, 30, `<path d="M70 44 H${W - 70}" style="stroke:color-mix(in srgb, var(--a1) 55%, transparent);stroke-width:2"/>` + Array.from({ length: Math.floor((W - 140) / 90) }, (_, i) => `<path d="M${110 + i * 90} 44 q10 -16 24 -6 q-10 14 -24 6Z" style="fill:var(--a3);opacity:.7"/>`).join(''), { an: 'aBand', dur: 800, d: 0 });
  },

  roshchodesh(G) {
    const phases = [[0, 1], [.14, 1], [.5, 1], [.82, 1], [1, 1], [.82, 0], [.5, 0], [.14, 0], [0, 0]];
    const n = phases.length, xs = i => W * .13 + (W * .74) * i / (n - 1), ys = i => H - 80 - Math.sin(Math.PI * i / (n - 1)) * 36, r = 26;
    let out = '';
    phases.forEach(([f, wax], i) => {
      const cx = xs(i), cy = ys(i), cur = i === 1;
      let lit = '';
      if (f >= .999) lit = `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
      else if (f > .001) { const k = r * Math.abs(1 - 2 * f), sw = f < .5 ? 0 : 1; lit = `<path d="M${f1(cx)} ${f1(cy - r)} A${r} ${r} 0 0 1 ${f1(cx)} ${f1(cy + r)} A${f1(k)} ${r} 0 0 ${sw} ${f1(cx)} ${f1(cy - r)}Z" ${wax ? '' : `transform="translate(${f1(2 * cx)} 0) scale(-1 1)"`}/>`; }
      const col = cur ? 'var(--a2)' : 'var(--a1)';
      out += layer(cx - r - 8, cy - r - 8, 2 * r + 16, 2 * r + 16, `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:none;stroke:${col};stroke-width:2.4"/><g style="fill:${col}">${lit}</g>`
        + (cur ? `<circle cx="${cx}" cy="${cy}" r="${r + 9}" style="fill:none;stroke:var(--a2);stroke-width:2;opacity:.6"/>` : ''), { an: 'aFade', dur: 600, d: 100 + i * 45 }, { k: 'kPhase', d: 27, dl: -i * 3, dir: 'normal', e: 'ease-in-out' });
    });
    return out + layer(W * .13 - 60, H - 150, W * .74 + 120, 100, `<path d="M${W * .13} ${H - 54} Q${W / 2} ${H - 130} ${W * .87} ${H - 54}" style="fill:none;stroke:var(--a1);stroke-width:1.5;stroke-dasharray:2 10;stroke-linecap:round;opacity:.6"/>`, { an: 'aFade', dur: 700 });
  },

  lagbaomer(G) {
    const cx = 290, by = 700;
    const logs = `<g transform="rotate(-18 ${cx} ${by})"><rect x="${cx - 120}" y="${by - 17}" width="240" height="34" rx="17" style="fill:var(--a4)"/><circle cx="${cx + 120}" cy="${by}" r="14" style="fill:color-mix(in srgb, var(--a4) 60%, var(--s-ink))"/></g>
      <g transform="rotate(18 ${cx} ${by})"><rect x="${cx - 120}" y="${by - 17}" width="240" height="34" rx="17" style="fill:var(--a4)"/><circle cx="${cx - 120}" cy="${by}" r="14" style="fill:color-mix(in srgb, var(--a4) 60%, var(--s-ink))"/></g>
      <rect x="${cx - 100}" y="${by + 14}" width="200" height="26" rx="13" style="fill:var(--a4)"/>`;
    const bow = `<path d="M${cx + 170} 330 Q${cx + 250} 450 ${cx + 170} 570" style="fill:none;stroke:var(--a4);stroke-width:7;stroke-linecap:round"/><path d="M${cx + 170} 330 L${cx + 170} 570" style="stroke:var(--s-ink);stroke-width:2;opacity:.5"/><path d="M${cx + 170} 450 H${cx + 270}" style="stroke:var(--a1);stroke-width:5;stroke-linecap:round"/><path d="M${cx + 270} 450 l-16 -9 v18Z" style="fill:var(--a1)"/>`;
    const sparks = [[-40, 0, 7], [26, 1, 5], [-6, 2, 6], [48, 3, 4], [-62, 4, 5], [8, 5, 4]];
    return side(() => layer(cx - 200, by - 330, 400, 360, glow(cx, by - 120, 210, 'var(--a1)', .3), { an: 'aFade', dur: 900, d: 300 }, { k: 'kBreathe', d: 3.8, vars: { o0: .55 } })
      + layer(cx - 150, by - 40, 300, 100, logs, { an: 'aRise', dur: 600, d: 100 })
      + [[200, 'var(--a3)', 0, 'kFlameA'], [150, 'var(--a1)', .3, 'kFlameB'], [100, 'var(--a2)', .6, 'kFlameA']].map(([h, c, dl, kf], i) =>
        layer(cx - h * .3 + (i - 1) * 40 * (i ? 1 : 0), by - h - 20, h * .6, h + 24, flame(cx + (i - 1) * 40 * (i ? 1 : 0), by - 6, h, c, i === 2 ? 'var(--a3)' : 'var(--a2)'), { an: 'aFlame', dur: 500, d: 350 + i * 120, o: '50% 100%' }, { k: kf, d: 1.9 + i * .4, dl: -dl * 3, o: '50% 100%' })).join('')
      + sparks.map(([dx, i, rr]) => layer(cx + dx - 10, by - 330, 20, 330, `<circle cx="${cx + dx}" cy="${by - 220}" r="${rr}" style="fill:var(--a2)"/>`, null, { k: 'kRise', d: 5 + i * .8, e: 'ease-out', dir: 'normal', dl: -i * 1.1, vars: { ry: -110, ro: .85 } })).join(''));
  },

  chassidic(G) {
    const cx = W / 2, fy = 150; let rays = '';
    for (let i = 0; i < 23; i++) { const a = (24 + i * (132 / 22)) * Math.PI / 180, len = Math.hypot(W, H) * 1.05;
      rays += `<path d="M${cx} ${fy + 40} L${f1(cx + len * Math.cos(a))} ${f1(fy + 40 + len * Math.sin(a))}" style="stroke:var(--a1);stroke-width:2;opacity:${i % 2 ? .1 : .18}"/>`; }
    const halos = [70, 112, 160].map((r, i) => layer(cx - 170, fy - 170, 340, 340, `<circle cx="${cx}" cy="${fy - 30}" r="${r}" style="fill:none;stroke:var(--a1);stroke-width:2.4"/>`, { an: 'aFade', dur: 650, d: 300 + i * 80 }, { k: 'kRing', d: 6.5, dir: 'normal', e: 'ease-out', dl: -i * 2.1, vars: { ro: .55 }, o: '50% 50%' })).join('');
    return layer(0, 0, W, H, rays, { an: 'aFade', dur: 900, d: 100 }, { k: 'kBreathe', d: 7.5, vars: { o0: .45 } })
      + layer(cx - 220, fy - 220, 440, 360, glow(cx, fy - 30, 190, 'var(--a2)', .3), { an: 'aFade', dur: 800, d: 250 }, { k: 'kBreathe', d: 4.4, vars: { o0: .6 } })
      + halos
      + layer(cx - 34, fy - 112, 68, 120, flame(cx, fy + 6, 100), { an: 'aFlame', dur: 700, d: 300, o: '50% 100%' }, { k: 'kFlameA', d: 3.2, o: '50% 100%' });
  },
};

/**
 * Compute the content box for a style on a W×H canvas and build its art.
 * S = the style's registry entry (src/screen/design/announceStyles.js STYLES).
 * Landscape side graphics (S.bb) are centred vertically; in portrait they
 * become a top band and the content moves below (README "16:10 and portrait").
 */
export function renderArt(styleId, S, w, h, light) {
  W = w; H = h; PORT = w < h; ARTRECTS = []; SIDE = ID; MAP = ID;
  let [L, R, Tp, B] = S.box, align = S.align;
  if (PORT) {
    if (S.bb) {
      const [x0, y0, x1, y1] = S.bb, bw = x1 - x0, bh = y1 - y0, s = Math.min((W - 120) / bw, 420 / bh, 1);
      SIDE = { s, ox: W / 2 - s * (x0 + x1) / 2, oy: 110 + (420 - s * bh) / 2 - s * y0 };
      L = 70; R = 70; Tp = Math.round(110 + (420 + s * bh) / 2 + 40); B = 120;
      ARTRECTS.push({ x: SIDE.ox + s * x0, y: SIDE.oy + s * y0, w: s * bw, h: s * bh });
    } else [L, R, Tp, B] = S.pbox || [70, 70, 150, 120];
    align = 'center';
  } else {
    const dy = (H - 900) / 2; Tp += dy; B += dy;
    if (S.bb) {
      const [x0, y0, x1, y1] = S.bb;
      SIDE = { s: 1, ox: 0, oy: H / 2 - (y0 + y1) / 2 };
      ARTRECTS.push({ x: x0, y: SIDE.oy + y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  const G = { W, H, port: PORT, light: !!light, box: [L, Tp, W - R, H - B] };
  MAP = ID;
  const art = ART[styleId] ? ART[styleId](G) : '';
  return { art, L, R, Tp, B, align, box: G.box, artRects: ARTRECTS, port: PORT };
}
export const ART_IDS = Object.keys(ART);
