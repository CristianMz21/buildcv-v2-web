import type { ResumeResponse } from '@/lib/contracts';

import styles from './editor.module.css';

/**
 * The CV as one page.
 *
 * IT IS NOT AN EXPORT AND MUST NOT LOOK LIKE ONE. There is no PDF endpoint anywhere in this product,
 * so this is a reading of what the CV currently holds, at a page's proportions — no download button
 * beside it, and nothing here claims to be the file an employer would receive.
 *
 * It shows only the sections that have something in them. An empty CV rendered as a page of headings
 * would read as a template to fill rather than as the state of the data.
 */
export function ResumePreview({ resume }: { resume: ResumeResponse }) {
  const contact = resume.contactInformation;
  const line = [contact.email, contact.phoneNumber, contact.location, contact.website]
    .filter(Boolean)
    .join(' · ');

  const empty =
    resume.experiences.length === 0 &&
    resume.educations.length === 0 &&
    resume.skills.length === 0;

  return (
    <div className={styles.preview}>
      <div className={styles.previewLabel}>Preview</div>
      <div className={styles.sheet}>
        <div className={styles.sheetName}>{contact.fullName}</div>
        <div className={styles.sheetContact}>{line}</div>

        {contact.summary && (
          <>
            <div className={styles.sheetHeading}>Summary</div>
            <div className={styles.sheetBody}>{contact.summary}</div>
          </>
        )}

        {resume.experiences.length > 0 && (
          <>
            <div className={styles.sheetHeading}>Experience</div>
            <div className={styles.sheetBody}>
              {resume.experiences.map((experience) => (
                <div key={experience.id} style={{ marginBottom: 6 }}>
                  <div className={styles.sheetRow}>
                    <span>
                      {experience.position} · {experience.organization}
                    </span>
                    <span className={styles.sheetRowMeta}>
                      {experience.period.start} – {experience.period.end ?? 'present'}
                    </span>
                  </div>
                  {experience.summary && <div>{experience.summary}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {resume.educations.length > 0 && (
          <>
            <div className={styles.sheetHeading}>Education</div>
            <div className={styles.sheetBody}>
              {resume.educations.map((education) => (
                <div key={education.id} className={styles.sheetRow} style={{ marginBottom: 3 }}>
                  <span>
                    {[education.degree, education.institution].filter(Boolean).join(' · ')}
                  </span>
                  <span className={styles.sheetRowMeta}>
                    {education.period.start} – {education.period.end ?? 'present'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {resume.skills.length > 0 && (
          <>
            <div className={styles.sheetHeading}>Skills</div>
            <div className={styles.sheetBody}>
              {resume.skills.map((skill) => skill.name).join(' · ')}
            </div>
          </>
        )}

        {empty && (
          <div className={styles.sheetEmpty}>
            Nothing to show yet — add experience, education or skills.
          </div>
        )}
      </div>
    </div>
  );
}
