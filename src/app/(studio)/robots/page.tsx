import type { Metadata } from 'next';
import { RobotsApp } from '@/components/robots/RobotsApp';
import { PROJECT_NAME } from '@/lib/project';

export const metadata: Metadata = {
  title: `Robots – ${PROJECT_NAME}`,
  description:
    'Describe your LEGO® SPIKE Prime robot: its size, wheels, motors and sensors. See it to scale, how fast it drives, how much room it needs to turn, and whether it fits competition rules.',
};

export default function RobotsPage() {
  return <RobotsApp />;
}
