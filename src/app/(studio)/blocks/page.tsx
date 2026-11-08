import type { Metadata } from 'next';
import { BlocksApp } from '@/components/blocks/BlocksApp';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Blocks – ${PROJECT_NAME}`,
  description:
    'Program a LEGO® SPIKE Prime hub with Pybricks firmware by snapping blocks together, see the Python they make, watch what is plugged into each port, and follow the output as text and as a live plot.',
};

export default function BlocksPage() {
  return <BlocksApp />;
}
