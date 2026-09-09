// app/api/lots/route.ts
import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * 대전시 공영주차장 목록
 * ─────────────────────────────────────────────────────────────
 * 공공데이터포털 「대전광역시_주차장정보 제공 API 서비스2」를 서버가 대신 부른다.
 *
 * ★ 왜 서버가 부르는가
 *   1. 브라우저에서 직접 부르면 CORS 에 막힌다
 *   2. 인증키가 화면 소스에 그대로 노출된다
 *
 * ★ 응답 구조 (실제 호출로 확인)
 *   response > header > resultCode · resultMsg · totalCnt(756) · numOfRows · pageNo
 *   response > body > PARKING-LIST > PARKING[]
 *
 * ★ 문서에 없는 필드가 실제로는 내려온다
 *   AVAILABLE_TOTAL_LOT · AVAILABLE_RES_QTY
 *   AVAILABLE_RES_QTY 가 잔여 대수로 보이지만, 실시간인지 고정값인지 검증 전이다.
 *   검증되기 전에는 REALTIME 을 false 로 두고 available 을 null 로 내려보낸다.
 *   "모른다"를 "몇 자리 남았다"로 바꿔 말하는 것이 이 서비스에서 가장 위험한 거짓말이다.
 */

const ENDPOINT = 'http://apis.data.go.kr/6300000/openapi/rest2/getParkingInfoList.do'

/**
 * ★ 검증 스위치
 *   10분 간격으로 두 번 호출해 AVAILABLE_RES_QTY 가 바뀌면 실시간이 맞다.
 *   확인되면 true 로 바꾼다. 그 전까지는 총 면수만 보여준다.
 */
const REALTIME = false

/** 공공 API 호출 간격. 개발계정은 하루 10,000회다 */
const TTL_MS = 60_000

/** 전체 756건이라 한 번에 다 받는다 */
const NUM_OF_ROWS = 1000

/**
 * 시연 대상 지역만 남긴다 (대흥동 · 은행동 · 소제동).
 * 대전 전체를 지도에 뿌리면 못 쓴다.
 * 이 네 값이 목업 지도 0~100% 좌표계의 기준이기도 하다.
 */
const BBOX = { minLat: 36.3150, maxLat: 36.3450, minLng: 127.4150, maxLng: 127.4450 }

const clamp = (v: number) => Math.max(4, Math.min(96, v))

/** 실제 위경도 → 목업 지도의 0~100%.
 *  MapCanvas 가 퍼센트로 그리므로 36.32 를 그대로 넣으면 화면 밖으로 나간다.
 *  위도는 클수록 북쪽(위)이라 y 를 뒤집는다. */
function toPercent(lat: number, lng: number) {
  return {
    y: clamp(((BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)) * 100),
    x: clamp(((lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * 100),
  }
}

/** 이 API 는 값이 없을 때 빈 칸이 아니라 'NONE' 을 보낸다 */
const str = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s === 'NONE' ? '' : s
}
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** '대덕구 중리동 363-23' → '대덕구' */
const guOf = (addr: string) => addr.split(/\s+/).find((w) => w.endsWith('구')) ?? ''

/** '00:00' ~ '24:00' 은 24시간으로 읽는다 */
function hoursText(open: string, close: string) {
  if (!open || !close) return ''
  if (open.startsWith('00:00') && close.startsWith('24:00')) return '24시간'
  return `${open} ~ ${close}`
}

/** 이 API 에 요금표는 없다. 무료시간과 특이사항으로 문구를 만든다 */
function feeText(freeMin: number, additional: string) {
  const parts: string[] = []
  if (freeMin > 0) parts.push(`최초 ${freeMin}분 무료`)
  if (additional) parts.push(additional)
  return parts.join(' · ')
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

/** 워밍된 서버 인스턴스 안에서만 사는 캐시. 팀 규모엔 이걸로 충분하다 */
let cache: { at: number; data: Lot[] } | null = null

async function fetchLots(): Promise<Lot[]> {
  // ★ 공공데이터포털 게이트웨이가 서버(Node) 요청을 HTTP_ERROR(04) 로 거부한다.
  //   브라우저·curl 로는 되지만 fetch 로는 안 된다. 원인 불명.
  //   이 데이터는 실시간이 아니라 정적이므로, 내려받은 응답을 저장소에 넣고 읽는다.
  //   갱신이 필요하면 data/lots.xml 을 새로 받아 교체하면 된다.
  const fileText = await readFile(path.join(process.cwd(), 'data', 'lots.xml'), 'utf-8')
  // 이 API 는 주차장 이름에 & 를 이스케이프 없이 넣어 보낸다
  // ('대전신세계 Art & Science') — 그대로 파싱하면 그 지점에서 XML 이 끊긴다
  const xml = fileText.replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, '&amp;')

  const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false })
    .parse(xml)

  const code = String(parsed?.response?.header?.resultCode ?? '')
  if (code && code !== '00') {
    throw new Error(`공공 API ${code} ${parsed?.response?.header?.resultMsg ?? ''}`)
  }

  const raw = parsed?.response?.body?.['PARKING-LIST']?.PARKING
  const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : raw ? [raw] : []
  const now = Date.now()

  return rows
    .filter((r) => str(r.DIVIDE_NUM) === '6')      // 6:공영 / 7:민간 — 공영만 얹는다
    .map((r): Lot => {
      const realLat = num(r.LAT)
      const realLng = num(r.LON)
      const { x, y } = toPercent(realLat, realLng)

      // 총 면수 — 두 필드가 서로 어긋나는 데이터가 있어 큰 쪽을 믿는다
      //  (예: 송촌주민센터 TOTAL_PARKING_LOT 72 < AVAILABLE_TOTAL_LOT 93)
      const total = Math.max(num(r.TOTAL_PARKING_LOT), num(r.AVAILABLE_TOTAL_LOT))

      // 잔여 대수 — 실시간이 검증되기 전에는 쓰지 않는다
      let available: number | null = null
      if (REALTIME) {
        const q = num(r.AVAILABLE_RES_QTY)
        available = Math.max(0, Math.min(total, q))
      }

      return {
        id: str(r.PARKING_ID),
        name: str(r.NAME),
        gu: guOf(str(r.ADDR01)),
        addr: str(r.ADDR02) || str(r.ADDR01),
        type: TYPE_LABEL[str(r.TYPE_NUM)] ?? '공영주차장',
        total,
        available,
        fee: feeText(num(r.FREECHARGE_BASETIME), str(r.ADDITIONAL)),
        dayMax: '',
        hours: hoursText(str(r.WEEKDAY_OPEN_TIME), str(r.WEEKDAY_CLOSE_TIME)),
        tel: '',
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
    .slice(0, 12)                                   // 지도가 감당할 만큼만
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } })
    }

    const data = await fetchLots()
    cache = { at: Date.now(), data }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[GET /api/lots]', e)

    // 한도 초과·장애 때 화면을 비우지 않는다. 오래된 값이 빈 지도보다 낫다
    if (cache) {
      return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(
      { error: 'LOTS_FETCH_FAILED', message: '공영주차장 정보를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
