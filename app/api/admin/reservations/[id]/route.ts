// app/api/admin/reservations/[id]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { REJECT_REASONS } from '@/lib/tokens'
import { HOLDING_STATUSES } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * 예약 승인 · 거절
 * ─────────────────────────────────────────────────────────────
 * PATCH /api/admin/reservations/[id]
 *   { "action": "approve" }              승인
 *   { "action": "reject", "reason": "full" }  거절 (사유 필수)
 *   { "action": "seat" }                 착석
 *   { "action": "cancel" }               손님이 전화로 못 온다고 알려온 경우
 *   { "action": "noshow" }               안 왔다고 손으로 확정
 *
 * ★ 왜 예약 쪽에도 seat/cancel/noshow 를 두는가
 *   PATCH /api/admin/tables/[id] 가 같은 일을 한다. 그런데 그건 테이블을
 *   먼저 고른 뒤에만 쓸 수 있다. 홀 운영 오른쪽 예약 목록에서 누를 때는
 *   아직 어느 테이블에 앉힐지 정하지 않았다.
 *   테이블 배정은 배치도에서, 예약 상태는 여기서 — 둘 다 같은 행을 쓴다.
 *
 * ★ pending 에서만 움직인다
 *   이미 답한 예약을 다시 뒤집지 않는다. 관리자가 승인을 누른 뒤 마음을 바꾸는 건
 *   '거절'이 아니라 '취소'다. 손님에게 이미 "자리가 준비됐어요"가 나갔기 때문에
 *   같은 버튼으로 처리하면 안 된다. 그 경우는 예약 취소 흐름을 쓴다.
 *   두 번 눌렀을 때 두 번째가 409 로 막히는 것도 이 규칙 덕분이다.
 *
 * ★ 승인할 때 정원을 다시 센다
 *   pending 이 이미 자리를 잡고 있으니(B안) 승인해도 총량은 안 는다.
 *   그런데 그 사이 관리자가 테이블을 이용 불가로 바꾸거나 배치도에서 지웠다면
 *   정원이 줄어 있다. 그때 그냥 승인하면 앉을 데 없는 확정이 만들어진다.
 *   자기 자신을 뺀 나머지와 비교한다.
 *
 * ★ 테이블은 배정하지 않는다
 *   tableId 는 null 로 둔다. 어느 자리에 앉힐지는 손님이 도착한 뒤 매장이 정한다
 *   (예약 과정에 테이블 번호를 노출하지 않는다는 규칙과 같은 줄기다).
 *   미리 잡아 두면 그 테이블이 몇 시간씩 묶이고, 정작 도착했을 때
 *   더 나은 자리가 비어 있어도 못 옮긴다.
 *
 * ★ ActivityLog 에 남긴다
 *   관리자 주차 관리의 변경 로그 패널이 이 테이블을 읽게 될 예정이다.
 *   "누가 언제 이 예약을 거절했는가"는 나중에 반드시 묻게 되는 질문이다.
 */

