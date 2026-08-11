import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import { GoogleButton } from '../GoogleButton';

import { LoginForm } from './LoginForm';
import styles from './login.module.css';

// The first page an anonymous visitor sees, and the only one that was still falling back to the
// root layout's bare "BuildCv" — so a tab restored a week later said nothing about what it held.
export const metadata: Metadata = { title: 'Sign in' };

/**
 * What went wrong on the way back from Google, said in a sentence rather than in a code.
 *
 * A CLOSED MAP, NOT THE QUERY STRING RENDERED. `?error=` is attacker-controlled — anyone can send
 * somebody a link to /login?error=<anything> — so echoing it would put chosen text on our own
 * sign-in page under our own banner styling, which is the cheap half of a phishing page. An unknown
 * value falls through to the generic sentence.
 *
 * Every one of these is a case where trying again genuinely is the right advice, which is why they
 * all say so. What differs is whether it is worth mentioning Google at all.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  state: 'That sign-in link had expired or did not start here. Please try again.',
  incomplete: 'That sign-in did not finish. Please try again.',
  exchange: 'Google could not confirm that sign-in. Please try again.',
  google: 'Google could not complete that sign-in. Please try again.',
  unreachable: 'BuildCv is not answering right now. This is not something you did — try again shortly.',
  rejected: 'That Google account cannot be used to sign in here.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; ref?: string }>;
}) {
  if (await readSession()) redirect('/resumes');

  const { error, deleted, ref } = await searchParams;
  const problem = error ? (SIGN_IN_ERRORS[error] ?? 'That sign-in did not work. Please try again.') : null;

  // The end of the provider-confirmed deletion. It lands here because the account it belonged to no
  // longer exists — there is nowhere else to go — and without a word the redirect reads as having
  // been signed out by a bug rather than as the thing they just asked for.
  const closed = deleted === '1';

  /*
   * VALIDATED AS A SHAPE, NOT TRUSTED AS TEXT. `?ref=` arrives in a URL anybody can craft, so it is
   * rendered only when it looks like the UUID `reach()` mints — otherwise a link could put chosen
   * text on our own sign-in page, under our own styling, beside a real error message. That is the
   * cheap half of a phishing page, and the closed map above exists for the same reason.
   *
   * A wrong-looking value is dropped in silence rather than complained about: the person reading
   * this screen did not choose it, and a second error about the first error helps nobody.
   */
  const reference = ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref) ? ref : null;

  return (
    <main className={styles.wrap}>
      <div className={`card ${styles.card}`}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <h1 className={styles.title}>Sign in to BuildCv</h1>
        </div>

        {closed && (
          <p className={styles.note} role="status">
            Your account and everything in it has been deleted. Nothing was kept.
          </p>
        )}

        {problem && (
          <p className={styles.error} role="alert">
            {problem}
            {reference && (
              <span className={styles.reference}>
                Reference <code>{reference}</code>
              </span>
            )}
          </p>
        )}

        {/* ABOVE the email form, because it is the faster path and burying it below the thing it
            replaces is how a shortcut goes unnoticed. It renders nothing at all when Google is not
            configured — see `GoogleButton`. */}
        <GoogleButton verb="Sign in" />

        <LoginForm />

        {/* The "Forgot password?" link now sits beside the password label in `LoginForm`, which is
            where somebody looks at the moment they realise they cannot remember it, rather than
            below the button they were about to press. */}
        <p className={styles.hint} style={{ textAlign: 'center' }}>
          New here? <Link href="/register">Create an account</Link>
        </p>

        {/* Where the decision to hand over a CV is actually made. Buried in a footer nobody reads is
            where these normally go; this product's claims are unusually checkable, so they are worth
            a click from the page where someone is deciding whether to trust it. */}
        <p className={styles.hint} style={{ textAlign: 'center' }}>
          <Link href="/legal/privacy">Privacy</Link> · <Link href="/legal/terms">Terms</Link>
        </p>
      </div>
    </main>
  );
}
