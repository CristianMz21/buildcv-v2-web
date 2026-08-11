'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ProblemDetails } from '@/lib/contracts';
import { waitFor } from '@/lib/http';

import { PasswordField } from '../PasswordField';

import styles from './login.module.css';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * Shown only when the server is the thing that failed — a 5xx — and never on a rejected password.
   *
   * THIS IS THE SCREEN WHERE AN OUTAGE IS FELT FIRST. If the API is unreachable nobody can sign in at
   * all, so this is where a person gives up or writes to support, and the id is what makes that
   * message answerable. `reach()` already minted it and sent it upstream, the API logged under the
   * same word, and `relay` puts it on the response; until now the browser dropped it.
   *
   * Withheld on 4xx deliberately. "Sign-in failed" with a reference number reads like a system fault
   * for what is usually a wrong password, and it hands out an id for a request nobody needs to look
   * up. A rate-limit 429 already says exactly what to do and how long to wait.
   */
  const [reference, setReference] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setReference(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;

        // 429 is its own message because it is the one failure retrying makes worse: /auth/login is
        // rate limited to 5 requests a minute per client address, and behind NAT or a delegated IPv6
        // /64 that window is shared with everyone else on it. The wait is the API's own Retry-After,
        // relayed by the route handler — a constant here would be right only until the policy moves.
        setError(
          response.status === 429
            ? `Too many attempts. ${waitFor(response)}`
            : (problem.detail ?? 'Sign-in failed.'),
        );

        if (response.status >= 500) setReference(response.headers.get('x-correlation-id'));
        return;
      }

      // The CV list, not the analysis flow. Analysis needs a CV to score and a posting to score it
      // against; landing there first asks a new account for both before it has either.
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
          {reference && (
            <span className={styles.reference}>
              Reference <code>{reference}</code>
            </span>
          )}
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
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {/* No strength meter on sign-in: the password already exists, and rating it would be telling
          somebody their password is weak at the exact moment they can do nothing about it. */}
      <PasswordField
        id="password"
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        aside={
          <Link className={styles.aside} href="/forgot-password">
            Forgot password?
          </Link>
        }
      />

      <button className="btn btnPrimary btnLarge" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
