import React, { useState, useRef, useEffect } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { ICON_OPTIONS, ScheduleIcon } from '../../shared/ScheduleIcons.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const ALERT_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: '1 min' },
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
];

const ALERT_DISPLAY_OPTIONS = [
  { value: 'slide', label: 'Slide' },
  { value: 'takeover', label: 'Takeover' },
];

// ICON_OPTIONS is imported from shared/ScheduleIcons.jsx

const DEFAULT_CATEGORIES = [
  { id: 'davening', name: 'Davening', color: '#D4A84B' },
  { id: 'learning', name: 'Learning', color: '#2DD4BF' },
  { id: 'meals', name: 'Meals', color: '#F97316' },
  { id: 'events', name: 'Events', color: '#A855F7' },
];

const TEMPLATE_ENTRIES = [
  { name: 'Shacharis', nameHe: '', time: '07:00', endTime: '', category: 'davening', days: [...DAYS], alertBefore: 5, alertDisplay: 'slide', enabled: true },
  { name: 'Breakfast', nameHe: '', time: '08:15', endTime: '', category: 'meals', days: [...WEEKDAYS], alertBefore: 0, alertDisplay: 'slide', enabled: true },
  { name: 'First Seder', nameHe: '', time: '09:00', endTime: '12:30', category: 'learning', days: [...WEEKDAYS], alertBefore: 5, alertDisplay: 'slide', enabled: true },
  { name: 'Lunch', nameHe: '', time: '12:30', endTime: '', category: 'meals', days: [...WEEKDAYS], alertBefore: 0, alertDisplay: 'slide', enabled: true },
  { name: 'Mincha', nameHe: '', time: '13:30', endTime: '', category: 'davening', days: [...DAYS], alertBefore: 5, alertDisplay: 'slide', enabled: true },
  { name: 'Second Seder', nameHe: '', time: '14:00', endTime: '17:30', category: 'learning', days: [...WEEKDAYS], alertBefore: 5, alertDisplay: 'slide', enabled: true },
  { name: 'Maariv', nameHe: '', time: '19:00', endTime: '', category: 'davening', days: [...DAYS], alertBefore: 5, alertDisplay: 'slide', enabled: true },
  { name: 'Night Seder', nameHe: '', time: '20:00', endTime: '22:00', category: 'learning', days: [...WEEKDAYS], alertBefore: 0, alertDisplay: 'slide', enabled: true },
];

function ToggleSwitch({ on, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: '10px',
        background: on ? colors.gold : colors.muted,
        position: 'relative', cursor: 'pointer',
        transition: 'background .2s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '8px',
        background: colors.bg, position: 'absolute',
        top: 2, left: on ? 18 : 2, transition: 'left .2s',
      }} />
    </div>
  );
}

function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function CategoryDot({ color, size = 10 }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
    }} />
  );
}

const emptyForm = () => ({
  name: '', nameHe: '', time: '', endTime: '',
  category: '', days: [...WEEKDAYS],
  alertBefore: 0, alertDisplay: 'slide', enabled: true,
  icon: '',
});

// ─── Category Manager ─────────────────────────────────────────────

