import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <h1 style={{ margin: '0 0 8px', font: '700 22px var(--font)', letterSpacing: '-0.02em' }}>
        Not found
      </h1>
      <p style={{ margin: '0 0 20px', font: '400 14px/1.6 var(--font)', color: 'var(--fg-muted)' }}>
        That page does not exist. If you followed a link to a CV, it may have been deleted.
      </p>
      <Link href="/resumes" className="btn btnPrimary">
        Your CVs
      </Link>
    </main>
  );
}
