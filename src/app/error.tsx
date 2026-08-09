'use client';

import { useEffect } from 'react';

/**
 * The boundary for anything a screen throws.
 *
 * IT NAMES NOTHING ABOUT THE FAILURE. `error.message` on a client boundary is whatever threw — a
 * fetch URL, a field path, a fragment of a response — and this product's responses quote a
 * candidate's own CV. A digest is the identifier to quote instead: it maps to the server log without
 * putting anything from the CV on screen.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console only, and only in the browser the failure happened in. Nothing is reported onward:
    // there is no error sink configured, and inventing one here would ship CV content to a third
    // party.
    console.error(error);
  }, [error]);

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <h1 style={{ margin: '0 0 8px', font: '700 22px var(--font)', letterSpacing: '-0.02em' }}>
        Something went wrong
      </h1>
      <p style={{ margin: '0 0 20px', font: '400 14px/1.6 var(--font)', color: 'var(--fg-muted)' }}>
        The page could not finish loading. Nothing you had saved is affected.
      </p>
      <button type="button" className="btn btnPrimary" onClick={reset}>
        Try again
      </button>
      {error.digest && (
        <p style={{ marginTop: 20, font: '400 12px var(--font-mono)', color: 'var(--fg-faint)' }}>
          {error.digest}
        </p>
      )}
    </main>
  );
}
