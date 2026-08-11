/**
 * The one hostname this product is published under.
 *
 * HARDCODED ON PURPOSE, and this is the one place in the repo where hardcoding a hostname is the
 * correct answer rather than a shortcut. A canonical origin exists precisely to say "whatever
 * hostname you reached this page by, THIS is the address of it" — resolving it from the incoming
 * request would defeat the thing it is for, because the duplicate-content problem canonical URLs
 * solve is two hostnames serving one page.
 *
 * That is not hypothetical here: the app answers on `buildcv.cristianarellano.com` and on the
 * Container Apps hostname underneath it. The origin is locked to Cloudflare and refuses direct
 * traffic with a 403 — asserted by `verify-deployment.sh` — so today only one of the two is
 * reachable at all. The canonical is written down anyway, because "unreachable" is a property of the
 * current network configuration and a canonical URL is a property of the product.
 *
 * The override exists for a preview deployment, and it is deliberately NOT required: a missing value
 * falls back rather than throwing, because unlike `BUILDCV_API_ORIGIN` this one has a right answer
 * and a build that failed over a metadata base would fail for nothing.
 *
 * `BUILDCV_SITE_ORIGIN`, NOT `NEXT_PUBLIC_SITE_ORIGIN`, and the rename is the whole point. Next
 * replaces every `process.env.NEXT_PUBLIC_*` reference with a literal AT BUILD TIME — in the server
 * bundle too — so the previous name could never have been a deployment-time override at all. Setting
 * it on a running container did nothing, silently: measured, `robots.txt` kept advertising the
 * production domain while the variable said otherwise.
 *
 * The rename is only half the fix. `robots.ts` and `sitemap.ts` were also statically prerendered, so
 * even a correctly-named variable would have been baked. Both are `force-dynamic` now — for the same
 * reason the privacy page is, and after the same mistake: a value that varies by deployment cannot be
 * answered at the moment the image is built. This is the second time tonight that pattern has cost
 * something, which is why it is written here rather than fixed quietly.
 */
export const SITE_ORIGIN = process.env.BUILDCV_SITE_ORIGIN ?? 'https://buildcv.cristianarellano.com';
