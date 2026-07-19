import React, { useState, useRef, useEffect } from 'react';
import { colors, adminFonts, inputStyle, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

/**
 * NumberField — a number input that doesn't fight the user.
 *
 * Why this exists: the old pattern (`<input type="number" value={x}
 * onChange={e => save(Number(e.target.value) || 0)}>`) had three bugs:
 *   1. It PUT to the server on every keystroke — racing responses reverted
 *      what you were typing, and fast typing tripped the API rate limit.
 *   2. `Number(v) || 0` snapped a cleared field back to 0 instantly, so you
 *      could never type a multi-digit number naturally.
 *   3. The backing state only updated after the network round-trip, so React
 *      reverted keystrokes in the meantime (typing "45" produced "1545").
 *
 * This component keeps a local draft while focused and only calls
 * `onCommit(n)` once, on blur or Enter, with the value clamped to [min, max].
 * Escape cancels the edit. Empty/invalid input reverts to the previous value.
 * Uses type="text" + inputMode="numeric" so mobile keyboards show digits but
 * there are no native spinners cramping tiny inputs and no scroll-wheel
 * value hijacking.
 */
export function NumberField({ value, onCommit, min = 0, max = 9999, style, title, disabled, ariaLabel, placeholder }) {
  const [draft, setDraft] = useState(null); // null = not editing → show prop value
  const cancelRef = useRef(false);

  const shown = draft !== null ? draft : (value === undefined || value === null ? '' : String(value));

  const commit = () => {
    const d = draft;
    setDraft(null);
    if (cancelRef.current) { cancelRef.current = false; return; }
    if (d === null) return;
    const n = Math.round(Number(d));
    if (d.trim() === '' || Number.isNaN(n)) return; // revert to previous value
    const clamped = Math.min(max, Math.max(min, n));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={shown}
      title={title}
      aria-label={ariaLabel || title}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={(e) => {
        setDraft(value === undefined || value === null ? '' : String(value));
        e.target.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        if (/^\d*$/.test(v)) setDraft(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelRef.current = true;
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = e.key === 'ArrowUp' ? 1 : -1;
          setDraft(d => {
            const base = Number(d !== null && d !== '' ? d : value) || 0;
            return String(Math.min(max, Math.max(min, base + delta)));
          });
        }
      }}
      // Guard against draggable ancestors hijacking text selection
      onDragStart={(e) => e.preventDefault()}
      style={{ ...inputStyle, ...style }}
    />
  );
}

/**
 * DraftTextInput — a text input that edits locally and commits once on
 * blur/Enter, instead of saving to the server on every keystroke.
 * Escape cancels the edit.
 */
export function DraftTextInput({ value, onCommit, style, title, placeholder, disabled, ariaLabel, dir }) {
  const [draft, setDraft] = useState(null);
  const cancelRef = useRef(false);

  const shown = draft !== null ? draft : (value || '');

  const commit = () => {
    const d = draft;
    setDraft(null);
    if (cancelRef.current) { cancelRef.current = false; return; }
    if (d === null) return;
    if (d !== (value || '')) onCommit(d);
  };

  return (
    <input
      type="text"
      value={shown}
      title={title}
      aria-label={ariaLabel || title}
      placeholder={placeholder}
      disabled={disabled}
      dir={dir}
      onFocus={() => setDraft(value || '')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelRef.current = true;
          e.currentTarget.blur();
        }
      }}
      onDragStart={(e) => e.preventDefault()}
      style={{ ...inputStyle, ...style }}
    />
  );
}

/**
 * ConfirmDialog — lightweight confirmation modal for destructive actions.
 * Closes on outside click and Escape; confirm button gets initial focus
 * so Enter confirms and Tab cycles sensibly.
 */
export function ConfirmDialog({ title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    // lock background scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return (
    <div
      onClick={onCancel}
      role="presentation"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(10,8,5,0.65)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        animation: 'ttFadeIn .15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Confirm'}
        className="tt-card"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.goldBd}`,
          borderRadius: '10px',
          padding: '22px 24px',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,.55)',
          animation: 'ttPopIn .16s ease-out',
        }}
      >
        {title && (
          <h4 style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            margin: '0 0 8px',
          }}>
            {title}
          </h4>
        )}
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '14px',
          color: colors.dim,
          margin: '0 0 20px',
          lineHeight: 1.55,
        }}>
          {message}
        </p>
        {/* Mobile: stacked full-width 44px buttons (confirm on top); desktop: right-aligned row */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          gap: '10px',
          justifyContent: 'flex-end',
        }}>
          <button
            style={{ ...buttonSecondary, minHeight: isMobile ? '44px' : '38px', width: isMobile ? '100%' : undefined }}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            style={{
              ...(danger ? buttonDanger : buttonSecondary),
              minHeight: isMobile ? '44px' : '38px',
              width: isMobile ? '100%' : undefined,
              ...(danger ? {} : { borderColor: colors.gold, color: colors.gold }),
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
