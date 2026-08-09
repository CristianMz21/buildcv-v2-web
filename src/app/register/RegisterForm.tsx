'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ProblemDetails } from '@/lib/contracts';
import { waitFor } from '@/lib/http';

import styles from '../login/login.module.css';

/**
 * The API's own rule, stated so a rejection is not the first place a candidate learns it. It is
 * checked here AND there — the server is the authority, this only saves a round trip.
 */
const MIN_PASSWORD = 8;

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const ready = email.trim() !== '' && password.length >= MIN_PASSWORD;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;
        // Registering spends the same 5-per-minute window signing in does, so this is the throttle
        // a new account meets most often. The wait comes from the API rather than from a constant.
        setError(
          response.status === 429
            ? `Too many attempts. ${waitFor(response)}`
            : (problem.detail ?? 'The account could not be created.'),
        );
        return;
      }

      // Registration signs in, so this goes to the CV list rather than back to a form.
      router.replace('/resumes');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className={styles.input}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className={styles.input}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {/* No strength meter. The source design draws one; the API enforces a length and nothing
            else, so a bar rating a password "Strong" would grade it against a rule nothing applies. */}
        <span className={styles.hint} style={{ margin: 0 }}>
          {tooShort ? `At least ${MIN_PASSWORD} characters.` : `${MIN_PASSWORD} characters or more.`}
        </span>
      </div>

      <button className="btn btnPrimary btnLarge" type="submit" disabled={!ready || pending}>
        {pending ? 'Creating…' : 'Create account'}
      </button>

      <p className={styles.hint} style={{ textAlign: 'center' }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
