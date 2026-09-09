// app/api/reservations/[id]/cancel/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Vercel 은 UTC 라 서버 시각을 KST 로 고정한다 */
function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 16).replace('T', ' ')   // 'YYYY-MM-DD HH:MM'
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    const phone = body?.phone

    if (typeof phone !== 'string' || !phone) {
      return NextResponse.json(
        { error: 'PHONE_REQUIRED', message: '연락처가 필요합니다.' },
        { status: 400 },
      )
    }

    const res = await prisma.reservation.findUnique({ where: { id } })
    if (!res) {
      return NextResponse.json(
        { error: 'RESERVATION_NOT_FOUND', message: '예약을 찾을 수 없어요.' },
        { status: 404 },
      )
    }

    // 숫자만 비교 — 화면이 하이픈을 붙여 보내도 통과시킨다
    const digits = (v: string) => v.replace(/\D/g, '')
    if (digits(res.phone) !== digits(phone)) {
      return NextResponse.json(
        { error: 'PHONE_MISMATCH', message: '예약자 정보가 일치하지 않아요.' },
        { status: 403 },
      )
    }

    // 취소 가능한 상태는 'upcoming' 하나뿐이다.
    // 나머지는 각각 다른 이유이므로 메시지를 나눈다.
    if (res.status === 'canceled') {
      return NextResponse.json(
        { error: 'ALREADY_CANCELLED', message: '이미 취소된 예약이에요.' },
        { status: 409 },
      )
    }

    if (res.status === 'noshow') {
      return NextResponse.json(
        {
          error: 'ALREADY_NOSHOW',
          message: '방문하지 않은 예약으로 처리되었어요. 매장으로 연락해 주세요.',
        },
        { status: 409 },
      )
    }

    if (res.status === 'seated' || res.status === 'done') {
      return NextResponse.json(
        { error: 'ALREADY_VISITED', message: '이미 방문한 예약이에요.' },
        { status: 409 },
      )
    }

    // 예약 시각이 지났으면 손님이 못 취소한다
    if (`${res.date} ${res.time}` <= kstNow()) {
      return NextResponse.json(
        {
          error: 'TOO_LATE_TO_CANCEL',
          message: '예약 시간이 지나 취소할 수 없어요. 매장으로 연락해 주세요.',
        },
        { status: 409 },
      )
    }

    // updateMany + status 조건 — 읽은 뒤 쓰기 전 사이에
    // 자동 미방문 스윕이 상태를 바꿨다면 여기서 0건이 되어 덮어쓰지 않는다
    const updated = await prisma.reservation.updateMany({
      where: { id, status: 'upcoming' },
      data: { status: 'canceled' },
    })

    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'STATUS_CHANGED', message: '예약 상태가 변경되어 취소할 수 없어요.' },
        { status: 409 },
      )
    }

    await prisma.activityLog.create({
      data: {
        storeId: res.storeId,
        who: '시스템',
        msg: `${res.date} ${res.time} ${res.name}님 예약 취소`,
        tone: 'warn',
      },
    })

    return NextResponse.json({
      id,
      status: 'canceled',
      cancelledAt: Date.now(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[POST /api/reservations/[id]/cancel]', e)
    return NextResponse.json(
      { error: 'CANCEL_FAILED', message: '예약을 취소하지 못했습니다.' },
      { status: 500 },
    )
  }
}