const REASON_KEYS = REJECT_REASONS.map((r) => r.key) as readonly string[]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    const action = body?.action

    /** 동작 → [허용되는 현재 상태, 바뀔 상태] */
    const MOVES: Record<string, { from: string[]; to: string }> = {
      approve: { from: ['pending'], to: 'upcoming' },
      reject: { from: ['pending'], to: 'rejected' },
      seat: { from: ['upcoming'], to: 'seated' },
      cancel: { from: ['pending', 'upcoming'], to: 'canceled' },
      noshow: { from: ['upcoming'], to: 'noshow' },
    }

    const move = typeof action === 'string' ? MOVES[action] : undefined
    if (!move) {
      return NextResponse.json(
        { error: 'BAD_ACTION', message: '처리할 수 없는 동작입니다.' },
        { status: 400 },
      )
    }

    let reason: string | null = null
    if (action === 'reject') {
      const picked = typeof body?.reason === 'string' ? body.reason : ''
      if (!REASON_KEYS.includes(picked)) {
        return NextResponse.json(
          { error: 'BAD_REASON', message: '거절 사유를 선택해 주세요.' },
          { status: 400 },
        )
      }
      reason = picked
    }

    const res = await prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true, storeId: true, date: true, time: true,
        party: true, name: true, status: true,
      },
    })
    if (!res) {
      return NextResponse.json(
        { error: 'RES_NOT_FOUND', message: '예약을 찾을 수 없어요.' },
        { status: 404 },
      )
    }
    if (!move.from.includes(res.status)) {
      return NextResponse.json(
        {
          error: 'ALREADY_DECIDED',
          message: '이미 처리된 예약이에요. 화면을 새로고침해 주세요.',
          status: res.status,
        },
        { status: 409 },
      )
    }

    const now = new Date()

    if (action === 'reject') {
      const updated = await prisma.reservation.update({
        where: { id },
        data: { status: 'rejected', rejectReason: reason, decidedAt: now },
      })

      await prisma.activityLog.create({
        data: {
          storeId: res.storeId,
          who: '최영호',
          msg: `${res.time} ${res.name}님 예약 거절 (${
            REJECT_REASONS.find((r) => r.key === reason)?.admin ?? reason
          })`,
          tone: 'warn',
        },
      }).catch((e) => console.error('[admin/reservations] log', e))

      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        rejectReason: updated.rejectReason,
        decidedAt: updated.decidedAt?.getTime() ?? null,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    /* ── 착석 · 취소 · 미방문 ─────────────────────────────
       정원 계산이 필요 없다. 자리를 더 쓰는 동작이 아니기 때문이다.
       (seated 는 이미 HOLDING_STATUSES 에 들어 있고, 나머지는 자리를 놓아준다) */
    if (action === 'seat' || action === 'cancel' || action === 'noshow') {
      const updated = await prisma.reservation.update({
        where: { id },
        data: { status: move.to as 'seated' | 'canceled' | 'noshow' },
      })

      const word = action === 'seat' ? '착석' : action === 'cancel' ? '취소' : '미방문'
      await prisma.activityLog.create({
        data: {
          storeId: res.storeId,
          who: '최영호',
          msg: `${res.time} ${res.name}님 예약 ${word} 처리`,
          tone: action === 'seat' ? 'ok' : 'warn',
        },
      }).catch((e) => console.error('[admin/reservations] log', e))

      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        rejectReason: updated.rejectReason,
        decidedAt: updated.decidedAt?.getTime() ?? null,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    /* ── 승인 ────────────────────────────────────────────── */
    const approved = await prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: res.storeId },
        include: { tables: true },
      })
      if (!store) throw new Error('STORE_NOT_FOUND')

      // POST /api/reservations 와 같은 기준으로 센다
      const capacity = store.tables.filter(
        (t) => t.seats >= res.party && t.status !== 'disabled',
      ).length

      const othersHolding = await tx.reservation.count({
        where: {
          storeId: res.storeId,
          date: res.date,
          time: res.time,
          status: { in: [...HOLDING_STATUSES] },
          id: { not: id },
        },
      })
      if (othersHolding >= capacity) throw new Error('NO_CAPACITY')

      return tx.reservation.update({
        where: { id },
        data: { status: 'upcoming', rejectReason: null, decidedAt: now },
      })
    })

    await prisma.activityLog.create({
      data: {
        storeId: res.storeId,
        who: '최영호',
        msg: `${res.time} ${res.name}님 ${res.party}인 예약 승인`,
        tone: 'ok',
      },
    }).catch((e) => console.error('[admin/reservations] log', e))

    return NextResponse.json({
      id: approved.id,
      status: approved.status,
      rejectReason: null,
      decidedAt: approved.decidedAt?.getTime() ?? null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_CAPACITY') {
      return NextResponse.json(
        {
          error: 'NO_CAPACITY',
          message: '그 시간에 받을 수 있는 자리가 없어요. 테이블 구성을 확인해 주세요.',
        },
        { status: 409 },
      )
    }
    if (e instanceof Error && e.message === 'STORE_NOT_FOUND') {
      return NextResponse.json(
        { error: 'STORE_NOT_FOUND', message: '매장 정보를 찾을 수 없어요.' },
        { status: 404 },
      )
    }
    console.error('[PATCH /api/admin/reservations/[id]]', e)
    return NextResponse.json(
      { error: 'DECIDE_FAILED', message: '예약을 처리하지 못했습니다.' },
      { status: 500 },
    )
  }
}