function IconPicker({ value, onChange, label = 'Icon' }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>{label}</label>
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        style={{
          ...inputStyle,
          marginTop: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: '70px',
          textAlign: 'left',
        }}
      >
        {value ? (
          <ScheduleIcon iconKey={value} size={18} color={colors.text} />
        ) : (
          <span style={{ color: colors.muted, fontSize: '13px' }}>None</span>
        )}
      </button>
      {showPicker && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 100,
          background: colors.surface,
          border: `1px solid ${colors.muted}`,
          borderRadius: '6px',
          padding: '8px',
          marginTop: '4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          minWidth: '260px',
        }}>
          {ICON_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => { onChange(opt.value); setShowPicker(false); }}
              title={opt.label}
              style={{
                background: value === opt.value ? colors.goldBg : 'transparent',
                border: value === opt.value ? `1px solid ${colors.gold}` : `1px solid transparent`,
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '34px',
                minHeight: '34px',
                color: colors.dim,
                fontFamily: adminFonts.englishBody,
              }}
            >
              {opt.value ? (
                <ScheduleIcon iconKey={opt.value} size={20} color={value === opt.value ? colors.gold : colors.dim} />
              ) : (
                <span style={{ fontSize: '11px' }}>{'\u2013'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryManager({ categories, onUpdate, isMobile }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#D4A84B');
  const [newIcon, setNewIcon] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    const id = newName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const cat = { id, name: newName.trim(), color: newColor };
    if (newIcon) cat.icon = newIcon;
    onUpdate([...categories, cat]);
    setNewName('');
    setNewColor('#D4A84B');
    setNewIcon('');
  };

  const handleDelete = (id) => {
    onUpdate(categories.filter(c => c.id !== id));
  };

  const handleCategoryIconChange = (catId, icon) => {
    onUpdate(categories.map(c => c.id === catId ? { ...c, icon: icon || undefined } : c));
  };

  return (
    <div style={{
      background: colors.surface,
      borderRadius: '4px',
      border: `1px solid ${colors.muted}`,
      padding: '18px 20px',
      marginBottom: '16px',
    }}>
      <h3 style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '15px',
        color: colors.text,
        marginBottom: '14px',
      }}>
        Categories
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
        {categories.map(cat => (
          <div key={cat.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 10px',
            background: colors.bg,
            borderRadius: '4px',
          }}>
            <CategoryDot color={cat.color} size={12} />
            {cat.icon && (
              <span style={{ lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                <ScheduleIcon iconKey={cat.icon} size={16} color={cat.color || colors.text} />
              </span>
            )}
            <span style={{
              flex: 1,
              fontFamily: adminFonts.englishBody,
              fontSize: '14px',
              color: colors.text,
            }}>
              {cat.name}
            </span>
            <IconPicker
              value={cat.icon || ''}
              onChange={(icon) => handleCategoryIconChange(cat.id, icon)}
              label=""
            />
            <button
              onClick={() => handleDelete(cat.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.danger,
                fontSize: '18px',
                cursor: 'pointer',
                padding: '0 4px',
                minWidth: '32px',
                minHeight: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {'\u00D7'}
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.muted, padding: '8px 0', textAlign: 'center' }}>
            No categories
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div style={{ flex: 1, minWidth: '120px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            style={{ ...inputStyle, marginTop: '4px' }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Color</label>
          <div style={{ marginTop: '4px' }}>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              style={{
                width: '40px',
                height: '38px',
                border: `1px solid ${colors.muted}`,
                borderRadius: '4px',
                background: colors.surface,
                cursor: 'pointer',
                padding: '2px',
              }}
            />
          </div>
        </div>
        <IconPicker value={newIcon} onChange={setNewIcon} />
        <button
          style={{ ...buttonPrimary, minHeight: '38px' }}
          onClick={handleAdd}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// ─── Entry Form ───────────────────────────────────────────────────

function EntryForm({ form, setForm, categories, onSubmit, onCancel, submitting, submitLabel, isMobile }) {
  const allSelected = DAYS.every(d => form.days.includes(d));
  const weekdaysSelected = WEEKDAYS.every(d => form.days.includes(d)) && !form.days.includes('Shabbos');

  const toggleDay = (day) => {
    setForm(f => ({
      ...f,
      days: f.days.includes(day)
        ? f.days.filter(d => d !== day)
        : [...f.days, day],
    }));
  };

  const setDays = (dayList) => {
    setForm(f => ({ ...f, days: [...dayList] }));
  };

  return (
    <div style={{
      padding: '20px',
      background: colors.surface,
      borderRadius: '4px',
      border: `1px solid ${colors.muted}`,
    }}>
      {/* Name */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '12px',
        marginBottom: '14px',
      }}>
        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Entry name"
            style={{ ...inputStyle, marginTop: '4px' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
            Name (Hebrew) <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
          </label>
          <input
            type="text"
            value={form.nameHe}
            onChange={(e) => setForm(f => ({ ...f, nameHe: e.target.value }))}
            placeholder="Optional Hebrew name"
            style={{ ...inputStyle, marginTop: '4px', direction: 'rtl' }}
          />
        </div>
      </div>

      {/* Time + End Time + Category */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr',
        gap: '12px',
        marginBottom: '14px',
      }}>
        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Time</label>
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
            style={{ ...inputStyle, marginTop: '4px' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
            End Time <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
          </label>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm(f => ({ ...f, endTime: e.target.value }))}
            style={{ ...inputStyle, marginTop: '4px' }}
          />
        </div>
        <div style={isMobile ? { gridColumn: '1 / -1' } : {}}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
            style={{ ...inputStyle, marginTop: '4px' }}
          >
            <option value="">-- Select --</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Days */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '8px',
          flexWrap: 'wrap',
        }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Days</label>
          <button
            onClick={() => setDays(WEEKDAYS)}
            style={{
              ...buttonSecondary,
              padding: '2px 10px',
              fontSize: '11px',
              background: weekdaysSelected ? colors.goldBg : 'transparent',
              borderColor: weekdaysSelected ? colors.gold : colors.muted,
              color: weekdaysSelected ? colors.gold : colors.dim,
            }}
          >
            Weekdays
          </button>
          <button
            onClick={() => setDays(DAYS)}
            style={{
              ...buttonSecondary,
              padding: '2px 10px',
              fontSize: '11px',
              background: allSelected ? colors.goldBg : 'transparent',
              borderColor: allSelected ? colors.gold : colors.muted,
              color: allSelected ? colors.gold : colors.dim,
            }}
          >
            All
          </button>
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {DAYS.map(day => {
            const active = form.days.includes(day);
            return (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                style={{
                  ...buttonSecondary,
                  padding: '6px 12px',
                  fontSize: '12px',
                  minWidth: isMobile ? '60px' : '70px',
                  background: active ? colors.goldBg : 'transparent',
                  borderColor: active ? colors.gold : colors.muted,
                  color: active ? colors.gold : colors.dim,
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Alert settings + Icon */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
        gap: '12px',
        marginBottom: '14px',
        alignItems: 'end',
      }}>
        <div>
          <label title="Show an alert on-screen this many minutes before the entry's start time" style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Alert Before</label>
          <select
            value={form.alertBefore}
            onChange={(e) => setForm(f => ({ ...f, alertBefore: Number(e.target.value) }))}
            style={{ ...inputStyle, marginTop: '4px' }}
          >
            {ALERT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label title="Slide — adds a brief alert slide in the carousel. Takeover — interrupts the screen with a full-screen overlay." style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Alert Type</label>
          <select
            value={form.alertDisplay}
            onChange={(e) => setForm(f => ({ ...f, alertDisplay: e.target.value }))}
            style={{ ...inputStyle, marginTop: '4px' }}
          >
            <option value="slide">Slide (brief, in carousel)</option>
            <option value="takeover">Takeover (full-screen)</option>
          </select>
        </div>
        <IconPicker
          value={form.icon}
          onChange={(icon) => setForm(f => ({ ...f, icon }))}
          label="Icon (override)"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '38px' }}>
          <ToggleSwitch on={form.enabled} onChange={() => setForm(f => ({ ...f, enabled: !f.enabled }))} />
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Enabled</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          style={{ ...buttonPrimary, opacity: submitting ? 0.6 : 1, minHeight: '44px' }}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button
            style={{ ...buttonSecondary, minHeight: '44px' }}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Default Built-in Template ───────────────────────────────────

const DEFAULT_YESHIVA_TEMPLATE = {
  id: '__default_yeshiva',
  name: 'Standard Yeshiva Day',
  entries: TEMPLATE_ENTRIES,
  categories: DEFAULT_CATEGORIES,
  builtIn: true,
};

// ─── Confirm Dialog ──────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel, isMobile }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        padding: isMobile ? '16px' : '0',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface,
          border: `1px solid ${colors.muted}`,
          borderRadius: '6px',
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '14px',
          color: colors.text,
          marginBottom: '20px',
          lineHeight: '1.5',
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button style={{ ...buttonSecondary, minHeight: '38px' }} onClick={onCancel}>
            Cancel
          </button>
          <button style={{ ...buttonDanger, minHeight: '38px' }} onClick={onConfirm}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Manager ────────────────────────────────────────────

function TemplateManager({
  entries, categories, savedTemplates, onFetchTemplates,
  onSaveTemplate, onDeleteTemplate, onUpdateTemplate, onLoadTemplate, isMobile,
}) {
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState(null);
  const [confirmUpdate, setConfirmUpdate] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const renameInputRef = useRef(null);

  // Fetch templates on mount (panel starts expanded)
  useEffect(() => {
    if (!fetched) {
      onFetchTemplates();
      setFetched(true);
    }
  }, [fetched, onFetchTemplates]);

  const allTemplates = [DEFAULT_YESHIVA_TEMPLATE, ...savedTemplates];

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const result = await onSaveTemplate(saveName.trim(), entries, categories);
      if (result) {
        setSaveName('');
        setShowSaveInput(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (template) => {
    setLoading(true);
    try {
      await onLoadTemplate(template.entries, template.categories);
    } finally {
      setLoading(false);
      setConfirmLoad(null);
    }
  };

  const handleRenameStart = (tmpl) => {
    setRenamingId(tmpl.id);
    setRenameValue(tmpl.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleRenameSubmit = async () => {
    if (!renameValue.trim() || !renamingId) return;
    await onUpdateTemplate(renamingId, { name: renameValue.trim() });
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleUpdateContent = async (tmpl) => {
    await onUpdateTemplate(tmpl.id, { entries, categories });
    setConfirmUpdate(null);
  };

  return (
    <div style={{
      background: colors.surface,
      borderRadius: '4px',
      border: `1px solid ${colors.muted}`,
      marginBottom: '16px',
    }}>
      {/* Header / toggle */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <h3 style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '15px',
          color: colors.text,
          margin: 0,
        }}>
          Schedule Templates
        </h3>
        <span style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '12px',
          color: colors.dim,
        }}>
          {expanded ? '\u25B2' : '\u25BC'} {allTemplates.length} template{allTemplates.length !== 1 ? 's' : ''}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 20px 18px' }}>
          {/* Template list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            {allTemplates.map((tmpl) => (
              <div key={tmpl.id} style={{
                display: 'flex',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? '8px' : '10px',
                padding: '10px 12px',
                background: colors.bg,
                borderRadius: '4px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renamingId === tmpl.id ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit();
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                      onBlur={handleRenameSubmit}
                      style={{ ...inputStyle, fontSize: '14px', padding: '4px 8px' }}
                    />
                  ) : (
                    <div style={{
                      fontFamily: adminFonts.englishBody,
                      fontSize: '14px',
                      color: colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {tmpl.name}
                      {tmpl.builtIn && (
                        <span style={{
                          fontFamily: adminFonts.englishBody,
                          fontSize: '10px',
                          color: colors.gold,
                          marginLeft: '8px',
                          padding: '1px 6px',
                          border: `1px solid ${colors.goldBd}`,
                          borderRadius: '3px',
                          background: colors.goldBg,
                        }}>
                          DEFAULT
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '11px',
                    color: colors.dim,
                    marginTop: '2px',
                  }}>
                    {tmpl.entries.length} entr{tmpl.entries.length === 1 ? 'y' : 'ies'}
                    {tmpl.categories && tmpl.categories.length > 0 && (
                      <> &middot; {tmpl.categories.length} categor{tmpl.categories.length === 1 ? 'y' : 'ies'}</>
                    )}
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  gap: '6px',
                  flexShrink: 0,
                  flexWrap: 'wrap',
                  alignSelf: isMobile ? 'flex-end' : 'center',
                }}>
                  <button
                    style={{
                      ...buttonPrimary,
                      padding: '4px 14px',
                      fontSize: '12px',
                      minHeight: '32px',
                      opacity: loading ? 0.6 : 1,
                    }}
                    disabled={loading}
                    onClick={() => setConfirmLoad(tmpl)}
                  >
                    Load
                  </button>
                  {!tmpl.builtIn && (
                    <>
                      <button
                        style={{
                          ...buttonSecondary,
                          padding: '4px 10px',
                          fontSize: '12px',
                          minHeight: '32px',
                        }}
                        onClick={() => handleRenameStart(tmpl)}
                        title="Rename template"
                      >
                        Rename
                      </button>
                      <button
                        style={{
                          ...buttonSecondary,
                          padding: '4px 10px',
                          fontSize: '12px',
                          minHeight: '32px',
                        }}
                        onClick={() => setConfirmUpdate(tmpl)}
                        disabled={entries.length === 0}
                        title="Overwrite this template with the current schedule"
                      >
                        Update
                      </button>
                      <button
                        style={{
                          ...buttonDanger,
                          padding: '4px 10px',
                          fontSize: '12px',
                          minHeight: '32px',
                        }}
                        onClick={() => onDeleteTemplate(tmpl.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Save current as template */}
          {!showSaveInput ? (
            <button
              style={{ ...buttonSecondary, fontSize: '13px', minHeight: '38px' }}
              onClick={() => setShowSaveInput(true)}
              disabled={entries.length === 0}
              title={entries.length === 0 ? 'Add schedule entries first' : ''}
            >
              Save Current Schedule as Template
            </button>
          ) : (
            <div style={{
              display: 'flex',
              gap: '8px',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'flex-end',
            }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
                  Template Name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Friday / Erev Shabbos"
                  style={{ ...inputStyle, marginTop: '4px' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  style={{ ...buttonPrimary, minHeight: '38px', opacity: saving ? 0.6 : 1 }}
                  onClick={handleSave}
                  disabled={saving || !saveName.trim()}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  style={{ ...buttonSecondary, minHeight: '38px' }}
                  onClick={() => { setShowSaveInput(false); setSaveName(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm load dialog */}
      {confirmLoad && (
        <ConfirmDialog
          message={`This will replace your current schedule with "${confirmLoad.name}" (${confirmLoad.entries.length} entries). Continue?`}
          onConfirm={() => handleLoad(confirmLoad)}
          onCancel={() => setConfirmLoad(null)}
          isMobile={isMobile}
        />
      )}

      {/* Confirm update dialog */}
      {confirmUpdate && (
        <ConfirmDialog
          message={`Update '${confirmUpdate.name}' with the current schedule? This will overwrite the saved template.`}
          onConfirm={() => handleUpdateContent(confirmUpdate)}
          onCancel={() => setConfirmUpdate(null)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export default function ScheduleEditor({
  entries = [],
  categories: categoriesProp = [],
  onUpdateEntries,
  onCreateEntry,
  onUpdateEntry,
  onDeleteEntry,
  onUpdateCategories,
  onLoadTemplate,
  savedTemplates = [],
  onFetchTemplates,
  onSaveTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
}) {
  const isMobile = useIsMobile();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const categories = categoriesProp.length > 0 ? categoriesProp : DEFAULT_CATEGORIES;

  const getCategoryColor = (catId) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.color : colors.muted;
  };

  const getCategoryName = (catId) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : '';
  };

  // Sort entries by time
  const sortedEntries = [...entries].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const handleToggle = async (entry) => {
    await onUpdateEntry(entry.id, { ...entry, enabled: !entry.enabled });
  };

  const handleDelete = async (id) => {
    await onDeleteEntry(id);
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setShowCreate(false);
    setForm({
      name: entry.name || '',
      nameHe: entry.nameHe || '',
      time: entry.time || '',
      endTime: entry.endTime || '',
      category: entry.category || '',
      days: entry.days || [...WEEKDAYS],
      alertBefore: entry.alertBefore || 0,
      alertDisplay: entry.alertDisplay || 'slide',
      enabled: entry.enabled !== false,
      icon: entry.icon || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleUpdate = async () => {
    if (!form.name || !form.time) return;
    setUpdating(true);
    try {
      const result = await onUpdateEntry(editingId, {
        name: form.name,
        nameHe: form.nameHe || undefined,
        time: form.time,
        endTime: form.endTime || undefined,
        category: form.category || undefined,
        days: form.days,
        alertBefore: form.alertBefore,
        alertDisplay: form.alertDisplay,
        enabled: form.enabled,
        icon: form.icon || undefined,
      });
      if (result !== false) {
        setEditingId(null);
        setForm(emptyForm());
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.time) return;
    setCreating(true);
    try {
      const result = await onCreateEntry({
        name: form.name,
        nameHe: form.nameHe || undefined,
        time: form.time,
        endTime: form.endTime || undefined,
        category: form.category || undefined,
        days: form.days,
        alertBefore: form.alertBefore,
        alertDisplay: form.alertDisplay,
        enabled: form.enabled,
        icon: form.icon || undefined,
      });
      if (result) {
        setForm(emptyForm());
        setShowCreate(false);
      }
    } finally {
      setCreating(false);
    }
  };

  // Drag reorder
  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOver.current = index; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    const reordered = [...sortedEntries];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, removed);
    dragItem.current = null;
    dragOver.current = null;
    onUpdateEntries(reordered);
  };

  // Mobile reorder
  const handleMoveUp = (index) => {
    if (index <= 0) return;
    const reordered = [...sortedEntries];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    onUpdateEntries(reordered);
  };

  const handleMoveDown = (index) => {
    if (index >= sortedEntries.length - 1) return;
    const reordered = [...sortedEntries];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    onUpdateEntries(reordered);
  };

  const daysLabel = (days) => {
    if (!days || days.length === 0) return '';
    if (days.length === 7) return 'All';
    if (days.length === 6 && !days.includes('Shabbos')) return 'Weekdays';
    return days.map(d => d.slice(0, 2)).join(', ');
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? '10px' : '0',
        marginBottom: '20px',
      }}>
        <div>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold }}>
            Schedule
          </h2>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginTop: '4px' }}>
            Build your daily timetable. Entries appear on the Schedule slide and can trigger alerts before they start.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            style={{ ...buttonPrimary, minHeight: '38px' }}
            onClick={() => {
              setShowCreate(!showCreate);
              setEditingId(null);
              if (!showCreate) setForm(emptyForm());
            }}
          >
            {showCreate ? 'Cancel' : '+ New Entry'}
          </button>
        </div>
      </div>

      {/* Template Manager */}
      <TemplateManager
        entries={entries}
        categories={categories}
        savedTemplates={savedTemplates}
        onFetchTemplates={onFetchTemplates}
        onSaveTemplate={onSaveTemplate}
        onUpdateTemplate={onUpdateTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onLoadTemplate={onLoadTemplate}
        isMobile={isMobile}
      />

      {/* Category Manager */}
      <CategoryManager
        categories={categories}
        onUpdate={onUpdateCategories}
        isMobile={isMobile}
      />

      {/* Create form */}
      {showCreate && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '16px',
            color: colors.text,
            marginBottom: '12px',
          }}>
            New Entry
          </h3>
          <EntryForm
            form={form}
            setForm={setForm}
            categories={categories}
            onSubmit={handleCreate}
            onCancel={() => { setShowCreate(false); setForm(emptyForm()); }}
            submitting={creating}
            submitLabel="Create Entry"
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Edit form */}
      {editingId && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '16px',
            color: colors.text,
            marginBottom: '12px',
          }}>
            Edit Entry
          </h3>
          <EntryForm
            form={form}
            setForm={setForm}
            categories={categories}
            onSubmit={handleUpdate}
            onCancel={handleCancelEdit}
            submitting={updating}
            submitLabel="Save Changes"
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Entry list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {sortedEntries.map((entry, idx) => (
          <div
            key={entry.id || idx}
            draggable={!isMobile}
            onDragStart={!isMobile ? () => handleDragStart(idx) : undefined}
            onDragEnter={!isMobile ? () => handleDragEnter(idx) : undefined}
            onDragEnd={!isMobile ? handleDragEnd : undefined}
            onDragOver={!isMobile ? (e) => e.preventDefault() : undefined}
            style={{
              padding: isMobile ? '10px 12px' : '10px 14px',
              background: editingId === entry.id ? colors.goldBg : colors.surface,
              borderRadius: '4px',
              cursor: isMobile ? 'default' : 'grab',
              opacity: entry.enabled === false ? 0.5 : 1,
              border: editingId === entry.id ? `1px solid ${colors.goldBd}` : '1px solid transparent',
            }}
          >
            {/* Row 1 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '8px' : '12px',
            }}>
              {!isMobile && (
                <span style={{ color: colors.muted, fontSize: '18px', cursor: 'grab', userSelect: 'none' }}>
                  {'\u2261'}
                </span>
              )}
              {isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    style={{
                      background: 'transparent', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                      color: idx === 0 ? colors.muted : colors.dim, fontSize: '14px', padding: '0', lineHeight: 1,
                      opacity: idx === 0 ? 0.3 : 1, minWidth: '20px', minHeight: '20px',
                    }}
                  >{'\u25B2'}</button>
                  <button
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === sortedEntries.length - 1}
                    style={{
                      background: 'transparent', border: 'none', cursor: idx === sortedEntries.length - 1 ? 'default' : 'pointer',
                      color: idx === sortedEntries.length - 1 ? colors.muted : colors.dim, fontSize: '14px', padding: '0', lineHeight: 1,
                      opacity: idx === sortedEntries.length - 1 ? 0.3 : 1, minWidth: '20px', minHeight: '20px',
                    }}
                  >{'\u25BC'}</button>
                </div>
              )}

              <ToggleSwitch on={entry.enabled !== false} onChange={() => handleToggle(entry)} />

              <CategoryDot color={getCategoryColor(entry.category)} />

              {(entry.icon || categories.find(c => c.id === entry.category)?.icon) && (
                <span style={{ lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <ScheduleIcon
                    iconKey={entry.icon || categories.find(c => c.id === entry.category)?.icon}
                    size={16}
                    color={getCategoryColor(entry.category)}
                  />
                </span>
              )}

              <span style={{
                fontFamily: adminFonts.englishBody,
                fontSize: '13px',
                color: colors.gold,
                flexShrink: 0,
                minWidth: isMobile ? '65px' : '80px',
              }}>
                {formatTime12(entry.time)}
                {entry.endTime ? ` - ${formatTime12(entry.endTime)}` : ''}
              </span>

              <span style={{
                flex: 1,
                fontFamily: adminFonts.englishBody,
                fontSize: '14px',
                color: colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {entry.name}
              </span>

              {!isMobile && (
                <>
                  <span style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '11px',
                    color: colors.dim,
                    flexShrink: 0,
                  }}>
                    {daysLabel(entry.days)}
                  </span>
                  {entry.alertBefore > 0 && (
                    <span
                      title={`Alert ${entry.alertBefore} minute${entry.alertBefore > 1 ? 's' : ''} before — ${entry.alertDisplay === 'takeover' ? 'full-screen takeover' : 'slide in carousel'}`}
                      style={{
                        fontFamily: adminFonts.englishBody,
                        fontSize: '11px',
                        color: colors.copper,
                        flexShrink: 0,
                      }}>
                      {entry.alertBefore}m {entry.alertDisplay === 'takeover' ? '⚡' : '▶'}
                    </span>
                  )}
                </>
              )}

              <button
                onClick={() => handleEdit(entry)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: colors.dim,
                  fontSize: '14px',
                  cursor: 'pointer',
                  padding: '0 4px',
                  minWidth: '32px',
                  minHeight: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: adminFonts.englishBody,
                }}
                title="Edit"
              >
                Edit
              </button>

              <button
                onClick={() => handleDelete(entry.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: colors.danger,
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '0 4px',
                  minWidth: '32px',
                  minHeight: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {'\u00D7'}
              </button>
            </div>

            {/* Row 2 (mobile only): days + alert info */}
            {isMobile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
                paddingLeft: '28px',
                flexWrap: 'wrap',
              }}>
                <span style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '11px',
                  color: colors.dim,
                }}>
                  {daysLabel(entry.days)}
                </span>
                {entry.alertBefore > 0 && (
                  <span style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '11px',
                    color: colors.copper,
                  }}>
                    {entry.alertBefore}m {entry.alertDisplay === 'takeover' ? 'TKO' : 'SLD'}
                  </span>
                )}
                {entry.nameHe && (
                  <span style={{
                    fontFamily: adminFonts.hebrewPrimary,
                    fontSize: '12px',
                    color: colors.dim,
                    direction: 'rtl',
                  }}>
                    {entry.nameHe}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {sortedEntries.length === 0 && (
          <div style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            color: colors.muted,
            padding: '20px 0',
            textAlign: 'center',
          }}>
            No schedule entries. Add one or load a template.
          </div>
        )}
      </div>
    </div>
  );
}
