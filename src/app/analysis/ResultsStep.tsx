'use client';

import Link from 'next/link';

import { ArrowRight, Check, Cross, Warning } from '@/components/icons';
import type { AnalysisResponse, JobPostingResponse, SectionScoreResponse } from '@/lib/contracts';
import { bandCopy, bandTone, requirementAnswers, sectionLabel, toPercent } from '@/lib/format';

import styles from './analysis.module.css';
import { Notice } from './Notice';
import { ScoreRing } from '@/components/ScoreRing';

/** A section is a result only when it carried weight. Below this it is treated as unmeasured. */
const MEASURED = 0;

/** What counts as a section worth calling out. Chosen here, and labelled as this app's threshold. */
const STRONG_SECTION = 0.8;

interface ResultsStepProps {
  analysis: AnalysisResponse;
  posting: JobPostingResponse;
  resumeName: string;
  onRerun: () => void;
  onViewSuggestions: () => void;
}

function orderSections(sections: SectionScoreResponse[]): SectionScoreResponse[] {
  return [...sections].sort((a, b) => {
    const measured = Number(b.weight > MEASURED) - Number(a.weight > MEASURED);
    return measured !== 0 ? measured : b.weight - a.weight;
  });
}

export function ResultsStep({
  analysis,
  posting,
  resumeName,
  onRerun,
  onViewSuggestions,
}: ResultsStepProps) {
  const tone = bandTone(analysis.band);
  const sections = orderSections(analysis.breakdown.sections);
  const measured = sections.filter((s) => s.weight > MEASURED);
  const unmeasured = sections.filter((s) => s.weight <= MEASURED);
  const strong = measured.filter((s) => s.score >= STRONG_SECTION);
  // `null` when this analysis carries no attribution — a stored run read back rather than freshly
  // scored. Three states, not two: answered, not answered, and not known.
  const answerFor = requirementAnswers(analysis.requirementMatches);
  const answers = posting.requirements.map((r) => answerFor(r.skill));
  const knownCount = answers.filter((a) => a !== null).length;
  const answeredCount = answers.filter((a) => a?.satisfied).length;

  return (
    <div className={styles.screen}>
      <div className={styles.resultsHead}>
        <div>
          <div className={styles.eyebrow}>
            {resumeName} · vs · {posting.title}
            {posting.companyName ? ` at ${posting.companyName}` : ''}
          </div>
          <h1 className={styles.pageTitle}>Analysis results</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={onRerun}>
            New analysis
          </button>
          {/*
            The step this screen never had. A score told a candidate how well their CV answers a
            posting and then left them with the number — this is the CV that posting would read,
            composed from what they already wrote and nothing else.
          */}
          <Link
            href={`/resumes/${analysis.resumeId}/print?posting=${posting.id}`}
            className="btn"
          >
            Build a CV for this job
          </Link>
          <button type="button" className="btn btnPrimary" onClick={onViewSuggestions}>
            View suggestions <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/*
        Only rendered when true. `POST /v1/scoring/score` always answers false — the run it returns
        was either just computed or reused precisely because the CV had not moved — so this is here
        for the day this screen reads a stored analysis back, not as decoration.
      */}
      {analysis.isStale && (
        <Notice variant="warn">
          This CV has been edited since the score was taken, so the number below describes a version
          you no longer have. Run the analysis again to refresh it.
        </Notice>
      )}

      <div className={styles.resultsGrid}>
        <div className={`card ${styles.scoreCard}`}>
          <ScoreRing
            value={analysis.overallScore}
            size={150}
            thickness={11}
            color={tone.fg}
            track="var(--border-soft)"
            label={String(analysis.overallScore)}
            caption="MATCH SCORE"
          />

          <div className={styles.bandPill} style={{ color: tone.fg, background: tone.bg }}>
            {bandCopy(analysis.band)}
          </div>

          <p className={styles.scoreNote}>
            A fact about this CV <em>against this posting</em> — not a rating of the CV on its own,
            and never to be added to a readability score. Scoring model v
            {analysis.breakdown.weights.schemaVersion}; two analyses on different versions are not
            comparable.
          </p>
        </div>

        <div className={styles.stack}>
          <div className={`card ${styles.panel}`}>
            <h2 className={styles.panelTitle}>Score breakdown</h2>
            <p className={styles.panelLead}>
              Weights are renormalized to total 100% across the sections this posting actually asked
              about.
            </p>

            <div className={styles.barList}>
              {measured.map((section) => {
                const score = toPercent(section.score);
                const sectionTone = bandTone(
                  score >= 80 ? 'Strong' : score >= 60 ? 'Good' : score >= 40 ? 'Medium' : 'Low',
                );

                return (
                  <div key={section.section}>
                    <div className={styles.barHead}>
                      <span>{sectionLabel(section.section)}</span>
                      <span className={styles.barValue} style={{ color: sectionTone.fg }}>
                        {score}{' '}
                        <span className={styles.barUnit}>
                          / 100 · weight {toPercent(section.weight)}%
                        </span>
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{ width: `${score}%`, background: sectionTone.fg }}
                      />
                    </div>
                  </div>
                );
              })}

              {/*
                Sections with weight 0 are listed WITHOUT their score, and that is the contract rather
                than a design choice: the API states the score beside a zero weight measures nothing,
                so rendering it as a result — a red "0 / 100" — would be reporting a failure the
                posting never asked about.
              */}
              {unmeasured.map((section) => (
                <div key={section.section} className={styles.barHead}>
                  <span className={styles.unmeasured}>{sectionLabel(section.section)}</span>
                  <span className={styles.barUnit}>
                    not measured · this posting expressed no weighted requirement
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.duoGrid}>
            <div className={`card ${styles.panel}`}>
              <h2 className={styles.panelTitle} style={{ color: 'var(--good-fg)', fontSize: 14 }}>
                Strengths
              </h2>
              <p className={styles.panelLead}>Sections that carried weight and scored 80 or above.</p>
              <div className={styles.stack} style={{ gap: 10 }}>
                {strong.length === 0 && (
                  <span className={styles.unmeasured}>No section reached 80 on this posting.</span>
                )}
                {strong.map((section) => (
                  <div key={section.section} className={styles.listRow}>
                    <Check size={14} />
                    <span>
                      {sectionLabel(section.section)} — {toPercent(section.score)} / 100
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`card ${styles.panel}`}>
              <h2 className={styles.panelTitle} style={{ color: 'var(--warn-fg)', fontSize: 14 }}>
                Gaps
              </h2>
              <p className={styles.panelLead}>
                The highest-impact advice this run produced. Every one is on the next screen.
              </p>
              <div className={styles.stack} style={{ gap: 10 }}>
                {analysis.recommendations.length === 0 && (
                  <span className={styles.unmeasured}>
                    Nothing to act on — this run produced no recommendations.
                  </span>
                )}
                {analysis.recommendations.slice(0, 3).map((recommendation, index) => (
                  <div key={`${recommendation.kind}-${index}`} className={styles.listRow}>
                    <Warning size={14} />
                    <span>{recommendation.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`card ${styles.panel}`}>
        <h2 className={styles.panelTitle}>Skills this posting asked for</h2>
        <p className={styles.panelLead}>
          {posting.requirements.length === 0
            ? 'None were recorded, so the skills section carried no weight in the score above.'
            : knownCount === 0
              ? `${posting.requirements.length} recorded. This run was read back from storage, so it does not say which your CV answers.`
              : `${answeredCount} of ${knownCount} answered by your CV.`}
        </p>

        <div className={styles.chipRow}>
          {posting.requirements.map((requirement, index) => {
            const answer = answers[index] ?? null;
            const missing = answer !== null && !answer.satisfied;
            const answered = answer?.satisfied ?? false;

            // The candidate's own wording, shown only when it differs from what the posting asked
            // for. "React.js" against a requirement for "React" is the one thing a candidate cannot
            // work out for themselves, and it is the engine's synonym lexicon made visible.
            const differing = (answer?.by ?? []).filter(
              (text) => text.trim().toLowerCase() !== requirement.skill.trim().toLowerCase(),
            );

            return (
              <span
                key={requirement.skill}
                className={styles.chip}
                style={
                  missing
                    ? {
                        background: 'var(--bad-bg)',
                        color: 'var(--bad-fg)',
                        borderColor: 'var(--bad-border)',
                      }
                    : answered
                      ? {
                          background: 'var(--good-bg)',
                          color: 'var(--good-strong)',
                          borderColor: 'var(--good-border)',
                        }
                      : undefined
                }
              >
                {missing && <Cross size={11} />}
                {answered && <Check size={11} />}
                {requirement.skill}
                {differing.length > 0 && (
                  <span className={styles.chipMuted}>via {differing.join(', ')}</span>
                )}
                <span className={styles.chipMuted}>
                  {requirement.priority === 'MustHave' ? 'must have' : 'nice to have'}
                </span>
              </span>
            );
          })}
        </div>

        {/*
          A "found" chip exists now, and the reason it could not before is worth keeping. The API
          caps recommendations at ten, so absence of advice was never evidence of a match — and
          re-deriving the match in this file would have been worse, because the engine recognises
          alternative spellings and a second matcher here would eventually contradict the score
          printed above it.

          `requirementMatches` carries EVERY requirement with what answered it, so the claim is the
          server's rather than an inference from silence. Absence is no longer what is interpreted.
        */}
        {posting.requirements.length > 0 && knownCount === 0 && (
          <p className={styles.footnote} style={{ textAlign: 'left', marginTop: 12 }}>
            This analysis was read back from storage rather than scored just now, so it does not carry
            which requirements your CV answers. Running it again would say.
          </p>
        )}
      </div>
    </div>
  );
}
