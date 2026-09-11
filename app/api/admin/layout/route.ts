// app/api/admin/layout/route.ts
//
// [b6] 배치도 저장 — PUT /api/admin/layout
// ─────────────────────────────────────────────────────────────
// 매장 관리 > 테이블 구성 / 주차장 구성 의 '배치 저장' 이 부르는 곳.
//
// ★ 인증을 여기서 다시 하지 않는다.
//   middleware.ts 의 matcher 가 '/api/admin/:path*' 이라 쿠키가 없으면
//   이 파일은 실행되지 않는다. b4(stores/[id]) 와 같은 이유다.
//
// ★ 선언형(전체 교체)이다
//   "3번을 지우고 5번을 옮겼다" 는 조작 이력을 화면이 들고 있지 않다.
//   "저장 후 배치도는 이 모양이다" 만 보내고, 무엇을 만들고 지울지는
//   서버가 code 를 맞춰 보고 계산한다. 편집 화면은 draft 배열 하나만 관리한다.
//
// ★ 구성만 쓰고 운영 상태는 쓰지 않는다
//   status · autoStatus · manualStatus 는 각각 홀 운영 · 센서 · 주차 관리가
//   소유한다. 배치도 편집은 몇 분씩 걸리는 작업이라, 편집을 시작한 시점의
//   상태를 그대로 저장하면 그 사이 바뀐 값이 몇 분 전으로 되감긴다.
//   예외는 '사용 안 함'(disabled) 토글 하나뿐이고, 이것도 지금 비어 있는
//   테이블에만 적용한다.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** 't1' 'A1' 둘 다 통과한다 */
const CODE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,9}$/
const MAX_TABLES = 60
const MAX_SLOTS = 200
/** 센서 소식이 이보다 오래되면 지금 상태를 모르는 것으로 본다 */
const SENSOR_STALE_MS = 60_000

type TableIn = { code: string; seats: number; x: number; y: number; w: number; disabled: boolean }
type SlotIn = {
  code: string; x: number; y: number; zone: string
  type: 'ev' | 'disabled' | null; nearGate: boolean
}

class Bad extends Error {
  constructor(public code: string, public msg: string, public status = 400) {
    super(msg)
  }
}

/** 화면이 j.message 를 그대로 토스트에 띄운다. 문구는 서버가 책임진다 */
const fail = (e: Bad) =>
  NextResponse.json({ error: e.code, message: e.msg }, { status: e.status })

/* ── 입력 검증 ───────────────────────────────────────────── */

function asCode(v: unknown, where: string) {
  if (typeof v !== 'string' || !CODE_RE.test(v)) {
    throw new Bad('VALIDATION', `${where}: 번호는 영문으로 시작하는 1~10자여야 해요.`)
  }
  return v
}

function asInt(v: unknown, min: number, max: number, where: string) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Bad('VALIDATION', `${where}: ${min}~${max} 사이의 정수여야 해요.`)
  }
  return n
}

function noDup(codes: string[], what: string) {
  const seen = new Set<string>()
  for (const c of codes) {
    if (seen.has(c)) {
      throw new Bad('DUPLICATE_CODE', `${what} 번호 ${c} 가 두 개 있어요. 번호를 확인해 주세요.`)
    }
    seen.add(c)
  }
}

function parseTables(v: unknown): TableIn[] {
  if (!Array.isArray(v)) throw new Bad('VALIDATION', 'tables 는 배열이어야 해요.')
  if (v.length > MAX_TABLES) {
    throw new Bad('VALIDATION', `테이블은 최대 ${MAX_TABLES}개까지 저장할 수 있어요.`)
  }

  const out: TableIn[] = v.map((t: Record<string, unknown>, i) => ({
    code: asCode(t?.code, `테이블 ${i + 1}번째`),
    seats: asInt(t?.seats, 1, 12, `테이블 ${i + 1}번째 좌석 수`),
    x: asInt(t?.x, 0, 49, `테이블 ${i + 1}번째 열`),
    y: asInt(t?.y, 0, 49, `테이블 ${i + 1}번째 행`),
    w: asInt(t?.w ?? 1, 1, 4, `테이블 ${i + 1}번째 폭`),
    disabled: t?.disabled === true,
  }))
  noDup(out.map((t) => t.code), '테이블')
  return out
}

function parseSlots(v: unknown): SlotIn[] {
  if (!Array.isArray(v)) throw new Bad('VALIDATION', 'slots 는 배열이어야 해요.')
  if (v.length > MAX_SLOTS) {
    throw new Bad('VALIDATION', `주차면은 최대 ${MAX_SLOTS}면까지 저장할 수 있어요.`)
  }

  const out: SlotIn[] = v.map((s: Record<string, unknown>, i) => ({
    code: asCode(s?.code, `주차면 ${i + 1}번째`),
    x: asInt(s?.x, 0, 49, `주차면 ${i + 1}번째 열`),
    y: asInt(s?.y, 0, 49, `주차면 ${i + 1}번째 행`),
    zone: typeof s?.zone === 'string' ? s.zone.slice(0, 10) : '',
    type: s?.type === 'ev' || s?.type === 'disabled' ? s.type : null,
    nearGate: s?.nearGate === true,
  }))
  noDup(out.map((s) => s.code), '주차면')
  return out
}

