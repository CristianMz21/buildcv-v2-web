import type { Metadata } from 'next';
import Link from 'next/link';

import { isComplete, OPERATOR } from '../details';
import styles from '../legal.module.css';
import { Unset } from '../Unset';

export const metadata: Metadata = { title: 'Privacy · BuildCv' };

/**
 * What this product does with a candidate's data, written from the code rather than from a template.
 *
 * EVERY CLAIM BELOW IS CHECKABLE and was checked. The document not being stored, the two cookies, the
 * absence of analytics and of any third party at all, what account deletion removes — each of those
 * is a property of the software, not a promise about intent, and each is stated somewhere in the two
 * repositories with the reasoning beside it. That is the only kind of privacy claim worth making: one
 * that a reader could go and falsify.
 *
 * The four things it cannot state are in `details.ts`, and they are about the operator rather than
 * the software.
 */
export default function PrivacyPage() {
  const ready = isComplete(OPERATOR);

  return (
    <main className={styles.wrap}>
      <Link href="/login" className={styles.back}>
        ← Back to sign in
      </Link>

      <h1 className={styles.title}>Privacy</h1>
      <p className={styles.lead}>
        What BuildCv stores, what it does not, and what you can make it forget.
      </p>

      {!ready && (
        <p className={styles.draft} role="alert">
          <strong>This page is not finished and must not be published as it stands.</strong> Its
          description of the software is complete and accurate. What is missing is four facts about
          whoever operates this deployment — they are marked in the text, and they were left blank
          rather than guessed.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.heading}>Who holds your data</h2>
        <p className={styles.body}>
          The operator of this service is {OPERATOR.entity ?? <Unset what="legal entity" />}, and you
          can reach a person about your data at {OPERATOR.contact ?? <Unset what="contact address" />}.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>What is stored</h2>
        <p className={styles.body}>Only what you type or import, and what the product computes from it:</p>
        <ul className={styles.list}>
          <li>Your account: email address, a hashed password, and your role.</li>
          <li>
            Each CV you create: name, email, phone, location, website and summary, plus your
            experience, education, skills, projects, certificates, languages, awards, publications,
            interests and references.
          </li>
          <li>
            Each analysis: the score a CV received against a job posting you supplied, and the advice
            that came with it.
          </li>
          <li>Job postings you paste in, as the skill requirements you confirmed.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>The document you upload is never stored</h2>
        <p className={styles.body}>
          When you import a CV, the file is read once, in memory, and discarded. It is not written to
          disk and not kept. What survives is the CV you reviewed and confirmed, plus a short-lived
          token describing how readable the document looked to a parser — the token carries no
          content from it and expires within hours.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Nothing is sent to anyone else</h2>
        <p className={styles.body}>
          There is no analytics, no advertising, no error-reporting service and no AI provider in this
          product. Your CV is never sent to a third party, because there is no third party: the
          scoring engine is deterministic code running on this service&rsquo;s own servers. The
          browser is blocked from contacting any other origin by this site&rsquo;s content security
          policy, so a bug could not do it either.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Cookies</h2>
        <p className={styles.body}>
          Two, both strictly necessary to keep you signed in. They are set by this site, cannot be
          read by any script, and there are no others — no analytics cookies, no tracking pixels,
          nothing to consent to because nothing optional is set.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>How long it is kept</h2>
        <p className={styles.body}>
          Your CVs and analyses are kept until you delete them. Signing out ends a session; it does
          not delete anything.
        </p>
        <p className={styles.body}>
          Server logs and database backups are kept for{' '}
          {OPERATOR.logRetention ?? <Unset what="log and backup retention" />}. Logs record what was
          requested and when, never the contents of a CV.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Deleting everything</h2>
        <p className={styles.body}>
          <Link href="/settings">Settings</Link> has a delete control that closes your account and
          removes every CV, every analysis, every readability report, every job posting you created
          and every session. It asks for your password and cannot be undone. Nothing is retained
          afterwards except what the log and backup period above already covers.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Law and complaints</h2>
        <p className={styles.body}>
          This service is operated under the law of{' '}
          {OPERATOR.jurisdiction ?? <Unset what="governing jurisdiction" />}, and that is where a
          complaint about how your data is handled would be heard.
        </p>
      </section>

      <p className={styles.updated}>
        Every statement above describes how the software behaves, and each is verifiable in the source
        rather than asserted here.
      </p>
    </main>
  );
}
