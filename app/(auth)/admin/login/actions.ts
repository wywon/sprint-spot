// app/(auth)/admin/login/actions.ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, MAX_AGE, createToken, safeEqual, safeNext } from '@/lib/adminAuth';

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  const next = safeNext(String(formData.get('next') ?? ''));

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !process.env.AUTH_SECRET) {
    return { error: '서버 설정이 완료되지 않았어요. 담당자에게 문의해 주세요.' };
  }

  // 비밀번호를 자동으로 계속 넣어보는 공격을 늦춘다
  await new Promise((r) => setTimeout(r, 400));

  if (!safeEqual(password, expected)) {
    return { error: '비밀번호가 올바르지 않아요.' };
  }

  const jar = await cookies(); // Next 15 에서 cookies() 는 await 가 필요하다
  jar.set(ADMIN_COOKIE, await createToken(), {
    httpOnly: true,                                  // JS 로 못 읽는다
    sameSite: 'lax',                                 // 다른 사이트에서 못 쓴다
    secure: process.env.NODE_ENV === 'production',   // 배포에선 https 만
    path: '/',
    maxAge: MAX_AGE,
  });

  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect('/admin/login');
}