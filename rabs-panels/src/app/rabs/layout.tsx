import type { ReactNode } from 'react';
import { RabsShell } from '@/components/rabs/shell';

export default function RabsLayout({ children }: { children: ReactNode }) {
  return <RabsShell>{children}</RabsShell>;
}
