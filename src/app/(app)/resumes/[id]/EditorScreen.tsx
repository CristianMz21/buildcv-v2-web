'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ArrowLeft, Zap } from '@/components/icons';
import { RESUME_SECTIONS, type ProblemDetails, type ResumeResponse, type ResumeSection } from '@/lib/contracts';
import { relativeTime } from '@/lib/format';

import { ContactPanel } from './ContactPanel';
import { ResumePreview } from './ResumePreview';
import { SECTION_SPECS, entriesOf } from './sectionSpecs';
import { SectionPanel } from './SectionPanel';
import styles from './editor.module.css';

type Pane = 'contact' | ResumeSection;

class SessionExpired extends Error {}

interface Failure extends Error {
  fieldErrors: Record<string, string[]>;
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new SessionExpired();

  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as ProblemDetails;
    const failure = new Error(
      problem.detail ?? problem.title ?? `Request failed (${response.status}).`,
    ) as Failure;
    // Carried rather than flattened into the message: the form needs the path to mark the right input.
    failure.fieldErrors = problem.errors ?? {};
    throw failure;
  }

  return (await response.json()) as T;
}

/**
 * The CV editor.
 *
 * EVERY WRITE IS FOLLOWED BY A RE-READ of `GET /api/resumes/{id}`, and that is not laziness. The write
 * routes answer with the CV's SUMMARY — no entries, and therefore no entry ids — so the id of the
 * thing just added only exists after reading the CV back. Optimistically appending would leave a row
 * on screen that cannot be deleted.
 */
export function EditorScreen({ resumeId }: { resumeId: string }) {
  const router = useRouter();
  const [resume, setResume] = useState<ResumeResponse | null>(null);
  const [pane, setPane] = useState<Pane>('contact');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const onExpired = useCallback(() => router.replace('/login'), [router]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/resumes/${resumeId}`);
      if (response.status === 404) return setNotFound(true);
      setResume(await readJson<ResumeResponse>(response));
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(caught instanceof Error ? caught.message : 'Could not load this CV.');
    }
  }, [resumeId, onExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Returns whether the write succeeded, so a form knows whether to clear itself. */
  async function write(path: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch(path, init);
      if (response.status === 401) {
        onExpired();
        return false;
      }
      if (!response.ok) await readJson(response);

      await load();
      return true;
    } catch (caught) {
      if (caught instanceof SessionExpired) {
        onExpired();
        return false;
      }
      setFieldErrors((caught as Failure).fieldErrors ?? {});
      setError(caught instanceof Error ? caught.message : 'The change could not be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (notFound) {
    return (
      <div className={`card ${styles.panel}`}>
        <h1 className={styles.panelTitle}>No such CV</h1>
        <p className={styles.panelHint}>
          It may have been deleted, or it belongs to another account.
        </p>
        <Link href="/resumes" className="btn">
          <ArrowLeft size={13} /> Back to your CVs
        </Link>
      </div>
    );
  }

  if (!resume) {
    return <p className={styles.subtitle}>{error ?? 'Loading…'}</p>;
  }

  return (
    <div>
      <div className={styles.head}>
        <Link href="/resumes" className="btn btnGhost" style={{ padding: 0, marginBottom: 8 }}>
          <ArrowLeft size={13} /> Your CVs
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            {/* The contact name, because a Resume has no name of its own to rename. */}
            <h1 className={styles.title}>{resume.contactInformation.fullName}</h1>
            <p className={styles.subtitle}>Edited {relativeTime(resume.updatedAt)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Readability first in reading order but secondary in weight: it needs no posting, so it
                is the answer available right now, while an analysis needs a job to score against. */}
            <Link href={`/resumes/${resumeId}/readability`} className="btn">
              How it reads
            </Link>
            <Link href="/analysis" className="btn btnPrimary">
              <Zap size={14} />
              Analyze against a job
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice noticeError" role="alert">
          {error}
        </div>
      )}

      <div className={styles.layout}>
        <nav className={styles.rail} aria-label="CV sections">
          <button
            type="button"
            className={`${styles.railItem} ${pane === 'contact' ? styles.railItemActive : ''}`}
            aria-current={pane === 'contact' ? 'true' : undefined}
            onClick={() => setPane('contact')}
          >
            Contact
          </button>

          {RESUME_SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              className={`${styles.railItem} ${pane === section ? styles.railItemActive : ''}`}
              aria-current={pane === section ? 'true' : undefined}
              onClick={() => setPane(section)}
            >
              {SECTION_SPECS[section].label}
              <span className={styles.railCount}>{entriesOf(resume, section).length}</span>
            </button>
          ))}
        </nav>

        <div>
          {pane === 'contact' ? (
            <ContactPanel
              // Remounts when the CV reloads, so the form shows what was saved rather than what was
              // typed — the two differ whenever the API normalized a value.
              key={resume.updatedAt}
              contact={resume.contactInformation}
              fieldErrors={fieldErrors}
              busy={busy}
              onSave={(body) =>
                void write(`/api/resumes/${resumeId}/contact`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })
              }
            />
          ) : (
            <SectionPanel
              section={pane}
              spec={SECTION_SPECS[pane]}
              entries={entriesOf(resume, pane)}
              fieldErrors={fieldErrors}
              busy={busy}
              onAdd={(body) => write(`/api/resumes/${resumeId}/${pane}`, json(body))}
              onRemove={(itemId) =>
                void write(`/api/resumes/${resumeId}/${pane}/${itemId}`, { method: 'DELETE' })
              }
            />
          )}
        </div>

        <ResumePreview resume={resume} />
      </div>
    </div>
  );
}
