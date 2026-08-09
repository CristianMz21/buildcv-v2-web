'use client';

import Link from 'next/link';

import { Check, Zap } from '@/components/icons';
import type { ResumeSummaryResponse } from '@/lib/contracts';
import { plural, relativeTime, resumeLabel } from '@/lib/format';

import styles from './analysis.module.css';
import { Notice } from './Notice';

/**
 * Below this, `POST /v1/job-offers/extract` has too little text to propose anything useful. It is a
 * hint in the UI only — the server decides what it can extract, and an empty proposal is a valid
 * answer this screen handles rather than prevents.
 */
const USEFUL_JD_LENGTH = 80;

interface InputsStepProps {
  resumes: ResumeSummaryResponse[] | null;
  resumesError: string | null;
  selectedResumeId: string | null;
  onSelectResume: (id: string) => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  busy: boolean;
  onExtract: () => void;
}

export function InputsStep({
  resumes,
  resumesError,
  selectedResumeId,
  onSelectResume,
  jobDescription,
  onJobDescriptionChange,
  busy,
  onExtract,
}: InputsStepProps) {
  const enoughText = jobDescription.trim().length > USEFUL_JD_LENGTH;
  const canContinue = enoughText && selectedResumeId !== null && !busy;

  /**
   * Arrow keys move within the group, and MOVING SELECTS — which is the radiogroup pattern rather
   * than a shortcut. A radio that focus merely passed over would leave the group with a focused
   * option and a different one checked, and no way for a screen reader user to tell which the button
   * below will act on.
   *
   * Wrapping at both ends, and Home/End, are part of the same pattern. Only these keys are consumed;
   * Tab still leaves the group, which is the point of the roving tabindex above.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!resumes || resumes.length === 0) return;

    const last = resumes.length - 1;
    const target =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? (index === 0 ? last : index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;

    const moveTo = target === null ? undefined : resumes[target];
    if (target === null || moveTo === undefined) return;

    event.preventDefault();
    onSelectResume(moveTo.id);

    const group = event.currentTarget.parentElement;
    const option = group?.children[target];
    if (option instanceof HTMLElement) option.focus();
  }

  return (
    <div className={styles.screen}>
      <div style={{ marginBottom: 28 }}>
        <h1 className={styles.pageTitle}>Run an ATS analysis</h1>
        <p className={styles.pageLead}>
          Pick a CV, paste the job description, and get a deterministic match score.
        </p>
      </div>

      <div className={styles.inputsGrid}>
        <div>
          <div className={styles.sectionLabel} id="resume-label">
            1. Choose a CV
          </div>

          {resumesError && <Notice variant="error">{resumesError}</Notice>}

          {resumes === null && !resumesError && (
            <p className={styles.pageLead}>Loading your CVs…</p>
          )}

          {resumes?.length === 0 && (
            <div className={`card ${styles.empty}`}>
              You have no CVs yet. <Link href="/resumes">Create one</Link> or{' '}
              <Link href="/resumes/import">import a document</Link>, and it will appear here.
            </div>
          )}

          {resumes && resumes.length > 0 && (
            <div className={styles.resumeList} role="radiogroup" aria-labelledby="resume-label">
              {resumes.map((resume, index) => {
                const selected = resume.id === selectedResumeId;

                return (
                  <button
                    key={resume.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    // ROVING TABINDEX, which is what the radiogroup role promises a keyboard user: one
                    // stop for the whole group, arrows to move within it. Without it every CV is its
                    // own tab stop, so reaching the job-description field below meant tabbing past all
                    // of them — and the list is fetched with limit=100.
                    tabIndex={selected || (selectedResumeId === null && index === 0) ? 0 : -1}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    onClick={() => onSelectResume(resume.id)}
                    className={`${styles.resumeOption} ${selected ? styles.resumeOptionSelected : ''}`}
                  >
                    <span
                      className={`${styles.radio} ${selected ? styles.radioSelected : ''}`}
                      aria-hidden="true"
                    >
                      {selected && <span className={styles.radioDot} />}
                    </span>
                    <span className={styles.resumeBody}>
                      <span className={styles.resumeName}>{resumeLabel(resume)}</span>
                      {/*
                        No score badge. The source design showed one per CV, and there is nothing on
                        the wire to fill it: a match score needs a job posting, and the readability
                        score comes from a POST that creates a report — not a field on a list row.
                      */}
                      {/* Counts, not lengths: a list row carries the SIZE of each section and never
                          the entries, so there is nothing here to take a length of. */}
                      <span className={styles.resumeMeta}>
                        Edited {relativeTime(resume.updatedAt)} ·{' '}
                        {plural(resume.counts.skills, 'skill')} ·{' '}
                        {plural(resume.counts.experiences, 'role')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className={styles.sectionLabel}>
            <label htmlFor="job-description">2. Paste the job description</label>
          </div>

          {/*
            One input, no tab strip. The source design offered "Paste text" beside "Upload file";
            there is no endpoint that accepts a job posting as a file, so the second tab would have
            been a control that cannot do anything.
          */}
          <div className={styles.jdBox}>
            <textarea
              id="job-description"
              rows={12}
              className={styles.jdTextarea}
              placeholder="Paste the full job description here — title, responsibilities, requirements…"
              value={jobDescription}
              onChange={(e) => onJobDescriptionChange(e.target.value)}
            />
            <div className={styles.jdFooter}>
              <span>{jobDescription.length} characters</span>
              {enoughText && (
                <span className={styles.jdReady}>
                  <Check size={12} /> Long enough to extract from
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btnPrimary btnLarge"
            style={{ marginTop: 16 }}
            disabled={!canContinue}
            onClick={onExtract}
          >
            <Zap size={15} />
            {busy ? 'Reading the posting…' : 'Extract requirements'}
          </button>

          <p className={styles.footnote}>
            Scoring is deterministic — the same CV against the same posting always produces the same
            score.
          </p>
        </div>
      </div>
    </div>
  );
}
