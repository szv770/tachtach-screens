import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { btn, card, h3, small, Chip } from './occKit.jsx';
import { SPOTLIGHT_STAGE_LABEL } from '../../../shared/spotlight.js';
import { KindThumb } from './SpotlightParts.jsx';

/** The Spotlight card at the top of the Countdown page: who is the star now, how far, in which stage, which kinds, what is next. */
export default function SpotlightCard({ model, sp, canEdit, onChange, onStory, onPreview, nameOf }) {
  const on = model.mode === 'spotlight';
  const kinds = on && model.type.id ? model.type.eligible : on ? [] : sp.types.order.filter((t) => !sp.types.off.includes(t));
  const next = on ? model.strip[0] : model.strip[0];
  const nextQueue = on && sp.pick !== 'auto' ? sp.queue.slice(1)[0] : null;
  return (
    <div style={{ ...card, borderColor: colors.accent, display: 'grid', gap: 10 }} data-testid="spot-card">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={{ ...h3, margin: 0, flex: 1 }}>The Spotlight</h3>
        {on && <Chip tone="ok" testId="spot-card-stage">{SPOTLIGHT_STAGE_LABEL[model.stage]}</Chip>}
        <Chip testId="spot-card-mode">{sp.pick === 'auto' ? 'Automatic' : sp.pick === 'pinned' ? 'My choice' : `Line-up of ${sp.queue.length}`}</Chip>
      </div>
      {on ? (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: 22, fontWeight: 800, color: colors.text, overflowWrap: 'anywhere' }} data-testid="spot-card-name">{model.nameEn || model.nameHe}</div>
          {model.nameEn && model.nameHe && <div dir="rtl" style={{ fontSize: 17, color: colors.dim }}>{model.nameHe}</div>}
          <p style={{ ...small, margin: '4px 0 0', color: colors.text }} data-testid="spot-card-line">
            {model.stage === 'day' ? 'Today, happening now' : `${model.days} day${model.days === 1 ? '' : 's'} to go`}{model.begins?.beginsLine ? ` · ${model.begins.beginsLine}` : ''}
          </p>
        </div>
      ) : <p style={{ ...small, margin: 0, color: colors.text }} data-testid="spot-card-none">No day is close enough, so the Countdown skips itself. Nothing is wrong: it comes back when a day is near.</p>}
      {kinds.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: colors.accent }} aria-label="Kinds of countdown it takes turns with" data-testid="spot-card-kinds">
          {kinds.map((k) => <span key={k} title={k} style={{ border: `1px solid ${colors.line}`, borderRadius: 8, padding: '4px 6px', background: colors.sunken }}><KindThumb id={k} size={40} /></span>)}
        </div>
      )}
      {(nextQueue || next) && (
        <p style={{ ...small, margin: 0 }} data-testid="spot-card-next">
          Next: <strong style={{ color: colors.text }}>{nextQueue ? `${nameOf ? nameOf(nextQueue.id) : nextQueue.id} (line-up)` : next.nameEn || next.nameHe}</strong>{!nextQueue && next ? ` in ${next.days} day${next.days === 1 ? '' : 's'}` : ''}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canEdit && <button type="button" style={btn(true)} onClick={() => onChange(1)} data-testid="spot-change">Change</button>}
        {canEdit && <button type="button" style={btn(false)} onClick={() => onStory(3)} data-testid="spot-edit-story" disabled={!on}>Edit the story</button>}
        <button type="button" style={btn(false)} onClick={onPreview} data-testid="spot-preview-btn" disabled={!on}>Preview</button>
      </div>
    </div>
  );
}
