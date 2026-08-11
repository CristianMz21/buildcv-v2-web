'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ProblemDetails } from '@/lib/contracts';
import { waitFor } from '@/lib/http';

import { PasswordField } from '../PasswordField';

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

      {/* The meter and the hint are shown TOGETHER, and that pairing is the whole answer to the
          objection this screen used to carry — that a bar rating a password "Strong" grades it
          against a rule nothing applies. It does not claim to be the rule: the rule is written
          directly beneath it, in the same place it has always been. The meter describes the
          password, which is true independently of what the server accepts, and this product holds
          somebody's employment history behind it. Neither line ever blocks submission. */}
      <PasswordField
        id="password"
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        withStrength
        minLength={MIN_PASSWORD}
        hint={
          tooShort ? `At least ${MIN_PASSWORD} characters.` : `${MIN_PASSWORD} characters or more.`
        }
      />

      <button className="btn btnPrimary btnLarge" type="submit" disabled={!ready || pending}>
        {pending ? 'Creating…' : 'Create account'}
      </button>

      {/* Below the button, not above it, and phrased as what pressing it MEANS rather than as a
          checkbox to tick. A consent checkbox in front of a free product with no payment and no
          third-party sharing adds a click without adding a decision — the terms bind either way,
          and burying the link where nobody reads it is the thing worth avoiding. */}
      <p className={styles.hint} style={{ textAlign: 'center' }}>
        Creating an account means you accept our <Link href="/legal/terms">Terms</Link> and{' '}
        <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>

      <p className={styles.hint} style={{ textAlign: 'center', marginTop: 8 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
