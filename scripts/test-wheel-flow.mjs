// Integration smoke test for the supplied wheel picker and SHOWUP's linear
// cross-midnight minute convention. Requires a prior `npm run build`.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const port = 4001;
const base = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], { stdio: 'ignore' });

function assert(value, message) {
  if (!value) throw new Error(message);
}

let browser;
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    up = await fetch(base).then(
      () => true,
      () => false,
    );
  }
  assert(up, 'next start did not come up; run `npm run build` first');

  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|\/api\/events$/.test(message.location().url || '')) {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto(`${base}/preview/create`, { waitUntil: 'load' });
    await page.getByText('7 hr window', { exact: true }).waitFor();
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${width}px Create page has horizontal overflow`,
    );

    const until = page.locator('.time-picker-field').filter({ hasText: 'Until' });
    await until.getByRole('spinbutton', { name: 'Hour' }).press('ArrowDown');
    await page.getByText('8 hr window', { exact: true }).waitFor();

    // Create posts to /api/events; intercepted here so the test needs no database.
    const posted = [];
    const replies = [
      { status: 400, body: { error: { code: 'invalid_input', field: 'days[0].end', message: 'Server says no.' } } },
      {
        status: 201,
        body: { id: 'AAAAAAAAAAAAAAAA', guestPath: '/e/AAAAAAAAAAAAAAAA', organiserPath: '/e/AAAAAAAAAAAAAAAA/admin?k=test' },
      },
    ];
    await page.route('**/api/events', (route) => {
      posted.push(route.request().postDataJSON());
      const reply = replies[posted.length - 1];
      return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
    });
    await page.route('**/e/AAAAAAAAAAAAAAAA/admin?k=test', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<p>organiser</p>' }),
    );

    await page.getByRole('button', { name: 'Create event' }).click();
    await page.getByRole('alert').filter({ hasText: 'Server says no.' }).waitFor();
    const days = posted[0]?.days ?? [];
    assert(
      days.length >= 2 && days.every((d) => d.start === 1020 && d.end === 1500),
      `${width}px posted the wrong window: ${JSON.stringify(days)}`,
    );
    await page.getByRole('button', { name: 'Create event' }).click();
    await page.waitForURL('**/e/AAAAAAAAAAAAAAAA/admin?k=test');
    assert(errors.length === 0, `${width}px browser errors on Create:\n${errors.join('\n')}`);

    // Respond for stored events arrives with B3; the wheels are checked on the prototype respond screen.
    await page.goto(`${base}/preview/respond`, { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Which times work for you?' }).waitFor();
    await page.getByRole('button', { name: 'Free', exact: true }).first().click();
    const range = page.getByRole('button', { name: /5pm – 12am\. Change times/ }).first();
    await range.waitFor();
    await range.click();
    const rangeWheels = page.locator('.range-wheels').first();
    assert(
      (await rangeWheels
        .locator('.time-picker-field')
        .filter({ hasText: 'From' })
        .getByRole('spinbutton', { name: 'Hour' })
        .getAttribute('aria-valuetext')) === '5',
      `${width}px Respond From wheel did not receive the organiser window`,
    );
    assert(
      (await rangeWheels
        .locator('.time-picker-field')
        .filter({ hasText: 'Until' })
        .getByRole('spinbutton', { name: 'Hour' })
        .getAttribute('aria-valuetext')) === '12',
      `${width}px Respond Until wheel did not convert 1440 to 12am`,
    );
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${width}px Respond page has horizontal overflow`,
    );
    assert(errors.length === 0, `${width}px browser errors:\n${errors.join('\n')}`);
    console.log(`ok  wheel flow @ ${width}px`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
