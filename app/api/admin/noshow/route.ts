import { NextResponse } from 'next/server'
import { sweepNoShow } from '@/lib/noshow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const storeId = new URL(req.url).searchParams.get('storeId') ?? undefined

  try {
    const { changed, ids } = await sweepNoShow(storeId)
    return NextResponse.json({ ok: true, changed, ids })
  } catch (e) {
    console.error('[noshow] sweep failed', e)
    return NextResponse.json({ ok: false, error: 'SWEEP_FAILED' }, { status: 500 })
  }
}