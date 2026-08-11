import { Info, Warning } from '@/components/icons';

import styles from './analysis.module.css';

const VARIANTS = {
  info: styles.noticeInfo,
  warn: styles.noticeWarn,
  error: styles.noticeError,
} as const;

export function Notice({
  variant = 'info',
  reference,
  children,
}: {
  variant?: keyof typeof VARIANTS;
  /**
   * The id this failure was logged under, when the response carried one.
   *
   * IT LIVES HERE RATHER THAN AT EACH CALL SITE, and that is what closed a gap the first version
   * shipped with. The flow's costly failure — the scoring run, after a posting has been pasted and
   * waited on — surfaces in the requirements step, which draws its own `Notice`; only the inputs
   * banner had been given the reference, so the one failure most worth looking up was the one
   * without an id. Putting it on the shared component is what makes "every error notice can carry
   * one" true by construction instead of by remembering.
   */
  reference?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.notice} ${VARIANTS[variant]}`}
      role={variant === 'error' ? 'alert' : undefined}
    >
      {variant === 'info' ? <Info size={15} /> : <Warning size={15} />}
      <div>
        {children}
        {reference && (
          <span className={styles.reference}>
            Reference <code>{reference}</code>
          </span>
        )}
      </div>
    </div>
  );
}
