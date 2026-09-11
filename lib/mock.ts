import { pad } from './format';
import type {
  AdminReservation, ParkingSlot, PartnerStore, PlainStore, PublicLot,
  Reservation, Review, SlotStatus, StoreTable, TableStatus, Profile
} from './types';

/**
 * 목업 데이터 — 대전 중구 은행동 · 대흥동 원도심
 * ─────────────────────────────────────────────────────────────
 * ★ 1~3주차 동안 모든 화면은 이 파일만 보고 만든다.
 *   화면 담당(A·B)은 DB 담당(C)을 기다릴 필요가 없다.
 *   4주차에 이 파일을 import 하던 자리를 fetch('/api/...') 로 바꾸면 끝난다.
 *
 * ★ 규칙 — 여기 있는 필드 이름은 lib/types.ts 와 정확히 같아야 한다.
 *   이름이 다르면 4주차 교체 때 화면을 다시 고쳐야 한다.
 */

/* ── 생성 헬퍼 ───────────────────────────────────────────── */

interface SlotRow {
  zone: string;
  codes: string[];
  status: SlotStatus[];
  gate?: string[];
  type?: (('ev' | 'disabled') | null)[];
}

function mkSlots(rows: SlotRow[]): ParkingSlot[] {
  const out: ParkingSlot[] = [];
  rows.forEach((r, ri) =>
    r.codes.forEach((code, ci) =>
      out.push({
        code,
        row: ri,
        col: ci,
        zone: r.zone,
        autoStatus: r.status[ci],
        manualStatus: null,
        manualUntil: null,
        manualBy: null,
        type: (r.type && r.type[ci]) || null,
        nearGate: r.gate ? r.gate.includes(code) : false,
        confidence: r.status[ci] === 'unknown' ? 0.42 : 0.98,
      })
    )
  );
  return out;
}

interface TableSpec {
  id: string; seats: number; status: TableStatus; row: number; col: number;
  w?: number; guest?: number; since?: string; resAt?: string; resName?: string; resParty?: number;
}

function mkTables(spec: TableSpec[]): StoreTable[] {
  return spec.map((t) => ({
    id: t.id, code: t.id, seats: t.seats, status: t.status, row: t.row, col: t.col, w: t.w || 1,
    guest: t.guest ?? null, since: t.since ?? null, cleaningAt: null,
    resAt: t.resAt ?? null, resName: t.resName ?? null, resParty: t.resParty ?? null,
  }));
}

/* ── 대표 메뉴 ───────────────────────────────────────────── */

export const MENUS: [string, string][] = [
  ['두부두루치기', '14,000'], ['칼국수', '9,000'], ['수육 한 접시', '22,000'],
  ['모둠전', '18,000'], ['냉면', '11,000'], ['공깃밥', '1,000'],
];

/* ── 입점 식당 (제휴) ────────────────────────────────────── */