/* ── 지금 이 주차면에 차가 서 있는가 ──────────────────────
   lib/status.ts 의 slotStatus() 와 같은 규칙이다. 다만 저기는 화면용 타입
   (manualUntil 이 number)을 받고 여기는 Prisma 타입(Date)이라 따로 둔다. */
function isOccupied(
  s: {
    autoStatus: string
    manualStatus: string | null
    manualUntil: Date | null
    lastSeenAt: Date | null
  },
  now: number,
) {
  if (s.manualStatus && s.manualUntil && s.manualUntil.getTime() > now) {
    return s.manualStatus === 'occupied'
  }
  // 센서가 조용한 면은 상태를 모르는 것이다. 모르는 걸 근거로 삭제를 막지 않는다
  if (!s.lastSeenAt || now - s.lastSeenAt.getTime() > SENSOR_STALE_MS) return false
  return s.autoStatus === 'occupied'
}

/* ── 본체 ────────────────────────────────────────────────── */

export async function PUT(req: Request) {
  let body: Record<string, unknown> | null = null
  try {
    body = await req.json()
  } catch {
    return fail(new Bad('BAD_JSON', '보낸 값을 읽을 수 없습니다.'))
  }

  try {
    // body 를 여기서 한 번 걸러 두면 아래에서 ?. 를 계속 붙이지 않아도 된다
    if (!body || typeof body !== 'object') {
      throw new Bad('BAD_JSON', '보낸 값을 읽을 수 없습니다.')
    }

    const storeId = typeof body.storeId === 'string' ? body.storeId : null
    if (!storeId) throw new Bad('MISSING_STORE_ID', '매장을 지정해 주세요.')

    const hasTables = body.tables !== undefined
    const hasSlots = body.slots !== undefined
    if (!hasTables && !hasSlots) {
      throw new Bad('VALIDATION', 'tables 또는 slots 중 하나는 있어야 해요.')
    }

    // ★ 보낸 쪽만 손댄다. tables 만 보내면 주차면은 건드리지 않는다.
    //   테이블 구성 탭과 주차장 구성 탭이 서로를 지우지 않게 하는 장치다.
    const tablesIn = hasTables ? parseTables(body.tables) : null
    const slotsIn = hasSlots ? parseSlots(body.slots) : null

    const now = Date.now()

    const result = await prisma.$transaction(
      async (tx) => {
        const store = await tx.store.findUnique({
          where: { id: storeId },
          select: {
            id: true,
            partner: true,
            tables: {
              select: { id: true, code: true, seats: true, status: true, row: true, col: true, w: true },
            },
            slots: {
              select: {
                id: true, code: true, row: true, col: true, zone: true, type: true, nearGate: true,
                autoStatus: true, manualStatus: true, manualUntil: true, lastSeenAt: true,
              },
            },
          },
        })

        if (!store) throw new Bad('STORE_NOT_FOUND', '매장 정보를 찾을 수 없어요.', 404)
        if (!store.partner) {
          throw new Bad('NOT_PARTNER_STORE', '입점 매장만 배치도를 저장할 수 있어요.', 409)
        }

        const summary = { created: 0, updated: 0, deleted: 0 }
        const skipped: string[] = []
        const changed: string[] = []

        /* ── 테이블 ─────────────────────────────────────────── */
        if (tablesIn) {
          const cur = new Map(store.tables.map((t) => [t.code, t]))
          const nextCodes = new Set(tablesIn.map((t) => t.code))
          const gone = store.tables.filter((t) => !nextCodes.has(t.code))

          // 배치도가 통째로 비어서 오는 건 사고다. 폴링이 실패해 tables[] 가
          // 빈 채로 '저장' 을 누른 경우가 여기 걸린다.
          if (tablesIn.length === 0 && store.tables.length > 0) {
            throw new Bad(
              'EMPTY_LAYOUT',
              '테이블을 전부 지울 수는 없어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
              409,
            )
          }

          // 삭제 안전장치 — 검사를 먼저 전부 끝낸다 (부분 반영 방지)
          if (gone.length) {
            const busy = gone.filter((t) => t.status !== 'available' && t.status !== 'disabled')
            const live = await tx.reservation.findMany({
              where: {
                tableId: { in: gone.map((t) => t.id) },
                status: { in: ['upcoming', 'seated'] },
              },
              select: { tableId: true },
            })
            const liveIds = new Set(live.map((r) => r.tableId))
            const blocked = [
              ...new Set([
                ...busy.map((t) => t.code),
                ...gone.filter((t) => liveIds.has(t.id)).map((t) => t.code),
              ]),
            ]
            if (blocked.length) {
              throw new Bad(
                'DELETE_BLOCKED',
                `${blocked.join(', ')} 은(는) 지금 사용 중이거나 예약이 잡혀 있어 삭제할 수 없어요. 삭제 대신 '사용 안 함'으로 바꿔 주세요.`,
                409,
              )
            }
          }

          for (const t of tablesIn) {
            const c = cur.get(t.code)

            if (!c) {
              await tx.storeTable.create({
                data: {
                  storeId: store.id,
                  code: t.code,
                  seats: t.seats,
                  row: t.y,
                  col: t.x,
                  w: t.w,
                  status: t.disabled ? 'disabled' : 'available',
                },
              })
              summary.created++
              continue
            }

            // ★ 사용 여부는 '지금 비어 있는 테이블' 에만 적용한다.
            //   손님이 앉아 있는 자리를 배치도가 끄면 홀 운영 화면과 어긋난다.
            let status: 'available' | 'disabled' | undefined
            const isOff = c.status === 'disabled'
            if (t.disabled && c.status === 'available') status = 'disabled'
            else if (!t.disabled && isOff) status = 'available'
            else if (t.disabled !== isOff) {
              skipped.push(`${t.code} 은 지금 사용 중이라 사용 여부를 바꾸지 않았어요`)
            }

            const same =
              c.seats === t.seats && c.row === t.y && c.col === t.x && c.w === t.w &&
              status === undefined
            if (same) continue // 안 바뀐 줄은 쿼리를 아예 보내지 않는다

            await tx.storeTable.update({
              where: { id: c.id },
              data: { seats: t.seats, row: t.y, col: t.x, w: t.w, ...(status ? { status } : {}) },
            })
            summary.updated++
          }

          if (gone.length) {
            // Reservation.tableId 는 선택 관계라 지난 예약은 tableId 만 null 이 된다
            await tx.storeTable.deleteMany({ where: { id: { in: gone.map((t) => t.id) } } })
            summary.deleted += gone.length
          }

          if (summary.created || summary.updated || summary.deleted) {
            changed.push(`테이블 배치도 ${tablesIn.length}개`)
          }
        }

        /* ── 주차면 ─────────────────────────────────────────── */
        if (slotsIn) {
          const before = { ...summary }
          const cur = new Map(store.slots.map((s) => [s.code, s]))
          const nextCodes = new Set(slotsIn.map((s) => s.code))
          const gone = store.slots.filter((s) => !nextCodes.has(s.code))

          if (slotsIn.length === 0 && store.slots.length > 0) {
            throw new Bad(
              'EMPTY_LAYOUT',
              '주차면을 전부 지울 수는 없어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
              409,
            )
          }

          // 차가 서 있는 면을 지우면 센서는 계속 그 번호로 신호를 보내는데 받을 곳이 없어진다
          const blocked = gone.filter((s) => isOccupied(s, now)).map((s) => s.code)
          if (blocked.length) {
            throw new Bad(
              'DELETE_BLOCKED',
              `${blocked.join(', ')} 은(는) 지금 주차 중이라 삭제할 수 없어요.`,
              409,
            )
          }

          for (const s of slotsIn) {
            const c = cur.get(s.code)

            if (!c) {
              // 새 주차면은 센서 등록 대기 — autoStatus 는 스키마 기본값 unknown 이다
              await tx.parkingSlot.create({
                data: {
                  storeId: store.id,
                  code: s.code,
                  row: s.y,
                  col: s.x,
                  zone: s.zone,
                  type: s.type,
                  nearGate: s.nearGate,
                },
              })
              summary.created++
              continue
            }

            const same =
              c.row === s.y && c.col === s.x && c.zone === s.zone &&
              c.type === s.type && c.nearGate === s.nearGate
            if (same) continue

            await tx.parkingSlot.update({
              where: { id: c.id },
              data: { row: s.y, col: s.x, zone: s.zone, type: s.type, nearGate: s.nearGate },
            })
            summary.updated++
          }

          if (gone.length) {
            // SensorLog.slotCode 는 관계가 아니라 문자열이다. 지워도 로그는 안 깨진다
            await tx.parkingSlot.deleteMany({ where: { id: { in: gone.map((s) => s.id) } } })
            summary.deleted += gone.length
          }

          const moved =
            summary.created !== before.created ||
            summary.updated !== before.updated ||
            summary.deleted !== before.deleted
          if (moved) changed.push(`주차장 배치도 ${slotsIn.length}면`)
        }

        // b4 와 같다 — 관리자 조작은 서버가 로그로 남긴다.
        // 화면의 addLog 는 새로고침하면 사라지므로 그것만으로는 부족하다.
        if (changed.length) {
          await tx.activityLog.create({
            data: {
              storeId: store.id,
              who: '최영호',
              msg: `${changed.join(' · ')} 수정`,
              tone: 'brand',
            },
          })
        }

        return { summary, skipped }
      },
      { timeout: 15_000 },
    )

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    if (e instanceof Bad) return fail(e)
    if ((e as { code?: string })?.code === 'P2002') {
      return fail(new Bad('DUPLICATE_CODE', '같은 번호가 두 개 있어요. 번호를 확인해 주세요.', 409))
    }
    console.error('[PUT /api/admin/layout]', e)
    return fail(new Bad('LAYOUT_SAVE_FAILED', '배치도를 저장하지 못했습니다.', 500))
  }
}