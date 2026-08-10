import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { failOnConsoleErrors } from './console-errors';

/**
 * Accessibility of the screens a visitor sees BEFORE they have an account.
 *
 * These six need no API, and that is the whole reason this file exists separately from the smoke
 * suite: it can run in CI, where nothing else opens a browser. Until it did, `next build` succeeding
 * was the only evidence any page rendered at all.
 *
 * They are also the screens where a defect is most expensive. A candidate who cannot operate the
 * sign-in form does not get a degraded experience — they get none, and this is a product for people
 * looking for work, which is not a population to lock out. Everything past the session gate is
 * covered by the smoke suite instead, because reaching it requires a real account.
 *
 * `/reset-password` is given a token that was never issued on purpose. The page is reached from an
 * emailed link and gates on nothing, so this renders exactly what a visitor with a stale link sees —
 * which is the state most likely to be shipped untested.
 */
const PUBLIC_SCREENS = [
  { name: 'sign in', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'forgot password', path: '/forgot-password' },
  { name: 'reset password', path: '/reset-password?token=never-issued' },
  { name: 'privacy', path: '/legal/privacy' },
  { name: 'terms', path: '/legal/terms' },
] as const;

// AA is the line, not AAA. It is what most jurisdictions actually require, and a suite that failed on
// AAA would be turned off within a week — which protects nobody.
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const screen of PUBLIC_SCREENS) {
  test(`${screen.name} meets WCAG AA`, async ({ page }) => {
    const consoleErrors = failOnConsoleErrors(page);

    await page.goto(screen.path);

    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_AA)
      // `next dev` injects a devtools overlay — a floating logo button and its portal — that is not
      // part of the product and does not exist in the built image. Scanning it reports defects nobody
      // can fix and, worse, teaches the reader to ignore this suite's output.
      .exclude('nextjs-portal')
      .exclude('#next-logo')
      .analyze();

    // Flattened to one line per offending NODE, with the selector and axe's own explanation. axe's
    // raw objects print as a wall of nested JSON, and a failure nobody can read is one nobody fixes —
    // the first run of this suite reported "color-contrast 1×" and said nothing about which element,
    // which cost a whole extra run to answer.
    expect(
      violations.flatMap((v) =>
        v.nodes.map((node) => `${v.id} (${v.impact}) at ${node.target.join(' ')} — ${node.failureSummary?.replace(/\s+/g, ' ').trim()}`),
      ),
      `${screen.name} must have no WCAG AA violations`,
    ).toEqual([]);

    expect(consoleErrors, `${screen.name} must render with no console errors`).toEqual([]);
  });
}

/**
 * Focus has to be VISIBLE, and axe cannot tell you that.
 *
 * axe checks contrast, names and roles from the DOM; whether a control shows where the keyboard is
 * lives in computed style after `:focus-visible` applies, which only a real browser can answer. A
 * stylesheet that resets `outline: none` and forgets to put anything back passes every automated
 * check and leaves a keyboard user typing blind into a form they cannot see.
 */
test('every control on sign in shows where the keyboard is', async ({ page }) => {
  await page.goto('/login');

  // Scoped to the page's own main region, which leaves out the `next dev` devtools button. That
  // button is not in the built image, and a suite that failed on it would be failing on the harness.
  const controls = page.locator('main').locator('input, button, a[href]');
  const count = await controls.count();
  expect(count, 'sign in should have controls to focus').toBeGreaterThan(0);

  const invisible: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    await control.focus();

    const indicator = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
        label: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`,
      };
    });

    const outlined = indicator.outlineStyle !== 'none' && parseFloat(indicator.outlineWidth) > 0;
    const shadowed = indicator.boxShadow !== 'none' && indicator.boxShadow !== '';

    if (!outlined && !shadowed) invisible.push(indicator.label);
  }

  expect(invisible, 'these controls give the keyboard no visible focus').toEqual([]);
});
