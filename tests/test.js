const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const fails = [];
  const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails.push(m); };

  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1000, height: 1400 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    if (scheme === 'dark') {
      ok(errors.length === 0, 'no JS errors  ' + JSON.stringify(errors.slice(0, 3)));

      const sub = await page.textContent('#sub');
      ok(/Run 2026\.08\.14/.test(sub), 'data.json loaded and run date shown  -> "' + sub + '"');

      const pills = await page.$$eval('.counts .pill', els => els.map(e => e.textContent.trim()));
      ok(pills.some(p => /^7 software/.test(p)), '7 software counted  -> ' + JSON.stringify(pills));
      ok(pills.some(p => /^5 hardware/.test(p)), '5 hardware counted');
      ok(pills.some(p => /^3 urgent/.test(p)), '3 urgent counted (Samsara, RTX digital hw, Roblox builders)');

      const heads = await page.$$eval('h2', els => els.map(e => e.textContent.trim()));
      ok(heads.some(h => /NeedsManualCheck8/.test(h.replace(/\s+/g, ''))), '8 watch pages  -> ' + JSON.stringify(heads));

      const banner = await page.textContent('#notice');
      ok(/Local only mode/.test(banner), 'local only banner shown when unconfigured');

      const syncLbl = await page.textContent('#syncPill .lbl');
      ok(syncLbl.trim() === 'Local only', 'sync pill reads Local only  -> "' + syncLbl.trim() + '"');

      // click Mark as applied on the first card
      const firstTitle = await page.textContent('.card .title a');
      await page.click('.card button.pri');
      await page.waitForTimeout(250);

      const appliedPill = await page.$eval('.counts .pill:nth-last-child(2)', e => e.textContent.trim());
      ok(/^1 applied/.test(appliedPill), 'applied count incremented  -> "' + appliedPill + '"');

      const trackerCards = await page.$$eval('h2', els => {
        const h = els.find(x => /Application Tracker/.test(x.textContent));
        return h ? h.textContent.trim() : '';
      });
      ok(/1$/.test(trackerCards.replace(/\s+/g, '')), 'role moved into Application Tracker');

      const toastTxt = await page.textContent('#toast');
      ok(/this browser only/.test(toastTxt), 'honest toast about local only save  -> "' + toastTxt + '"');

      // reload and confirm persistence
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const after = await page.$eval('.counts .pill:nth-last-child(2)', e => e.textContent.trim());
      ok(/^1 applied/.test(after), 'applied state survived reload via localStorage');

      const stored = await page.evaluate(() => localStorage.getItem('jobradar.state.v1'));
      ok(stored && stored.includes('applied'), 'localStorage holds state');
      const q = await page.evaluate(() => localStorage.getItem('jobradar.queue.v1'));
      ok(!q || q === '[]' || q === null, 'no write queued while unconfigured  -> ' + q);

      // undo
      await page.click('.card.applied button');
      await page.waitForTimeout(200);
      const undone = await page.$eval('.counts .pill:nth-last-child(2)', e => e.textContent.trim());
      ok(/^0 applied/.test(undone), 'undo applied works  -> "' + undone + '"');
      console.log('      first card was: ' + firstTitle);
    }

    await page.screenshot({ path: `shot_${scheme}.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILURES' : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})();
