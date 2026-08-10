import type { Page } from '@playwright/test';

/**
 * Fails a test on any console error.
 *
 * This is the assertion that would have caught the crash the smoke suite was written for: the screen
 * still RENDERED its shell, so a check on visible text passed while React had thrown inside it.
 * Favicon 404s are excluded because they say nothing about the app.
 *
 * Shared rather than copied. Two specs assert the same rule, and a duplicated version of it drifts —
 * the exclusion list is exactly the part that grows, and it has to grow in one place.
 */
export function failOnConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  return errors;
}
