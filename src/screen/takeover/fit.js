/**
 * One-shot fitting for a rendered takeover stage (README "Fit rules").
 * Every text slot is a binary search between its max and min (canvas px);
 * a slot may wrap inside its height budget; if even the min does not fit it
 * is flagged (data-over) and line-clamped. Never per frame: run on mount,
 * content change and font load. All measurements are layout px
 * (offset*/scroll*/client*), so ScreenScaler's and the slide's transform
 * scale never skew them.
 */

const DEFAULT_PAGE_SECONDS = 12;

function fitEl(el, heScale) {
  let lo = +el.dataset.min || 16, hi = +el.dataset.max || 200;
  if (el.classList.contains('disp-he') || el.classList.contains('q-he')) { hi = Math.round(hi * heScale); lo = Math.round(lo * heScale); }
  const mh = +el.dataset.h; if (mh) el.style.maxHeight = mh + 'px';
  const nw = el.classList.contains('nw') && !el.classList.contains('big');
  const ok = () => el.scrollWidth <= el.clientWidth + 1 && (nw || el.scrollHeight <= el.clientHeight + parseFloat(el.style.fontSize) * .2);
  el.style.display = ''; el.style.webkitLineClamp = ''; el.removeAttribute('data-over');
  const floor = lo; let a = floor, b = hi;
  el.style.fontSize = floor + 'px';
  if (!ok()) {
    el.dataset.over = '1';
    const lines = Math.max(1, Math.floor(el.clientHeight / (floor * 1.14)));
    el.style.display = '-webkit-box'; el.style.webkitBoxOrient = 'vertical'; el.style.webkitLineClamp = lines;
    return;
  }
  while (b - a > 1) { const mid = (a + b) >> 1; el.style.fontSize = mid + 'px'; if (ok()) a = mid; else b = mid; }
  el.style.fontSize = a + 'px'; el.dataset.fit = a;
}

/** Split text into pages at a FIXED reading size (sicha / letter bodies). */
function paginate(root, page) {
  let pagesOut = 1;
  root.querySelectorAll('.paged').forEach((el) => {
    const paras = (el.dataset.text || '').split('|');
    const words = paras.map((p, i) => p.split(' ').filter(Boolean).map((w, j) => ({ w, br: j === 0 && i > 0 }))).flat();
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const build = (arr) => '<p>' + arr.map((x, k) => (x.br && k > 0 ? '</p><p>' : '') + esc(x.w)).join(' ').replace(/<p> /g, '<p>') + '</p>';
    const pages = []; let i = 0;
    while (i < words.length) {
      let j = i + 1; el.innerHTML = build(words.slice(i, j));
      while (j < words.length) { el.innerHTML = build(words.slice(i, j + 1)); if (el.scrollHeight > el.clientHeight + 1) break; j++; }
      if (j < words.length) {
        let k = j; while (k > i && !words[k].br) k--;
        if (k > i && (k - i) >= (j - i) * .6) j = k;
        else { k = j; while (k > i + 20 && !/[.!?”׃:]$/.test(words[k - 1].w)) k--; if (k > i + 20) j = k; }
      }
      pages.push(words.slice(i, j)); i = j;
    }
    if (!pages.length) pages.push([]);
    const cur = Math.min(Math.max(page, 0), pages.length - 1);
    el.innerHTML = build(pages[cur]);
    const pg = el.closest('.lyt').querySelector('.pg');
    if (pg) pg.innerHTML = pages.length < 2 ? '' : `<span class="num">${cur + 1} / ${pages.length}</span>` + pages.map((_, k) => `<i class="${k === cur ? 'on' : ''}"></i>`).join('');
    el.dataset.pages = pages.length;
    pagesOut = Math.max(pagesOut, pages.length);
  });
  return pagesOut;
}

