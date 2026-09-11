// app/api/lots/route.ts
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { XMLParser } from 'fast-xml-parser'

export const dynamic = 'force-dynamic'

/**
 * 대전시 공영주차장 목록
 * ─────────────────────────────────────────────────────────────
 * [A6] 카카오맵 전환에 맞춰 세 군데를 고쳤다.
 *
 *   1. 시연 지역을 대흥동·은행동 → 송촌동·법동(대덕구)으로 옮겼다.
 *      이유는 하나다. 실시간 잔여 대수가 실제로 들어오는 주차장이 거기 있다.
 *      (C16 때 대흥동을 조사하고 "원도심은 실시간 커버리지가 없다"고 결론 냈는데,
 *       그 결론 자체는 맞았다. 틀린 건 지역 선택이었다.)
 *
 *   2. lat/lng 를 목업 지도의 0~100% 가 아니라 실제 위경도로 내려보낸다.
 *      카카오맵은 위경도를 받기 때문이다. realLat/realLng 는 같은 값으로 남겨 둔다
 *      (길안내 코드가 그 이름을 쓰고 있어서 지우지 않았다).
 *
 *   3. 실시간 제공 여부를 판별한다. 판별 기준은 resQty 가 아니라 totalQty 다.
 *      전수 조사 결과 resQty 는 756곳 전부에 값이 있지만(대부분 0),
 *      totalQty 에 값이 있는 곳은 20곳뿐이고 그 20곳이 대전시 주차안내시스템
 *      지도에서 초록색으로 찍히는 주차장과 정확히 일치한다.
 *
 *      · totalQty 있음 → 실시간 연동 주차장. available 에 숫자를 넣는다
 *      · totalQty 없음 → 기본정보 제공 주차장. available 은 null 이다
 *
 *      화면은 available === null 을 이미 "확인 불가"로 그린다(levelOf → LEVEL.none).
 *      그래서 타입(lib/types.ts)에 필드를 새로 추가하지 않았다. 계약서는 그대로다.
 *
 * ★ 남아 있는 한계 — 발표 때 질문받으면 이렇게 답할 것
 *   data/*.xml 은 받아서 저장해 둔 스냅샷이다. 공공데이터 게이트웨이가 서버(Node)
 *   요청을 HTTP_ERROR(04) 로 거부해서 런타임에 부를 수가 없다.
 *   따라서 공영주차장 숫자는 "제공기관이 마지막으로 집계한 값"이고 실행 중에 변하지 않는다.
 *   시연에서 실제로 초 단위로 움직이는 건 스프린트 식당(s1)의 센서 주차면이다.
 *   둘의 성격이 다르다는 걸 UI에서 구분해 보여 주는 것이 이번 작업의 핵심이다.
 */

const TTL_MS = 60_000

/**
 * 시연 대상 지역 — 대덕구 송촌동 · 법동 · 중리동
 * 이 범위 안에 공영주차장 30곳이 있고 그중 6곳이 실시간 연동이다.
 *   실시간  송촌소리 · 송촌공영 · 법동시장 제2 · 중리시장 제1 · 중리시장 제2 · 동춘당생애길 제1
 */
const BBOX = { minLat: 36.3580, maxLat: 36.3720, minLng: 127.4250, maxLng: 127.4460 }

/**
 * 스프린트 식당(s1) 위치.
 * 실시간 주차장 세 곳(법동시장 제2 · 송촌소리 · 송촌공영)을 꼭짓점으로 하는
 * 삼각형의 내심이다. 세 곳 모두 도보권에 들어오는 지점이라
 * "이 식당에 가려면 어디에 대면 되나"를 한 화면에서 보여 주기 좋다.
 *   내심 36.365764, 127.436058 / 내접원 반지름 약 106m
 * near[] 를 계산할 기준점으로만 쓴다. 지도 마커 좌표는 lib/mock.ts 에 있다.
 */
const DEMO_STORE = { id: 's1', lat: 36.36572, lng: 127.43608 }

/** 공영주차장 상세의 "근처 추천 식당"에 넣을 최대 도보 거리 */
const NEAR_MAX_M = 900

/** 두 데이터셋을 좌표로 맞출 때 허용 오차 (약 11m) */
const MATCH_EPS = 0.0001

/** 이 API 들은 값이 없을 때 빈 칸이 아니라 'NONE' 을 보낸다 */
const str = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s === 'NONE' ? '' : s
}
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const guOf = (addr: string) => addr.split(/\s+/).find((w) => w.endsWith('구')) ?? ''

