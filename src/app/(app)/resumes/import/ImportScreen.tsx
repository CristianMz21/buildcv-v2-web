'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { Check, Upload, Warning } from '@/components/icons';
import type { ProblemDetails, ResumeSummaryResponse } from '@/lib/contracts';

import { CONTACT_FIELDS, DRAFT_SECTIONS, fieldPath, type DraftField } from './draftShape';
import styles from './import.module.css';

type Draft = Record<string, unknown>;

interface Proposal {
  draft: Draft;
  confidence: {
    overall: string;
    fields: { path: string; confidence: string; sourceText: string | null }[];
    warnings: string[];
  };
}

class SessionExpired extends Error {}

const ACCEPTED = '.pdf,.docx,.txt';

/** Anything the extractor did not call High. The mark is a nudge to read, not a claim of wrongness. */
const isUnsure = (confidence: string) => confidence !== 'High';

export function ImportScreen() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [created, setCreated] = useState<ResumeSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onExpired = useCallback(() => router.replace('/login'), [router]);

  async function propose(file: File) {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/resumes/import/propose', { method: 'POST', body });
      if (response.status === 401) throw new SessionExpired();

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;
        throw new Error(problem.detail ?? `That document could not be read (${response.status}).`);
      }

      const value = (await response.json()) as Proposal;
      setProposal(value);
      // A copy the candidate edits. The proposal itself is kept untouched so the confidence marks
      // still describe what the extractor said rather than what has since been corrected.
      setDraft(structuredClone(value.draft));
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(caught instanceof Error ? caught.message : 'That document could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function importDraft() {
    if (!draft) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch('/api/resumes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (response.status === 401) throw new SessionExpired();

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as ProblemDetails;
        // Keyed by path, which is the whole reason this endpoint answers with a validation problem:
        // forty fields fail together and each one marks its own input.
        setFieldErrors(problem.errors ?? {});
        throw new Error(
          problem.errors
            ? 'Some fields could not be accepted. They are marked below.'
            : (problem.detail ?? 'The CV could not be created.'),
        );
      }

      setCreated((await response.json()) as ResumeSummaryResponse);
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(caught instanceof Error ? caught.message : 'The CV could not be created.');
    } finally {
      setBusy(false);
    }
  }

  function setField(path: string[], value: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      let cursor = next as Record<string, unknown>;

      for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
      // Blank means absent: these are all nullable, and "" is a value the API would store.
      cursor[path[path.length - 1]!] = value === '' ? null : value;
      return next;
    });
  }

  function setLines(path: string[], value: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      let cursor = next as Record<string, unknown>;

      for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
      cursor[path[path.length - 1]!] = value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return next;
    });
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  if (created) {
    return (
      <div className={`card ${styles.done} ${styles.narrow}`}>
        <div className={styles.doneIcon} aria-hidden="true">
          <Check size={22} />
        </div>
        <h1 className={styles.title}>Imported</h1>
        <p className={styles.lead} style={{ marginBottom: 20 }}>
          {created.fullName}&rsquo;s CV was created from your document.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={`/resumes/${created.id}`} className="btn btnPrimary">
            Open the CV
          </Link>
          {/* The reason to go here first: this CV carries document signals, so the parseability
              section applies to it — the one thing a typed CV can never be scored on. */}
          <Link href={`/resumes/${created.id}/readability`} className="btn">
            See how it reads
          </Link>
        </div>
      </div>
    );
  }

  // ── Upload ───────────────────────────────────────────────────────────────────

  if (!proposal || !draft) {
    return (
      <div className={styles.narrow}>
        <div className={styles.head}>
          <h1 className={styles.title}>Import a CV</h1>
          <p className={styles.lead}>
            Upload a document and correct what the parser got wrong before anything is created.
          </p>
        </div>

        {error && (
          <div className="notice noticeError" role="alert">
            {error}
          </div>
        )}

        <div
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void propose(file);
          }}
        >
          <span className={styles.dropIcon} aria-hidden="true">
            <Upload size={18} />
          </span>
          <span className={styles.dropTitle}>
            {busy ? 'Reading your document…' : 'Drop your CV here'}
          </span>
          <span className={styles.dropHint}>PDF, DOCX or TXT</span>

          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED}
            className="srOnly"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void propose(file);
            }}
          />
          <button
            type="button"
            className="btn"
            style={{ marginTop: 4 }}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Choose a file
          </button>
        </div>

        {/*
          Said before the upload, not after. The document is never stored, which is a privacy property
          worth stating where a candidate is deciding whether to hand one over.
        */}
        <p className={styles.lead} style={{ marginTop: 16, fontSize: 12.5 }}>
          The file is read once and never kept. What survives is the CV you confirm, plus a note of
          what the document looked like to a parser.
        </p>
      </div>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────────

  const marks = new Map(proposal.confidence.fields.map((field) => [field.path, field]));
  const contact = (draft.contact ?? {}) as Record<string, unknown>;

  const renderField = (
    field: DraftField,
    path: string[],
    pathKey: string,
    value: unknown,
  ) => {
    const mark = marks.get(pathKey);
    const errors = fieldErrors[pathKey];
    const text =
      field.kind === 'lines'
        ? Array.isArray(value)
          ? (value as string[]).join('\n')
          : ''
        : typeof value === 'string'
          ? value
          : value == null
            ? ''
            : String(value);

    const invalid = Boolean(errors?.length);
    const unsure = !invalid && mark && isUnsure(mark.confidence);
    const className = `${field.kind === 'text' || !field.kind ? styles.input : styles.textarea} ${
      invalid ? styles.inputInvalid : unsure ? styles.inputUnsure : ''
    }`;

    return (
      <div
        key={pathKey}
        className={`${styles.field} ${field.kind === 'long' || field.kind === 'lines' ? styles.fieldWide : ''}`}
      >
        <label className={styles.label} htmlFor={pathKey}>
          {field.label}
          {unsure && <span className={styles.flag}>CHECK</span>}
        </label>

        {field.kind === 'long' || field.kind === 'lines' ? (
          <textarea
            id={pathKey}
            className={className}
            rows={field.kind === 'lines' ? 4 : 3}
            value={text}
            onChange={(event) =>
              field.kind === 'lines'
                ? setLines(path, event.target.value)
                : setField(path, event.target.value)
            }
          />
        ) : (
          <input
            id={pathKey}
            className={className}
            value={text}
            onChange={(event) => setField(path, event.target.value)}
          />
        )}

        {errors?.[0] && <span className={styles.fieldError}>{errors[0]}</span>}
        {/* What the parser read this field out of, so a wrong value can be traced rather than guessed
            at. Only shown when it disagrees with the value now in the box. */}
        {mark?.sourceText && mark.sourceText !== text && (
          <span className={styles.source}>read from: {mark.sourceText}</span>
        )}
      </div>
    );
  };

  return (
    <div className={styles.narrow}>
      <div className={styles.head}>
        <h1 className={styles.title}>Check what was read</h1>
        <p className={styles.lead}>
          Nothing has been created yet. Extraction is best-effort — the fields marked{' '}
          <span className={styles.flag}>CHECK</span> are the ones it was least sure of.
        </p>
      </div>

      {error && (
        <div className="notice noticeError" role="alert">
          {error}
        </div>
      )}

      {proposal.confidence.warnings.map((warning) => (
        <div key={warning} className="notice noticeWarn">
          <Warning size={15} />
          <div>{warning}</div>
        </div>
      ))}

      <div className={`card ${styles.panel}`}>
        <h2 className={styles.panelTitle}>Contact</h2>
        <p className={styles.panelLead}>Name and email are required to create the CV.</p>
        <div className={styles.grid}>
          {CONTACT_FIELDS.map((field) =>
            renderField(field, ['contact', field.name], `contact.${field.name}`, contact[field.name]),
          )}
        </div>
      </div>

      {DRAFT_SECTIONS.map((section) => {
        const entries = (draft[section.key] ?? []) as Record<string, unknown>[];
        if (entries.length === 0) return null;

        return (
          <div key={section.key} className={`card ${styles.panel}`}>
            <h2 className={styles.panelTitle}>{section.label}</h2>
            <p className={styles.panelLead}>
              {entries.length} found. Remove anything the parser invented.
            </p>

            {entries.map((entry, index) => (
              <div key={index} className={styles.entry}>
                <div className={styles.entryHead}>
                  <span className={styles.entryLabel}>
                    {section.identify(entry) || `Entry ${index + 1}`}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setDraft((current) => {
                        if (!current) return current;
                        const next = structuredClone(current);
                        (next[section.key] as unknown[]).splice(index, 1);
                        return next;
                      })
                    }
                  >
                    Remove
                  </button>
                </div>

                <div className={styles.grid}>
                  {section.fields.map((field) =>
                    renderField(
                      field,
                      [section.key, String(index), field.name],
                      fieldPath(section.key, index, field.name),
                      entry[field.name],
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className={styles.actions}>
        <button type="button" className="btn" disabled={busy} onClick={() => setProposal(null)}>
          Start over
        </button>
        <button
          type="button"
          className="btn btnPrimary"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={importDraft}
        >
          {busy ? 'Creating…' : 'Create this CV'}
        </button>
      </div>
    </div>
  );
}
