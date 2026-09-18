/**
 * prisma/seed-sensor-history.ts — 시연용 센서 기록 생성
 * ─────────────────────────────────────────────────────────────
 * 실행:  npm run seed:sensor                최근 14일치 (기본)
 *        npm run seed:sensor -- --reset     기존 SensorLog 를 지우고 다시 만든다
 *        npm run seed:sensor -- --days=30   더 길게
 *        npm run seed:sensor -- --step=30   더 성기게 (줄 수가 절반)
 *
 * ⚠️  이것은 실제 센서가 측정한 값이 아니라 **시연용으로 만들어 낸 기록**이다.
 *     매장 관리 → 이용 통계의 「센서 기반 혼잡도·이용패턴」을 채우기 위한 것이고,
 *     seed.ts 가 예약·리뷰·로그를 지어내는 것과 같은 성격의 데이터다.
 *     발표에서 이 화면을 쓸 때는 "실제 측정치" 가 아니라 "시연용 데이터" 라고
 *     말할 것. 실제 운영에 들어가면 이 스크립트는 지운다.
 *
 * [b13] 왜 필요해졌나
 *   reset:log 첫 버전이 SensorLog 까지 지워서 이용 통계가 통째로 비었다.
 *   실제 기록은 되살릴 수 없고 시연이 당장이라, 그럴듯한 기록을 다시 만든다.
 *
 * ★ 통계 SQL 이 기대하는 모양에 맞춘다 (app/api/admin/stats/route.ts)
 *   1) 시간대별 · 요일×시간 히트맵
 *      detectedAt 을 KST 로 바꿔 요일·시(hour)로 묶고 occupied 비율을 낸다.
 *      → 요일이 한 바퀴는 돌아야 하므로 최소 7일, 기본 14일.
 *   2) 평균 주차시간 · 회전율
 *      같은 주차면에서 연속된 occupied 를 한 번의 주차로 묶는다(gaps and islands).
 *      샘플이 2개 이상인 덩어리만 센다.
 *      → 무작위로 찍으면 안 되고 '차가 와서 얼마간 머물다 간다' 를 흉내내야 한다.
 *   3) 만차 횟수
 *      10분 버킷에서 전 주차면이 occupied 로 처음 바뀐 횟수.
 *      → reportingSlots >= totalSlots 여야 계산된다. 주차면 전부에 기록을 남긴다.
 *
 * ★ 어떻게 그럴듯하게 만드는가
 *   점심(12~13시)과 저녁(18~19시)에 몰리고 새벽에는 거의 빈다.
 *   요일 가중치는 이미 있는 예약 통계와 같은 방향으로 준다 — 금요일이 가장 붐비고
 *   화요일이 한가하다. 두 화면의 이야기가 어긋나면 보는 사람이 먼저 알아챈다.
 *   입출구 쪽(nearGate) 자리가 먼저 찬다. 안쪽 자리는 붐빌 때만 쓰인다.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];

/**
 * 기본값은 '통계에 잡힐 만큼만' 이다.
 *
 * 처음에는 30일 × 24시간 × 10분 간격으로 43,200줄을 만들었는데 과했다.
 * 통계 네 가지가 제대로 나오려면 필요한 최소 조건은 이것뿐이다.
 *   요일×시간 히트맵  → 7일 이상 (14일이면 요일마다 두 번씩이라 덜 튄다)
 *   평균 주차시간     → 한 번 주차에 샘플이 2개 이상 (머무는 시간 40분↑ vs 15분 간격)
 *   만차 횟수        → 모든 주차면이 같은 시각에 보고 (아래 루프가 그렇게 만든다)
 *   시간대별 점유율   → 영업시간에 샘플이 고르게
 *
 * 14일 × 13시간 × 4샘플 × 10면 = 약 7,300줄. 30초도 안 걸린다.
 */
const DAYS = Number(arg('days') ?? 14);
const STORE = arg('store') ?? 's1';
const RESET = process.argv.includes('--reset');

/** 몇 분 간격으로 샘플을 남길 것인가 */
const STEP_MIN = Number(arg('step') ?? 15);