export const PARTNER_STORES: PartnerStore[] = [
  {
    id: 's1', partner: true, name: '대흥동 손칼국수', cat: '한식 · 칼국수', addr: '대전 중구 대흥동 218-4',
    tel: '042-256-1234', open: '10:30 - 20:00', price: '8,000~14,000원', rating: 4.5, reviews: 1240,
    tags: ['혼밥 OK', '포장', '주차 가능'], hero: 'from-orange-300 via-amber-400 to-orange-500',
    lat: 36.36572, lng: 127.43608, sensor: 'online', tablesUpdated: 0,
    tables: mkTables([
      { id: 't1', seats: 2, status: 'occupied', row: 0, col: 0, guest: 2, since: '12:04' },
      { id: 't2', seats: 2, status: 'available', row: 0, col: 1 },
      { id: 't3', seats: 4, status: 'occupied', row: 0, col: 2, guest: 4, since: '11:52' },
      { id: 't4', seats: 4, status: 'reserved', row: 0, col: 3, resAt: '12:30', resName: '박민지', resParty: 4 },
      { id: 't5', seats: 4, status: 'available', row: 1, col: 0 },
      { id: 't6', seats: 4, status: 'cleaning', row: 1, col: 1 },
      { id: 't7', seats: 6, status: 'occupied', row: 1, col: 2, guest: 5, since: '12:10', w: 2 },
      { id: 't8', seats: 2, status: 'available', row: 2, col: 0 },
      { id: 't9', seats: 2, status: 'occupied', row: 2, col: 1, guest: 2, since: '12:22' },
      { id: 't10', seats: 4, status: 'available', row: 2, col: 2 },
      { id: 't11', seats: 8, status: 'reserved', row: 2, col: 3, resAt: '13:00', resName: '최영호', resParty: 7 },
      { id: 't12', seats: 4, status: 'disabled', row: 3, col: 0 },
    ]),
    parking: {
      fee: '식사 시 1시간 무료 · 이후 10분 300원', updated: 0,
      /**
       * ★ 시연용 — 아두이노 주차장 미니어처 도면과 1:1로 맞춘 배치다.
       *
       *   모형은 가운데 주행통로를 사이에 두고 주차면이 마주 본다.
       *     왼쪽 줄 6면 P1~P6 · 오른쪽 줄 4면 P7~P10
       *     오른쪽 줄(P7~P10)은 왼쪽의 P1~P4 와 같은 칸에 나란히 선다.
       *   SlotGrid 는 줄을 가로로 그리므로, 모형을 시계 방향으로 90도 돌린 모양이다.
       *   입출차 감지 센서와 LED 가 붙은 쪽 끝이 P6·P10 이라 이 둘만 nearGate 다.
       *
       * ★ code 는 아두이노 Serial 의 '1번~10번' 과 그대로 대응한다 (P{n} ↔ n번).
       *   노트북 중계 서버가 POST /api/detect 로 보낼 때
       *     { storeId: 's1', slots: [{ code: 'P1', status: 'occupied' }, …] }
       *   형태면 바로 붙는다. 여기 번호를 바꾸면 센서 쪽 설정도 같이 바꿔야 한다.
       *
       * ★ 아래 status 는 아두이노를 붙이기 전 초깃값일 뿐이다.
       *   /api/detect 가 한 번 들어오면 전부 실제 센서 값으로 덮어쓴다.
       */
      slots: mkSlots([
        { zone: 'A', codes: ['P1','P2','P3','P4','P5','P6'], status: ['occupied','available','occupied','available','occupied','available'], gate: ['P6'] },
        { zone: 'B', codes: ['P7','P8','P9','P10'],          status: ['occupied','occupied','unknown','available'],                        gate: ['P10'] },
      ]),
    },
  },
  {
    id: 's2', partner: true, name: '은행동 두부두루치기', cat: '한식 · 향토음식', addr: '대전 중구 은행동 145',
    tel: '042-253-8080', open: '11:00 - 22:00', price: '12,000~18,000원', rating: 4.7, reviews: 3820,
    tags: ['대전 향토음식', '단체석', '주차 가능'], hero: 'from-amber-300 via-orange-400 to-red-500',
    lat: 36.36540, lng: 127.43780, sensor: 'online', tablesUpdated: 0,
    tables: mkTables([
      { id: 't1', seats: 2, status: 'available', row: 0, col: 0 },
      { id: 't2', seats: 4, status: 'occupied', row: 0, col: 1, guest: 4, since: '12:31' },
      { id: 't3', seats: 4, status: 'available', row: 0, col: 2 },
      { id: 't4', seats: 4, status: 'occupied', row: 1, col: 0, guest: 2, since: '12:05' },
      { id: 't5', seats: 6, status: 'available', row: 1, col: 1, w: 2 },
      { id: 't6', seats: 2, status: 'occupied', row: 2, col: 0, guest: 2, since: '12:50' },
      { id: 't7', seats: 2, status: 'available', row: 2, col: 1 },
      { id: 't8', seats: 4, status: 'reserved', row: 2, col: 2, resAt: '19:00', resName: '정우성', resParty: 3 },
    ]),
    parking: {
      fee: '식사 시 2시간 무료', updated: 0,
      slots: mkSlots([
        { zone: 'A', codes: ['A1','A2','A3','A4','A5','A6'], status: ['available','occupied','available','occupied','occupied','available'], gate: ['A1','A2'] },
        { zone: 'A', codes: ['A7','A8','A9','A10','A11','A12'], status: ['occupied','occupied','available','available','occupied','occupied'] },
      ]),
    },
  },
  {
    // ★ 센서가 죽어 있는 매장. "정상 케이스만 만들다가 예외를 나중에 붙이는" 실수를 막으려고
    //   일부러 처음부터 offline 매장을 하나 넣어 뒀다. 화면 만들 때 이 매장으로도 꼭 확인할 것.
    id: 's3', partner: true, name: '소제동 브런치하우스', cat: '브런치 · 카페', addr: '대전 동구 소제동 89',
    tel: '042-631-2200', open: '09:30 - 18:00', price: '12,000~19,000원', rating: 4.5, reviews: 1580,
    tags: ['카페거리', '예약 권장', '주차 가능'], hero: 'from-lime-200 via-emerald-300 to-teal-400',
    lat: 36.36640, lng: 127.43700, sensor: 'offline', tablesUpdated: 0,
    tables: mkTables([
      { id: 't1', seats: 2, status: 'available', row: 0, col: 0 },
      { id: 't2', seats: 2, status: 'available', row: 0, col: 1 },
      { id: 't3', seats: 4, status: 'occupied', row: 0, col: 2, guest: 3, since: '11:40' },
      { id: 't4', seats: 4, status: 'available', row: 1, col: 0 },
      { id: 't5', seats: 6, status: 'occupied', row: 1, col: 1, guest: 6, since: '12:15', w: 2 },
      { id: 't6', seats: 2, status: 'available', row: 2, col: 0 },
    ]),
    parking: {
      fee: '최초 30분 무료 · 이후 10분 500원', updated: 0,
      slots: mkSlots([
        { zone: 'A', codes: ['A1','A2','A3','A4','A5','A6'], status: ['occupied','available','occupied','available','occupied','occupied'], gate: ['A1'] },
        { zone: 'A', codes: ['A7','A8','A9','A10','A11','A12'], status: ['available','occupied','occupied','available','occupied','available'] },
      ]),
    },
  },
];

