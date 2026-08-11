'use client';

import { useId, useState } from 'react';

import { MIN_PASSWORD_LENGTH } from '@/lib/contracts';

import styles from './login/login.module.css';

/**
 * A password input that can be read, and — where a password is being chosen — one that says whether
 * it is any good before the form is submitted.
 *
 * THE TOGGLE IS THE ACCESSIBILITY FEATURE, not the decoration. A masked field on a phone keyboard is
 * where sign-in attempts go to die: the person cannot see what autocorrect did, cannot see which
 * character the shift key ate, and the only feedback the product gives them is a failed attempt that
 * spends one of the five per minute the API allows. Being able to look is the fix.
 *
 * The button is a real `<button type="button">` rather than an icon with a click handler, so it is
 * reachable by keyboard and announced. Its label changes with its state — "Show password" and "Hide
 * password" — because an unchanging label on a control that toggles tells a screen reader nothing
 * about what pressing it did.
 *
 * THE STRENGTH METER IS ADVICE, NOT A GATE. The only rule the API enforces is a minimum length, and
 * inventing extra requirements here would mean the form refusing a password the server would happily
 * accept. So it colours and names what you have and never blocks: the bar is a hint, `minLength` is
 * the rule.
 */
interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  /** Shows the strength meter. Only for fields where a password is being CHOSEN. */
  withStrength?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  /** Rendered beside the label — the sign-in screen puts "Forgot password?" here. */
  aside?: React.ReactNode;
  /**
   * Rendered below, and shown ALONGSIDE the meter rather than instead of it. The two say different
   * things and both are needed: the meter describes the password, the hint states the rule the
   * server actually enforces. Showing only the meter is what an earlier version of this screen
   * refused to do, and it was right to — a bar reading "Strong" beside no stated rule invites the
   * reader to treat the bar AS the rule.
   */
  hint?: React.ReactNode;
}

/**
 * Four independent things worth having, counted rather than scored.
 *
 * Deliberately crude. A real strength estimator (zxcvbn and friends) is a dictionary in the bundle,
 * and this is a hint next to a field, not a security control — the server decides what it accepts.
 */
type Score = 0 | 1 | 2 | 3 | 4;

const LABELS = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

function strengthOf(password: string): { score: Score; label: string } {
  if (password.length === 0) return { score: 0, label: '' };

  // CALIBRATED TO THE FLOOR THAT ACTUALLY EXISTS. These thresholds were 8 and 12, written when this
  // app believed the server's minimum was 8. It is 12 — so the first step scored a password the
  // server would refuse outright, and the whole scale was shifted one notch optimistic. Reaching the
  // minimum is now the first point; the rest are earned above it.
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= MIN_PASSWORD_LENGTH + 4) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (/\d/.test(password) && /[A-Za-z]/.test(password)) score += 1;

  // Narrowed BEFORE indexing, not inside the returned object. `noUncheckedIndexedAccess` widens a
  // tuple lookup to `| undefined` whenever the index is a plain `number`, and the four `+= 1` lines
  // above produce exactly that — the bound is obvious to a reader and invisible to the compiler.
  const bounded = Math.min(score, LABELS.length - 1) as Score;
  return { score: bounded, label: LABELS[bounded] };
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  withStrength = false,
  minLength,
  maxLength,
  placeholder,
  required = true,
  aside,
  hint,
}: Props) {
  const [visible, setVisible] = useState(false);
  const meterId = useId();
  const hintId = useId();

  const strength = withStrength ? strengthOf(value) : null;
  const showMeter = strength !== null && value.length > 0;

  // Both, when both are present. A field described by only one of them leaves a screen reader user
  // hearing the rating without the rule, or the rule without the rating.
  const describedBy =
    [showMeter ? meterId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {aside}
      </div>

      <div className={styles.passwordWrap}>
        <input
          id={id}
          className={`${styles.input} ${styles.inputWithButton}`}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          minLength={minLength}
          maxLength={maxLength}
          placeholder={placeholder}
          required={required}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={styles.reveal}
          // Says what pressing it will DO. "Toggle password visibility" describes the control rather
          // than the outcome, which leaves a screen reader user to guess the current state.
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((wasVisible) => !wasVisible)}
        >
          {visible ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" x2="22" y1="2" y2="22" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>

      {showMeter && (
        <div className={styles.meter} id={meterId}>
          <div className={styles.meterBars} aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={`${styles.meterBar} ${index < strength.score ? styles[`meterFill${strength.score}`] : ''}`}
              />
            ))}
          </div>
          {/* Polite rather than assertive: it updates on every keystroke, and an assertive region
              would interrupt the person mid-word to tell them what they are still typing. */}
          <span className={styles.meterLabel} aria-live="polite">
            {strength.label}
          </span>
        </div>
      )}

      {hint && (
        <span className={styles.fieldHint} id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}