/**
 * 게이트웨이가 켜져 있는 시간대(KST). 매장 영업시간 10:30~20:00 언저리.
 *
 * ★ 새벽까지 다 만들지 않는 이유
 *   문 닫은 시간에도 센서를 돌린다는 설정은 부자연스럽고, 빈 주차장 샘플이
 *   14시간어치 들어가면 '평균 점유율' 이 실제보다 훨씬 낮게 나온다.
 *   통계 코드도 '데이터가 있는 시간만' 그리도록 되어 있어서(byHour),
 *   영업시간만 넣으면 그 시간대만 깔끔하게 그려진다.
 */
const OPEN_H = Number(arg('open') ?? 9);
const CLOSE_H = Number(arg('close') ?? 22);

/** 시(KST)별 기본 혼잡도 — 식당 영업시간 10:30~20:00 을 반영한다 */
const HOUR_WEIGHT: Record<number, number> = {
  0: .02, 1: .01, 2: .01, 3: .01, 4: .01, 5: .02, 6: .03, 7: .05,
  8: .07, 9: .10, 10: .22, 11: .55, 12: .92, 13: .80, 14: .42,
  15: .25, 16: .26, 17: .45, 18: .82, 19: .88, 20: .52,
  21: .20, 22: .08, 23: .04,
};

/** 요일 가중치 — 예약 통계와 같은 방향 (금 최다 · 화 최소) */
const DOW_WEIGHT: Record<number, number> = {
  0: .95,  // 일
  1: .90,  // 월
  2: .60,  // 화
  3: .85,  // 수
  4: 1.00, // 목
  5: 1.30, // 금
  6: 1.20, // 토
};

/* 재현 가능한 난수 — 돌릴 때마다 통계가 출렁이면 리허설과 본 시연이 달라진다 */
let seed = 20260918;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** KST 기준 시각을 UTC Date 로. DB 의 detectedAt 은 UTC 값이다 */
const kst = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(Date.UTC(y, mo, d, h - 9, mi));

type Row = { storeId: string; slotCode: string; status: 'available' | 'occupied' | 'unknown'; detectedAt: Date };

