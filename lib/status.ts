import { LEVEL, type LevelToken } from './tokens';
import type { ParkingSlot, PartnerStore, PublicLot, SlotStatus, StoreTable } from './types';

/**
 * 상태 계산 함수
 * ─────────────────────────────────────────────────────────────
 * ★ 이 파일이 이 서비스의 핵심 비즈니스 로직이다.
 *   화면 컴포넌트에서 status 를 직접 계산하지 말고 반드시 여기 함수를 부를 것.
 *
 * [C15] 변경 — seatStats / parkStats 에 "서버 집계 우선" 분기를 추가했다.
 *   GET /api/stores 목록 응답에는 tables[] · slots[] 배열이 없다. 배열을 셀 수
 *   없으니 서버가 준 store.agg 를 쓴다. 배열이 있어도 agg 가 이긴다 — 노트북 두
 *   대가 같은 숫자를 봐야 하기 때문이다.
 *   ★ 단, 주차면 '한 칸'의 최종 상태는 여전히 slotStatus() 가 판단한다. 서버가
 *     계산하지 않는다는 결정은 그대로다.
 */

/**
 * 주차면 한 칸의 최종 상태.
 * 관리자가 손으로 지정한 값이 살아 있으면 그게 이기고, 만료됐으면 센서 값으로 돌아간다.
 * 이렇게 두 필드를 나눠 둔 덕분에 센서(D)와 관리자(B)가 서로 값을 덮어쓰지 않는다.
 */


export function slotStatus(s: ParkingSlot): SlotStatus {
  if (s.manualStatus && s.manualUntil && s.manualUntil > Date.now()) return s.manualStatus;
  return s.autoStatus;
}
/* ── 센서 오프라인 판정 (이슈 #91) ─────────────────────────────────
 *
 * 센서 데이터를 우리가 당겨오는(GET) 게 아니라 중계 서버가 밀어 넣는(POST)
 * 구조다. 받는 쪽은 "안 보내는 것"과 "죽은 것"을 구분할 수 없다.
 * /api/detect 는 들어올 때마다 Store.sensor 를 'online' 으로 쓰기만 하고,
 * 'offline' 으로 되돌리는 코드가 어디에도 없었다. 그래서 중계 서버가 죽으면
 * 앱이 영원히 "정상 감지 중" + 마지막 값을 보여줬다.
 * → "가능하다고 했는데 가보니 없다". 이 서비스에서 제일 치명적인 실패다.
 *
 * Vercel Hobby 플랜은 크론이 하루 1회라 배치로 못 돌린다. 그래서 쓸 때가
 * 아니라 읽을 때 계산한다. GET /api/stores 와 GET /api/stores/[id] 가 부른다.
 */

/** 이 시간 넘게 소식이 없으면 오프라인. 중계 서버 하트비트(60초)의 3배 */
export const SENSOR_OFFLINE_MS = 180_000;

export function sensorOffline(a: {
  /** DB 의 Store.sensor */
  stored: string | null | undefined;
  /** Store.parkingUpdated (ms) */
  updated: number | null | undefined;
  /**
   * 이 매장 주차면 중 lastSeenAt 이 하나라도 있는가
   * = 센서가 실제로 연결된 적이 있는 매장인가.
   *
   * ★ 이 조건이 없으면 목업 매장(s2·s3)이 3분 뒤 전부 '확인 불가'가 된다.
   *   센서를 단 적이 없는 매장까지 "센서가 죽었다"고 말하는 건 틀린 말이다.
   *   나중에 전 매장에 센서가 깔리면 Store 에 sensorManaged 같은 칼럼을
   *   두고 이 휴리스틱을 걷어내는 게 맞다.
   */
  everSeen: boolean;
  now?: number;
}): boolean {
  // 관리자가 손으로 끈 것은 항상 이긴다
  if (a.stored === 'offline') return true;
  if (!a.everSeen) return false;
  if (!a.updated) return true;
  return (a.now ?? Date.now()) - a.updated > SENSOR_OFFLINE_MS;
}
export interface SeatStats {
  total: number;
  available: number;
  occupied: number;
  cleaning: number;
  reserved: number;
  disabled: number;
  maxParty: number;
}

/**
 * 좌석 집계.
 * 손님 화면에는 이용 가능 / 사용 중 / 정리 중 세 가지만 보여준다.
 * 예약(reserved)은 손님 입장에서 '사용 중'과 구분할 이유가 없으므로 합쳐서 센다.
 */
