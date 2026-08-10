'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { ProblemDetails } from '@/lib/contracts';
import { waitFor } from '@/lib/http';

// The unauthenticated card, shared rather than copied. This screen, sign-in and register are one
// visual family, and a third copy of the same form CSS is a third place for it to drift.
import styles from '../login/login.module.css';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;

        setError(
          response.status === 429
            ? `Too many attempts. ${waitFor(response)}`
            : response.status === 503
              ? // The one answer that is not about this address. It is identical for every address, so
                // it gives nothing away, and saying it plainly beats a promise nobody can keep.
                'Password recovery is switched off on this server — no mail provider is configured. ' +
                'Nothing you did caused this, and no email is coming.'
              : (problem.detail ?? 'The request could not be sent.'),
        );
        return;
      }

      setSent(true);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.form}>
        {/*
          NOT "we sent you an email", and not "we found your account". The API answers the same way
          whether or not the address is registered, on purpose: an answer that differed would let
          anyone discover who has an account here — and on this product that means discovering who is
          looking for work, which is a thing their current employer might like to know. Saying "we
          found it" would hand back exactly what the API refuses to.
        */}
        <p className={styles.hint}>
          If <strong>{email}</strong> has an account, a link is on its way. It expires in an hour and
          works once.
        </p>
        <p className={styles.hint}>
          Nothing here tells you whether that address is registered — deliberately. Anyone could ask
          about anyone.
        </p>
        <Link href="/login" className="btn btnLarge">
          Back to sign in
        </Link>
      </div>
    );
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

      <button className="btn btnPrimary btnLarge" type="submit" disabled={pending || email === ''}>
        {pending ? 'Sending…' : 'Send me a link'}
      </button>
    </form>
  );
}
