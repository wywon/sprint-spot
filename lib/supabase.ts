import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const RECEIPT_BUCKET = 'receipts';

let cached: SupabaseClient | null = null;

/**
 * 서버 전용 Supabase 클라이언트.
 *
 * ★ 모듈 최상단에서 만들지 않고 호출 시점에 만든다.
 *   최상단에서 만들면 빌드 타임에 환경변수가 없을 때 Vercel 빌드가 통째로 깨진다.
 *
 * ★ service_role 키를 쓰므로 이 파일은 절대 클라이언트 컴포넌트에서 import 하지 않는다.
 *   API 라우트(app/api/**)에서만 부른다.
 */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다');
  }

  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/**
 * 비공개 버킷의 임시 열람 주소 (1시간).
 * 만료되므로 DB에 저장하지 않고 조회할 때마다 새로 발급한다.
 */
export async function receiptSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .storage.from(RECEIPT_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}