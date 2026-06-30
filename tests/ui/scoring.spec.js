const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T20 acceptance (runtime wiring): a correctly-timed press credits + pulses the
// note, and the end-of-song report appears with every yours-note accounted.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test('T20: a correctly-timed key press credits the note and pulses it', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // start a scored PLAY run, then pause and park exactly on the first note's onset
  const note = await page.evaluate(() => {
    UI.mode = 'play';
    Transport.play();            // Score.reset() — run is now scoring
    Transport.pause();
    const n = Song.activeNotes[0];
    Transport.songTime = n.startSec;
    return { key: n.key };
  });

  await page.keyboard.press(note.key);   // press the note's letter -> dead-on credit

  const res = await page.evaluate(() => ({
    recs: Score.records.length,
    tier: Score.records[0] && Score.records[0].tier,
    pulses: notePulse.size,
  }));
  expect(res.recs).toBeGreaterThan(0);
  expect(['perfect', 'good', 'okay']).toContain(res.tier);
  expect(res.pulses).toBeGreaterThan(0);
});

test('T20: song end shows the report with every yours-note accounted', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // play a scored run and fast-forward the transport so it reaches the end
  const fell = await page.evaluate(() => {
    UI.mode = 'play';
    Transport.targetRate = 4;     // fast-forward (max effective rate); the real end-of-song hook fires showReport
    Transport.play();
    return Song.activeNotes.length;
  });

  await expect(page.locator('#reportCard')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#reportCard')).toContainText('SONG COMPLETE');
  await expect(page.locator('#reportCard')).toContainText('/' + fell + ' HIT');
});
