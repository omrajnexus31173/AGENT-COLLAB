import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { Loading } from '@/components/ui';
export const metadata: Metadata = { title: 'Create your workspace' };
export default function SignupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
