// "Jump to exactly that setting": find the target in the page, open what hides it,
// scroll to it and flash it. Retries because the section renders after a route change.

function visibleText(node) { return (node.nodeValue || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

function findByText(scope, text) {
  const want = String(text || '').toLowerCase().trim();
  if (!want) return null;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let exact = null; let loose = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = visibleText(n);
    if (!t) continue;
    const p = n.parentElement;
    if (!p || p.closest('script,style,[aria-hidden="true"]')) continue;
    if (t === want || t.startsWith(want)) { exact = exact || p; break; }
    if (!loose && t.includes(want)) loose = p;
  }
  return exact || loose;
}

/** Make an element's hidden surroundings visible: closed Collapsible (itself or ancestors) / <details>. */
function reveal(el) {
  // React applies a programmatic click a tick later, so `data-open` can't tell us we already opened this
  // one: remember it, or the same Collapsible is clicked twice (open, then closed again).
  const done = new Set();
  const open = (coll) => {
    if (done.has(coll)) return;
    const body = coll.querySelector(':scope > .tt-coll-body');
    const header = coll.querySelector(':scope > button');
    if (body && body.dataset.open !== 'true' && header) { done.add(coll); header.click(); }
  };
  if (el.classList?.contains('tt-coll')) open(el);
  for (let p = el; p && p !== document.body; p = p.parentElement) {
    if (p.tagName === 'DETAILS' && !p.open) p.open = true;
    if (p.classList?.contains('tt-coll')) open(p);
  }
}

function blockOf(el) {
  let e = el;
  while (e && e.parentElement && getComputedStyle(e).display === 'inline') e = e.parentElement;
  return e || el;
}

export function flash(el) {
  if (!el) return;
  const target = blockOf(el);
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('tt-flash');
  // restart the animation
  void target.offsetWidth; // eslint-disable-line no-void
  target.classList.add('tt-flash');
  setTimeout(() => target.classList.remove('tt-flash'), 2000);
}

/** Try for ~2.5 s to find the target, then reveal + flash it. Returns a cancel function. */
export function jumpTo({ anchor, match } = {}) {
  if (!anchor && !match) return () => {};
  let tries = 0; let stopped = false;
  const attempt = () => {
    if (stopped) return;
    const main = document.querySelector('main') || document.body;
    const section = anchor ? document.getElementById(anchor) : null;
    if (anchor && !section && ++tries < 40) { setTimeout(attempt, 65); return; }
    const scope = section || main;
    if (section) reveal(section);
    // Collapsibles render their body after opening: look for the exact text a moment later.
    setTimeout(() => {
      if (stopped) return;
      let inner = match ? findByText(scope, match) : null;
      if (inner && /^h[1-6]$/i.test(inner.tagName) && section) inner = null;
      const target = inner || section;
      if (target) { reveal(target); flash(target); return; }
      if (match && ++tries < 40) setTimeout(attempt, 65);
    }, section ? 260 : 0);
  };
  setTimeout(attempt, 80);
  return () => { stopped = true; };
}
