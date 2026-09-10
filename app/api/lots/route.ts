// app/api/lots/route.ts
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { XMLParser } from 'fast-xml-parser'

export const dynamic = 'force-dynamic'

/**
 * 대전시 공영주차장 목록
 * ─────────────────────────────────────────────────────────────
 * 공공데이터포털의 두 데이터셋을 합쳐서 쓴다.
 *
 *   data/lots.xml     「대전광역시_주차장정보 제공 API 서비스2」(15059437)
 *                     위치 · 총 면수 · 공영/민영 구분. 대흥동·은행동 포함
 *   data/realtime.xml 「대전광역시_실시간 주차장 정보」(15083717)
 *                     전화번호 · 정확한 요금표. 좌표로 짝을 맞춘다
 *
 * ★ 왜 실시간 잔여 대수를 안 쓰는가 (전수 조사 결과)
 *   실시간 API 는 실제로 갱신된다 — 갤러리아 타임월드가 30분 만에 547 → 550.
 *   그러나 대흥동·은행동 16곳 중 resQty 에 값이 있는 곳은 대흥동제3노외 한 곳뿐이고,
 *   그 값(33)마저 정적 API 와 동일해 갱신되지 않는다. 16곳 전부 totalQty 가 비어 있다.
 *   실시간 연동은 서구 대형 상업시설에만 되어 있고 원도심은 대상이 아니다.
 *   그래서 available 은 null 로 내려보내고 화면에 "확인 불가"로 표시한다.
 *   0 으로 채우면 "만차"로 보이는데 사실은 "모른다"이다.
 *
 * ★ 왜 파일을 읽는가
 *   공공데이터 게이트웨이가 서버(Node) 요청을 HTTP_ERROR(04) 로 거부한다.
 *   브라우저·curl 은 되는데 fetch·Invoke-WebRequest 는 안 된다.
 *   데이터가 정적이라 매번 호출할 이유가 없어 응답을 저장소에 넣고 읽는다.
 *   갱신이 필요하면 두 파일만 교체하면 된다.
 */

/** 실시간 잔여 대수를 쓸지. 원도심 커버리지가 생기면 true 로 바꾼다 */
const REALTIME = false

const TTL_MS = 60_000

/** 시연 대상 지역 (대흥동 · 은행동 · 소제동). 목업 지도 0~100% 좌표계의 기준이기도 하다 */
const BBOX = { minLat: 36.3150, maxLat: 36.3450, minLng: 127.4150, maxLng: 127.4450 }

/** 두 데이터셋을 좌표로 맞출 때 허용 오차 (약 11m) */
const MATCH_EPS = 0.0001

const clamp = (v: number) => Math.max(4, Math.min(96, v))

/** 실제 위경도 → 목업 지도의 0~100%. 위도는 클수록 북쪽이라 y 를 뒤집는다 */
function toPercent(lat: number, lng: number) {
  return {
    y: clamp(((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * 100),
    x: clamp(((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * 100),
  }
}

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
  available: number | null
  fee: string
  dayMax: string
  hours: string
  tel: string
  lat: number        // 목업 지도 0~100%
  lng: number
  realLat: number    // 실제 위경도 — 길안내·카카오맵용
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
  resQty: number | null
}

let cache: { at: number; data: Lot[] } | null = null

const dataPath = (f: string) => path.join(process.cwd(), 'data', f)

/**
 * 요금 문구를 만든다.
 * 실시간 데이터셋에는 기본시간·기본요금·추가시간·추가요금이 숫자로 들어 있어서
 * "10분 300원 · 이후 15분당 300원" 같은 실제 안내를 만들 수 있다.
 * 정적 데이터셋에는 무료시간뿐이라 "최초 30분 무료" 가 한계였다.
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

    const q = str(node.resQty)
    out.push({
      lat,
      lng,
      tel: str(node.tel),
      fee: feeFromRealtime(node),
      resQty: q === '' ? null : Number(q),
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
      const realLat = num(r.LAT)
      const realLng = num(r.LON)
      const { x, y } = toPercent(realLat, realLng)
      const hit = matchRealtime(rt, realLat, realLng)

      // 총 면수 — 두 필드가 어긋나는 데이터가 있어 큰 쪽을 믿는다
      const total = Math.max(num(r.TOTAL_PARKING_LOT), num(r.AVAILABLE_TOTAL_LOT))

      // 잔여 대수 — 실시간 커버리지가 없어 기본은 null
      let available: number | null = null
      if (REALTIME && hit?.resQty != null && total > 0) {
        available = Math.max(0, Math.min(total, hit.resQty))
      }

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
        tel: hit?.tel && !/^010-1234-5678$/.test(hit.tel) ? hit.tel : '',                        // 정적 데이터셋에는 전화번호가 없다
        lat: y,
        lng: x,
        realLat,
        realLng,
        updated: now,
        near: [],
      }
    })
    .filter((l) =>
      l.id && l.name && l.total > 0 &&
      l.realLat >= BBOX.minLat && l.realLat <= BBOX.maxLat &&
      l.realLng >= BBOX.minLng && l.realLng <= BBOX.maxLng,
    )
    .slice(0, 12)
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