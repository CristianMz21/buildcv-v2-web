'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { FileText, Settings } from '@/components/icons';

import styles from './shell.module.css';

/**
 * Only the destinations that exist.
 *
 * The source design's sidebar also carries Notifications, Plans & billing, Team and Admin. None of
 * them has an endpoint behind it, and a nav link to a screen that cannot be built is worse than an
 * absent one: it is a promise the product does not keep, placed where a user will click it first.
 */
const LINKS = [
  { href: '/resumes', label: 'CVs', Icon: FileText },
  { href: '/settings', label: 'Settings', Icon: Settings },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Main">
      {LINKS.map(({ href, label, Icon }) => {
        // Prefix, so /resumes/{id} keeps CVs lit while the editor is open.
        const active = pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
