import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const mode = process.argv[2] || 'test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + dir + '/ep004.html');
await page.evaluate(() => document.fonts.ready);
const el = await page.$('#stage');
if (mode === 'test') {
  const times = process.argv.slice(3).map(Number);
  for (const t of times) {
    await page.evaluate((t) => window.render(t), t);
    await el.screenshot({ path: `${dir}/test_${t}.png` });
  }
} else {
  const fps = 24; const total = Math.ceil((await page.evaluate(() => window.TOTAL)) * fps);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), `${dir}/video_only.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.render(t), f / fps);
    const buf = await el.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 120 === 0) console.error('frame', f);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
}
await browser.close();
