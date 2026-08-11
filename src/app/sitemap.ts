import type { MetadataRoute } from 'next';

import { SITE_ORIGIN } from '@/lib/site';

/**
 * Rendered per request, because `SITE_ORIGIN` is a deployment-time answer and this file quotes it.
 * Prerendered, it would bake whichever origin the image was built with — measured: a container told
 * otherwise kept advertising the production domain.
 */
export const dynamic = 'force-dynamic';

/**
 * The pages worth finding — which is fewer than the pages a crawler is allowed to read.
 *
 * `robots.ts` permits `/login` and `/register`; this does not list them, and the difference is
 * deliberate. A sitemap is a recommendation about what matters, and a sign-up form ranking above the
 * page that explains what it signs you up for is a worse result for the person searching than no
 * result at all. They stay crawlable because somebody searching the product by name should still be
 * able to reach them.
 *
 * The two legal pages are here because they answer questions people genuinely search for before
 * handing a stranger their employment history, and because this product's answers to those questions
 * are unusually specific — where the data physically sits, what the retention windows actually are,
 * which authority to complain to.
 *
 * `lastModified` is intentionally absent rather than stamped with the build time. A build does not
 * change what a page says, and a sitemap that claims every page changed on every deploy is a sitemap
 * a crawler learns to stop believing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_ORIGIN, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_ORIGIN}/legal/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_ORIGIN}/legal/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
