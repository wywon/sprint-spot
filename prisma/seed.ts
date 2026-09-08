/**
 * SPOT — seed 스크립트 (이슈 C3)
 * lib/mock.ts 를 그대로 DB 에 넣는다.
 *
 * 실행 —  npx prisma db seed
 * 확인 —  npx prisma studio
 *
 * ★ 몇 번을 돌려도 결과가 같다(멱등). 매번 전부 지우고 다시 넣기 때문이다.
 *   그래서 개발 중에는 마음 놓고 다시 돌려도 된다. 운영 DB 에서는 절대 돌리지 말 것.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import type {
  SlotStatus, SlotType, TableStatus, SensorState, ReservationStatus,
} from '@prisma/client';
import {
  PARTNER_STORES, PLAIN_STORES, PUBLIC_LOTS, MENUS,
  REVIEWS, INITIAL_RESERVATIONS, ADMIN_RES, MONTH_RES,
} from '../lib/mock';

const prisma = new PrismaClient();

/* ── 설정 ─────────────────────────────────────────────────── */

/** 관리자 콘솔(홀 운영·예약 달력)이 바라보는 매장 */
const ADMIN_STORE = 's1';

/** 예약 달력용 2개월치(190건)를 넣을지. Studio 가 지저분하면 false 로 끈다 */
const SEED_MONTH_RES = true;

/* ── 시간 헬퍼 ────────────────────────────────────────────────
 * mock 의 timestamp 는 전부 0 이다. hydration mismatch 를 막으려고
 * 브라우저에서 채우기 때문이다. 그대로 넣으면 DB 에 1970년이 들어가고
 * 화면에 "56년 전"이 뜬다. 그래서 seed 를 돌린 시각 기준으로 바꿔 넣는다.
 * ──────────────────────────────────────────────────────────── */

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TODAY = iso(new Date());

/** '3일 전' '1주 전' → 실제 DateTime. Review.date(문자열) → createdAt 변환용 */
function agoToDate(label: string): Date {
  const m = label.match(/(\d+)\s*(분|시간|일|주|개월)/);
  if (!m) return new Date();
  const unit: Record<string, number> = {
    분: 60_000, 시간: 3_600_000, 일: 86_400_000, 주: 604_800_000, 개월: 2_592_000_000,
  };
  return new Date(Date.now() - Number(m[1]) * unit[m[2]]);
}

/* ── 1. 매장 ──────────────────────────────────────────────── */

const storeRows: Prisma.StoreCreateManyInput[] = [
  ...PARTNER_STORES.map((s) => ({
    id: s.id,
    partner: true,
    name: s.name,
    cat: s.cat,
    lat: s.lat,
    lng: s.lng,
    addr: s.addr,
    tel: s.tel,
    open: s.open,
    price: s.price,
    rating: s.rating,
    reviews: s.reviews,          // ★ 리뷰 '개수'. reviewList 관계와 다른 필드다
    tags: s.tags,
    hero: s.hero,
    sensor: s.sensor as SensorState,
    tablesUpdated: minutesAgo(1),
    parkingFee: s.parking.fee,       // 구 parking.fee 를 평탄화
    parkingUpdated: minutesAgo(1),   // 구 parking.updated
  })),
  // 미입점 매장 — 지도에 상호명만. rating/reviews/tags 는 스키마 default 에 맡긴다
  ...PLAIN_STORES.map((s) => ({
    id: s.id,
    partner: false,
    name: s.name,
    cat: s.cat,
    lat: s.lat,
    lng: s.lng,
  })),
];

/* ── 2. 테이블 ────────────────────────────────────────────────
 * mock 의 id('t1')는 매장 안에서만 유일하다. s1·s2·s3 에 전부 t1 이 있다.
 * 그래서 code 로 내리고 PK 는 `매장_코드` 로 만든다.
 * cuid() 를 쓰지 않는 이유 — id 가 매번 바뀌면 예약을 테이블에 연결할 때
 * "이번에 만든 t4 의 새 id 가 뭐였지" 를 Map 으로 들고 다녀야 한다.
 * ──────────────────────────────────────────────────────────── */

const tableRows: Prisma.StoreTableCreateManyInput[] = PARTNER_STORES.flatMap((s) =>
  s.tables.map((t) => ({
    id: `${s.id}_${t.id}`,
    storeId: s.id,
    code: t.id,
    seats: t.seats,
    status: t.status as TableStatus,
    row: t.row,
    col: t.col,
    w: t.w,
    guest: t.guest,
    since: t.since,
    // mock 이 null 이라 그대로 둔다. 40초 자동 해제는 관리자가 '정리 완료'를
    // 누른 시점부터 세는 값이지, seed 가 정할 값이 아니다.
    cleaningAt: null,
    resAt: t.resAt,
    resName: t.resName,
    resParty: t.resParty,
  })),
);

/* ── 3. 주차면 ────────────────────────────────────────────── */

