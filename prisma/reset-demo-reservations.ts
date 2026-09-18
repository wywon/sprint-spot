/**
 * prisma/reset-demo-reservations.ts — 손님 앱 '예약' 탭 데이터 정리
 * ─────────────────────────────────────────────────────────────
 * 실행:  npm run reset:res
 *
 * [b13] 왜 필요한가
 *   시연 준비 중에 예약을 여러 번 걸어 보면서 다가오는 예약 3건·지난 예약 5건이
 *   전부 '스프린트 식당' 으로 쌓였다. 게다가 취소됨·예약 불가가 뒤섞여서
 *   예약 탭을 열면 "이 서비스는 예약이 잘 안 되는구나" 로 읽힌다.
 *   시연에서 보여 줄 모양으로 한 번에 되돌리는 스크립트다.
 *
 *   시연 시작 시점의 모습
 *     다가오는 예약 — 0건 (그 자리에서 잡는 예약이 여기 들어온다)
 *     지난 예약     — 법동 카페 1건 (방문 완료)
 *
 *   시연 리허설을 돌릴 때마다 예약이 또 쌓인다. 본 시연 직전에 한 번 더 돌릴 것.
 *
 * ★ 무엇을 지우고 무엇을 남기는가
 *   지운다 — 시연 손님(김대전, 010-2211-1234) 번호로 걸린 예약 전부
 *   남긴다 — 관리자 화면용 예약과 예약 달력용 2개월치
 *
 *   seed 의 ar1(박민지)이 하필 김대전과 같은 전화번호를 쓴다. 다른 사람인데
 *   같은 번호를 준 시드의 실수다. 전화번호만 보고 지우면 관리자 '홀 운영' 에서
 *   12:30 예약이 사라지고, 그 예약에 연결된 테이블(s1_t4)로 하는
 *   「예약 확인 → 입장」 시연이 깨진다.
 *
 *   처음에는 id 앞글자(ar…)로 걸러서 피했는데 그게 더 나빴다.
 *   id 가 ar 로 시작하는 엉뚱한 옛날 예약(9월 9일 02:10)까지 같이 살아남아서,
 *   스크립트를 돌려도 지난 예약에 계속 남았다.
 *   그래서 ar1 의 전화번호를 바꿔 충돌 자체를 없애고, 그 뒤에 번호로 지운다.
 *   조건이 단순할수록 이런 사고가 안 난다.
 *
 * ★ 날짜는 실행하는 날 기준으로 다시 계산한다
 *   날짜를 문자열로 박아 두면 며칠 지나 시연할 때 '다가오는 예약' 이 통째로
 *   '지난 예약' 으로 넘어간다. 시연 당일 아침에 한 번 더 돌려도 되도록
 *   오늘로부터 +1일 / +2일 … 로 만든다.
 *
 * ★ seed 를 다시 돌리면 안 되는 이유
 *   npx prisma db seed 는 매장·테이블·주차면까지 전부 지우고 다시 넣는다.
 *   지금 DB 에는 s1 이름 변경(스프린트 식당)과 주차면 P1~P10 교체가 들어 있다.
 *   그게 날아간다. 이 스크립트는 예약만 건드린다.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 시연 손님 — lib/mock.ts 의 ME 와 같은 사람 */
const PHONE = '01022111234';
const NAME = '김대전';

/** 'YYYY-MM-DD' */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 오늘로부터 n일 뒤(음수면 전) */
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

