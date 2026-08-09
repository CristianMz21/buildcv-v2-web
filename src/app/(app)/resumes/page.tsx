import type { Metadata } from 'next';

import { ResumesScreen } from './ResumesScreen';

export const metadata: Metadata = { title: 'Your CVs · BuildCv' };

export default function ResumesPage() {
  return <ResumesScreen />;
}
