import type { components } from './api-schema';

/**
 * The semantic layer over the generated API types.
 *
 * `api-schema.d.ts` is generated from the OpenAPI document (`npm run gen:api`) and is never edited.
 * It gets the SHAPES right — which the first hand-written version of this file did not: it had
 * `phone` for `phoneNumber` and `company` for `organization`, caught only by checking against the C#
 * by hand.
 *
 * What a generator cannot carry is what the shapes MEAN, and in this API the meaning is where the
 * mistakes live: a section score is meaningless when its weight is 0, `impact` is on a different
 * scale from the score beside it, an entry id is opaque and never a position. Those are stated here,
 * next to aliases of the generated types, so a shape change breaks the build and a meaning change
 * stays readable.
 *
 * Some fields are NARROWED here too. The document types every enum as a bare `string`, because these
 * DTOs put enum NAMES on the wire rather than a schema-level enumeration. Narrowing gives the compiler
 * back the exhaustiveness it would otherwise lose, and each union keeps `(string & {})` so an
 * append-only server enum cannot make a response fail to type-check.
 */

type Schemas = components['schemas'];

/** Replaces one property of a generated type with a narrower one. */
type Narrow<T, K extends keyof T, V> = Omit<T, K> & { [P in K]: V };

// ── Pagination ─────────────────────────────────────────────────────────────────

/** `nextCursor` is null on the last page and is the ONLY supported way to ask for more. */
export interface PagedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

// The two the document names concretely. Declared so the generic above cannot drift from them: if the
// server changes the envelope, these assignments stop compiling.
export type PagedResumes = Schemas['PagedResponseOfResumeSummaryResponse'];
export type PagedAnalyses = Schemas['PagedResponseOfAnalysisResponse'];

// ── Identity ───────────────────────────────────────────────────────────────────

export type TokenResponse = Schemas['TokenResponse'];

/** An Application type on the wire — a debt the API documents rather than hides. */
export type AccountResponse = Schemas['AccountDto'];

// ── Resumes ────────────────────────────────────────────────────────────────────

/**
 * A date at the precision its source stated: `"2015-06-01"`, `"2015-06"` or `"2015"`.
 *
 * Strings rather than dates, because a CV that said "June 2015" cannot be given a day without
 * inventing one. Parse with a reader that tolerates all three lengths.
 */
export type DateRangeResponse = Schemas['DateRangeResponse'];

export type ContactInformationResponse = Schemas['ContactInformationResponse'];
export type ProfileResponse = Schemas['ProfileResponse'];

export type SkillResponse = Schemas['SkillResponse'];
export type ExperienceResponse = Schemas['ExperienceResponse'];
export type EducationResponse = Schemas['EducationResponse'];
export type ProjectResponse = Schemas['ProjectResponse'];
export type CertificateResponse = Schemas['CertificateResponse'];
export type LanguageResponse = Schemas['LanguageResponse'];
export type AwardResponse = Schemas['AwardResponse'];
export type PublicationResponse = Schemas['PublicationResponse'];
export type InterestResponse = Schemas['InterestResponse'];
export type ReferenceResponse = Schemas['ReferenceResponse'];

/**
 * One CV in full. **The only response that carries entry ids.**
 *
 * Each entry of each collection has an `id` that is stable while that entry exists, and it is what
 * `DELETE /v1/resumes/{id}/{section}/{itemId}` takes. It is opaque: unique within one CV, not dense,
 * not ordered, and not reused after a delete.
 *
 * **Never address an entry by its position in these arrays.** The store returns each collection as a
 * set, so a position can name a different entry between two reads.
 */
export type ResumeResponse = Schemas['ResumeResponse'];

/**
 * A CV as it appears in a list: contact basics, timestamps, and the SIZE of each section.
 *
 * It carries no entries and therefore no ids — deliberately. Fetch {@link ResumeResponse} for the CV
 * a candidate is about to edit.
 *
 * `name` is optional and usually null — see `resumeLabel` in `format.ts` for the fallback.
 */
export type ResumeSummaryResponse = Schemas['ResumeSummaryResponse'];
export type ResumeSectionCounts = Schemas['ResumeSectionCounts'];
export type RenameResumeRequest = Schemas['RenameResumeRequest'];

/** The ten collections, and the URL segment each is addressed by. */
export const RESUME_SECTIONS = [
  'experiences',
  'educations',
  'skills',
  'projects',
  'certificates',
  'languages',
  'awards',
  'publications',
  'interests',
  'references',
] as const;

export type ResumeSection = (typeof RESUME_SECTIONS)[number];

// ── Job postings ───────────────────────────────────────────────────────────────

export type RequirementPriority = 'MustHave' | 'NiceToHave' | (string & {});

export type JobRequirementResponse = Narrow<
  Schemas['JobRequirementResponse'],
  'priority',
  RequirementPriority
>;

export type JobPostingResponse = Narrow<
  Schemas['JobPostingResponse'],
  'requirements',
  JobRequirementResponse[]
>;

/**
 * One skill requirement proposed from pasted offer text.
 *
 * `priorityGuessed` is why the confirmation step exists: the API defaults every priority it proposes
 * to `NiceToHave` and marks it guessed rather than reading one out of the text. Posting a proposal
 * straight back accepts those guesses on the candidate's behalf.
 */
export type ProposedRequirementResponse = Narrow<
  Schemas['ProposedRequirementResponse'],
  'priority',
  RequirementPriority
>;

