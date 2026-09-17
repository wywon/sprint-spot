// app/api/admin/reservations/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sweepNoShow } from '@/lib/noshow'

export const dynamic = 'force-dynamic'

/**
 * 관리자가 보는 예약 목록
 * ─────────────────────────────────────────────────────────────
 * [a7] 신설. 지금까지 관리자 패널의 예약은 전부 lib/mock.ts 의 ADMIN_RES 였다.
 *      ActivityLog 와 같은 상황이었다 — 쓰는 곳은 있는데 읽는 라우트가 없었다.
 *
 * ★ 응답을 평평한 배열로 준다
 *   lib/store.tsx 의 adminRes 가 AdminReservation[] 이다. 모양이 같아야
 *   mock → API 교체가 한 줄로 끝난다. 카테고리별로 나눠 보내면
 *   화면 네 곳(대시보드·홀 운영·사이드바·예약 달력)을 전부 고쳐야 한다.
 *   무엇을 보여 줄지는 화면이 status 로 거른다.
 *
 * ★ 무엇을 담는가
 *   1. 오늘(KST) 날짜의 모든 예약 — 홀 운영의 '오늘 예약'
 *   2. 날짜와 무관하게 살아 있는 pending 전부 — 승인 대기는 미뤄 두면 안 된다
 *   내일 저녁 예약 요청이 오늘 들어왔는데 오늘 목록에만 담으면
 *   관리자는 내일이 되어서야 그 요청을 본다. 손님은 하루를 기다린다.
 *
 * ★ [c17] ?month=YYYY-MM — 예약 달력 전용 모드
 *   components/admin/ResCalendar.tsx 가 ?month= 를 보내는데 이 라우트가 읽지 않아
 *   달력을 몇 월로 넘기든 '오늘 + pending' 만 내려왔다. 그래서 오늘 말고는 전부 0건.
 *   month 가 오면 위의 1·2 대신 '그 달 1일 ~ 말일의 모든 예약' 을 준다.
 *   - 다른 달의 pending 은 담지 않는다. 달력은 그 달 칸에만 숫자를 찍으므로 쓸 곳이 없다.
 *     그 달 안의 pending 은 당연히 들어 있고, 달력이 「승인 대기」 배지로 보여 준다.
 *   - 정렬은 date·time 순 그대로 둔다. 아래의 '승인 대기를 맨 위로' 는 홀 운영용이다.
 *     달력은 서버 순서대로 날짜별로 쌓기만 하므로, 섞으면 하루 안의 시간 순이 깨진다.
 *   - 모양이 틀린 month(2026-13, 2026-9 …)는 400. 조용히 오늘로 돌려주면
 *     달력은 '예약 없는 달' 로 보이고 아무도 버그인 줄 모른다.
 *   - month 와 date 를 같이 주면 month 가 이긴다. 둘을 함께 쓰는 화면은 없다.
 *   - 3초 폴링(lib/store.tsx)은 month 를 보내지 않으므로 기존 동작 그대로다.
 *
 * ★ 인증
 *   middleware.ts 가 /api/admin/:path* 를 막고 있어 따로 처리하지 않는다.
 *
 * ★ 미방문 청소를 여기서 한 번 돌린다
 *   Hobby 플랜은 크론이 하루 1회라 배치로 못 돈다. 관리자 화면이 3초마다
 *   이 라우트를 부르므로, 관리자가 화면을 보고 있는 동안은 사실상 실시간이다.
 *   sweepNoShow 는 여러 번 불러도 결과가 같다.
 */

