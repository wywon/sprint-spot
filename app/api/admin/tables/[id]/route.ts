// app/api/admin/tables/[id]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CLEAN_AUTO_MS, TABLE } from '@/lib/tokens'
import type { TableStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Action = 'seat' | 'leave' | 'cleaned' | 'cancel' | 'noshow' | 'disable' | 'enable'

/** 지금 상태에서 할 수 있는 동작 (README API 7 전이표) */
const ALLOWED: Record<string, Action[]> = {
  available: ['seat', 'disable'],
  occupied:  ['leave'],
  cleaning:  ['cleaned'],
  reserved:  ['seat', 'cancel', 'noshow'],
  disabled:  ['enable'],
}

/** 동작 → 바뀔 테이블 상태 */
const NEXT: Record<Action, string> = {
  seat: 'occupied',
  leave: 'cleaning',
  cleaned: 'available',
  cancel: 'available',
  noshow: 'available',
  disable: 'disabled',
  enable: 'available',
}

/**
 * [b9] 결과 상태만으로는 구분이 안 되는 동작에만 꼬리말을 붙인다.
 * '취소'와 '미방문'은 둘 다 「예약 → 빈 자리」라서 로그만 보면 같은 줄이 된다.
 * 나중에 "그 예약 왜 없어졌죠"를 반드시 묻게 되고, 그때 답할 수 있어야 한다.
 */
const ACTION_NOTE: Partial<Record<Action, string>> = {
  cancel: '예약 취소',
  noshow: '미방문',
}

/**
 * [b9] 정리 중이 40초를 넘겼으면 빈 자리로 본다.
 *
 * ★ 왜 필요한가
 *   GET /api/stores/[id] 는 이미 같은 계산을 해서 화면에 '빈 자리'로 내려보낸다.
 *   그런데 DB 의 status 는 'cleaning' 그대로다 — 자동 전환을 DB 에 쓰는 곳이 없다.
 *   전이표를 날것의 DB 값으로 보면, 화면엔 빈 자리인데 '입장'이 409 로 막힌다.
 *   한 번 퇴장시킨 테이블은 그 뒤로 영영 못 앉힌다는 뜻이다.
 *
 *   읽는 쪽과 쓰는 쪽이 같은 기준을 써야 한다. (센서 오프라인 판정 #91 과 같은 방식)
 *
 * ★ 40초는 lib/tokens.ts 의 CLEAN_AUTO_MS 하나만 본다.
 *   /api/stores 와 /api/stores/[id] 는 각자 const CLEANING_MS = 40_000 을 갖고 있다.
 *   숫자가 세 군데 흩어져 있으면 바꿀 때 한 곳을 빠뜨린다. 여기부터 정리해 둔다.
 */
function effectiveStatus(status: string, cleaningAt: Date | null, now: number) {
  if (status === 'cleaning' && cleaningAt && now - cleaningAt.getTime() >= CLEAN_AUTO_MS) {
    return 'available'
  }
  return status
}

/**
 * [b9] 관리자 화면에 '정리 중'은 존재하지 않는다.
 *   components/admin/TableMap.tsx 가 cleaning 을 빈 자리로 그린다.
 *   그래서 퇴장을 누르면 칸은 즉시 「빈 자리」가 되는데 로그만 「정리 중」이라고 말했다.
 *   같은 사건을 두 화면이 다르게 부르면 안 된다.
 *
 *   DB 의 cleaning 값 자체는 그대로 둔다 — 손님 실시간 좌석 화면의 '정리 중' 수치는
 *   v3 규격이라 계속 필요하다. 관리자에게만 안 보이는 상태라는 뜻이다.
 */
const seenByAdmin = (s: string) => (s === 'cleaning' ? 'available' : s)

/** 'available' → '빈 자리'. 상태의 '말'은 lib/tokens.ts 한 곳에만 있어야 한다 */
const labelOf = (s: string) => TABLE[s as TableStatus]?.label ?? s

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    const action = body?.action as Action | undefined

    if (!action || !(action in NEXT)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'action 이 올바르지 않습니다.' },
        { status: 400 },
      )
    }

    const table = await prisma.storeTable.findUnique({ where: { id } })
    if (!table) {
      return NextResponse.json(
        { error: 'TABLE_NOT_FOUND', message: '테이블을 찾을 수 없어요.' },
        { status: 404 },
      )
    }

    // [b9] 날것의 DB 값이 아니라, 화면이 보고 있는 것과 같은 기준으로 판단한다
    const current = effectiveStatus(table.status, table.cleaningAt, Date.now())

    // 전이표에 없는 동작은 막는다 — 대부분 다른 직원이 먼저 누른 경우
    if (!ALLOWED[current]?.includes(action)) {
      return NextResponse.json(
        {
          error: 'INVALID_TRANSITION',
          message: '현재 상태에서는 할 수 없는 동작입니다. 화면을 새로고침해 주세요.',
        },
        { status: 409 },
      )
    }

    const now = new Date()
    const nextStatus = NEXT[action]

    const data: Record<string, unknown> = { status: nextStatus }

    if (action === 'seat') {
      data.since = now.toTimeString().slice(0, 5)   // '12:04'
      data.cleaningAt = null
    } else if (action === 'leave') {
      data.cleaningAt = now                          // 40초 뒤 자동으로 빈자리
      data.guest = null
      data.since = null
    } else {
      // cleaned · cancel · noshow · disable · enable — 자리를 비운다
      data.cleaningAt = null
      data.guest = null
      data.since = null
      if (action === 'cancel' || action === 'noshow') {
        data.resAt = null
        data.resName = null
        data.resParty = null
      }
    }

    const updated = await prisma.storeTable.update({ where: { id }, data })

    // 예약 상태도 같이 바꾼다
    const resStatus =
      action === 'seat' ? 'seated' :
      action === 'cancel' ? 'canceled' :
      action === 'noshow' ? 'noshow' : null

    if (resStatus && typeof body.reservationId === 'string') {
      await prisma.reservation.update({
        where: { id: body.reservationId },
        /* [b11] 앉힐 때는 어느 테이블에 앉았는지도 남긴다.
           schema.prisma 주석은 "관리자가 입장시킬 때 채운다"인데 채우는 코드가 없었다.
           취소·미방문은 자리를 안 잡았으므로 건드리지 않는다. */
        data: action === 'seat'
          ? { status: resStatus, tableId: id }
          : { status: resStatus },
      }).catch((e: unknown) => {
        // 예약 없이 워크인으로 앉히는 경우도 있다. 테이블 변경까지 실패시키지는 않는다
        console.error('[PATCH /api/admin/tables/[id]] reservation link', e)
      })
    }

    /* [b9] 사람이 읽는 문장으로 남긴다.
       전에는 `t2 seat → occupied` 였다. 관리자가 보는 화면에 개발자 말이 새어 나가 있었고,
       센서가 남기는 `P3 주차 가능 → 주차 중` 과 같은 패널에 나란히 서는데 형식도 달랐다.

       cleaning 을 접고 나면 '정리 완료'(cleaned)는 「빈 자리 → 빈 자리」가 된다.
       그때만 화살표 대신 한 마디로 쓴다. 지금 UI 에 그 버튼은 없지만 API 로는 부를 수 있다. */
    const from = labelOf(seenByAdmin(current))
    const to = labelOf(seenByAdmin(nextStatus))
    const note = ACTION_NOTE[action]
    const code = table.code.toUpperCase()

    await prisma.activityLog.create({
      data: {
        storeId: table.storeId,
        at: now,
        who: '최영호',
        msg:
          from === to
            ? `${code} 정리 완료`
            : `${code} ${from} → ${to}${note ? ` (${note})` : ''}`,
        tone: action === 'noshow' ? 'warn' : 'ok',
      },
    })

    // 매장의 좌석 갱신 시각
    await prisma.store.update({
      where: { id: table.storeId },
      data: { tablesUpdated: now },
    })

    return NextResponse.json({
      id: updated.id,
      code: updated.code,
      status: updated.status,
      statusSince: updated.cleaningAt ? updated.cleaningAt.getTime() : null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[PATCH /api/admin/tables/[id]]', e)
    return NextResponse.json(
      { error: 'TABLE_UPDATE_FAILED', message: '테이블 상태를 변경하지 못했습니다.' },
      { status: 500 },
    )
  }
}