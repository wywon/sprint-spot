// app/api/admin/logs/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * 관리자 변경 로그
 * ─────────────────────────────────────────────────────────────
 * GET /api/admin/logs?storeId=s1&limit=30
 *
 * [b9] 신설. ActivityLog 는 쓰는 곳이 6군데인데 읽는 라우트가 없었다.
 *      그래서 대시보드 「최근 변경」과 주차 관리 「센서 감지·변경 로그」 패널은
 *      lib/store.tsx 가 마운트 때 넣어 둔 하드코딩 4줄을 보여 주고 있었다.
 *
 * ★ 왜 30건인가
 *   두 패널 모두 스크롤 영역이고, 관리자가 실제로 보는 건 맨 위 몇 줄이다.
 *   이 라우트는 3초마다 호출되므로 건수가 늘면 그만큼 매번 실어 나른다.
 *   더 옛날 기록이 필요해지면 그때 '더 보기'를 붙이는 게 맞다 —
 *   지금 500건을 보내 두는 건 3초마다 버리는 데이터를 만드는 일이다.
 *
 * ★ 시각은 epoch ms 로 보낸다
 *   화면은 agoText(now - t) 로 '방금'·'3분 전'을 만든다. 절대 시각만 있으면 되고
 *   서버가 문자열을 만들면 3초 뒤에 이미 낡는다.
 *
 *   ActivityLog.at 은 Prisma 가 Date 로 돌려주므로 getTime() 이 곧 UTC 기준
 *   절대 시각이다. KST 보정을 하면 안 된다 — 9시간을 더하면 모든 기록이
 *   '9시간 뒤'가 되어 화면에 '방금'조차 안 뜬다.
 *   (stats 라우트의 AT TIME ZONE 두 단계는 raw SQL 로 읽을 때만 필요한 처리다)
 *
 * ★ 인증
 *   middleware.ts 가 /api/admin/:path* 를 막는다. 쿠키가 없으면 여기까지 오지 못한다.
 */

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? 's1'

    const asked = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const limit = Number.isFinite(asked)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(asked)))
      : DEFAULT_LIMIT

    const rows = await prisma.activityLog.findMany({
      where: { storeId },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true, at: true, who: true, msg: true, tone: true },
    })

    const list = rows.map((r) => ({
      id: r.id,
      at: r.at.getTime(),
      who: r.who,
      msg: r.msg,
      tone: r.tone,
    }))

    return NextResponse.json(list, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[GET /api/admin/logs]', e)
    return NextResponse.json(
      { error: 'LOG_FETCH_FAILED', message: '변경 기록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}