/**
 * 시연용 예약 — 지난 예약 딱 1건.
 *
 * ★ 다가오는 예약은 일부러 0건이다
 *   시연에서 손님이 그 자리에서 예약을 잡는다. 비어 있던 탭에 방금 잡은 예약이
 *   나타나는 편이, 이미 세 건이 있는 목록에 한 줄 더 붙는 것보다 훨씬 선명하다.
 *   "지금 만든 것이 여기 들어왔다" 가 눈으로 보여야 한다.
 *   비어 있어도 화면이 허전하지 않다 — 빈 화면에 「주변 둘러보기」 버튼이 뜬다.
 *
 * ★ 지난 예약 1건은 왜 남기는가
 *   두 탭이 모두 비면 예약 탭 자체가 죽은 화면처럼 보인다.
 *   한 건을 남기되 주인공 매장(s1)이 아니라 법동 카페(s3)로 둔다.
 *   s1 은 이번 시연에서 새로 예약을 잡을 매장이라, 지난 기록까지 s1 이면
 *   "아까 그 집" 과 섞여서 헷갈린다.
 *
 * 영수증을 올린 상태(receipt: true)로 두었으므로 카드에 「리뷰 쓸 수 있어요」가
 * 뜨고 리뷰쓰기로 바로 들어갈 수 있다.
 * 영수증 올리는 것부터 시연하고 싶으면 receipt 를 false 로 바꾸면 된다.
 * 그때는 카드에 「영수증을 올리면 리뷰를 쓸 수 있어요」가 뜬다.
 */
type DemoRow = {
  id: string;
  storeId: 's1' | 's2' | 's3';
  date: string;
  time: string;
  party: number;
  seatType: string;
  /** upcoming = 다가오는 예약 탭 · done = 지난 예약 탭 */
  status: 'upcoming' | 'done';
  memo: string;
  parkingAlert: boolean;
  exited: boolean;
  receipt: boolean;
  reviewed: boolean;
};

/* 타입을 명시하는 이유 — 지금은 지난 예약 1건뿐이라 타입만 보고 두면
   status 가 'done' 리터럴로 좁혀진다. 그러면 아래 로그의
   r.status === 'upcoming' 비교가 "절대 참이 될 수 없다"고 잡힌다 (ts2367).
   다가오는 예약을 다시 넣을 여지를 남겨 두려고 union 으로 고정한다. */
const ROWS: DemoRow[] = [
  {
    id: 'demo_past1',
    storeId: 's3',
    date: day(-6),
    time: '11:00',
    party: 3,
    seatType: '상관없음',
    status: 'done',
    memo: '',
    parkingAlert: false,
    exited: true,
    receipt: true,
    reviewed: false,
  },
];

