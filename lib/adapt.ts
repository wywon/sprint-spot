/**
 * API 응답 → 화면이 읽는 타입(lib/types.ts) 변환기
 * ─────────────────────────────────────────────────────────────
 * ★ 왜 이 파일이 필요한가
 *   README의 API 규격과 lib/types.ts 의 필드 이름이 다르다.
 *   (category/cat, address/addr, image/hero, x·y/col·row, statusSince/cleaningAt …)
 *   화면 41개는 types.ts 모양만 읽으므로, 번역을 여기 한 군데에 모아 둔다.
 *   → API 규격이 바뀌면 이 파일만 고치면 된다. 화면은 영원히 안 고친다.
 *
 * ★ 서버가 안 주는 값 (스키마에 없음 — 미해결 항목)
 *   guest · since · resAt · resName · resParty · manualBy · price
 *   → 이전 상태(prev)의 값을 그대로 살려 둔다. 관리자가 방금 '입장' 처리하며
 *     넣은 인원수가 3초 뒤 폴링에 지워지면 안 되기 때문이다.
 */

import type {
  ParkingSlot, PartnerStore, SensorState, SlotStatus, StoreTable, TableStatus,
} from './types';

/* ── API 응답 모양 (README 기준) ───────────────────────────── */

export interface ApiSeats {
  total: number; available: number; occupied: number; reserved: number; cleaning: number;
}

export interface ApiStoreListItem {
  id: string;
  name: string;
  category: string;
  partner: boolean;
  address: string;
  lat: number;
  lng: number;
  image?: string;
  price?: string; // [b4] 이슈때 추가
  tags?: string[];
  rating?: number;
  reviews?: number;
  hours?: { open: string; close: string; isOpen: boolean };
  seats?: ApiSeats;
  parking?: {
    fee: string;
    total: number;
    available: number | null;
    unknown: number | null;
    sensor: SensorState;
    updated: number;
  };
}

export interface ApiTable {
  id: string; code: string; seats: number; status: TableStatus;
  statusSince: number | null; x: number; y: number; w: number;
}

export interface ApiSlot {
  id: string; code: string; zone: string;
  autoStatus: SlotStatus; manualStatus: SlotStatus | null; manualUntil: number | null;
  lastSeenAt: number; type: string | null;
  x: number; y: number; nearGate: boolean; confidence: number;
}

export interface ApiStoreDetail extends ApiStoreListItem {
  phone?: string;
  tables?: ApiTable[];
  parking?: ApiStoreListItem['parking'] & { slots?: ApiSlot[] };
}

/* ── 매장 (목록) ───────────────────────────────────────────── */

/**
 * 목록 응답에는 tables[] · slots[] 이 없다.
 * 그래서 배열은 prev 것을 그대로 이어받고, 숫자는 agg 에 담아 둔다.
 */
export function adaptStore(a: ApiStoreListItem, prev?: PartnerStore): PartnerStore {
  const hours = a.hours;
  const open = hours ? [hours.open, hours.close].filter(Boolean).join(' - ') : (prev?.open ?? '');

  return {
    id: a.id,
    partner: true,
    name: a.name,
    cat: a.category ?? prev?.cat ?? '',
    addr: a.address ?? prev?.addr ?? '',
    tel: prev?.tel ?? '',            // 목록 응답에 없음 — 상세에서 채운다
    open,
    price: a.price ?? prev?.price ?? '',        // API 에 없는 필드
    rating: a.rating ?? prev?.rating ?? 0,
    reviews: a.reviews ?? prev?.reviews ?? 0,
    tags: a.tags ?? prev?.tags ?? [],
    hero: a.image || prev?.hero || '',
    lat: a.lat,
    lng: a.lng,
    // ★ sensor 는 API 에서 parking 안에 들어 있다. types.ts 는 최상위에 둔다.
    sensor: a.parking?.sensor ?? prev?.sensor ?? 'online',
    tables: prev?.tables ?? [],
    tablesUpdated: Date.now(),
    parking: {
      fee: a.parking?.fee ?? prev?.parking.fee ?? '',
      slots: prev?.parking.slots ?? [],
      updated: a.parking?.updated || Date.now(),
    },
    agg: {
      seats: a.seats ?? null,
      parking: a.parking
        ? { total: a.parking.total, available: a.parking.available, unknown: a.parking.unknown }
        : null,
    },
  };
}

/* ── 매장 (상세) — 배열까지 채운다 ─────────────────────────── */

export function adaptStoreDetail(a: ApiStoreDetail, prev?: PartnerStore): PartnerStore {
  const base = adaptStore(a, prev);
  const prevTables = new Map((prev?.tables ?? []).map((t) => [t.id, t]));
  const prevSlots = new Map((prev?.parking.slots ?? []).map((s) => [s.code, s]));

  return {
    ...base,
    tel: a.phone ?? base.tel,
    tables: (a.tables ?? []).map((t) => adaptTable(t, prevTables.get(t.id))),
    tablesUpdated: Date.now(),
    parking: {
      ...base.parking,
      slots: (a.parking?.slots ?? []).map((s) => adaptSlot(s, prevSlots.get(s.code))),
    },
  };
}

/* ── 테이블 한 칸 ──────────────────────────────────────────── */

function adaptTable(t: ApiTable, prev?: StoreTable): StoreTable {
  const status = t.status;
  const busy = status === 'occupied' || status === 'reserved';

  return {
    id: t.id,
    code: t.code,
    seats: t.seats,
    status,
    row: t.y ?? 0,   // ★ API 는 x·y, 화면은 col·row
    col: t.x ?? 0,
    w: t.w ?? 1,

    // 스키마에 없는 값들 — 자리를 비우지 말고 직전 값을 살린다
    guest: busy ? (prev?.guest ?? null) : null,
    since: busy ? (prev?.since ?? null) : null,
    resAt: status === 'reserved' ? (prev?.resAt ?? null) : null,
    resName: status === 'reserved' ? (prev?.resName ?? null) : null,
    resParty: status === 'reserved' ? (prev?.resParty ?? null) : null,

    // 서버가 이미 '40초 지난 정리 중'을 available 로 바꿔서 준다.
    // 그래도 cleaning 인 동안에는 시작 시각이 있어야 화면에서 남은 시간을 그린다.
    cleaningAt: status === 'cleaning' ? (t.statusSince ?? Date.now()) : null,
  };
}

/* ── 주차면 한 칸 ──────────────────────────────────────────── */

function adaptSlot(s: ApiSlot, prev?: ParkingSlot): ParkingSlot {
  return {
    id: s.id,
    code: s.code,
    row: s.y ?? 0,
    col: s.x ?? 0,
    zone: s.zone ?? '',

    // ★ 날것 3개를 그대로 넘긴다. 최종 판단은 lib/status.ts 의 slotStatus() 가 한다.
    autoStatus: s.autoStatus,
    manualStatus: s.manualStatus ?? null,
    manualUntil: s.manualUntil ?? null,

    manualBy: prev?.manualBy ?? null,           // 스키마에 없음
    // ★ API 는 일반 주차면을 'normal' 로 보낸다. types.ts 는 null 이다.
    type: s.type === 'ev' || s.type === 'disabled' ? s.type : null,
    nearGate: Boolean(s.nearGate),
    confidence: typeof s.confidence === 'number' ? s.confidence : 1,
  };
}
