// app/api/reservations/route.ts
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** SPOT-0910-4821 — 사람이 읽고 QR로 찍는 값 */
function makeCode(date: string, phone: string, time: string) {
  const mmdd = date.slice(5).replace('-', '')
  // 난수 대신 입력값으로 만든다 (같은 예약엔 같은 코드)
  let h = 0
  for (const ch of phone + time + date) h = (h * 31 + ch.charCodeAt(0)) % 10000
  return `SPOT-${mmdd}-${String(h).padStart(4, '0')}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: '요청 형식이 올바르지 않습니다.' },
        { status: 400 },
      )
    }

    const { storeId, date, time, people, seatType, name, phone, request, noShowAgreed } = body

    if (noShowAgreed !== true) {
      return NextResponse.json(
        { error: 'NOSHOW_NOT_AGREED', message: '노쇼 방지 정책에 동의해 주세요.' },
        { status: 400 },
      )
    }
    if (typeof phone !== 'string' || !/^\d{11}$/.test(phone)) {
      return NextResponse.json(
        { error: 'INVALID_PHONE', message: '연락처를 다시 확인해 주세요.' },
        { status: 400 },
      )
    }
    if (
      typeof storeId !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ||
      !/^\d{2}:\d{2}$/.test(time ?? '') ||
      !Number.isInteger(people) || people < 1 ||
      typeof name !== 'string' || !name.trim()
    ) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: '예약 정보가 올바르지 않습니다.' },
        { status: 400 },
      )
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { tables: true },
    })
    if (!store) {
      return NextResponse.json(
        { error: 'STORE_NOT_FOUND', message: '매장 정보를 찾을 수 없어요.' },
        { status: 404 },
      )
    }
    if (!store.partner) {
      return NextResponse.json(
        { error: 'NOT_PARTNER_STORE', message: '이 매장은 예약을 받고 있지 않아요.' },
        { status: 409 },
      )
    }

    // C10과 같은 기준으로 센다
    const capacity = store.tables.filter(
      (t) => t.seats >= people && t.status !== 'disabled',
    ).length

    const created = await prisma.$transaction(async (tx) => {
      const used = await tx.reservation.count({
        where: { storeId, date, time, status: { in: ['upcoming', 'seated'] } },
      })
      if (used >= capacity) {
        throw new Error('TIME_UNAVAILABLE')
      }
      return tx.reservation.create({
        data: {
          storeId, date, time,
          party: people,
          seatType: typeof seatType === 'string' && seatType ? seatType : '상관없음',
          name: name.trim(),
          phone,
          memo: typeof request === 'string' ? request : '',
          status: 'upcoming',
        },
      })
    })

    return NextResponse.json({
      id: created.id,
      code: makeCode(date, phone, time),
      status: created.status,
      storeId: created.storeId,
      storeName: store.name,
      date: created.date,
      time: created.time,
      people: created.party,
      seatType: created.seatType,
      name: created.name,
      phone: created.phone,
      createdAt: created.createdAt.getTime(),
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof Error && e.message === 'TIME_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'TIME_UNAVAILABLE', message: '방금 마감된 시간이에요. 다른 시간을 골라 주세요.' },
        { status: 409 },
      )
    }
    // unique 제약 위반 — 같은 사람이 같은 시간에 두 번
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { error: 'DUPLICATE_RESERVATION', message: '같은 시간에 이미 예약이 있어요.' },
        { status: 409 },
      )
    }
    console.error('[POST /api/reservations]', e)
    return NextResponse.json(
      { error: 'RESERVE_FAILED', message: '예약을 처리하지 못했습니다.' },
      { status: 500 },
    )
  }
}

/** 스키마에 cancelled 가 없어 canceled 로 맞춘다 (README 표기와 다름) */
const UPCOMING = ['upcoming', 'seated'] as const

export async function GET(req: Request) {
  try {
    const phone = new URL(req.url).searchParams.get('phone')

    // phone 이 없으면 전체를 주지 않는다 — 남의 예약이 다 보인다
    if (!phone) {
      return NextResponse.json(
        { error: 'PHONE_REQUIRED', message: '연락처가 필요합니다.' },
        { status: 400 },
      )
    }

    const rows = await prisma.reservation.findMany({
      where: { phone },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      include: { store: true },
    })

    const upcoming = rows
      .filter((r) => UPCOMING.includes(r.status as 'upcoming' | 'seated'))
      .map((r) => ({
        id: r.id,
        code: makeCode(r.date, r.phone, r.time),
        status: r.status,
        storeId: r.storeId,
        storeName: r.store.name,
        storeImage: r.store.hero ?? '',
        storeAddress: r.store.addr ?? '',
        date: r.date,
        time: r.time,
        people: r.party,
        seatType: r.seatType,
        name: r.name,
        phone: r.phone,
        request: r.memo,
      }))

    const past = rows
      .filter((r) => !UPCOMING.includes(r.status as 'upcoming' | 'seated'))
      .map((r) => ({
        id: r.id,                       // past 에는 code 를 안 보낸다 (QR 없음)
        status: r.status,
        storeId: r.storeId,
        storeName: r.store.name,
        date: r.date,
        time: r.time,
        people: r.party,
        visitedAt: r.createdAt.getTime(),
        receiptUploaded: r.receipt,
        reviewWritten: r.reviewed,
      }))

    return NextResponse.json(
      { upcoming, past },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[GET /api/reservations]', e)
    return NextResponse.json(
      { error: 'RESERVATIONS_FETCH_FAILED', message: '예약 목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}