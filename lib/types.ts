/**
 * SPOT 도메인 타입
 * ─────────────────────────────────────────────────────────────
 * 4주차에 Prisma를 붙일 때, 여기 있는 타입이 그대로 Prisma 모델의 모양이 된다.
 * 즉 이 파일이 프론트와 백엔드가 합의하는 계약서다. 필드를 바꾸려면 C와 상의할 것.
 */

/** 주차면 상태 — 센서가 판단한 결과 */
export type SlotStatus =
  | 'available' // 비어 있음
  | 'occupied'  // 차가 있음
  | 'unknown';  // 센서 값이 흔들려서 판단 보류. ★ 이용 가능 수에 넣지 않는다

/** 화면에 실제로 그려지는 상태 (위 3개 + 파생 상태) */
export type SlotView = SlotStatus | 'offline' | 'manual' | 'disabled' | 'ev';

/** 테이블 상태 */
export type TableStatus =
  | 'available' // 빈 자리
  | 'occupied'  // 사용 중
  | 'reserved'  // 예약됨
  | 'cleaning'  // 정리 중 (40초 뒤 자동으로 available 로 돌아간다)
  | 'disabled'; // 이용 불가

/** 매장 주차면 센서의 연결 상태 */
export type SensorState = 'online' | 'offline';

export interface ParkingSlot {
  code: string;          // 'A1' — 관리자만 본다. 손님 화면에는 노출하지 않는다
  row: number;
  col: number;
  zone: string;
  /** 센서가 보고한 값. 센서 팀(D)만 이 필드를 쓴다 */
  autoStatus: SlotStatus;
  /** 관리자가 손으로 지정한 값. 관리자(B)만 이 필드를 쓴다 */
  manualStatus: SlotStatus | null;
  /** 수동 지정 만료 시각(ms). 지나면 자동으로 센서 값으로 돌아간다 */
  manualUntil: number | null;
  manualBy: string | null;
  type: 'ev' | 'disabled' | null;
  nearGate: boolean;
  confidence: number;
}

export interface StoreTable {
  id: string;            // 't1' — ★ 손님 화면에 절대 노출하지 않는다
  seats: number;
  status: TableStatus;
  row: number;
  col: number;
  w: number;             // 배치도에서 차지하는 칸 수 (1 또는 2)
  guest: number | null;
  since: string | null;  // '12:04'
  cleaningAt: number | null;
  resAt: string | null;
  resName: string | null;
  resParty: number | null;
}

/** 입점 식당 — 주차장을 보유하고 주차면마다 센서가 달려 있다 */
export interface PartnerStore {
  id: string;
  partner: true;
  name: string;
  cat: string;
  addr: string;
  tel: string;
  open: string;
  price: string;
  rating: number;
  reviews: number;
  tags: string[];
  hero: string;          // tailwind gradient 클래스 (실제 서비스에서는 이미지 URL)
  lat: number;           // 목업 지도 좌표 (0~100 %)
  lng: number;
  sensor: SensorState;
  tables: StoreTable[];
  tablesUpdated: number;
  parking: {
    fee: string;
    slots: ParkingSlot[];
    updated: number;
  };
}

/** 미입점 식당 — 지도에 상호명만 뜨고 예약 버튼이 비활성이다 */
export interface PlainStore {
  id: string;
  partner: false;
  name: string;
  cat: string;
  lat: number;
  lng: number;
}

export type AnyStore = PartnerStore | PlainStore;

/** 공영주차장 — 지자체 공공 API에서 받아온다고 가정 (잔여 대수만 안다) */
export interface PublicLot {
  id: string;
  name: string;
  gu: string;
  addr: string;
  type: string;
  total: number;
  available: number;
  fee: string;
  dayMax: string;
  hours: string;
  tel: string;
  lat: number;
  lng: number;
  updated: number;
  /** [식당id, 도보 거리(m)] */
  near: [string, number][];
}

export interface Reservation {
  id: string;
  storeId: string;
  date: string;          // '2026-08-24'
  time: string;          // '12:30'
  party: number;
  seatType: string;
  status: 'upcoming' | 'done' | 'canceled';
  name: string;
  phone: string;
  memo: string;
  parkingAlert?: boolean;
  exited?: boolean;      // 관리자가 퇴장 처리했는가
  receipt?: boolean;     // 손님이 영수증을 올렸는가 → 리뷰쓰기 활성 조건
  reviewed?: boolean;
}

/** 관리자 화면의 오늘 예약 */
export interface AdminReservation {
  id: string;
  time: string;
  name: string;
  party: number;
  phone: string;
  status: 'upcoming' | 'seated' | 'noshow';
  memo: string;
  eta: string;
}

export interface Review {
  id: string;
  storeId: string;
  name: string;
  rating: number;
  date: string;
  text: string;
}

export interface Toast {
  id: string;
  title: string;
  desc?: string;
  tone?: 'brand' | 'ok' | 'warn' | 'busy' | 'off';
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

export interface LogEntry {
  t: number;
  who: string;
  msg: string;
  tone: 'ok' | 'warn' | 'busy' | 'brand' | 'off';
}

//프로필 수정에 사용하는 profile 객체 생성 store.tsx에 선언한 ME 객체에 맞춤
export type CarType = '경차' | '중형' | '대형' | '전기차';

export interface Profile {
  name: string;
  phone: string;
  car: string;
  carType: CarType;
}