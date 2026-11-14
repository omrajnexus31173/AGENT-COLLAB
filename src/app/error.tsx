'use client';
import { AlertCircle } from 'lucide-react';
import { Button, Logo } from '@/components/ui';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="standalone-state">
      <Logo />
      <AlertCircle size={44} />
      <div className="eyebrow">A CONNECTION WAS INTERRUPTED</div>
      <h1>Let’s reconnect.</h1>
      <p>
        The workspace could not load. Check that PostgreSQL is running and migrations are applied, then try
        again.
      </p>
      <Button onClick={reset}>Try again</Button>
      <Button href="/" variant="secondary">
        Back to the universe
      </Button>
    </div>
  );
}
