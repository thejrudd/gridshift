// Player matchup drilldown — automated layout and interaction checks.
//
// Runs against tests/drilldown/harness (the real component, fixture data) in
// three viewports and both themes. Each phase is checked for:
//   • every design element present, and none of the removed legacy elements
//   • no horizontal overflow, no overlapping sections, charts fitting their
//     sections, and no colliding SVG labels
//   • hover / tap / keyboard reveals that are fully visible and unobscured
//   • linked filters, scrubbing, disclosures and callbacks working
//
// Run: npm run test:drilldown
import process from 'node:process';
import { test, expect } from '@playwright/test';
import { getLiveConfigStatus } from '../../server/liveHandlers.js';
import { createBalldontlieGateway } from '../../server/balldontlieGateway.js';

const THEMES = ['light', 'dark'];

const LEGACY_TEXT = [
  'What earned the points',
  'Season performance',
  'Full scoring breakdown',
  'by total season fantasy points',
  'Higher projected option',
  'Opponent sample & method',
  'No significant weather impact',
];

const EXPECTED = {
  pregame: {
    overline: 'Projected fantasy points',
    tiles: ['Season rank', 'Status'],
    sections: ['Projected stat line', 'Likely outcome', 'Recent form', 'Vs defense tier', 'Projection build', 'Better bench option'],
    disclosures: ['How projections work', 'Opponent sample'],
    rings: 0,
  },
  live: {
    overline: 'Fantasy points so far',
    tiles: ['Est. finish'],
    sections: ['Scoring pace', 'Scoring plays'],
    disclosures: ['Available estimate · 17.9', 'About play points'],
    rings: 4,
  },
  final: {
    overline: 'Final fantasy points',
    tiles: ['Week 7 finish', 'Season avg'],
    sections: ['Game flow', 'Points vs projection', 'Season trend', 'Usage', 'Next week'],
    disclosures: ['All scoring plays · 8', 'Available estimate · 17.9'],
    rings: 4,
  },
};

async function openDrilldown(page, { phase, theme = 'light', source = 'balldontlie', bdl = true }) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', (message) => {
    // Remote logos and headshots may be unreachable in CI; everything else is a defect.
    if (message.type() === 'error' && !/Failed to load resource|net::ERR_/.test(message.text())) errors.push(message.text());
  });
  await page.goto(`/?phase=${phase}&theme=${theme}&source=${source}${bdl ? '' : '&bdl=0'}`);
  await expect(page.locator('.pmd-body')).toHaveAttribute('data-game-phase', phase);
  await page.evaluate(() => document.fonts?.ready);
  // Charts redraw once their container width is measured.
  await page.waitForTimeout(250);
  return errors;
}

