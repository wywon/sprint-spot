// app/api/stores/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { slotStatus } from '@/lib/status'
import type { ParkingSlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

const CLEANING_MS = 40_000

/** 정리 중이 40초 지났으면 빈자리로 본다.
 *  README 지시 — 노트북 2대 동시 시연에서 좌석 수가 어긋나지 않도록 서버가 계산한다. */
function effectiveTable(status: string, cleaningAt: Date | null, now: number) {
  if (status === 'cleaning' && cleaningAt && now - cleaningAt.getTime() >= CLEANING_MS) {
    return 'available'
  }
  return status
}

export async function GET() {
  try {
    const now = Date.now()

    const rows = await prisma.store.findMany({
      orderBy: { id: 'asc' },
      include: { tables: true, slots: true },
    })

    const stores = rows.map((s) => {
      // 미입점 매장 — seats · parking · tags 키를 아예 보내지 않는다
      if (!s.partner) {
        return {
          id: s.id,
          name: s.name,
          category: s.cat,
          partner: false,
          address: s.addr ?? '',
          lat: s.lat,
          lng: s.lng,
        }
      }

      // ── 좌석 집계 (README 정의: 네 상태가 서로 겹치지 않는다) ──
      const seats = { total: s.tables.length, available: 0, occupied: 0, reserved: 0, cleaning: 0 }
      for (const t of s.tables) {
        const st = effectiveTable(t.status, t.cleaningAt, now)
        if (st === 'available') seats.available++
        else if (st === 'occupied') seats.occupied++
        else if (st === 'reserved') seats.reserved++
        else if (st === 'cleaning') seats.cleaning++
        // disabled 는 어디에도 세지 않는다
      }

      // ── 주차 집계 — lib/status.ts 의 규칙을 그대로 사용 ──
      const offline = s.sensor === 'offline'
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

      // DB의 open 은 '10:30 - 20:00' 한 덩어리라 둘로 나눈다
      const [openAt = '', closeAt = ''] = (s.open ?? '').split('-').map((v) => v.trim())
      const hhmm = new Date(now).toTimeString().slice(0, 5)

      return {
        id: s.id,
        name: s.name,
        category: s.cat,
        partner: true,
        address: s.addr ?? '',
        lat: s.lat,
        lng: s.lng,
        image: s.hero ?? '',
        tags: s.tags,
        rating: s.rating,
        reviews: s.reviews,
        hours: {
          open: openAt,
          close: closeAt,
          isOpen: Boolean(openAt && closeAt && hhmm >= openAt && hhmm < closeAt),
        },
        seats,
        parking: {
          fee: s.parkingFee ?? '',
          total: s.slots.length,
          available,          // 센서 offline 이면 null — 0(만차)과 '모른다'는 다르다
          unknown,
          sensor: s.sensor,   // 'online' | 'offline'
          updated: s.parkingUpdated ? s.parkingUpdated.getTime() : 0,
        },
      }
    })

    return NextResponse.json(stores, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[GET /api/stores]', e)
    return NextResponse.json(
      { error: 'STORES_FETCH_FAILED', message: '매장 목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}