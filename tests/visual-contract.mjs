/* Visual proof for the NebraskaBeans decision map.
 *
 * Rewritten alongside browser-smoke when the legacy map UI was retired. The shape of the proof
 * is unchanged: prove the map is actually drawn, prove the time control sits directly under it,
 * prove it survives a phone, and leave screenshots behind as the artefact. What changed is the
 * UI it points at.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.NB_BASE_URL || 'http://127.0.0.1:4173/';
const OUT = process.env.NB_VISUAL_OUT || 'artifacts/visual-proof';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const box = sel => page.locator(sel).boundingBox();
const visible = sel => page.locator(sel).isVisible();

/* How much of the map is covered by the interpolated surface, and how varied it is. A surface
 * that paints one flat colour everywhere is indistinguishable from a bug. */
const surface = () => page.evaluate(() => {
  const cv = document.querySelector('canvas.nbSurface');
  if (!cv) return null;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let painted = 0, total = 0;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) {
    total++;
    if (d[i + 3] > 0) {
      painted++;
      seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
    }
  }
  return { painted, total, shades: seen.size };
});

const setSelect = (id, v) => page.evaluate(([i, val]) => {
  const el = document.getElementById(i);
  el.value = val;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, v]);

try {
  const r = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert(r?.ok(), `page response not OK: ${r?.status()}`);
  await page.waitForFunction(
    () => document.querySelectorAll('#nbMap path').length > 0 &&
          /reporting stations/i.test(document.getElementById('nbReadout')?.textContent || ''),
    null, { timeout: 45000 });
  await page.waitForTimeout(700);

  /* ---- the map is a map, not an empty frame ---- */
  const map = await box('#nbMap');
  assert(map && map.width > 600 && map.height > 380, 'map is missing or too small to read');
  const paths = await page.locator('#nbMap path').count();
  assert(paths >= 7, `growing-region outlines not drawn: ${paths} paths`);
  const dots = await page.locator('#nbMap path.leaflet-interactive').count();
  assert(dots > 0, 'no station markers drawn');

  const s = await surface();
  assert(s && s.painted > 0, 'the interpolated surface painted nothing');
  assert(s.shades >= 4,
    `the surface is effectively one flat colour (${s.shades} shades) — it is not interpolating`);

  /* ---- playback directly under the map ---- */
  const frame = await box('.nbMapFrame');
  const playback = await box('.nbPlayback');
  assert(playback, 'playback control missing');
  assert(playback.y >= frame.y + frame.height - 4, 'playback is not below the map');
  const gap = playback.y - (frame.y + frame.height);
  assert(gap < 40, `playback is not directly below the map (${Math.round(gap)}px of furniture between)`);

  /* speed control lives with the play button it controls */
  const play = await box('#nbPlay');
  const speed = await box('#nbSpeed');
  assert(speed, 'playback speed control missing');
  assert(Math.abs(speed.y - play.y) < 120, 'speed control is not beside the play button');

  /* planting and harvest windows are drawn on the timeline itself */
  const phases = await page.locator('#nbPhases .nbPhase').count();
  assert(phases >= 1, 'no crop-phase band drawn on the timeline');

  /* ---- legend states what the colours mean, and is never blank ---- */
  assert(await visible('#nbLegend'), 'map legend is not visible');
  const legend = (await page.locator('#nbLegend').textContent()).trim();
  assert(legend.length > 30, 'map legend is empty');
  assert(/water|maturity|days/i.test(legend), 'legend does not name what it is measuring');

  /* ---- each view redraws ---- */
  const shades = {};
  for (const view of ['moisture', 'stage', 'heat']) {
    await setSelect('nbView', view);
    await page.waitForTimeout(400);
    const v = await surface();
    assert(v.painted > 0, `${view} view painted nothing`);
    shades[view] = v.shades;
    await page.screenshot({ path: `${OUT}/desktop-${view}.png`, fullPage: false });
  }

  await page.screenshot({ path: `${OUT}/desktop-current.png`, fullPage: true });

  /* ---- a phone still gets a usable map and a usable playback ---- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  assert(await visible('#nbMap'), 'map hidden on mobile');
  assert(await visible('.nbPlayback'), 'playback hidden on mobile');
  assert(await visible('#nbPlay'), 'play button hidden on mobile');
  assert(await visible('#nbCrop'), 'crop picker hidden on mobile');
  const mMap = await box('#nbMap');
  assert(mMap.width <= 390, 'map overflows the phone viewport');
  const mPlay = await box('.nbPlayback');
  assert(mPlay.y > mMap.y, 'playback is not below the map on mobile');
  await page.screenshot({ path: `${OUT}/mobile.png`, fullPage: true });

  const fatal = errors.filter(x => !/Failed to load resource|favicon|net::/i.test(x));
  assert.equal(fatal.length, 0, `browser errors: ${fatal.join(' | ')}`);

  console.log(JSON.stringify({
    status: 'PASS', base: BASE,
    regionOutlines: paths,
    surfaceShadesByView: shades,
    playbackGapPx: Math.round(gap),
    phaseBands: phases,
    screenshots: ['desktop-moisture.png', 'desktop-stage.png', 'desktop-heat.png',
                  'desktop-current.png', 'mobile.png'],
  }, null, 2));
} finally {
  await browser.close();
}