async function main() {
  console.log('SPOT — 시연용 예약 데이터 정리\n');

  const stores = await prisma.store.findMany({
    where: { id: { in: ['s1', 's2', 's3'] } },
    select: { id: true, name: true },
  });
  const missing = ['s1', 's2', 's3'].filter((id) => !stores.some((s) => s.id === id));
  if (missing.length) {
    console.error(`  매장이 없다: ${missing.join(', ')}`);
    console.error('  npx prisma db seed 를 먼저 돌렸는지 확인할 것');
    process.exit(1);
  }

  /* ── 1단계. 전화번호 충돌부터 없앤다 ───────────────────────
     seed 의 ADMIN_RES 에서 ar1(박민지)이 시연 손님 김대전과 같은 번호를 쓴다.
     애초에 다른 사람인데 같은 번호를 준 것이 시드의 실수다.
     이것 때문에 "손님 예약만 지우기" 가 불가능해서 id 앞글자로 걸러 냈는데,
     그러다 id 가 ar 로 시작하는 엉뚱한 옛날 예약까지 살아남았다.

     번호를 갈라 두면 그 다음은 단순해진다 — 이 번호로 걸린 것은 전부 손님 예약이다.
     관리자 화면에서 박민지에게 전화를 걸어도 김대전에게 가지 않으므로 이쪽이 맞다. */
  const MINJI_PHONE = '01033445566';
  const ar1 = await prisma.reservation.findUnique({
    where: { id: 'ar1' },
    select: { phone: true, name: true },
  });
  if (ar1 && ar1.phone === PHONE) {
    await prisma.reservation.update({ where: { id: 'ar1' }, data: { phone: MINJI_PHONE } });
    console.log(`  ar1(${ar1.name}) 전화번호를 손님과 분리했다 → ${MINJI_PHONE}`);
  }

  /* ── 2단계. 지우기 ─────────────────────────────────────────
     이제 id 를 볼 필요가 없다. 이 번호로 걸린 예약 = 시연 손님 예약이다.
     예약 달력용(m0001…)은 전화번호가 010-9000-**** 라 애초에 안 걸린다. */
  const target = { phone: PHONE };

  const before = await prisma.reservation.findMany({
    where: target,
    select: { id: true, date: true, time: true, status: true, store: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });

  console.log(`  지울 예약 ${before.length}건`);
  for (const r of before) {
    console.log(`    ${r.date} ${r.time}  ${r.store.name.padEnd(12)} ${r.status.padEnd(9)} id=${r.id}`);
  }

  const { count } = await prisma.reservation.deleteMany({ where: target });
  console.log(`  삭제 완료 ${count}건`);

  /* 넣기 */
  await prisma.reservation.createMany({
    data: ROWS.map((r) => ({
      ...r,
      tableId: null,
      name: NAME,
      phone: PHONE,
    })),
  });

  const name = new Map(stores.map((s) => [s.id, s.name]));
  console.log(`\n  넣은 예약 ${ROWS.length}건`);
  for (const r of ROWS) {
    const tag = r.status === 'upcoming' ? '다가오는' : '지난';
    const extra = r.status === 'done' && !r.reviewed && r.receipt ? '  ← 리뷰쓰기 가능' : '';
    console.log(`    [${tag}] ${r.date} ${r.time}  ${name.get(r.storeId)}  ${r.party}명${extra}`);
  }
  console.log('    [다가오는] 없음  ← 시연에서 그 자리에서 잡는 예약이 여기 들어온다');

  /* ── 검증 ──────────────────────────────────────────────────
     정말로 이 모양이 되었는지 DB 를 다시 읽어서 확인한다.
     "돌렸는데 그대로던데요" 를 두 번 겪지 않으려고 넣었다. */
  const after = await prisma.reservation.findMany({
    where: { phone: PHONE },
    select: { id: true, date: true, time: true, status: true, store: { select: { name: true } } },
    orderBy: [{ date: 'desc' }, { time: 'desc' }],
  });

  const UPCOMING = ['pending', 'upcoming', 'seated'];
  const up = after.filter((r) => UPCOMING.includes(r.status));
  const past = after.filter((r) => !UPCOMING.includes(r.status));

  console.log('\n  ── 지금 손님 앱 예약 탭에 보이는 것 ──');
  console.log(`  다가오는 예약 ${up.length}건${up.length === 0 ? '  (의도한 대로 비어 있다)' : ''}`);
  for (const r of up) console.log(`    ${r.date} ${r.time}  ${r.store.name}`);
  console.log(`  지난 예약 ${past.length}건`);
  for (const r of past) console.log(`    ${r.date} ${r.time}  ${r.store.name}`);

  if (up.length !== 0 || past.length !== ROWS.length) {
    console.log('\n  ⚠ 예상과 다르다. 위 목록의 id 를 남겨 둘 것.');
  }

  /* 관리자 오늘 예약이 안 깨졌는지 — 홀 운영 시연이 여기에 걸려 있다 */
  const todayAdmin = await prisma.reservation.findMany({
    where: { storeId: 's1', date: iso(new Date()) },
    select: { id: true, time: true, name: true, status: true },
    orderBy: { time: 'asc' },
  });
  console.log(`\n  관리자 오늘 예약 ${todayAdmin.length}건 (그대로 남아 있어야 한다)`);
  for (const r of todayAdmin) {
    console.log(`    ${r.time}  ${r.name.padEnd(8)} ${r.status.padEnd(9)} id=${r.id}`);
  }
  console.log('  손님 앱 예약 탭을 새로고침하면 반영된다.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
