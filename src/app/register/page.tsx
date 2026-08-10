import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import { RegisterForm } from './RegisterForm';
import styles from '../login/login.module.css';

export const metadata: Metadata = { title: 'Create an account · BuildCv' };

export default async function RegisterPage() {
  if (await readSession()) redirect('/resumes');

  return (
    <main className={styles.wrap}>
      <div className={`card ${styles.card}`}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <h1 className={styles.title}>Create your account</h1>
        </div>

        <RegisterForm />

        {/* The moment a candidate decides to hand over their employment history is this form, not a
            footer three pages away. The claims on those pages are unusually checkable, which is the
            only reason linking them here is useful rather than decorative. */}
        <p className={styles.hint} style={{ textAlign: 'center' }}>
          <Link href="/legal/privacy">What we store</Link> ·{' '}
          <Link href="/legal/terms">Terms</Link>
        </p>
      </div>
    </main>
  );
}
