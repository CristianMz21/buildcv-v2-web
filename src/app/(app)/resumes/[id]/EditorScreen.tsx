'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ArrowLeft, Zap } from '@/components/icons';
import { RESUME_SECTIONS, type ResumeResponse, type ResumeSection } from '@/lib/contracts';
import { relativeTime, resumeLabel } from '@/lib/format';
import { fieldErrorsOf, messageOf, readJson, SessionExpired } from '@/lib/http';

import { ContactPanel } from './ContactPanel';
import { ResumePreview } from './ResumePreview';
import { SECTION_SPECS, entriesOf } from './sectionSpecs';
import { SectionPanel } from './SectionPanel';
import styles from './editor.module.css';

type Pane = 'contact' | ResumeSection;


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
      setError(messageOf(caught, 'Could not load this CV.'));
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
      setFieldErrors(fieldErrorsOf(caught));
      setError(messageOf(caught, 'The change could not be saved.'));
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
            <RenameTitle
              // Remounts on every reload for the same reason ContactPanel does: the field shows what
              // the server stored, which is the trimmed value rather than what was typed.
              key={`${resume.updatedAt}:${resume.name ?? ''}`}
              resume={resume}
              busy={busy}
              onRename={(name) =>
                write(`/api/resumes/${resumeId}/name`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name }),
                })
              }
            />
            <p className={styles.subtitle}>Edited {relativeTime(resume.updatedAt)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Readability first in reading order but secondary in weight: it needs no posting, so it
                is the answer available right now, while an analysis needs a job to score against. */}
            <Link href={`/resumes/${resumeId}/history`} className="btn">
              History
            </Link>
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
              onReplace={(itemId, body) =>
                write(`/api/resumes/${resumeId}/${pane}/${itemId}`, { ...json(body), method: 'PUT' })
              }
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

/**
 * The CV's title, and the one place it can be renamed.
 *
 * The heading shows `resumeLabel`, so an unnamed CV reads as the candidate's own name rather than as a
 * blank or a placeholder — but the INPUT is seeded with `resume.name` alone. Seeding it with the
 * fallback would turn "rename, then think better of it" into a CV named after its owner, which is a
 * different state from unnamed and one they never chose.
 *
 * Clearing the field is therefore a real action, not a mistake to guard against: it posts null, which
 * is how the API says "no name". `NameMaxLength` is not repeated here — the server owns that number and
 * refuses over it with a message this screen already renders.
 */
function RenameTitle({
  resume,
  busy,
  onRename,
}: {
  resume: ResumeResponse;
  busy: boolean;
  onRename: (name: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(resume.name ?? '');

  if (!editing) {
    return (
      <div className={styles.titleRow}>
        <h1 className={styles.title}>
          {resumeLabel({ name: resume.name, fullName: resume.contactInformation.fullName })}
        </h1>
        <button
          type="button"
          className="btn btnGhost"
          style={{ padding: '2px 6px' }}
          onClick={() => setEditing(true)}
        >
          {resume.name ? 'Rename' : 'Name it'}
        </button>
      </div>
    );
  }

  return (
    <form
      className={styles.titleRow}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        // Blank means "clear it", which is exactly what the aggregate does with a blank string. The
        // trim happens server-side too; doing it here only keeps the request honest about intent.
        if (await onRename(draft.trim() === '' ? null : draft.trim())) setEditing(false);
      }}
    >
      <input
        className={styles.titleInput}
        value={draft}
        autoFocus
        aria-label="CV name"
        placeholder="Backend roles"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditing(false);
        }}
      />
      <button type="submit" className="btn btnPrimary" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}
