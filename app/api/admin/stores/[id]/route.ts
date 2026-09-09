// app/api/admin/stores/[id]/route.ts
//
// [b4] 매장 정보 수정
// ─────────────────────────────────────────────────────────────
// ★ 인증을 여기서 다시 하지 않는다.
//   middleware.ts 의 matcher 가 '/api/admin/:path*' 이라서, 쿠키가 없으면
//   이 파일은 아예 실행되지 않고 401 JSON 이 나간다. 여기 또 쓰면 중복이다.
//
// ★ 테이블·주차면 PATCH 와 달리 action 문자열을 받지 않는다.
//   저 둘은 '상태 전이'(available → occupied)라 전이표가 필요했지만,
//   매장 정보는 값 교체다. action 을 만들면 'updateName' 같은 게 필드 수만큼 늘어난다.
//   → 보낸 필드만 바꾸는 부분 수정(partial update)으로 만든다.
//
// ★ 필드 이름은 GET /api/stores/[id] 응답과 똑같이 맞춘다.
//   (category / address / phone / hours{open,close} / parking{fee})
//   DB 이름(cat · addr · tel · open · parkingFee)은 이 파일 안에서만 쓴다.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** 24시간 형식 'HH:MM' */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
/** 숫자와 하이픈만. 042-256-1234 / 01012345678 둘 다 통과 */
const TEL = /^\d[\d-]{7,14}$/

function fail(message: string, code = 'BAD_REQUEST', status = 400) {
  return NextResponse.json({ error: code, message }, { status })
}

/** 문자열이 아니면 undefined(= 안 보낸 것), 맞으면 앞뒤 공백을 지운다 */
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return fail('보낸 값을 읽을 수 없습니다.')
    }

    const store = await prisma.store.findUnique({
      where: { id },
      select: { id: true, partner: true },
    })

    if (!store) {
      return fail('매장 정보를 찾을 수 없어요.', 'STORE_NOT_FOUND', 404)
    }
    if (!store.partner) {
      // 미입점 매장은 지도에 이름만 뜨는 껍데기라 수정할 정보 자체가 없다
      return fail('입점 매장만 정보를 수정할 수 있어요.', 'NOT_PARTNER_STORE', 409)
    }

    const data: Record<string, unknown> = {}
    const changed: string[] = []

    /* ── 매장명 ── */
    const name = str(body.name)
    if (name !== undefined) {
      if (name.length < 1 || name.length > 40) {
        return fail('매장명은 1~40자로 입력해 주세요.')
      }
      data.name = name
      changed.push('매장명')
    }

    /* ── 업종 ── */
    const category = str(body.category)
    if (category !== undefined) {
      if (category.length < 1 || category.length > 20) {
        return fail('업종은 1~20자로 입력해 주세요.')
      }
      data.cat = category
      changed.push('업종')
    }

    /* ── 주소 ── */
    const address = str(body.address)
    if (address !== undefined) {
      if (address.length < 1 || address.length > 100) {
        return fail('주소는 1~100자로 입력해 주세요.')
      }
      data.addr = address
      changed.push('주소')
    }

    /* ── 전화번호 — 빈 값이면 지운다 ── */
    const phone = str(body.phone)
    if (phone !== undefined) {
      if (phone && !TEL.test(phone)) {
        return fail('전화번호는 숫자와 - 만 넣어 주세요. 예) 042-256-1234')
      }
      data.tel = phone || null
      changed.push('전화번호')
    }

    /* ── 영업시간 — DB 에는 '10:30 - 20:00' 한 덩어리로 저장한다 ──
       GET 쪽이 '-' 로 잘라 쓰고 있어서 이 모양을 깨면 안 된다. */
    if (body.hours && typeof body.hours === 'object') {
      const open = str(body.hours.open) ?? ''
      const close = str(body.hours.close) ?? ''

      if (!open && !close) {
        data.open = null // 영업시간 미등록
      } else {
        if (!HHMM.test(open) || !HHMM.test(close)) {
          return fail('영업시간은 24시간 형식(HH:MM)으로 입력해 주세요.')
        }
        // ★ 자정을 넘기는 영업시간은 막는다.
        //   GET 의 isOpen 이 `open <= now < close` 한 줄이라 '22:00 - 02:00' 을
        //   저장하면 하루 종일 '영업 종료'로 뜬다. 조용히 틀리느니 여기서 거른다.
        if (close <= open) {
          return fail('종료 시각은 시작 시각보다 늦어야 해요. 자정을 넘겨 영업하는 매장은 아직 등록할 수 없어요.')
        }
        data.open = `${open} - ${close}`
      }
      changed.push('영업시간')
    }

    /* ── 가격대 ── */
    const price = str(body.price)
    if (price !== undefined) {
      if (price.length > 40) {
        return fail('가격대는 40자 이내로 입력해 주세요.')
      }
      data.price = price || null
      changed.push('가격대')
    }

    /* ── 주차 요금 안내 ── */
    if (body.parking && typeof body.parking === 'object') {
      const fee = str(body.parking.fee)
      if (fee !== undefined) {
        if (fee.length > 60) {
          return fail('주차 요금 안내는 60자 이내로 입력해 주세요.')
        }
        data.parkingFee = fee || null
        changed.push('주차 요금')
      }
    }

    if (changed.length === 0) {
      return fail('바뀐 내용이 없습니다.')
    }

    const s = await prisma.store.update({ where: { id }, data })

    await prisma.activityLog.create({
      data: {
        storeId: id,
        who: '최영호',
        msg: `매장 정보 수정 · ${changed.join(' · ')}`,
        tone: 'brand',
      },
    })

    const [openAt = '', closeAt = ''] = (s.open ?? '').split('-').map((v) => v.trim())

    return NextResponse.json(
      {
        id: s.id,
        name: s.name,
        category: s.cat,
        address: s.addr ?? '',
        phone: s.tel ?? '',
        price: s.price ?? '',
        hours: { open: openAt, close: closeAt },
        parking: { fee: s.parkingFee ?? '' },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[PATCH /api/admin/stores/[id]]', e)
    return NextResponse.json(
      { error: 'STORE_UPDATE_FAILED', message: '매장 정보를 저장하지 못했습니다.' },
      { status: 500 },
    )
  }
}