async function main() {
  console.log('SPOT — 시연용 센서 기록 생성\n');
  console.log('  ⚠️  실제 측정치가 아니라 시연용으로 만들어 내는 데이터다\n');

  const slots = await prisma.parkingSlot.findMany({
    where: { storeId: STORE },
    select: { code: true, nearGate: true },
    orderBy: { code: 'asc' },
  });

  if (slots.length === 0) {
    console.error(`  ${STORE} 의 주차면이 없다. npx prisma db seed 를 먼저 돌렸는지 확인할 것`);
    process.exit(1);
  }
  console.log(`  주차면 ${slots.length}면 — ${slots.map((s) => s.code).join(' ')}`);

  const existing = await prisma.sensorLog.count({ where: { storeId: STORE } });
  if (existing > 0 && !RESET) {
    console.log(`\n  이미 SensorLog 가 ${existing}줄 있다.`);
    console.log('  덮어쓰려면 --reset 을 붙일 것:  npm run seed:sensor -- --reset');
    process.exit(0);
  }
  if (RESET && existing > 0) {
    await prisma.sensorLog.deleteMany({ where: { storeId: STORE } });
    console.log(`  기존 ${existing}줄 삭제`);
  }

  /* 자리별 선호도 — 입출구 쪽이 먼저 찬다.
     선호도가 낮은 자리는 붐빌 때만 쓰이므로 회전율도 낮게 나온다 */
  const pref = slots.map((s, i) => ({
    code: s.code,
    // nearGate 는 1.0, 나머지는 앞 번호일수록 조금 낮게.
    // 폭을 너무 벌리면 안쪽 자리가 영영 안 차서 '만차' 가 한 번도 안 잡힌다
    w: s.nearGate ? 1.0 : 0.95 - (i / slots.length) * 0.20,
  }));

  const rows: Row[] = [];
  const today = new Date();

  for (let back = DAYS - 1; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
    const dow = d.getDay();
    const dowW = DOW_WEIGHT[dow];

    for (const p of pref) {
      /* 이 자리에 오늘 몇 대가 들어오는가.
         주차 사건을 먼저 만들고 그 사이를 샘플로 채운다.
         (샘플마다 독립적으로 동전을 던지면 연속된 occupied 덩어리가 안 생겨서
          평균 주차시간과 회전율이 0 으로 나온다) */
      const events = Math.round(dowW * p.w * (7 + rnd() * 4));
      const busy: [number, number][] = [];   // [시작분, 끝분] — 자정 기준 분

      for (let e = 0; e < events; e++) {
        // 도착 시각 — 시간대 가중치로 뽑는다
        let hour = 12;
        for (let tries = 0; tries < 30; tries++) {
          const h = Math.floor(rnd() * 24);
          if (rnd() < HOUR_WEIGHT[h]) { hour = h; break; }
        }
        const start = hour * 60 + Math.floor(rnd() * 60);
        /* 머무는 시간 — 식사 시간대는 조금 길게.
           여기를 너무 줄이면 평균 주차시간은 그럴듯해지는데 동시에 다 차는 일이
           없어져서 '만차 0회' 가 된다. 아래 값은 두 숫자를 같이 보고 맞춘 것이다.
             평균 주차시간 86분 · 회전율 3.5회 · 만차 3회/14일 */
        const base = hour >= 11 && hour <= 13 ? 45 : hour >= 18 && hour <= 20 ? 55 : 35;
        const stay = Math.round(base + rnd() * 40);
        busy.push([start, Math.min(start + stay, 24 * 60 - 1)]);
      }

      // 영업시간만 샘플을 남긴다
      for (let m = OPEN_H * 60; m < CLOSE_H * 60; m += STEP_MIN) {
        const occupied = busy.some(([s, e]) => m >= s && m < e);
        // 아주 가끔 센서가 판단을 못 한다 — 실제 로그에도 섞여 있는 상태다
        const status: Row['status'] = rnd() < 0.004 ? 'unknown' : occupied ? 'occupied' : 'available';
        rows.push({
          storeId: STORE,
          slotCode: p.code,
          status,
          detectedAt: kst(y, mo, day, Math.floor(m / 60), m % 60),
        });
      }
    }
  }

  console.log(`  ${DAYS}일 × ${OPEN_H}~${CLOSE_H}시 × ${STEP_MIN}분 간격 × ${slots.length}면 = ${rows.length.toLocaleString('ko-KR')}줄 생성`);

  /* 한 번에 다 넣으면 파라미터 한도에 걸린다. 나눠서 넣는다 */
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.sensorLog.createMany({ data: rows.slice(i, i + CHUNK) });
    process.stdout.write(`\r  넣는 중 ${Math.min(i + CHUNK, rows.length).toLocaleString('ko-KR')} / ${rows.length.toLocaleString('ko-KR')}`);
  }
  console.log('\n');

  /* 확인 — 통계가 뭘 읽게 되는지 미리 계산해서 보여 준다 */
  const occ = rows.filter((r) => r.status === 'occupied').length;
  const byHour = new Map<number, { n: number; o: number }>();
  for (const r of rows) {
    const h = (r.detectedAt.getUTCHours() + 9) % 24;
    const c = byHour.get(h) ?? { n: 0, o: 0 };
    c.n++; if (r.status === 'occupied') c.o++;
    byHour.set(h, c);
  }
  const peak = [...byHour.entries()].sort((a, b) => b[1].o / b[1].n - a[1].o / a[1].n)[0];

  console.log(`  평균 점유율 약 ${Math.round((occ / rows.length) * 100)}%`);
  console.log(`  가장 붐비는 시간 ${peak[0]}시 — 약 ${Math.round((peak[1].o / peak[1].n) * 100)}%`);
  console.log('\n  관리자 → 매장 관리 → 이용 통계에서 확인할 것.');
  console.log('  ⚠️  발표에서 이 화면을 쓸 때는 시연용 데이터임을 밝힐 것.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
