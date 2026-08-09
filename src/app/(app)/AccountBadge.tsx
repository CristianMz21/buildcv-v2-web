'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { AccountResponse } from '@/lib/contracts';

import styles from './shell.module.css';

/**
 * Who is signed in, and the way out.
 *
 * The source design shows a name and a plan here. An account carries neither: there is no name on the
 * aggregate and no billing anywhere in the product, so this shows the email and the role — the two
 * things that are true.
 *
 * It fetches client-side rather than in the layout because every call to the API goes through a route
 * handler, which is the only place Next.js allows the rotated refresh token to be written back.
 */
export function AccountBadge() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((value: AccountResponse | null) => {
        if (!cancelled) setAccount(value);
      })
      .catch(() => {
        // The badge is decoration. A failure here must not take the page down — the screens below
        // report their own errors, and the session gate already ran server-side.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const initials = account?.email?.slice(0, 2).toUpperCase() ?? '··';

  return (
    <div className={styles.footer}>
      <span className={styles.footerIdentity}>
        <span className={styles.avatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.identity}>
          <span className={styles.email} title={account?.email ?? undefined}>
            {account?.email ?? 'Signed in'}
          </span>
          <span className={styles.role}>{account?.role ?? ''}</span>
        </span>
      </span>
      <button type="button" className="btn" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
