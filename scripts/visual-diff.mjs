// Visual regression check: original standalone build (archive/showup-standalone) vs the Next.js port.
//
//   node scripts/visual-diff.mjs baseline                 capture the original (serves it on :8765)
//   node scripts/visual-diff.mjs port [baseUrl]           capture the port (default http://localhost:3000)
//   node scripts/visual-diff.mjs compare                  pixel-diff the two sets → .visual/report.txt
//   node scripts/visual-diff.mjs all [baseUrl]            all three
//
// Deterministic by design: prefers-reduced-motion is emulated, sessionStorage 'showup-dots-seen' is
// set before load, Google Fonts is blocked (both sides fall back to the bundled Manrope), and every
// capture waits for document.fonts.ready.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.visual');
const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];
const BASE_PORT = 8765;

const click =
  (name, opts = {}) =>
  async (p) => {
    await p
      .getByRole('button', { name, exact: true, ...opts })
      .first()
      .click();
  };
const settle = (ms) => async (p) => {
  await p.waitForTimeout(ms);
};

// Each scenario: which page + start screen, then optional steps (simple clicks only).
const ALL_SCENARIOS = [
  { id: 'landing', page: 'main', start: 'landing' },
  { id: 'landing-name-error', page: 'main', start: 'landing', steps: [click('Next')] },
  { id: 'create', page: 'main', start: 'create' },
  { id: 'respond', page: 'main', start: 'respond' },
  { id: 'respond-day-free', page: 'main', start: 'respond', steps: [click('Free')] },
  { id: 'respond-missing-willingness', page: 'main', start: 'respond', steps: [click('Free'), click('Submit response')] },
  { id: 'respond-conditions-sheet', page: 'main', start: 'respond', steps: [click('Free'), click('If…'), settle(400)] },
  {
    id: 'respond-conditions-chips',
    page: 'main',
    start: 'respond',
    steps: [
      click('Free'),
      click('If…'),
      settle(300),
      async (p) => {
        await p.getByRole('textbox', { name: 'What would make you go' }).fill("if Sam's going and there's at least 5 of us");
      },
      settle(900),
    ],
  },
  { id: 'fresh', page: 'main', start: 'fresh' },
  { id: 'join', page: 'main', start: 'join' },
  { id: 'join-error', page: 'main', start: 'join', steps: [click('Continue')] },
  { id: 'guest', page: 'main', start: 'guest' },
  { id: 'participant', page: 'main', start: 'participant' },
  {
    id: 'participant-saved',
    page: 'main',
    start: 'participant',
    steps: [click('Free'), click('Yes'), click('Submit response'), settle(1200)],
  },
  { id: 'sample', page: 'event' },
  { id: 'sample-reminder', page: 'event', steps: [click('Draft reminder')] },
  { id: 'sample-propose-sheet', page: 'event', steps: [click('Propose a time'), settle(400)] },
  {
    id: 'sample-propose-error',
    page: 'event',
    steps: [
      click('Propose a time'),
      settle(300),
      async (p) => {
        await p.fill('#p-min', '1');
      },
      click('Save proposal'),
    ],
  },
];

// ONLY=<regex> limits the run to matching scenario ids (e.g. ONLY='^sample' npm run visual -- all).
const SCENARIOS = process.env.ONLY ? ALL_SCENARIOS.filter((s) => new RegExp(process.env.ONLY).test(s.id)) : ALL_SCENARIOS;

function baselineUrl(sc) {
  return `http://localhost:${BASE_PORT}/${sc.page === 'event' ? 'Event.dc.html' : 'Main.dc.html'}`;
}
function portUrl(base, sc) {
  if (sc.page === 'event') return base + '/example';
  return sc.start === 'landing' ? base + '/' : base + '/preview/' + sc.start;
}

async function capture(kind, base) {
  const dir = path.join(OUT, kind);
  fs.mkdirSync(dir, { recursive: true });
  let server = null;
  if (kind === 'baseline') {
    server = spawn('python3', ['-m', 'http.server', String(BASE_PORT), '--bind', '127.0.0.1'], {
      cwd: path.join(ROOT, 'archive/showup-standalone'),
      stdio: 'ignore',
    });
    await new Promise((r) => setTimeout(r, 800));
  }
  const browser = await chromium.launch();
  const errors = [];
  try {
    for (const vp of WIDTHS) {
      for (const sc of SCENARIOS) {
        const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
        await ctx.addInitScript(() => {
          try {
            window.sessionStorage.setItem('showup-dots-seen', '1');
          } catch (e) {}
        });
        await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
        if (kind === 'baseline' && sc.page === 'main') {
          // Seed the start screen the same way the canvas boards did: change the startAt default.
          await ctx.route('**/js/main.js', async (route) => {
            const res = await route.fetch();
            const body = (await res.text()).replace('"default":"landing"', `"default":"${sc.start}"`);
            await route.fulfill({ response: res, body });
          });
        }
        const page = await ctx.newPage();
        page.on('console', (m) => {
          if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.location().url || ''))
            errors.push(`${kind} ${sc.id}@${vp.w}: ${m.text()}`);
        });
        page.on('pageerror', (e) => errors.push(`${kind} ${sc.id}@${vp.w}: ${e.message}`));
        const url = kind === 'baseline' ? baselineUrl(sc) : portUrl(base, sc);
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForSelector('.su');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        for (const step of sc.steps || []) {
          await step(page);
          await page.waitForTimeout(350);
        }
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(dir, `${sc.id}--${vp.w}.png`), fullPage: true });
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log(`${kind}: ${SCENARIOS.length * WIDTHS.length} captures → ${dir}`);
  if (errors.length) console.log('console errors:\n  ' + errors.join('\n  '));
}

function compare() {
  const bdir = path.join(OUT, 'baseline'),
    pdir = path.join(OUT, 'port'),
    ddir = path.join(OUT, 'diff');
  fs.mkdirSync(ddir, { recursive: true });
  const lines = [];
  let bad = 0;
  for (const vp of WIDTHS)
    for (const sc of SCENARIOS) {
      const f = `${sc.id}--${vp.w}.png`;
      if (!fs.existsSync(path.join(pdir, f)) || !fs.existsSync(path.join(bdir, f))) {
        lines.push(`MISSING  ${f}`);
        bad++;
        continue;
      }
      const a = PNG.sync.read(fs.readFileSync(path.join(bdir, f)));
      const b = PNG.sync.read(fs.readFileSync(path.join(pdir, f)));
      if (a.width !== b.width || a.height !== b.height) {
        lines.push(`SIZE     ${f}  baseline ${a.width}x${a.height}  port ${b.width}x${b.height}`);
        bad++;
        continue;
      }
      const d = new PNG({ width: a.width, height: a.height });
      const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.1 });
      if (n) {
        fs.writeFileSync(path.join(ddir, f), PNG.sync.write(d));
        bad++;
      }
      lines.push(`${n ? 'DIFF    ' : 'OK      '} ${f}${n ? `  ${n} px` : ''}`);
    }
  const report = lines.join('\n');
  fs.writeFileSync(path.join(OUT, 'report.txt'), report + '\n');
  console.log(report);
  console.log(bad ? `\n${bad} capture(s) differ` : '\nall captures identical');
  return bad;
}

const [mode = 'all', base = 'http://localhost:3000'] = process.argv.slice(2);
if (mode === 'baseline' || mode === 'all') await capture('baseline');
if (mode === 'port' || mode === 'all') await capture('port', base);
if (mode === 'compare' || mode === 'all') process.exitCode = compare() ? 1 : 0;
