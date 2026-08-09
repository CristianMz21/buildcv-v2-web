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
 *
 * `read` is the other direction, and it exists because THE TWO SHAPES ARE NOT THE SAME. A request says
 * `skillName`, `start` and `end`; the response says `name` and nests the pair under `period`. Editing
 * an entry means seeding the request's fields from the response's, so every field whose two names
 * differ states its reader here — the alternative was addressing them by name and quietly seeding a
 * blank, which reads as "this entry had no start date" and clears it on save.
 */

interface Named {
  name: string;
  label: string;
  /** Reads this field's current value off a RESPONSE entry. Defaults to the property of the same name. */
  read?: (entry: Record<string, unknown>) => string;
}

export type FieldSpec =
  | ({ kind: 'text'; required?: boolean; placeholder?: string } & Named)
  | ({ kind: 'textarea'; rows?: number; placeholder?: string } & Named)
  | ({ kind: 'date'; required?: boolean } & Named)
  | ({ kind: 'number' } & Named)
  | ({ kind: 'select'; options: readonly string[] } & Named)
  /** A textarea split on newlines into a string[]. Highlights and technologies are lists. */
  | ({ kind: 'lines'; rows?: number; placeholder?: string } & Named);

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
  /**
   * Response properties this section's request has no field for, so editing an entry CLEARS them.
   *
   * Two of them, and both were only ever writable by importing a document: an experience's bullet
   * points and a skill's alternative spellings. Both are read by the engines — Achievements is
   * computed from nothing but the bullet points, and `ScoringRules` matches a requirement against the
   * spellings — so losing them silently would move a candidate's scores with no edit that explains it.
   * The editor names them before saving instead. Widening the two requests is the real fix and is a
   * change to the API, not to this screen.
   */
  clears?: readonly { key: string; noun: string }[];
}

/** A `yyyy-MM-dd` string, which is the only precision `<input type="date">` can hold. */
const isFullDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * The request body for one entry, seeded from that entry as the API returned it.
 *
 * A date the input cannot hold comes back BLANK rather than truncated: `PartialDate` allows `2015-06`
 * and `2015`, and there is no way to show either in a date picker. Blank makes a required start read
 * as missing, which the form refuses to submit — so the candidate is asked for the day rather than
 * having one invented for them.
 */
export function formFrom(entry: Record<string, unknown>, spec: SectionSpec): Record<string, string> {
  const draft: Record<string, string> = {};

  for (const field of spec.fields) {
    const value = field.read ? field.read(entry) : text(entry, field.name);
    draft[field.name] = field.kind === 'date' && !isFullDate(value) ? '' : value;
  }

  return draft;
}

/**
 * What editing this entry would lose, in the candidate's words, or an empty list.
 *
 * Both causes are real and neither is avoidable on this screen: a value the request cannot express,
 * and a date the request CAN express but the picker cannot show.
 */
export function losses(entry: Record<string, unknown>, spec: SectionSpec): string[] {
  const lost: string[] = [];

  for (const { key, noun } of spec.clears ?? []) {
    const value = entry[key];
    if (Array.isArray(value) && value.length > 0) lost.push(`its ${noun} (${value.length})`);
  }

  for (const field of spec.fields) {
    if (field.kind !== 'date') continue;
    const value = field.read ? field.read(entry) : text(entry, field.name);
    if (value !== '' && !isFullDate(value)) {
      lost.push(`the precision of ${field.label.toLowerCase()} — ${value} must be given as a full date`);
    }
  }

  return lost;
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

/** One end of a nested date range. The request flattens these into two fields; the response does not. */
const rangeEnd = (property: string, end: 'start' | 'end') =>
  (entry: Record<string, unknown>): string => {
    const range = entry[property] as { start?: string; end?: string | null } | null | undefined;
    return range?.[end] ?? '';
  };

/** A `lines` field's current value: one item per line, which is how the textarea shows it. */
const lines = (property: string) =>
  (entry: Record<string, unknown>): string =>
    Array.isArray(entry[property]) ? (entry[property] as string[]).join('\n') : '';

export const SECTION_SPECS: Record<ResumeSection, SectionSpec> = {
  experiences: {
    label: 'Experience',
    // Says what the scorer actually counts, because it is the one thing a candidate cannot guess.
    hint: 'Most recent first. Only Professional entries count toward the experience score.',
    fields: [
      { kind: 'select', name: 'type', label: 'Type', options: EXPERIENCE_TYPES },
      { kind: 'text', name: 'organization', label: 'Company', required: true },
      { kind: 'text', name: 'position', label: 'Title', required: true },
      { kind: 'date', name: 'start', label: 'Start', required: true, read: rangeEnd('period', 'start') },
      { kind: 'date', name: 'end', label: 'End (blank if current)', read: rangeEnd('period', 'end') },
      { kind: 'textarea', name: 'summary', label: 'Summary', rows: 3 },
    ],
    clears: [{ key: 'highlights', noun: 'bullet points' }],
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
      { kind: 'date', name: 'start', label: 'Start', required: true, read: rangeEnd('period', 'start') },
      { kind: 'date', name: 'end', label: 'End', read: rangeEnd('period', 'end') },
      { kind: 'text', name: 'grade', label: 'Grade' },
    ],
    describe: (entry) => text(entry, 'institution'),
    detail: (entry) => [text(entry, 'degree'), period(entry)].filter(Boolean).join(' · ') || null,
  },

  skills: {
    label: 'Skills',
    hint: 'Mirror the wording of your target postings — matching is on the phrase.',
    fields: [
      { kind: 'text', name: 'skillName', label: 'Skill', required: true, read: (entry) => text(entry, 'name') },
      { kind: 'select', name: 'level', label: 'Level', options: SKILL_LEVELS },
      { kind: 'number', name: 'yearsOfExperience', label: 'Years' },
    ],
    clears: [{ key: 'keywords', noun: 'alternative spellings' }],
    describe: (entry) => text(entry, 'name'),
    detail: (entry) => text(entry, 'level') || null,
  },

  projects: {
    label: 'Projects',
    hint: 'A project with neither technologies nor highlights is not counted.',
    fields: [
      { kind: 'text', name: 'name', label: 'Name', required: true },
      { kind: 'date', name: 'start', label: 'Start', required: true, read: rangeEnd('period', 'start') },
      { kind: 'date', name: 'end', label: 'End', read: rangeEnd('period', 'end') },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'text', name: 'repositoryUrl', label: 'Repository URL' },
      { kind: 'text', name: 'liveDemoUrl', label: 'Live demo URL' },
      { kind: 'lines', name: 'technologies', label: 'Technologies', placeholder: 'One per line', read: lines('technologies') },
      { kind: 'lines', name: 'highlights', label: 'Highlights', placeholder: 'One per line', read: lines('highlights') },
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
      { kind: 'date', name: 'validityStart', label: 'Valid from', read: rangeEnd('validityPeriod', 'start') },
      { kind: 'date', name: 'validityEnd', label: 'Valid until', read: rangeEnd('validityPeriod', 'end') },
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
      { kind: 'lines', name: 'keywords', label: 'Keywords', placeholder: 'One per line', read: lines('keywords') },
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
