// app/api/admin/stats/route.ts
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/stats?store=s1&days=30
 * ─────────────────────────────────────────────────────────────
 * 매장 관리 > 이용 통계 화면이 읽는다.
 *
 * ★ 없는 데이터는 만들어내지 않는다.
 *   지금 스키마로 계산할 수 없는 지표는 null 로 내려보내고,
 *   화면이 '데이터 수집 중' 으로 표시한다. (규칙 3 — 불확실을 가능으로 세지 않는다)
 *
 *   null 인 것들과 그 이유:
 *   - reservation.avgDurationMin  입장·퇴장 시각 이력이 없다 (StoreTable.since 는 '현재' 값뿐)
 *   - reservation.bySource        Reservation 에 source 필드가 없다
 *   - parking.seatVsPark          테이블 상태 변경 이력이 없다 (SensorLog 의 좌석판이 없다)
 *   - parking.fullCount           보고 중인 센서가 전체 주차면보다 적으면 만차 판정이 불가능하다
 *
 * ★ 시간 처리 규칙
 *   - Reservation.date / time 은 '2026-08-24' '12:30' 문자열이다.
 *     이미 KST 로 적힌 글자이므로 변환하지 않는다. Date 로 파싱하면 오히려 틀어진다.
 *   - SensorLog.detectedAt 은 timestamp(타임존 없음) 이고 값은 UTC 다.
 *     그래서 반드시 AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul' 두 단계를 거친다.
 *     한 단계만 쓰면 9시간이 반대로 틀어진다.
 */

