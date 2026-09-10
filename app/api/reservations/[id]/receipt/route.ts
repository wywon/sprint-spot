import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin, receiptSignedUrl, RECEIPT_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';        // Edge 아님 — Buffer 를 쓴다
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

/**
 * GET /api/reservations/[id]/receipt?phone=01012345678
 * 인증 여부와 썸네일 주소를 돌려준다.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const phone = digits(req.nextUrl.searchParams.get('phone'));

  const res = await prisma.reservation.findUnique({ where: { id } });
  if (!res) return fail(404, 'NOT_FOUND', '예약을 찾을 수 없어요');
  if (digits(res.phone) !== phone) {
    return fail(403, 'FORBIDDEN', '예약자 정보가 일치하지 않아요');
  }

  // receipt 는 true 인데 receiptPath 가 없을 수 있다 (seed 데이터).
  // 그 경우 url 만 null 로 내려보내고 인증 자체는 유효하게 둔다.
  return NextResponse.json({
    receipt: res.receipt,
    path: res.receiptPath,
    url: res.receiptPath ? await receiptSignedUrl(res.receiptPath) : null,
    uploadedAt: res.receiptAt,
  });
}

/**
 * POST /api/reservations/[id]/receipt
 * multipart/form-data — file, phone
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'BAD_BODY', '사진을 읽지 못했어요');
  }

  const file = form.get('file');
  const phone = digits(form.get('phone'));

  if (!(file instanceof File) || file.size === 0) {
    return fail(400, 'NO_FILE', '사진 파일이 없어요');
  }
  if (!OK_TYPES.has(file.type)) {
    return fail(415, 'BAD_TYPE', '사진 파일(JPG, PNG)만 올릴 수 있어요');
  }
  if (file.size > MAX_BYTES) {
    return fail(413, 'TOO_LARGE', '사진이 너무 커요. 5MB 이하로 올려주세요');
  }

  const res = await prisma.reservation.findUnique({ where: { id } });
  if (!res) return fail(404, 'NOT_FOUND', '예약을 찾을 수 없어요');
  if (digits(res.phone) !== phone) {
    return fail(403, 'FORBIDDEN', '예약자 정보가 일치하지 않아요');
  }
  // ★ 방문 완료 상태값 이름을 enum ReservationStatus 에 맞춰 확인할 것
  if (res.status !== 'done') {
    return fail(409, 'NOT_VISITED', '방문이 완료된 뒤에 영수증을 올릴 수 있어요');
  }

  const path = `${id}/${Date.now()}.${EXT[file.type]}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin()
    .storage.from(RECEIPT_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (error) {
    console.error('[receipt upload]', error);
    return fail(502, 'STORAGE_FAILED', '업로드에 실패했어요. 잠시 후 다시 시도해 주세요');
  }

  const prev = res.receiptPath;

  await prisma.reservation.update({
    where: { id },
    data: {
      receipt: true,        // 리뷰쓰기 게이트 — 기존 계약 유지
      receiptPath: path,
      // 프로젝트 관례: Vercel 이 UTC 라서 KST 보정 (TZ=Asia/Seoul 적용되면 정리 대상)
      receiptAt: new Date(Date.now() + 9 * 60 * 60 * 1000),
    },
  });

  // ★ DB 갱신이 성공한 뒤에 이전 파일을 지운다. 순서가 반대면 유실 위험.
  if (prev && prev !== path) {
    await supabaseAdmin()
      .storage.from(RECEIPT_BUCKET)
      .remove([prev])
      .catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    receipt: true,
    path,
    url: await receiptSignedUrl(path),
  });
}