/** 위경도 두 점 사이 직선 거리(m). 이 정도 범위에서는 평면 근사로 충분하다 */
function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dy = (aLat - bLat) * 111_320
  const dx = (aLng - bLng) * 111_320 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180)
  return Math.round(Math.hypot(dx, dy))
}

function hoursText(open: string, close: string) {
  if (!open || !close) return ''
  if (open.startsWith('00:00') && close.startsWith('24:00')) return '24시간'
  return `${open} ~ ${close}`
}

const TYPE_LABEL: Record<string, string> = {
  '1': '공영 노상',
  '2': '공영 노외',
  '3': '민영 노외',
  '4': '부설주차장',
}

interface Lot {
  id: string
  name: string
  gu: string
  addr: string
  type: string
  total: number
  /** null = 기본정보 제공 주차장(실시간 연동 없음). 0 과 완전히 다른 뜻이다 */
  available: number | null
  fee: string
  dayMax: string
  hours: string
  tel: string
  lat: number        // ★ 실제 위도 (카카오맵)
  lng: number        // ★ 실제 경도
  realLat: number    // 길안내 코드 호환용 — lat 과 같은 값
  realLng: number
  updated: number
  near: [string, number][]
}

/** 실시간 데이터셋에서 뽑아 둘 값 */
interface RtInfo {
  lat: number
  lng: number
  tel: string
  fee: string
  /** null = 태그가 비어 있음 → 이 주차장은 실시간 연동이 아니다 */
  totalQty: number | null
  resQty: number | null
}

let cache: { at: number; data: Lot[] } | null = null

const dataPath = (f: string) => path.join(process.cwd(), 'data', f)

/**
 * 요금 문구를 만든다.
 * 실시간 데이터셋에는 기본시간·기본요금·추가시간·추가요금이 숫자로 들어 있어서
 * "10분 300원 · 이후 15분당 300원" 같은 실제 안내를 만들 수 있다.
 */
function feeFromRealtime(item: Record<string, unknown>): string {
  const type = str(item.type)
  if (type === '무료') return '무료'

  const baseTime = num(item.baseTime)
  const baseRate = num(item.baseRate)
  const addTime = num(item.addTime)
  const addRate = num(item.addRate)

  const parts: string[] = []
  if (baseTime > 0 && baseRate > 0) {
    parts.push(`${baseTime}분 ${baseRate.toLocaleString()}원`)
  } else if (baseTime > 0 && baseRate === 0) {
    parts.push(`최초 ${baseTime}분 무료`)
  }
  if (addTime > 0 && addRate > 0) {
    parts.push(`이후 ${addTime}분당 ${addRate.toLocaleString()}원`)
  }
  return parts.join(' · ')
}

/** 정적 데이터셋만 가지고 만드는 요금 문구 (짝을 못 찾았을 때의 대비) */
function feeFromStatic(freeMin: number, additional: string): string {
  const parts: string[] = []
  if (freeMin > 0) parts.push(`최초 ${freeMin}분 무료`)
  if (additional) parts.push(additional)
  return parts.join(' · ')
}

/**
 * 실시간 데이터셋을 읽어 좌표별 정보로 만든다.
 * 16개 페이지를 이어붙인 파일이라 <?xml?> 과 <response> 가 여러 번 반복된다.
 * 통째로 파싱하면 실패하므로 <item> 블록만 뽑아 하나씩 읽는다.
 */
async function loadRealtime(): Promise<RtInfo[]> {
  let raw: string
  try {
    raw = await readFile(dataPath('realtime.xml'), 'utf-8')
  } catch {
    return []   // 파일이 없어도 정적 데이터만으로 동작한다
  }

  const xml = raw.replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, '&amp;')
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false })
  const out: RtInfo[] = []

  for (const m of xml.matchAll(/<item>[\s\S]*?<\/item>/g)) {
    let node: Record<string, unknown>
    try {
      node = (parser.parse(m[0]) as { item?: Record<string, unknown> }).item ?? {}
    } catch {
      continue
    }

    const lat = num(node.lat)
    const lng = num(node.lon)
    if (!lat || !lng) continue

    // ★ 빈 태그(<totalQty />)는 파서가 '' 로 준다. 그게 "실시간 연동 아님" 신호다
    const tq = str(node.totalQty)
    const rq = str(node.resQty)

    out.push({
      lat,
      lng,
      tel: str(node.tel),
      fee: feeFromRealtime(node),
      totalQty: tq === '' ? null : Number(tq),
      resQty: rq === '' ? null : Number(rq),
    })
  }

  return out
}

