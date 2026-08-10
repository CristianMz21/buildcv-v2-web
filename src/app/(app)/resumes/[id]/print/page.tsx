import type { Metadata } from 'next';

import { PrintScreen } from './PrintScreen';

export const metadata: Metadata = { title: 'Print CV · BuildCv' };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrintScreen resumeId={id} />;
}
