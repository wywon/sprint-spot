// app/api/stores/[id]/times/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** 라스트오더 — 스키마에 필드가 없어 마감 60분 전으로 계산한다 */
const LAST_ORDER_MIN = 60
const STEP_MIN = 30

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** 서버가 UTC(Vercel)든 KST(로컬)든 같은 답이 나오도록 한국 시각으로 고정 */
function kstNow() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return {
    date: d.toISOString().slice(0, 10),          // 'YYYY-MM-DD'
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const date = url.searchParams.get('date') ?? ''
    const people = Number(url.searchParams.get('people') ?? '2')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return NextResponse.json(
        { error: 'INVALID_DATE', message: '날짜 형식이 올바르지 않습니다.' },
        { status: 400 },
      )
    }
    if (!Number.isInteger(people) || people < 1) {
      return NextResponse.json(
        { error: 'INVALID_DATE', message: '인원이 올바르지 않습니다.' },
        { status: 400 },
      )
    }

    const store = await prisma.store.findUnique({
      where: { id },
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

    // 그 인원이 앉을 수 있는 테이블 수
    const capacity = store.tables.filter(
      (t) => t.seats >= people && t.status !== 'disabled',
    ).length

    // 그 날짜의 살아 있는 예약을 시간별로 센다
    const reservations = await prisma.reservation.findMany({
      where: { storeId: id, date, status: { in: ['upcoming', 'seated'] } },
      select: { time: true },
    })
    const takenAt = new Map<string, number>()
    for (const r of reservations) {
      takenAt.set(r.time, (takenAt.get(r.time) ?? 0) + 1)
    }

    const [openAt = '', closeAt = ''] = (store.open ?? '').split('-').map((v) => v.trim())
    if (!openAt || !closeAt) {
      return NextResponse.json({ date, people, times: [] })
    }

    const now = kstNow()
    const isToday = date === now.date

    const start = toMin(openAt)
    const lastOrder = toMin(closeAt) - LAST_ORDER_MIN

    const times: { time: string; available: boolean }[] = []
    for (let m = start; m <= lastOrder; m += STEP_MIN) {
      // 오늘이면 지난 시간은 false 로 남기지 않고 목록에서 뺀다
      if (isToday && m <= now.minutes) continue

      const hhmm = toHHMM(m)
      times.push({
        time: hhmm,
        available: capacity - (takenAt.get(hhmm) ?? 0) > 0,
      })
    }

    return NextResponse.json(
      { date, people, times },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[GET /api/stores/[id]/times]', e)
    return NextResponse.json(
      { error: 'TIMES_FETCH_FAILED', message: '예약 가능 시간을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}