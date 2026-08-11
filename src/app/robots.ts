import type { MetadataRoute } from 'next';

import { SITE_ORIGIN } from '@/lib/site';

/**
 * Rendered per request, because `SITE_ORIGIN` is a deployment-time answer and this file quotes it.
 * Prerendered, it would bake whichever origin the image was built with — measured: a container told
 * otherwise kept advertising the production domain.
 */
export const dynamic = 'force-dynamic';

/**
 * What a crawler may read, now that there is something public to read.
 *
 * THIS FILE EXISTS BECAUSE THE REASON FOR NOT HAVING IT EXPIRED. CLAUDE.md records the `seo` skill
 * being removed on the grounds that "everything but /login and /register is behind a session gate" —
 * true when it was written, and false since the landing page shipped. That page now carries the
 * scoring weights, the bands, the readability sections and eight answered questions, which is the
 * only content this product has that is worth finding.
 *
 * Everything past the session gate is disallowed rather than left to chance. Those routes answer a
 * redirect to /login for a signed-out visitor, so a crawler would spend its budget collecting copies
 * of the sign-in screen under a dozen different URLs — and `/reset-password` carries a token in its
 * query string, which is not a thing to invite into a search index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/analysis', '/resumes', '/settings', '/reset-password'],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