/* ── 미입점 식당 — 지도에 상호명만 뜬다 ────────────────── */

export const PLAIN_STORES: PlainStore[] = [
  { id: 'p1', partner: false, name: '중앙시장 손만두',   cat: '한식 · 만두', lat: 36.36530, lng: 127.43660 },
  { id: 'p2', partner: false, name: '목척교 순대국밥',   cat: '한식 · 국밥', lat: 36.36600, lng: 127.43530 },
  { id: 'p3', partner: false, name: '중교로 왕갈비',     cat: '한식 · 갈비', lat: 36.36510, lng: 127.43740 },
  { id: 'p4', partner: false, name: '은행동 스시',       cat: '일식 · 스시', lat: 36.36620, lng: 127.43840 },
  { id: 'p5', partner: false, name: '선화동 삼겹살',     cat: '한식 · 고기', lat: 36.36480, lng: 127.43700 },
  { id: 'p6', partner: false, name: '원도심 정미소커피', cat: '카페',        lat: 36.36660, lng: 127.43580 },
];

/* ── 공영주차장 ─────────────────────────────────────────── */

export const PUBLIC_LOTS: PublicLot[] = [
  {
    // 실시간 · 여유
    id: '1872000024', name: '송촌소리 공영주차장', gu: '대전 대덕구', addr: '동춘당로',
    type: '공영 노외', total: 24, available: 20, fee: '무료', dayMax: '',
    hours: '24시간', tel: '042-608-5292', lat: 36.3669033, lng: 127.4362728, updated: 0,
    near: [['s1', 210]],
  },
  {
    // 실시간 · 여유 (면수가 많은 쪽)
    id: '1872000004', name: '송촌공영주차장', gu: '대전 대덕구', addr: '동춘당로',
    type: '공영 노외', total: 92, available: 78, fee: '무료', dayMax: '',
    hours: '24시간', tel: '042-632-3871', lat: 36.3638045, lng: 127.4404304, updated: 0,
    near: [['s1', 430]],
  },
  {
    // ★ 실시간 · 만차. 부정 상태에도 대안 CTA가 있는지 이 주차장으로 확인할 것.
    id: '1872000018', name: '법동시장 제2주차장', gu: '대전 대덕구', addr: '법동',
    type: '공영 노외', total: 14, available: 0, fee: '무료', dayMax: '',
    hours: '24시간', tel: '042-608-5292', lat: 36.3655236, lng: 127.4326846, updated: 0,
    near: [['s1', 300]],
  },
  {
    // ★ 기본정보 제공 주차장. available: null = "모른다". 0(만차)과 다른 상태다.
    id: '1872001238', name: '송촌 공영주차전용빌딩', gu: '대전 대덕구', addr: '대덕구 송촌동 458',
    type: '공영 노외', total: 173, available: null, fee: '', dayMax: '',
    hours: '24시간', tel: '', lat: 36.36535162, lng: 127.4381383, updated: 0,
    near: [['s1', 190]],
  },
];
/* ── 손님 데이터 ────────────────────────────────────────── */

