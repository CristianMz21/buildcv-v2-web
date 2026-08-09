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
  '2019-03-01 - 2023-06-30',
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

  await test.step('add and remove a skill', async () => {
    await page.getByRole('link', { name: 'Back to the CV' }).click();
    await page.getByRole('button', { name: /^Skills/ }).click();

    await page.getByRole('button', { name: 'Add skill' }).click();
    await page.getByLabel('Skill', { exact: true }).fill('Kubernetes');
    await page.getByRole('button', { name: 'Add to skills' }).click();
    await expect(page.getByRole('button', { name: 'Remove Kubernetes' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove Kubernetes' }).click();
    await expect(page.getByRole('button', { name: 'Remove Kubernetes' })).toHaveCount(0);
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

  await test.step('the analysis screen lists the CV rather than throwing on it', async () => {
    await page.goto('/analysis');
    // The regression this suite was written for: the picker reads a list row, and a list row carries
    // counts rather than entries.
    await expect(page.getByRole('radio')).toHaveCount(1);
    await expect(page.getByLabel('2. Paste the job description')).toBeVisible();
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
