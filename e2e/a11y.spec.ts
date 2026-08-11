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
  /*
   * THE SIGN-IN SCREEN'S THREE NOTICES, each of which exists only with a query parameter — so the
   * scan of bare `/login` above has never seen any of them. That is this file's own recurring
   * failure: seven axe scans once passed on a strength meter that renders only once a field has a
   * value, and reported a clean sheet on something that was not in the DOM.
   *
   * All three are coloured panels carrying text, which is precisely where contrast fails. The
   * deletion notice is the one most worth scanning — it is the last thing somebody sees of this
   * product, and it takes the green tone rather than the red one on purpose.
   */
  { name: 'sign in with a failure', path: '/login?error=rejected' },
  { name: 'sign in with a reference', path: '/login?error=unreachable&ref=449664dd-21f7-4280-84e3-f9875cbc4896' },
  { name: 'sign in after deleting an account', path: '/login?deleted=1' },
  { name: 'privacy', path: '/legal/privacy' },
  { name: 'terms', path: '/legal/terms' },
] as const;

// AA is the line, not AAA. It is what most jurisdictions actually require, and a suite that failed on
// AAA would be turned off within a week — which protects nobody.
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * THE WHOLE SUITE RUNS TWICE, once per theme, and that is the only thing that makes a dark theme
 * more than a palette somebody liked.
 *
 * Every contrast pair in this product was measured for light, and three of them had already been
 * caught below the floor before tonight. A second palette doubles every one of those pairs — and it
 * would be invisible to all twenty-seven checks here, because axe reads the colours the page actually
 * computes and the page only computes one theme at a time.
 *
 * `BUILDCV_THEME=dark pnpm test:a11y` stamps `data-theme="dark"` on the root before anything renders,
 * exactly as the production script does for somebody who chose it, and every existing scan then
 * measures the dark palette without any of them being rewritten.
 */
const THEME = process.env.BUILDCV_THEME === 'dark' ? 'dark' : null;

async function inTheme(page: import('@playwright/test').Page): Promise<void> {
  if (!THEME) return;
  await page.addInitScript((theme) => {
    // GUARDED, because an init script runs before `document.documentElement` exists. The first
    // version threw on every page — and the suite caught it as a console error rather than as a
    // contrast failure, which is the only reason it was not mistaken for a broken palette.
    const set = () => document.documentElement?.setAttribute('data-theme', theme as string);
    set();
    document.addEventListener('DOMContentLoaded', set);
    try {
      localStorage.setItem('buildcv.theme', theme as string);
    } catch {
      // A browser that refuses storage still gets the attribute, which is what the scan reads.
    }
  }, THEME);
}

