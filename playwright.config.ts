import { defineConfig, devices } from '@playwright/test';

/**
 * The smoke suite runs against a REAL API. It has to: every bug this suite exists to catch lived in
 * the seam between the two — a response shape that moved, a redirect loop, a screen reading a field
 * the list no longer carries. A mocked backend reproduces none of them, because a mock is written
 * from the same belief that was wrong.
 *
 * Start the API yourself before running (see the README). The web server is started here so a run
 * cannot pass against a stale dev server someone left up.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',

  // Generous, because the dev server compiles each route on its FIRST request and this suite is the
  // first request to most of them. Measured: the navigation after registering exceeded the 5s default
  // purely on compiling /resumes, which is a harness cost and not a product one.
  timeout: 120_000,
  expect: { timeout: 30_000 },

  use: {
    baseURL: process.env.BUILDCV_WEB_ORIGIN ?? 'http://localhost:3210',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: process.env.BUILDCV_WEB_ORIGIN
    ? undefined
    : {
        command: 'npm run dev -- -p 3210',
        url: 'http://localhost:3210/login',
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          BUILDCV_API_ORIGIN: process.env.BUILDCV_API_ORIGIN ?? 'http://localhost:5062',
        },
      },
});
