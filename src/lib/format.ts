import type {
  RecommendationPriority,
  RequirementMatchResponse,
  ScoreBand,
  SectionName,
} from './contracts';

/** A tone drawn from the palette in `globals.css`. */
export interface Tone {
  fg: string;
  bg: string;
  border: string;
}

/**
 * Every `fg` is a `-fg` token, never the vivid one that shares its name.
 *
 * The vivid tones are FILL colours: `--good` on white is 3.30:1 and `--warn` is 3.19:1, which clears
 * the 3:1 the WCAG asks of a bar or a dot and misses the 4.5:1 it asks of text. Three of these five
 * bands failed that way — measured, not guessed — and the darker pair for each already existed in
 * `globals.css` for exactly this. Restoring the brighter colour here would look like a small design
 * choice and would quietly put the score label back under the floor.
 */
const TONES = {
  strong: { fg: 'var(--good-fg)', bg: 'var(--good-bg)', border: 'var(--good-border)' },
  good: { fg: 'var(--primary)', bg: 'var(--primary-bg)', border: '#dbeafe' },
  medium: { fg: 'var(--warn-fg)', bg: 'var(--warn-bg)', border: '#fde68a' },
  low: { fg: 'var(--bad-fg)', bg: 'var(--bad-bg)', border: 'var(--bad-border)' },
  neutral: { fg: 'var(--fg-muted)', bg: 'var(--border-soft)', border: 'var(--border)' },
} as const satisfies Record<string, Tone>;

/**
 * Colour follows the SERVER'S band, not a second set of thresholds invented here.
 *
 * The source design coloured scores at 90/70/50 while `Analysis.Band` cuts at 40/60/80. Keeping the
 * design's numbers would have let the swatch and the label disagree about the same score — a green
 * ring beside the word "Good" — which is the classic way one rule written twice drifts apart.
 */
export function bandTone(band: ScoreBand): Tone {
  switch (band) {
    case 'Strong':
      return TONES.strong;
    case 'Good':
      return TONES.good;
    case 'Medium':
      return TONES.medium;
    case 'Low':
      return TONES.low;
    default:
      return TONES.neutral;
  }
}

/**
 * What the band means, in the API's own terms.
 *
 * Deliberately NOT the source design's "Above 70 typically passes automated screening" — nothing in
 * this system measures what an external ATS does with a score, so that sentence would be a claim the
 * product cannot stand behind. These describe the cut-offs, which it can.
 */
export function bandCopy(band: ScoreBand): string {
  switch (band) {
    case 'Strong':
      return 'Strong match — 80 or above';
    case 'Good':
      return 'Good match — 60 to 79';
    case 'Medium':
      return 'Partial match — 40 to 59';
    case 'Low':
      return 'Weak match — below 40';
    default:
      return band;
  }
}

/** A section score is 0..1; the ring and the bars are percentages. */
export function toPercent(unitValue: number): number {
  return Math.round(unitValue * 100);
}

/**
 * `impact` is on the 0..1 scale, so points are `impact × 100`.
 *
 * Kept to one decimal rather than rounded to whole points, because the API's claim about this number
 * is that it is MEASURED — the exact increase from closing that one gap. Real values land on 11.1,
 * 7.7, 3.8; rounding 3.8 to "+4 pts" overstates a figure whose selling point is that it was not
 * estimated. A trailing `.0` is dropped so a clean 3 does not read as suspiciously precise.
 *
 * An impact of 0 is a real answer, not a bug: a posting can state requirements and weight every one
 * of them 0.0, which renormalizes the section out while the advice naming those requirements stays.
 */
export function impactPoints(impact: number): string {
  const points = Number((impact * 100).toFixed(1));
  if (points <= 0) return '0 pts';
  return `+${points} ${points === 1 ? 'pt' : 'pts'}`;
}

export function priorityTone(priority: RecommendationPriority): Tone {
  switch (priority) {
    case 'Critical':
      return TONES.low;
    case 'Important':
      return TONES.medium;
    case 'NiceToHave':
      return TONES.neutral;
    default:
      return TONES.neutral;
  }
}

export function priorityLabel(priority: RecommendationPriority): string {
  return priority === 'NiceToHave' ? 'Nice to have' : priority;
}

const SECTION_LABELS: Record<SectionName, string> = {
  Skills: 'Skills',
  Experience: 'Experience',
  Education: 'Education',
  Certifications: 'Certifications',
  Projects: 'Projects',
  Languages: 'Languages',
};

/** Unknown names pass through: `SectionType` is append-only server-side and this must not crash. */
export function sectionLabel(section: SectionName | string): string {
  return SECTION_LABELS[section as SectionName] ?? section;
}

/**
 * The same bands, said about a CV rather than about a pairing.
 *
 * `bandCopy` calls them a match, because that is what an analysis measures. A readability run compares
 * the CV against nothing — there is no posting — so "weak match" would name a comparison that did not
 * happen. The thresholds are the same; the subject is not.
 */
