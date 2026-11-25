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
| `Cloudflare is showing a "checking your browser" page` | Cloudflare is blocking Claude's servers | Cloudflare > Security > WAF: add a custom rule that **skips** the checks for `160.79.104.0/21`, or turn off Bot Fight Mode for `/mcp`, `/oauth`, `/.well-known` |
| `Cloudflare Access (a sign-in wall)` | Claude cannot get past a login in front of the screen | Cloudflare Access policy "Bypass" for `160.79.104.0/21`, or no Access on this address |
| `The connector description says its address is ...` | The screen does not know its public address | Set `PUBLIC_URL=https://your.address` for the screen and restart it |
| `only reachable inside your building` / `http, not https` | You used the home-network address | Use the public address (the Cloudflare Tunnel name), always `https://` |

Add `--key ttk_...` to also see what an AI with that key can do. `--no-register` skips the test registration, `--allow-http` is for a
test on your own network.

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
