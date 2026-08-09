import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Zap } from '@/components/icons';
import { readSession } from '@/lib/session';

import { AccountBadge } from './AccountBadge';
import { NavLinks } from './NavLinks';
import styles from './shell.module.css';

/**
 * The signed-in shell: sidebar, and the session gate for everything under it.
 *
 * `/analysis` is deliberately OUTSIDE this group. It is a focused three-step flow with its own
 * stepper header, and the source design gives it no sidebar for the same reason a checkout has none —
 * the navigation you want mid-flow is forward and back, not sideways.
 *
 * The gate only reads the session; it never calls the API. A Server Component cannot write cookies in
 * Next.js, so a fetch here would leave the proactive refresh with nowhere to store the rotated token
 * and the session would die at the next expiry.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await readSession())) redirect('/login');

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <span className={styles.brandName}>BuildCv</span>
        </Link>

        <Link href="/analysis" className={styles.cta}>
          <Zap size={14} />
          New analysis
        </Link>

        <NavLinks />
        <AccountBadge />
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
