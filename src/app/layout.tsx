import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { SITE_ORIGIN } from '@/lib/site';

import './globals.css';

// Self-hosted by next/font at build time. The source design pulled Inter from fonts.googleapis.com
// on every page load, which is a third-party request on a page that renders a candidate's CV data.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

/**
 * What this product looks like from outside itself.
 *
 * EVERY PAGE ALREADY HAD A TITLE AND NONE OF THEM HAD ANY OF THIS, so a link to the landing page
 * pasted into LinkedIn, WhatsApp or Slack unfurled as a bare URL — no name, no sentence, nothing to
 * click. For a product whose stated goal is to be found and shared, that is the cheapest loss in the
 * repo: the copy already existed on the page, it simply was not declared where a crawler reads it.
 *
 * `metadataBase` is what makes the relative URLs below resolve; without it Next warns and every
 * `og:image` and canonical is emitted relative, which no unfurler follows.
 *
 * The default `robots` says index-and-follow explicitly rather than by omission, because the pages
 * that must NOT be indexed override it themselves — a gate that is on by default is one nobody has
 * to remember, and `robots.ts` disallows those paths besides.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  // The landing page sets its own full title; everything else appends. Without the template each
  // screen was repeating "· BuildCv" by hand, which is a convention that survives exactly until
  // somebody adds a page and forgets.
  title: { default: 'BuildCv', template: '%s · BuildCv' },
  description: 'Deterministic resume match and readability scoring.',
  applicationName: 'BuildCv',
  openGraph: {
    type: 'website',
    siteName: 'BuildCv',
    locale: 'en',
    url: SITE_ORIGIN,
    title: 'BuildCv — see how your CV scores against a real job posting',
    description:
      'Score your CV against one job posting and get the number, the weights behind it, and what to fix. Fixed rules, no AI, no card.',
  },
  // Summary rather than summary_large_image, because there is no image yet and a large-image card
  // with nothing to show renders worse than a small one that never promised a picture.
  twitter: {
    card: 'summary',
    title: 'BuildCv — see how your CV scores against a real job posting',
    description: 'Fixed-rule CV scoring against one job posting. Free, no card, no AI.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
