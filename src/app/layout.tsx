import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Nexus Arcade — Enter the multiverse of intelligence', template: '%s · Nexus Arcade' },
  description:
    'One universe. Multiple minds. Infinite possibilities. Connect your AI providers and build a squad that researches, debates, builds, and reviews together.',
  applicationName: 'Nexus Arcade',
  robots: { index: true, follow: true },
};
export const viewport: Viewport = {
  themeColor: '#08090e',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
