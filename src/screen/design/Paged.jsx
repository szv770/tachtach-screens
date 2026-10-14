import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Long text at a FIXED readable size, split into pages (R2 README "Sicha"):
 * the size never shrinks; text that doesn't fit paginates, preferring a break
 * at a paragraph end once the page is 60 % full, otherwise at a sentence end,
 * never mid-sentence if avoidable. One-shot measurement per text/size/box
 * change (never per frame). Pages are advanced by the parent (`page` prop).
 *
 *   <PagedBody text="para\npara" page={i} onPages={setCount} style={{fontSize: 39}} />
 */

function build(words) {
  return words.map((w, k) => (w.br && k > 0 ? `\n${w.w}` : w.w)).join(' ').replace(/ \n/g, '\n');
}

function paginate(el, text) {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const words = paras.flatMap((p, i) => p.split(/\s+/).map((w, j) => ({ w, br: j === 0 && i > 0 })));
  const set = (arr) => { el.replaceChildren(...splitParas(arr)); };
  const pages = [];
  let i = 0;
  while (i < words.length) {
    let j = i + 1;
    set(words.slice(i, j));
    while (j < words.length) {
      set(words.slice(i, j + 1));
      if (el.scrollHeight > el.clientHeight + 1) break;
      j += 1;
    }
    if (j < words.length) {
      let k = j;
      while (k > i && !words[k].br) k -= 1;
      if (k > i && k - i >= (j - i) * 0.6) j = k;
      else {
        k = j;
        while (k > i + 20 && !/[.!?”"׃:]$/.test(words[k - 1].w)) k -= 1;
        if (k > i + 20) j = k;
      }
    }
    pages.push(words.slice(i, j));
    i = j;
  }
  return pages;
}

function splitParas(arr) {
  const out = [];
  let cur = null;
  arr.forEach((x, k) => {
    if (!cur || (x.br && k > 0)) { cur = document.createElement('p'); cur.style.margin = out.length ? '.6em 0 0' : '0'; out.push(cur); cur.textContent = x.w; }
    else cur.textContent += ` ${x.w}`;
  });
  return out;
}

export default function PagedBody({ text, page = 0, onPages, style, dir, className }) {
  const ref = useRef(null);
  const [pages, setPages] = useState(null);

  const run = useCallback(() => {
    const el = ref.current;
    if (!el || !el.clientHeight) return;
    const p = paginate(el, String(text || ''));
    setPages(p);
    onPages?.(p.length);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    run();
    let ro;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      let first = true;
      ro = new ResizeObserver(() => { if (first) { first = false; return; } run(); });
      ro.observe(ref.current);
    }
    let alive = true;
    document.fonts?.ready?.then(() => alive && run()).catch(() => {});
    return () => { alive = false; ro?.disconnect(); };
  }, [run, style?.fontSize, style?.fontFamily]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !pages?.length) return;
    el.replaceChildren(...splitParas(pages[Math.min(page, pages.length - 1)]));
  }, [pages, page]);

  return <div ref={ref} dir={dir} className={className} style={{ overflow: 'hidden', minHeight: 0, ...style }} />;
}

/** Shared pager state: advances `page` every `ms`, wraps; returns [page, setCount, count]. */
export function usePager(ms = 11000) {
  const [count, setCount] = useState(1);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (count < 2) { setPage(0); return undefined; }
    const id = setInterval(() => setPage((p) => (p + 1) % count), ms);
    return () => clearInterval(id);
  }, [count, ms]);
  return [page, setCount, count];
}
