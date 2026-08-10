import styles from './legal.module.css';

/**
 * A fact nobody has supplied yet, rendered so it cannot be mistaken for prose.
 *
 * The alternative was leaving a blank, and a blank in a privacy policy reads as a finished sentence
 * with a typo. This reads as what it is: a page that is not ready.
 */
export function Unset({ what }: { what: string }) {
  return <mark className={styles.unset}>[ {what} — not yet supplied ]</mark>;
}
