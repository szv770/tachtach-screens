import React, { useEffect, useMemo, useState } from 'react';
import { useDesign } from '../../design/DesignRoot.jsx';
import { board, plan, planSeconds, summary, normalizeSettings } from '../../../shared/averages.js';
import { Stage } from './averages/Stage.jsx';
import { SpotAct, PodiumAct, ListAct, ImprovedAct, TracksAct } from './averages/acts.jsx';

/**
 * Test Averages (a Gemoro / Girsa test program). plan() (shared/averages.js) gives the acts in order:
 *
 *   list      THE show: one ordered list (everyone over the minimum, highest average first) in 2 or 3 columns, a few
 *             pages, every name the same card
 *   spot / podium / improved / tracks   extra acts, OFF until the school turns them on (they play before the list)
 *
 * averages/Stage.jsx keeps the backdrop, the Hebrew heading, the progress bar and the footer and changes the page with a
 * designed transition (cube / cards / door / carousel / tilt / sweep / flip / zoom / curtain / rise); averages/acts.jsx
 * draws the acts; averages/parts.jsx holds the small parts. Every motion plays once and settles; Minimal and reduced motion
 * show the settled page. Roles and font roles only. The slide steps through its acts itself and asks the rotation for the
 * time it needs.
 */

const ACTS = { spot: SpotAct, podium: PodiumAct, list: ListAct, improved: ImprovedAct, tracks: TracksAct };

export default function AveragesSlide({ data, portrait: portraitProp, onRequestDuration, slide }) {
  const design = useDesign();
  const portrait = portraitProp ?? design.portrait;
  const file = useMemo(() => (data && data.students ? { settings: data.settings, students: data.students } : null), [data]);
  const steps = useMemo(() => { try { return file ? plan(file, { portrait }) : []; } catch { return []; } }, [file, portrait]);
  const rows = useMemo(() => { try { return file ? board(file) : []; } catch { return []; } }, [file]);
  const s = useMemo(() => normalizeSettings(file?.settings), [file]);
  const sum = useMemo(() => summary(rows), [rows]);
  // each student's scores, for the spotlight's "latest tests" bars
  const scores = useMemo(() => Object.fromEntries((file?.students || []).map((st) => [st.id, st.scores || []])), [file]);

  const n = steps.length;
  const [turn, setTurn] = useState(0); // counts act changes; the act on stage is turn % n
  const key = steps.map((x) => `${x.t}${x.page ?? ''}:${x.rows?.length ?? x.cols?.length}`).join('|');
  useEffect(() => { setTurn(0); }, [key]);

  const total = planSeconds(steps);
  const base = Number(slide?.duration) || 0;
  useEffect(() => { if (n > 1 && onRequestDuration && total > base) onRequestDuration(total); }, [total, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = n ? turn % n : 0;
  const seconds = n ? steps[step].s + 1 : 0; // + 1 s for the transition, as planSeconds() counts it
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setTimeout(() => setTurn((x) => x + 1), seconds * 1000);
    return () => clearTimeout(t);
  }, [turn, n < 2, seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!n) return null;
  const top = rows[0]?.avg || 100;
  const low = rows.length ? rows[rows.length - 1].avg : 0;
  // rows per column the fullest list page needs (never more than plan()'s perCol): the same on every page
  const perCol = Math.max(1, ...steps.filter((x) => x.t === 'list').map((x) => Math.ceil(x.rows.length / x.cols)));
  const renderAct = (act, { delay }) => {
    const Act = ACTS[act.t];
    return Act ? <Act act={act} s={s} portrait={portrait} delay={delay} scores={scores} top={top} low={low} perCol={perCol} /> : null;
  };
  return <Stage s={s} portrait={portrait} steps={steps} step={step} turn={turn} sum={sum} renderAct={renderAct} />;
}
