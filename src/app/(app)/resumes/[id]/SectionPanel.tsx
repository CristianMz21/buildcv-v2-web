'use client';

import { useState } from 'react';

import { Plus, Trash } from '@/components/icons';
import type { ResumeSection } from '@/lib/contracts';

import styles from './editor.module.css';
import type { FieldSpec, SectionSpec } from './sectionSpecs';

interface SectionPanelProps {
  section: ResumeSection;
  spec: SectionSpec;
  entries: Record<string, unknown>[];
  fieldErrors: Record<string, string[]>;
  busy: boolean;
  onAdd: (body: Record<string, unknown>) => Promise<boolean>;
  onRemove: (itemId: number) => void;
}

/** A textarea's lines, blanks dropped. */
const toLines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function blankForm(fields: readonly FieldSpec[]): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of fields) draft[field.name] = '';
  return draft;
}

/**
 * One section: what is in it, and the form that adds to it.
 *
 * There is no edit-in-place, and that is the API rather than a shortcut: a CV collection is
 * append-and-remove. Correcting an entry is deleting it and adding it back, which the buttons say
 * plainly instead of offering a pencil that would do the same thing while implying it were atomic.
 */
export function SectionPanel({
  section,
  spec,
  entries,
  fieldErrors,
  busy,
  onAdd,
  onRemove,
}: SectionPanelProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() => blankForm(spec.fields));
  const [open, setOpen] = useState(false);

  const missing = spec.fields.filter(
    (field) => 'required' in field && field.required && draft[field.name]?.trim() === '',
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || missing.length > 0) return;

    const body: Record<string, unknown> = {};

    for (const field of spec.fields) {
      const raw = draft[field.name] ?? '';

      // Blank means ABSENT, not empty. Every optional field on these requests is nullable, and the
      // API tells apart "no grade" from "a grade of empty string" — sending "" would store the second.
      if (field.kind === 'lines') body[field.name] = toLines(raw);
      else if (raw.trim() === '') body[field.name] = null;
      else if (field.kind === 'number') body[field.name] = Number(raw);
      else body[field.name] = raw.trim();
    }

    if (await onAdd(body)) {
      setDraft(blankForm(spec.fields));
      setOpen(false);
    }
  }

  return (
    <div className={`card ${styles.panel}`}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{spec.label}</h2>
      </div>
      <p className={styles.panelHint}>{spec.hint}</p>

      {entries.length === 0 ? (
        <div className={styles.entryEmpty}>Nothing here yet.</div>
      ) : (
        <div className={styles.entries}>
          {entries.map((entry) => {
            const id = entry.id as number;
            const title = spec.describe(entry);
            const detail = spec.detail?.(entry) ?? null;

            return (
              <div key={id} className={styles.entry}>
                <div className={styles.entryBody}>
                  <div className={styles.entryTitle}>{title || '—'}</div>
                  {detail && <div className={styles.entryDetail}>{detail}</div>}
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  aria-label={`Remove ${title || 'this entry'}`}
                  onClick={() => onRemove(id)}
                >
                  <Trash size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {open ? (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formGrid}>
            {spec.fields.map((field) => (
              <Field
                key={field.name}
                field={field}
                value={draft[field.name] ?? ''}
                error={fieldErrors[field.name]?.[0]}
                onChange={(value) => setDraft((current) => ({ ...current, [field.name]: value }))}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btnPrimary"
              style={{ flex: 1 }}
              disabled={busy || missing.length > 0}
            >
              {busy ? 'Saving…' : `Add to ${spec.label.toLowerCase()}`}
            </button>
          </div>

          {missing.length > 0 && (
            <p className={styles.fieldError}>
              {missing.map((field) => field.label).join(', ')} required.
            </p>
          )}
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          <Plus size={13} />
          Add {spec.label.toLowerCase().replace(/s$/, '')}
        </button>
      )}

      {/* A field error the form has no input for would otherwise vanish; `section` catches the ones
          the API keys to the collection rather than to one of its fields. */}
      {fieldErrors[section]?.[0] && <p className={styles.fieldError}>{fieldErrors[section][0]}</p>}
    </div>
  );
}

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.name}`;
  const wide = field.kind === 'textarea' || field.kind === 'lines';

  return (
    <div className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <label className={styles.label} htmlFor={id}>
        {field.label}
      </label>

      {field.kind === 'select' ? (
        <select
          id={id}
          className={styles.select}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {/* Blank first: these are nullable, and defaulting to the first member would state a level
              the candidate never chose. */}
          <option value="">Not stated</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.kind === 'textarea' || field.kind === 'lines' ? (
        <textarea
          id={id}
          className={styles.textarea}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className={styles.input}
          // A date input, because these fields take yyyy-MM-dd. The API accepts less precision than
          // that — "2015-06" and "2015" are valid — but a picker cannot express a month without a day,
          // so what it produces is always the full form. Typing a partial date is a gap, not a bug.
          type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
          placeholder={'placeholder' in field ? field.placeholder : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  );
}
