'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ArrowLeft, Info, Warning } from '@/components/icons';
import { ScoreRing } from '@/components/ScoreRing';
import type { ProblemDetails, ReadabilityResponse } from '@/lib/contracts';
import {
  readabilityBandCopy,
  bandTone,
  impactPoints,
  priorityLabel,
  priorityTone,
  readabilitySectionLabel,
  toPercent,
  unmeasuredReason,
} from '@/lib/format';

import styles from './readability.module.css';

class SessionExpired extends Error {}

export function ReadabilityScreen({ resumeId }: { resumeId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<ReadabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const onExpired = useCallback(() => router.replace('/login'), [router]);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(`/api/resumes/${resumeId}/readability`, { method: 'POST' });
      if (response.status === 401) throw new SessionExpired();

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;
        throw new Error(problem.detail ?? `Could not score this CV (${response.status}).`);
      }

      setReport((await response.json()) as ReadabilityResponse);
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(caught instanceof Error ? caught.message : 'Could not score this CV.');
    } finally {
      setRunning(false);
    }
  }, [resumeId, onExpired]);

  // Scored on arrival. A readability run needs nothing from the candidate — no posting, no input — so
  // asking them to press a button first would be a gate in front of an answer already available.
  useEffect(() => {
    void run();
  }, [run]);

  const tone = report ? bandTone(report.band) : null;
  const measured = report?.breakdown.sections.filter((section) => section.weight > 0) ?? [];
  const unmeasured = report?.breakdown.sections.filter((section) => section.weight <= 0) ?? [];

  return (
    <div>
      <div className={styles.head}>
        <Link href={`/resumes/${resumeId}`} className="btn btnGhost" style={{ padding: 0, marginBottom: 8 }}>
          <ArrowLeft size={13} /> Back to the CV
        </Link>
        <h1 className={styles.title}>How this CV reads</h1>
        <p className={styles.subtitle}>
          No job posting involved — this is a fact about the CV on its own.
        </p>
      </div>

      {error && (
        <div className="notice noticeError" role="alert">
          {error}
        </div>
      )}

      {!report ? (
        <div className={`card ${styles.empty}`}>{running ? 'Scoring…' : error ? '' : 'Loading…'}</div>
      ) : (
        <>
          {/*
            Stated up front because it is the misreading this screen invites: two 0..100 numbers on two
            screens look like halves of one thing. They are different measurements of different
            subjects, and the API refuses to combine them for that reason.
          */}
          <div className="notice noticeInfo">
            <Info size={15} />
            <div>
              This is <strong>not</strong> the match score. That one measures this CV against one
              posting; this one measures the CV itself, and the two are never added together.
            </div>
          </div>

          <div className={styles.grid}>
            <div className={`card ${styles.scoreCard}`}>
              <ScoreRing
                value={report.readabilityScore}
                size={150}
                thickness={11}
                color={tone!.fg}
                track="var(--border-soft)"
                label={String(report.readabilityScore)}
                caption="READABILITY"
              />

              <div className={styles.bandPill} style={{ color: tone!.fg, background: tone!.bg }}>
                {readabilityBandCopy(report.band)}
              </div>

              <p className={styles.note}>
                Scored out of what could be measured: the weights below are renormalized over the
                sections that applied, so the ceiling is 100 either way. Readability model v
                {report.breakdown.weights.schemaVersion}.
              </p>
            </div>

            <div>
              <div className={`card ${styles.panel}`}>
                <h2 className={styles.panelTitle}>Breakdown</h2>
                <p className={styles.panelLead}>
                  Five sections. A section that could not be measured leaves the calculation rather
                  than scoring zero.
                </p>

                <div className={styles.bars}>
                  {measured.map((section) => {
                    const score = toPercent(section.score);
                    const sectionTone = bandTone(
                      score >= 80 ? 'Strong' : score >= 60 ? 'Good' : score >= 40 ? 'Medium' : 'Low',
                    );

                    return (
                      <div key={section.section}>
                        <div className={styles.barHead}>
                          <span>{readabilitySectionLabel(section.section)}</span>
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
                    Listed WITHOUT their score. A weight of 0 means nothing was measured, so the number
                    beside it measures nothing — rendering it as "0 / 100" would report a failure that
                    did not happen, and would make a hand-typed CV look punished for never having been
                    a file.
                  */}
                  {unmeasured.map((section) => (
                    <div key={section.section} className={styles.barHead}>
                      <span className={styles.unmeasured}>
                        {readabilitySectionLabel(section.section)}
                      </span>
                      <span className={styles.barUnit}>
                        not measured · {unmeasuredReason(section.section)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.advice}>
                {report.recommendations.length === 0 ? (
                  <div className={`card ${styles.empty}`}>
                    Nothing to act on. Advice a candidate cannot act on is not emitted, so an empty
                    list here is a complete answer.
                  </div>
                ) : (
                  report.recommendations.map((recommendation, index) => {
                    const priority = priorityTone(recommendation.priority);

                    return (
                      <div key={`${recommendation.kind}-${index}`} className={`card ${styles.adviceCard}`}>
                        <div className={styles.adviceHead}>
                          <span
                            className={styles.tag}
                            style={{ color: 'var(--good)', background: 'var(--good-bg)' }}
                          >
                            {impactPoints(recommendation.impact)}
                          </span>
                          <span
                            className={styles.tag}
                            style={{ color: priority.fg, background: priority.bg }}
                          >
                            {priorityLabel(recommendation.priority)}
                          </span>
                          <span
                            className={styles.tag}
                            style={{ color: 'var(--fg-muted)', background: 'var(--border-soft)' }}
                          >
                            {readabilitySectionLabel(recommendation.section)}
                          </span>
                        </div>
                        <p className={styles.adviceText}>{recommendation.message}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/*
                The one caveat worth repeating on screen: impacts are each measured alone, so they do
                not add up, and the parseability advice names an edit to a file that this product never
                stored.
              */}
              {report.recommendations.length > 0 && (
                <div className="notice noticeWarn" style={{ marginTop: 16 }}>
                  <Warning size={15} />
                  <div>
                    Each impact is the exact gain from closing that one gap, measured on its own. They
                    are not guaranteed to add up.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
