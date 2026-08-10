import type { Metadata } from 'next';
import Link from 'next/link';

import { isComplete, OPERATOR } from '../details';
import styles from '../legal.module.css';
import { Unset } from '../Unset';

export const metadata: Metadata = { title: 'Terms · BuildCv' };

/**
 * What the product promises and, more usefully, what it does not.
 *
 * The scoring claims are the part worth getting right. This product's whole argument is that its
 * numbers are MEASURED rather than estimated — so the terms have to be equally exact about what they
 * measure, which is a CV against one posting's stated requirements, and not a prediction about
 * whether anyone will be hired. Overstating that here would undo the discipline the scoring engine
 * was built with.
 */
export default function TermsPage() {
  const ready = isComplete(OPERATOR);

  return (
    <main className={styles.wrap}>
      <Link href="/login" className={styles.back}>
        ← Back to sign in
      </Link>

      <h1 className={styles.title}>Terms</h1>
      <p className={styles.lead}>What this service does, and what it does not claim to do.</p>

      {!ready && (
        <p className={styles.draft} role="alert">
          <strong>This page is not finished and must not be published as it stands.</strong> The
          operator and the governing law are missing, and were left blank rather than guessed.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.heading}>Who provides this</h2>
        <p className={styles.body}>
          BuildCv is operated by {OPERATOR.entity ?? <Unset what="legal entity" />}, reachable at{' '}
          {OPERATOR.contact ?? <Unset what="contact address" />}.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>What the scores mean</h2>
        <p className={styles.body}>
          A match score measures one CV against the requirements you confirmed for one job posting.
          It is computed by fixed rules, not predicted — the same CV and the same posting always give
          the same number, and the advice names the exact gap it came from.
        </p>
        <p className={styles.body}>
          <strong>It is not a prediction about whether you will be hired</strong>, and it is not a
          measure of what any particular employer&rsquo;s software will do with your CV. It says how
          well what you wrote answers what that posting asked for. Nothing more is claimed, and
          nothing more should be read into it.
        </p>
        <p className={styles.body}>
          A readability score measures a CV on its own, without any posting. The two are different
          measurements of different things and are never added together.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>What you are responsible for</h2>
        <p className={styles.body}>
          That your CV is true, and that it is yours to upload. The import step exists so you can
          correct what the parser misread before anything is created — what is stored is what you
          confirmed, so it is worth reading.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Your content stays yours</h2>
        <p className={styles.body}>
          Nothing you write here is used to train anything, sold, or shown to anyone else. There is no
          model to train: the scoring engine is fixed rules. You can take any CV away as a PDF at any
          time, and you can{' '}
          <Link href="/legal/privacy">delete everything</Link> without asking anyone.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Availability</h2>
        <p className={styles.body}>
          This service is provided as it is, without a guarantee that it will be reachable at any
          particular moment. Export anything you would not want to lose — every CV has a print and
          save-as-PDF control on its own page.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Law</h2>
        <p className={styles.body}>
          These terms are governed by the law of{' '}
          {OPERATOR.jurisdiction ?? <Unset what="governing jurisdiction" />}.
        </p>
      </section>

      <p className={styles.updated}>
        See also the <Link href="/legal/privacy">privacy page</Link>, which describes exactly what is
        stored and what is not.
      </p>
    </main>
  );
}