export function readabilityBandCopy(band: ScoreBand): string {
  switch (band) {
    case 'Strong':
      return 'Reads well — 80 or above';
    case 'Good':
      return 'Reads adequately — 60 to 79';
    case 'Medium':
      return 'Hard to read — 40 to 59';
    case 'Low':
      return 'Hard to read — below 40';
    default:
      return band;
  }
}

/**
 * The five readability sections, said the way a candidate would.
 *
 * `AtsParseability` in particular: the enum name is about a parser, but what it grades is the FILE the
 * CV was imported from — so the label says document, which is the thing the advice tells them to
 * re-export.
 */
const READABILITY_LABELS: Record<string, string> = {
  Completeness: 'Completeness',
  Contact: 'Contact details',
  Achievements: 'Achievements',
  Chronology: 'Work history',
  AtsParseability: 'Document parseability',
};

export function readabilitySectionLabel(section: string): string {
  return READABILITY_LABELS[section] ?? section;
}

/**
 * Why a readability section could not be measured.
 *
 * A weight of 0 means the section was renormalized out, and the two reasons are different enough that
 * one sentence for both would be wrong: parseability grades an uploaded document, so a CV typed by
 * hand has no document to grade — that is not a failing, and it is why such a CV can still reach 100.
 */
export function unmeasuredReason(section: string): string {
  return section === 'AtsParseability'
    ? 'this CV was typed rather than imported, so there is no document to grade'
    : 'nothing in this CV could be measured for it';
}

/**
 * What to call a CV in a list.
 *
 * THE NAME THE CANDIDATE GAVE IT, falling back to the contact name. Those are the only two things a
 * list row carries that could serve as a label, and the fallback is the honest one rather than a
 * placeholder: an unnamed CV is the ordinary state, not a gap, so "Untitled" would scold a candidate
 * for not doing something optional.
 *
 * An earlier version reached for the most recent job title, which read better and stopped working the
 * day `GET /v1/resumes` was narrowed to a summary — a list row has no experiences to read a title out
 * of. Reading only what a summary actually carries is what keeps this working across both shapes.
 *
 * The parameter is the two fields rather than `Pick<ResumeSummaryResponse, …>` because the full
 * `ResumeResponse` nests the contact name one level down and would not satisfy that Pick. Both callers
 * pass the same two strings, which is the point — one statement of the fallback, not two.
 */
export function resumeLabel(resume: { name: string | null; fullName: string }): string {
  return resume.name?.trim() || resume.fullName;
}

/** English-only, and only for the regular nouns this screen counts. */
export function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

export function relativeTime(iso: string, now: number = Date.now()): string {
  const elapsed = new Date(iso).getTime() - now;
  if (Number.isNaN(elapsed)) return 'unknown';

  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return RELATIVE.format(Math.round(elapsed / ms), unit);
  }

  return 'just now';
}

/**
 * What answered each of a posting's requirements, from the engine's own attribution.
 *
 * THIS REPLACES A STRING SEARCH THROUGH RECOMMENDATION PROSE. Until the API published
 * `requirementMatches`, the only way to know whether a requirement was met was to look for its own
 * text inside a "missing skill" sentence: a recommendation whose wording changed stopped matching, so
 * a chip could only ever read as UNVERIFIED rather than as found. That was the direction that could
 * not mislead, and it was the best available.
 *
 * It is also why there was no "found" chip anywhere on the results screen. Recommendations are capped
 * at ten, so the absence of a flag was never evidence of a match. `requirementMatches` carries EVERY
 * requirement, satisfied or not, so absence is no longer what has to be interpreted — the engine says
 * outright which answered and with which of the candidate's own words.
 *
 * Returns `null` for a requirement the attribution does not cover, and for every requirement when
 * there is no attribution at all. `null` is a third state and not a `false`: "this analysis did not
 * carry the answer" is not "your CV does not have it", and rendering them alike would accuse a
 * candidate of a gap the engine never reported.
 */
export interface RequirementAnswer {
  satisfied: boolean;
  /** The candidate's own words that answered it — `React.js` against a requirement for `React`. */
  by: string[];
}

export function requirementAnswers(
  matches: readonly RequirementMatchResponse[] | null,
): (skill: string) => RequirementAnswer | null {
  if (matches === null) return () => null;

  // Keyed case-insensitively because the engine matched that way and a posting is free text.
  const bySkill = new Map(matches.map((match) => [match.skill.trim().toLowerCase(), match]));

  return (skill: string) => {
    const match = bySkill.get(skill.trim().toLowerCase());
    if (!match) return null;

    return {
      satisfied: match.satisfied,
      by: match.matchedBy.map((evidence) => evidence.matchedText),
    };
  };
}
