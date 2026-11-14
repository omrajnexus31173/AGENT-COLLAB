import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { Loading } from '@/components/ui';
export const metadata: Metadata = { title: 'Sign in' };
export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
