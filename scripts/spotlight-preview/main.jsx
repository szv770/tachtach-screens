/**
 * Spotlight preview (dev only). Query parameters:
 *   view = count | seal | day | act:happened | act:history | act:vort | act:photo | act:story   (default count)
 *   type = flip | ring | journey | glow | calendar | meter | sleeps | odometer                   (default flip)
 *   stage = announce | month | twoWeeks | week | eve | lastHour | day
 *   lang = both | english | hebrew   theme = any theme id (dark, parchment, ...)   tier = major | notable | none
 *   motion = smooth | minimal | lively   photo = 0|1   long = 1 (worst-case long name/story)   live = 0 (freeze the clock)
 *   now = epoch ms (default: a fixed Monday 2026-11-16 10:00 local)   cycle = 1 (every type in turn, 6 s each)
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/screen/design/fonts.js';
import DesignRoot from '../../src/screen/design/DesignRoot.jsx';
import Spotlight from '../../src/screen/spotlight/Spotlight.jsx';
import { fixtureModel } from '../../src/screen/spotlight/fixture.js';
import { TYPE_IDS } from '../../src/screen/spotlight/model.js';

const q = new URLSearchParams(location.search);
const get = (k, d) => q.get(k) ?? d;
const NOW = Number(get('now', '')) || new Date(2026, 10, 16, 10, 0, 0).getTime();

function parseView(v, type) {
  if (v === 'seal') return { kind: 'seal' };
  if (v === 'day') return { kind: 'day' };
  if (v.startsWith('act:')) return { kind: 'act', act: v.slice(4) };
  return { kind: 'count', type };
}

function App() {
  const [i, setI] = useState(0);
  const cycle = get('cycle', '') === '1';
  useEffect(() => { if (!cycle) return undefined; const t = setInterval(() => setI((x) => x + 1), 6000); return () => clearInterval(t); }, [cycle]);
  const type = cycle ? TYPE_IDS[i % TYPE_IDS.length] : get('type', 'flip');
  const view = parseView(get('view', 'count'), type);
  const stage = view.kind === 'day' ? 'day' : get('stage', 'month');
  const sp = fixtureModel({ stage, nowMs: NOW, lang: get('lang', 'both'), tier: get('tier', 'major'), photo: get('photo', '1') !== '0', long: get('long', '') === '1' });
  const settings = { theme: get('theme', 'dark'), motion: get('motion', 'smooth') };
  return (
    <DesignRoot settings={settings} style={{ position: 'absolute', inset: 0 }}>
      <Spotlight key={`${type}|${get('view', 'count')}`} sp={sp} view={view} nowMs={NOW} live={get('live', '1') !== '0'} />
    </DesignRoot>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