const section = (page, title) => page.locator('.pdd-sec').filter({ has: page.locator('.pdd-sec__h > span:first-child', { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });

/** Geometry audit run inside the page; returns a list of human-readable problems. */
async function auditLayout(page) {
  return page.evaluate(() => {
    const problems = [];
    const describe = el => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}${el.textContent ? ` "${el.textContent.trim().slice(0, 40)}"` : ''}`;
    const panel = document.querySelector('.matchup-breakdown-dialog');
    const body = document.querySelector('.pmd-body');
    if (panel.scrollWidth > panel.clientWidth + 1) problems.push(`dialog scrolls horizontally (${panel.scrollWidth} > ${panel.clientWidth})`);
    if (body.scrollWidth > body.clientWidth + 1) problems.push(`body scrolls horizontally (${body.scrollWidth} > ${body.clientWidth})`);
    const bodyRect = body.getBoundingClientRect();

    // Nothing may spill past the dialog body's sides.
    document.querySelectorAll('.pdd-bd *').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (rect.right > bodyRect.right + 1 || rect.left < bodyRect.left - 1) problems.push(`outside the dialog: ${describe(el)}`);
    });

    // Sections never overlap one another.
    const sections = [...document.querySelectorAll('.pdd-sec')];
    const boxes = sections.map(el => ({ el, rect: el.getBoundingClientRect() }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].rect;
        const b = boxes[j].rect;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 1 && overlapY > 1) problems.push(`sections overlap: ${describe(boxes[i].el.querySelector('.pdd-sec__h'))} / ${describe(boxes[j].el.querySelector('.pdd-sec__h'))}`);
      }
    }

    // Each chart and stat row stays inside its own section (no bleed across the column divider).
    sections.forEach((sec) => {
      const style = getComputedStyle(sec);
      const rect = sec.getBoundingClientRect();
      const left = rect.left + parseFloat(style.paddingLeft) - 1;
      const right = rect.right - parseFloat(style.paddingRight) + 1;
      sec.querySelectorAll('.pdd-chart, .pdd-hbs, .pdd-rings, .pdd-mk, .pdd-ds, .pmd-plays, .pmd-swap__b').forEach((child) => {
        const box = child.getBoundingClientRect();
        if (box.left < left || box.right > right) problems.push(`bleeds out of its section: ${describe(child)}`);
      });
      const heading = sec.querySelector('.pdd-sec__h');
      if (heading && heading.scrollWidth > heading.clientWidth + 1) problems.push(`heading overflows: ${describe(heading)}`);
    });

    // Hero tiles and stat labels never clip their text.
    document.querySelectorAll('.pdd-mk b, .pdd-hb__l, .pdd-rt__l, .pdd-dl, .pmd-big').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`text clipped: ${describe(el)}`);
    });

    // SVG labels never collide inside a chart.
    document.querySelectorAll('.pdd-svg').forEach((svg) => {
      const labels = [...svg.querySelectorAll('text')]
        .filter(text => text.textContent.trim())
        .map(text => ({ text: text.textContent.trim(), rect: text.getBoundingClientRect() }))
        .filter(item => item.rect.width && item.rect.height);
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const a = labels[i].rect;
          const b = labels[j].rect;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 1.5 && overlapY > 1.5) problems.push(`chart labels collide: "${labels[i].text}" / "${labels[j].text}"`);
        }
      }
    });
    return problems;
  });
}

/**
 * Fraction of a revealed element that is actually visible: sample a grid of
 * points across it and hit-test each one. Covered or clipped points (by a
 * scroll container, a sibling or the viewport edge) do not count.
 */
async function visibleFraction(locator) {
  return locator.evaluate((el) => {
    const previous = el.style.getPropertyValue('pointer-events');
    // Reveals ignore the pointer; let hit testing see them for this check.
    el.style.setProperty('pointer-events', 'auto', 'important');
    const rect = el.getBoundingClientRect();
    let hits = 0;
    let total = 0;
    for (let ix = 0; ix < 5; ix += 1) {
      for (let iy = 0; iy < 5; iy += 1) {
        const x = rect.left + 6 + (rect.width - 12) * ix / 4;
        const y = rect.top + 6 + (rect.height - 12) * iy / 4;
        total += 1;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) hits += 1;
      }
    }
    el.style.setProperty('pointer-events', previous);
    return hits / total;
  });
}

async function expectUnobscured(locator, what) {
  await expect(locator, `${what} is shown`).toBeVisible();
  expect(await visibleFraction(locator), `${what} is fully visible and not covered or clipped`).toBe(1);
}

for (const theme of THEMES) {
  for (const phase of Object.keys(EXPECTED)) {
    test.describe(`${phase} · ${theme}`, () => {
      test('shows every design element and none of the legacy ones', async ({ page }, testInfo) => {
        const errors = await openDrilldown(page, { phase, theme });
        const expected = EXPECTED[phase];
        await expect(page.locator('.pdd-k > .pmd-eyebrow').first()).toHaveText(expected.overline);
        for (const tile of expected.tiles) await expect(page.locator('.pdd-k .pdd-mk .pmd-eyebrow', { hasText: tile }), `tile ${tile}`).toBeVisible();
        for (const title of expected.sections) await expect(section(page, title), `section ${title}`).toHaveCount(1);
        await expect(page.locator('.pmd-disc > details > summary')).toHaveText(expected.disclosures);
        await expect(page.locator('.pdd-bd > .pdd-rings > .pdd-rt')).toHaveCount(expected.rings);
        await expect(page.locator('.pmd-headline')).toHaveCount(0);
        const text = await page.locator('.matchup-breakdown-dialog').innerText();
        for (const legacy of LEGACY_TEXT) expect(text, `legacy element "${legacy}" is gone`).not.toContain(legacy);
        await testInfo.attach(`${phase}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        expect(errors).toEqual([]);
      });

      test('lays out cleanly: no overflow, overlap, bleed or label collisions', async ({ page }) => {
        await openDrilldown(page, { phase, theme });
        expect(await auditLayout(page)).toEqual([]);
      });
    });
  }
}

