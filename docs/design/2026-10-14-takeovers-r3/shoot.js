// usage: NODE_PATH=$(npm root -g) node shoot.js list.json [outdir]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = path.resolve(process.argv[3] || 'shots'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
  await Promise.all(Array.from({ length: 4 }, async (_, w) => {
    const p = await ctx.newPage();
    for (let i = w; i < list.length; i += 4) {
      const [name, qs] = list[i];
      await p.goto('file://' + path.join(__dirname, 'takeovers.html') + '?' + qs);
      await p.waitForFunction('window.__ready === true', null, { timeout: 30000 });
      await p.waitForTimeout(150);
      await p.screenshot({ path: path.join(out, name + '.png') });
      console.log('ok', name);
    }
  }));
  await b.close();
})();