const slotRows: Prisma.ParkingSlotCreateManyInput[] = PARTNER_STORES.flatMap((s) =>
  s.parking.slots.map((p) => ({
    id: `${s.id}_${p.code}`,
    storeId: s.id,
    code: p.code,
    row: p.row,
    col: p.col,
    zone: p.zone,
    autoStatus: p.autoStatus as SlotStatus,
    manualStatus: p.manualStatus as SlotStatus | null,
    manualUntil: p.manualUntil ? new Date(p.manualUntil) : null,
    manualBy: p.manualBy,
    type: p.type as SlotType | null,
    nearGate: p.nearGate,
    confidence: p.confidence,
  })),
);

/* ── 4. 대표 메뉴 ─────────────────────────────────────────────
 * mock 의 MENUS 는 전 매장 공용 배열이다. 스키마에서 매장별로 쪼갰으므로
 * 입점 매장 3곳에 같은 6개를 각각 넣는다(18행).
 * ──────────────────────────────────────────────────────────── */

const menuRows: Prisma.MenuCreateManyInput[] = PARTNER_STORES.flatMap((s) =>
  MENUS.map(([name, price], i) => ({
    id: `${s.id}_m${i + 1}`,
    storeId: s.id,
    name,
    price,
    order: i,
  })),
);

/* ── 5. 공영주차장 ────────────────────────────────────────── */

const lotRows: Prisma.PublicLotCreateManyInput[] = PUBLIC_LOTS.map((l) => ({
  id: l.id,
  name: l.name,
  gu: l.gu,
  addr: l.addr,
  type: l.type,
  total: l.total,
  available: l.available,
  fee: l.fee,
  dayMax: l.dayMax,
  hours: l.hours,
  tel: l.tel,
  lat: l.lat,
  lng: l.lng,
  updated: minutesAgo(2),
  near: l.near as unknown as Prisma.InputJsonValue,
}));

/* ── 6. 예약 ──────────────────────────────────────────────────
 * 스키마가 Reservation + AdminReservation 을 합쳤으므로
 * mock 의 세 갈래가 전부 이 한 테이블로 들어온다.
 * ──────────────────────────────────────────────────────────── */

// (6-1) 손님 본인 예약 — 마이페이지 · 예약 탭
const customerRes: Prisma.ReservationCreateManyInput[] = INITIAL_RESERVATIONS.map((r) => ({
  id: r.id,
  storeId: r.storeId,
  tableId: null,           // ★ 예약 시점엔 미배정. 관리자가 입장시킬 때 채운다
  date: r.date,
  time: r.time,
  party: r.party,
  seatType: r.seatType,
  status: r.status as ReservationStatus,
  name: r.name,
  phone: r.phone,
  memo: r.memo ?? '',
  parkingAlert: r.parkingAlert ?? false,
  exited: r.exited ?? false,
  receipt: r.receipt ?? false,   // r4 만 true → 리뷰쓰기 활성 케이스
  reviewed: r.reviewed ?? false,
}));

/**
 * (6-2) 관리자 화면의 오늘 예약.
 * ADMIN_RES 에는 날짜가 없어서 seed 를 돌린 날짜로 넣는다.
 * 그래야 관리자 대시보드에 오늘 예약이 뜬다.
 *
 * tableId 연결 — mock 의 s1 테이블 중 t4(12:30 박민지 4인), t11(13:00 최영호 7인)이
 * ADMIN_RES 의 ar1·ar3 과 시각·이름·인원이 정확히 일치한다. 같은 예약이므로 연결한다.
 * seated(ar4·ar5)는 어느 테이블인지 mock 에 근거가 없어 null 로 둔다.
 */
const ADMIN_TABLE_LINK: Record<string, string> = { ar1: 's1_t4', ar3: 's1_t11' };

const adminRes: Prisma.ReservationCreateManyInput[] = ADMIN_RES.map((a) => ({
  id: a.id,
  storeId: ADMIN_STORE,
  tableId: ADMIN_TABLE_LINK[a.id] ?? null,
  date: TODAY,
  time: a.time,
  party: a.party,
  seatType: '상관없음',      // ADMIN_RES 에 없는 값. 손님 예약 폼의 기본값과 맞춘다
  status: a.status as ReservationStatus,
  name: a.name,
  phone: a.phone,
  memo: a.memo ?? '',
  exited: (a.status as ReservationStatus) === 'done',
}));

/**
 * (6-3) 예약 달력용 2개월치.
 * ★ MONTH_RES 에는 전화번호가 없는데 스키마 unique 가 [storeId,date,time,phone] 이다.
 *   그래서 순번 기반 더미 번호를 만든다. 010-9000-**** 는 달력용 가짜 데이터라는 표식이다.
 *   4주차에 실제 API 를 붙이면 이 블록은 통째로 지운다.
 */
