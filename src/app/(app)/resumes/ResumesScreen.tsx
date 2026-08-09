'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { FileText, Plus, Trash, Upload, Zap } from '@/components/icons';
import type { PagedResponse, ResumeSummaryResponse } from '@/lib/contracts';
import { plural, relativeTime, resumeLabel } from '@/lib/format';
import { failureOf, messageOf, readJson, SessionExpired } from '@/lib/http';

import styles from './resumes.module.css';

/** The sections worth counting on a card. The other five are rarely filled and would be noise. */
const SUMMARISED = [
  ['experiences', 'role'],
  ['skills', 'skill'],
  ['educations', 'degree'],
  ['projects', 'project'],
] as const;


export function ResumesScreen() {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeSummaryResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onExpired = useCallback(() => router.replace('/login'), [router]);

  const load = useCallback(async () => {
    try {
      const page = await readJson<PagedResponse<ResumeSummaryResponse>>(
        await fetch('/api/resumes?limit=100'),
      );
      setResumes(page.items);
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(messageOf(caught, 'Could not load your CVs.'));
    }
  }, [onExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(fullName: string, email: string) {
    setBusy(true);
    setError(null);

    try {
      await readJson<ResumeSummaryResponse>(
        await fetch('/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, phoneNumber: null, location: null, summary: null }),
        }),
      );

      setCreating(false);
      await load();
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(messageOf(caught, 'Could not create the CV.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/resumes/${id}`, { method: 'DELETE' });
      if (response.status === 401) return onExpired();
      // Read the body rather than inventing a sentence: a 429 here has a Retry-After the user can act on.
      if (!response.ok) throw await failureOf(response);

      setConfirmingDelete(null);
      await load();
    } catch (caught) {
      setError(messageOf(caught, 'Could not delete the CV.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Your CVs</h1>
          <p className={styles.lead}>
            {resumes === null
              ? 'Loading…'
              : `${plural(resumes.length, 'CV')} · each one scores separately against a posting`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/resumes/import" className="btn">
            <Upload size={14} />
            Import a CV
          </Link>
          <Link href="/analysis" className="btn btnPrimary">
            <Zap size={14} />
            New analysis
          </Link>
        </div>
      </div>

      {error && (
        <div className="notice noticeError" role="alert">
          {error}
        </div>
      )}

      <div className={styles.grid}>
        {resumes === null &&
          [0, 1, 2].map((key) => <div key={key} className={styles.skeleton} aria-hidden="true" />)}

        {resumes?.map((resume) => (
          <div key={resume.id} className={`card ${styles.card}`}>
            <div className={styles.cardTop}>
              <span className={styles.page} aria-hidden="true">
                <span className={styles.pageLineLead} />
                <span className={styles.pageLine} style={{ width: '90%' }} />
                <span className={styles.pageLine} style={{ width: '80%' }} />
                <span className={styles.pageLine} style={{ width: '85%' }} />
                <span className={styles.pageLine} style={{ width: '60%' }} />
              </span>
            </div>

            {/*
              The name the candidate gave it, falling back to the contact name — which is the same on
              every CV they own, so an unnamed set of CVs is told apart by the counts and the edited
              line below. Renaming lives in the editor: it is an edit to the CV, not a list action.
            */}
            <Link href={`/resumes/${resume.id}`} className={styles.name}>
              {resumeLabel(resume)}
            </Link>
            <div className={styles.meta}>Edited {relativeTime(resume.updatedAt)}</div>

            <div className={styles.counts}>
              {SUMMARISED.map(([section, noun]) => {
                const count = resume.counts[section];
                return (
                  <span
                    key={section}
                    className={`${styles.count} ${count === 0 ? styles.countEmpty : ''}`}
                  >
                    {plural(count, noun)}
                  </span>
                );
              })}
            </div>

            <div className={styles.actions}>
              <Link href={`/resumes/${resume.id}`} className="btn" style={{ flex: 1 }}>
                <FileText size={13} />
                Edit
              </Link>
              <button
                type="button"
                className="btn"
                aria-label={`Delete ${resumeLabel(resume)}`}
                onClick={() => setConfirmingDelete(resume.id)}
              >
                <Trash size={13} />
              </button>
            </div>

            {/*
              Inline rather than a browser confirm(): deleting a CV also takes every score and
              readability report derived from it, and that consequence has to be readable at the moment
              of the decision rather than summarised as "Are you sure?".
            */}
            {confirmingDelete === resume.id && (
              <div className={styles.confirm} role="alertdialog" aria-label="Confirm deletion">
                <p className={styles.confirmText}>
                  Delete this CV? Its score history and readability reports go with it. This cannot be
                  undone.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setConfirmingDelete(null)}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    style={{ background: 'var(--bad)' }}
                    disabled={busy}
                    onClick={() => remove(resume.id)}
                  >
                    {busy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {resumes !== null &&
          (creating ? (
            <NewResumeForm busy={busy} onCancel={() => setCreating(false)} onCreate={create} />
          ) : (
            <button type="button" className={styles.newCard} onClick={() => setCreating(true)}>
              <Plus size={20} />
              New CV
            </button>
          ))}
      </div>

      {resumes?.length === 0 && !creating && (
        <div className={`card ${styles.empty}`} style={{ marginTop: 16 }}>
          No CVs yet. Create one here, or import an existing document from the analysis flow.
        </div>
      )}
    </div>
  );
}

/**
 * Asks for the two fields the API requires and nothing else.
 *
 * `fullName` and `email` are non-optional on `POST /v1/resumes`; everything else on a CV is added in
 * the editor. Asking for more here would be a form that pretends the rest is needed to start.
 */
function NewResumeForm({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (fullName: string, email: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  const ready = fullName.trim() !== '' && email.trim() !== '';

  return (
    <form
      className={`card ${styles.form}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onCreate(fullName.trim(), email.trim());
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="new-full-name">
          Full name
        </label>
        <input
          id="new-full-name"
          className={styles.input}
          value={fullName}
          autoFocus
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="new-email">
          Email
        </label>
        <input
          id="new-email"
          className={styles.input}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btnPrimary" style={{ flex: 1 }} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create CV'}
        </button>
      </div>
    </form>
  );
}
