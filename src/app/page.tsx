import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import { LandingFaq } from './LandingFaq';
import { LandingNav } from './LandingNav';
import styles from './landing.module.css';

/**
 * The public front door, and the only page on this deployment meant to be read by someone without an
 * account.
 *
 * Before this, `/` was `redirect('/resumes')` and `/resumes` is behind the session gate, so every
 * anonymous visitor — including anyone arriving from a link that described the product — landed on a
 * bare sign-in form with no statement of what they would be signing in to.
 *
 * NOTE FOR WHOEVER READS CLAUDE.md NEXT: its "Removed on purpose" table drops the `seo` skill on the
 * grounds that "everything but /login and /register is behind a session gate". This page is the
 * exception that premise did not anticipate. Nothing here is personal data and nothing here calls the
 * API, so the CSP is untouched — but a public, indexable page now exists, and that table should be
 * revisited rather than trusted.
 *
 * EVERY NUMBER ON THIS PAGE IS READ FROM THE ENGINE, NOT CHOSEN FOR THE PAGE. The weights are
 * `ScoringWeightsSnapshot.Default()` — `Create(0.45, 0.20, 0.10, 0.10, 0.05, 0.10)` against a
 * signature of `(skills, experience, education, certifications, projects, languages)` — the
 * thresholds are `Analysis.Band`, and the readability sections are that snapshot's own parameter
 * names. All checked in `buildcv-v2` before this page was written. A landing page is the easiest
 * place in a product to say something almost true, and this product's entire argument is that its
 * numbers are measured; one rounded figure here would undercut the thing it sells.
 */
export const metadata: Metadata = {
  /*
   * THE BRAND IS WRITTEN OUT HERE AND NOWHERE ELSE, because the root page is the one page the root
   * layout's title template does not reach: `title.template` applies to CHILD segments, and
   * `app/page.tsx` shares its segment with `app/layout.tsx`. Measured rather than assumed — every
   * other page rendered "… · BuildCv" and this one rendered the bare phrase.
   *
   * The phrase leads and the brand follows, which is the right order for a product nobody is
   * searching for by name yet: the words somebody actually types go first.
   */
  title: 'Free CV checker and job match score · BuildCv',
  description:
    'See how well your CV answers a specific job posting. Six weighted sections, published thresholds, a separate readability score, and no AI anywhere in the number. Free for job seekers.',
};

/** `ScoringWeightsSnapshot.Default()` — Create(0.45, 0.20, 0.10, 0.10, 0.05, 0.10). */
const WEIGHTS = [
  { section: 'Skills', pct: 45 },
  { section: 'Experience', pct: 20 },
  { section: 'Education', pct: 10 },
  { section: 'Certifications', pct: 10 },
  { section: 'Languages', pct: 10 },
  { section: 'Projects', pct: 5 },
] as const;

/** `Analysis.Band` — the cuts are < 40, < 60, < 80, else Strong. */
const BANDS = [
  { name: 'Low', range: '0–39', token: 'var(--bad)' },
  { name: 'Medium', range: '40–59', token: 'var(--warn)' },
  { name: 'Good', range: '60–79', token: 'var(--primary)' },
  { name: 'Strong', range: '80–100', token: 'var(--good-strong)' },
] as const;

/** The five parameters of `ReadabilityWeightsSnapshot.Create`. */
const READABILITY = ['Completeness', 'Contact details', 'Achievements', 'Chronology', 'ATS parseability'] as const;

/**
 * The example in the hero.
 *
 * LABELLED AS AN EXAMPLE ON SCREEN, because a screenshot of invented numbers presented as real is the
 * exact dishonesty the rest of the product is built to avoid. These are illustrative and say so.
 */
const EXAMPLE_BARS = [
  { label: 'Skills', pct: 92, tone: 'var(--good-strong)' },
  { label: 'Experience', pct: 84, tone: 'var(--good-strong)' },
  { label: 'Education', pct: 76, tone: 'var(--primary)' },
  { label: 'Certifications', pct: 70, tone: 'var(--primary)' },
  { label: 'Languages', pct: 100, tone: 'var(--good-strong)' },
  { label: 'Projects', pct: 80, tone: 'var(--primary)' },
] as const;

const TRUST = [
  { title: 'Published scoring', desc: 'Every weight and threshold on this page is the one the engine uses.' },
  { title: 'Scored against one posting', desc: 'Not a general rating — the specific role you are applying to.' },
  { title: 'Advice with a number on it', desc: 'Each suggestion carries the points it is actually worth.' },
  { title: 'Readability judged separately', desc: 'Structure and parseability, measured on their own terms.' },
] as const;

const STEPS = [
  { n: '1', title: 'Bring your CV', desc: 'PDF, DOCX or plain text. The readability score is ready immediately — no posting needed.' },
  { n: '2', title: 'Paste the job posting', desc: 'You confirm the requirements it found before anything is scored.' },
  { n: '3', title: 'Read where the points went', desc: 'The section breakdown, what answered each requirement, and what did not.' },
] as const;

