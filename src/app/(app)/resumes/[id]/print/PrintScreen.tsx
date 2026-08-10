'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { RESUME_SECTIONS, type ResumeResponse } from '@/lib/contracts';
import { messageOf, readJson, SessionExpired } from '@/lib/http';

import { entriesOf, SECTION_SPECS } from '../sectionSpecs';
import styles from './print.module.css';

/**
 * The CV as a document, laid out for paper.
 *
 * THIS IS THE EXPORT, and `ResumePreview` deliberately is not — its comment says so. That one is a
 * reading of the CV at a page's proportions: it clips at one sheet (`overflow: hidden`) and shows
 * four of the ten sections. Printing it would hand an employer a truncated CV, which is worse than
 * handing them none.
 *
 * WHAT IT RENDERS COMES FROM `SECTION_SPECS`, not from property names written again here. That table
 * already owns which field each section reads, and it was corrected once for exactly the mistake a
 * second copy invites — `phone` for `phoneNumber`, `company` for `organization`. The export adds
 * `prose`, `bullets` and `meta` there rather than reaching into the entries itself.
 *
 * The browser paginates. That is the whole reason this is a route and a stylesheet rather than a
 * renderer: `break-inside: avoid` keeps an entry whole across a page boundary, and a headless
 * Chromium pointed at this same URL would produce the same document if a real download is wanted
 * later. Nothing here would have to change for that.
 */
export function PrintScreen({ resumeId }: { resumeId: string }) {
  const router = useRouter();
  const [resume, setResume] = useState<ResumeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  if (notFound) {
    return (
      <div className={styles.state}>
        <p>No such CV. It may have been deleted, or it belongs to another account.</p>
        <Link href="/resumes" className="btn">
          Back to your CVs
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.state}>
        <p className="notice noticeError" role="alert">
          {error}
        </p>
        <Link href={`/resumes/${resumeId}`} className="btn">
          Back to the CV
        </Link>
      </div>
    );
  }

  if (!resume) return <div className={styles.state}>Loading…</div>;

  const contact = resume.contactInformation;
  const contactLine = [contact.email, contact.phoneNumber, contact.location, contact.website]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/*
        The only thing on this page that is not the CV, and `@media print` removes it. A candidate
        arrives here to produce a file, so the action says what the browser will actually offer —
        "Save as PDF" is the destination in every print dialog worth naming.
      */}
      <div className={styles.chrome}>
        <Link href={`/resumes/${resumeId}`} className="btn">
          Back to the CV
        </Link>
        <button type="button" className="btn btnPrimary" onClick={() => window.print()}>
          Save as PDF
        </button>
      </div>

      <article className={styles.document}>
        <header className={styles.head}>
          <h1 className={styles.name}>{contact.fullName}</h1>
          {contactLine && <p className={styles.contact}>{contactLine}</p>}
        </header>

        {contact.summary && (
          <section className={styles.section}>
            <h2 className={styles.heading}>Summary</h2>
            <p className={styles.prose}>{contact.summary}</p>
          </section>
        )}

        {RESUME_SECTIONS.map((section) => {
          const spec = SECTION_SPECS[section];
          const entries = entriesOf(resume, section);

          // An empty section prints nothing at all. A page of headings with no entries under them
          // reads as a template someone forgot to fill, which is not what this CV is.
          if (entries.length === 0) return null;

          return (
            <section key={section} className={styles.section}>
              <h2 className={styles.heading}>{spec.label}</h2>

              {spec.layout === 'inline' ? (
                <p className={styles.inline}>
                  {entries
                    .map((entry) => {
                      const detail = spec.detail?.(entry);
                      return detail ? `${spec.describe(entry)} (${detail})` : spec.describe(entry);
                    })
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : (
                entries.map((entry, index) => {
                  const detail = spec.detail?.(entry) ?? null;
                  const prose = spec.prose?.(entry) ?? null;
                  const meta = spec.meta?.(entry) ?? null;
                  const bullets = spec.bullets?.(entry) ?? [];

                  return (
                    // The index is only a React key here, never an address: entry ids are opaque and
                    // these arrays are a set, but nothing on this page addresses an entry at all.
                    <div key={index} className={styles.entry}>
                      <div className={styles.entryHead}>
                        <span className={styles.entryTitle}>{spec.describe(entry)}</span>
                        {detail && <span className={styles.entryMeta}>{detail}</span>}
                      </div>

                      {prose && <p className={styles.prose}>{prose}</p>}
                      {meta && <p className={styles.meta}>{meta}</p>}

                      {bullets.length > 0 && (
                        <ul className={styles.bullets}>
                          {bullets.map((bullet, at) => (
                            <li key={at}>{bullet}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          );
        })}
      </article>
    </>
  );
}
