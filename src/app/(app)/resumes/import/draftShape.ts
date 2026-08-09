/**
 * What a proposed draft is made of, by field path.
 *
 * EVERY FIELD IS A STRING, and that is the API's design rather than a simplification here: a draft
 * holds untrusted text a parser guessed at, so typing a field would move the failure to the binding
 * boundary where it could not carry a path or collect its siblings. The review screen inherits the
 * benefit — one text control serves all forty-odd fields, and the same path indexes both the
 * confidence the extractor reported and the error the import returned.
 *
 * The lists here are the `Import*Request` shapes verbatim. A field missing from one of these lists is
 * a field the review screen silently drops on the way back, so they are read from the generated types
 * rather than remembered.
 */

/** `lines` is a string[] on the wire, edited as one line per entry. */
export type DraftFieldKind = 'text' | 'long' | 'lines';

export interface DraftField {
  name: string;
  label: string;
  kind?: DraftFieldKind;
}

export interface DraftSection {
  /** The key on the draft, and the first segment of every field path under it. */
  key: string;
  label: string;
  /** The line identifying one entry in a list, for a heading. */
  identify: (entry: Record<string, unknown>) => string;
  fields: DraftField[];
}

const asText = (entry: Record<string, unknown>, key: string): string =>
  typeof entry[key] === 'string' ? (entry[key] as string) : '';

export const CONTACT_FIELDS: DraftField[] = [
  { name: 'fullName', label: 'Full name' },
  { name: 'email', label: 'Email' },
  { name: 'phoneNumber', label: 'Phone' },
  { name: 'location', label: 'Location' },
  { name: 'website', label: 'Website' },
  { name: 'summary', label: 'Summary', kind: 'long' },
];

export const DRAFT_SECTIONS: DraftSection[] = [
  {
    key: 'experiences',
    label: 'Experience',
    identify: (entry) => `${asText(entry, 'position')} · ${asText(entry, 'organization')}`,
    fields: [
      { name: 'type', label: 'Type' },
      { name: 'organization', label: 'Company' },
      { name: 'position', label: 'Title' },
      { name: 'start', label: 'Start' },
      { name: 'end', label: 'End' },
      { name: 'summary', label: 'Summary', kind: 'long' },
      { name: 'highlights', label: 'Highlights', kind: 'lines' },
    ],
  },
  {
    key: 'educations',
    label: 'Education',
    identify: (entry) => asText(entry, 'institution'),
    fields: [
      { name: 'institution', label: 'Institution' },
      { name: 'degree', label: 'Degree' },
      { name: 'fieldOfStudy', label: 'Field of study' },
      { name: 'level', label: 'Level' },
      { name: 'start', label: 'Start' },
      { name: 'end', label: 'End' },
      { name: 'grade', label: 'Grade' },
    ],
  },
  {
    key: 'skills',
    label: 'Skills',
    identify: (entry) => asText(entry, 'name'),
    fields: [
      { name: 'name', label: 'Skill' },
      { name: 'level', label: 'Level' },
      { name: 'yearsOfExperience', label: 'Years' },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    identify: (entry) => asText(entry, 'name'),
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'start', label: 'Start' },
      { name: 'end', label: 'End' },
      { name: 'description', label: 'Description', kind: 'long' },
      { name: 'repositoryUrl', label: 'Repository' },
      { name: 'liveDemoUrl', label: 'Live demo' },
      { name: 'technologies', label: 'Technologies', kind: 'lines' },
      { name: 'highlights', label: 'Highlights', kind: 'lines' },
    ],
  },
  {
    key: 'certificates',
    label: 'Certificates',
    identify: (entry) => asText(entry, 'name'),
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'issuer', label: 'Issuer' },
      { name: 'credentialId', label: 'Credential ID' },
      { name: 'credentialUrl', label: 'Credential URL' },
      { name: 'validityStart', label: 'Valid from' },
      { name: 'validityEnd', label: 'Valid until' },
    ],
  },
  {
    key: 'languages',
    label: 'Languages',
    identify: (entry) => asText(entry, 'name'),
    fields: [
      { name: 'name', label: 'Language' },
      { name: 'level', label: 'Level' },
      { name: 'fluency', label: 'Fluency' },
    ],
  },
  {
    key: 'awards',
    label: 'Awards',
    identify: (entry) => asText(entry, 'title'),
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'awarder', label: 'Awarded by' },
      { name: 'date', label: 'Date' },
      { name: 'summary', label: 'Summary', kind: 'long' },
    ],
  },
  {
    key: 'publications',
    label: 'Publications',
    identify: (entry) => asText(entry, 'title'),
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'publisher', label: 'Publisher' },
      { name: 'url', label: 'URL' },
      { name: 'releaseDate', label: 'Released' },
      { name: 'summary', label: 'Summary', kind: 'long' },
    ],
  },
  {
    key: 'interests',
    label: 'Interests',
    identify: (entry) => asText(entry, 'name'),
    fields: [
      { name: 'name', label: 'Interest' },
      { name: 'keywords', label: 'Keywords', kind: 'lines' },
    ],
  },
  {
    key: 'references',
    label: 'References',
    identify: (entry) => asText(entry, 'name'),
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'position', label: 'Position' },
      { name: 'company', label: 'Company' },
      { name: 'email', label: 'Email' },
      { name: 'phoneNumber', label: 'Phone' },
      { name: 'referenceText', label: 'Reference', kind: 'long' },
    ],
  },
];

/**
 * The path the API and the extractor both use for one field: `experiences[2].start`.
 *
 * The same string indexes the field-error object of a 400 and the confidence list of a proposal, which
 * is what lets one input carry both marks without either side knowing about the other.
 */
export function fieldPath(section: string, index: number, field: string): string {
  return `${section}[${index}].${field}`;
}
