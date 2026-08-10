import { expect, test, type Page } from '@playwright/test';

/**
 * The path a candidate actually walks, end to end, against a real API.
 *
 * IT EXISTS BECAUSE EVERY OTHER CHECK WAS GREEN. The CV list was narrowed to a summary and the
 * analysis screen kept reading `resume.experiences` off it; `tsc` passed, `next build` passed, the
 * API's 1677 tests passed, and the screen threw on load. The fetch had been annotated with an
 * explicit generic, which is an assertion rather than a check — so the compiler agreed with a lie and
 * everything downstream type-checked against it.
 *
 * Nothing here mocks the API. A mock is written from the same belief that was wrong.
 */

/** Unique per run, because accounts are permanent and the suite must not depend on a clean database. */
const account = () => `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const PASSWORD = 'Smoke!Passphrase-2026';

const CV = [
  'Grace Hopper',
  'grace@example.com',
  '+1 555 0134',
  'Boston, MA',
  '',
  'SUMMARY',
  'Backend engineer with 12 years building compilers.',
  '',
  'EXPERIENCE',
  'Senior Engineer, Remington Rand',
  // MONTH PRECISION, on purpose. It is the dominant format on real CVs, `PartialDate` carries it end
  // to end, and it is what makes the editor's precision warning reachable — a date picker cannot show
  // a month without a day.
  '2019-03 - 2023-06',
  '',
  'SKILLS',
  'C#, Docker, SQL Server',
].join('\n');

/**
 * Fails the test on any console error.
 *
 * This is the assertion that would have caught the crash: the screen still RENDERED its shell, so a
 * check on visible text passed while React had thrown inside it. Favicon 404s are excluded because
 * they say nothing about the app.
 */
function failOnConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  return errors;
}

test('a candidate can register, import a CV, edit it and read its scores', async ({ page }) => {
  const errors = failOnConsoleErrors(page);
  const email = account();

  await test.step('register, and land somewhere with something to do', async () => {
    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // The CV list, not the analysis flow: a new account has neither a CV nor a posting.
    await expect(page).toHaveURL(/\/resumes$/);
    await expect(page.getByRole('heading', { name: 'Your CVs' })).toBeVisible();
  });

  await test.step('import a document and correct what the parser missed', async () => {
    await page.goto('/resumes/import');
    await page.setInputFiles('input[type=file]', {
      name: 'grace-cv.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(CV),
    });

    await expect(page.getByRole('heading', { name: 'Check what was read' })).toBeVisible();

    // The two the extractor cannot fill from this document. The import refuses without them, which is
    // the review step earning its place.
    await page.locator('#experiences\\[0\\]\\.type').fill('Professional');
    await page.locator('#experiences\\[0\\]\\.position').fill('Senior Engineer');

    await page.getByRole('button', { name: 'Create this CV' }).click();
    await expect(page.getByRole('heading', { name: 'Imported' })).toBeVisible();
  });

  await test.step('readability applies the section only an imported CV can have', async () => {
    await page.getByRole('link', { name: 'See how it reads' }).click();
    await expect(page).toHaveURL(/\/readability$/);

    // Scored, not renormalized out: this CV came from a document, so there is one to grade.
    await expect(page.getByText('Document parseability')).toBeVisible();
    // Exact, because the word appears in the prose and in the route announcer too.
    await expect(page.getByText('READABILITY', { exact: true })).toBeVisible();
    await expect(page.getByText('not the match score')).toBeVisible();
  });

  await test.step('add a skill, correct it in place, and remove it', async () => {
    await page.getByRole('link', { name: 'Back to the CV' }).click();
    await page.getByRole('button', { name: /^Skills/ }).click();

    await page.getByRole('button', { name: 'Add skill' }).click();
    await page.getByLabel('Skill', { exact: true }).fill('Kubernets');
    await page.getByRole('button', { name: 'Add to skills' }).click();
    await expect(page.getByRole('button', { name: 'Edit Kubernets' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit Kubernets' }).click();

    // The form starts out saying what is there now, because a PUT replaces rather than patches: a
    // field left blank would clear itself.
    await expect(page.getByLabel('Skill', { exact: true })).toHaveValue('Kubernets');

    await page.getByLabel('Skill', { exact: true }).fill('Kubernetes');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('button', { name: 'Edit Kubernetes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Kubernets' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove Kubernetes' }).click();
    await expect(page.getByRole('button', { name: 'Remove Kubernetes' })).toHaveCount(0);
  });

  await test.step('editing a month-precision role says so instead of inventing a day', async () => {
    await page.getByRole('button', { name: /^Experience/ }).click();
    await page.getByRole('button', { name: /^Edit Senior Engineer/ }).click();

    // The CV states March 2019; a date picker cannot hold that, so the field comes back BLANK and the
    // warning names what saving would change. Seeding it with 2019-03-01 would have been a day the
    // candidate never wrote, silently upgrading the precision of their own history.
    await expect(page.getByText(/2019-03 must be given as a full date/)).toBeVisible();
    await expect(page.getByLabel('Start', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  await test.step('name the CV, and see the name where the CV is chosen', async () => {
    // The heading reads the contact name until the CV is named, so this asserts the fallback first —
    // otherwise a rename that silently did nothing would still leave the right words on screen.
    await expect(page.getByRole('heading', { name: 'Grace Hopper', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Name it' }).click();
    await page.getByLabel('CV name').fill('Backend roles');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: 'Backend roles', level: 1 })).toBeVisible();

    // It survives a round trip through the API rather than living in React state.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Backend roles', level: 1 })).toBeVisible();

    await page.goto('/resumes');
    await expect(page.getByRole('link', { name: 'Backend roles' })).toBeVisible();
  });

  await test.step('create a second CV by hand', async () => {
    // A SECOND ONE, and not only to exercise the create form: with one CV in the picker below, "the
    // group is a single tab stop" is true whatever the tabindex says. Two is the smallest list that
    // can tell a roving tabindex from none.
    await page.goto('/resumes');
    await page.getByRole('button', { name: 'New CV' }).click();
    await page.getByLabel('Full name').fill('Grace Hopper');
    await page.getByLabel('Email').fill('grace@example.com');
    await page.getByRole('button', { name: 'Create CV' }).click();

    await expect(page.getByRole('link', { name: 'Grace Hopper' })).toBeVisible();
  });

  await test.step('the analysis screen lists the CVs rather than throwing on them', async () => {
    await page.goto('/analysis');
    // The regression this suite was written for: the picker reads a list row, and a list row carries
    // counts rather than entries.
    await expect(page.getByRole('radio')).toHaveCount(2);
    await expect(page.getByLabel('2. Paste the job description')).toBeVisible();

    // The picker is ONE tab stop, not one per CV — the radiogroup pattern, and the reason a list
    // fetched with limit=100 is not a keyboard trap.
    //
    // TAB IS CHECKED FIRST, from the FIRST option. Doing it after an arrow press proves nothing: the
    // arrow leaves focus on the last option, and tabbing off the last one reaches the textarea
    // whether or not the ones before it were skipped. Measured — that order passed with the tabindex
    // deleted.
    const options = page.getByRole('radio');
    await options.first().focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('2. Paste the job description')).toBeFocused();

    // Arrows move within the group, and moving SELECTS: a focused option that is not the checked one
    // would leave a keyboard user unable to tell what the button below will act on.
    await options.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toBeFocused();
    await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
  });

  await test.step('the CV can be taken away as a document', async () => {
    await page.goto('/resumes');
    await page.getByRole('link', { name: 'Backend roles' }).click();
    await page.getByRole('link', { name: 'Print or save as PDF' }).click();

    await expect(page).toHaveURL(/\/print$/);
    // The document, not the editor's preview: that one clips at one sheet and shows four of the ten
    // sections, so a candidate printing it would hand an employer a truncated CV.
    await expect(page.locator('article').getByText('Grace Hopper')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as PDF' })).toBeVisible();
  });

  await test.step('a CV built for a posting leads with what answered it', async () => {
    await page.goto('/analysis');

    // The imported CV, by name rather than by position — the picker lists whatever the API returns
    // and a CV list is not a sequence.
    await page.getByRole('radio', { name: /Backend roles/ }).click();
    await page.getByLabel('2. Paste the job description').fill(
      'Platform engineer. You will run our services on SQL Server in production, and Kubernetes ' +
        'experience is strongly preferred for this role.',
    );
    await page.getByRole('button', { name: /Extract requirements/i }).click();

    await page.getByLabel(/Job title/i).fill('Platform Engineer');
    await page.getByLabel(/Company/i).fill('Remington Rand');
    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText('Scoring model')).toBeVisible();

    await page.getByRole('link', { name: 'Build a CV for this job' }).click();
    await expect(page).toHaveURL(/\/print\?posting=/);

    // FIRST, not "moved up from position three". Resume collections come back as sets, so where a
    // skill started is not a fact this suite can assert — that it now leads is, and it is the whole
    // promise of the screen.
    const skills = page.locator('article').getByText(/SQL Server/);
    await expect(skills).toBeVisible();
    await expect(skills).toHaveText(/^SQL Server\b/);

    // The gap is named to the candidate…
    await expect(page.getByText(/counts them as gaps/)).toBeVisible();
    await expect(page.getByText('Kubernetes', { exact: false }).first()).toBeVisible();

    // …and never reaches the page an employer receives. A CV that argued against its own author
    // would be a strange thing to hand anybody, and `@media print` is what keeps it off the paper.
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByText(/counts them as gaps/)).toBeHidden();
    await page.emulateMedia({ media: null });
  });

  expect(errors, 'the walkthrough must produce no console errors').toEqual([]);
});

test('a signed-out visitor is sent to sign in, once', async ({ page }) => {
  const errors = failOnConsoleErrors(page);

  // The loop this pins: page gates check that a session cookie EXISTS, not that it works, so a stale
  // one used to bounce /login -> app -> 401 -> /login forever. Measured at 184 requests.
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/resumes');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to BuildCv' })).toBeVisible();

  expect(
    requests.filter((url) => url.includes('/api/resumes')).length,
    'a signed-out visit must not retry the API',
  ).toBeLessThan(3);
  expect(errors.filter((text) => !text.includes('401'))).toEqual([]);
});

// LAST ON PURPOSE. It deliberately spends this client address's sign-in window, and every other test
// in this file needs one. The cost is that a re-run started inside the same 60-second window fails
// at registration — with the 429 this test is about, which is at least legible.
test('a throttled sign-in says how long to wait, in the API’s own number', async ({ page }) => {
  const errors = failOnConsoleErrors(page);

  await page.goto('/login');

  // `/auth/login` allows 5 a minute per address. Six wrong attempts reach the limiter; the sixth is
  // the one that answers 429 with Retry-After.
  // Scoped to the form: Next's own route announcer is also role="alert" and matches everything.
  const banner = page.locator('form').getByRole('alert');

  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByLabel('Email').fill(`throttled-${attempt}@example.com`);
    await page.getByLabel('Password').fill('Not!TheRight-Passphrase-2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(banner).toBeVisible();
  }

  // The NUMBER, not the word "minute": the message is built from the header the BFF relayed, so a
  // hardcoded sentence — which is what this replaced — cannot satisfy it.
  await expect(banner).toContainText(/Too many attempts\. Wait \d+ (second|minute)s?/);

  // This test drives six FAILING requests on purpose, and the browser logs each refusal as a console
  // error. So the guard here is narrower than elsewhere: no uncaught exception, and nothing beyond the
  // "failed to load resource" lines those refusals are expected to produce.
  expect(errors.filter((text) => !/Failed to load resource/i.test(text))).toEqual([]);

  // AND THEN IT PUTS THE WINDOW BACK. Measured: without this the next run of this file fails at
  // registration, because the limiter partitions on client address and a test machine has one. The
  // limiter is fixed-window, so a rejected probe consumes no permit and polling cannot extend it.
  await expect
    .poll(
      async () =>
        (await page.request.post('/api/auth/login', { data: { email: 'probe@example.com', password: 'x' } }))
          .status(),
      { message: 'the sign-in window must be left clean for the next run', timeout: 90_000, intervals: [5_000] },
    )
    .not.toBe(429);
});
