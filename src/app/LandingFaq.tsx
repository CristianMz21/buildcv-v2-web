'use client';

import { useState } from 'react';

import styles from './landing.module.css';

/**
 * The questions people actually ask, answered from the engine rather than from marketing.
 *
 * EVERY NUMBER HERE WAS CHECKED AGAINST `buildcv-v2` BEFORE IT WAS WRITTEN. The six weights come from
 * `ScoringWeightsSnapshot.Default()`, which is `Create(0.45, 0.20, 0.10, 0.10, 0.05, 0.10)` against a
 * signature of `(skills, experience, education, certifications, projects, languages)`; the five
 * readability sections come from that snapshot's own parameter names. A landing page is the easiest
 * place in a product to say something almost true, and the scoring engine's entire argument is that
 * its numbers are measured — so a page that rounded one of them would undercut the thing it sells.
 *
 * Only one item is open at a time, and the toggle closes it: an accordion where everything can be
 * open is a list with extra clicks.
 */
const FAQS = [
  {
    q: 'What is a match score?',
    a: 'It measures how closely your CV answers the requirements of one specific job posting. It is relative to that posting rather than a universal rating — the same CV scores differently against two different roles, and that is the point rather than a flaw.',
  },
  {
    q: 'How is the score calculated?',
    a: 'From six weighted sections: skills 45%, experience 20%, education 10%, certifications 10%, languages 10% and projects 5%. When a posting says nothing about a section, its weight is redistributed across the ones the posting does ask about, so you are never penalised for information an employer did not want.',
  },
  {
    q: 'Does it use AI?',
    a: 'No. The scoring is fixed rules running on our own servers — the same CV and the same posting produce the same number every time, and every point traces back to a published weight. Nothing you write is sent to a model, because there is no model.',
  },
  {
    q: 'What is the difference between the match score and the readability score?',
    a: 'The match score needs a posting and measures how well your CV answers it. The readability score needs nothing but your CV and measures completeness, contact details, achievements, chronology and how parseable the document is. They measure different things and are never added together.',
  },
  {
    q: 'Will it work with an ATS?',
    a: 'The readability score includes ATS parseability, so you can see whether your CV is structured in a way automated systems can read. What no tool can tell you is how one particular employer has configured theirs.',
  },
  {
    q: 'Can I analyse the same CV against several jobs?',
    a: 'Yes, and you should. Each analysis is against one posting, so running one per role you apply to is how this is meant to be used.',
  },
  {
    q: 'Is it free?',
    a: 'Yes, and there is no card to enter. If that ever changes you will be told before it does, not after.',
  },
  {
    q: 'Does a good score mean I will get an interview?',
    a: 'No, and anything claiming otherwise is selling you something. It measures how well what you wrote answers what one posting asked for. Hiring decisions involve people, timing and a dozen things no software can see.',
  },
] as const;

export function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className={styles.faqList}>
      {FAQS.map((faq, index) => {
        const open = openIndex === index;
        const panelId = `faq-panel-${index}`;

        return (
          <div key={faq.q} className={styles.faqItem}>
            <h3 className={styles.faqHeading}>
              <button
                type="button"
                className={styles.faqButton}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
              >
                <span className={styles.faqQuestion}>{faq.q}</span>
                <span className={`${styles.faqChevron} ${open ? styles.faqChevronOpen : ''}`} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
            </h3>
            {open && (
              <p id={panelId} className={styles.faqAnswer}>
                {faq.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