test.describe('hero points breakdown', () => {
  for (const phase of Object.keys(EXPECTED)) {
    test(`${phase}: opens on hover with a mouse and closes on leave`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'phone', 'mouse hover');
      await openDrilldown(page, { phase });
      const big = page.locator('.pdd-big--btn');
      await big.hover();
      const popover = page.locator('.pdd-tip--bd');
      await expectUnobscured(popover, 'points breakdown');
      await expect(popover).toContainText('Total');
      await expect(big).toHaveAttribute('aria-expanded', 'true');
      await page.mouse.move(2, 2);
      await expect(popover).toHaveCount(0);
    });
  }

  test('toggles with a tap on touch screens', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'touch');
    await openDrilldown(page, { phase: 'pregame' });
    const big = page.locator('.pdd-big--btn');
    await big.tap();
    await expectUnobscured(page.locator('.pdd-tip--bd'), 'points breakdown');
    await big.tap();
    await expect(page.locator('.pdd-tip--bd')).toHaveCount(0);
  });

  test('opens on keyboard focus and closes with Escape', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'keyboard');
    await openDrilldown(page, { phase: 'final' });
    const big = page.locator('.pdd-big--btn');
    await page.keyboard.press('Tab');
    for (let index = 0; index < 8 && !(await big.evaluate(el => el === document.activeElement)); index += 1) await page.keyboard.press('Tab');
    await expect(big).toBeFocused();
    await expectUnobscured(page.locator('.pdd-tip--bd'), 'points breakdown');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pdd-tip--bd')).toHaveCount(0);
  });
});

