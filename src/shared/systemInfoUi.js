// Pure text helpers for the "This server" identity (admin card, sidebar, Look & Settings). No Node or browser APIs.

/** 'Library TV · Windows PC' (either part may be missing). */
export function subtitleFor(info) {
  return [info?.name, info?.platform].filter(Boolean).join(' · ');
}

export function formatUptime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} day${d === 1 ? '' : 's'}, ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(gb >= 10 ? 0 : 1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

/** 'Raspberry Pi · Debian GNU/Linux 12 · v1.0.0 (abc1234)': one line for Look & Settings. */
export function oneLine(info) {
  if (!info) return '';
  const v = info.appVersion || {};
  const ver = [v.version && `v${v.version}`, v.build && `(${v.build})`].filter(Boolean).join(' ');
  return [info.platform, info.os?.name, ver].filter(Boolean).join(' · ');
}
