import fetch from 'node-fetch';
import { sheetCsvUrl, LIMITS } from '../shared/averages.js';

/**
 * Download the CSV of a linked Google Sheet (Test Averages). Only docs.google.com sheet links are accepted
 * (sheetCsvUrl); the sheet must be shared 'Anyone with the link can view' or published to the web.
 * Throws an Error with a plain-English message (shown to the admin), never returns partial data.
 */
export async function fetchSheetCsv(input, { timeoutMs = 15000, doFetch = fetch } = {}) {
  const url = sheetCsvUrl(input);
  if (!url) throw new Error('That is not a Google Sheets link. Copy the link from the sheet\'s Share button.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await doFetch(url, { signal: ctl.signal, redirect: 'follow', headers: { Accept: 'text/csv' } });
    if (resp.status === 401 || resp.status === 403 || resp.status === 404) throw new Error('Could not open the sheet. Set sharing to "Anyone with the link can view".');
    if (!resp.ok) throw new Error(`Google returned an error (${resp.status}). Try again in a minute.`);
    const type = String(resp.headers.get('content-type') || '');
    if (/text\/html/i.test(type)) throw new Error('Google asked for a sign-in. Set sharing to "Anyone with the link can view".');
    const text = await resp.text();
    if (text.length > LIMITS.importText) throw new Error('That sheet is too big to import.');
    return text;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Google took too long to answer. Try again in a minute.');
    throw e;
  } finally { clearTimeout(timer); }
}
