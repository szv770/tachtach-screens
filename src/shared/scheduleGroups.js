/**
 * Schedule GROUPS (grades / shiurim that watch the same screen): pure, shared by the server (validation,
 * countdown), the kiosk (Schedule page, rail, stages) and the admin. No school names are hard-coded.
 *
 * Data (all optional; empty/absent = feature off, everything behaves as before):
 *   settings.scheduleGroups = [{ id, name, nameHe?, short? }]        (max 12; id = [a-z0-9_-], <= 32)
 *   entry.groupTimes = { [groupId]: { time: 'HH:MM', endTime?: 'HH:MM' | '' } }
 *       entry.time / endTime stay the base times, used by every group without its own override.
 *   entry.groups = [groupId, ...]   restricts the block to those groups (absent / empty = everyone).
 *
 * timesFor(entry, groups) -> the distinct time slots with the groups sharing each:
 *   [{ groups: ['aleph'], time: '19:15', endTime: '21:15' }, { groups: ['beis', 'gimmel'], time: '20:00', endTime: '22:00' }]
 * rowsForDisplay(entries, groups) -> one row per entry with all its slots and, when the groups differ, a
 * compact split ("Aleph 7:15–9:15 · Beis & Gimmel 8:00–10:00"); rows sort by their earliest slot.
 * expandForTimers(entries, groups) -> one pseudo-entry per distinct slot (rail up-next, stages, countdown).
 */

export const MAX_GROUPS = 12;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Clean settings.scheduleGroups: valid unique ids, a name, optional nameHe / short. Bad rows are dropped. */
export function sanitizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const id = str(g.id, 40).toLowerCase();
    const name = str(g.name, 40);
    if (!ID_RE.test(id) || seen.has(id) || !(name || str(g.nameHe, 40))) continue;
    seen.add(id);
    const row = { id, name: name || str(g.nameHe, 40) };
    const nameHe = str(g.nameHe, 40); if (nameHe) row.nameHe = nameHe;
    const short = str(g.short, 16); if (short) row.short = short;
    out.push(row);
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}

export const groupsOn = (groups) => Array.isArray(groups) && groups.length > 0;

/** '7:15 PM' / '19:15' / '7:15' -> 'HH:MM' (24 h), else null. */
export function normTime(t) {
  if (typeof t !== 'string') return null;
  const s = t.trim();
  let m = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?$/);
  if (m) {
    const h = Number(m[1]), mm = Number(m[2]);
    if (h < 1 || h > 12 || mm > 59) return null;
    return `${String((h % 12) + (/[Pp]/.test(m[3]) ? 12 : 0)).padStart(2, '0')}:${m[2]}`;
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]), mm = Number(m[2]);
    if (h > 23 || mm > 59) return null;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  return null;
}

export const minutesOf = (t) => { const n = normTime(t); if (!n) return null; const [h, m] = n.split(':').map(Number); return h * 60 + m; };

/**
 * Validate an entry's group fields. `groupIds` = the configured ids (unknown ones are dropped); null =
 * no list to check against (only the shape is checked). Bad times are errors (the whole entry is refused).
 * @returns {{ groupTimes?: object, groups?: string[], errors: string[], warnings: string[] }}
 */
export function sanitizeGroupFields(entry, groupIds = null) {
  const errors = [];
  const warnings = [];
  const out = { errors, warnings };
  const known = Array.isArray(groupIds) ? new Set(groupIds) : null;
  const okId = (id) => typeof id === 'string' && ID_RE.test(id) && (!known || known.has(id));
  const gt = entry?.groupTimes;
  if (gt !== undefined && gt !== null && gt !== '') {
    if (typeof gt !== 'object' || Array.isArray(gt)) errors.push('groupTimes must be an object of { groupId: { time, endTime } }.');
    else {
      const clean = {};
      for (const [id, v] of Object.entries(gt)) {
        if (!okId(id)) { warnings.push(`Unknown group "${id}" - its times were dropped.`); continue; }
        if (!v || typeof v !== 'object') { errors.push(`Group "${id}": times must be { time, endTime }.`); continue; }
        const time = normTime(v.time);
        if (!time) { errors.push(`Group "${id}": "${v.time}" is not a time.`); continue; }
        let endTime = '';
        if (v.endTime !== undefined && v.endTime !== null && String(v.endTime).trim() !== '') {
          endTime = normTime(v.endTime);
          if (!endTime) { errors.push(`Group "${id}": end "${v.endTime}" is not a time.`); continue; }
        }
        clean[id] = { time, endTime };
      }
      if (Object.keys(clean).length) out.groupTimes = clean;
    }
  }
  const gs = entry?.groups;
  if (gs !== undefined && gs !== null && gs !== '') {
    if (!Array.isArray(gs)) errors.push('groups must be a list of group ids.');
    else {
      const clean = [...new Set(gs.filter((id) => { const ok = okId(id); if (!ok) warnings.push(`Unknown group "${id}" dropped.`); return ok; }))];
      if (clean.length) out.groups = clean;
    }
  }
  return out;
}

