// lib/adminAuth.ts
//
// ⚠️ 이 파일은 middleware.ts 가 쓴다 = Edge 런타임에서 돈다.
//    Edge 에는 Prisma 도, Node 의 crypto 도 올라가지 않는다.
//    그래서 이 파일의 import 문은 0줄이어야 한다. 절대 늘리지 말 것.

export const ADMIN_COOKIE = 'spot_admin';
export const MAX_AGE = 60 * 60 * 12; // 12시간(초)

const enc = new TextEncoder();

/** 서명 결과(바이트)를 URL 에 넣어도 안전한 글자로 바꾼다 */
function b64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 비밀키로 서명을 만든다. crypto.subtle 은 브라우저·Edge·Node 어디서나 된다 */
async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/**
 * 두 문자열이 같은지 확인한다.
 * a === b 를 쓰면 다른 글자가 나오는 즉시 멈춰서,
 * 걸린 시간으로 "앞 3글자는 맞았구나" 를 유추당할 수 있다.
 * 그래서 길이가 같으면 끝까지 다 비교한다.
 */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 로그인 성공 시 쿠키에 넣을 출입증을 만든다 */
export async function createToken() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET 환경변수가 없습니다.');
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${exp}.${await hmac(exp, secret)}`;
}

/**
 * 출입증이 진짜이고 아직 안 지났는지 확인한다.
 * 애매하면 무조건 false. 설정이 빠져도 통과시키지 않는다.
 */
export async function verifyToken(token?: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token) return false;

  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;

  try {
    if (!safeEqual(sig, await hmac(exp, secret))) return false; // 위조
    return Number(exp) > Date.now();                            // 만료
  } catch {
    return false;
  }
}

/**
 * 로그인 후 돌아갈 주소를 검사한다.
 * ?next=https://evil.com 같은 걸로 외부 사이트에 튕기지 않게 막는다.
 */
export function safeNext(next: string | undefined) {
  if (!next) return '/admin';
  if (!next.startsWith('/admin')) return '/admin';
  if (next.startsWith('//')) return '/admin'; // //evil.com 은 외부 주소다
  return next;
}