'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ProblemDetails } from '@/lib/contracts';
import { waitFor } from '@/lib/http';

import { PasswordField } from '../PasswordField';

import styles from '../login/login.module.css';

/**
 * Spending a reset link.
 *
 * THE TOKEN IS THE CREDENTIAL, which is why this page needs no session and must not ask for one. It
 * arrives in the URL because that is where an emailed link puts it.
 *
 * A REJECTED PASSWORD DOES NOT SPEND THE LINK — the policy runs before the token is examined — so a
 * password the API refuses leaves the form usable rather than sending the candidate back to their
 * inbox for a second link. That is worth saying on screen, because the opposite is what people
 * expect and they close the tab.
 */
export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // From the URL rather than a prop: this page is reached from an email, never from inside the app.
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;

        // The API's own sentence, unbranched. A forged link, an expired one and one already spent all
        // answer identically — telling them apart would say whether the account exists.
        setError(
          response.status === 429
            ? `Too many attempts. ${waitFor(response)}`
            : (problem.detail ?? 'That link could not be used.'),
        );
        return;
      }

      setDone(true);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  if (token === null) {
    return (
      <div className={styles.form}>
        <p className={styles.error} role="alert">
          This link is missing its token. Open the one from the email exactly as it was sent — some
          mail clients cut a long URL in half.
        </p>
        <Link href="/forgot-password" className="btn btnLarge">
          Ask for a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.form}>
        <p className={styles.hint}>
          Your password is set. {/*
            Said rather than discovered. Redeeming a reset revokes every session on the account —
            including one an attacker was holding, which is the point — so anywhere still signed in
            is about to stop working, and a candidate who is not told reads that as a second fault.
          */}
          Every device that was signed in has been signed out, including anyone who should not have
          been.
        </p>
        <Link href="/login" className="btn btnPrimary btnLarge">
          Sign in
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

      {/* Being able to READ what you typed matters more here than anywhere else in the product: a
          reset link is single-use in the reader's mind, so a typo they cannot see is the difference
          between getting back in and giving up. The line below says it is not, which is true and
          worth saying — but it is a reassurance, and being able to look is the actual fix. */}
      <PasswordField
        id="new-password"
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        withStrength
        hint="A password this server refuses does not use up your link — you can try another one here."
      />

      <button className="btn btnPrimary btnLarge" type="submit" disabled={pending || password === ''}>
        {pending ? 'Setting…' : 'Set my password'}
      </button>
    </form>
  );
}
