import type { Metadata } from 'next';

import { EditorScreen } from './EditorScreen';

export const metadata: Metadata = { title: 'Edit CV · BuildCv' };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorScreen resumeId={id} />;
}
