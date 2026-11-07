// Pre-deploy smoke test: loads every route in Chromium and fails on any console error, page error
// or bad status. Uses BASE_URL if set (e.g. a preview deployment); otherwise starts `next start`
// on a spare port, which needs a prior `npm run build`.
//
//   npm run build && npm run smoke
//   BASE_URL=https://showup-preview.example.com npm run smoke
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const STARTS = ['create', 'respond', 'fresh', 'join', 'guest', 'participant'];
const ROUTES = ['/', '/example', ...STARTS.map((s) => '/preview/' + s)];
// Google Fonts is optional (the app falls back to the bundled Manrope), and the Vercel Analytics script only exists on Vercel,
// so neither being unreachable is a failure.
const IGNORE = /fonts\.(googleapis|gstatic)\.com|_vercel\/insights/;

let server = null;
let base = process.env.BASE_URL;
if (!base) {
  const port = 3999;
  base = `http://127.0.0.1:${port}`;
  server = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], { stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await fetch(base + '/').then(
      () => true,
      () => false,
    );
  }
  if (!up) {
    server.kill();
    console.error('smoke: next start did not come up (did you run `npm run build`?)');
    process.exit(1);
  }
}

const failures = [];
const browser = await chromium.launch();
try {
  for (const route of ROUTES) {
    const page = await browser.newPage();
    const errs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORE.test(m.location().url || '')) errs.push('console: ' + m.text());
    });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => {
      if (!IGNORE.test(r.url())) errs.push('request failed: ' + r.url());
    });
    const res = await page.goto(base + route, { waitUntil: 'load' });
    if (!res || res.status() !== 200) errs.push('status ' + (res && res.status()));
    try {
      await page.waitForSelector('.su', { timeout: 10000 });
    } catch (e) {
      errs.push('app did not render (.su missing)');
    }
    await page.waitForTimeout(1500); // let mount-time timers (dot growth etc.) run
    console.log(`${errs.length ? 'FAIL' : 'ok  '} ${route}`);
    errs.forEach((e) => {
      console.log('       ' + e);
      failures.push(route + ' ' + e);
    });
    await page.close();
  }
  const res = await fetch(base + '/preview/not-a-start-screen');
  const okNotFound = res.status === 404;
  console.log(`${okNotFound ? 'ok  ' : 'FAIL'} /preview/not-a-start-screen → ${res.status} (expect 404)`);
  if (!okNotFound) failures.push('unknown preview did not 404');
} finally {
  await browser.close();
  if (server) server.kill();
}
if (failures.length) {
  console.error(`\nsmoke: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\nsmoke: all routes clean');
