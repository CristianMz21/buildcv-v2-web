'use client';

import Link from 'next/link';
import { useState } from 'react';

import styles from './landing.module.css';

/**
 * The landing page's navigation, and the only part of it that needs a browser.
 *
 * THE DESIGN SWITCHED LAYOUTS FROM JAVASCRIPT — a `matchMedia` listener toggling `display` on every
 * link. That is done here with a media query instead, so the wide layout is correct before any script
 * runs and stays correct if none ever does. What genuinely needs state is the one thing a stylesheet
 * cannot express: whether the reader has opened the menu.
 *
 * The button carries `aria-expanded` and `aria-controls` because a screen reader is told the same
 * thing the chevron tells everyone else, and the panel is removed from the DOM when closed rather
 * than hidden — a hidden panel keeps its links in the tab order, which puts focus somewhere invisible.
 */
const LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Scoring', href: '#scoring' },
  { label: 'Readability', href: '#readability' },
  { label: 'FAQ', href: '#faq' },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.nav}>
      <nav aria-label="Main" className={styles.navInner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <span className={styles.brandName}>BuildCv</span>
        </Link>

        <div className={styles.navLinks}>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </a>
          ))}
        </div>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.signIn}>
            Sign in
          </Link>
          <Link href="/register" className={`${styles.cta} ${styles.ctaNav}`}>
            Get your free score
          </Link>
          <button
            type="button"
            className={styles.burger}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? (
                <>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </>
              ) : (
                <>
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div id="landing-menu" className={styles.menu}>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className={styles.menuLink} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <Link href="/login" className={styles.menuLink} onClick={() => setOpen(false)}>
            Sign in
          </Link>
        </div>
      )}
    </header>
  );
}
