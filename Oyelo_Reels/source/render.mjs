import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const [mode, reel, ...rest] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('file://' + dir + `/${reel}.html`);
await page.evaluate(() => document.fonts.ready);
const el = await page.$('#stage');
if (mode === 'test') {
  for (const t of rest.map(Number)) { await page.evaluate((t) => window.render(t), t); await el.screenshot({ path: `${dir}/test_${reel}_${t}.png` }); }
} else {
  const fps = 24, total = Math.ceil((await page.evaluate(() => window.TOTAL)) * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), `${dir}/${reel}_video.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.render(t), f / fps);
    const buf = await el.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 240 === 0) console.log(reel, 'frame', f, '/', total);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
}
if (errs.length) console.log('PAGE ERRORS', errs.slice(0, 3));
await browser.close();
