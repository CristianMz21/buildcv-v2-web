import type { Metadata } from 'next';

import { ReadabilityScreen } from './ReadabilityScreen';

export const metadata: Metadata = { title: 'Readability' };

export default async function ReadabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReadabilityScreen resumeId={id} />;
}