let seq = 0;
const monthRes: Prisma.ReservationCreateManyInput[] = !SEED_MONTH_RES ? [] :
  Object.entries(MONTH_RES).flatMap(([date, list]) =>
    list.map((item) => {
      const n = String(++seq).padStart(4, '0');
      const past = date < TODAY;
      return {
        id: `m${n}`,
        storeId: ADMIN_STORE,
        tableId: null,
        date,
        time: item.time,
        party: item.party,
        seatType: '상관없음',
        status: (past ? 'done' : 'upcoming') as ReservationStatus,
        name: item.name,
        phone: `010-9000-${n}`,
        memo: '',
        exited: past,
      };
    }),
  );

const reservationRows = [...customerRes, ...adminRes, ...monthRes];

/* ── 7. 리뷰 ──────────────────────────────────────────────────
 * mock 의 date 는 '3일 전' 같은 표시용 문자열이다.
 * 스키마는 createdAt(DateTime) 이고 화면에서 agoText() 로 다시 '3일 전'을 만든다.
 * reservationId 는 mock 에 연결 근거가 없어 null. 방문-리뷰 연결은 4주차 API 몫이다.
 * ──────────────────────────────────────────────────────────── */

const reviewRows: Prisma.ReviewCreateManyInput[] = REVIEWS.map((v) => ({
  id: v.id,
  storeId: v.storeId,
  reservationId: null,
  name: v.name,
  rating: v.rating,
  text: v.text,
  createdAt: agoToDate(v.date),
}));

/* ── 8. 관리자 로그 ───────────────────────────────────────────
 * ★ mock.ts 에 로그 데이터가 없다. 관리자 '주차 관리 → 센서 감지·변경 로그'
 *   화면이 빈 채로 나오면 만드는 사람이 헷갈리므로 최소한만 넣는다.
 *   mock 에 근거가 없는 유일한 블록이다. 실제 로그가 생기면 지운다.
 * ──────────────────────────────────────────────────────────── */

const logRows: Prisma.ActivityLogCreateManyInput[] = [
  { id: 'g1', storeId: 's1', at: minutesAgo(1),  who: '센서',   msg: 'B3 상태를 판단하지 못했습니다 (신뢰도 0.42)', tone: 'warn' },
  { id: 'g2', storeId: 's1', at: minutesAgo(4),  who: '센서',   msg: 'A7 주차 중 → 이용 가능',                    tone: 'ok' },
  { id: 'g3', storeId: 's1', at: minutesAgo(12), who: '최영호', msg: 'T06 정리 완료 처리',                        tone: 'brand' },
  { id: 'g4', storeId: 's1', at: minutesAgo(26), who: '시스템', msg: '12:00 예약(노시은) 10분 경과 — 미방문 처리', tone: 'busy' },
  { id: 'g5', storeId: 's3', at: minutesAgo(8),  who: '시스템', msg: '센서 게이트웨이 응답 없음 — 오프라인 전환',  tone: 'off' },
];

/* ── 실행 ─────────────────────────────────────────────────── */

async function main() {
  console.log('SPOT seed 시작\n');

  // 지우는 순서는 넣는 순서의 역순. FK 가 걸린 자식부터 지워야 한다.
  // Store 에 onDelete: Cascade 가 있어도, 명시적으로 지우는 편이
  // 무엇이 지워지는지 눈에 보여서 팀에서 읽기 쉽다.
  await prisma.$transaction([
    prisma.review.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.menu.deleteMany(),
    prisma.parkingSlot.deleteMany(),
    prisma.storeTable.deleteMany(),
    prisma.publicLot.deleteMany(),
    prisma.store.deleteMany(),
  ]);
  console.log('  기존 데이터 삭제 완료');

  // 넣는 순서 — 부모(Store) 가 먼저다.
  // Review 는 Reservation 을 참조하므로 예약 다음이다.
  await prisma.$transaction([
    prisma.store.createMany({ data: storeRows }),
    prisma.storeTable.createMany({ data: tableRows }),
    prisma.parkingSlot.createMany({ data: slotRows }),
    prisma.menu.createMany({ data: menuRows }),
    prisma.publicLot.createMany({ data: lotRows }),
    prisma.reservation.createMany({ data: reservationRows }),
    prisma.review.createMany({ data: reviewRows }),
    prisma.activityLog.createMany({ data: logRows }),
  ]);

  console.log(`  Store        ${storeRows.length}  (입점 ${PARTNER_STORES.length} / 미입점 ${PLAIN_STORES.length})`);
  console.log(`  StoreTable   ${tableRows.length}`);
  console.log(`  ParkingSlot  ${slotRows.length}`);
  console.log(`  Menu         ${menuRows.length}`);
  console.log(`  PublicLot    ${lotRows.length}`);
  console.log(`  Reservation  ${reservationRows.length}  (손님 ${customerRes.length} / 오늘 ${adminRes.length} / 달력 ${monthRes.length})`);
  console.log(`  Review       ${reviewRows.length}`);
  console.log(`  ActivityLog  ${logRows.length}`);
  console.log('\nseed 완료. npx prisma studio 로 확인하세요.');
}

main()
  .catch((e) => {
    console.error('\nseed 실패:\n', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
