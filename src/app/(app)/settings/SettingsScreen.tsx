'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Warning } from '@/components/icons';
import {
  externalProviders,
  hasPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type AccountResponse,
  type ProblemDetails,
} from '@/lib/contracts';
import { failureOf, messageOf, waitFor } from '@/lib/http';

import styles from './settings.module.css';

export function SettingsScreen() {
  /*
   * The answer to "did my account just get deleted?", for the one case where the question is real.
   *
   * A provider-confirmed deletion leaves this app entirely and comes back through the OAuth callback.
   * When the API refuses it, the session is still valid and nothing was erased — so the callback
   * returns the person HERE rather than to the sign-in screen, which would have bounced them
   * straight to their CV list with no message and no way to tell what happened.
   */
  const params = useSearchParams();
  const deleteFailed = params.get('deleteFailed') === '1';
  const failureRef = params.get('ref');
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

      {/* WAITS FOR THE ACCOUNT rather than assuming a password exists while it loads. Rendering the
          password form optimistically and swapping it a moment later would flash a control at
          somebody who does not have one, and on a slow connection the flash is the whole visit. */}
      {deleteFailed && (
        <p className={`card ${styles.panel}`} role="alert" style={{ color: 'var(--bad-fg)' }}>
          <strong>Your account was not deleted.</strong> The confirmation did not complete, and
          nothing has been removed — everything is exactly as it was. You can try again below.
          {failureRef && <span className={styles.note}> Reference {failureRef}</span>}
        </p>
      )}

      {account &&
        (hasPassword(account) ? (
          <ChangePassword onDone={() => router.replace('/login')} />
        ) : (
          <SignsInWithProvider providers={externalProviders(account)} />
        ))}

      {account && (
        <DeleteAccount
          hasPassword={hasPassword(account)}
          providers={externalProviders(account)}
          onDone={() => router.replace('/login')}
        />
      )}
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
function DeleteAccount({
  hasPassword: withPassword,
  providers,
  onDone,
}: {
  hasPassword: boolean;
  providers: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The password is only part of the gate when there IS one. For a provider-only account the second
  // factor is a fresh token from that provider, which the API requires and this screen cannot yet
  // supply — see the notice below. Typing DELETE is asked of everyone: it is a confirmation, not a
  // credential, and it is the half that stops a mis-click.
  const typed = confirmation.trim().toUpperCase() === 'DELETE';
  const ready = typed && (!withPassword || password !== '');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setPending(true);
    setError(null);

    try {
      // NO PASSWORD MEANS A ROUND TRIP, NOT A WEAKER CHECK. This asks our own origin for the
      // provider URL — a POST, so `src/middleware.ts` refuses it unless it came from this page. A
      // plain link would let anybody hand a signed-in person a URL that deletes their account after
      // one consent screen.
      if (!withPassword) {
        const started = await fetch('/api/auth/google/confirm', { method: 'POST' });

        if (!started.ok) {
          setError(messageOf(await failureOf(started), 'Could not start the confirmation.'));
          return;
        }

        const { url } = (await started.json()) as { url: string };
        // The deletion happens in the callback, after the provider proves it is still you. Nothing
        // is deleted yet at this point, which is why the button says "Continue" rather than "Delete".
        window.location.assign(url);
        return;
      }

      const response = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        // `currentPassword` only. The provider-confirmed path needs a fresh id_token, which means
        // another round trip through the provider, and it is a separate change — this screen refuses
        // to start rather than sending a request the API will correctly reject.
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

      {withPassword ? (
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
      ) : (
        // The second factor for an account with no password. Said plainly BEFORE the button, because
        // being sent to Google unannounced in the middle of deleting something reads as a redirect
        // that went wrong.
        <p className={styles.note}>
          You will be sent to {providers[0] === 'google' ? 'Google' : 'your provider'} to confirm it
          is you. Deleting only happens after that — a session on its own is not enough to erase this.
        </p>
      )}

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
          {/* The label tells the truth about what pressing it does NEXT. For a provider account
              nothing is deleted at this point — the round trip happens first — and a button that
              said "Delete everything" and then showed a Google consent screen would read as the
              click having gone somewhere unintended. */}
          {pending
            ? withPassword
              ? 'Deleting…'
              : 'Taking you to confirm…'
            : withPassword
              ? 'Delete everything'
              : 'Continue to confirm'}
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
/**
 * What stands where the change-password form would be, for somebody who has no password.
 *
 * A PANEL RATHER THAN NOTHING. Removing the section entirely would leave a page that silently lacks
 * something other accounts have, and the reader is left to wonder whether they missed it. Saying "you
 * sign in with Google, there is no password here" answers the question the empty space would raise.
 *
 * It also answers the one that matters more: what happens if you lose the provider. This product has
 * no mail-based recovery, so for these accounts Google is the only way in — that is worth knowing
 * BEFORE it is discovered.
 */
function SignsInWithProvider({ providers }: { providers: string[] }) {
  const named = providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' and ');

  return (
    <section className={`card ${styles.panel}`}>
      <h2 className={styles.panelTitle}>Password</h2>
      <p className={styles.panelBody}>
        You sign in with {named || 'an external provider'}, so this account has no password to change.
      </p>
      <p className={styles.note}>
        That also means {named || 'your provider'} is the only way into this account — there is no
        email recovery on this server. If you lose access to it, tell us before you lose it.
      </p>
    </section>
  );
}

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
