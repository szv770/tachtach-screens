// contrast audit: every style × every theme. Measures computed stage colours (color-mix resolved by Chromium).
const { chromium } = require('playwright'); const path = require('path');
const S = "classic grand emergency sleek celebration urgent torah trip phone memorial hype shabbos yomtov siyum farbrengen mivtzoim welcome simcha schedule quiet chanukah purim pesach roshchodesh lagbaomer chassidic".split(' ');
const TH = "dark dark-hc midnight graphite sepia parchment clean-white ivory sky stone".split(' ');
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const p = await b.newPage();
  const bad = []; let n = 0, worst = 99;
  for (const s of S) for (const t of TH) {
    await p.goto('file://' + path.join(__dirname, 'takeovers.html') + `?style=${s}&theme=${t}`); await p.waitForFunction('window.__ready');
    const r = await p.evaluate(() => {
      const st = document.querySelector('.stage'), cs = getComputedStyle(st);
      const probe = v => { const d = document.createElement('i'); d.style.color = `var(${v})`; st.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const parse = c => { const m = c.match(/[\d.]+/g).map(Number); if (c.startsWith('color(')) return [m[0]*255, m[1]*255, m[2]*255, m[3] ?? 1]; return [m[0], m[1], m[2], m[3] ?? 1]; };
      const L = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
      const over = (fg, bg) => fg.map((v, i) => i < 3 ? v * fg[3] + bg[i] * (1 - fg[3]) : 1);
      const C = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const bg = parse(probe('--s-bg')), out = {};
      for (const v of ['--s-ink', '--s-dim', '--s-accText']) out[v] = C(over(parse(probe(v)), bg), bg);
      const fill = parse(probe('--s-fill')), fi = parse(probe('--s-fillInk'));
      const tile = document.querySelector('.tile'); if (tile) { const tb = parse(getComputedStyle(tile).backgroundColor); const base = tb[3] > .5 ? over(tb, bg) : bg; out.tile = C(over(parse(getComputedStyle(tile).color), base), base); }
      return out; });
    n++;
    const lim = { '--s-ink': 7, '--s-dim': 4.5, '--s-accText': 3, tile: 4.5 };
    for (const k in r) { worst = Math.min(worst, r[k] / lim[k]); if (r[k] < lim[k]) bad.push(`${s}/${t} ${k} ${r[k].toFixed(2)} < ${lim[k]}`); }
  }
  console.log(`${n} combos checked`); console.log(bad.length ? bad.join('\n') : 'all pass'); await b.close(); })();
