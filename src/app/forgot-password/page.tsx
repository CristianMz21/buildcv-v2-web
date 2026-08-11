import type { Metadata } from 'next';
import Link from 'next/link';

import { ForgotPasswordForm } from './ForgotPasswordForm';
import styles from '../login/login.module.css';

/*
 * `noindex` because there is nothing here worth finding from a search — it is a step in a flow, not
 * a destination, and today it is a step that explains recovery is switched off. Crawlable is not the
 * question; whether it should rank above the page that says what the product does is.
 */
export const metadata: Metadata = {
  title: 'Forgotten password',
  robots: { index: false, follow: false },
};

/**
 * No session gate, and no redirect for a signed-in visitor either.
 *
 * Every other unauthenticated page sends a signed-in browser into the app. This one must not: the
 * ordinary reason to be here is that a session exists on a machine and the person cannot remember
 * the password it was opened with.
 */
export default function ForgotPasswordPage() {
  return (
    <main className={styles.wrap}>
      <div className={`card ${styles.card}`}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <h1 className={styles.title}>Reset your password</h1>
        </div>

        <ForgotPasswordForm />

        <p className={styles.hint} style={{ textAlign: 'center' }}>
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
