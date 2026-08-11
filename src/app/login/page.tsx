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
