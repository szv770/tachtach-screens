// Form values for one slide's pencil popup: the slide's own fields plus the few
// settings keys that belong to a slide (zmanim list, study languages, weather units).
// Pure, so the popup and the New-slide step 2 share it.
import { ZMANIM_DISPLAY } from '../../../shared/constants.js';
import { normalizeWebUrl } from '../../../shared/embedCheck.js';
import { LIMUDIM_ITEMS, typeInfo, popupSpec } from './slideTypes.js';
import { clampPageSeconds, pdfTotalSeconds, PAGE_SECONDS_MIN, PAGE_SECONDS_MAX } from '../../../shared/pdfPages.js';

/** Slide fields this form may write (all are in the server's SLIDE_FIELDS whitelist). */
export const SLIDE_KEYS = ['label', 'enabled', 'duration', 'pageSeconds', 'fullscreen', 'displayMode', 'edgeTreatment', 'photoInterval', 'photoOrder', 'kenBurns', 'imageDisplayMode', 'rssDisplayMode', 'style', 'embedUrl', 'webRefreshSec', 'webZoom'];

const ALL_ZMANIM = ZMANIM_DISPLAY.map((z) => z.k);

export function initialValues(slide, settings = {}) {
  const t = slide.type;
  const sections = typeInfo(t)?.edit || [];
  const v = {
    label: slide.label || '',
    duration: String(slide.duration || typeInfo(t)?.defaults?.duration || 15),
    fullscreen: !!slide.fullscreen,
    enabled: slide.enabled !== false,
  };
  if (sections.includes('zmanim')) {
    const vis = settings.zmanimVisible;
    v.zmanimVisible = Array.isArray(vis) && vis.length ? ALL_ZMANIM.filter((k) => vis.includes(k)) : ALL_ZMANIM;
  }
  if (sections.includes('limudim')) {
    v.limudimLang = settings.limudimLang || 'both';
    v.limudimItems = Object.fromEntries(LIMUDIM_ITEMS.map((i) => [i.key, settings.limudimItems?.[i.key] !== false]));
  }
  if (sections.includes('hayomYom')) v.hayomYomLang = settings.hayomYomLang || 'both';
  if (sections.includes('weather')) {
    v.weatherUnits = (settings.weather?.units || 'F') === 'C' ? 'C' : 'F';
    v.weatherRail = settings.weather?.enabled !== false;
  }
  if (sections.includes('image')) { v.displayMode = slide.displayMode || 'fit'; v.edgeTreatment = slide.edgeTreatment || 'blur'; }
  if (sections.includes('photos')) {
    v.displayMode = slide.displayMode || 'single';
    v.photoInterval = String(slide.photoInterval || 8);
    v.photoOrder = slide.photoOrder || 'album';
    v.kenBurns = !!slide.kenBurns;
    v.imageDisplayMode = slide.imageDisplayMode || 'fit';
  }
  if (sections.includes('pdf')) { v.pageSeconds = String(clampPageSeconds(slide.pageSeconds)); v.displayMode = slide.displayMode || 'fit'; v.edgeTreatment = slide.edgeTreatment || 'dark'; }
  if (sections.includes('rss')) { v.rssDisplayMode = slide.rssDisplayMode || 'latest'; v.style = slide.style || ''; }
  if (sections.includes('web') || sections.includes('embed')) v.embedUrl = slide.embedUrl || '';
  if (sections.includes('web')) { v.webRefreshSec = Number(slide.webRefreshSec) || 0; v.webZoom = Number(slide.webZoom) || 100; }
  return v;
}

const clampInt = (raw, min, max, what) => {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${what} must be a number from ${min} to ${max}.`);
  return n;
};

/**
 * Turn edited form values into { slidePatch, settingsPatch } (only what changed).
 * Throws an Error with a plain message when a value is not acceptable.
 */
export function splitValues(values, changed, slide) {
  const slidePatch = {};
  const settingsPatch = {};
  for (const k of changed) {
    const val = values[k];
    if (k === 'label') slidePatch.label = String(val || '').trim() || undefined;
    else if (k === 'duration') { if (slide.type !== 'PDF_SLIDE') { const sp = popupSpec(slide.type); slidePatch.duration = clampInt(val, sp.secondsMin, sp.secondsMax, 'Seconds on screen'); } }
    else if (k === 'enabled') slidePatch.enabled = !!val;
    else if (k === 'pageSeconds') {
      const n = Math.round(Number(val));
      if (!Number.isFinite(n) || n < PAGE_SECONDS_MIN || n > PAGE_SECONDS_MAX) throw new Error(`Seconds on each page must be a number from ${PAGE_SECONDS_MIN} to ${PAGE_SECONDS_MAX}.`);
      slidePatch.pageSeconds = n;
      slidePatch.duration = pdfTotalSeconds(Array.isArray(slide.pdfPages) ? slide.pdfPages.length : 1, n);
    } else if (k === 'photoInterval') slidePatch.photoInterval = clampInt(val, 1, 600, 'Seconds per photo');
    else if (k === 'embedUrl') {
      const raw = String(val || '').trim();
      if (!raw) slidePatch.embedUrl = undefined;
      else if (slide.type === 'WEB_PAGE') {
        const url = normalizeWebUrl(raw);
        if (!url) throw new Error('Enter a full web address, like https://charidy.com/miami+');
        slidePatch.embedUrl = url;
      } else slidePatch.embedUrl = raw;
    } else if (k === 'webRefreshSec') slidePatch.webRefreshSec = Number(val) || undefined;
    else if (k === 'webZoom') slidePatch.webZoom = Number(val) === 100 ? undefined : Number(val);
    else if (k === 'style') slidePatch.style = val || undefined;
    else if (SLIDE_KEYS.includes(k)) slidePatch[k] = val;
    else if (k === 'zmanimVisible') settingsPatch.zmanimVisible = val.length === ALL_ZMANIM.length ? [] : val;
    else if (k === 'limudimLang' || k === 'hayomYomLang') settingsPatch[k] = val;
    else if (k === 'limudimItems') settingsPatch.limudimItems = val;
    else if (k === 'weatherUnits') settingsPatch.weather = { ...(settingsPatch.weather || {}), units: val };
    else if (k === 'weatherRail') settingsPatch.weather = { ...(settingsPatch.weather || {}), enabled: !!val };
  }
  // Photo albums: the "fullscreen" layout is also the slide's fullscreen flag (as the Photos tab does).
  if (slide.type === 'GOOGLE_PHOTOS_SLIDE' && 'displayMode' in slidePatch) slidePatch.fullscreen = slidePatch.displayMode === 'fullscreen';
  return { slidePatch, settingsPatch };
}
