import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { failOnConsoleErrors } from './console-errors';

/**
 * Accessibility of the screens a visitor sees BEFORE they have an account.
 *
 * These seven need no API, and that is the whole reason this file exists separately from the smoke
 * suite: it can run in CI, where nothing else opens a browser. Until it did, `next build` succeeding
 * was the only evidence any page rendered at all.
 *
 * They are also the screens where a defect is most expensive. A candidate who cannot operate the
 * sign-in form does not get a degraded experience — they get none, and this is a product for people
 * looking for work, which is not a population to lock out. Everything past the session gate is
 * covered by the smoke suite instead, because reaching it requires a real account.
 *
 * `/` is the landing page and is FIRST here because it is now the first thing anyone sees; it was a
 * redirect into the session gate until it carried something true to say. It is also the only screen
 * on this list that is mostly prose and tables rather than a form, which is a different way to fail
 * WCAG — heading order and table semantics rather than labels and focus.
 *
 * `/reset-password` is given a token that was never issued on purpose. The page is reached from an
 * emailed link and gates on nothing, so this renders exactly what a visitor with a stale link sees —
 * which is the state most likely to be shipped untested.
 */
const PUBLIC_SCREENS = [
  { name: 'landing', path: '/' },
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
 * The strength meter, scanned in the only state where it exists.
 *
 * THE SEVEN SCANS ABOVE PASSED WITHOUT EVER SEEING IT. It renders only once the field has a value,
 * so every one of those runs loaded `/register` with an empty form and reported a clean sheet on a
 * component that was not in the DOM. That is the shape of failure this repo keeps producing: a green
 * check on something the check never looked at. Typing a password is what puts it on the page.
 *
 * WHAT THESE FOUR ACTUALLY COVER, stated precisely, because the obvious reading is wrong. The four
 * bars carry `aria-hidden`, and axe skips hidden subtrees for colour-contrast — so these scans do
 * NOT measure the fills. What they do prove is that each of the four scores is reachable from a real
 * password, that the label names it, and that the page stays clean with the meter in the DOM. The
 * fills are measured by the test below instead, for the same reason the focus ring is: axe cannot.
 */
const STRENGTHS = [
  { label: 'Weak', password: 'aaaaaaaa' }, // 8 chars, letters only
  { label: 'Fair', password: 'aaaaaaaa1' }, // + a digit beside letters
  { label: 'Good', password: 'aaaaaaaaaaaa1' }, // + past twelve
  { label: 'Strong', password: 'aaaaaaaaaaaa1!' }, // + a symbol
] as const;

for (const strength of STRENGTHS) {
  test(`the ${strength.label} strength meter meets WCAG AA`, async ({ page }) => {
    await page.goto('/register');
    await page.locator('#password').fill(strength.password);

    // Asserts the RATING, not merely that something appeared. Four passwords that all happened to
    // score the same would scan one fill class four times and report four passes — which is this
    // file's own failure mode, dressed up as extra coverage.
    await expect(page.getByText(strength.label, { exact: true })).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_AA)
      .exclude('nextjs-portal')
      .exclude('#next-logo')
      .analyze();

    expect(
      violations.flatMap((v) =>
        v.nodes.map((node) => `${v.id} (${v.impact}) at ${node.target.join(' ')} — ${node.failureSummary?.replace(/\s+/g, ' ').trim()}`),
      ),
      `the ${strength.label} meter must have no WCAG AA violations`,
    ).toEqual([]);
  });
}

/**
 * A filled bar has to be distinguishable from an unfilled one.
 *
 * The bars are `aria-hidden` and the text label says the same thing, so they are decorative and
 * exempt from WCAG 1.4.11 — which is exactly why nothing automated will ever look at them. That
 * exemption is about the standard, not about whether the thing works: a fill the same tone as its
 * track is a meter that silently shows nothing to everyone who is not using a screen reader, and it
 * would pass all thirteen checks above.
 *
 * 3:1 is the line a non-text indicator owes, and it is the line this repo's tokens table already
 * applies to bars and dots — see `TONES` in `src/lib/format.ts`, where three of five bands were
 * failing it until somebody measured.
 */
for (const strength of STRENGTHS) {
  test(`the ${strength.label} bars are distinguishable from the track`, async ({ page }) => {
    await page.goto('/register');
    await page.locator('#password').fill(strength.password);
    await expect(page.getByText(strength.label, { exact: true })).toBeVisible();

    // ONE PASSWORD EXERCISES ONE TONE. Every filled bar takes the class of the CURRENT score, so a
    // single run measures a single token and would have reported four passes for the green alone —
    // which is what the first version of this test did, and it is why it runs four times.
    const ratios = await page.locator('main').evaluate((main) => {
    // sRGB relative luminance, per WCAG. Written here rather than imported because it has to run
    // inside the page, where the computed colours actually exist.
    const luminance = (colour: string): number => {
      const [r = 0, g = 0, b = 0] = (colour.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const channel = (value: number) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

      const colours = Array.from(main.querySelectorAll('span'))
        .filter((span) => getComputedStyle(span).height === '4px')
        .map((span) => getComputedStyle(span).backgroundColor);

      // The track is resolved through the browser rather than compared as a hex string: the DOM
      // reports `rgb(...)` and the token is written `#f1f5f9`, so a direct comparison would find no
      // unfilled bar anywhere and silently treat every bar as filled.
      const probe = document.createElement('span');
      probe.style.color = getComputedStyle(document.documentElement)
        .getPropertyValue('--border-soft')
        .trim();
      main.appendChild(probe);
      const track = getComputedStyle(probe).color;
      probe.remove();

      const trackLuminance = luminance(track);

      return {
        bars: colours.length,
        // At Strong every bar is filled and none of them is the track, which is why the track is
        // taken from the token rather than from whichever bar happens to be unlit.
        filled: colours
          .filter((colour) => colour !== track)
          .map((colour) => {
            const fill = luminance(colour);
            const lighter = Math.max(fill, trackLuminance);
            const darker = Math.min(fill, trackLuminance);
            return { colour, ratio: Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2)) };
          }),
      };
    });

    expect(ratios.bars, 'the meter should draw four bars').toBe(4);

    // The drawing has to agree with the word beside it. A meter that says "Good" and lights two bars
    // is telling two different people two different things.
    expect(ratios.filled.length, `${strength.label} should light ${STRENGTHS.indexOf(strength) + 1} bars`).toBe(
      STRENGTHS.indexOf(strength) + 1,
    );

    expect(
      ratios.filled
        .filter((bar) => bar.ratio < 3)
        .map((bar) => `${bar.colour} is ${bar.ratio}:1 on the track`),
      'a filled bar must reach 3:1 against the unfilled track',
    ).toEqual([]);
  });
}

/**
 * Revealing a password must actually reveal it, and say so.
 *
 * The toggle is the reason this component exists — a masked field on a phone keyboard is where
 * sign-in attempts go to die. Its `type` flip and its changing label are two separate promises, and
 * a state-dependent `aria-label` is the kind of thing that silently stops updating during a refactor
 * while the icon keeps changing and everything still LOOKS right.
 */
test('the password reveal shows the password and announces its state', async ({ page }) => {
  await page.goto('/login');

  const field = page.locator('#password');
  await field.fill('correct horse battery');

  const toggle = page.getByRole('button', { name: 'Show password' });
  await expect(field).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();

  await expect(field).toHaveAttribute('type', 'text');
  const pressed = page.getByRole('button', { name: 'Hide password' });
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');

  await pressed.click();
  await expect(field).toHaveAttribute('type', 'password');
});

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
