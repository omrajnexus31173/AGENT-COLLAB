import type { Metadata } from 'next';
import { NetworkServer } from '@/components/network-server';
export const metadata: Metadata = { title: 'Live network' };
export default function LiveNetworkPage() {
  return <NetworkServer />;
}