/** 지금 이 순간의 KST 날짜 'YYYY-MM-DD' — 서버가 UTC(Vercel)여도 같은 답 */
function kstToday(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** 'YYYY-MM-DD' + 'HH:mm' → KST 기준 Date */
const kstDateTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00+09:00`)

/**
 * 도착까지 남은 시간을 사람 말로.
 * 관리자는 '19:00'보다 '8분 후'를 먼저 읽는다. 지금 움직여야 하는지가 그걸로 정해진다.
 */
function etaText(date: string, time: string, status: string, today: string) {
  if (status === 'seated' || status === 'noshow' || status === 'done') return '-'
  if (status === 'rejected' || status === 'canceled') return '-'

  if (date !== today) {
    // 오늘이 아닌 예약은 분 단위가 의미 없다. 며칠 뒤인지가 알고 싶은 것이다
    const d = Math.round(
      (kstDateTime(date, '00:00').getTime() - kstDateTime(today, '00:00').getTime()) / 86_400_000,
    )
    if (d === 1) return '내일'
    if (d > 1) return `${d}일 뒤`
    return '지난 날짜'
  }

  const diff = Math.round((kstDateTime(date, time).getTime() - Date.now()) / 60_000)
  if (diff > 60) return `${Math.floor(diff / 60)}시간 ${diff % 60}분 후`
  if (diff > 0) return `${diff}분 후`
  if (diff === 0) return '지금'
  return `${-diff}분 지남`
}

/**
 * 'YYYY-MM' → 그 달의 [1일, 다음 달 1일) 문자열 범위.
 * date 컬럼이 0 채운 'YYYY-MM-DD' 문자열이라 사전순 비교가 날짜순과 같다.
 * startsWith 대신 범위로 거는 이유 — @@index([storeId, date]) 를 그대로 탄다.
 * 모양이 틀리면 null.
 */
function monthRange(month: string): { gte: string; lt: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const ny = mo === 12 ? y + 1 : y
  const nm = mo === 12 ? 1 : mo + 1
  return { gte: `${m[1]}-${m[2]}-01`, lt: `${ny}-${String(nm).padStart(2, '0')}-01` }
}

/** 010-2211-1234 — 관리자는 이 번호로 전화를 건다. 읽기 쉬워야 한다 */
function dashPhone(p: string) {
  const d = p.replace(/\D/g, '')
  if (d.length !== 11) return p
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? 's1'
    const today = kstToday(new Date())
    // 예약 달력이 다른 날을 볼 때 쓴다. 안 주면 오늘
    const date = url.searchParams.get('date') ?? today
    // [c17] 예약 달력이 한 달치를 한 번에 읽을 때 쓴다
    const month = url.searchParams.get('month')
    const range = month === null ? null : monthRange(month)
    if (month !== null && !range) {
      return NextResponse.json(
        { error: 'INVALID_MONTH', message: 'month 는 YYYY-MM 형식이어야 합니다.' },
        { status: 400 },
      )
    }

    // 시각이 지난 upcoming 을 미방문으로 정리하고 시작한다
    await sweepNoShow(storeId).catch((e) => {
      console.error('[admin/reservations] sweepNoShow', e)
    })

    const rows = await prisma.reservation.findMany({
      where: range
        ? // [c17] 달력 — 그 달의 모든 예약 (상태 무관)
          { storeId, date: range }
        : {
            storeId,
            OR: [
              // 그 날짜의 모든 예약
              { date },
              // 아직 답하지 않은 요청은 날짜와 무관하게 전부 (지난 날짜는 뺀다)
              { status: 'pending', date: { gte: today } },
            ],
          },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      select: {
        id: true, date: true, time: true, party: true, seatType: true,
        name: true, phone: true, memo: true, status: true,
        rejectReason: true, decidedAt: true, createdAt: true, tableId: true,
      },
    })

    const list = rows.map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      name: r.name,
      party: r.party,
      phone: dashPhone(r.phone),
      status: r.status,
      memo: r.memo ?? '',
      seatType: r.seatType ?? '상관없음',
      eta: etaText(r.date, r.time, r.status, today),
      tableId: r.tableId,
      rejectReason: r.rejectReason,
      decidedAt: r.decidedAt?.getTime() ?? null,
      // 먼저 온 요청을 먼저 처리하도록 관리자 화면에서 정렬 기준으로 쓴다
      createdAt: r.createdAt.getTime(),
    }))

    /* 승인 대기를 맨 위로.
       관리자가 이 화면에서 해야 하는 일은 '기다리는 손님에게 답하기' 하나다.
       그다음은 시간 순 — 곧 도착할 사람이 먼저다.
       [c17] 달력(month) 에는 적용하지 않는다 — DB 의 date·time 순을 그대로 보낸다. */
    if (!range) list.sort((a, b) => {
      const pa = a.status === 'pending' ? 0 : 1
      const pb = b.status === 'pending' ? 0 : 1
      if (pa !== pb) return pa - pb
      if (pa === 0) return a.createdAt - b.createdAt
      return (a.date + a.time).localeCompare(b.date + b.time)
    })

    return NextResponse.json(list, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[GET /api/admin/reservations]', e)
    return NextResponse.json(
      { error: 'ADMIN_RES_FETCH_FAILED', message: '예약 목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}