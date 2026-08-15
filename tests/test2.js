const { chromium } = require('playwright');

const CTL = 'http://127.0.0.1:8898/__ctl';
const PAGE = 'http://127.0.0.1:8899/index.test.html';

(async () => {
  const fails = [];
  const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails.push(m); };
  const ctl = async q => (await fetch(CTL + q)).json();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const pill = () => page.textContent('#syncPill .lbl').then(s => s.trim());
  const load = async () => { await page.goto(PAGE, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };

  // ---- 1. clean sync against empty sheet
  await ctl('?reset=1&mode=ok');
  await load();
  ok(errors.length === 0, 'no JS errors  ' + JSON.stringify(errors.slice(0, 2)));
  ok((await pill()) === 'Synced', 'pill reads Synced when endpoint is healthy  -> "' + (await pill()) + '"');
  const banner1 = await page.textContent('#notice');
  ok(!/Local only mode/.test(banner1), 'no local only banner when configured');

  // ---- 2. write reaches the sheet
  await page.click('.card button.pri');
  await page.waitForTimeout(600);
  let s = await ctl('');
  ok(s.rows.length === 1 && s.rows[0].status === 'applied', 'applied row written to sheet  -> ' + JSON.stringify(s.rows[0] || {}));
  ok(s.rows[0].company === 'Samsara', 'role and company carried into the sheet  -> ' + s.rows[0].company);
  ok(!s.log.includes('PREFLIGHT'), 'no CORS preflight was issued  -> ' + JSON.stringify(s.log));
  ok((await pill()) === 'Synced', 'pill returns to Synced after write');

  // ---- 3. remote is source of truth on a fresh browser
  await page.evaluate(() => localStorage.clear());
  await load();
  const applied = await page.$eval('.counts .pill:nth-last-child(2)', e => e.textContent.trim());
  ok(/^1 applied/.test(applied), 'state restored from sheet after localStorage wipe  -> "' + applied + '"');

  // ---- 4. endpoint down: honest failure, no data loss
  await ctl('?mode=fail');
  await page.click('.card button.pri');            // mark a second role
  await page.waitForTimeout(800);
  ok(/Sync failed/.test(await pill()), 'pill reports failure, not success  -> "' + (await pill()) + '"');
  const banner2 = await page.textContent('#notice');
  ok(/Could not reach the tracker sheet|reach/.test(banner2), 'failure banner explains what happened');
  ok(/Nothing has been lost/.test(banner2), 'banner reassures state is kept');
  const applied2 = await page.$eval('.counts .pill:nth-last-child(2)', e => e.textContent.trim());
  ok(/^2 applied/.test(applied2), 'local UI still reflects the change  -> "' + applied2 + '"');
  const qlen = await page.evaluate(() => JSON.parse(localStorage.getItem('jobradar.queue.v1') || '[]').length);
  ok(qlen === 1, 'exactly one write is queued for retry  -> ' + qlen);
  const savingTag = await page.$$eval('.tag.q', e => e.length);
  ok(savingTag >= 1, 'card shows a SAVING badge while unsynced  -> ' + savingTag);

  // ---- 5. recovery flushes the queue
  await ctl('?mode=ok');
  await load();
  await page.waitForTimeout(700);
  ok((await pill()) === 'Synced', 'pill recovers to Synced  -> "' + (await pill()) + '"');
  const qlen2 = await page.evaluate(() => JSON.parse(localStorage.getItem('jobradar.queue.v1') || '[]').length);
  ok(qlen2 === 0, 'queue drained after recovery  -> ' + qlen2);
  s = await ctl('');
  ok(s.rows.length === 2, 'both roles now in the sheet  -> ' + s.rows.length);

  // ---- 6. wrong secret is surfaced, not swallowed
  await ctl('?mode=badsecret');
  await load();
  ok(/Sync failed/.test(await pill()), 'bad secret reports failure  -> "' + (await pill()) + '"');
  ok(/bad secret/.test(await page.textContent('#notice')), 'bad secret message shown to the user');

  await browser.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILURES' : '\nall sync checks passed');
  process.exit(fails.length ? 1 : 0);
})();