export const RECENT_QUERIES = ['대흥동 손칼국수', '두부두루치기', '으능정이 주차장', '소제동 브런치'];

export const REVIEWS: Review[] = [
  { id: 'v1', storeId: 's1', name: '김**', rating: 5, date: '3일 전',
    text: '주차 자리가 앱에 뜬 그대로여서 헤매지 않고 바로 댔어요. 예약 시간에 맞춰 자리도 비어 있었습니다.' },
  { id: 'v2', storeId: 's1', name: '이**', rating: 4, date: '1주 전',
    text: '칼국수 국물이 진하고 좋았어요. 점심에는 조금 붐비니 예약하고 가는 걸 추천합니다.' },
  { id: 'v3', storeId: 's1', name: '박**', rating: 5, date: '2주 전',
    text: '주차장이 생각보다 넓어요. 앱에서 남은 자리 보고 가니까 마음이 편했습니다.' },
  { id: 'v4', storeId: 's2', name: '최**', rating: 5, date: '5일 전',
    text: '두부두루치기 진짜 맛있어요. 단체석도 넓고 주차도 편했습니다.' },
];

export const INITIAL_RESERVATIONS: Reservation[] = [
  { id: 'r1', storeId: 's1', date: '2026-08-24', time: '12:30', party: 4, seatType: '창가석',
    status: 'upcoming', name: '김대전', phone: '010-2211-1234', memo: '창가 자리 부탁드려요', parkingAlert: true },
  { id: 'r2', storeId: 's2', date: '2026-08-27', time: '19:00', party: 2, seatType: '상관없음',
    status: 'upcoming', name: '김대전', phone: '010-2211-1234', memo: '', parkingAlert: false },
  // r3 = 영수증 미인증 → 리뷰쓰기 비활성 / r4 = 영수증 인증 완료 → 리뷰쓰기 활성
  { id: 'r3', storeId: 's1', date: '2026-08-09', time: '19:30', party: 6, seatType: '룸',
    status: 'done', name: '김대전', phone: '010-2211-1234', memo: '', exited: true, receipt: false, reviewed: false },
  { id: 'r4', storeId: 's3', date: '2026-07-28', time: '11:00', party: 2, seatType: '상관없음',
    status: 'done', name: '김대전', phone: '010-2211-1234', memo: '', exited: true, receipt: true, reviewed: false },
];

export const ME: Profile = { name: '김대전', phone: '010-2211-1234', car: '31가 5678', carType: '중형' };

/* ── 관리자 데이터 ──────────────────────────────────────── */

export const ADMIN_RES: AdminReservation[] = [
  { id: 'ar1', time: '12:30', name: '박민지', party: 4, phone: '010-2211-1234', status: 'upcoming', memo: '창가 자리 부탁드려요', eta: '8분 후' },
  { id: 'ar2', time: '12:45', name: '정우성', party: 2, phone: '010-3355-7788', status: 'upcoming', memo: '', eta: '23분 후' },
  { id: 'ar3', time: '13:00', name: '최영호', party: 7, phone: '010-9911-2020', status: 'upcoming', memo: '단체, 아이 2명', eta: '38분 후' },
  { id: 'ar4', time: '11:30', name: '한지민', party: 2, phone: '010-4477-1212', status: 'seated', memo: '', eta: '-' },
  { id: 'ar5', time: '11:00', name: '서강준', party: 4, phone: '010-8080-3131', status: 'seated', memo: '', eta: '-' },
  { id: 'ar6', time: '12:00', name: '노시은', party: 3, phone: '010-1234-5678', status: 'noshow', memo: '', eta: '-' },
];

/**
 * 예약 달력용 한 달치 데이터.
 * ★ Math.random 을 쓰지 않는다. 서버와 클라이언트가 다른 값을 만들면
 *   Next.js 가 hydration mismatch 에러를 낸다. 그래서 인덱스 기반으로 결정한다.
 */
