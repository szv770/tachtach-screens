/**
 * Help + onboarding content for the admin (Help tab and the first-visit tour).
 * Plain data so it is easy to edit; `go` is an admin section key (/admin/<key>).
 * Keep it true to docs/ADMIN_GUIDE.md.
 */

export const TOUR_KEY = 'tachtach-tour-v1';

/** What you are looking at on the TV. */
export const SCREEN_PARTS = [
  { name: 'The side column', text: 'Always there: the clock, the Hebrew and English date, the parsha and the weather. It also shows Side notes, and an "up next" card a few minutes before a scheduled item.' },
  { name: 'The page', text: 'The big area. It rotates through your Slides (zmanim, the schedule, learning, photos, a daily word...) one at a time.' },
  { name: 'The banner', text: 'A strip along the bottom that only appears while a Banner is posted. It never stops the slideshow.' },
  { name: 'A takeover', text: 'Covers the whole screen and pauses everything else. For things everyone must see right now.' },
];

/** The four ways to put a message on the screen. */
export const GLOSSARY = [
  { term: 'Slide', text: 'Takes its turn in the slideshow with the other slides. Best for most messages, events and lists.' },
  { term: 'Banner', text: 'Scrolls along the bottom. Does not interrupt anything. Best for a short reminder.' },
  { term: 'Side note', text: 'A small note in the side column. Up to 3 show at once. Best for a quiet standing reminder.' },
  { term: 'Takeover', text: 'Full screen, pauses the slideshow. Best for urgent or celebratory things (a time change, a simcha, an emergency).' },
];

/** "Get started" checklist, in a sensible order. */
export const START_STEPS = [
  { id: 'settings', title: 'Set your location', go: 'settings', goLabel: 'Open Settings',
    text: 'Enter your zip code once. Zmanim, the parsha, candle lighting and the weather all follow it.' },
  { id: 'style', title: 'Pick a look', go: 'style', goLabel: 'Open Style',
    text: 'Choose a theme (light, dark, and automatic day/night) and your fonts. Anything you upload can be used for any text.' },
  { id: 'slides', title: 'Choose what rotates', go: 'slides', goLabel: 'Open Slides',
    text: 'Switch slides on or off, set how many seconds each shows, and drag to reorder. + New Slide adds a message, an image, photos, a feed or a web page.' },
  { id: 'schedule', title: 'Enter today\'s schedule', go: 'schedule', goLabel: 'Open Schedule',
    text: 'Add the day\'s times by date, or paste a schedule you wrote with Claude. Set a reminder (alert) and the screen counts down before each item.' },
  { id: 'announce', title: 'Post your first message', go: 'announcements', goLabel: 'Open Announcements',
    text: 'Tap + New announcement, type your message, pick how it shows (Slide, Banner, Side note, Takeover), and Post. You can edit it any time and the screen updates in place.' },
  { id: 'daily-word', title: 'Turn on the Daily Word', go: 'daily-word', goLabel: 'Open Daily Word',
    text: 'A new Yiddish word every day with how to say it and how to use it. Switch the "Daily Word" slide on in Slides, then add or edit words here.' },
  { id: 'check', title: 'Look at the real screen', go: 'slides', goLabel: 'Back to Slides',
    text: 'The preview on the right of this page is the live TV. Use Pause, Next and Blank there, and the date box to see another day.' },
];

