'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * The boundary for one signed-in screen, so a failure does not take the navigation with it.
 *
 * THE ROOT BOUNDARY SITS ABOVE `(app)/layout.tsx`, which is where the sidebar lives. So any exception
 * on any signed-in screen replaced the entire page — sidebar included — with a centred box and a
 * "Try again". A candidate whose CV list threw could not reach Settings, could not sign out, and was
 * left with one button whose only offer was to retry the thing that had just failed.
 *
 * Nested here, the shell survives and the failure stays in the pane that caused it. Everything else
 * on the page keeps working, which is both truer and more useful: one screen is broken, not the app.
 *
 * It names nothing about the error, for the same reason the root boundary does not — `error.message`
 * on a client boundary is whatever threw, and this product's responses quote a candidate's own CV.
 * The digest is the identifier worth showing, and it now maps to a real line: `onRequestError` writes
 * one per server-side failure.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console only, and only in the browser it happened in. There is still no client-side sink, and
    // inventing one here would ship CV content to a third party.
    console.error(error);
  }, [error]);

  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <h1 style={{ margin: '0 0 8px', font: '700 18px var(--font)', letterSpacing: '-0.01em' }}>
        This screen could not load
      </h1>
      <p style={{ margin: '0 0 20px', font: '400 14px/1.6 var(--font)', color: 'var(--fg-muted)' }}>
        Nothing you had saved is affected, and the rest of the app still works.
      </p>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btnPrimary" onClick={reset}>
          Try again
        </button>
        {/* The way out the root boundary could not offer, because it had removed the navigation. */}
        <Link href="/resumes" className="btn">
          Your CVs
        </Link>
      </div>

      {error.digest && (
        <p style={{ marginTop: 20, font: '400 12px var(--font-mono)', color: 'var(--fg-faint)' }}>
          {error.digest}
        </p>
      )}
    </div>
  );
}