const RES_NAMES = ['강경모', '박민지', '정우성', '최영호', '한지민', '서강준', '노시은', '김하늘', '이서준', '윤도현'];
const RES_TIMES = ['11:30', '12:00', '12:30', '13:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];

export interface MonthResItem { time: string; name: string; party: number }

export const MONTH_RES: Record<string, MonthResItem[]> = (() => {
  const map: Record<string, MonthResItem[]> = {};
  ([[2026, 8, 31], [2026, 9, 30]] as [number, number, number][]).forEach(([y, m, last]) => {
    for (let d = 1; d <= last; d++) {
      const dow = new Date(y, m - 1, d).getDay();
      const n = dow === 5 || dow === 6 ? 4 + ((d * 3) % 5) : (d * 7) % 5;
      if (!n) continue;
      const list: MonthResItem[] = [];
      for (let i = 0; i < n; i++) {
        list.push({
          time: RES_TIMES[(d * 3 + i * 4) % RES_TIMES.length],
          name: RES_NAMES[(d + i * 5) % RES_NAMES.length],
          party: 2 + ((d + i) % 7),
        });
      }
      list.sort((a, b) => a.time.localeCompare(b.time));
      map[`${y}-${pad(m)}-${pad(d)}`] = list;
    }
  });
  return map;
})();

/* ── 통계 (매장 관리 → 이용 통계) ───────────────────────── */

export const STAT_DOW = [
  { d: '월', res: 31, visit: 28, noshow: 2 }, { d: '화', res: 34, visit: 31, noshow: 2 },
  { d: '수', res: 38, visit: 35, noshow: 2 }, { d: '목', res: 44, visit: 40, noshow: 3 },
  { d: '금', res: 71, visit: 63, noshow: 5 }, { d: '토', res: 78, visit: 70, noshow: 6 },
  { d: '일', res: 52, visit: 48, noshow: 3 },
];

export const STAT_HOUR = [
  { h: 11, res: 22, park: 38, seat: 41 }, { h: 12, res: 64, park: 88, seat: 92 },
  { h: 13, res: 48, park: 81, seat: 79 }, { h: 14, res: 17, park: 44, seat: 38 },
  { h: 15, res: 9,  park: 26, seat: 21 }, { h: 16, res: 11, park: 24, seat: 19 },
  { h: 17, res: 26, park: 47, seat: 44 }, { h: 18, res: 57, park: 79, seat: 84 },
  { h: 19, res: 61, park: 90, seat: 88 }, { h: 20, res: 33, park: 58, seat: 52 },
];

export const STAT_PARTY: [string, number][] = [['1~2인', 42], ['3~4인', 36], ['5~6인', 15], ['7인 이상', 7]];

/** 요일 × 시간대 주차 점유율 (0~100). 색 + 숫자를 함께 보여준다 */
export const STAT_HEAT = [
  { d: '월', v: [31, 72, 63, 35, 22, 25, 41, 66, 70, 44] },
  { d: '화', v: [34, 74, 66, 37, 24, 26, 44, 68, 72, 46] },
  { d: '수', v: [36, 78, 69, 40, 25, 28, 47, 71, 75, 49] },
  { d: '목', v: [39, 83, 74, 43, 27, 30, 51, 76, 80, 53] },
  { d: '금', v: [46, 94, 88, 55, 34, 38, 63, 91, 96, 68] },
  { d: '토', v: [52, 97, 93, 66, 48, 50, 70, 95, 98, 74] },
  { d: '일', v: [48, 90, 86, 58, 38, 40, 58, 84, 88, 60] },
];

/** 시간대별 혼잡도 (손님 좌석현황 화면) */
export const SEAT_BUSY = [
  { h: 11, v: 35 }, { h: 12, v: 92 }, { h: 13, v: 78 }, { h: 14, v: 38 },
  { h: 15, v: 21 }, { h: 16, v: 19 }, { h: 17, v: 44 }, { h: 18, v: 84 },
  { h: 19, v: 88 }, { h: 20, v: 52 },
];

/* ── 조회 헬퍼 ──────────────────────────────────────────── */

export const findPartner = (id: string) => PARTNER_STORES.find((s) => s.id === id);
export const findPlain   = (id: string) => PLAIN_STORES.find((s) => s.id === id);
export const findLot     = (id: string) => PUBLIC_LOTS.find((l) => l.id === id);
export const findAny     = (id: string) => findPartner(id) ?? findPlain(id);
