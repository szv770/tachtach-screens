// Motion audit.  NODE_PATH=$(npm root -g) node motion.js
const { chromium } = require('playwright'); const path = require('path');
const S = "classic grand emergency sleek celebration urgent torah trip phone memorial hype shabbos yomtov siyum farbrengen mivtzoim welcome simcha schedule quiet chanukah purim pesach roshchodesh lagbaomer chassidic".split(' ');
const LAY = ['bigwords', 'event', 'list', 'quick', 'quote', 'sicha', 'letter'];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const rep = { longestEntrance: [0, ''], bad: [], perStyle: {}, props: new Set() };
  for (const s of S) {
    let maxLoops = 0, maxArea = 0, kinds = new Set();
    for (const l of LAY) {
      await p.goto('file://' + path.join(__dirname, 'takeovers.html') + `?style=${s}&layout=${l}&enter=1&motion=lively`); await p.waitForFunction('window.__ready');
      const r = await p.evaluate(() => {
        const out = { fin: [], loops: [], forbidden: [] };
        document.getAnimations().forEach(a => { const t = a.effect.getComputedTiming(), kf = a.effect.getKeyframes(), el = a.effect.target;
          const props = [...new Set(kf.flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)))];
          if (isFinite(t.iterations)) out.fin.push({ end: t.endTime, props });
          else {
            const lp = el.closest('.lp'); const r = el.getBoundingClientRect();
            const first = kf[0], last = kf[kf.length - 1];
            const dir = t.direction, name = a.animationName;
            let seamless = dir === 'alternate' || dir === 'alternate-reverse';
            const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
            if (!seamless && eq({ o: first.opacity, t: first.transform }, { o: last.opacity, t: last.transform })) seamless = true;
            if (!seamless && +first.opacity === 0 && +last.opacity === 0) seamless = true;
            if (!seamless && name === 'kSpin') seamless = /360deg/.test(last.transform);
            let period = null;
            if (!seamless && (name === 'kFall' || name === 'kDrift')) { const v = getComputedStyle(el).getPropertyValue(name === 'kFall' ? '--fy' : '--dx'); period = Math.abs(parseFloat(v)); seamless = name === 'kFall' ? Math.abs(period - innerHeight) < 1 : (Math.abs(period - 56) < 1 || Math.abs(period - 76) < 1); }
            out.loops.push({ name, props, seamless, area: r.width * r.height, dur: t.duration });
          } });
        /* no forbidden properties anywhere in the document's keyframes or on animated elements */
        for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } for (const rule of rules) if (rule.type === CSSRule.KEYFRAMES_RULE) for (const k of rule.cssRules) { const txt = k.style.cssText; if (/filter|blur|blend|shadow|clip/.test(txt)) out.forbidden.push(rule.name + ': ' + txt); } }
        const all = document.querySelectorAll('*'); let bad = 0; all.forEach(e => { const cs = getComputedStyle(e); if ((cs.filter !== 'none') || (cs.backdropFilter && cs.backdropFilter !== 'none') || cs.mixBlendMode !== 'normal') bad++; }); out.badStyle = bad;
        return out; });
      r.fin.forEach(a => { a.props.forEach(x => rep.props.add(x)); if (a.end > rep.longestEntrance[0]) rep.longestEntrance = [a.end, s + '/' + l]; if (a.end > 1200) rep.bad.push(`${s}/${l} entrance ${a.end}`); });
      r.loops.forEach(a => { a.props.forEach(x => rep.props.add(x)); kinds.add(a.name); if (!a.seamless) rep.bad.push(`${s}/${l} loop ${a.name} not seamless`); });
      if (r.forbidden.length) rep.bad.push(`${s} forbidden keyframe props: ${r.forbidden.join(' | ')}`);
      if (r.badStyle) rep.bad.push(`${s}/${l} filter/blend present on ${r.badStyle} elements`);
      maxLoops = Math.max(maxLoops, r.loops.length); maxArea = Math.max(maxArea, r.loops.reduce((q, a) => q + a.area, 0));
    }
    rep.perStyle[s] = { movingLayers: maxLoops, loopKinds: [...kinds].join(','), loopLayerMB_at4K: +(maxArea * 2.4 * 2.4 * 4 / 1048576).toFixed(0) };
  }
  console.log('longest entrance ms', rep.longestEntrance, '| animated props:', [...rep.props].sort().join(','), '| problems:', rep.bad.length); if (rep.bad.length) console.log([...new Set(rep.bad.map(x => x.replace(/\/\w+ /, ' ')))].join('\n'));
  console.table(rep.perStyle); require('fs').writeFileSync('qa/motion.json', JSON.stringify(rep.perStyle, null, 1)); await b.close(); })();