/**
 * Apply sanitizeGroupFields to a stored entry object in place-free style: returns a copy with clean
 * groupTimes/groups (or without them). Throws nothing; errors are returned.
 */
export function withCleanGroupFields(entry, groupIds = null) {
  const r = sanitizeGroupFields(entry, groupIds);
  const { groupTimes, groups, ...rest } = entry || {}; // eslint-disable-line no-unused-vars
  const next = { ...rest };
  if (r.groupTimes) next.groupTimes = r.groupTimes;
  if (r.groups) next.groups = r.groups;
  return { entry: next, errors: r.errors, warnings: r.warnings };
}

/** The groups a block applies to (entry.groups restricted to the configured ones; none = all). */
export function groupsOf(entry, groups) {
  const all = (groups || []).map((g) => g.id);
  const only = Array.isArray(entry?.groups) && entry.groups.length ? entry.groups.filter((id) => all.includes(id)) : null;
  return only && only.length ? only : all;
}

/**
 * Distinct time slots of an entry: [{ groups: [ids] | null, time, endTime }], earliest first.
 * Without groups configured: one slot (groups null) with the entry's own times.
 */
export function timesFor(entry, groups) {
  const base = { time: normTime(entry?.time) || entry?.time || '', endTime: normTime(entry?.endTime) || '' };
  if (!groupsOn(groups)) return [{ groups: null, ...base }];
  const ids = groupsOf(entry, groups);
  const slots = new Map();
  for (const id of ids) {
    const o = entry?.groupTimes?.[id];
    const t = o && normTime(o.time) ? { time: normTime(o.time), endTime: normTime(o.endTime) || '' } : base;
    const k = `${t.time}|${t.endTime}`;
    if (!slots.has(k)) slots.set(k, { groups: [], ...t });
    slots.get(k).groups.push(id);
  }
  return [...slots.values()].sort((a, b) => (minutesOf(a.time) ?? 0) - (minutesOf(b.time) ?? 0) || (minutesOf(a.endTime) ?? 0) - (minutesOf(b.endTime) ?? 0));
}

/** "Aleph", "Beis & Gimmel", "Aleph, Beis & Gimmel" from ids (short name first). */
export function groupLabel(ids, groups) {
  const names = (ids || []).map((id) => { const g = (groups || []).find((x) => x.id === id); return g ? (g.short || g.name) : id; });
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * Rows for the Schedule page: [{ entry, slots: [{ v, end, groups, label }], split: [{ label, v, end }] | null }].
 * `split` only when the groups run at different times. Entries restricted to some groups keep a label
 * ("Aleph only") as a one-slot split so the reader knows who it is for. Sorted by the earliest slot.
 */
export function rowsForDisplay(entries, groups) {
  const on = groupsOn(groups);
  const rows = (entries || []).map((entry) => {
    const ts = timesFor(entry, groups);
    const slots = ts.map((t) => {
      const v = minutesOf(t.time);
      let end = minutesOf(t.endTime);
      if (end != null && v != null && end <= v) end = null;
      return { v, end, groups: t.groups, label: on && t.groups ? groupLabel(t.groups, groups) : '' };
    }).filter((s) => s.v != null);
    const restricted = on && Array.isArray(entry.groups) && entry.groups.length && groupsOf(entry, groups).length < groups.length;
    let split = null;
    if (slots.length > 1) split = slots.map((s) => ({ label: s.label, v: s.v, end: s.end }));
    else if (restricted && slots.length === 1) split = [{ label: `${slots[0].label} only`, v: slots[0].v, end: slots[0].end }];
    return { entry, slots, split };
  }).filter((r) => r.slots.length);
  return rows.sort((a, b) => a.slots[0].v - b.slots[0].v);
}

/**
 * One pseudo-entry per distinct slot, for code that reads entry.time / endTime (rail up-next, attention
 * stages, server countdown). A single-slot entry comes back unchanged (same object). Split slots get
 * `id: '<id>#<groups>'`, `groupIds`, `groupLabel`, and the label in `name` ("Night Seder · Aleph").
 */
export function expandForTimers(entries, groups) {
  if (!groupsOn(groups)) return entries || [];
  const out = [];
  for (const e of entries || []) {
    const ts = timesFor(e, groups);
    const restricted = Array.isArray(e.groups) && e.groups.length && groupsOf(e, groups).length < groups.length;
    if (ts.length === 1 && !restricted) { out.push(e); continue; }
    for (const t of ts) {
      const label = groupLabel(t.groups, groups);
      out.push({ ...e, id: `${e.id || e.time}#${t.groups.join('+')}`, time: t.time, endTime: t.endTime, groupIds: t.groups, groupLabel: label,
        name: e.name ? `${e.name} · ${label}` : e.name, nameHe: e.nameHe });
    }
  }
  return out;
}
