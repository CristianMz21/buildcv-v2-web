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

        <p className={styles.hint} style={{ textAlign: 'center' }}>
          New here? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