export function seatStats(store: PartnerStore): SeatStats {
  const t: StoreTable[] = store.tables;

  // 배치도에 쓸 최대 인원은 배열에서만 알 수 있다 (서버 집계에는 없다)
  const maxParty = Math.max(
    0,
    ...t.filter((x) => x.status === 'available').map((x) => x.seats),
  );

  const g = store.agg?.seats;
  if (g) {
    return {
      total: g.total,
      available: g.available,
      occupied: g.occupied + g.reserved,   // 손님 눈에는 둘이 같다
      cleaning: g.cleaning,
      reserved: g.reserved,
      disabled: Math.max(0, g.total - g.available - g.occupied - g.reserved - g.cleaning),
      maxParty,
    };
  }

  const available = t.filter((x) => x.status === 'available').length;
  return {
    total: t.length,
    available,
    occupied: t.filter((x) => x.status === 'occupied' || x.status === 'reserved').length,
    cleaning: t.filter((x) => x.status === 'cleaning').length,
    reserved: t.filter((x) => x.status === 'reserved').length,
    disabled: t.filter((x) => x.status === 'disabled').length,
    maxParty,
  };
}

export interface ParkStats {
  total: number;
  available: number | null;
  occupied: number | null;
  unknown: number | null;
  manual: number;
  offline: boolean;
}

/**
 * 입점 식당 주차장 집계 (센서 기준).
 *
 * ★ 원칙 — 불확실을 가능으로 세지 않는다.
 *   'unknown'(센서 값이 흔들리는 면)은 available 에 넣지 않는다.
 *   "가능하다고 했는데 가보니 없다"가 이 서비스에서 가장 치명적인 실패이기 때문이다.
 *
 * ★ 센서가 죽으면 available 을 0이 아니라 null 로 준다.
 *   0으로 주면 화면에 "만차"로 보이는데, 사실은 "모른다"이므로 완전히 다른 이야기다.
 */
export function parkStats(store: PartnerStore): ParkStats {
  const s = store.parking.slots;

  // 수동 지정이 몇 개 살아 있는지는 항상 배열에서 센다 (만료 판단이 클라이언트 몫이므로)
  const manual = s.filter(
    (x) => x.manualStatus && x.manualUntil !== null && x.manualUntil > Date.now(),
  ).length;

  if (store.sensor === 'offline') {
    const total = store.agg?.parking?.total ?? s.length;
    return { total, available: null, occupied: null, unknown: null, manual: 0, offline: true };
  }

  const g = store.agg?.parking;
  if (g && g.available !== null) {
    const unknown = g.unknown ?? 0;
    return {
      total: g.total,
      available: g.available,
      occupied: Math.max(0, g.total - g.available - unknown),
      unknown,
      manual,
      offline: false,
    };
  }

  const st = s.map(slotStatus);
  return {
    total: s.length,
    available: st.filter((x) => x === 'available').length,
    occupied: st.filter((x) => x === 'occupied').length,
    unknown: st.filter((x) => x === 'unknown').length,
    manual,
    offline: false,
  };
}

/**
 * [b7] 배치 편집에서 '주차면 추가' 를 눌렀을 때 붙일 다음 번호.
 *
 * ★ 접두사를 'A' 로 고정하지 않는다.
 *   s1 은 아두이노 모형과 맞추느라 P1~P10 을 쓴다. 접두사를 고정해 두면
 *   P 배치에 A11 이 섞여 들어가고, 센서 쪽 설정과 글자가 어긋난 면이 생긴다.
 *   POST /api/detect 는 code 로만 주차면을 찾으므로 그 면은 영영 안 바뀐다.
 *   그래서 지금 있는 면들이 쓰는 접두사를 그대로 이어 쓴다.
 *
 * 접두사가 여러 개면(A·B 를 같이 쓰는 매장) 가장 많이 쓰는 쪽을 따른다.
 * 주차면이 하나도 없으면 'P' 로 시작한다.
 */
export function nextSlotCode(slots: { code: string }[]): string {
  const count = new Map<string, number>();
  let maxNum = 0;

  for (const s of slots) {
    const m = /^([A-Za-z]+)(\d*)$/.exec(s.code);
    if (!m) continue;
    count.set(m[1], (count.get(m[1]) ?? 0) + 1);
    maxNum = Math.max(maxNum, Number(m[2] || 0));
  }

  let prefix = 'P';
  let best = 0;
  count.forEach((n, p) => { if (n > best) { best = n; prefix = p; } });

  return `${prefix}${maxNum + 1}`;
}

/** 공영주차장은 잔여 대수만 알 수 있다 (면 단위 정보가 없다) */
export const lotStats = (lot: PublicLot) => ({
  total: lot.total,
  available: lot.available,
  occupied: lot.available == null ? null : lot.total - lot.available,
});

/**
 * 잔여 비율 → 여유도 등급
 *
 * [b7] unknown 을 함께 본다.
 *   센서가 아직 한 번도 값을 안 줬거나 전부 흔들리면 available 은 0 이 된다.
 *   그걸 '만차'로 그리면 "자리 없음"이라고 단정하는 셈인데, 사실은 '모른다'다.
 *   README 의 원칙 그대로 — 0(만차)과 '모른다'는 완전히 다른 이야기다.
 *   공영주차장(lotStats)은 unknown 필드가 없어서 예전과 똑같이 동작한다.
 */
