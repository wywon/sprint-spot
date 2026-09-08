// app/api/stores/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { AnyStore } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await prisma.store.findMany({
      orderBy: { id: 'asc' },
      include: {
        tables: { orderBy: { code: 'asc' } },
        slots:  { orderBy: { code: 'asc' } },
      },
    })

    const stores = rows.map((s): AnyStore => {
      // 미입점 매장 — 상호명만. 필드를 더 보내면 안 된다
      if (!s.partner) {
        return {
          id: s.id,
          partner: false,
          name: s.name,
          cat: s.cat,
          lat: s.lat,
          lng: s.lng,
        }
      }

      return {
        id: s.id,
        partner: true,
        name: s.name,
        cat: s.cat,
        addr: s.addr ?? '',
        tel: s.tel ?? '',
        open: s.open ?? '',
        price: s.price ?? '',
        rating: s.rating,
        reviews: s.reviews,
        tags: s.tags,
        hero: s.hero ?? '',
        lat: s.lat,
        lng: s.lng,
        sensor: s.sensor,

        tables: s.tables.map((t) => ({
          id: t.code,                 // ★ DB의 id(cuid)가 아니라 code('t1')
          seats: t.seats,
          status: t.status,
          row: t.row,
          col: t.col,
          w: t.w,
          guest: t.guest,
          since: t.since,             // '12:04' 문자열 그대로
          cleaningAt: t.cleaningAt ? t.cleaningAt.getTime() : null,
          resAt: t.resAt,
          resName: t.resName,
          resParty: t.resParty,
        })),
        tablesUpdated: s.tablesUpdated ? s.tablesUpdated.getTime() : 0,

        parking: {
          fee: s.parkingFee ?? '',
          slots: s.slots.map((p) => ({
            code: p.code,             // DB의 id(cuid)는 내보내지 않는다
            row: p.row,
            col: p.col,
            zone: p.zone,
            autoStatus: p.autoStatus,
            manualStatus: p.manualStatus,
            manualUntil: p.manualUntil ? p.manualUntil.getTime() : null,
            manualBy: p.manualBy,
            type: p.type,
            nearGate: p.nearGate,
            confidence: p.confidence,
          })),
          updated: s.parkingUpdated ? s.parkingUpdated.getTime() : 0,
        },
      }
    })

    return NextResponse.json(
      { stores },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[GET /api/stores]', e)
    return NextResponse.json(
      { error: 'STORES_FETCH_FAILED', message: '매장 목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}