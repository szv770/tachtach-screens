/**
 * The public homepage (GET /): what a stranger sees at the bare address. Static text only: no
 * data, no school details, no scripts. Links to staff sign-in and the live-view word page.
 */
export const HOME_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const FEATURES = [
  ['Today at a glance', 'Zmanim, the Hebrew and English date, the parsha and the weather, always up to date.'],
  ['Daily learning', 'Chitas, Hayom Yom, Rambam, Pirkei Avos, a daily word and a daily quote.'],
  ['The school day', 'The timetable with what is on now and what is next, for each group if needed.'],
  ['Messages that stand out', 'Slides, scrolling banners and full-screen announcements, posted from a phone in seconds.'],
  ['Photos, video and web pages', 'Pictures, videos, PDFs, news feeds and live web pages such as a fundraiser.'],
  ['Birthdays and celebrations', 'A happy page that shows only on the days there is something to celebrate.'],
];

export function homePage() {
  const items = FEATURES.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>TachTach Screens</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#12100C;color:#EFE3C0;font-family:Georgia,'Times New Roman',serif;line-height:1.55;padding:40px 22px 56px}
main{max-width:760px;margin:0 auto}
header{text-align:center;margin-bottom:34px}
img{width:92px;height:92px;border-radius:22px;box-shadow:0 8px 30px rgba(0,0,0,.45)}
h1{font-size:clamp(34px,6vw,52px);margin:20px 0 8px;letter-spacing:.01em}
.tag{font-size:clamp(18px,3vw,22px);color:#CDBF9A;margin:0 auto;max-width:560px}
.btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:28px 0 8px}
a.b{display:inline-block;padding:14px 26px;border-radius:14px;font-size:19px;font-weight:700;text-decoration:none;min-height:48px}
a.p{background:#D9B857;color:#1a1608}
a.s{border:1px solid #6b5d3a;color:#EFE3C0}
h2{font-size:22px;color:#D9B857;margin:44px 0 14px;text-align:center}
ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
li{background:#1c1912;border:1px solid #3a321f;border-radius:16px;padding:16px 18px}
li b{display:block;font-size:19px;margin-bottom:4px}
li span{color:#CDBF9A;font-size:16px}
p.how{color:#CDBF9A;text-align:center;max-width:620px;margin:0 auto;font-size:17px}
footer{text-align:center;color:#8f8460;font-size:14px;margin-top:46px}
</style></head>
<body><main>
<header><img src="/icons/logo-mark.png" alt="">
<h1>TachTach Screens</h1>
<p class="tag">Digital signage for a Jewish school: one display in the hall that shows the day, the learning and the news, run from any phone.</p>
<div class="btns"><a class="b p" href="/live">Watch the screen</a><a class="b s" href="/login">Staff sign in</a></div></header>
<h2>What the screen does</h2>
<ul>${items}</ul>
<h2>How it works</h2>
<p class="how">A small computer behind the TV keeps everything fresh by itself. Staff sign in from a phone or laptop to change what is shown. Parents and friends can watch a live copy of the screen with a link the school shares.</p>
<footer>TachTach Screens</footer>
</main></body></html>`;
}
