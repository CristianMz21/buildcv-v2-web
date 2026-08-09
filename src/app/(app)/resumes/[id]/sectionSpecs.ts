import type { ResumeResponse, ResumeSection } from '@/lib/contracts';

/**
 * What each CV section is made of, stated once.
 *
 * ONE TABLE RATHER THAN TEN FORMS. The sections differ only in their fields, and ten hand-written
 * forms would be ten copies of the same submit, error and reset logic — with the copy somebody edits
 * being where they drift. The field kinds below are the whole vocabulary; a section that needs a kind
 * this list does not have is a section that needs a real form, not another special case here.
 *
 * The field names are the API's own, verbatim from the generated request types, so a form's state IS
 * the request body. Renaming one here without renaming it there produces a 400 at the first save
 * rather than a silently dropped field.
 */

export type FieldSpec =
  | { kind: 'text'; name: string; label: string; required?: boolean; placeholder?: string }
  | { kind: 'textarea'; name: string; label: string; rows?: number; placeholder?: string }
  | { kind: 'date'; name: string; label: string; required?: boolean }
  | { kind: 'number'; name: string; label: string }
  | { kind: 'select'; name: string; label: string; options: readonly string[] }
  /** A textarea split on newlines into a string[]. Highlights and technologies are lists. */
  | { kind: 'lines'; name: string; label: string; rows?: number; placeholder?: string };

export interface SectionSpec {
  /** Plural, as a heading. */
  label: string;
  /** What this section is for, in the candidate's terms — not a restatement of the label. */
  hint: string;
  fields: readonly FieldSpec[];
  /** The line a saved entry shows in the list. */
  describe: (entry: Record<string, unknown>) => string;
  /** The line under it, or null. */
  detail?: (entry: Record<string, unknown>) => string | null;
}

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;
const EXPERIENCE_TYPES = ['Professional', 'Volunteer'] as const;
const EDUCATION_LEVELS = ['HighSchool', 'Associate', 'Bachelor', 'Master', 'Doctorate'] as const;
const LANGUAGE_LEVELS = ['Basic', 'Conversational', 'Professional', 'Fluent', 'Native'] as const;

const text = (entry: Record<string, unknown>, key: string): string =>
  typeof entry[key] === 'string' ? (entry[key] as string) : '';

/** `{start, end}` where either may be a full date, a month or a bare year. */
function period(entry: Record<string, unknown>): string {
  const range = entry.period as { start?: string; end?: string | null } | undefined;
  if (!range?.start) return '';
  return `${range.start} – ${range.end ?? 'present'}`;
}

