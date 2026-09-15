// app/api/detect/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SLOT } from '@/lib/tokens'
import { SENSOR_OFFLINE_MS } from '@/lib/status'

export const dynamic = 'force-dynamic'

/** D가 보낼 수 있는 값 — offline/manual/disabled 는 서버·관리자 영역이라 거부한다 */
const ALLOWED = ['available', 'occupied', 'unknown'] as const
type Allowed = (typeof ALLOWED)[number]

/**
 * [b9] 변경 로그 적재
 * ─────────────────────────────────────────────────────────────
 * 관리자 「센서 감지·변경 로그」 패널의 부제는 "센서가 보고한 변화와 손으로 지정한 기록"인데
 * 그동안 센서 쪽이 전부 거짓이었다. SensorLog 에만 쌓고 ActivityLog 에는 아무것도 안 남겼다.
 *
 * ★ 들어온 것을 다 적지 않는다 — 직전 값과 달라진 면만 적는다
 *   중계서버는 상태가 바뀔 때만 보내지만 60초 하트비트가 있고,
 *   scripts/fake-sensor.mjs 는 매번 10면을 전부 보낸다.
 *   전부 적으면 1.2초마다 10줄 = 하루 70만 줄이다. 걸러내는 건 서버 몫이다.
 *   (SensorLog 는 지금처럼 전부 적는다. 그건 통계용 원본이라 성격이 다르다)
 *
 * ★ 절반 넘게 바뀌면 한 줄로 합친다
 *   게이트웨이 재시작·전원 차단이면 10면이 동시에 바뀐다. 그때 10줄이 쌓이면
 *   로그 패널이 그 한 사건으로 가득 차고, 직전 관리자 조작이 화면 밖으로 밀려난다.
 *   사람이 읽는 화면에서는 "무슨 일이 있었나" 한 줄이 열 줄보다 정확하다.
 *
 * ★ 수동 지정 중인 면은 적지 않는다
 *   센서 값이 최종 상태에 반영되지 않으므로, 적어 봐야 배치도와 어긋난 기록이 된다.
 *   로그는 "화면이 왜 이렇게 보이는가"를 설명하는 자리다.
 *
 * ★ 상태 이름은 lib/tokens.ts 의 SLOT 에서 가져온다
 *   '주차 중'·'확인 중' 을 여기 문자열로 박으면 라벨을 바꿀 때 로그만 옛 단어로 남는다.
 */

/** 이 수를 넘게 한꺼번에 바뀌면 개별 줄 대신 요약 한 줄 */
const BULK_LIMIT = 5

/** 상태 → 로그 색. 정상 감지는 ok, 확인 중은 손봐야 할 수 있으니 warn */
const toneOf = (s: Allowed) => (s === 'unknown' ? 'warn' : 'ok') as 'warn' | 'ok'

const labelOf = (s: Allowed) => SLOT[s].label   // '주차 가능' | '주차 중' | '확인 중'

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

    /**
     * [b9] 이번 보고로 실제로 달라진 면.
     * code 를 함께 들고 있어야 요약 문구에서 "P3 외 6곳" 같은 말을 만들 수 있다.
     */
    const changes: { code: string; from: Allowed; to: Allowed }[] = []

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

      // [b9] 직전 값과 달라졌고, 수동 지정에 가려지지 않는 면만 로그 대상이다
      if (!manualAlive && slot.autoStatus !== status) {
        changes.push({
          code,
          from: slot.autoStatus as Allowed,
          to: status as Allowed,
        })
      }

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

    /* ── [b9] 센서 복구 ────────────────────────────────────────
       #91 에서 정한 대로 오프라인은 '읽을 때 계산'한다. 그래서 되돌아온 순간을
       알려 주는 곳이 아무 데도 없었다. 마지막 보고가 임계값보다 오래됐는데
       지금 보고가 들어왔다면, 그 사이 화면은 「센서 오류」를 보여 주고 있었다는 뜻이다.
       센서를 처음 단 매장(parkingUpdated 가 null)은 '복구'가 아니므로 제외한다. */
    const wasOffline =
      store.parkingUpdated !== null &&
      now - store.parkingUpdated.getTime() > SENSOR_OFFLINE_MS

    if (wasOffline && updated > 0) {
      ops.push(
        prisma.activityLog.create({
          data: {
            storeId,
            at: detectedAt,
            who: '시스템',
            msg: '센서 연결이 돌아왔어요',
            tone: 'ok',
          },
        }),
      )
    }

    /* ── [b9] 변화 기록 ────────────────────────────────────────
       한 줄씩 남기되, 절반 넘게 한꺼번에 바뀌면 요약 한 줄로 바꾼다. */
    if (changes.length > BULK_LIMIT) {
      // 같은 상태로 몰려간 경우가 대부분이라 도착지 기준으로 센다
      const tally = new Map<Allowed, number>()
      for (const c of changes) tally.set(c.to, (tally.get(c.to) ?? 0) + 1)
      const [topStatus, topCount] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]

      ops.push(
        prisma.activityLog.create({
          data: {
            storeId,
            at: detectedAt,
            who: '센서',
            msg:
              tally.size === 1
                ? `주차면 ${topCount}곳이 한꺼번에 ${labelOf(topStatus)}으로 바뀌었어요`
                : `주차면 ${changes.length}곳의 상태가 한꺼번에 바뀌었어요`,
            tone: toneOf(topStatus),
          },
        }),
      )
    } else {
      for (const c of changes) {
        ops.push(
          prisma.activityLog.create({
            data: {
              storeId,
              at: detectedAt,
              who: '센서',
              msg: `${c.code} ${labelOf(c.from)} → ${labelOf(c.to)}`,
              tone: toneOf(c.to),
            },
          }),
        )
      }
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
      // [b9] changed 를 응답에 넣는다 — fake-sensor 로 검증할 때 몇 줄이 쌓였는지 바로 보인다
      { ok: true, updated, changed: changes.length, ignored, unknownCodes },
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