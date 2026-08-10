import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import { LoginForm } from './LoginForm';
import styles from './login.module.css';

// The first page an anonymous visitor sees, and the only one that was still falling back to the
// root layout's bare "BuildCv" — so a tab restored a week later said nothing about what it held.
export const metadata: Metadata = { title: 'Sign in · BuildCv' };

export default async function LoginPage() {
  if (await readSession()) redirect('/resumes');

  return (
    <main className={styles.wrap}>
      <div className={`card ${styles.card}`}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <h1 className={styles.title}>Sign in to BuildCv</h1>
        </div>

        <LoginForm />

        {/*
          Kept visible rather than hidden when the server has no mailer. Knowing whether one is
          configured would mean probing /auth/password-reset on every page load — and that endpoint
          shares the 5-per-minute auth window with sign-in, so the probe would spend the budget of
          people who CAN get in, to hide a link from someone who cannot. The destination says
          plainly that recovery is switched off; that costs one click and no one else's window.
        */}
        <p className={styles.hint} style={{ textAlign: 'center' }}>
          <Link href="/forgot-password">Forgotten your password?</Link>
        </p>

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
