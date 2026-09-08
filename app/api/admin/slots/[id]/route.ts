// app/api/admin/slots/[id]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ALLOWED = ['available', 'occupied'] as const
type Manual = (typeof ALLOWED)[number]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)

    if (!body || !('manualStatus' in body)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'manualStatus 가 필요합니다.' },
        { status: 400 },
      )
    }

    const manualStatus = body.manualStatus
    const isRelease = manualStatus === null

    if (!isRelease && !ALLOWED.includes(manualStatus)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: '허용되지 않는 상태입니다.' },
        { status: 400 },
      )
    }

    const slot = await prisma.parkingSlot.findUnique({ where: { id } })
    if (!slot) {
      return NextResponse.json(
        { error: 'SLOT_NOT_FOUND', message: '주차면을 찾을 수 없어요.' },
        { status: 404 },
      )
    }

    const minutes = typeof body.minutes === 'number' && body.minutes > 0 ? body.minutes : 120

    const updated = await prisma.parkingSlot.update({
      where: { id },
      data: isRelease
        ? { manualStatus: null, manualUntil: null, manualBy: null }
        : {
            manualStatus: manualStatus as Manual,
            manualUntil: new Date(Date.now() + minutes * 60_000),
            manualBy: '최영호',   // 관리자 1명 구조. 로그인 붙으면 실제 값으로
          },
      // autoStatus 는 건드리지 않는다 (README API 8)
    })

    await prisma.activityLog.create({
      data: {
        storeId: slot.storeId,
        who: '최영호',
        msg: isRelease
          ? `${slot.code} 자동 감지로 복귀`
          : `${slot.code} 수동 지정 → ${manualStatus} (${minutes}분)`,
        tone: isRelease ? 'ok' : 'warn',
      },
    })

    return NextResponse.json({
      id: updated.id,
      code: updated.code,
      autoStatus: updated.autoStatus,
      manualStatus: updated.manualStatus,
      manualUntil: updated.manualUntil ? updated.manualUntil.getTime() : null,
      lastSeenAt: updated.lastSeenAt ? updated.lastSeenAt.getTime() : null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[PATCH /api/admin/slots/[id]]', e)
    return NextResponse.json(
      { error: 'SLOT_UPDATE_FAILED', message: '주차면 상태를 변경하지 못했습니다.' },
      { status: 500 },
    )
  }
}