import type {
  ProjectResponse,
  RequirementMatchResponse,
  ResumeResponse,
  SkillResponse,
} from './contracts';

/**
 * Composing a CV for one posting, out of nothing the candidate did not already write.
 *
 * NOTHING HERE DECIDES WHAT IS RELEVANT. Every judgement of that kind was made by the scoring engine
 * and arrives in `requirementMatches`: which requirements were answered, and by which text. What this
 * file does is a join and a sort over strings the server handed back — a lookup, not a rule. The
 * alternative was comparing the CV against the posting locally, and it would have been wrong on the
 * engine's own terms, because it canonicalises through a synonym lexicon that is embedded server-side
 * and served nowhere.
 *
 * **WORK HISTORY IS NOT ORDERED HERE, AND THAT IS NOT AN OVERSIGHT.** `ScoringRules.IsSatisfiedBy`
 * reads skill names, skill keywords and project technologies. It never reads experiences. So there is
 * no "relevance" of an experience to a posting to sort by — not unpublished, non-existent — and a
 * screen that ranked them would be showing a judgement beside a score that never made it. Experiences
 * stay in the order the CV gives them and the screen says why.
 *
 * Nothing is rewritten, nothing is summarised, nothing is generated. Selection and order only.
 */

/** One section, reordered, with the reason each entry came first kept alongside it. */
export interface Ranked<T> {
  entry: T;
  /** The candidate's own words that answered a requirement — `React.js` for a `React` requirement. */
  answering: string[];
  /** Summed weight of the requirements this entry answered. The sort key, and nothing else. */
  weight: number;
}

export interface TailoredCv {
  skills: Ranked<SkillResponse>[];
  projects: Ranked<ProjectResponse>[];
  /**
   * What the posting asked for and this CV does not answer.
   *
   * FOR THE CANDIDATE, NEVER FOR THE DOCUMENT. A CV does not list its own gaps; an employer reading
   * one would be handed an argument against hiring. This belongs on screen, beside the download, and
   * out of the printed page.
   */
  unanswered: RequirementMatchResponse[];
  /** True when the posting stated requirements at all. `[]` and `null` mean different things. */
  measured: boolean;
}

/** Case-insensitive, because the engine matched case-insensitively and the CV is free text. */
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Ranks one collection against the attribution.
 *
 * `answers` decides whether an entry is the one a piece of evidence names — by exact string against
 * values the server itself returned, never by any comparison of the candidate's text to the
 * posting's. Ties keep the CV's own order, so a reordering never shuffles equals.
 */
function rank<T>(
  entries: readonly T[],
  matches: readonly RequirementMatchResponse[],
  answers: (entry: T, matchedText: string) => boolean,
  sources: readonly string[],
): Ranked<T>[] {
  const ranked = entries.map((entry, order) => {
    const answering: string[] = [];
    let weight = 0;

    for (const match of matches) {
      const evidence = match.matchedBy.filter(
        (item) => sources.includes(item.source) && answers(entry, item.matchedText),
      );

      if (evidence.length === 0) continue;

      weight += match.weight;
      for (const item of evidence) {
        if (!answering.some((text) => same(text, item.matchedText))) answering.push(item.matchedText);
      }
    }

    return { entry, answering, weight, order };
  });

  // Heaviest first, and the CV's own order among equals — including among the entries that answered
  // nothing, which keep their place rather than being shuffled to the bottom in arbitrary order.
  ranked.sort((a, b) => b.weight - a.weight || a.order - b.order);

  return ranked.map(({ entry, answering, weight }) => ({ entry, answering, weight }));
}

/**
 * The CV as this posting would read it.
 *
 * `matches` is `null` when the analysis was read back from storage rather than freshly scored — the
 * API refuses to compute attribution against a CV that may have moved since. Nothing is reordered in
 * that case, and the caller has to say so rather than present the CV's own order as a tailored one.
 */
export function tailor(
  resume: ResumeResponse,
  matches: readonly RequirementMatchResponse[] | null,
): TailoredCv {
  const untouched = (): TailoredCv => ({
    skills: resume.skills.map((entry) => ({ entry, answering: [], weight: 0 })),
    projects: resume.projects.map((entry) => ({ entry, answering: [], weight: 0 })),
    unanswered: [],
    measured: false,
  });

  if (matches === null || matches.length === 0) return untouched();

  return {
    skills: rank(
      resume.skills,
      matches,
      (skill, text) =>
        same(skill.name, text) || (skill.keywords ?? []).some((keyword) => same(keyword, text)),
      ['SkillName', 'SkillKeyword'],
    ),
    projects: rank(
      resume.projects,
      matches,
      (project, text) => (project.technologies ?? []).some((tech) => same(tech, text)),
      ['ProjectTechnology'],
    ),
    // Every requirement the engine reports as unmet, in the order the posting stated them.
    unanswered: matches.filter((match) => !match.satisfied),
    measured: true,
  };
}
