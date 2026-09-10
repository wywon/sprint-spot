// middleware.ts
//
// ⚠️ Edge 런타임에서 돈다. Prisma·Node crypto 를 여기에 들이지 말 것.
//    import 는 next/server 와 lib/adminAuth 두 개까지만.

import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifyToken } from '@/lib/adminAuth';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const ok = await verifyToken(req.cookies.get(ADMIN_COOKIE)?.value);

  // ① 관리자 API — 화면이 아니므로 리다이렉트 대신 401 JSON
  if (pathname.startsWith('/api/admin')) {
    return ok
      ? NextResponse.next()
      : NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // ② 로그인 화면 — 이미 로그인했으면 대시보드로
  if (pathname === '/admin/login') {
    return ok ? NextResponse.redirect(new URL('/admin', req.url)) : NextResponse.next();
  }

  // ③ 나머지 관리자 화면
  if (ok) return NextResponse.next();

  const url = new URL('/admin/login', req.url);
  url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

// ⚠️ 이 목록에 없는 주소는 middleware 가 아예 실행되지 않는다.
//    '/api/:path*' 로 넓히면 손님 앱 3초 폴링이 전부 401 이 되어 화면이 죽는다.
//    반드시 '/api/admin' 까지 적을 것.
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};