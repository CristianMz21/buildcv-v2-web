import type { Metadata } from 'next';

import { ResetPasswordForm } from './ResetPasswordForm';
import styles from '../login/login.module.css';

/*
 * `noindex`, and this is the page that most needs it. It is reached from an emailed link carrying a
 * reset token in the query string, and a crawler that followed one would put a live credential into
 * a search index. `robots.ts` disallows the path as well; both, because a disallow is a request and
 * a meta robots tag is on the page itself.
 */
export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

/**
 * Reached from an emailed link and from nowhere else, so it gates on nothing: the token in the URL
 * is the whole credential, and a session — if one happens to exist — has no bearing on it.
 */
export default function ResetPasswordPage() {
  return (
    <main className={styles.wrap}>
      <div className={`card ${styles.card}`}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <h1 className={styles.title}>Set a new password</h1>
        </div>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
