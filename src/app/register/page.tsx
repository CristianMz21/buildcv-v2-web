import type { Metadata } from 'next';
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
      </div>
    </main>
  );
}
