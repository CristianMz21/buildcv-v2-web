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
 * that is knowable at build time, and a build that failed over a metadata base would fail for
 * nothing.
 */
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://buildcv.cristianarellano.com';
