import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import { LoginForm } from './LoginForm';
import styles from './login.module.css';

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

        <p className={styles.hint}>
          Accounts are created through <code>POST /v1/auth/register</code> — there is no sign-up
          screen yet.
        </p>
      </div>
    </main>
  );
}
