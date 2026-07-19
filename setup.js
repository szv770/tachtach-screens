import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import bcrypt from 'bcrypt';
import { readJSON, writeJSON, ensureDataDir } from './src/server/storage.js';

const BCRYPT_ROUNDS = 12;

const rl = readline.createInterface({ input, output });

/**
 * Prompt the user, returning their trimmed answer.
 * If a defaultValue is given and the user presses Enter, use it.
 */
async function ask(question, defaultValue) {
  const suffix = defaultValue != null ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || (defaultValue != null ? String(defaultValue) : '');
}

/**
 * Prompt for a password (visible — Node readline has no silent mode).
 * Validates: min 12 chars, uppercase, lowercase, digit.
 */
async function askPassword() {
  while (true) {
    const pw = await ask('  Admin password (min 12 chars, upper+lower+digit)');

    if (pw.length < 12) {
      console.log('  ✗ Password must be at least 12 characters.');
      continue;
    }
    if (!/[A-Z]/.test(pw)) {
      console.log('  ✗ Password must contain at least one uppercase letter.');
      continue;
    }
    if (!/[a-z]/.test(pw)) {
      console.log('  ✗ Password must contain at least one lowercase letter.');
      continue;
    }
    if (!/[0-9]/.test(pw)) {
      console.log('  ✗ Password must contain at least one digit.');
      continue;
    }

    const confirm = await ask('  Confirm password');
    if (confirm !== pw) {
      console.log('  ✗ Passwords do not match. Try again.');
      continue;
    }

    return pw;
  }
}

// ── Main ────────────────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   TachTach-Screens — Initial Setup       ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

await ensureDataDir();

// Check if setup has already been run
const existingAuth = await readJSON('auth.json');
if (existingAuth) {
  const overwrite = await ask('Setup has already been run. Overwrite? (y/N)', 'N');
  if (overwrite.toLowerCase() !== 'y') {
    console.log('Setup cancelled.');
    rl.close();
    process.exit(0);
  }
}

// ── 1. Admin password ──────────────────────────────────────────────────
console.log('Step 1: Create admin password');
const password = await askPassword();
const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
console.log('  ✓ Password hashed.\n');

// ── 2. Location settings ──────────────────────────────────────────────
console.log('Step 2: Location');
const zip = await ask('  Zip code', '33139');
const locationId = await ask('  Chabad.org location ID', zip);
console.log('');

// ── 3. Write data files ───────────────────────────────────────────────
console.log('Writing configuration files...');

await writeJSON('auth.json', {
  passwordHash,
  session: null,
  lockouts: {},
});
console.log('  ✓ data/auth.json');

await writeJSON('settings.json', {
  location: {
    zip,
    locationId,
    timezone: 'America/New_York',
  },
  theme: 'dark',
  customTheme: null,
  orientation: 'landscape',
  scheduler: {
    trackA: true,
    trackBTime: '04:00',
  },
  visibility: {
    clock: true,
    hebrewDate: true,
    parsha: true,
    omer: true,
    pinnedNotes: true,
  },
  dataSources: {
    zmanim: true,
    hayomYom: true,
    limudim: true,
    rambam1: true,
    rambam3: true,
    tanyaYomi: true,
  },
});
console.log('  ✓ data/settings.json');

// Don't clobber an existing slides.json — it may already ship with the repo
// (as a committed reference/default) or have been customized by the owner.
// Only write fresh defaults if the file genuinely doesn't exist yet.
const existingSlides = await readJSON('slides.json');
if (existingSlides) {
  console.log('  ✓ data/slides.json (already present, left unchanged)');
} else {
  await writeJSON('slides.json', [
    { id: 'zmanim', type: 'ZMANIM', label: 'Halachic Times', enabled: true, duration: 15, order: 0 },
    { id: 'limudim', type: 'LIMUDIM', label: 'Daily Study', enabled: true, duration: 15, order: 1 },
    { id: 'hayom-yom', type: 'HAYOM_YOM', enabled: true, duration: 25, order: 2 },
    { id: 'pirkei-avos', type: 'PIRKEI_AVOS', enabled: true, duration: 13, order: 3 },
    { id: 'daily-quote', type: 'DAILY_QUOTE', label: 'Daily Vort', enabled: true, duration: 12, order: 4 },
    { id: 'parsha-tidbits', type: 'PARSHA_TIDBITS', enabled: false, duration: 25, order: 5 },
    { id: 'schedule', type: 'SCHEDULE', label: 'Seder', enabled: false, duration: 30, order: 6 },
    { id: 'mivtzah-leaderboard', type: 'MIVTZAH_LEADERBOARD', label: 'Mivtzah Leaderboard', enabled: false, duration: 20, order: 99 },
    { id: 'mivtzah-live-embed', type: 'MIVTZAH_LIVE_EMBED', label: 'Mivtzah Live Screen', embedUrl: '', enabled: false, duration: 20, order: 100 },
  ]);
  console.log('  ✓ data/slides.json');
}

await writeJSON('messages.json', []);
console.log('  ✓ data/messages.json');

await writeJSON('pinned.json', []);
console.log('  ✓ data/pinned.json');

await writeJSON('custom-days.json', []);
console.log('  ✓ data/custom-days.json');

console.log('');
console.log('Setup complete!');
console.log(`  Admin panel: http://localhost:${process.env.PORT || 3000}/admin`);
console.log('  Run "npm start" to launch the server.');
console.log('');

rl.close();
