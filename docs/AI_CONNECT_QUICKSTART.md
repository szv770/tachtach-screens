# Connect Claude to your screens: quick start

You can tell Claude things like "cancel the 10:30 Seder today" or "post a banner until 3 PM", and it changes the screen for you.
You tap **Allow** in Claude on every change, and every change shows in **Recent changes** as "by AI" with an Undo.

## Five steps (about two minutes)

1. **Update the screen** to the version that has this (Look & Settings > System health > Software update, or `deploy/update.sh`).
2. **Turn it on:** admin > Look & Settings > **Connect an AI** > turn on **Allow AI connections**. The page checks your address and tells you
   what to fix, in plain words.
3. **Copy the address** shown on that page (it ends in `/mcp`, for example `https://tachtach.yourschool.org/mcp`).
4. **Add it in Claude** (claude.ai, the phone app or Claude Desktop): **Customize > Connectors > + Add custom connector**. Name it
   TachTach, paste the address, leave the advanced boxes empty, press **Add** then **Connect**. Your normal TachTach sign-in opens: sign in,
   then tap **Allow: look and change things** (or **look only**).
5. **Ask.** "What's on the screen right now?" is a good first one.

You do not copy any key for claude.ai. (Claude Code and scripts can use a key: Connect an AI > "Other apps: make a key".)

## If it does not connect

Run the doctor from any computer that has this project (it looks at your screen from the outside, like Claude does):

```bash
npm run ai:doctor -- https://tachtach.yourschool.org
```

It prints a tick or a cross for each thing Claude needs and says what to do. The usual causes:

| Doctor says | What it means | Fix |
|---|---|---|
| `/mcp does not exist here` | AI connections are off, or the screen was not updated yet | Do steps 1 and 2 |
| `Cloudflare is showing a "checking your browser" page` | Cloudflare is blocking the AI app's servers | Cloudflare > Security > WAF: add ONE custom rule that **skips** the security checks when the path starts with `/mcp`, `/oauth` or `/.well-known` (works for every AI app; for Claude alone `160.79.104.0/21` also works), or turn off Bot Fight Mode for those paths |
| `Cloudflare Access (a sign-in wall)` | The app cannot get past a login in front of the screen | Cloudflare Access policy "Bypass" for those paths (or `160.79.104.0/21` for Claude), or no Access on this address |
| `The connector description says its address is ...` | The screen does not know its public address | Set `PUBLIC_URL=https://your.address` for the screen and restart it |
| `only reachable inside your building` / `http, not https` | You used the home-network address | Use the public address (the Cloudflare Tunnel name), always `https://` |

Add `--redirect https://the-app/callback` to check that another AI app's return address is allowed. Add `--key ttk_...` to also see what an AI with that key can do. `--no-register` skips the test registration, `--allow-http` is for a
test on your own network.

## Other AI apps (Meta AI / Muse, ChatGPT, Cursor, anything else)

The same address and sign-in work for other AI apps. Built in: **Claude, Meta AI, ChatGPT, Cursor** (and Claude Code / VS Code on the same computer). In the other app add a
custom connector / MCP server, paste the address from step 3 and press Connect: your TachTach sign-in opens, you tap Allow, done.

An app that is not built in is **turned away the first time** (a stranger must not be able to receive a sign-in). Then: admin > Connect an AI >
**Other AI apps**: the app is listed under "Tried to connect and were turned away" with its website. If it is the app you just tried, press
**Allow this app**, then connect again. (You can also paste the app's return / callback address under "Allow another app".) **Recent connection
attempts** on the same card shows how far an app got (introduced itself, opened the sign-in, you tapped Allow, asked for its key), so "it says it hit a
problem" can be read there.

An app or chat bridge that cannot sign in (for example an agent you message on WhatsApp) can use a **key** instead: Connect an AI > Other apps: make a
key, and paste it where the app asks for an `Authorization: Bearer` header.

## What Claude can do now

Look at the screen, the schedule, the slides, posts and recent changes. Change the schedule: cancel, move, rename or add a block for one day
or for every week, or replace a whole day or week. Post messages, banners, side notes and takeovers with every setting the Post sheet has
(layout, look, how long, until the end of Shabbos, repeats). Pause, skip, blank or freeze the TV for a set time. Switch slides on or off,
move them, set how long they stay. Add Daily Story / Word / Letter entries in bulk and change what shows today. Change the theme, Hebrew
size, orientation and the posting defaults. Undo.

Not through Claude yet: pictures and videos, web pages and feeds, Menu, Shiurim, Occasions, the Shabbos page, Custom days, logo and
location, Test Averages. Names (Bochurim, Chazan), people, security and software updates are never available.

## Safety in one paragraph

Claude can only do what the person who connected it can do, minus names, people, security and updates. It must show you a plain-words
preview of every change and wait for your yes, and your Claude app asks you to tap Allow (do not tap "Allow always" on tools that change
things). It is limited to 10 changes a minute and 60 a day per connection (an admin can change that). You can look-only a connection,
remove it, or cut off everyone with one button, and signing out everywhere cuts your connections too.
