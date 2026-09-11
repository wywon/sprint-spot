// app/api/stores/[id]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sensorOffline, slotStatus } from '@/lib/status'
import type { ParkingSlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

const CLEANING_MS = 40_000

function effectiveTable(status: string, cleaningAt: Date | null, now: number) {
  if (status === 'cleaning' && cleaningAt && now - cleaningAt.getTime() >= CLEANING_MS) {
    return 'available'
  }
  return status
}

/** '14,000' → 14000 */
function toNumber(price: string) {
  return Number(price.replace(/[^0-9]/g, '')) || 0
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const now = Date.now()

    const s = await prisma.store.findUnique({
      where: { id },
      include: {
        tables: { orderBy: { code: 'asc' } },
        slots: { orderBy: { code: 'asc' } },
        menus: { orderBy: { order: 'asc' } },
        reviewList: { orderBy: { createdAt: 'desc' } },
      },
    })

    if (!s) {
      return NextResponse.json(
        { error: 'STORE_NOT_FOUND', message: '매장 정보를 찾을 수 없어요.' },
        { status: 404 },
      )
    }

    // 미입점 매장 — 목록과 같은 최소 정보만
    if (!s.partner) {
      return NextResponse.json({
        id: s.id,
        name: s.name,
        category: s.cat,
        partner: false,
        address: s.addr ?? '',
        lat: s.lat,
        lng: s.lng,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // 좌석 집계
    const seats = { total: s.tables.length, available: 0, occupied: 0, reserved: 0, cleaning: 0 }
    for (const t of s.tables) {
      const st = effectiveTable(t.status, t.cleaningAt, now)
      if (st === 'available') seats.available++
      else if (st === 'occupied') seats.occupied++
      else if (st === 'reserved') seats.reserved++
      else if (st === 'cleaning') seats.cleaning++
    }

    // 주차 집계 — lib/status.ts 규칙 재사용
    // 센서 소식이 3분 넘게 없으면 offline 으로 본다 (이슈 #91). DB 값만 믿지 않는다.
    const parkingUpdated = s.parkingUpdated ? s.parkingUpdated.getTime() : 0
    const offline = sensorOffline({
      stored: s.sensor,
      updated: parkingUpdated,
      everSeen: s.slots.some((p) => p.lastSeenAt !== null),
      now,
    })
    let available: number | null = null
    let unknown: number | null = null
    if (!offline) {
      available = 0
      unknown = 0
      for (const p of s.slots) {
        const st = slotStatus({
          autoStatus: p.autoStatus,
          manualStatus: p.manualStatus,
          manualUntil: p.manualUntil ? p.manualUntil.getTime() : null,
        } as ParkingSlot)
        if (st === 'available') available++
        else if (st === 'unknown') unknown++
      }
    }

    const [openAt = '', closeAt = ''] = (s.open ?? '').split('-').map((v) => v.trim())
    const hhmm = new Date(now).toTimeString().slice(0, 5)

    return NextResponse.json({
      id: s.id,
      name: s.name,
      category: s.cat,
      partner: true,
      address: s.addr ?? '',
      lat: s.lat,
      lng: s.lng,
      phone: s.tel ?? '',
      price: s.price ?? '',   // [b4] 이슈때 추가
      image: s.hero ?? '',
      images: s.hero ? [s.hero] : [],
      tags: s.tags,
      rating: s.rating,
      reviews: s.reviews,
      hours: {
        open: openAt,
        close: closeAt,
        isOpen: Boolean(openAt && closeAt && hhmm >= openAt && hhmm < closeAt),
      },

      menus: s.menus.map((m) => ({
        id: m.id,
        name: m.name,
        price: toNumber(m.price),
        image: '',
        signature: m.order === 0,
      })),

      seats,

      tables: s.tables.map((t) => ({
        id: t.id,
        code: t.code,
        seats: t.seats,
        status: effectiveTable(t.status, t.cleaningAt, now),
        statusSince: t.cleaningAt ? t.cleaningAt.getTime() : null,
        x: t.col,
        y: t.row,
        w: t.w,
      })),

      parking: {
        fee: s.parkingFee ?? '',
        total: s.slots.length,
        available,
        unknown,
        // ★ DB 칼럼이 아니라 방금 계산한 값을 내려보낸다
        sensor: offline ? 'offline' : 'online',
        updated: parkingUpdated,
        slots: s.slots.map((p) => ({
          id: p.id,
          code: p.code,
          zone: p.zone,
          autoStatus: p.autoStatus,
          manualStatus: p.manualStatus,
          manualUntil: p.manualUntil ? p.manualUntil.getTime() : null,
          lastSeenAt: parkingUpdated,
          type: p.type ?? 'normal',
          x: p.col,
          y: p.row,
          nearGate: p.nearGate,
          confidence: p.confidence,
        })),
      },

      reviewList: s.reviewList.map((r) => ({
        id: r.id,
        name: r.name,
        rating: r.rating,
        text: r.text,
        createdAt: r.createdAt.getTime(),
      })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[GET /api/stores/[id]]', e)
    return NextResponse.json(
      { error: 'STORE_FETCH_FAILED', message: '매장 정보를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}