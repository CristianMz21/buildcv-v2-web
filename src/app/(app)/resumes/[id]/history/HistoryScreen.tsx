'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ArrowLeft, Info } from '@/components/icons';
import type { AnalysisResponse, JobPostingResponse, PagedResponse } from '@/lib/contracts';
import { bandTone, plural } from '@/lib/format';
import { messageOf, readJson, SessionExpired } from '@/lib/http';

import styles from './history.module.css';

/** One posting's runs, oldest first — the order the API pages them in and the order they happened. */
interface Group {
  postingId: string;
  title: string;
  runs: AnalysisResponse[];
}

export function HistoryScreen({ resumeId }: { resumeId: string }) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const onExpired = useCallback(() => router.replace('/login'), [router]);

  const load = useCallback(async () => {
    try {
      // Walked to the end rather than paged in the UI: a history is small, and a partial one would
      // make "did my change help" answerable only for whatever happened to be on the first page.
      const runs: AnalysisResponse[] = [];
      let cursor: string | null = null;
      let guard = 0;

      do {
        const query = new URLSearchParams({ limit: '100' });
        if (cursor) query.set('cursor', cursor);

        const response: Response = await fetch(`/api/resumes/${resumeId}/analyses?${query}`);
        // A CV that is gone has no history to fail at loading. Reporting it as a load failure sends
        // the candidate back to a link that will never work again.
        if (response.status === 404) return setNotFound(true);

        const page = await readJson<PagedResponse<AnalysisResponse>>(response);
        runs.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && ++guard < 20);

      // GROUPED BY POSTING, and this is the whole design of the screen. Two runs against DIFFERENT
      // postings carry different weights — each posting asks about a different set of sections — so
      // the API states outright that their scores are not comparable. A single trend line over all of
      // them would draw exactly the comparison the contract forbids.
      const byPosting = new Map<string, AnalysisResponse[]>();
      for (const run of runs) {
        const bucket = byPosting.get(run.jobPostingId) ?? [];
        bucket.push(run);
        byPosting.set(run.jobPostingId, bucket);
      }

      const resolved = await Promise.all(
        [...byPosting.entries()].map(async ([postingId, postingRuns]) => {
          let title = 'A job posting';
          try {
            const response = await fetch(`/api/jobs/${postingId}`);
            if (response.ok) {
              const posting = (await response.json()) as JobPostingResponse;
              title = posting.companyName
                ? `${posting.title} · ${posting.companyName}`
                : posting.title;
            }
          } catch {
            // A posting that cannot be read still has runs worth showing; the label falls back rather
            // than the group disappearing.
          }
          return { postingId, title, runs: postingRuns };
        }),
      );

      // Most recently scored posting first: the one being worked on now is the one to see first.
      resolved.sort((a, b) => {
        const last = (group: Group) => group.runs[group.runs.length - 1]?.scoredAt ?? '';
        return last(b).localeCompare(last(a));
      });

      setGroups(resolved);
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(messageOf(caught, 'Could not load the history.'));
    }
  }, [resumeId, onExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  // The same sentence the editor and the readability screen use, because it is the same fact: three
  // screens describing one missing CV should not each invent their own wording for it.
  if (notFound) {
    return (
      <div className="card" style={{ padding: 28 }}>
        <h1 className={styles.title}>No such CV</h1>
        <p className={styles.subtitle}>
          It may have been deleted, or it belongs to another account.
        </p>
        <Link href="/resumes" className="btn">
          <ArrowLeft size={13} /> Back to your CVs
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.head}>
        <Link href={`/resumes/${resumeId}`} className="btn btnGhost" style={{ padding: 0, marginBottom: 8 }}>
          <ArrowLeft size={13} /> Back to the CV
        </Link>
        <h1 className={styles.title}>Score history</h1>
        <p className={styles.subtitle}>
          Every run this CV has been through, grouped by the posting it was scored against.
        </p>
      </div>

      {error && (
        <div className="notice noticeError" role="alert">
          {error}
        </div>
      )}

      {groups === null && !error && <p className={styles.subtitle}>Loading…</p>}

      {groups?.length === 0 && (
        <div className={`card ${styles.empty}`}>
          This CV has not been scored yet. Run an analysis and its history starts here.
        </div>
      )}

      {groups && groups.length > 1 && (
        <div className="notice noticeInfo">
          <Info size={15} />
          <div>
            Scores are grouped by posting because each posting weighs the sections differently — a 70
            against one and a 60 against another do not rank them. Compare within a group.
          </div>
        </div>
      )}

      {groups?.map((group) => {
        const best = Math.max(...group.runs.map((run) => run.overallScore));
        const versions = new Set(group.runs.map((run) => run.breakdown.weights.schemaVersion));

        return (
          <div key={group.postingId} className={`card ${styles.group}`}>
            <div className={styles.groupHead}>
              <h2 className={styles.groupTitle}>{group.title}</h2>
              <span className={styles.groupMeta}>
                {plural(group.runs.length, 'run')} · best {best}
              </span>
            </div>
            <p className={styles.groupLead}>Oldest first. Same posting, so these are comparable.</p>

            <div className={styles.chart}>
              {group.runs.map((run) => {
                const tone = bandTone(run.band);
                return (
                  <div
                    key={run.id}
                    className={styles.bar}
                    style={{
                      // Against a fixed 100, not against the tallest bar: a relative scale makes a
                      // run of 40s look like a run of 90s.
                      height: `${Math.max(run.overallScore, 2)}%`,
                      background: tone.fg,
                    }}
                    title={`${run.overallScore} on ${new Date(run.scoredAt).toLocaleDateString()}`}
                  >
                    <span className={styles.barLabel} style={{ color: tone.fg }}>
                      {run.overallScore}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className={styles.runs}>
              {group.runs.map((run, index) => {
                const tone = bandTone(run.band);
                const previous = group.runs[index - 1];
                const delta = previous ? run.overallScore - previous.overallScore : null;
                const versionChanged =
                  previous &&
                  previous.breakdown.weights.schemaVersion !== run.breakdown.weights.schemaVersion;

                return (
                  <div key={run.id} className={styles.run}>
                    <span className={styles.runDate}>
                      {new Date(run.scoredAt).toLocaleDateString()}
                    </span>
                    <span
                      className={styles.runScore}
                      style={{ color: tone.fg, background: tone.bg }}
                    >
                      {run.overallScore}
                    </span>
                    <span
                      className={styles.runDelta}
                      style={{
                        color: delta === null ? 'var(--fg-faint)' : delta >= 0 ? 'var(--good)' : 'var(--bad)',
                      }}
                    >
                      {/* Withheld across a model change, because the two numbers were produced by
                          different rules and their difference measures neither the CV nor the CV's
                          progress. */}
                      {versionChanged
                        ? 'not comparable'
                        : delta === null
                          ? 'first run'
                          : delta === 0
                            ? 'no change'
                            : `${delta > 0 ? '+' : ''}${delta}`}
                    </span>
                    <span className={styles.runFlags}>
                      {versionChanged && (
                        <span className={`${styles.flag} ${styles.flagVersion}`}>
                          model v{run.breakdown.weights.schemaVersion}
                        </span>
                      )}
                      {run.isStale && (
                        <span className={`${styles.flag} ${styles.flagStale}`}>CV has changed since</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {versions.size > 1 && (
              <p className={styles.groupLead} style={{ marginTop: 12, marginBottom: 0 }}>
                This group spans {versions.size} scoring models. Runs on different models were produced
                by different rules and are not comparable — re-score to get a current number.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
