import { Compass } from 'lucide-react';
import { Button, Logo } from '@/components/ui';
export default function NotFound() {
  return (
    <div className="standalone-state">
      <Logo />
      <Compass size={48} />
      <div className="eyebrow">UNcharted territory · 404</div>
      <h1>This portal leads nowhere.</h1>
      <p>The page may have moved, or this mission does not belong to your universe.</p>
      <Button href="/dashboard">Return to your workspace</Button>
    </div>
  );
}
