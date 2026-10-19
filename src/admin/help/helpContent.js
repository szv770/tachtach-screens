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
  { id: 'settings', title: 'Set your location', go: 'location', goLabel: 'Open Location',
    text: 'Enter your zip code once. Zmanim, the parsha, candle lighting and the weather all follow it.' },
  { id: 'style', title: 'Pick a look', go: 'themes', goLabel: 'Open Themes',
    text: 'Choose a theme (light, dark, and automatic day/night) and your fonts. Anything you upload can be used for any text.' },
  { id: 'slides', title: 'Choose what rotates', go: 'slides', goLabel: 'Open Slides',
    text: 'Switch slides on or off, set how many seconds each shows, and drag to reorder. + New Slide adds a message, an image, photos, a feed or a web page.' },
  { id: 'schedule', title: 'Enter today\'s schedule', go: 'schedule', goLabel: 'Open Schedule',
    text: 'First time: Build my year schedule walks you through it. Later, change one day by date, or paste a schedule you wrote with Claude. Set a reminder (alert) and the screen counts down before each item.' },
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
    body: ['Schedule → Paste / AI import → copy the request for Claude.', 'Give Claude your times, then paste its answer back. You see a preview before anything is saved.', 'There is a second request for a whole week at once.'] },
  { id: 'other-day', title: 'See what the screen will show on another day', go: 'slides',
    body: ['Use the Date preview box under the live preview on the right, then Open Preview Tab. It shows that date\'s zmanim, schedule and parsha.'] },
  { id: 'web-page', title: 'Show a website on the screen', go: 'slides',
    body: ['Slides → + New Slide → Web page. Paste the address and click Save & check.', 'It checks whether the site allows being shown. Turn on Fullscreen on that slide to use the whole screen.', 'It loads fresh every time the slide comes up.'] },
  { id: 'photos', title: 'Show photos', go: 'images',
    body: ['Media → upload images or videos, or connect a Google Photos shared album.', 'Then + New Slide to give them a turn in the rotation.'] },
  { id: 'team-roles', title: 'Who can do what (Admin or Editor)', go: 'team',
    body: ['Admins can do everything, including Settings, Style and the Team tab.', 'Editors can post announcements and change slides, the schedule, Daily Word, media and feeds. They can not change Settings, Style or who has a login.', 'The Team tab only shows for admins. Everyone has My account, where they change their own name and password.'] },
  { id: 'team-add', title: 'Give someone their own login', go: 'team',
    body: ['Team → Add person. Type their name and pick Editor (or Admin).', 'You get a link to send them (there is a WhatsApp button). It works once and expires in 7 days. They open it and choose their own password.', 'The link is only shown once. If it gets lost, open the person\'s Manage menu and choose New invite / password reset link.'] },
  { id: 'team-forgot', title: 'Someone forgot their password', go: 'team',
    body: ['Team → Manage on their card → Sign-in link. Send them the link: it signs them in once and expires in 1 hour. Then they can set a new password under My account.', 'Or choose New invite / password reset link to let them pick a new password straight away.'] },
  { id: 'team-2step', title: 'The 2-step code (authenticator app)', go: 'account',
    body: ['Admins always sign in with a 6-digit code from an authenticator app. Editors can turn it on under My account → 2-step code.', 'If someone loses their phone, an admin opens Team → Manage → Reset 2-step; they set it up again the next time they sign in.', 'You can also use My account → Sign out other devices if a device is lost.'] },
  { id: 'undo', title: 'Undo a change I just made', go: 'history',
    body: ['Home → Recent changes (or the person icon → Recent changes).', 'Each line says who changed what. Tap Undo to put it back: a deleted or edited announcement, a slide switched off, a schedule or setting change.', 'If someone changed the same thing since, Undo refuses and tells you, so it never overwrites newer work. Admins see everyone; editors see their own changes and the shared content.'] },
  { id: 'change-tomorrow', title: 'Change tomorrow\'s schedule (or one day)', go: 'schedule',
    body: ['Home → Change tomorrow (or Schedule → Change tomorrow).', 'Pick Today, Tomorrow or any date, tap a time to change it, Cancel a block, or add a one-off. Save for that date only.', 'The normal weekly schedule is untouched. Back to normal schedule removes your change for that date.'] },
  { id: 'health', title: 'Is everything working? (System health)', go: 'health',
    body: ['Home → System health. Green means fine, amber means keep an eye on it, red means do something.', 'It checks the screen is connected, the zmanim and other data are fresh, news feeds and photo albums synced, disk space, the clock and more, with a plain-English fix. Buttons only appear for fixes you are allowed to run.'] },
  { id: 'team-activity', title: 'See who changed what', go: 'team',
    body: ['Team → Activity lists what each person did and when, newest first. Use the person box to see just one person.', 'Announcements also show "Posted by" and "edited by" under each message.', 'Remove or sign out someone from Team → Manage. Their access stops straight away.'] },
  { id: 'phone', title: 'Open the admin from my phone', go: 'this-screen',
    body: ['On the same Wi-Fi, go to http://<the Pi\'s address>:3000/admin.', 'At the TV itself: tap the top-left corner 5 times quickly to get the login box.'] },
  { id: 'tv-wrong', title: 'The TV looks wrong or stuck', go: 'this-screen',
    body: ['Try Refresh Data under the preview first.', 'If the picture itself is broken, the screen restarts itself every few hours and also when it detects a graphics problem. You can force it with: sudo systemctl restart tachtach-kiosk (on the Pi).'] },
  { id: 'update', title: 'Get the newest version', go: 'this-screen',
    body: ['On the Pi run: bash ~/tachtach-screens/deploy/update.sh. Your messages, schedule and settings are kept.'] },
  { id: 'password', title: 'I forgot the password or lost my authenticator', go: 'team',
    body: ['If you are an admin and another admin is still signed in, they can use Team → Manage → Sign-in link / Reset 2-step for you. Editors: ask an admin.', 'If nobody can get in, on the Pi run: npm run reset-admin (inside the tachtach-screens folder). It resets the password and 2-step code without erasing anything.', 'Never run setup.js again: it wipes your data.'] },
];

