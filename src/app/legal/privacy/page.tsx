import type { Metadata } from 'next';
import Link from 'next/link';

import { isComplete, OPERATOR } from '../details';
import styles from '../legal.module.css';
import { Unset } from '../Unset';

export const metadata: Metadata = { title: 'Privacy' };

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
        <h2 className={styles.heading}>Who else your data passes through</h2>
        <p className={styles.body}>
          <strong>One company, and it is worth being exact about it.</strong> Traffic to this site
          reaches us through Cloudflare, which filters automated abuse and denial-of-service attacks
          before requests arrive. Cloudflare terminates the encrypted connection, which means that in
          transit it is technically able to see what you send &mdash; including a CV you are saving.
          It does not store your CV and we do not send it anything on purpose; it is a road your data
          travels, not a place it is kept.
        </p>
        <p className={styles.body}>
          It is here because without it a single automated attacker can make this service unusable for
          everyone, and the alternative was leaving that undefended. If you would rather not have your
          data cross a third party at all, that is a reasonable position and this is the paragraph
          that lets you make the choice.
        </p>
        <p className={styles.body}>
          <strong>Beyond that, nothing.</strong> No analytics, no advertising, no error-reporting
          service, no AI provider. Your CV is never sold, never used to train anything, and never
          shown to another user. The scoring engine is deterministic code running on this
          service&rsquo;s own servers, not a model and not an external API. Your browser is blocked
          from contacting any other origin by this site&rsquo;s content security policy, so a bug in
          our own code could not send your data elsewhere either.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Where your data physically is</h2>
        <p className={styles.body}>
          <strong>In the United States.</strong> The application runs in Microsoft Azure&rsquo;s
          <em> East US</em> region and the database is in <em>Central US</em>. Database backups are
          geo-redundant, which means Azure keeps a second copy in another United States region.
          Cloudflare&rsquo;s network is global, so a request may be routed through equipment near you
          before it reaches the United States.
        </p>
        <p className={styles.body}>
          <strong>If you are not in the United States, using this service transfers your data there.</strong>{' '}
          That includes your CV. United States law does not give the same protections as Colombian or
          European law, and no arrangement here changes that &mdash; you are being told so you can
          decide, which is the only honest thing this page can do about it.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Why we are allowed to hold it</h2>
        <p className={styles.body}>
          Because you asked us to. Everything stored is something you typed or uploaded so the product
          could do the one thing it does, and creating an account is the authorisation &mdash; freely
          given, for this stated purpose and no other.
        </p>
        <p className={styles.body}>
          There is no other purpose. Your data is not used for advertising, not profiled beyond the
          score you asked for, and not shared. If that ever changes it needs your permission again,
          not a quiet edit to this page.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>What you can demand, and how</h2>
        <p className={styles.body}>
          Wherever you are, you can ask us to <strong>show you</strong> everything we hold,{' '}
          <strong>correct</strong> anything wrong, <strong>delete</strong> all of it,{' '}
          <strong>hand it to you</strong> in a portable form, or <strong>withdraw</strong> the
          permission you gave &mdash; and be told what we did about it. Write to{' '}
          {OPERATOR.contact ?? <Unset what="contact address" />}.
        </p>
        <p className={styles.body}>
          Two of those you do not need to ask for at all. <Link href="/settings">Settings</Link>{' '}
          deletes your account and everything in it immediately, and every CV can be exported as a PDF
          from its own page. A right you have to request is weaker than a button, so where a button was
          possible it is what you get.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Colombia.</strong> These are the rights Ley 1581 de 2012 gives you &mdash; conocer,
            actualizar, rectificar y suprimir &mdash; along with the right to a copy of the
            authorisation you gave and to be told how your data has been used.
          </li>
          <li>
            <strong>European Union and United Kingdom.</strong> The same list is your GDPR rights of
            access, rectification, erasure, portability, restriction and objection.
          </li>
          <li>
            <strong>California and other United States states.</strong> The same list again, plus the
            right not to be treated differently for using it. There is no &ldquo;do not sell&rdquo;
            link because <strong>nothing is ever sold or shared for advertising</strong>, which is a
            property of the product rather than a setting.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Cookies</h2>
        <p className={styles.body}>
          Two are ours, both strictly necessary to keep you signed in. They are set by this site,
          cannot be read by any script, and neither one identifies you to anybody else.
        </p>
        <p className={styles.body}>
          Cloudflare sets one of its own to tell people apart from bots. We do not read it and it
          carries nothing you typed. It is listed here rather than left out because a cookie policy
          that only mentions the cookies it likes is not a cookie policy.
        </p>
        <p className={styles.body}>
          <strong>There are no others.</strong> No analytics cookies, no tracking pixels, nothing
          optional &mdash; which is why this site asks you to consent to nothing.
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
          and every session. It asks for your password and cannot be undone.
        </p>
        <p className={styles.body}>
          <strong>One caveat, because it is true of almost every service and almost none of them say
          it.</strong> Deleting removes your data from the live database immediately, and database
          backups are kept for seven days &mdash; so for up to a week afterwards your CV still exists
          in a backup nobody can read casually but which does exist. After that window it is gone from
          there too, and nothing else is retained.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Law, and who to complain to above us</h2>
        <p className={styles.body}>
          This service is operated under the law of{' '}
          {OPERATOR.jurisdiction ?? <Unset what="governing jurisdiction" />}. Ask us first &mdash; we
          would rather fix it than be reported &mdash; but you are never required to, and none of the
          following depends on our agreement.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Colombia.</strong> The Superintendencia de Industria y Comercio takes complaints
            about personal data directly, and can order us to act.
          </li>
          <li>
            <strong>European Union and United Kingdom.</strong> The data protection authority of the
            country you live in, whichever that is.
          </li>
          <li>
            <strong>United States.</strong> Your state Attorney General, and in California the
            Privacy Protection Agency.
          </li>
        </ul>
        <p className={styles.body}>
          Which of those applies is decided by where <em>you</em> are, not by where we are.
        </p>
      </section>

      <p className={styles.updated}>
        Every statement above describes how the software behaves, and each is verifiable in the source
        rather than asserted here.
      </p>
    </main>
  );
}
