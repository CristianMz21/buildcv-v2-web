'use client';

/**
 * The last boundary: a failure in the root layout itself, where `error.tsx` cannot run because the
 * layout that would host it is the thing that broke. It has to render its own `<html>`.
 *
 * Deliberately styleless — the stylesheet is loaded by the layout that just failed, so anything
 * relying on it would render unstyled anyway. Inline is the only thing that can be trusted here.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 520,
          margin: '0 auto',
          padding: '80px 24px',
          textAlign: 'center',
          color: '#111827',
        }}
      >
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>BuildCv could not start</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#6b7280', margin: '0 0 20px' }}>
          Reload the page. If it keeps happening, the service is having trouble.
        </p>
        {error.digest && <p style={{ fontSize: 12, color: '#9ca3af' }}>{error.digest}</p>}
      </body>
    </html>
  );
}