const ARROW = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export default async function Home() {
  // Same gate the sign-in page uses, and for the same reason: somebody who already has a session came
  // here by typing the bare domain, and their work is one screen away.
  if (await readSession()) redirect('/resumes');

  return (
    <div className={styles.page}>
      <LandingNav />

      <main id="top">
        <section className={styles.hero}>
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.badge}>
                <span className={styles.badgeDot} aria-hidden="true" />
                Free for job seekers
              </span>
              <h1 className={styles.title}>See how well your CV answers the job.</h1>
              <p className={styles.lead}>
                BuildCv scores your CV against one specific posting and shows you where you match, what
                the posting asked for that you did not answer, and what each fix is worth.
              </p>
              <div className={styles.actions}>
                <Link href="/register" className={styles.cta}>
                  Get your free score
                  {ARROW}
                </Link>
                <a href="#how-it-works" className={styles.ctaGhost}>
                  See how it works
                </a>
              </div>
              <p className={styles.fineprint}>Free, and there is no card to enter.</p>
            </div>

            <div>
              <div className={styles.preview}>
                <div className={styles.previewBar}>
                  <span className={styles.previewDots} aria-hidden="true">
                    <span className={styles.previewDot} />
                    <span className={styles.previewDot} />
                    <span className={styles.previewDot} />
                  </span>
                  <span className={styles.previewLabel}>Example, not real data</span>
                </div>
                <div className={styles.previewBody}>
                  <div className={styles.scoreRow}>
                    <div className={styles.dial}>
                      <svg width="76" height="76" viewBox="0 0 76 76" className={styles.dialSvg} aria-hidden="true">
                        <circle cx="38" cy="38" r="32" fill="none" stroke="#dbeafe" strokeWidth="7" />
                        <circle cx="38" cy="38" r="32" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray="201" strokeDashoffset="36.2" />
                      </svg>
                      <div className={styles.dialValue}>82</div>
                    </div>
                    <div>
                      <div className={styles.scoreLabel}>Strong</div>
                      <div className={styles.scoreCaption}>
                        Because 82 is at or above 80 — the band is the server&rsquo;s, not a colour picked here.
                      </div>
                    </div>
                  </div>

                  <div className={styles.bars}>
                    {EXAMPLE_BARS.map((bar) => (
                      <div key={bar.label} className={styles.barRow}>
                        <span className={styles.barLabel}>{bar.label}</span>
                        <span className={styles.barTrack}>
                          <span className={styles.barFill} style={{ width: `${bar.pct}%`, background: bar.tone }} />
                        </span>
                        <span className={styles.barPct}>{bar.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="trust-h" className={`${styles.banded} ${styles.bandedBoth}`}>
          <div className={styles.section}>
            <div className={styles.narrow}>
              <h2 id="trust-h" className={styles.sectionTitle}>
                Nothing about the number is hidden.
              </h2>
              <p className={styles.sectionLead}>
                The weights, the thresholds and the rules are on this page. You can check the score
                rather than trust it.
              </p>
            </div>
            <div className={`${styles.grid} ${styles.grid4}`}>
              {TRUST.map((point) => (
                <div key={point.title} className={`${styles.card} ${styles.cardTight}`}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <div className={styles.cardTitle}>{point.title}</div>
                  <p className={styles.cardBody}>{point.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-h" className={styles.banded}>
          <div className={styles.section}>
            <h2 id="how-h" className={styles.sectionTitle} style={{ marginBottom: 36 }}>
              How it works
            </h2>
            <ol className={styles.steps}>
              {STEPS.map((step) => (
                <li key={step.n} className={styles.card}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {step.n}
                  </span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.desc}</p>
                </li>
              ))}
            </ol>
            <Link href="/register" className={`${styles.cta} ${styles.ctaSmall}`}>
              Check my CV
              {ARROW}
            </Link>
          </div>
        </section>

        <section id="scoring" aria-labelledby="scoring-h" className={styles.section}>
          <div className={styles.split}>
            <div>
              <h2 id="scoring-h" className={styles.sectionTitle}>
                Where the points come from
              </h2>
              <p className={styles.sectionLead} style={{ marginBottom: 20 }}>
                Six sections, weighted. These are the engine&rsquo;s own numbers.
              </p>
              <p className={styles.cardBody} style={{ fontSize: 15, lineHeight: 1.7 }}>
                Postings ask for different things. When one says nothing about a section, its weight is
                redistributed across the sections it does ask about — so you are never marked down for
                information the employer never wanted. A section carrying no weight is shown as{' '}
                <em>not measured</em>, never as a zero.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.weights}>
                {WEIGHTS.map((weight) => (
                  <div key={weight.section}>
                    <div className={styles.weightHead}>
                      <span className={styles.weightLabel}>{weight.section}</span>
                      <span className={styles.weightPct}>{weight.pct}%</span>
                    </div>
                    <div className={styles.weightTrack}>
                      <div className={styles.weightFill} style={{ width: `${(weight.pct / 45) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="bands-h" className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.narrow}>
            <h2 id="bands-h" className={styles.sectionTitle}>
              What the number means
            </h2>
            <p className={styles.sectionLead}>
              The score is relative to the posting you analysed, not a verdict on your CV. The same CV
              scores differently against two roles, and both numbers are correct.
            </p>
          </div>
          <div className={`${styles.grid} ${styles.gridBands}`}>
            {BANDS.map((band) => (
              <div key={band.name} className={styles.card}>
                <div className={styles.bandSwatch} style={{ background: band.token }} aria-hidden="true" />
                <div className={styles.bandRange}>{band.range}</div>
                <div className={styles.bandLabel}>{band.name}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="readability" aria-labelledby="read-h" className={styles.banded}>
          <div className={styles.section}>
            <div className={styles.narrow}>
              <h2 id="read-h" className={styles.sectionTitle}>
                Your CV has two jobs.
              </h2>
              <p className={styles.sectionLead}>
                It has to answer the posting, and it has to be readable by whatever opens it first.
              </p>
            </div>
            <div className={`${styles.grid} ${styles.split}`} style={{ marginBottom: 20 }}>
              <div className={styles.card}>
                <div className={`${styles.eyebrow} ${styles.eyebrowMatch}`}>Match score</div>
                <p className={styles.sectionLead} style={{ fontSize: 15 }}>
                  How well your CV answers one specific posting. It cannot exist without one.
                </p>
              </div>
              <div className={styles.card}>
                <div className={`${styles.eyebrow} ${styles.eyebrowRead}`}>Readability score</div>
                <p className={styles.sectionLead} style={{ fontSize: 15, marginBottom: 16 }}>
                  How well the document itself holds up — no posting needed, so it is there the moment
                  you import a CV.
                </p>
                <div className={styles.tags}>
                  {READABILITY.map((factor) => (
                    <span key={factor} className={styles.tag}>
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className={styles.note}>
              They measure different things and are never added together.
            </p>
          </div>
        </section>

        <section aria-labelledby="sugg-h" className={styles.section}>
          <div className={`${styles.split} ${styles.splitCentred}`}>
            <div>
              <h2 id="sugg-h" className={styles.sectionTitle}>
                A score is useful. Knowing what to change is better.
              </h2>
              <p className={styles.sectionLead}>
                Each suggestion carries the points it is worth, recalculated by the engine rather than
                estimated. The catch is stated on screen too: impacts are measured one at a time and
                are not guaranteed to add up.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.recoHead}>Example recommendation</div>
              <div className={styles.recoRow}>
                <div>
                  <div className={styles.recoScore}>74</div>
                  <div className={styles.recoCaption}>Now</div>
                </div>
                <div className={styles.recoDelta}>+5 points</div>
                <div style={{ textAlign: 'right' }}>
                  <div className={styles.recoScore} style={{ color: 'var(--primary)' }}>
                    79
                  </div>
                  <div className={styles.recoCaption}>Projected</div>
                </div>
              </div>
              <div className={styles.recoRule} />
              <p className={styles.recoText}>
                The posting names a skill your CV never mentions. Adding it where it is true is worth
                five points; adding it where it is not is worth an awkward interview.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.dark}>
            <h2 className={styles.darkTitle}>Find out where your CV stands.</h2>
            <p className={styles.darkLead}>
              Import a CV, paste the posting, read the breakdown.
            </p>
            <Link href="/register" className={styles.cta}>
              Get my free score
              {ARROW}
            </Link>
            <p className={styles.darkFine}>Free for job seekers.</p>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-h" className={styles.banded}>
          <div className={styles.faqWrap}>
            <h2 id="faq-h" className={styles.sectionTitle} style={{ marginBottom: 32 }}>
              Questions people actually ask
            </h2>
            <LandingFaq />
          </div>
        </section>

        <section className={styles.closing}>
          <h2 className={styles.closingTitle}>Know your CV before you apply.</h2>
          <p className={styles.closingLead}>It takes one posting and a couple of minutes.</p>
          <Link href="/register" className={styles.cta}>
            Check my CV
            {ARROW}
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">
              B
            </span>
            <span className={styles.brandName}>BuildCv</span>
          </Link>
          <nav aria-label="Footer" className={styles.footerNav}>
            <a href="#how-it-works" className={styles.footerLink}>
              How it works
            </a>
            <a href="#scoring" className={styles.footerLink}>
              Scoring
            </a>
            <a href="#faq" className={styles.footerLink}>
              FAQ
            </a>
            <Link href="/legal/privacy" className={styles.footerLink}>
              Privacy
            </Link>
            <Link href="/legal/terms" className={styles.footerLink}>
              Terms
            </Link>
            <Link href="/login" className={styles.footerLink}>
              Sign in
            </Link>
            <Link href="/register" className={styles.footerLink}>
              Create account
            </Link>
          </nav>
          <span className={styles.footerNote}>Free for job seekers.</span>
        </div>
      </footer>
    </div>
  );
}
