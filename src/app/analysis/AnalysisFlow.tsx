'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChevronRight } from '@/components/icons';
import type {
  AnalysisResponse,
  ExtractJobOfferRequirementsResponse,
  JobPostingResponse,
  PagedResponse,
  ResumeSummaryResponse,
} from '@/lib/contracts';
import { resumeLabel } from '@/lib/format';
import { fieldErrorsOf, messageOf, readJson, SessionExpired } from '@/lib/http';

import styles from './analysis.module.css';
import { InputsStep } from './InputsStep';
import { RequirementsStep, type DraftRequirement } from './RequirementsStep';
import { ResultsStep } from './ResultsStep';
import { RunningStep } from './RunningStep';
import { SuggestionsStep } from './SuggestionsStep';

type Phase = 'inputs' | 'requirements' | 'running' | 'results' | 'suggestions';

const STEP_LABELS: [string, Phase[]][] = [
  ['1 · Inputs', ['inputs']],
  ['2 · Requirements', ['requirements']],
  ['3 · Results', ['running', 'results', 'suggestions']],
];

export function AnalysisFlow() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('inputs');
  const [runStep, setRunStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [resumes, setResumes] = useState<ResumeSummaryResponse[] | null>(null);
  const [resumesError, setResumesError] = useState<string | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);

  const [jobDescription, setJobDescription] = useState('');
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [requirements, setRequirements] = useState<DraftRequirement[]>([]);

  const [posting, setPosting] = useState<JobPostingResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [counted, setCounted] = useState<ReadonlySet<number>>(new Set());

  // A plain counter rather than a random id: keys only have to be unique within this list, and a
  // deterministic source keeps a server/client render from ever disagreeing about one.
  const nextKey = useRef(0);
  const makeKey = () => `req-${nextKey.current++}`;

  /**
   * The exact body that created the posting now in state, so a retry does not create a second one.
   *
   * `run` is two calls and only the second is idempotent: `POST /v1/scoring/score` de-duplicates a
   * (resume, posting) pair, `POST /v1/job-offers/import` de-duplicates nothing. So when the import
   * succeeded and the score then failed — a throttle, a dropped connection — the user was returned
   * to the form, pressed the same button again, and left one orphan posting on their account per
   * attempt. Silent, and it accumulates.
   *
   * A ref rather than state because nothing renders from it, and comparing the body rather than a
   * flag is what keeps it honest: edit one requirement and the posting is genuinely a different one,
   * so it should be created again.
   */
  const postedBody = useRef<string | null>(null);

  const onExpired = useCallback(() => router.replace('/login'), [router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // The first page only. Paging exists on this route and the cursor is forwarded by the BFF;
        // a "load more" control belongs here the day a candidate has more than a screenful of CVs.
        const page = await readJson<PagedResponse<ResumeSummaryResponse>>(
          await fetch('/api/resumes?limit=20'),
        );

        if (cancelled) return;
        setResumes(page.items);
        setSelectedResumeId((current) => current ?? page.items[0]?.id ?? null);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof SessionExpired) return onExpired();
        setResumesError(messageOf(caught, 'Could not load your CVs.'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onExpired]);

  async function extract() {
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const proposal = await readJson<ExtractJobOfferRequirementsResponse>(
        await fetch('/api/job-offers/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: jobDescription }),
        }),
      );

      setRequirements(
        proposal.requirements.map((proposed) => ({
          key: makeKey(),
          skill: proposed.skill,
          priority: proposed.priority,
          guessed: proposed.priorityGuessed,
        })),
      );
      setPhase('requirements');
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setError(messageOf(caught, 'Could not read that posting.'));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setRunStep(0);
    setPhase('running');

    const body = JSON.stringify({
      title,
      companyName,
      requirements: requirements
        .filter((requirement) => requirement.skill.trim() !== '')
        .map((requirement) => ({
          skill: requirement.skill,
          priority: requirement.priority,
        })),
    });

    try {
      // Reused when the posting in state was created from this exact body — which is the retry after
      // a failed score, and the only case where creating it again would be a duplicate rather than a
      // different posting.
      let created = postedBody.current === body ? posting : null;

      if (!created) {
        created = await readJson<JobPostingResponse>(
          await fetch('/api/job-offers/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }),
        );

        postedBody.current = body;
        setPosting(created);
      }

      setRunStep(1);

      const scored = await readJson<AnalysisResponse>(
        await fetch('/api/scoring/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeId: selectedResumeId, jobPostingId: created.id }),
        }),
      );

      setAnalysis(scored);
      setCounted(new Set());
      setPhase('results');
    } catch (caught) {
      if (caught instanceof SessionExpired) return onExpired();
      setFieldErrors(fieldErrorsOf(caught));
      setError(messageOf(caught, 'The analysis failed.'));
      // Back to the form that owns the inputs, so a field error lands next to its input rather than
      // on a progress screen with nothing to correct.
      setPhase('requirements');
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setPhase('inputs');
    // Cleared with the posting it describes, so a new run cannot reuse one the user has left behind.
    postedBody.current = null;
    setPosting(null);
    setAnalysis(null);
    setRequirements([]);
    setCounted(new Set());
    setError(null);
    setFieldErrors({});
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const selectedResume = resumes?.find((resume) => resume.id === selectedResumeId) ?? null;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.mark} aria-hidden="true">
          B
        </span>
        <span className={styles.headerTitle}>New analysis</span>

        <nav className={styles.stepper} aria-label="Progress">
          {STEP_LABELS.map(([label, phases], index) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {index > 0 && <ChevronRight size={12} />}
              <span
                className={`${styles.step} ${phases.includes(phase) ? styles.stepCurrent : ''}`}
                aria-current={phases.includes(phase) ? 'step' : undefined}
              >
                {label}
              </span>
            </span>
          ))}
        </nav>

        <button
          type="button"
          className="btn btnGhost"
          onClick={signOut}
          style={{ marginLeft: 'auto' }}
        >
          Sign out
        </button>
      </header>

      <main className={styles.main}>
        {phase === 'inputs' && (
          <>
            {error && (
              <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                {error}
              </div>
            )}
            <InputsStep
              resumes={resumes}
              resumesError={resumesError}
              selectedResumeId={selectedResumeId}
              onSelectResume={setSelectedResumeId}
              jobDescription={jobDescription}
              onJobDescriptionChange={setJobDescription}
              busy={busy}
              onExtract={extract}
            />
          </>
        )}

        {phase === 'requirements' && (
          <RequirementsStep
            title={title}
            companyName={companyName}
            requirements={requirements}
            fieldErrors={fieldErrors}
            error={error}
            busy={busy}
            onTitleChange={setTitle}
            onCompanyChange={setCompanyName}
            onRequirementChange={(key, patch) =>
              setRequirements((current) =>
                current.map((requirement) =>
                  requirement.key === key ? { ...requirement, ...patch } : requirement,
                ),
              )
            }
            onRemoveRequirement={(key) =>
              setRequirements((current) => current.filter((requirement) => requirement.key !== key))
            }
            onAddRequirement={() =>
              setRequirements((current) => [
                ...current,
                { key: makeKey(), skill: '', priority: 'MustHave', guessed: false },
              ])
            }
            onBack={() => setPhase('inputs')}
            onRun={run}
          />
        )}

        {phase === 'running' && <RunningStep step={runStep} />}

        {phase === 'results' && analysis && posting && (
          <ResultsStep
            analysis={analysis}
            posting={posting}
            resumeName={selectedResume ? resumeLabel(selectedResume) : 'Your CV'}
            onRerun={restart}
            onViewSuggestions={() => setPhase('suggestions')}
          />
        )}

        {phase === 'suggestions' && analysis && (
          <SuggestionsStep
            analysis={analysis}
            counted={counted}
            onToggle={(index) =>
              setCounted((current) => {
                const next = new Set(current);
                if (!next.delete(index)) next.add(index);
                return next;
              })
            }
            onBack={() => setPhase('results')}
          />
        )}
      </main>
    </div>
  );
}
