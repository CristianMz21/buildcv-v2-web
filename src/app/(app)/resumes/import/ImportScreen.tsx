'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Check, Upload, Warning } from '@/components/icons';
import type { ResumeSummaryResponse } from '@/lib/contracts';
import { fieldErrorsOf, messageOf, readJson, SessionExpired } from '@/lib/http';

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

const ACCEPTED = '.pdf,.docx,.txt';
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

/**
 * Refused HERE rather than by the API, because `accept` refuses nothing.
 *
 * It is a hint to the file picker: it does not apply to a drop, and it does not apply to a `.doc`
 * renamed to `.pdf`. The API's ceiling for this endpoint is 5 MiB, so without this a candidate on a
 * slow connection uploads a 40 MB scan in full, waits for it, and is then told no.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** Where a corrected draft survives a reload. Session-scoped on purpose — see `remember`. */
const DRAFT_KEY = 'buildcv.import.draft';

/**
 * What a confidence value asks of the candidate — and it is not the same question in every case.
 *
 * One badge for everything the extractor did not call `High` conflated two opposite things. The
 * API's own enum says so: `NotExtracted` is "the honest empty… the review screen should show it as
 * 'please fill in' — NOT as a failure", while `Low` is a positional guess that is "wrong more often
 * than right on the hard 35%". Telling a candidate to double-check a field the parser deliberately
 * declined to invent teaches them to distrust the marks, and then they stop reading the ones that
 * matter.
 */
type Asks = 'add' | 'check' | null;

const asksFor = (confidence: string): Asks =>
  confidence === 'High' ? null : confidence === 'NotExtracted' ? 'add' : 'check';

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

  const forget = useCallback(() => sessionStorage.removeItem(DRAFT_KEY), []);

  /**
   * A CORRECTED DRAFT SURVIVES A RELOAD, and only a reload.
   *
   * Correcting what the extractor missed is twenty minutes of work, and all of it lived in React
   * state: one stray refresh, one back button, one restored tab, and the candidate re-uploads and
   * starts the whole review again. The document itself is still never stored — that promise is about
   * the file and it holds — but this is a person's CV, so it goes in `sessionStorage` rather than
   * `localStorage`: it dies with the tab, and it is cleared the moment the CV exists.
   */
  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (!saved) return;

    try {
      const kept = JSON.parse(saved) as { proposal: Proposal; draft: Draft };
      setProposal(kept.proposal);
      setDraft(kept.draft);
    } catch {
      // A shape this build cannot read is not worth a message. The upload screen IS the recovery.
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (proposal && draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ proposal, draft }));
  }, [proposal, draft]);

  async function propose(file: File) {
    const dot = file.name.lastIndexOf('.');
    const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase();

    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      return setError(
        extension
          ? `${extension} is not a format this reads. Upload a PDF, a DOCX or a TXT.`
          : 'That file has no extension. Upload a PDF, a DOCX or a TXT.',
      );
    }

    if (file.size > MAX_BYTES) {
      // Named in the units the file manager shows, and with the reason a CV is usually over it: a
      // scan. Which is also the case the parser cannot read at all, since there is no OCR.
      return setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB and the limit is 5 MB. A scanned CV ` +
          'is both too large and unreadable to a parser — export it from your editor as PDF instead.',
      );
    }

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const body = new FormData();
      body.append('file', file);

      const value = await readJson<Proposal>(
        await fetch('/api/resumes/import/propose', { method: 'POST', body }),
      );

      setProposal(value);
      // A copy the candidate edits. The proposal itself is kept untouched so the confidence marks
      // still describe what the extractor said rather than what has since been corrected.
      setDraft(structuredClone(value.draft));
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(messageOf(caught, 'That document could not be read.'));
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
      const summary = await readJson<ResumeSummaryResponse>(
        await fetch('/api/resumes/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        }),
      );

      setCreated(summary);
      // The CV exists now, so the draft has nothing left to protect.
      forget();
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();

      // Keyed by path, which is the whole reason this endpoint answers with a validation problem:
      // forty fields fail together and each one marks its own input.
      const fields = fieldErrorsOf(caught);
      setFieldErrors(fields);
      setError(
        Object.keys(fields).length > 0
          ? 'Some fields could not be accepted. They are marked below.'
          : messageOf(caught, 'The CV could not be created.'),
      );
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

  /**
   * What the panel above already claims is required, actually enforced.
   *
   * It said "Name and email are required to create the CV" and then let the button submit anyway:
   * the API answered 400, and the candidate learned the rule from a red banner after a round trip.
   * The extractor leaves `fullName` blank often enough that this is the ordinary path, not the edge.
   */
  const filled = (key: string): boolean => {
    const value = contact[key];
    return typeof value === 'string' && value.trim() !== '';
  };

  const missing = [
    filled('fullName') ? null : 'a full name',
    filled('email') ? null : 'an email',
  ].filter((item): item is string => item !== null);

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
    const asks = invalid || !mark ? null : asksFor(mark.confidence);
    // Only a guess gets the amber input. An empty field the parser never claimed to fill is not a
    // problem with the field, and colouring it as one makes the form read as forty mistakes.
    const unsure = asks === 'check';
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
          {asks === 'check' && <span className={styles.flag}>CHECK</span>}
          {asks === 'add' && <span className={styles.flagAdd}>ADD</span>}
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
          Nothing has been created yet. Extraction is best-effort:{' '}
          <span className={styles.flag}>CHECK</span> is a value it guessed and you should read,{' '}
          <span className={styles.flagAdd}>ADD</span> is one it found nothing for and left to you.
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

      {/* Says which field, not "fill in the required fields" — the form is forty inputs long and the
          two that matter are at the very top, already scrolled past. */}
      {missing.length > 0 && (
        <p className={styles.lead} style={{ marginTop: 12, fontSize: 12.5 }}>
          The CV needs {missing.join(' and ')} before it can be created. Both are in Contact, at the
          top.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setProposal(null);
            setDraft(null);
            forget();
          }}
        >
          Start over
        </button>
        <button
          type="button"
          className="btn btnPrimary"
          style={{ flex: 1 }}
          disabled={busy || missing.length > 0}
          onClick={importDraft}
        >
          {busy ? 'Creating…' : 'Create this CV'}
        </button>
      </div>
    </div>
  );
}
