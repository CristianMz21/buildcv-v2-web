'use client';

import { useEffect, useState } from 'react';

import styles from './settings.module.css';

/**
 * Light, dark, or whatever the machine is set to.
 *
 * RADIOS IN A FIELDSET, not three buttons carrying `aria-pressed`. This is one exclusive choice out
 * of three, which is exactly what a radio group means — and a screen reader announces it as "2 of 3",
 * so somebody knows how many options exist and where they are without exploring. Buttons would say
 * "pressed" three times and never say what the set is.
 *
 * SYSTEM IS THE DEFAULT AND IS NOT A THIRD COLOUR. Choosing it removes the attribute rather than
 * resolving it to a value, so the CSS media query answers live: a desktop that switches at sunset
 * switches this tab with it, which a stored "dark" would not. That is the behaviour somebody picking
 * "system" is asking for, rather than a snapshot of the system taken once.
 *
 * The state is read in an effect rather than during render, because `localStorage` does not exist on
 * the server and reading it while rendering would make the markup differ from the server's for
 * reasons React cannot see. Until it resolves, nothing is selected — a beat of neutrality beats a
 * flicker from the wrong answer to the right one.
 */
type Choice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'buildcv.theme';

const OPTIONS: { value: Choice; label: string; hint: string }[] = [
  { value: 'system', label: 'Match my system', hint: 'Follows your device, including when it changes at sunset.' },
  { value: 'light', label: 'Light', hint: 'Always light, whatever your device is set to.' },
  { value: 'dark', label: 'Dark', hint: 'Always dark, whatever your device is set to.' },
];

function apply(choice: Choice): void {
  if (choice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
}

export function Appearance() {
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    // `localStorage` can refuse to answer (private mode, disabled storage) — `ThemeScript` already
    // defends the read it makes at paint time, and the choice picker has to defend both of its calls
    // or a visitor with storage disabled gets an uncaught error instead of the system theme.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    setChoice(saved === 'light' || saved === 'dark' ? saved : 'system');
  }, []);

  function choose(next: Choice) {
    setChoice(next);
    apply(next);
    // Written rather than removed even for "system", so the choice is a decision on this machine
    // rather than the absence of one — otherwise clearing it and never having set it look identical.
    // If the write fails, the current document still shows the selection; only its persistence is lost.
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice already took effect for this document; there is nowhere sensible to report a
      // failure the visitor cannot act on, and throwing would take the whole settings screen down.
    }
  }

  return (
    <section className={`card ${styles.panel}`}>
      <fieldset className={styles.themeSet}>
        <legend className={styles.panelTitle}>Appearance</legend>
        <p className={styles.note}>
          Kept on this device only. It is never sent to the server, so it does not follow you to
          another browser — and nothing about how you read is stored with your CV.
        </p>

        {OPTIONS.map((option) => (
          <label key={option.value} className={styles.themeOption}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={choice === option.value}
              onChange={() => choose(option.value)}
            />
            <span>
              <span className={styles.themeLabel}>{option.label}</span>
              <span className={styles.themeHint}>{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
