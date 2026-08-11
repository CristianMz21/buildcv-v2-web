import type { Metadata } from 'next';

import { ImportScreen } from './ImportScreen';

export const metadata: Metadata = { title: 'Import a CV' };

export default function ImportPage() {
  return <ImportScreen />;
}