/** First-visit tour: short, with a button that jumps to each place. */
export const TOUR = [
  { title: 'Welcome to TachTach', text: 'This panel controls the TV. Everything you change here appears on the screen within a second or two. This 1-minute tour shows where things are; you can reopen it any time from Help.', go: null },
  { title: 'The screen has three parts', text: 'A side column (clock, date, parsha, weather), a big page that rotates through your slides, and a banner that appears only when you post one. The live preview on the right of every page shows exactly what the TV shows.', go: null },
  { title: 'Slides: what rotates', text: 'Switch slides on or off, set how long each shows, drag to reorder. Zmanim, learning, schedule, weather and the Daily Word are built in. + New Slide adds your own.', go: 'slides', goLabel: 'Show me Slides' },
  { title: 'Announcements: say something', text: 'Messages, banners, side notes and full-screen takeovers all live here. Post, edit while live, repeat weekly, or bring an old one back with Again.', go: 'announcements', goLabel: 'Show me Announcements' },
  { title: 'Schedule: the day\'s times', text: 'Build your weekly schedule once with the wizard, then change single dates or paste from Claude. Reminders count down on screen before each item.', go: 'schedule', goLabel: 'Show me Schedule' },
  { title: 'Daily Word', text: 'A new word every day, with how to say it and how to use it. See what is coming up, browse the archive of past words, and pin a word to a special day.', go: 'daily-word', goLabel: 'Show me Daily Word' },
  { title: 'Help is always here', text: 'The Help tab has a get-started checklist, plain-English answers to common questions, and what to do if something looks wrong.', go: 'help', goLabel: 'Open Help' },
];
