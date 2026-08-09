import { redirect } from 'next/navigation';

/**
 * The CV list is the home screen, because it is the one that exists.
 *
 * The source design puts a dashboard here — stats, a score trend, a notification feed. Most of it has
 * no endpoint behind it, so rather than a landing page of placeholders this goes where the work is.
 */
export default function Home(): never {
  redirect('/resumes');
}
