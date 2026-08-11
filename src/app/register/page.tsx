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

        {/* Both legal pages are linked from inside `RegisterForm`, directly beneath the button, as a
            statement of what pressing it accepts rather than as a pair of links to browse. The
            moment a candidate decides to hand over their employment history is this form, not a
            footer three pages away — and an acceptance sentence at the point of the decision is
            worth more than an invitation to read placed after it. */}
      </div>
    </main>
  );
}
