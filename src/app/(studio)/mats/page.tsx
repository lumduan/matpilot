import type { Metadata } from 'next';
import { MatsApp } from '@/components/mats/MatsApp';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Mats – ${PROJECT_NAME}`,
  description:
    'Put a competition mat in your browser at real size from its PDF, mark the start area and the targets, place your robot on it, and measure distances. Nothing is uploaded.',
};

export default function MatsPage() {
  return <MatsApp />;
}
