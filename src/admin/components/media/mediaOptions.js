// Shared choices + the slide a media item becomes. Pure (no React) so the uploader, the library
// and the tests agree.

export const DISPLAY_MODES = [
  { value: 'fit', label: 'Fit (show full)' },
  { value: 'fill', label: 'Fill (crop to cover)' },
  { value: 'stretch', label: 'Stretch' },
];

export const EDGE_TREATMENTS = [
  { value: 'blur', label: 'Blur' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

/** Starting options for adding an item to the screen (videos stay on for the whole clip). */
export function defaultOptions(item) {
  const video = item?.mediaType === 'video';
  return { label: '', displayMode: 'fit', edgeTreatment: 'blur', duration: video ? 45 : 10, fullscreen: false };
}

/** The POST /api/slides body for a media item (an upload result or a library row). */
export function buildSlide(item, o) {
  const isVideo = item.mediaType === 'video';
  return {
    type: isVideo ? 'VIDEO_SLIDE' : 'IMAGE_SLIDE',
    mediaId: item.id,
    mediaType: item.mediaType,
    imageUrl: !isVideo ? `/uploads/${item.filename}` : undefined,
    videoUrl: isVideo ? `/uploads/${item.filename}` : undefined,
    blurUrl: item.blurFilename ? `/uploads/${item.blurFilename}` : undefined,
    dominantColor: item.dominantColor,
    displayMode: isVideo ? 'fill' : o.displayMode,
    edgeTreatment: (!isVideo && o.displayMode === 'fit') ? o.edgeTreatment : undefined,
    fullscreen: !!o.fullscreen,
    label: o.label || undefined,
    enabled: true,
    duration: isVideo ? 0 : o.duration, // 0 = play the whole video
    isGif: item.mediaType === 'gif',
  };
}

/** One line for the closed "Display options" row. */
export function optionsSummary(item, o) {
  if (item?.mediaType === 'video') return `Plays the whole clip${o.fullscreen ? ', whole screen' : ''}`;
  const mode = DISPLAY_MODES.find((m) => m.value === o.displayMode)?.label.split(' ')[0] || 'Fit';
  const edge = o.displayMode === 'fit' ? `, ${(EDGE_TREATMENTS.find((e) => e.value === o.edgeTreatment)?.label || '').toLowerCase()} edges` : '';
  return `${mode}${edge}${o.fullscreen ? ', whole screen' : ''}`;
}

/** Slides that show this upload. */
export function slidesUsing(item, slides = []) {
  return slides.filter((s) => s.mediaId === item.id
    || (s.imageUrl || '').endsWith(`/uploads/${item.filename}`)
    || (s.videoUrl || '').endsWith(`/uploads/${item.filename}`));
}

export function formatBytes(n) {
  if (!(n >= 0)) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
