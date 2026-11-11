import React, { useEffect, useMemo, useState } from 'react';
import { useDesign } from '../../design/DesignRoot.jsx';
import { board, plan, planSeconds, summary, normalizeSettings } from '../../../shared/averages.js';
import { Stage } from './averages/Stage.jsx';
import { SpotAct, PodiumAct, BoardAct, ImprovedAct, TracksAct, ScrollAct } from './averages/acts.jsx';

/**
 * Test Averages (a Gemoro / Girsa test program) as a staged show. plan() (shared/averages.js) gives the acts in order:
 *
 *   spot x3   the top three, one at a time (3rd, 2nd, then the leader with a crown and a burst of sparkles)
 *   podium    the three together
 *   board     leaderboard pages: few rows, big names
 *   improved  the climbers            tracks  the top of each track
 *   scroll    everyone else, one smooth pass
 *
 * averages/Stage.jsx keeps the backdrop, header, progress bar and footer and changes the act with a designed transition
 * (sweep / zoom / rise / flip / curtain); averages/acts.jsx draws the acts; averages/parts.jsx holds the avatar, laurel,
 * crown, chips and count-up. Alive without looping: every motion plays once and settles; Minimal and reduced motion show the
 * settled act. Roles and font roles only. The slide steps through its acts itself and asks the rotation for the time it needs.
 */

const ACTS = { spot: SpotAct, podium: PodiumAct, board: BoardAct, improved: ImprovedAct, tracks: TracksAct, scroll: ScrollAct };

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
  const renderAct = (act, { delay }) => {
    const Act = ACTS[act.t];
    return Act ? <Act act={act} s={s} portrait={portrait} delay={delay} scores={scores} top={top} /> : null;
  };
  return <Stage s={s} portrait={portrait} steps={steps} step={step} turn={turn} sum={sum} renderAct={renderAct} />;
}
