import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  if (!request.cookies.get('nexus.session')?.value) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/connections/:path*',
    '/agents/:path*',
    '/missions/:path*',
    '/network/:path*',
    '/settings/:path*',
    '/profile/:path*',
  ],
};
