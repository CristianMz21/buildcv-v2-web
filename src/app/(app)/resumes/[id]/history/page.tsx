import type { Metadata } from 'next';

import { HistoryScreen } from './HistoryScreen';

export const metadata: Metadata = { title: 'Score history · BuildCv' };

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HistoryScreen resumeId={id} />;
}