for (const screen of PUBLIC_SCREENS) {
  test(`${screen.name} meets WCAG AA`, async ({ page }) => {
    const consoleErrors = failOnConsoleErrors(page);

    await inTheme(page);
    await inTheme(page);
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
 * The screens BEHIND the session gate, which nothing here has ever opened.
 *
 * THIS IS THE LARGEST BLIND SPOT IN THE REPO. Seven screens — the CV list, the editor, readability,
 * history, print, import and settings — plus the whole application shell, and no automated check has
 * ever rendered one of them. The smoke suite reaches them and needs a real API from another
 * repository, so it does not run in CI; everything else stops at the sign-in page.
 *
 * They are reachable without an API. `(app)/layout.tsx` gates on `readSession()`, which only asks
 * whether two cookies exist — it does not validate them against anything — so a forged pair renders
 * the shell exactly as a real one does. The data fetch behind each screen then fails, which means
 * these scans cover two things worth covering and nothing else:
 *
 *   1. THE SHELL — navigation, landmarks, focus order. It renders identically whatever the API says,
 *      and it is on every authenticated page, so a defect here is a defect seven times.
 *   2. THE FAILURE STATE — what a screen looks like when its data does not arrive. That is the state
 *      least likely to have been looked at by anyone, and the one a person meets on the worst day.
 *
 * WHAT THEY DELIBERATELY DO NOT COVER is the populated screen. A CV list with rows in it, an editor
 * with entries, a score with a band colour — those need real data and belong to `/smoke`. Scanning an
 * empty shell and calling the screen accessible would be this suite's own recurring lie.
 *
 * The cookies are nonsense on purpose: nothing here reaches the API, and a token shaped like a real
 * one would invite somebody to think this suite tests a session.
 */
const AUTHENTICATED_SCREENS = [
  { name: 'CV list', path: '/resumes' },
  { name: 'import', path: '/resumes/import' },
  { name: 'settings', path: '/settings' },
] as const;

for (const screen of AUTHENTICATED_SCREENS) {
  test(`${screen.name} meets WCAG AA behind the session gate`, async ({ page, context }) => {
    await context.addCookies([
      { name: 'bcv_access', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
      { name: 'bcv_refresh', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
    ]);

    await inTheme(page);
    await inTheme(page);
  await page.goto(screen.path);

    // Proves the gate let us through rather than bouncing to /login — without this the scan could be
    // measuring the sign-in page under another name and reporting it as coverage.
    await expect(page).toHaveURL(new RegExp(`${screen.path}$`));

    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_AA)
      .exclude('nextjs-portal')
      .exclude('#next-logo')
      .analyze();

    expect(
      violations.flatMap((v) =>
        v.nodes.map((node) => `${v.id} (${v.impact}) at ${node.target.join(' ')} — ${node.failureSummary?.replace(/\s+/g, ' ').trim()}`),
      ),
      `${screen.name} must have no WCAG AA violations`,
    ).toEqual([]);
  });
}


/**
 * The import REVIEW step, which is where a candidate corrects what the parser read.
 *
 * REACHED WITHOUT AN API, and it is the only way this screen can be scanned at all. The review step
 * appears after an upload, so every check stops one step short of it — including the three
 * authenticated scans above, which see the drop zone and never what comes next. It restores
 * `{ proposal, draft }` from `sessionStorage` on mount, so seeding that is the honest way in: it is
 * the same code path a candidate takes after a stray refresh, which is the reason the restore exists.
 *
 * SCANNED NOW BECAUSE IT IS ABOUT TO CHANGE. The API is adding a `suggestion` to each field so this
 * screen can offer one-click autocorrect, and a second fix means entries that used to render as
 * blanks will render with a role. Both land on this screen. A check written after the change would
 * only ever describe the new version; written now, it says whether the change broke anything.
 *
 * The fixture is deliberately awkward rather than tidy — an unparseable phone, a bare domain, a
 * missing type and an empty row are the four blocking errors a real CV produced, which is what this
 * screen exists to let somebody fix.
 */
const PROPOSAL = {
  draft: {
    contact: {
      fullName: 'Cristian Arellano',
      email: 'someone@example.com',
      phoneNumber: '310 4580645',
      location: 'Bogotá, Colombia',
      website: 'cristianarellano.com',
      summary: 'Backend developer.',
    },
    experiences: [
      { type: null, organization: 'Acme', position: 'Backend developer', start: '2021', end: null },
      { type: null, organization: '', position: '', start: null, end: null },
    ],
  },
  confidence: {
    overall: 'Medium',
    fields: [
      { path: 'contact.phoneNumber', confidence: 'Medium', sourceText: '310 4580645' },
      { path: 'contact.website', confidence: 'Medium', sourceText: 'cristianarellano.com' },
      { path: 'experiences[0].type', confidence: 'NotExtracted', sourceText: null },
    ],
    warnings: ['Some fields could not be read confidently.'],
  },
};

test('the import review step meets WCAG AA', async ({ page, context }) => {
  await context.addCookies([
    { name: 'bcv_access', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
    { name: 'bcv_refresh', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
  ]);

  await page.addInitScript((proposal) => {
    sessionStorage.setItem(
      'buildcv.import.draft',
      JSON.stringify({ proposal, draft: (proposal as { draft: unknown }).draft }),
    );
  }, PROPOSAL);

  await inTheme(page);
  await page.goto('/resumes/import');

  // Proves the review step rendered rather than the drop zone, AND that the fixture reached it.
  // Anchored to the label rather than to a value: the heading alone would pass on an empty review,
  // which is the failure this file keeps finding in itself.
  await expect(page.getByRole('heading', { name: 'Check what was read' })).toBeVisible();
  await expect(page.getByLabel('Phone')).toHaveValue('310 4580645');

  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_AA)
    .exclude('nextjs-portal')
    .exclude('#next-logo')
    .analyze();

  expect(
    violations.flatMap((v) =>
      v.nodes.map((node) => `${v.id} (${v.impact}) at ${node.target.join(' ')} — ${node.failureSummary?.replace(/\s+/g, ' ').trim()}`),
    ),
    'the import review step must have no WCAG AA violations',
  ).toEqual([]);
});

/**
 * The skip link, tested by USING it rather than by finding it.
 *
 * Five tab stops stood between the keyboard and the content on every authenticated screen — brand,
 * New analysis, CVs, Settings, Sign out — so anybody not using a mouse passed the button that ends
 * their session more often than they reached anything else. Measured before this existed.
 *
 * THE FAILURE MODE OF A SKIP LINK IS THAT IT SCROLLS WITHOUT MOVING FOCUS. The page jumps, the
 * person believes they arrived, and the next Tab returns them to the navigation they just skipped.
 * It looks correct in a screenshot and is useless in practice — so this asserts where focus LANDS,
 * not where the viewport went.
 */
for (const surface of [
  { name: 'the landing page', path: '/', authenticated: false },
  { name: 'the application shell', path: '/resumes', authenticated: true },
] as const) {
  test(`the skip link on ${surface.name} takes the keyboard past the navigation`, async ({ page, context }) => {
    if (surface.authenticated) {
      await context.addCookies([
        { name: 'bcv_access', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
        { name: 'bcv_refresh', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
      ]);
    }

    await inTheme(page);
    await page.goto(surface.path);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();

    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('main')),
      'the stop after the skip link must be inside the content',
    ).toBe(true);
  });
}

/**
 * The upload control is the button, and the file input is the mechanism.
 *
 * Pins BOTH halves, because each is one careless edit from the other's failure. Deleting the input
 * leaves a button that opens nothing; putting it back in the tab order restores the unlabelled,
 * critical-severity control this file just found. Neither shows up as a broken page.
 */
test('the import upload has exactly one control', async ({ page, context }) => {
  await context.addCookies([
    { name: 'bcv_access', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
    { name: 'bcv_refresh', value: 'e2e-not-a-token', url: 'http://localhost:3210' },
  ]);

  await inTheme(page);
  await page.goto('/resumes/import');

  // The button the person actually meets.
  await expect(page.getByRole('button', { name: 'Choose a file' })).toBeVisible();

  // The input still exists — the button clicks it — and is neither announced nor tabbable.
  const input = page.locator('input[type="file"]');
  await expect(input).toHaveCount(1);
  await expect(input).toHaveAttribute('aria-hidden', 'true');
  await expect(input).toHaveAttribute('tabindex', '-1');
});

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
/*
 * Recalibrated when the server's real minimum turned out to be 12 rather than 8. The old set started
 * at an eight-character password, which now scores zero — it is below the floor entirely — and the
 * "Weak" case would have lit no bars at all while the test expected one.
 */
const STRENGTHS = [
  { label: 'Weak', password: 'aaaaaaaaaaaa' }, // exactly the minimum, letters only
  { label: 'Fair', password: 'aaaaaaaaaaa1' }, // + a digit beside letters
  { label: 'Good', password: 'aaaaaaaaaaaaaaa1' }, // + four past the minimum
  { label: 'Strong', password: 'aaaaaaaaaaaaaaa1!' }, // + a symbol
] as const;

for (const strength of STRENGTHS) {
  test(`the ${strength.label} strength meter meets WCAG AA`, async ({ page }) => {
    await inTheme(page);
    await inTheme(page);
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
    await inTheme(page);
    await inTheme(page);
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
  await inTheme(page);
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
 * "Continue with Google" is a LINK, and it has to behave like one.
 *
 * It is written as an anchor rather than a button with a click handler because what it does is
 * navigate — `connect-src 'self'` forbids the browser from calling Google at all, which is the whole
 * reason this flow is a server-side redirect. That decision has consequences a stylesheet can undo:
 * an anchor styled to look like a button collapses to the height of its text unless something says
 * otherwise, and a 14px tap target is one most people miss on a phone.
 *
 * The screens only render it when Google is configured, which is why `playwright.config.ts` supplies
 * placeholder credentials — without them this suite would scan a sign-in page that does not have the
 * control and call it clean.
 */
for (const screen of [
  { name: 'sign in', path: '/login' },
  { name: 'register', path: '/register' },
]) {
  test(`the Google link on ${screen.name} is a real, reachable link`, async ({ page }) => {
    await inTheme(page);
    await inTheme(page);
  await page.goto(screen.path);

    const link = page.getByRole('link', { name: 'Continue with Google' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/api/auth/google');

    // Big enough to hit. 44px is the figure WCAG 2.2 names for a target, and it is the exact number
    // an unstyled anchor fails.
    const box = await link.boundingBox();
    expect(box?.height ?? 0, 'the Google link must be a full-height target').toBeGreaterThanOrEqual(44);

    // Focusable and visibly focused — the same claim the sign-in sweep makes for inputs and buttons,
    // asserted here because an anchor is the element most likely to lose its ring to a reset.
    await link.focus();
    const ring = await link.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, style: style.outlineStyle, shadow: style.boxShadow };
    });
    const outlined = ring.style !== 'none' && parseFloat(ring.width) > 0;
    expect(outlined || (ring.shadow !== 'none' && ring.shadow !== ''), 'the Google link needs a visible focus ring').toBe(true);
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
  await inTheme(page);
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