export type ExtractJobOfferRequirementsResponse = Narrow<
  Schemas['ExtractJobOfferRequirementsResponse'],
  'requirements',
  ProposedRequirementResponse[]
>;

// ── Scoring ────────────────────────────────────────────────────────────────────

/** The six sections a match score is broken down into. Closed at six. */
export type SectionName =
  | 'Skills'
  | 'Experience'
  | 'Education'
  | 'Certifications'
  | 'Projects'
  | 'Languages';

export type ScoreBand = 'Low' | 'Medium' | 'Good' | 'Strong' | (string & {});

export type RecommendationPriority = 'Critical' | 'Important' | 'NiceToHave' | (string & {});

/** Append-only server-side; an unknown value must not crash a client. */
export type RecommendationKind =
  | 'MissingMustHaveSkill'
  | 'MissingNiceToHaveSkill'
  | 'NoEducationRecorded'
  | 'NoDegreeRecorded'
  | 'FewerCertificationsThanExpected'
  | 'FewerProjectsThanExpected'
  | 'LanguageMissing'
  | 'LanguageBelowRequiredLevel'
  | 'LanguageLevelNotRecorded'
  | 'ExperienceNotMarkedProfessional'
  | (string & {});

/**
 * One section's score paired with the weight it carried.
 *
 * **The pairing is the contract.** `score` is 0..1 and is MEANINGLESS when `weight` is 0: the posting
 * expressed no weighted requirement, so nothing was measured and it must not be rendered as a result.
 * There is deliberately no separate "applicable" flag — the weight IS the signal.
 */
export type SectionScoreResponse = Narrow<Schemas['SectionScoreResponse'], 'section', SectionName>;

/**
 * `impact` is on the 0..1 scale, NOT the 0..100 scale `overallScore` uses — showing it as points
 * means multiplying by 100. It is measured rather than estimated: the exact increase produced by
 * re-evaluating the same formula with that one gap closed. Impacts are measured one at a time and
 * are not guaranteed to add up.
 */
export type RecommendationResponse = Omit<
  Schemas['RecommendationResponse'],
  'section' | 'priority' | 'kind'
> & {
  section: SectionName;
  priority: RecommendationPriority;
  kind: RecommendationKind;
};

export type ScoringWeightsResponse = Schemas['ScoringWeightsResponse'];

export type ScoreBreakdownResponse = Narrow<
  Schemas['ScoreBreakdownResponse'],
  'sections',
  SectionScoreResponse[]
>;

/**
 * One scoring run. `overallScore` is 0..100 and is a fact about the (CV, posting) PAIR — never add it
 * to a readability score.
 *
 * `isStale` is computed per request and never stored: true when the CV has been edited since, and
 * also true when the analysis predates the provenance columns and cannot say. `POST
 * /v1/scoring/score` always answers false.
 */
export type AnalysisResponse = Omit<
  Schemas['AnalysisResponse'],
  'breakdown' | 'recommendations' | 'band'
> & {
  breakdown: ScoreBreakdownResponse;
  recommendations: RecommendationResponse[];
  band: ScoreBand;
};

// ── Readability ────────────────────────────────────────────────────────────────

/** The five sections of the readability score. A different model from scoring; never blended. */
export type ReadabilitySectionName =
  | 'Completeness'
  | 'Contact'
  | 'Achievements'
  | 'Chronology'
  | 'AtsParseability';

export type ReadabilitySectionScoreResponse = Narrow<
  Schemas['ReadabilitySectionScoreResponse'],
  'section',
  ReadabilitySectionName
>;

export type ReadabilityRecommendationResponse = Omit<
  Schemas['ReadabilityRecommendationResponse'],
  'section' | 'priority'
> & { section: ReadabilitySectionName; priority: RecommendationPriority };

export type ReadabilityBreakdownResponse = Narrow<
  Schemas['ReadabilityBreakdownResponse'],
  'sections',
  ReadabilitySectionScoreResponse[]
>;

/**
 * One readability run. **Not a match score, and the two must never be added.** It needs no job
 * posting, which is the whole point: a candidate gets value before they have a target job.
 *
 * `weights.atsParseability` is 0 unless the CV was imported with an `importEvidence` token — that
 * section grades what the uploaded DOCUMENT looked like to a parser, so a hand-typed CV has nothing
 * for it to measure and is renormalized out rather than scored zero.
 */
export type ReadabilityResponse = Omit<
  Schemas['ReadabilityResponse'],
  'breakdown' | 'recommendations' | 'band'
> & {
  breakdown: ReadabilityBreakdownResponse;
  recommendations: ReadabilityRecommendationResponse[];
  band: ScoreBand;
};

// ── Requests ───────────────────────────────────────────────────────────────────

export type CreateResumeRequest = Schemas['CreateResumeRequest'];
export type UpdateContactRequest = Schemas['UpdateContactRequest'];
export type AddSkillRequest = Schemas['AddSkillRequest'];
export type AddExperienceRequest = Schemas['AddExperienceRequest'];
export type AddEducationRequest = Schemas['AddEducationRequest'];
export type ImportJobOfferRequest = Schemas['ImportJobOfferRequest'];
export type ScoreResumeRequest = Schemas['ScoreResumeRequest'];

// ── Errors ─────────────────────────────────────────────────────────────────────

/**
 * Every error this API emits is ProblemDetails-shaped. `errors` is present on the field-error
 * responses, keyed by field path (`requirements[2].skill`).
 */
export type ProblemDetails = Schemas['ProblemDetails'] & {
  errors?: Record<string, string[]>;
};
