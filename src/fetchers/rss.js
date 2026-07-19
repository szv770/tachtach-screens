import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const UA = 'Mozilla/5.0 (compatible; TachTach-Screens/1.0)';

// Allowed RSS fields for mapping
export const RSS_FIELDS = ['title', 'description', 'link', 'pubDate', 'author', 'content'];

/**
 * Strip HTML tags from a string.
 */
function stripHTML(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize an RSS/Atom item into a flat structure.
 */
function normalizeItem(raw) {
  // Handle both RSS and Atom formats
  const title = stripHTML(typeof raw.title === 'object' ? (raw.title['#text'] || '') : (raw.title || ''));
  const description = stripHTML(raw.description || raw.summary || raw['content:encoded'] || '');
  const content = stripHTML(raw['content:encoded'] || raw.content?.['#text'] || raw.content || raw.description || '');
  const link = typeof raw.link === 'object' ? (raw.link['@_href'] || raw.link['#text'] || '') : (raw.link || '');
  const pubDate = raw.pubDate || raw.published || raw.updated || '';
  const author = raw.author?.name || raw['dc:creator'] || raw.author || '';

  return {
    title,
    description: description.slice(0, 500),
    content: content.slice(0, 1000),
    link: typeof link === 'string' ? link : '',
    pubDate: typeof pubDate === 'string' ? pubDate : String(pubDate),
    author: typeof author === 'string' ? stripHTML(author) : '',
  };
}

/**
 * Fetch and parse an RSS/Atom feed URL.
 * @param {string} url - The feed URL
 * @returns {Promise<{ items: object[], feedTitle: string, availableFields: string[] }>}
 */
export async function fetchRSSFeed(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching feed`);
  const xml = await resp.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const doc = parser.parse(xml);

  let rawItems = [];
  let feedTitle = '';

  // RSS 2.0
  if (doc.rss?.channel) {
    const channel = doc.rss.channel;
    feedTitle = typeof channel.title === 'string' ? channel.title : '';
    rawItems = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
  }
  // Atom
  else if (doc.feed) {
    feedTitle = typeof doc.feed.title === 'object' ? (doc.feed.title['#text'] || '') : (doc.feed.title || '');
    rawItems = Array.isArray(doc.feed.entry) ? doc.feed.entry : (doc.feed.entry ? [doc.feed.entry] : []);
  }
  // RSS 1.0 (RDF)
  else if (doc['rdf:RDF']) {
    const rdf = doc['rdf:RDF'];
    feedTitle = rdf.channel?.title || '';
    rawItems = Array.isArray(rdf.item) ? rdf.item : (rdf.item ? [rdf.item] : []);
  }

  const items = rawItems.map(normalizeItem);

  // Determine which fields actually have data
  const availableFields = RSS_FIELDS.filter(field =>
    items.some(item => item[field] && item[field].length > 0)
  );

  return { items, feedTitle: stripHTML(feedTitle), availableFields };
}
