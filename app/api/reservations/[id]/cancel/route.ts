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

    if (res.status === 'canceled') {
      return NextResponse.json(
        { error: 'ALREADY_CANCELLED', message: '이미 취소된 예약이에요.' },
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

    const updated = await prisma.reservation.update({
      where: { id },
      data: { status: 'canceled' },
    })

    await prisma.activityLog.create({
      data: {
        storeId: res.storeId,
        who: '시스템',
        msg: `${res.date} ${res.time} ${res.name}님 예약 취소`,
        tone: 'warn',
      },
    })

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
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