/** 좌표가 같은 실시간 항목을 찾는다. 이름은 표기가 달라 못 쓴다
 *  ('대흥동제3노외' vs '대흥동 제3노외 주차장') */
function matchRealtime(rt: RtInfo[], lat: number, lng: number): RtInfo | undefined {
  return rt.find(
    (r) => Math.abs(r.lat - lat) < MATCH_EPS && Math.abs(r.lng - lng) < MATCH_EPS,
  )
}

async function loadLots(): Promise<Lot[]> {
  const rt = await loadRealtime()

  // 이 API 는 주차장 이름에 & 를 이스케이프 없이 넣어 보낸다
  // ('대전신세계 Art & Science') — 그대로 파싱하면 그 지점에서 XML 이 끊긴다
  const fileText = await readFile(dataPath('lots.xml'), 'utf-8')
  const xml = fileText.replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, '&amp;')

  const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml)

  const code = String(parsed?.response?.header?.resultCode ?? '')
  if (code && code !== '00') {
    throw new Error(`공공 API ${code} ${parsed?.response?.header?.resultMsg ?? ''}`)
  }

  const raw = parsed?.response?.body?.['PARKING-LIST']?.PARKING
  const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : raw ? [raw] : []
  const now = Date.now()

  return rows
    .filter((r) => str(r.DIVIDE_NUM) === '6')      // 6:공영 / 7:민간
    .map((r): Lot => {
      const lat = num(r.LAT)
      const lng = num(r.LON)
      const hit = matchRealtime(rt, lat, lng)
      const live = hit?.totalQty != null           // ★ 실시간 연동 주차장인가

      // 총 면수 — 실시간 쪽이 더 최신이지만 0 이면 못 믿으니 정적 값으로 돌아간다
      const staticTotal = Math.max(num(r.TOTAL_PARKING_LOT), num(r.AVAILABLE_TOTAL_LOT))
      const total = live && (hit!.totalQty as number) > 0 ? (hit!.totalQty as number) : staticTotal

      // 잔여 대수 — 실시간 연동이 아니면 null. 0 으로 채우면 "만차"로 읽힌다
      let available: number | null = null
      if (live && total > 0) {
        available = Math.max(0, Math.min(total, hit!.resQty ?? 0))
      }

      const dist = distM(lat, lng, DEMO_STORE.lat, DEMO_STORE.lng)

      return {
        id: str(r.PARKING_ID),
        name: str(r.NAME),
        gu: guOf(str(r.ADDR01)) || guOf(str(r.ADDR02)),
        addr: str(r.ADDR02) || str(r.ADDR01),
        type: TYPE_LABEL[str(r.TYPE_NUM)] ?? '공영주차장',
        total,
        available,
        // 실시간 데이터셋의 요금표가 훨씬 정확하다. 짝을 못 찾으면 정적 값으로 돌아간다
        fee: hit?.fee || feeFromStatic(num(r.FREECHARGE_BASETIME), str(r.ADDITIONAL)),
        dayMax: '',
        hours: hoursText(str(r.WEEKDAY_OPEN_TIME), str(r.WEEKDAY_CLOSE_TIME)),
        // 010-1234-5678 은 이 데이터셋의 자리채움 값이다. 손님에게 보여 주면 안 된다
        tel: hit?.tel && hit.tel !== '010-1234-5678' ? hit.tel : '',
        lat,
        lng,
        realLat: lat,
        realLng: lng,
        updated: now,
        near: dist <= NEAR_MAX_M ? [[DEMO_STORE.id, dist]] : [],
      }
    })
    .filter((l) =>
      l.id && l.name && l.total > 0 &&
      l.lat >= BBOX.minLat && l.lat <= BBOX.maxLat &&
      l.lng >= BBOX.minLng && l.lng <= BBOX.maxLng,
    )
    // 실시간 연동 주차장을 앞에 둔다. 뒤쪽이 잘려도 초록 마커는 살아남는다
    .sort((a, b) => {
      const la = a.available == null ? 1 : 0
      const lb = b.available == null ? 1 : 0
      if (la !== lb) return la - lb
      return distM(a.lat, a.lng, DEMO_STORE.lat, DEMO_STORE.lng)
           - distM(b.lat, b.lng, DEMO_STORE.lat, DEMO_STORE.lng)
    })
    .slice(0, 40)
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } })
    }

    const data = await loadLots()
    cache = { at: Date.now(), data }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[GET /api/lots]', e)

    // 화면을 비우지 않는다. 오래된 값이 빈 지도보다 낫다
    if (cache) {
      return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(
      { error: 'LOTS_FETCH_FAILED', message: '공영주차장 정보를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}