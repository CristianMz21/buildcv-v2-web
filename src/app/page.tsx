import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import styles from './landing.module.css';

/**
 * The public front door, and the first page on this deployment that is meant to be read by someone
 * without an account.
 *
 * Before this, `/` was `redirect('/resumes')` and `/resumes` is behind the session gate in
 * `(app)/layout.tsx`, so every anonymous visitor — including anyone arriving from a link that
 * described the product — landed on a bare sign-in form with no statement of what they would be
 * signing in to. The redirect was correct while the only alternative was a dashboard of placeholders
 * with no endpoints behind it; it is not correct once there is something true to say.
 *
 * NOTE FOR WHOEVER READS CLAUDE.md NEXT: its "Removed on purpose" table drops the `seo` skill on the
 * grounds that "everything but /login and /register is behind a session gate". This page is the
 * exception that premise did not anticipate. Nothing here is personal data and nothing here calls the
 * API, so `frame-ancestors 'none'` and the rest of the CSP are untouched — but a public, indexable
 * page now exists, and that table should be revisited rather than trusted.
 *
 * EVERY NUMBER ON THIS PAGE IS READ FROM THE ENGINE, NOT CHOSEN FOR THE PAGE. The weights are
 * `ScoringWeightsSnapshot.Default()`, the thresholds are `Analysis.Band`, and the model version is
 * `CurrentSchemaVersion`, all in the `buildcv-v2` repo. A marketing page that rounded them would be
 * making the one claim this product cannot afford to get wrong — that the score is checkable.
 * If the engine moves, this page is stale and says something false; it is not decoration.
 */
export const metadata: Metadata = {
  title: 'BuildCv · Deterministic CV scoring',
  description:
    'Score a CV against a specific job posting and see exactly where every point came from. Six weighted sections, published thresholds, no LLM anywhere in the score.',
};

/** `ScoringWeightsSnapshot.Default()` — Create(0.45, 0.20, 0.10, 0.10, 0.05, 0.10). */
const WEIGHTS = [
  { section: 'Skills', weight: 0.45 },
  { section: 'Experience', weight: 0.2 },
  { section: 'Education', weight: 0.1 },
  { section: 'Certifications', weight: 0.1 },
  { section: 'Languages', weight: 0.1 },
  { section: 'Projects', weight: 0.05 },
] as const;

/** `Analysis.Band` — the cuts are < 40, < 60, < 80, else Strong. */
const BANDS = [
  { name: 'Low', range: '0 – 39' },
  { name: 'Medium', range: '40 – 59' },
  { name: 'Good', range: '60 – 79' },
  { name: 'Strong', range: '80 – 100' },
] as const;

/** `ReadabilitySectionType` — the standalone score, which needs no job posting. */
const READABILITY = [
  'Completeness',
  'Contact',
  'Achievements',
  'Chronology',
  'ATS parseability',
] as const;

export default async function Home() {
  // Same gate the sign-in page uses, and for the same reason: someone who already has a session came
  // here by typing the bare domain, and their work is one screen away.
  if (await readSession()) redirect('/resumes');

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          BuildCv
        </span>
        <nav className={styles.barLinks} aria-label="Account">
          <Link href="/login">Sign in</Link>
          <Link className="btn btnPrimary" href="/register">
            Create an account
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.title}>Find out why your CV scored what it scored.</h1>
          <p className={styles.lead}>
            BuildCv scores a CV against one specific job posting and shows where every point came
            from. The weights, the thresholds and the rules are all published on this page — because a
            score you cannot check is a score you cannot act on.
          </p>
          <p className={styles.lead}>
            There is no language model anywhere in the scoring. The same CV and the same posting
            produce the same number today and next month, and any change to that number means the
            model changed and said so.
          </p>
          <div className={styles.actions}>
            <Link className="btn btnPrimary btnLarge" href="/register">
              Create an account
            </Link>
            <Link className="btn btnLarge" href="/login">
              Sign in
            </Link>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="model">
          <h2 className={styles.sectionTitle} id="model">
            How the score is built
          </h2>
          <p className={styles.sectionBody}>
            Six sections, each carrying a fixed share of the total. The bar beside each one is that
            share — Skills is 45% of the score because its weight is 0.45.
          </p>
          <div className={`card ${styles.panel}`}>
            <table className={styles.table}>
              <caption>
                Default section weights, scoring model v4. They sum to 1.00.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Weight</th>
                  <th scope="col">
                    <span className="srOnly">Share of the total score</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {WEIGHTS.map((row) => (
                  <tr key={row.section}>
                    <th scope="row">{row.section}</th>
                    <td className={styles.num}>{row.weight.toFixed(2)}</td>
                    <td className={styles.weightCell}>
                      <span
                        className={styles.weightBar}
                        style={{ width: `${row.weight * 100}%` }}
                        aria-hidden="true"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.sectionBody}>
            A section the posting asks nothing about does not quietly cost you points. Its weight is
            redistributed across the sections the posting does ask about, so the ceiling is 100 for
            every posting — and the score answers &ldquo;how well do you match what you were actually
            asked&rdquo;, not &ldquo;how well do you fill a fixed six-part template&rdquo;.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="bands">
          <h2 className={styles.sectionTitle} id="bands">
            What the number means
          </h2>
          <p className={styles.sectionBody}>
            Four bands, with the cuts stated rather than implied.
          </p>
          <ul className={styles.bands}>
            {BANDS.map((band) => (
              <li className={styles.band} key={band.name}>
                <span className={styles.bandName}>{band.name}</span>
                <span className={styles.bandRange}>{band.range}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="explain">
          <h2 className={styles.sectionTitle} id="explain">
            Every suggestion carries a measured number
          </h2>
          <p className={styles.sectionBody}>
            When BuildCv suggests a change, it re-runs the whole scoring formula with that one gap
            closed and reports the difference. A suggestion that says{' '}
            <strong>&ldquo;+3.2 points&rdquo;</strong> is reporting a score that was calculated, not an
            estimate of how much it might help. If the engine cannot measure it, it does not claim it.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="two-scores">
          <h2 className={styles.sectionTitle} id="two-scores">
            Two scores, and they are never added together
          </h2>
          <div className={styles.pairs}>
            <div className={`card ${styles.panel}`}>
              <h3 className={styles.pairTitle}>Match score</h3>
              <p className={styles.pairBody}>
                How well this CV answers one specific posting. It only means anything relative to that
                posting, so it needs one before it can be calculated.
              </p>
            </div>
            <div className={`card ${styles.panel}`}>
              <h3 className={styles.pairTitle}>Readability score</h3>
              <p className={styles.pairBody}>
                How well the CV reads and parses on its own — no posting required, so it is available
                the moment a CV is uploaded.
              </p>
              <ul className={styles.list}>
                {READABILITY.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className={styles.sectionBody}>
            They are different models measuring different things. Averaging them would produce a
            number that describes nothing, so BuildCv never shows one.
          </p>
        </section>
      </main>

      <footer className={styles.foot}>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <span>Free for job seekers.</span>
      </footer>
    </div>
  );
}
