'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Warning } from '@/components/icons';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type AccountResponse,
  type ProblemDetails,
} from '@/lib/contracts';
import { failureOf, messageOf, waitFor } from '@/lib/http';

import styles from './settings.module.css';

export function SettingsScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountResponse | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => {
        // A 401 HERE IS THE SESSION ENDING, not a field the account happens not to carry. Reading
        // only `response.ok` collapsed the two: the screen rendered every value as an em dash and
        // offered no way out, so a signed-out account looked like an empty one. `withSession` has
        // already cleared the cookies by this point, which is why the only useful move is the
        // redirect rather than a banner — the same rule `SessionExpired` states everywhere else.
        if (response.status === 401) {
          router.replace('/login');
          return null;
        }

        return response.ok ? response.json() : null;
      })
      .then(setAccount)
      .catch(() => setAccount(null));
  }, [router]);

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
      <DeleteAccount onDone={() => router.replace('/login')} />
    </div>
  );
}

/**
 * Leaving, and taking everything with it.
 *
 * A CANDIDATE COULD DELETE ONE CV AND NOT THEMSELVES. This product holds employment history, phone
 * numbers and addresses; "you can log out" is not the same offer as "you can leave", and a product
 * that keeps a person's history after they ask it not to has made that decision for them.
 *
 * The password is asked for the same reason `change-password` asks: it is the one action on this
 * screen that cannot be undone, and a session someone else is holding should not be enough to do it.
 * The API shares one rate-limit budget across both, on purpose — a limiter of its own would let an
 * attacker who exhausted one window keep guessing in the other.
 *
 * Typing the word is not theatre. A confirm dialog is dismissed by reflex; typing DELETE is the
 * smallest thing that cannot be done by accident, and this is the only screen in the product where
 * an accident is unrecoverable.
 */
function DeleteAccount({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ready = password !== '' && confirmation.trim().toUpperCase() === 'DELETE';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password }),
      });

      if (!response.ok) {
        // The 429 here is the account's own window, shared with the password change, so waiting it
        // out actually works and the number has to be the API's rather than a guess.
        setError(
          response.status === 429
            ? `Too many attempts on this account. ${waitFor(response)}`
            : messageOf(await failureOf(response), 'The account could not be deleted.'),
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

  if (!open) {
    return (
      <div className={`card ${styles.panel}`}>
        <h2 className={styles.panelTitle}>Delete this account</h2>
        <p className={styles.note}>
          Every CV, every analysis and every readability report goes with it. There is no undo and no
          copy kept.
        </p>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Delete this account
        </button>
      </div>
    );
  }

  return (
    <form className={`card ${styles.panel}`} onSubmit={submit}>
      <h2 className={styles.panelTitle}>Delete this account</h2>
      <p className={styles.note}>
        This cannot be undone. Download anything you want to keep first — every CV has a{' '}
        <strong>Print or save as PDF</strong> on its own page.
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="delete-password">
          Your password
        </label>
        <input
          id="delete-password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="delete-confirmation">
          Type DELETE to confirm
        </label>
        <input
          id="delete-confirmation"
          className={styles.input}
          type="text"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setPassword('');
            setConfirmation('');
            setError(null);
          }}
        >
          Keep my account
        </button>
        <button type="submit" className="btn btnDanger" disabled={!ready || pending}>
          {pending ? 'Deleting…' : 'Delete everything'}
        </button>
      </div>
    </form>
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

  // The server's rule, imported. This said 8 while `PasswordPolicy.MinLength` said 12, so the
  // button enabled itself for a password the API would refuse — and changing a password signs you
  // out, which makes a wasted attempt here more annoying than most.
  const ready = current !== '' && next.length >= MIN_PASSWORD_LENGTH;

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
        // Partitioned per ACCOUNT rather than per address, so this window is the caller's own and
        // waiting it out actually works. The number is the API's.
        setError(
          response.status === 429
            ? `Too many attempts on this account. ${waitFor(response)}`
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
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <span className={styles.note}>{MIN_PASSWORD_LENGTH} characters or more.</span>
      </div>

      <button type="submit" className="btn btnPrimary" disabled={!ready || pending}>
        {pending ? 'Changing…' : 'Change password and sign out'}
      </button>
    </form>
  );
}
