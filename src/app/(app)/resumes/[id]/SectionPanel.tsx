'use client';

import { useState } from 'react';

import { FileText, Plus, Trash } from '@/components/icons';
import type { ResumeSection } from '@/lib/contracts';

import styles from './editor.module.css';
import { formFrom, losses, type FieldSpec, type SectionSpec } from './sectionSpecs';

interface SectionPanelProps {
  section: ResumeSection;
  spec: SectionSpec;
  entries: Record<string, unknown>[];
  fieldErrors: Record<string, string[]>;
  busy: boolean;
  onAdd: (body: Record<string, unknown>) => Promise<boolean>;
  onReplace: (itemId: number, body: Record<string, unknown>) => Promise<boolean>;
  onRemove: (itemId: number) => void;
}

/** Which form is open: none, the one that appends, or the one editing a given entry. */
type Editing = { kind: 'closed' } | { kind: 'adding' } | { kind: 'editing'; itemId: number };

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
 * One section: what is in it, the form that adds to it, and the form that corrects an entry.
 *
 * EDITING IS ONE REQUEST, not a delete followed by an add. `PUT .../{section}/{itemId}` replaces the
 * entry inside one transaction, which is what makes a rejected correction leave the original alone —
 * and what makes correcting a skill possible at all, since skills refuse a duplicate name and the old
 * entry would refuse its own replacement.
 *
 * The form REPLACES rather than patches, matching the route. That is why `formFrom` seeds it from the
 * entry: a field left blank is a field cleared, so the form must start out saying what is there now.
 */
export function SectionPanel({
  section,
  spec,
  entries,
  fieldErrors,
  busy,
  onAdd,
  onReplace,
  onRemove,
}: SectionPanelProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() => blankForm(spec.fields));
  const [editing, setEditing] = useState<Editing>({ kind: 'closed' });

  const missing = spec.fields.filter(
    (field) => 'required' in field && field.required && draft[field.name]?.trim() === '',
  );

  function open(target: Editing, entry?: Record<string, unknown>) {
    setDraft(entry ? formFrom(entry, spec) : blankForm(spec.fields));
    setEditing(target);
  }

  function close() {
    setDraft(blankForm(spec.fields));
    setEditing({ kind: 'closed' });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || missing.length > 0 || editing.kind === 'closed') return;

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

    const saved =
      editing.kind === 'adding' ? await onAdd(body) : await onReplace(editing.itemId, body);

    if (saved) close();
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
            const willLose = losses(entry, spec);

            if (editing.kind === 'editing' && editing.itemId === id) {
              return (
                <EntryForm
                  key={id}
                  spec={spec}
                  draft={draft}
                  fieldErrors={fieldErrors}
                  busy={busy}
                  missing={missing}
                  submitLabel="Save changes"
                  warnings={willLose}
                  onChange={(name, value) => setDraft((current) => ({ ...current, [name]: value }))}
                  onCancel={close}
                  onSubmit={submit}
                />
              );
            }

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
                  aria-label={`Edit ${title || 'this entry'}`}
                  onClick={() => open({ kind: 'editing', itemId: id }, entry)}
                >
                  <FileText size={13} />
                </button>
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

      {editing.kind === 'adding' ? (
        <EntryForm
          spec={spec}
          draft={draft}
          fieldErrors={fieldErrors}
          busy={busy}
          missing={missing}
          submitLabel={`Add to ${spec.label.toLowerCase()}`}
          warnings={[]}
          onChange={(name, value) => setDraft((current) => ({ ...current, [name]: value }))}
          onCancel={close}
          onSubmit={submit}
        />
      ) : (
        editing.kind === 'closed' && (
          <button type="button" className="btn" onClick={() => open({ kind: 'adding' })}>
            <Plus size={13} />
            Add {spec.label.toLowerCase().replace(/s$/, '')}
          </button>
        )
      )}

      {/* A field error the form has no input for would otherwise vanish; `section` catches the ones
          the API keys to the collection rather than to one of its fields. */}
      {fieldErrors[section]?.[0] && <p className={styles.fieldError}>{fieldErrors[section][0]}</p>}
    </div>
  );
}

/**
 * The one form both modes use.
 *
 * Adding and correcting differ in the button, the warnings and where the values came from — never in
 * how a field is rendered or how a blank is read. Two forms would be two places to fix the day a
 * `lines` field stops round-tripping.
 */
function EntryForm({
  spec,
  draft,
  fieldErrors,
  busy,
  missing,
  submitLabel,
  warnings,
  onChange,
  onCancel,
  onSubmit,
}: {
  spec: SectionSpec;
  draft: Record<string, string>;
  fieldErrors: Record<string, string[]>;
  busy: boolean;
  missing: readonly FieldSpec[];
  submitLabel: string;
  warnings: readonly string[];
  onChange: (name: string, value: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.formGrid}>
        {spec.fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={draft[field.name] ?? ''}
            error={fieldErrors[field.name]?.[0]}
            onChange={(value) => onChange(field.name, value)}
          />
        ))}
      </div>

      {/* Said BEFORE the save, not after: these are values this form cannot carry, so saving is the
          moment they go. Both are read by an engine — bullet points are the whole Achievements score —
          so a candidate who did not mean to lose them would see a score move with no edit explaining
          it. */}
      {warnings.length > 0 && (
        <div className="notice noticeWarn" role="status">
          Saving this entry clears {warnings.join(', and ')}.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btnPrimary"
          style={{ flex: 1 }}
          disabled={busy || missing.length > 0}
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>

      {missing.length > 0 && (
        <p className={styles.fieldError}>
          {missing.map((field) => field.label).join(', ')} required.
        </p>
      )}
    </form>
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