const ALLOWED_DAYS = [7, 30, 90]
const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토']
/** 히트맵 행 순서 — 월요일부터 */
const HEAT_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Date → KST 기준 'YYYY-MM-DD' */
function kstDateStr(d: Date) {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** '2026-08-24' → 요일 번호 (0=일). 런타임 타임존과 무관하게 계산한다. */
function weekdayOf(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return -1
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

type Bucket = { dow: number; hour: number; samples: number; occ: number }

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const storeId = url.searchParams.get('store')
    const daysRaw = Number(url.searchParams.get('days') ?? 30)
    const days = ALLOWED_DAYS.includes(daysRaw) ? daysRaw : 30

    if (!storeId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'store 파라미터가 필요합니다.' },
        { status: 400 },
      )
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        _count: { select: { slots: true, tables: true } },
      },
    })
    if (!store) {
      return NextResponse.json(
        { error: 'STORE_NOT_FOUND', message: '매장 정보를 찾을 수 없어요.' },
        { status: 404 },
      )
    }

    const now = new Date()
    const from = new Date(now.getTime() - days * 86_400_000)
    const fromDate = kstDateStr(from)
    const toDate = kstDateStr(now)
    const totalSlots = store._count.slots

    /* ── 1. 예약 이용현황 ───────────────────────────────────
     * date 가 문자열이라 사전순 비교가 그대로 날짜 비교가 된다.
     * 건수가 많아야 수백이므로 가져와서 JS 에서 집계한다. */
    const reservations = await prisma.reservation.findMany({
      where: { storeId, date: { gte: fromDate, lte: toDate } },
      select: { date: true, time: true, party: true, status: true },
    })

    const total = reservations.length
    const visited = reservations.filter((r) => r.status === 'done').length
    const noshow = reservations.filter((r) => r.status === 'noshow').length
    const canceled = reservations.filter((r) => r.status === 'canceled').length

    // 요일별 — 예약 / 방문 / 미방문
    const dowMap = DOW_LABEL.map((d, i) => ({ d, dow: i, res: 0, visit: 0, noshow: 0 }))
    for (const r of reservations) {
      const w = weekdayOf(r.date)
      if (w < 0) continue
      dowMap[w].res++
      if (r.status === 'done') dowMap[w].visit++
      if (r.status === 'noshow') dowMap[w].noshow++
    }
    // 월요일부터 보여준다 (달력·주간 감각과 맞춘다)
    const byWeekday = HEAT_ORDER.map((i) => dowMap[i])

    // 인원 분포 — 비율(%)
    const partyBuckets: [string, (n: number) => boolean][] = [
      ['1~2인', (n) => n <= 2],
      ['3~4인', (n) => n >= 3 && n <= 4],
      ['5인 이상', (n) => n >= 5],
    ]
    const byParty: [string, number][] = partyBuckets.map(([label, hit]) => {
      const n = reservations.filter((r) => hit(r.party)).length
      return [label, total ? Math.round((n / total) * 100) : 0]
    })

    // 미방문이 잦은 시간 — 요일 + 시각 조합에서 최다
    let worstNoshow: { label: string; count: number } | null = null
    if (noshow > 0) {
      const m = new Map<string, number>()
      for (const r of reservations) {
        if (r.status !== 'noshow') continue
        const w = weekdayOf(r.date)
        if (w < 0) continue
        const k = `${DOW_LABEL[w]} ${r.time}`
        m.set(k, (m.get(k) ?? 0) + 1)
      }
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top) worstNoshow = { label: top[0], count: top[1] }
    }

    const busiestDay = [...byWeekday].sort((a, b) => b.res - a.res)[0]
    const quietDay = [...byWeekday].sort((a, b) => a.res - b.res)[0]

    /* ── 2. 센서 기반 집계 ──────────────────────────────────
     * /api/detect 가 요청마다 SensorLog 를 쌓는다(변화 감지 없음).
     * 즉 시간 샘플링이 균등하므로 occupied 비율을 그대로 점유율로 쓸 수 있다.
     *
     * ★ 분모는 '전체 주차면 수'가 아니라 '실제로 보고한 로그 수'다.
     *   20면 중 1면만 센서가 붙어 있으면 전체 기준으로 나눌 때 영원히 5% 가 나온다. */
    const buckets = await prisma.$queryRaw<Bucket[]>(Prisma.sql`
      SELECT
        EXTRACT(DOW  FROM ("detectedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'))::int AS dow,
        EXTRACT(HOUR FROM ("detectedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'))::int AS hour,
        COUNT(*)::int AS samples,
        COUNT(*) FILTER (WHERE status = 'occupied')::int AS occ
      FROM "SensorLog"
      WHERE "storeId" = ${storeId} AND "detectedAt" >= ${from}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `)

    const [{ n: reportingSlots }] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT "slotCode")::int AS n
      FROM "SensorLog"
      WHERE "storeId" = ${storeId} AND "detectedAt" >= ${from}
    `)

    const totalSamples = buckets.reduce((a, b) => a + b.samples, 0)
    const totalOcc = buckets.reduce((a, b) => a + b.occ, 0)
    const hasSensorData = totalSamples > 0

    // 시간대별 — 데이터가 있는 시간만 (없는 시간까지 0% 로 그리면 거짓말이 된다)
    const hourMap = new Map<number, { samples: number; occ: number }>()
    for (const b of buckets) {
      const cur = hourMap.get(b.hour) ?? { samples: 0, occ: 0 }
      cur.samples += b.samples
      cur.occ += b.occ
      hourMap.set(b.hour, cur)
    }
    const byHour = [...hourMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([h, v]) => ({
        h,
        park: Math.round((v.occ / v.samples) * 100),
        samples: v.samples,
      }))

    // 요일 × 시간 히트맵 — byHour 에 있는 시간만 열로 쓴다
    const heatHours = byHour.map((x) => x.h)
    const cellMap = new Map<string, Bucket>()
    for (const b of buckets) cellMap.set(`${b.dow}:${b.hour}`, b)
    const heatmap = HEAT_ORDER.map((dow) => ({
      d: DOW_LABEL[dow],
      // v[i] = null → 그 칸은 표본이 없다. 화면에서 '—' 로 그린다
      v: heatHours.map((h) => {
        const c = cellMap.get(`${dow}:${h}`)
        return c ? Math.round((c.occ / c.samples) * 100) : null
      }),
      samples: heatHours.map((h) => cellMap.get(`${dow}:${h}`)?.samples ?? 0),
    }))

    /* 주차 세션 복원 — 연속된 같은 상태를 한 덩어리로 묶는다 (gaps and islands)
     * grp 은 상태가 바뀔 때마다 1씩 올라가는 번호다. 같은 grp = 한 번의 주차. */
    const [session] = await prisma.$queryRaw<{ sessions: number; avg_min: number }[]>(Prisma.sql`
      WITH ordered AS (
        SELECT "slotCode", status, "detectedAt",
               LAG(status) OVER (PARTITION BY "slotCode" ORDER BY "detectedAt") AS prev
        FROM "SensorLog"
        WHERE "storeId" = ${storeId} AND "detectedAt" >= ${from}
      ),
      marked AS (
        SELECT "slotCode", status, "detectedAt",
               SUM(CASE WHEN prev IS NULL OR status <> prev THEN 1 ELSE 0 END)
                 OVER (PARTITION BY "slotCode" ORDER BY "detectedAt"
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS grp
        FROM ordered
      ),
      runs AS (
        SELECT "slotCode", status, grp,
               MIN("detectedAt") AS s, MAX("detectedAt") AS e, COUNT(*)::int AS n
        FROM marked
        GROUP BY 1, 2, 3
      )
      SELECT
        COUNT(*)::int AS sessions,
        COALESCE(AVG(EXTRACT(EPOCH FROM (e - s)) / 60.0), 0)::float AS avg_min
      FROM runs
      WHERE status = 'occupied' AND n > 1
    `)

    const sessions = session?.sessions ?? 0
    const avgParkMin = sessions > 0 ? Math.round(session.avg_min) : null
    const turnover =
      sessions > 0 && reportingSlots > 0
        ? Number((sessions / reportingSlots / days).toFixed(1))
        : null

    /* 만차 — 보고 중인 센서가 전체 주차면을 덮을 때만 판정할 수 있다.
     * 10분 버킷에서 '전 주차면 occupied' 로 처음 진입한 횟수를 센다. */
    let fullCount: number | null = null
    if (totalSlots > 0 && reportingSlots >= totalSlots) {
      const [full] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
        WITH b AS (
          SELECT
            floor(EXTRACT(EPOCH FROM "detectedAt") / 600)::bigint AS bucket,
            COUNT(DISTINCT "slotCode") FILTER (WHERE status = 'occupied')::int AS occ
          FROM "SensorLog"
          WHERE "storeId" = ${storeId} AND "detectedAt" >= ${from}
          GROUP BY 1
        ),
        seq AS (
          SELECT bucket, occ, LAG(occ) OVER (ORDER BY bucket) AS prev FROM b
        )
        SELECT COUNT(*)::int AS n
        FROM seq
        WHERE occ >= ${totalSlots} AND (prev IS NULL OR prev < ${totalSlots})
      `)
      fullCount = full?.n ?? 0
    }

    const avgOccupancy = hasSensorData ? Math.round((totalOcc / totalSamples) * 100) : null
    const peak = byHour.length ? [...byHour].sort((a, b) => b.park - a.park)[0] : null
    const quiet = byHour.length ? [...byHour].sort((a, b) => a.park - b.park)[0] : null

    /* ── 3. 읽어낸 패턴 ──────────────────────────────────── */
    const insights: { tone: 'ok' | 'warn' | 'brand'; title: string; body: string }[] = []

    if (peak && quiet && byHour.length >= 3 && peak.h !== quiet.h) {
      insights.push({
        tone: peak.park >= 85 ? 'warn' : 'brand',
        title: `${peak.h}시에 주차가 가장 붐빕니다`,
        body: `점유율 ${peak.park}%. 이 시간대 예약 손님에게는 근처 공영주차장을 미리 안내하면 미방문이 줄어듭니다.`,
      })
      insights.push({
        tone: 'ok',
        title: `${quiet.h}시는 여유 시간대입니다`,
        body: `점유율 ${quiet.park}%. 이 시간대 할인으로 회전을 만들 수 있습니다.`,
      })
    }
    if (total >= 10 && busiestDay && quietDay && busiestDay.res > quietDay.res) {
      insights.push({
        tone: 'brand',
        title: `${busiestDay.d}요일에 예약이 몰립니다`,
        body: `${busiestDay.res}건으로 가장 많고 ${quietDay.d}요일이 ${quietDay.res}건으로 가장 적습니다. 붐비는 요일의 주차 안내를 먼저 준비하세요.`,
      })
    }
    if (total >= 10 && noshow / total >= 0.1) {
      insights.push({
        tone: 'warn',
        title: '미방문율이 10%를 넘습니다',
        body: worstNoshow
          ? `${worstNoshow.label} 예약에서 가장 자주 발생했습니다. 30분 전 알림 문구를 점검해 보세요.`
          : '30분 전 알림 문구를 점검해 보세요.',
      })
    }

    return NextResponse.json(
      {
        store: { id: store.id, name: store.name },
        range: { days, from: fromDate, to: toDate },

        coverage: {
          totalSlots,
          reportingSlots,
          sensorSamples: totalSamples,
          // 화면이 '표본이 얇다' 경고를 띄우는 기준
          thin: totalSamples > 0 && totalSamples < 200,
        },

        reservation: {
          total,
          visited,
          noshow,
          canceled,
          fulfillRate: total ? Math.round((visited / total) * 100) : null,
          noshowRate: total ? Number(((noshow / total) * 100).toFixed(1)) : null,
          byWeekday,
          byParty,
          busiestDay: busiestDay?.res ? busiestDay : null,
          quietDay: busiestDay?.res ? quietDay : null,
          worstNoshow,
          avgDurationMin: null, // 입·퇴장 이력 없음 → C 스키마 이슈
          bySource: null, // Reservation.source 없음 → C 스키마 이슈
        },

        parking: {
          avgOccupancy,
          avgParkMin,
          turnover,
          fullCount,
          sessions,
          byHour,
          heatHours,
          heatmap,
          peak,
          quiet,
          seatVsPark: null, // 테이블 상태 이력 없음 → C 스키마 이슈
        },

        insights,
        generatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    )
  } catch (e) {
    console.error('[GET /api/admin/stats]', e)
    return NextResponse.json(
      { error: 'STATS_FAILED', message: '통계를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}