import fetch from 'node-fetch';

/**
 * Extract photo URLs from a Google Photos shared album page.
 *
 * Google embeds photo data in the page source as arrays containing
 * lh3.googleusercontent.com URLs. We try multiple parsing strategies
 * since Google's page format can vary.
 *
 * @param {string} albumUrl — shared album URL (https://photos.google.com/share/...)
 * @returns {Promise<string[]>} array of photo CDN URLs
 */
export async function fetchGooglePhotosAlbum(albumUrl) {
  if (!albumUrl || typeof albumUrl !== 'string') {
    throw new Error('Album URL is required');
  }

  // Validate it looks like a Google Photos share URL
  if (!albumUrl.includes('photos.google.com/share/') && !albumUrl.includes('photos.app.goo.gl/')) {
    throw new Error('Invalid Google Photos shared album URL');
  }

  let html;
  try {
    const res = await fetch(albumUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      timeout: 15000,
    });

    if (!res.ok) {
      if (res.status === 404) throw new Error('Album not found. The link may be invalid or the album may have been deleted.');
      if (res.status === 403) throw new Error('Album is private. Make sure link sharing is enabled.');
      throw new Error(`Google Photos returned status ${res.status}`);
    }

    html = await res.text();
  } catch (err) {
    if (err.message.includes('Album')) throw err;
    throw new Error(`Failed to fetch album: ${err.message}`);
  }

  // Strategy 1: Find lh3.googleusercontent.com URLs in the page
  const urls = new Set();
  const profilePicUrls = new Set();

  // Pattern: look for lh3 URLs in script data. Google embeds them in various formats.
  const lh3Regex = /https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-\/=]+/g;

  // Profile pic patterns to exclude:
  // - /a/ prefix (Google account avatars): lh3.googleusercontent.com/a/...
  // - /og/ prefix (other Google avatars)
  // - URLs near user/person data markers in the HTML
  const profilePicPatterns = [
    /\/a\/[A-Za-z0-9_-]+$/, // Google account avatar pattern
    /\/a\/default$/, // Default avatar
    /\/og\//, // Other Google avatars
  ];

  function isProfilePic(url) {
    const path = url.replace('https://lh3.googleusercontent.com', '');
    return profilePicPatterns.some(p => p.test(path));
  }

  // First pass: find profile pic URLs near user/contributor data
  // Google embeds contributor data with profile pics in arrays near names
  const contributorRegex = /\["(https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-\/=]+)"[^]]*?"[A-Za-z\s]+"[^]]*?\d{10,}/g;
  let contribMatch;
  while ((contribMatch = contributorRegex.exec(html)) !== null) {
    if (contribMatch[1]) {
      const cleanUrl = contribMatch[1].replace(/=[swh]\d+.*$/, '');
      profilePicUrls.add(cleanUrl);
    }
  }

  // Also catch profile pics via the /a/ pattern
  const allLh3 = html.match(lh3Regex) || [];
  for (const url of allLh3) {
    if (isProfilePic(url)) {
      const cleanUrl = url.replace(/=[swh]\d+.*$/, '');
      profilePicUrls.add(cleanUrl);
    }
  }

  // Second pass: collect photo URLs, excluding profile pics
  const matches = html.match(lh3Regex);
  if (matches) {
    for (const url of matches) {
      // Filter: must be longer than 50 chars (real photo URLs are long)
      if (url.length > 50) {
        const cleanUrl = url.replace(/=[swh]\d+.*$/, '');
        // Skip if this URL was identified as a profile pic
        if (!profilePicUrls.has(cleanUrl) && !isProfilePic(url)) {
          urls.add(cleanUrl);
        }
      }
    }
  }

  // Strategy 2: Look for data arrays containing photo metadata
  if (urls.size === 0) {
    const afDataRegex = /AF_initDataCallback\(\{[^}]*data:(\[[\s\S]*?\])\s*\}\)/g;
    let afMatch;
    while ((afMatch = afDataRegex.exec(html)) !== null) {
      const innerMatches = afMatch[1].match(lh3Regex);
      if (innerMatches) {
        for (const url of innerMatches) {
          if (url.length > 50) {
            const cleanUrl = url.replace(/=[swh]\d+.*$/, '');
            if (!profilePicUrls.has(cleanUrl) && !isProfilePic(url)) {
              urls.add(cleanUrl);
            }
          }
        }
      }
    }
  }

  // Strategy 3: Look in script tags specifically
  if (urls.size === 0) {
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      const scriptContent = scriptMatch[1];
      const innerMatches = scriptContent.match(lh3Regex);
      if (innerMatches) {
        for (const url of innerMatches) {
          if (url.length > 50) {
            const cleanUrl = url.replace(/=[swh]\d+.*$/, '');
            if (!profilePicUrls.has(cleanUrl) && !isProfilePic(url)) {
              urls.add(cleanUrl);
            }
          }
        }
      }
    }
  }

  if (urls.size === 0) {
    throw new Error('No photos found. The album may be empty, private, or the page format may have changed.');
  }

  // Return URLs with a display-quality size suffix
  return Array.from(urls).map(url => `${url}=w1920-h1080`);
}

/**
 * Extract an album ID from a Google Photos shared album URL.
 * Used for naming cache directories.
 */
export function extractAlbumId(albumUrl) {
  // https://photos.google.com/share/AF1QipN.../photo/AF1Qip...
  // Take the share token as the ID
  const match = albumUrl.match(/\/share\/([A-Za-z0-9_-]+)/);
  if (match) {
    // Use first 16 chars to keep directory names manageable
    return match[1].substring(0, 16);
  }
  // Fallback: hash the URL
  let hash = 0;
  for (let i = 0; i < albumUrl.length; i++) {
    hash = ((hash << 5) - hash + albumUrl.charCodeAt(i)) | 0;
  }
  return `album-${Math.abs(hash).toString(36)}`;
}
