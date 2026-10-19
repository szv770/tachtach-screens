import { useCallback } from 'react';
import useOwnedList from './useOwnedList.js';

/** Quick messages: { templates, recents, create, update, remove, reorder, addRecents, ... } (see useOwnedList). */
export default function useQuickTemplates(opts) {
  const list = useOwnedList('/api/quick-templates', 'templates', opts);
  const { post, setExtra } = list;
  const addRecents = useCallback(async (values) => {
    const r = await post('recents', { values });
    if (r?.recents) setExtra((e) => ({ ...e, recents: r.recents }));
  }, [post, setExtra]);
  return { ...list, templates: list.items, recents: list.extra.recents || { name: [], person: [], place: [] }, addRecents };
}
