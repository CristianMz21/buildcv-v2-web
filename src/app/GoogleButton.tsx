import { isConfigured } from '@/lib/google';

import styles from './login/login.module.css';

/**
 * "Continue with Google", as a link.
 *
 * A LINK AND NOT A BUTTON WITH A HANDLER, because what it does is navigate. A `fetch` could not do
 * this at all — `connect-src 'self'` forbids the browser from calling Google, which is the whole
 * reason this flow is a server-side redirect. Writing it as an anchor also means it works before
 * hydration, opens in a new tab if somebody middle-clicks, and needs no JavaScript to be reachable by
 * keyboard.
 *
 * A SERVER COMPONENT, so `isConfigured()` is answered where the secrets live. This is the same
 * predicate the privacy page reads, which is what makes it impossible to offer Google without
 * disclosing Google: they are not two flags that must be kept in step, they are one question asked
 * twice. This repo has already published a privacy page that was false about a third party for an
 * hour, and the fix for that was a gate rather than an intention.
 *
 * The mark is inline SVG in Google's own four colours. Loading it from a Google CDN would put a
 * third-party request on the sign-in page — the exact thing the redirect design avoids — to fetch a
 * logo.
 */
export function GoogleButton({ verb }: { verb: 'Sign in' | 'Sign up' }) {
  if (!isConfigured()) return null;

  return (
    <>
      <a className={styles.google} href="/api/auth/google">
        <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1Z" />
          <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.3-9H4.4v5.7C7.9 41 15.4 46 24 46Z" />
          <path fill="#FBBC05" d="M11.7 28.2c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4A22 22 0 0 0 2 24c0 3.6.9 6.9 2.4 9.9l7.3-5.7Z" />
          <path fill="#EA4335" d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 30 2 24 2 15.4 2 7.9 7 4.4 14.1l7.3 5.7c1.8-5.2 6.6-9.4 12.3-9.4Z" />
        </svg>
        Continue with Google
      </a>

      {/* Says which one it is rather than leaving somebody to guess whether Google creates an account
          or only signs into one. The answer is both, and saying so is what stops a returning visitor
          from worrying they are about to make a second account. */}
      <p className={styles.googleNote}>
        {verb === 'Sign up'
          ? 'Creates your account with your Google email — no password to choose.'
          : 'Works whether or not you signed up with Google, as long as the email matches.'}
      </p>

      <div className={styles.divider}>
        <span>or</span>
      </div>
    </>
  );
}