/** Questions people actually ask. */
export const TOPICS = [
  { id: 'tonight', title: 'Put something up for tonight only', go: 'announcements',
    body: ['Announcements → + New announcement.', 'Type it, choose Slide (or Banner for a quiet one), then under When choose End → "End of day" (or "Until end of Shabbos").', 'It leaves the screen by itself and moves to Archived (deleted after 30 days; use Again… to bring it back).'] },
  { id: 'urgent', title: 'Show something urgent on the whole screen', go: 'announcements',
    body: ['Announcements → + New announcement → Show as: Takeover.', 'Pick a style (for example Emergency or Time change). It covers the screen and pauses everything until it ends.', 'If another takeover is already live you are asked to Replace, Share, Queue or Cancel.'] },
  { id: 'edit-live', title: 'Fix a typo on something already live', go: 'announcements',
    body: ['Announcements → Live → Edit.', 'Change anything and Save changes. The TV updates right away; you do not need to repost.'] },
  { id: 'repeat', title: 'Make a message repeat every week', go: 'announcements',
    body: ['In the composer, open When → Repeat. Pick the days of the week (and a time window), and optionally a start and end date.', 'It shows during those windows and sits under Scheduled the rest of the time.'] },
  { id: 'schedule-claude', title: 'Make the Shabbos schedule with Claude', go: 'schedule',
    body: ['Schedule → Paste / Import → copy the request for Claude.', 'Give Claude your times, then paste its answer back. You see a preview before anything is saved.', 'There is a second request for a whole week at once.'] },
  { id: 'other-day', title: 'See what the screen will show on another day', go: 'slides',
    body: ['Use the Date preview box under the live preview on the right, then Open Preview Tab. It shows that date\'s zmanim, schedule and parsha.'] },
  { id: 'web-page', title: 'Show a website on the screen', go: 'slides',
    body: ['Slides → + New Slide → Web page. Paste the address and click Save & check.', 'It checks whether the site allows being shown. Turn on Fullscreen on that slide to use the whole screen.', 'It loads fresh every time the slide comes up.'] },
  { id: 'photos', title: 'Show photos', go: 'images',
    body: ['Media → upload images or videos, or connect a Google Photos shared album.', 'Then + New Slide to give them a turn in the rotation.'] },
  { id: 'phone', title: 'Open the admin from my phone', go: 'settings',
    body: ['On the same Wi-Fi, go to http://<the Pi\'s address>:3000/admin.', 'At the TV itself: tap the top-left corner 5 times quickly to get the login box.'] },
  { id: 'tv-wrong', title: 'The TV looks wrong or stuck', go: 'settings',
    body: ['Try Refresh Data under the preview first.', 'If the picture itself is broken, the screen restarts itself every few hours and also when it detects a graphics problem. You can force it with: sudo systemctl restart tachtach-kiosk (on the Pi).'] },
  { id: 'update', title: 'Get the newest version', go: 'settings',
    body: ['On the Pi run: bash ~/tachtach-screens/deploy/update.sh. Your messages, schedule and settings are kept.'] },
  { id: 'password', title: 'I forgot the password or lost my authenticator', go: 'settings',
    body: ['On the Pi run: npm run reset-admin (inside the tachtach-screens folder). It resets the password and 2-step code without erasing anything.', 'Never run setup.js again: it wipes your data.'] },
];

/** First-visit tour: short, with a button that jumps to each place. */
export const TOUR = [
  { title: 'Welcome to TachTach', text: 'This panel controls the TV. Everything you change here appears on the screen within a second or two. This 1-minute tour shows where things are; you can reopen it any time from Help.', go: null },
  { title: 'The screen has three parts', text: 'A side column (clock, date, parsha, weather), a big page that rotates through your slides, and a banner that appears only when you post one. The live preview on the right of every page shows exactly what the TV shows.', go: null },
  { title: 'Slides: what rotates', text: 'Switch slides on or off, set how long each shows, drag to reorder. Zmanim, learning, schedule, weather and the Daily Word are built in. + New Slide adds your own.', go: 'slides', goLabel: 'Show me Slides' },
  { title: 'Announcements: say something', text: 'Messages, banners, side notes and full-screen takeovers all live here. Post, edit while live, repeat weekly, or bring an old one back with Again.', go: 'announcements', goLabel: 'Show me Announcements' },
  { title: 'Schedule: the day\'s times', text: 'Enter times by date or paste a schedule from Claude. Reminders count down on screen before each item.', go: 'schedule', goLabel: 'Show me Schedule' },
  { title: 'Daily Word', text: 'A new word every day, with how to say it and how to use it. See what is coming up, browse the archive of past words, and pin a word to a special day.', go: 'daily-word', goLabel: 'Show me Daily Word' },
  { title: 'Help is always here', text: 'The Help tab has a get-started checklist, plain-English answers to common questions, and what to do if something looks wrong.', go: 'help', goLabel: 'Open Help' },
];
