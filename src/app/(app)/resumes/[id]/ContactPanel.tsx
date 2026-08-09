'use client';

import { useState } from 'react';

import type { ContactInformationResponse } from '@/lib/contracts';

import styles from './editor.module.css';

interface ContactPanelProps {
  contact: ContactInformationResponse;
  fieldErrors: Record<string, string[]>;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}

/**
 * The one part of a CV that is updated in place.
 *
 * Everything else is a collection you append to and remove from; contact is a single owned value with
 * a PUT, so this is a form with a Save rather than an add-and-delete list. `fullName` and `email` are
 * required server-side — a CV with nobody on it is not a CV.
 */
export function ContactPanel({ contact, fieldErrors, busy, onSave }: ContactPanelProps) {
  const [draft, setDraft] = useState({
    fullName: contact.fullName,
    email: contact.email,
    phoneNumber: contact.phoneNumber ?? '',
    location: contact.location ?? '',
    summary: contact.summary ?? '',
  });

  const ready = draft.fullName.trim() !== '' && draft.email.trim() !== '';

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;

    onSave({
      fullName: draft.fullName.trim(),
      email: draft.email.trim(),
      // Blank means absent. Sending "" would store an empty phone number rather than none.
      phoneNumber: draft.phoneNumber.trim() || null,
      location: draft.location.trim() || null,
      summary: draft.summary.trim() || null,
    });
  }

  const set = (key: keyof typeof draft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form className={`card ${styles.panel}`} onSubmit={submit}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Contact</h2>
      </div>
      <p className={styles.panelHint}>
        Name, email and a summary. This is the block a parser reads first.
      </p>

      <div className={styles.formGrid}>
        <Text
          name="fullName"
          label="Full name"
          value={draft.fullName}
          error={fieldErrors.fullName?.[0]}
          onChange={set('fullName')}
        />
        <Text
          name="email"
          label="Email"
          value={draft.email}
          error={fieldErrors.email?.[0]}
          onChange={set('email')}
        />
        <Text
          name="phoneNumber"
          label="Phone"
          value={draft.phoneNumber}
          error={fieldErrors.phoneNumber?.[0]}
          onChange={set('phoneNumber')}
        />
        <Text
          name="location"
          label="Location"
          value={draft.location}
          error={fieldErrors.location?.[0]}
          onChange={set('location')}
        />

        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label className={styles.label} htmlFor="contact-summary">
            Summary
          </label>
          <textarea
            id="contact-summary"
            className={styles.textarea}
            rows={4}
            value={draft.summary}
            onChange={(event) => set('summary')(event.target.value)}
          />
          {fieldErrors.summary?.[0] && (
            <span className={styles.fieldError}>{fieldErrors.summary[0]}</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="submit" className="btn btnPrimary" disabled={!ready || busy}>
          {busy ? 'Saving…' : 'Save contact'}
        </button>
      </div>
    </form>
  );
}

function Text({
  name,
  label,
  value,
  error,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`contact-${name}`}>
        {label}
      </label>
      <input
        id={`contact-${name}`}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  );
}