/** Fit everything in `root` (the .tkr element). Returns { pages }. */
export function fitAll(root, { page = 0 } = {}) {
  const heScale = +getComputedStyle(root).getPropertyValue('--he-scale') || 1;
  const $$ = (sel) => root.querySelectorAll(sel);
  $$('.fit, .pw').forEach((el) => { el.style.height = ''; });
  $$('.fit').forEach((el) => fitEl(el, heScale));
  $$('.fit.wrap, .fit.big').forEach((el) => { if (el.dataset.over) return; el.style.maxHeight = ''; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; });
  $$('.pw').forEach((el) => { el.style.height = 'auto'; });
  /* quick name row: one line while it fits at >= .75, else stacked (He over En), scaled down to .45 */
  $$('.qt .nm').forEach((el) => {
    const Wd = el.parentElement.clientWidth; el.classList.remove('stack'); let k = 1; el.style.setProperty('--k', k);
    const fits = () => el.scrollWidth <= Wd + 1;
    while (!fits() && k > .75) { k -= .02; el.style.setProperty('--k', k.toFixed(2)); }
    if (!fits()) { el.classList.add('stack'); k = 1; el.style.setProperty('--k', k); while (!fits() && k > .45) { k -= .02; el.style.setProperty('--k', k.toFixed(2)); } }
  });
  /* two-time quick layout: one size for both, fitted to the narrower column */
  const ts = [...$$('.times .tcol .t')];
  if (ts.length) {
    let s = 170;
    const ok = () => ts.every((t) => { const c = t.parentElement, cs = getComputedStyle(c); return t.scrollWidth <= c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; });
    ts.forEach((t) => { t.style.display = 'inline-block'; });
    do { ts.forEach((t) => { t.style.fontSize = s + 'px'; }); s -= 4; } while (!ok() && s > 60);
    ts.forEach((t) => { t.style.display = ''; });
  }
  /* quick layout is height-aware: if the whole stack is taller than the box, shrink name and times together */
  $$('.lyt.qt').forEach((l) => {
    let n = 0;
    while (l.scrollHeight > l.clientHeight + 4 && n++ < 40) {
      const nm = l.querySelector('.nm'), k = nm ? parseFloat(nm.style.getPropertyValue('--k') || 1) : 1;
      if (nm && k > .45) nm.style.setProperty('--k', (k - .03).toFixed(2));
      l.querySelectorAll('.tcol .t').forEach((t) => { const fs = parseFloat(t.style.fontSize) || 150; if (fs > 64) t.style.fontSize = (fs - 6) + 'px'; });
      const w = l.querySelector('.where'); if (w && n > 8) { const fs = parseFloat(w.style.fontSize); if (fs > 24) w.style.fontSize = (fs - 1) + 'px'; }
    }
  });
  /* event tile: shrink the time until the tile fits its row (narrow: full width; wide: <= 62%) */
  $$('.tile').forEach((tile) => {
    const foot = tile.parentElement, st = tile.closest('.stage'); const narrow = st.classList.contains('narrow');
    const lim = foot.clientWidth * (narrow || !foot.querySelector('.place') ? 1 : .62); let s = narrow ? 112 : 140; tile.style.setProperty('--tile-size', s + 'px');
    tile.classList.remove('stackt');
    const w = () => tile.offsetWidth;
    while (w() > lim && s > 72) { s -= 4; tile.style.setProperty('--tile-size', s + 'px'); }
    if (w() > lim && tile.querySelector('.when') && tile.querySelector('.t')) {
      tile.classList.add('stackt'); s = narrow ? 112 : 140; tile.style.setProperty('--tile-size', s + 'px');
      while (w() > lim && s > 72) { s -= 4; tile.style.setProperty('--tile-size', s + 'px'); }
    }
  });
  /* place block: scale down (min .6) until it fits beside / under the tile */
  $$('.place').forEach((pl) => {
    pl.style.setProperty('--k', 1); let k = 1; const foot = pl.parentElement, tile = foot.querySelector('.tile'), narrow = pl.closest('.stage').classList.contains('narrow');
    const maxH = narrow ? 190 : Math.max(190, tile ? tile.offsetHeight : 190);
    const room = narrow ? foot.clientWidth : foot.clientWidth - (tile ? tile.offsetWidth : 0) - 44;
    pl.style.maxWidth = Math.max(160, room) + 'px';
    while ((pl.scrollHeight > maxH || pl.scrollWidth > pl.clientWidth + 1) && k > .6) { k -= .04; pl.style.setProperty('--k', k.toFixed(2)); }
  });
  /* list rows: one size for every row (largest that fits the tightest row) */
  $$('.items').forEach((it) => {
    let s = 44; const rows = [...it.querySelectorAll('.li')];
    const ok = () => rows.every((r) => { const x = r.querySelector('.x'); return r.scrollHeight <= r.clientHeight + 1 && x.scrollWidth <= x.clientWidth + 1 && r.scrollWidth <= r.clientWidth + 1; });
    it.style.setProperty('--lf', s); while (!ok() && s > 24) { s -= 1; it.style.setProperty('--lf', s); } it.dataset.lf = s;
  });
  const pages = paginate(root, page);
  alignGlyph(root);
  return { pages };
}

/** Offset of `el` from `stage` in layout px (ignores transforms, unlike getBoundingClientRect). */
function offsetIn(el, stage) {
  let x = 0, y = 0, n = el;
  while (n && n !== stage) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y };
}

/** urgent: the glyph in the bar sits on the same line as the kicker (or the first title line when there is no kicker). */
export function alignGlyph(root) {
  const g = root.querySelector('.glyph'); if (!g) return;
  const stage = root.querySelector('.stage');
  const kEl = root.querySelector('.kick'), k = kEl || root.querySelector('.box .fit'); if (!k) return;
  const target = offsetIn(k, stage).y + (kEl ? k.offsetHeight / 2 : Math.min(k.offsetHeight / 2, 40));
  const top0 = parseFloat(g.dataset.top0 || g.style.top);
  g.dataset.top0 = String(top0);
  g.style.top = (top0 + target - (top0 + g.offsetHeight / 2)) + 'px';
}

/** lively extras: split big words / digits so they reveal one by one (entrance only). */
export function splitLively(root) {
  root.querySelectorAll('.enter.x-lively .w-he, .enter.x-lively .w-en, .enter.x-lively .h-he, .enter.x-lively .h-en, .enter.x-lively .q-he').forEach((el) => {
    if (el.querySelector('.w') || el.querySelector('br')) return;
    el.innerHTML = el.textContent.split(' ').map((w, i) => `<span class="w" style="--wi:${i}">${w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
  });
  root.querySelectorAll('.enter.x-lively .big, .enter.x-lively .tile .t, .enter.x-lively .tcol .t').forEach((el) => {
    if (el.querySelector('.dg')) return;
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const f = document.createDocumentFragment();
          [...c.textContent].forEach((ch) => {
            if (/[0-9]/.test(ch)) { const s = document.createElement('span'); s.className = 'dg'; s.style.setProperty('--wi', n++); s.textContent = ch; f.appendChild(s); } else f.appendChild(document.createTextNode(ch));
          });
          c.replaceWith(f);
        } else if (c.nodeType === 1 && !c.classList.contains('pre')) walk(c);
      });
    };
    walk(el);
  });
}

/** Show page `page` of every paged body in `root` (no refit). */
export function showPage(root, page) { return paginate(root, page); }

export { DEFAULT_PAGE_SECONDS };
