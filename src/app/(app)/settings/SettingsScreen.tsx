'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Warning } from '@/components/icons';
import type { AccountResponse, ProblemDetails } from '@/lib/contracts';

import styles from './settings.module.css';

export function SettingsScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountResponse | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  return (
    <div className={styles.narrow}>
      <div className={styles.head}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.lead}>Your account, and the one control it has.</p>
      </div>

      <div className={`card ${styles.panel}`}>
        <h2 className={styles.panelTitle}>Account</h2>
        {/*
          Email and role, because that is everything an account carries. The source design shows a
          name, a headline, a photo and target roles here; none of them exists anywhere in this
          product, and a form that saved into nothing is worse than a screen that is short.
        */}
        <dl className={styles.facts}>
          <dt className={styles.factLabel}>Email</dt>
          <dd className={styles.factValue}>{account?.email ?? '—'}</dd>
          <dt className={styles.factLabel}>Role</dt>
          <dd className={styles.factValue}>{account?.role ?? '—'}</dd>
          <dt className={styles.factLabel}>Email verified</dt>
          <dd className={styles.factValue}>
            {account ? (account.isEmailVerified ? 'Yes' : 'No') : '—'}
          </dd>
          <dt className={styles.factLabel}>Member since</dt>
          <dd className={styles.factValue}>
            {account ? new Date(account.createdAt).toLocaleDateString() : '—'}
          </dd>
        </dl>
        {account && !account.isEmailVerified && (
          <p className={styles.note}>
            There is no way to verify an email yet — no endpoint sends one. Nothing in the product
            depends on it.
          </p>
        )}
      </div>

      <ChangePassword onDone={() => router.replace('/login')} />
    </div>
  );
}

/**
 * Changing a password ends every session on the account, including this one.
 *
 * That is the security property, not an inconvenience: it is what makes rotating a password after a
 * leak actually evict whoever else was holding a token. The form says so before it is used rather
 * than dropping the candidate at a sign-in screen with no explanation.
 */
function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ready = current !== '' && next.length >= 8;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;
        setError(
          response.status === 429
            ? 'Too many attempts on this account. Wait a minute.'
            : (problem.detail ?? 'The password could not be changed.'),
        );
        return;
      }

      onDone();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={`card ${styles.panel}`} onSubmit={submit}>
      <h2 className={styles.panelTitle}>Password</h2>

      <div className="notice noticeWarn">
        <Warning size={15} />
        <div>
          Changing it signs you out <strong>everywhere</strong>, on every device. That is what makes
          it worth doing after a leak.
        </div>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="current-password">
          Current password
        </label>
        <input
          id="current-password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          className={styles.input}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <span className={styles.note}>8 characters or more.</span>
      </div>

      <button type="submit" className="btn btnPrimary" disabled={!ready || pending}>
        {pending ? 'Changing…' : 'Change password and sign out'}
      </button>
    </form>
  );
}
