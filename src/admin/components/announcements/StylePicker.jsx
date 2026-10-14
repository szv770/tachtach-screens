import React, { useDeferredValue, useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import DesignRoot from '../../../screen/design/DesignRoot.jsx';
import { StageBox } from '../../../screen/takeover/TakeoverStage.jsx';
import { resolveActiveTheme } from '../../../shared/dayNight.js';
import { hasText } from '../../../shared/announcements.js';
import { toItem, sampleFor } from '../../../shared/takeoverSamples.js';
import { STYLE_PICKER_GROUPS } from './helpers.js';

/**
 * Grouped style picker (round 3b): a "Theme" chip plus the 26 styles in five
 * groups (Everyday, Alerts, Moments, Shabbos & Yom Tov, Seasonal). The group
 * you open shows live thumbnails drawn by the real takeover stage (animation
 * off, scaled to ~160 px) using the announcement's own text, or a sample when
 * the form is still empty, so each tile shows exactly what that style does.
 */

const STAGE_LAYOUT = { quicktime: 'quick', classic: 'bigwords' };

function thumbItem(item, styleId, layout) {
  const filled = hasText({ ...item, display: 'takeover' });
  const base = filled ? item : toItem(styleId, STAGE_LAYOUT[layout] || layout, sampleFor(styleId, STAGE_LAYOUT[layout] || layout));
  return { ...base, id: `thumb-${styleId}`, look: { ...base.look, style: styleId, animation: 'off', layout: base.look?.layout || layout } };
}

function Tile({ option, selected, onPick, item, layout }) {
  const it = useMemo(() => thumbItem(item, option.value, layout), [item, option.value, layout]);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onPick(option.value)}
      title={option.desc}
      style={{
        padding: '5px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', minWidth: 0,
        border: `1px solid ${selected ? colors.gold : colors.border}`,
        background: selected ? colors.goldBg : 'transparent',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: '4px', overflow: 'hidden', pointerEvents: 'none' }}>
        <StageBox item={it} mode="fit" showClock={false} entrance={false} />
      </div>
      <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: selected ? colors.gold : colors.text, marginTop: '5px', fontWeight: 600 }}>{option.label}</div>
      <div style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim, lineHeight: 1.3 }}>{option.desc}</div>
    </button>
  );
}

export default function StylePicker({ value, onChange, item: liveItem, layout, settings }) {
  const item = useDeferredValue(liveItem);
  const current = value || '';
  const startGroup = STYLE_PICKER_GROUPS.find((g) => g.ids.includes(current))?.id || (current ? 'everyday' : 'theme');
  const [group, setGroup] = useState(startGroup);
  const themeId = useMemo(() => resolveActiveTheme(settings || {}, {}, new Date()).themeId, [settings]);
  const active = STYLE_PICKER_GROUPS.find((g) => g.id === group);

  const chip = (id, label, count) => {
    const on = group === id;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => setGroup(id)}
        style={{
          flex: '0 0 auto', padding: '7px 12px', minHeight: '38px', borderRadius: '18px', cursor: 'pointer',
          border: `1px solid ${on ? colors.gold : colors.border}`, background: on ? colors.goldBg : 'transparent',
          color: on ? colors.gold : colors.text, fontFamily: adminFonts.englishBody, fontSize: '13px', whiteSpace: 'nowrap',
        }}
      >
        {label}{count != null ? ` · ${count}` : ''}
      </button>
    );
  };

  return (
    <div>
      <div role="tablist" aria-label="Style groups" style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px', WebkitOverflowScrolling: 'touch' }}>
        {chip('theme', 'Theme')}
        {STYLE_PICKER_GROUPS.map((g) => chip(g.id, g.label, g.ids.length))}
      </div>
      {group === 'theme' ? (
        <div role="radiogroup" aria-label="Style" style={{ display: 'flex' }}>
          <button
            type="button"
            role="radio"
            aria-checked={!current}
            onClick={() => onChange('')}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', minHeight: '56px',
              border: `1px solid ${!current ? colors.gold : colors.border}`, background: !current ? colors.goldBg : 'transparent',
              fontFamily: adminFonts.englishBody, color: !current ? colors.gold : colors.text, fontSize: '14px',
            }}
          >
            Theme (no style)
            <div style={{ fontSize: '12px', color: colors.dim }}>The screen&rsquo;s own colours. Takeovers and slides draw it as Classic.</div>
          </button>
        </div>
      ) : (
        <DesignRoot settings={settings || {}} themeId={themeId} style={{ display: 'contents' }}>
          <div role="radiogroup" aria-label="Style" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
            {active.options.map((o) => (
              <Tile key={o.value} option={o} selected={current === o.value} onPick={onChange} item={item} layout={layout} />
            ))}
          </div>
        </DesignRoot>
      )}
    </div>
  );
}
