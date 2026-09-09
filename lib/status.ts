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

/** 공영주차장은 잔여 대수만 알 수 있다 (면 단위 정보가 없다) */
export const lotStats = (lot: PublicLot) => ({
  total: lot.total,
  available: lot.available,
  occupied: lot.total - lot.available,
});

/** 잔여 비율 → 여유도 등급 */
export function levelOf(st: { total: number; available: number | null } | null | undefined): LevelToken {
  if (!st || st.available == null) return LEVEL.none;
  if (st.available === 0) return LEVEL.full;
  const r = st.available / st.total;
  return r >= 0.3 ? LEVEL.plenty : r >= 0.12 ? LEVEL.some : LEVEL.few;
}

/** 예약 상세에서 쓰는 통합 주차 목록 — 매장 주차장 + 주변 공영주차장 */
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
        fee: store.parking.fee,
        badge: '매장 주차장',
      }]
    : [];

  // 거리는 목업이므로 id 로부터 결정적으로 만든다 (렌더할 때마다 값이 바뀌면 안 되므로 난수 금지)
  const near: ParkingOption[] = lots.map((l, i) => {
    const dist = 180 + ((i * 137) % 440);
    return {
      kind: 'lot',
      id: l.id,
      name: l.name,
      dist,
      walk: Math.max(1, Math.round(dist / 67)),
      total: l.total,
      available: l.available,
      fee: l.fee,
      badge: '공영주차장',
    };
  });

  return [...own, ...near];
}