test.describe('pregame interactions', () => {
  test('every past game in Likely outcome reveals an unobscured matchup tooltip', async ({ page }, testInfo) => {
    await openDrilldown(page, { phase: 'pregame' });
    const dots = section(page, 'Likely outcome').locator('.pdd-hit');
    await expect(dots).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      const dot = dots.nth(index);
      await dot.scrollIntoViewIfNeeded();
      if (testInfo.project.name === 'phone') await dot.tap(); else await dot.hover();
      const tip = section(page, 'Likely outcome').locator('.pdd-tip');
      await expectUnobscured(tip, `game ${index + 1} tooltip`);
      await expect(tip).toContainText(/W\d · (vs|at) [A-Z]{2,3}/);
      await expect(tip).toContainText('pts');
      if (testInfo.project.name !== 'phone') {
        await page.mouse.move(2, 2);
        await expect(tip).toHaveCount(0);
      }
    }
  });

  test('week columns and stat rows filter each other', async ({ page }) => {
    await openDrilldown(page, { phase: 'pregame' });
    const form = section(page, 'Recent form');
    await expect(form.locator('.pdd-pick')).toHaveCount(6);
    await expect(form.locator('.pdd-sec__m')).toHaveText('last 5 + this week');

    await form.getByRole('button', { name: 'Week 3 vs MIN', exact: true }).click();
    const statLine = section(page, 'Stat line');
    await expect(statLine.locator('.pdd-sec__m')).toContainText('W3 · vs MIN');
    await expect(form.getByRole('button', { name: 'Week 3 vs MIN', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await statLine.getByRole('button', { name: /^Rec Yards/ }).click();
    await expect(form.locator('.pdd-sec__m')).toHaveText('Rec Yards pts by week');
    await expect(statLine.getByRole('button', { name: /^Rec Yards/ })).toHaveAttribute('aria-pressed', 'true');
    // W2 had 91 receiving yards: the column now measures 9.1, not 22.1 total.
    await expect(form.getByRole('button', { name: 'Week 2 at JAX', exact: true })).toContainText('9.1');

    await statLine.getByRole('button', { name: /^Total/ }).click();
    await expect(form.locator('.pdd-sec__m')).toHaveText('last 5 + this week');

    const ghost = form.getByRole('button', { name: /Week 7 at PIT, projected/ });
    await ghost.focus();
    await page.keyboard.press('Enter');
    await expect(section(page, 'Projected stat line').locator('.pdd-sec__m')).toHaveText('W7 · at PIT');
  });

  test('a past week drives the hero, rank, outcome, tier and build', async ({ page }) => {
    await openDrilldown(page, { phase: 'pregame' });
    const form = section(page, 'Recent form');
    await form.getByRole('button', { name: 'Week 5 vs DET', exact: true }).click();
    const hero = page.locator('.pdd-k');
    await expect(hero).toContainText('Week 5 fantasy points');
    await expect(hero).toContainText('26.0');
    await expect(hero).toContainText('+9.2 vs 16.8 season average');
    await expect(hero).toContainText('Week 5 finish');
    await expect(section(page, 'Likely outcome').getByRole('button', { name: /^Week 5 vs DET:/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(section(page, 'Vs defense tier').locator('text', { hasText: 'Weak · DET' })).toHaveCount(1);
    await expect(section(page, 'Week 5 build').locator('.pdd-sec__m')).toHaveText('season avg → W5 pts');

    // A Likely outcome pick filters everything but the projection build, and picking it again returns to this week.
    const outcomeGame = section(page, 'Likely outcome').getByRole('button', { name: /^Week 2 at JAX:/ });
    await outcomeGame.click();
    await expect(hero).toContainText('Week 2 fantasy points');
    await expect(form.getByRole('button', { name: 'Week 2 at JAX', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(section(page, 'Vs defense tier').locator('text', { hasText: 'Strong · JAX' })).toHaveCount(1);
    await expect(section(page, 'Projection build').locator('.pdd-sec__m')).toHaveText('season avg → projected pts');
    await outcomeGame.click();
    await expect(hero).toContainText('Projected fantasy points');
    await expect(hero).toContainText('Season rank');
    await expect(section(page, 'Vs defense tier').locator('text', { hasText: 'Average · PIT' })).toHaveCount(1);
    expect(await auditLayout(page)).toEqual([]);
  });

  test('a deduction filter draws negative weeks below the zero line', async ({ page }) => {
    await openDrilldown(page, { phase: 'pregame' });
    const form = section(page, 'Recent form');
    await form.getByRole('button', { name: 'Week 3 vs MIN', exact: true }).click();
    await section(page, 'Stat line').getByRole('button', { name: /^Fumble Lost/ }).click();
    await expect(form.locator('.pdd-sec__m')).toHaveText('Fumble Lost pts by week');
    const week3 = form.getByRole('button', { name: 'Week 3 vs MIN', exact: true });
    await expect(week3).toContainText('-2.0');
    // Wait out the 500ms bar transition, then compare against the zero line.
    await expect.poll(async () => {
      const zero = await form.locator('svg > line').first().boundingBox();
      const bar = await week3.locator('rect.v').boundingBox();
      return Math.round(bar.y - zero.y) <= 1 && bar.height > 20;
    }).toBe(true);
  });

  test('the projection build compares categories and names only the GridShift model', async ({ page }) => {
    await openDrilldown(page, { phase: 'pregame' });
    const build = section(page, 'Projection build');
    await expect(build.locator('.pdd-sec__m')).toHaveText('season avg → projected pts');
    await expect(build.locator('text.sb')).toHaveText('Total');
    await expect(build.locator('text.b').last()).toHaveText('17.9');

    await openDrilldown(page, { phase: 'pregame', source: 'model' });
    const model = section(page, 'Projection build');
    await expect(model.locator('.pdd-sec__m')).toHaveText('GridShift model');
    const labels = await model.locator('text.s, text.sb').allTextContents();
    expect(labels).toEqual(['Season avg', 'Recent form', 'Sample size', 'Matchup', 'Weather', 'Projection']);
    expect(await auditLayout(page)).toEqual([]);
  });

  test('bench option, close and statistics actions call back', async ({ page }) => {
    await openDrilldown(page, { phase: 'pregame' });
    await section(page, 'Better bench option').getByRole('button', { name: /View Bench Receiver/ }).click();
    await page.getByRole('button', { name: 'Close player matchup breakdown' }).click();
    await page.getByRole('button', { name: /Fantasy Value/ }).click();
    const events = await page.evaluate(() => window.__drilldownEvents.map(event => [event.name, typeof event.args[0] === 'string' ? event.args[0] : null]));
    expect(events).toEqual([['viewBench', 'bench'], ['close', null], ['close', null], ['viewStats', '4362628']]);
  });
});

for (const phase of ['live', 'final']) {
  test.describe(`${phase} interactions`, () => {
    test('the pace chart scrub readout follows the pointer and arrow keys', async ({ page }, testInfo) => {
      await openDrilldown(page, { phase });
      const chart = section(page, phase === 'live' ? 'Scoring pace' : 'Game flow');
      const svg = chart.locator('.pdd-scrub');
      await svg.scrollIntoViewIfNeeded();
      const box = await svg.boundingBox();
      if (testInfo.project.name === 'phone') await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.5);
      else await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
      const readout = chart.locator('.pdd-scrub-read');
      await expectUnobscured(readout, 'scrub readout');
      await expect(readout).toContainText('pts');

      await svg.focus();
      await page.keyboard.press('End');
      await expect(svg).toHaveAttribute('aria-valuetext', phase === 'final' ? /Q4 2:05 · 9-yd catch, 24\.6 points/ : /catch|end-around/);
      await page.keyboard.press('Home');
      await expect(svg).toHaveAttribute('aria-valuetext', /Q1 12:10 · 8-yd catch, 1\.8 points/);
      await expectUnobscured(readout, 'scrub readout at the first play');
      await page.keyboard.press('Escape');
      await expect(readout).toHaveCount(0);
    });

  });
}

for (const phase of Object.keys(EXPECTED)) {
  test.describe(`${phase} disclosures`, () => {
    test('disclosures open and close', async ({ page }) => {
      await openDrilldown(page, { phase });
      const rows = page.locator('.pmd-disc > details');
      const count = await rows.count();
      for (let index = 0; index < count; index += 1) {
        const row = rows.nth(index);
        await row.locator('summary').click();
        await expect(row).toHaveAttribute('open', '');
        await expect(row.locator('.pmd-disc__body')).toBeVisible();
        expect(await row.locator('summary').evaluate(el => getComputedStyle(el, '::after').content)).toBe('"−"');
        await row.locator('summary').click();
        await expect(row).not.toHaveAttribute('open', '');
      }
      expect(await auditLayout(page)).toEqual([]);
    });
  });
}

test.describe('final interactions', () => {
  test('stat line, season trend and usage stay linked', async ({ page }) => {
    await openDrilldown(page, { phase: 'final' });
    const trend = section(page, 'Season trend');
    await expect(trend.locator('.pdd-pick')).toHaveCount(6);
    const statLine = section(page, 'Points vs projection');
    await expect(statLine.locator('.pdd-hb__t u')).not.toHaveCount(0);

    await trend.getByRole('button', { name: 'Week 5 vs DET', exact: true }).click();
    await expect(section(page, 'Points vs season avg').locator('.pdd-sec__m')).toContainText('W5 · vs DET');

    const usage = section(page, 'Usage');
    const snaps = usage.getByRole('button', { name: /^Snaps/ });
    await snaps.click();
    await expect(snaps).toHaveAttribute('aria-pressed', 'true');
    await expect(trend.locator('.pdd-sec__m')).toHaveText('snap share by week');
    await expect(trend.locator('text.pdd-anim').first()).toContainText('%');
    await snaps.click();
    await expect(trend.locator('.pdd-sec__m')).toHaveText('last 6 games');
    expect(await auditLayout(page)).toEqual([]);
  });

  test('next week shows the early estimate and opponent rank', async ({ page }) => {
    await openDrilldown(page, { phase: 'final' });
    const next = section(page, 'Next week');
    await expect(next.locator('.pdd-sec__m')).toHaveText('W8 · vs BAL');
    await expect(next).toContainText('Early estimate');
    await expect(next.locator('.pdd-ds__c i.is-on')).toHaveCount(1);
  });
});

test('touch targets meet the 44px minimum on phones', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'coarse pointer only');
  for (const phase of Object.keys(EXPECTED)) {
    await openDrilldown(page, { phase });
    const small = await page.evaluate(() => [...document.querySelectorAll('.pdd-hb--btn, .pdd-rt--btn, .pmd-disc summary, .pmd-swap__b, .pmd-hd__close, .matchup-header-action')]
      .map(el => ({ label: el.textContent.trim().slice(0, 30), height: el.getBoundingClientRect().height }))
      .filter(item => item.height && item.height < 43.5));
    expect(small, `${phase} targets`).toEqual([]);
  }
});

test.describe('edge states', () => {
  for (const phase of Object.keys(EXPECTED)) {
    for (const source of ['none', 'model', 'sleeper']) {
      test(`${phase} with ${source} projection lays out cleanly`, async ({ page }) => {
        const errors = await openDrilldown(page, { phase, source });
        expect(await auditLayout(page)).toEqual([]);
        await expect(page.locator('.pmd-headline')).toHaveCount(0);
        expect(errors).toEqual([]);
      });
    }
  }

  test('the matchup in the phase strip opens that game on Statistics Schedule', async ({ page }) => {
    for (const phase of Object.keys(EXPECTED)) {
      await openDrilldown(page, { phase });
      await page.getByRole('button', { name: /Open this game in Statistics Schedule/ }).click();
      const events = await page.evaluate(() => window.__drilldownEvents.map(event => [event.name, event.args[0] ?? null]));
      // Week 7, CIN at PIT: the schedule's season-week-away-home id.
      expect(events).toEqual([['close', null], ['viewScheduleGame', { week: 7, gameId: '2026-W7-CIN-PIT' }]]);
    }
  });

  test('an injury designation in the Status tile opens the player on Fantasy Injuries', async ({ page }) => {
    // With no designation the tile reads Active and links nowhere.
    await openDrilldown(page, { phase: 'pregame' });
    await expect(page.locator('.pdd-mk__btn')).toHaveCount(0);

    await page.goto('/?phase=pregame&status=Q');
    await expect(page.locator('.pmd-body')).toHaveAttribute('data-game-phase', 'pregame');
    const status = page.getByRole('button', { name: /Status Q\. View .+ in Fantasy Injuries/ });
    await expect(status).toBeVisible();
    expect(await auditLayout(page)).toEqual([]);
    await status.click();
    const events = await page.evaluate(() => window.__drilldownEvents.map(event => [event.name, event.args[0] ?? null]));
    expect(events).toEqual([['close', null], ['openInjuries', 'receiver']]);
  });

  test('a pregame player with no played games or schedule entry shows no empty charts or placeholder date', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?phase=pregame&sparse=1');
    await expect(page.locator('.pmd-body')).toHaveAttribute('data-game-phase', 'pregame');
    await page.waitForTimeout(250);
    // No played games and no likely range: the outcome scale and the form chart would only repeat the hero.
    await expect(section(page, 'Likely outcome')).toHaveCount(0);
    await expect(section(page, 'Recent form')).toHaveCount(0);
    // No games against any defense tier, and no opponent rank: no tier section either.
    await expect(section(page, 'Vs defense tier')).toHaveCount(0);
    await expect(section(page, 'Projected stat line')).toBeVisible();
    // The 2025 placeholder date is not shown for a 2026 league, and no empty logo slot indents the line.
    await expect(page.locator('.pmd-strip')).not.toContainText('2025');
    await expect(page.locator('.pmd-strip .pmd-logo')).toHaveCount(0);
    await expect(page.locator('.pmd-strip')).toContainText('Opponent unavailable');
    expect(await auditLayout(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('header actions open statistics', async ({ page }) => {
    await openDrilldown(page, { phase: 'live' });
    await page.getByRole('button', { name: /Game Stats/ }).click();
    const names = await page.evaluate(() => window.__drilldownEvents.map(event => event.name));
    expect(names).toEqual(['close', 'viewStats']);
  });
});

// No BALLDONTLIE key: projections fall back to Sleeper or the GridShift model
// (or none), and the real timeline hook and loader call /api/live/status,
// answered from the server's own keyless configuration.
function keylessLiveStatus() {
  const saved = process.env.GRIDSHIFT_BDL_API_KEY;
  delete process.env.GRIDSHIFT_BDL_API_KEY;
  try {
    return { ok: true, live: { ...getLiveConfigStatus(), ...createBalldontlieGateway({ env: {} }).getStatus(), leagueAllowed: false }, session: { enabled: false } };
  } finally {
    if (saved != null) process.env.GRIDSHIFT_BDL_API_KEY = saved;
  }
}

test.describe('without BALLDONTLIE', () => {
  for (const phase of Object.keys(EXPECTED)) {
    for (const source of ['sleeper', 'model', 'none']) {
      test(`${phase} with ${source} projection works on a server with no API key`, async ({ page }) => {
        const status = keylessLiveStatus();
        expect(status.live.apiKeyReady).toBe(false);
        const requests = [];
        await page.route('**/api/live/**', (route) => {
          requests.push(new URL(route.request().url()).pathname);
          return route.fulfill({ json: status });
        });
        const errors = await openDrilldown(page, { phase, source, bdl: false });
        if (phase !== 'pregame') await expect(page.getByText('Play-by-play isn’t set up on this server, so scoring plays can’t be shown.')).toBeVisible();
        if (phase === 'pregame' && source !== 'none') await expect(section(page, 'Projection build')).toBeVisible();
        await expect(page.locator('.pmd-body')).not.toContainText(/BALLDONTLIE|not matched to a play/i);
        expect(await auditLayout(page)).toEqual([]);
        expect(requests.every(path => path === '/api/live/status'), `only the status check is made (${requests.join(', ')})`).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }

  test('live view stays usable when the live server cannot be reached', async ({ page }) => {
    await page.route('**/api/live/**', route => route.fulfill({ status: 502, json: { ok: false } }));
    const errors = await openDrilldown(page, { phase: 'live', source: 'sleeper', bdl: false });
    await expect(page.getByText('Could not load GridShift Live status.')).toBeVisible();
    await expect(section(page, 'Scoring pace')).toBeVisible();
    expect(await auditLayout(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
