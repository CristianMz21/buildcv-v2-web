import { RESUME_SECTIONS, type ResumeSection } from './contracts';

/**
 * Whether a path segment names one of the CV's ten collections.
 *
 * THE SEGMENT COMES FROM THE URL, so this is a gate rather than a convenience. Without it the route
 * handlers would forward whatever a caller put there straight onto the API path, turning the BFF into
 * an open proxy for any `/v1/resumes/{id}/…` route a future release adds — including ones this client
 * has no business reaching. A closed list is the only shape that cannot be widened by accident.
 */
export function isResumeSection(value: string): value is ResumeSection {
  return (RESUME_SECTIONS as readonly string[]).includes(value);
}
