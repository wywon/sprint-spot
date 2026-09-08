// app/api/admin/tables/[id]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    // 전이표에 없는 동작은 막는다 — 대부분 다른 직원이 먼저 누른 경우
    if (!ALLOWED[table.status]?.includes(action)) {
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
        data: { status: resStatus },
      }).catch(() => {})   // 예약 없이 워크인으로 앉히는 경우도 있다
    }

    await prisma.activityLog.create({
      data: {
        storeId: table.storeId,
        who: '최영호',
        msg: `${table.code} ${action} → ${nextStatus}`,
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