export function levelOf(
  st: { total: number; available: number | null; unknown?: number | null } | null | undefined,
): LevelToken {
  if (!st || st.available == null) return LEVEL.none;
  if (st.available === 0 && (st.unknown ?? 0) > 0) return LEVEL.none;
  if (st.available === 0) return LEVEL.full;
  const r = st.available / st.total;
  return r >= 0.3 ? LEVEL.plenty : r >= 0.12 ? LEVEL.some : LEVEL.few;
}

/** 예약 상세에서 쓰는 통합 주차 목록 — 매장 주차장 + 주변 공영주차장 */
/**
 * 매장 주차장을 손님에게 한 단어로 요약한다.
 *
 * ★ 이 함수를 만든 이유
 *   화면 다섯 군데가 각자 `ps.available === 0 ? '만차'` 를 손으로 쓰고 있었다.
 *   그래서 b7 이 levelOf() 를 고쳤는데도 카드·상세·마커는 여전히 만차라고 말했다.
 *   같은 판단은 한 군데서만 한다. 규칙이 바뀌면 여기만 고친다.
 *
 * 'unsure' 가 되는 경우
 *   · 센서가 죽었다 (offline)            → 아무것도 모른다
 *   · 주차면이 0개다                      → 아직 배치도를 안 만든 매장
 *   · 빈자리 0인데 확인 중인 면이 있다     → 만차인지 아닌지 모른다  ★ 여기가 함정
 *
 * 빈자리가 3, 확인 중이 7 이면 'ok' 다. 3자리는 확실히 있기 때문이다.
 * 불확실을 가능으로 세지 않는다는 원칙은 available 쪽에서 이미 지켜진다.
 */
export type ParkVerdict = 'ok' | 'full' | 'unsure';

export function parkVerdict(ps: ParkStats): ParkVerdict {
  if (ps.offline) return 'unsure';
  if (ps.total === 0) return 'unsure';
  if ((ps.available ?? 0) === 0) {
    return (ps.unknown ?? 0) > 0 ? 'unsure' : 'full';
  }
  return 'ok';
}

export interface ParkingOption {
  kind: 'store' | 'lot';
  id: string;
  name: string;
  dist: number;
  walk: number;
  total: number;
  available: number | null;
  fee: string;
  badge: string;
  /** 확인 중인 면 수. 공영주차장은 이 개념이 없어 null */
  unknown: number | null;
  /** [A6] 길안내에 넘길 실제 위경도. 좌표를 모르면 undefined */
  lat?: number;
  lng?: number;
}

/** 한반도 범위 안의 좌표인가. 퍼센트(0~100)가 남아 있는 데이터를 걸러 낸다 */
const realCoord = (lat?: number, lng?: number) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  lat > 33 && lat < 39 && lng > 124 && lng < 132;

/** 두 점 사이 직선 거리(m) */
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dy = (aLat - bLat) * 111_320;
  const dx = (aLng - bLng) * 111_320 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.round(Math.hypot(dx, dy));
}

export function parkingOptions(store: PartnerStore | null, lots: PublicLot[]): ParkingOption[] {
  const own: ParkingOption[] = store
    ? [{
        kind: 'store',
        id: store.id,
        name: `${store.name} 주차장`,
        dist: 0,
        walk: 1,
        total: parkStats(store).total,
        available: parkStats(store).available,
        unknown: parkStats(store).unknown,
        fee: store.parking.fee,
        badge: '매장 주차장',
        lat: realCoord(store.lat, store.lng) ? store.lat : undefined,
        lng: realCoord(store.lat, store.lng) ? store.lng : undefined,
      }]
    : [];

  /**
   * [A6] 거리를 실제 좌표로 계산한다.
   * 예전에는 id 순서로 만든 가짜 값이었다. 지도에 실제 위치가 찍히기 시작한 이상
   * "가까운 순" 정렬과 지도 위 거리가 어긋나면 손님이 먼저 알아챈다.
   * 좌표가 아직 퍼센트인 데이터가 섞여 있을 수 있으므로, 그때는 예전 방식으로 돌아간다.
   */
  const anchor = realCoord(store?.lat, store?.lng) ? store! : null;

  const near: ParkingOption[] = lots.map((l, i) => {
    const dist = anchor && realCoord(l.lat, l.lng)
      ? metersBetween(anchor.lat, anchor.lng, l.lat, l.lng)
      : 180 + ((i * 137) % 440);
    return {
      kind: 'lot',
      id: l.id,
      name: l.name,
      dist,
      // 도보 속도 67m/분 = 시속 4km
      walk: Math.max(1, Math.round(dist / 67)),
      total: l.total,
      available: l.available,
      unknown: null,          // 공영주차장은 '확인 중' 이라는 상태가 없다
      fee: l.fee,
      badge: '공영주차장',
      lat: realCoord(l.lat, l.lng) ? l.lat : undefined,
      lng: realCoord(l.lat, l.lng) ? l.lng : undefined,
    };
  });

  

  return [...own, ...near];
}