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
  AdminReservation, AdminResStatus, LogEntry, ParkingSlot, PartnerStore, RejectReasonCode, ResStatus,
  Reservation, SensorState, SlotStatus, StoreTable, TableStatus,
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
  menus?: ApiMenu[];
}

/** GET /api/stores/[id] 의 menus 한 줄 */
export interface ApiMenu {
  id: string;
  name: string;
  price: number;
  image?: string;
  signature?: boolean;
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
    // 목록 응답에는 메뉴가 없다. 상세에서 받아 둔 것을 지우지 않는다 —
    // 지우면 3초마다 메뉴 칸이 비었다 채워졌다 한다.
    menus: prev?.menus,
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
    /* [a8] 서버는 진작부터 매장별 메뉴를 내려주고 있었는데 여기서 버리고 있었다.
       그래서 화면이 lib/mock.ts 의 공용 MENUS 6개를 그렸고,
       어느 매장을 열어도 같은 메뉴가 나왔다. */
    menus: (a.menus ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      price: m.price,
      signature: Boolean(m.signature),
    })),
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


/* ── 관리자 예약 ──────────────────────────────────────────
   [a7] GET /api/admin/reservations 응답 → AdminReservation

   서버가 eta·전화번호 서식까지 만들어 보내므로 여기서는 모양만 맞춘다.
   eta 를 클라이언트에서 계산하지 않는 이유 — 노트북 두 대의 시계가 다르면
   같은 예약이 한쪽은 '8분 후', 다른 쪽은 '11분 후'가 된다. 시연에서 바로 보인다. */

export interface ApiAdminRes {
  id: string;
  date: string;
  time: string;
  name: string;
  party: number;
  phone: string;
  status: string;
  memo: string;
  seatType: string;
  eta: string;
  tableId: string | null;
  rejectReason: string | null;
  decidedAt: number | null;
  createdAt: number;
}

/**
 * [b10] 서버가 보낸 상태를 확인하고 받는다.
 *
 * ★ 캐스팅을 없앤 이유
 *   전에는 (a.status as AdminReservation['status']) 였다. DB 는 7종을 보내는데
 *   화면 타입은 4종이라, 거절·취소·방문 완료가 넷 중 하나인 척 통과했다.
 *   TypeScript 는 캐스팅 앞에서 아무 말도 하지 않는다 — 우리가 "맞다고 치자"고
 *   적어 준 것이기 때문이다. 그래서 화면에서 전부 「미방문」으로 보였다.
 *
 *   API 응답은 우리 코드가 아니라 서버가 주는 것이므로 타입이 아니라 값으로 확인해야 한다.
 *   (adaptLog 의 tone 검증과 같은 방식)
 *
 * ★ 모르는 값이 오면 'pending'
 *   가장 눈에 띄는 상태로 떨어뜨린다. 관리자가 "이게 뭐지" 하고 한 번 보게 만드는 쪽이,
 *   조용히 「미방문」으로 묻히는 것보다 낫다. 상태가 또 늘면 여기서 걸린다.
 */
const ADMIN_RES_STATUSES: readonly string[] = [
  'pending', 'upcoming', 'seated', 'done', 'noshow', 'canceled', 'rejected',
];

export function adaptAdminRes(a: ApiAdminRes): AdminReservation {
  const status = ADMIN_RES_STATUSES.includes(a.status)
    ? (a.status as AdminResStatus)
    : 'pending';

  return {
    id: a.id,
    date: a.date,
    time: a.time,
    name: a.name,
    party: a.party,
    phone: a.phone,
    status,
    memo: a.memo ?? '',
    seatType: a.seatType ?? '상관없음',
    eta: a.eta ?? '-',
    createdAt: a.createdAt,
    // [b11] 홀 운영이 예약석 ↔ 예약을 잇는 데 쓴다
    tableId: a.tableId ?? null,
  };
}


/* ── 손님 예약 ────────────────────────────────────────────
   [a7] GET /api/reservations?phone= 응답 → Reservation[]

   서버는 upcoming / past 두 덩어리로 나눠 보낸다. 화면은 한 배열만 읽으므로
   여기서 합친다. 두 덩어리의 필드가 조금 다르다 — past 에는 QR 코드와
   예약자 정보가 없다(지난 예약 상세에 QR 을 띄우지 않는다는 규칙 때문이다).
   비는 자리는 프로필 값으로 채운다. */

export interface ApiResItem {
  id: string;
  status: string;
  storeId: string;
  storeName?: string;
  date: string;
  time: string;
  people: number;
  seatType?: string;
  name?: string;
  phone?: string;
  request?: string;
  receiptUploaded?: boolean;
  reviewWritten?: boolean;
  rejectReason?: string | null;
  decidedAt?: number | null;
}

export interface ApiResList {
  upcoming: ApiResItem[];
  past: ApiResItem[];
}

export function adaptReservation(
  a: ApiResItem,
  me: { name: string; phone: string },
  prev?: Reservation,
): Reservation {
  return {
    id: a.id,
    storeId: a.storeId,
    date: a.date,
    time: a.time,
    party: a.people,
    seatType: a.seatType ?? prev?.seatType ?? '상관없음',
    status: (a.status as ResStatus) ?? 'pending',
    name: a.name ?? prev?.name ?? me.name,
    phone: a.phone ?? prev?.phone ?? me.phone,
    memo: a.request ?? prev?.memo ?? '',
    // 서버에 없는 값 — 손님이 화면에서 켜 둔 것이라 이전 값을 살린다
    parkingAlert: prev?.parkingAlert ?? false,
    exited: a.status === 'done',
    receipt: a.receiptUploaded ?? prev?.receipt ?? false,
    reviewed: a.reviewWritten ?? prev?.reviewed ?? false,
    rejectReason: (a.rejectReason as RejectReasonCode | null) ?? null,
    decidedAt: a.decidedAt ?? null,
  };
}

export function adaptResList(
  list: ApiResList,
  me: { name: string; phone: string },
  before: Reservation[],
): Reservation[] {
  const prev = new Map(before.map((r) => [r.id, r]));
  return [...(list.upcoming ?? []), ...(list.past ?? [])]
    .map((a) => adaptReservation(a, me, prev.get(a.id)));
}

/* ── [b9] 관리자 변경 로그 ──────────────────────────────────
   GET /api/admin/logs 응답 → LogEntry.
   시각 필드 이름이 at(DB) ↔ t(화면) 로 다르다. 그 차이를 여기서만 흡수한다.

   ★ tone 을 검사해서 받는다
     DB enum(LogTone)과 LogEntry['tone'] 유니온이 지금은 정확히 같지만,
     둘은 다른 파일에 있어서 한쪽만 늘어나도 컴파일러가 안 잡아 준다.
     모르는 값이 오면 화면이 색을 못 정해 점이 사라지므로 'ok' 로 떨어뜨린다. */

const LOG_TONES = ['ok', 'warn', 'busy', 'brand', 'off'] as const;

export interface ApiLogEntry {
  id: string;
  at: number;
  who: string;
  msg: string;
  tone: string;
}

export function adaptLog(a: ApiLogEntry): LogEntry {
  const tone = (LOG_TONES as readonly string[]).includes(a.tone)
    ? (a.tone as LogEntry['tone'])
    : 'ok';
  return { t: a.at, who: a.who, msg: a.msg, tone };
}