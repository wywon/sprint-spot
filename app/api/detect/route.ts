// app/api/detect/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** D가 보낼 수 있는 값 — offline/manual/disabled 는 서버·관리자 영역이라 거부한다 */
const ALLOWED = ['available', 'occupied', 'unknown'] as const
type Allowed = (typeof ALLOWED)[number]

export async function POST(req: Request) {
  try {
    // 1. 키 확인
    const key = req.headers.get('x-spot-key')
    if (!key || key !== process.env.DETECT_API_KEY) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: '인증 키가 올바르지 않습니다.' },
        { status: 401 },
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.storeId !== 'string' || !Array.isArray(body.slots)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'storeId 와 slots 가 필요합니다.' },
        { status: 400 },
      )
    }

    const storeId: string = body.storeId
    const detectedAt = new Date(
      typeof body.detectedAt === 'number' ? body.detectedAt : Date.now(),
    )

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return NextResponse.json(
        { error: 'STORE_NOT_FOUND', message: '매장 정보를 찾을 수 없어요.' },
        { status: 404 },
      )
    }

    // 이 매장의 주차면을 code 로 한 번에 찾아 둔다 (면마다 조회하면 요청이 20번 나간다)
    const slots = await prisma.parkingSlot.findMany({ where: { storeId } })
    const byCode = new Map(slots.map((s) => [s.code, s]))

    const now = Date.now()
    const unknownCodes: string[] = []   // DB에 없는 코드 — D의 설정 오타
    const ignored: string[] = []        // 수동 지정 중이라 최종 상태엔 반영 안 됨
    const ops = []
    let updated = 0

    for (const item of body.slots) {
      const code = item?.code
      const status = item?.status
      if (typeof code !== 'string') continue

      // 허용되지 않은 값은 건너뛴다 (전체를 실패시키지 않는다)
      if (!ALLOWED.includes(status as Allowed)) {
        unknownCodes.push(code)
        continue
      }

      const slot = byCode.get(code)
      if (!slot) {
        unknownCodes.push(code)
        continue
      }

      // 수동 지정이 아직 살아 있으면 센서 값이 최종 상태로 안 보인다
      const manualAlive =
        slot.manualStatus !== null &&
        slot.manualUntil !== null &&
        slot.manualUntil.getTime() > now
      if (manualAlive) ignored.push(code)

      ops.push(
        prisma.parkingSlot.update({
          where: { storeId_code: { storeId, code } },
          data: {
            autoStatus: status as Allowed,
            lastSeenAt: detectedAt,
            // 만료된 수동 지정은 이때 정리한다
            ...(manualAlive ? {} : { manualStatus: null, manualUntil: null, manualBy: null }),
          },
        }),
      )

      ops.push(
        prisma.sensorLog.create({
          data: { storeId, slotCode: code, status: status as Allowed, detectedAt },
        }),
      )

      updated++
    }

    // 매장의 주차 갱신 시각도 올린다 (GET /api/stores 의 parking.updated)
    ops.push(
      prisma.store.update({
        where: { id: storeId },
        data: { parkingUpdated: detectedAt, sensor: 'online' },
      }),
    )

    await prisma.$transaction(ops)

    return NextResponse.json(
      { ok: true, updated, ignored, unknownCodes },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[POST /api/detect]', e)
    return NextResponse.json(
      { error: 'DETECT_FAILED', message: '센서 데이터를 처리하지 못했습니다.' },
      { status: 500 },
    )
  }
}