export const SECTION_SPECS: Record<ResumeSection, SectionSpec> = {
  experiences: {
    label: 'Experience',
    // Says what the scorer actually counts, because it is the one thing a candidate cannot guess.
    hint: 'Most recent first. Only Professional entries count toward the experience score.',
    fields: [
      { kind: 'select', name: 'type', label: 'Type', options: EXPERIENCE_TYPES },
      { kind: 'text', name: 'organization', label: 'Company', required: true },
      { kind: 'text', name: 'position', label: 'Title', required: true },
      { kind: 'date', name: 'start', label: 'Start', required: true },
      { kind: 'date', name: 'end', label: 'End (blank if current)' },
      { kind: 'textarea', name: 'summary', label: 'Summary', rows: 3 },
    ],
    describe: (entry) => `${text(entry, 'position')} · ${text(entry, 'organization')}`,
    detail: (entry) => `${text(entry, 'type')} · ${period(entry)}`,
  },

  educations: {
    label: 'Education',
    hint: 'Degree, school and years. The level is the closed value the scorer compares.',
    fields: [
      { kind: 'text', name: 'institution', label: 'Institution', required: true },
      { kind: 'text', name: 'degree', label: 'Degree' },
      { kind: 'text', name: 'fieldOfStudy', label: 'Field of study' },
      { kind: 'select', name: 'level', label: 'Level', options: EDUCATION_LEVELS },
      { kind: 'date', name: 'start', label: 'Start', required: true },
      { kind: 'date', name: 'end', label: 'End' },
      { kind: 'text', name: 'grade', label: 'Grade' },
    ],
    describe: (entry) => text(entry, 'institution'),
    detail: (entry) => [text(entry, 'degree'), period(entry)].filter(Boolean).join(' · ') || null,
  },

  skills: {
    label: 'Skills',
    hint: 'Mirror the wording of your target postings — matching is on the phrase.',
    fields: [
      { kind: 'text', name: 'skillName', label: 'Skill', required: true },
      { kind: 'select', name: 'level', label: 'Level', options: SKILL_LEVELS },
      { kind: 'number', name: 'yearsOfExperience', label: 'Years' },
    ],
    describe: (entry) => text(entry, 'name'),
    detail: (entry) => text(entry, 'level') || null,
  },

  projects: {
    label: 'Projects',
    hint: 'A project with neither technologies nor highlights is not counted.',
    fields: [
      { kind: 'text', name: 'name', label: 'Name', required: true },
      { kind: 'date', name: 'start', label: 'Start', required: true },
      { kind: 'date', name: 'end', label: 'End' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'text', name: 'repositoryUrl', label: 'Repository URL' },
      { kind: 'text', name: 'liveDemoUrl', label: 'Live demo URL' },
      { kind: 'lines', name: 'technologies', label: 'Technologies', placeholder: 'One per line' },
      { kind: 'lines', name: 'highlights', label: 'Highlights', placeholder: 'One per line' },
    ],
    describe: (entry) => text(entry, 'name'),
    detail: (entry) => period(entry) || null,
  },

  certificates: {
    label: 'Certificates',
    hint: 'Only a certificate that is still valid today counts toward the section.',
    fields: [
      { kind: 'text', name: 'name', label: 'Name', required: true },
      { kind: 'text', name: 'issuer', label: 'Issuer', required: true },
      { kind: 'text', name: 'credentialId', label: 'Credential ID' },
      { kind: 'text', name: 'credentialUrl', label: 'Credential URL' },
      { kind: 'date', name: 'validityStart', label: 'Valid from' },
      { kind: 'date', name: 'validityEnd', label: 'Valid until' },
    ],
    describe: (entry) => text(entry, 'name'),
    detail: (entry) => text(entry, 'issuer') || null,
  },

  languages: {
    label: 'Languages',
    hint: 'The level is what the scorer reads. The fluency note beside it is for a human.',
    fields: [
      { kind: 'text', name: 'name', label: 'Language', required: true },
      { kind: 'select', name: 'level', label: 'Level', options: LANGUAGE_LEVELS },
      { kind: 'text', name: 'fluency', label: 'Fluency note' },
    ],
    describe: (entry) => text(entry, 'name'),
    detail: (entry) => text(entry, 'level') || null,
  },

  awards: {
    label: 'Awards',
    hint: 'Not scored against a posting; it counts toward how complete the CV reads.',
    fields: [
      { kind: 'text', name: 'title', label: 'Title', required: true },
      { kind: 'text', name: 'awarder', label: 'Awarded by' },
      { kind: 'date', name: 'date', label: 'Date' },
      { kind: 'textarea', name: 'summary', label: 'Summary', rows: 2 },
    ],
    describe: (entry) => text(entry, 'title'),
    detail: (entry) => text(entry, 'awarder') || null,
  },

  publications: {
    label: 'Publications',
    hint: 'Not scored against a posting; it counts toward how complete the CV reads.',
    fields: [
      { kind: 'text', name: 'title', label: 'Title', required: true },
      { kind: 'text', name: 'publisher', label: 'Publisher' },
      { kind: 'text', name: 'url', label: 'URL' },
      { kind: 'date', name: 'releaseDate', label: 'Released' },
      { kind: 'textarea', name: 'summary', label: 'Summary', rows: 2 },
    ],
    describe: (entry) => text(entry, 'title'),
    detail: (entry) => text(entry, 'publisher') || null,
  },

  interests: {
    label: 'Interests',
    hint: 'Not scored against a posting; it counts toward how complete the CV reads.',
    fields: [
      { kind: 'text', name: 'name', label: 'Interest', required: true },
      { kind: 'lines', name: 'keywords', label: 'Keywords', placeholder: 'One per line' },
    ],
    describe: (entry) => text(entry, 'name'),
  },

  references: {
    label: 'References',
    hint: 'Not scored against a posting; it counts toward how complete the CV reads.',
    fields: [
      { kind: 'text', name: 'name', label: 'Name', required: true },
      { kind: 'text', name: 'position', label: 'Position' },
      { kind: 'text', name: 'company', label: 'Company' },
      { kind: 'text', name: 'email', label: 'Email' },
      { kind: 'text', name: 'phoneNumber', label: 'Phone' },
      { kind: 'textarea', name: 'referenceText', label: 'Reference', rows: 3 },
    ],
    describe: (entry) => text(entry, 'name'),
    detail: (entry) => [text(entry, 'position'), text(entry, 'company')].filter(Boolean).join(' · ') || null,
  },
};

/** The entries of one section, typed loosely because the ten shapes differ. */
export function entriesOf(
  resume: ResumeResponse,
  section: ResumeSection,
): Record<string, unknown>[] {
  return (resume[section] ?? []) as unknown as Record<string, unknown>[];
}
