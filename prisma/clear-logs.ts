/**
 * prisma/clear-logs.ts — 관리자 기록 되돌리기
 * ─────────────────────────────────────────────────────────────
 * 실행:  npm run reset:log            시드의 5줄로 되돌린다 (기본)
 *        npm run reset:log -- --empty 한 줄도 남기지 않는다
 *
 * [b13] 왜 필요한가
 *   관리자 대시보드의 '최근 변경' 이 시험하면서 남긴 기록으로 가득 찬다.
 *     P5 주차 중 → 주차 가능        · 센서   · 2시간 전
 *     11:30 이서준님 예약 착석 처리 · 최영호 · 19초 전
 *     ...
 *   시연에서 이 카드는 "지금 무슨 일이 일어났는지" 를 보여 주는 자리인데,
 *   두 시간 전 기록 스무 줄이 먼저 보이면 그 효과가 사라진다.
 *
 * ★ 주차 기록만 지우는 것이 아니다 — 지워지는 것 전부
 *   ActivityLog 는 센서뿐 아니라 관리자·손님 조작까지 한 표에 쌓인다.
 *     api/detect                  센서 주차면 감지
 *     api/admin/slots/[id]        주차면 수동 지정
 *     api/admin/tables/[id]       테이블 상태 변경
 *     api/admin/reservations/[id] 예약 착석 · 취소 · 미방문 처리
 *     api/reservations/[id]/cancel 손님이 예약 취소
 *     api/admin/layout            배치도 수정
 *     api/admin/stores/[id]       매장 정보 수정
 *   이 스크립트는 출처를 가리지 않고 전부 지운다. 예약을 누가 언제 착석시켰는지도
 *   같이 사라진다. 운영 중인 서비스라면 감사 기록이라 함부로 지울 수 없지만,
 *   지금은 시연 준비용 DB 라 매번 백지에서 시작하는 편이 낫다.
 *   나중에 실제 운영에 들어가면 이 스크립트는 지우거나 잠가 둘 것.
 *
 * ★ 왜 완전히 비우지 않고 5줄을 넣는가
 *   seed.ts 가 원래 ActivityLog 5줄을 넣는다. 다 지우면 시드 상태가 아니라
 *   아무것도 없는 상태가 되고, 대시보드에 「기록이 없어요」만 남는다.
 *   시연 첫 화면이 비어 있으면 "아직 안 만든 기능" 으로 읽힐 수 있다.
 *
 *   저 5줄은 센서 · 관리자 · 시스템 세 주체가 다 나오고 색 톤도 네 가지라,
 *   이 카드가 무엇을 담는 자리인지 한 화면으로 설명해 준다.
 *   모형차를 올렸을 때 맨 위에 새 줄이 붙는 것도 똑같이 보인다.
 *
 *   정말 빈 화면에서 시작하고 싶으면 --empty 를 붙인다.
 *
 * ★ 지우는 표 두 개
 *   ActivityLog — 대시보드 '최근 변경' (위 일곱 곳이 쓴다)
 *   SensorLog   — 주차면 센서가 보고한 원시 기록. POST /api/detect 가 쌓는다
 *                 화면에는 아직 안 쓰이지만 같이 비운다. 안 그러면 계속 불어난다
 *
 * ★ 왜 DB 에 안전한가
 *   두 표를 가리키는 곳이 아무 데도 없다. 스키마에서 이 둘을 참조하는 것은
 *   Store 쪽의 목록(logs / sensorLogs)뿐이고, 그건 "이 매장의 로그들" 이라는
 *   역방향 연결이라 로그가 없어도 아무 문제가 없다.
 *   예약 · 테이블 · 주차면 · 매장은 이 스크립트가 건드리지 않는다.
 *   지워도 화면이 비지 않는다 — 대시보드에 「기록이 없어요」가 뜬다.
 *
 * ★ 리허설 때마다 다시 쌓인다
 *   센서가 값을 보낼 때마다, 관리자가 버튼을 누를 때마다 한 줄씩 늘어난다.
 *   그게 정상이다. 본 시연 직전에 한 번 더 돌리면 된다.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** --empty 를 붙이면 한 줄도 넣지 않는다 */
const EMPTY = process.argv.includes('--empty');

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

/**
 * seed.ts 의 logRows 와 같은 5줄.
 * 시각만 실행 시점 기준으로 다시 계산한다 — 그래야 '방금 전' 으로 보인다.
 * seed.ts 쪽을 고치면 여기도 같이 고칠 것. 두 곳에 있는 유일한 데이터다.
 */
const SEED_LOGS = [
  { id: 'g1', storeId: 's1', at: minutesAgo(1),  who: '센서',   msg: 'P9 상태를 판단하지 못했습니다 (신뢰도 0.42)', tone: 'warn' as const },
  { id: 'g2', storeId: 's1', at: minutesAgo(4),  who: '센서',   msg: 'P4 주차 중 → 이용 가능',                    tone: 'ok' as const },
  { id: 'g3', storeId: 's1', at: minutesAgo(12), who: '최영호', msg: 'T06 정리 완료 처리',                        tone: 'brand' as const },
  { id: 'g4', storeId: 's1', at: minutesAgo(26), who: '시스템', msg: '12:00 예약(노시은) 10분 경과 — 미방문 처리', tone: 'busy' as const },
  { id: 'g5', storeId: 's3', at: minutesAgo(8),  who: '시스템', msg: '센서 게이트웨이 응답 없음 — 오프라인 전환',  tone: 'off' as const },
];

async function main() {
  console.log(`SPOT — 관리자 기록 되돌리기${EMPTY ? ' (완전히 비우기)' : ''}\n`);

  const [actBefore, senBefore] = await Promise.all([
    prisma.activityLog.count(),
    prisma.sensorLog.count(),
  ]);

  /* 지우기 전에 무엇이 있었는지 보여 준다.
     "몇 줄이었는데 왜 이렇게 많았지" 를 한 번은 보고 지우는 편이 낫다 */
  if (actBefore > 0) {
    /* groupBy + orderBy: { _count } 는 Prisma 버전마다 받아 주는 모양이 달라서
       쓰지 않는다. 몇백 줄짜리라 전부 읽어 세어도 아무 부담이 없다 */
    const rows = await prisma.activityLog.findMany({ select: { who: true } });
    const byWho = new Map<string, number>();
    for (const r of rows) byWho.set(r.who, (byWho.get(r.who) ?? 0) + 1);

    console.log(`  최근 변경(ActivityLog) ${actBefore}줄`);
    for (const [who, n] of [...byWho].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${who.padEnd(8)} ${n}줄`);
    }
  } else {
    console.log('  최근 변경(ActivityLog) 0줄 — 이미 비어 있다');
  }
  console.log(`  센서 원시 기록(SensorLog) ${senBefore}줄`);

  const [act, sen] = await Promise.all([
    prisma.activityLog.deleteMany(),
    prisma.sensorLog.deleteMany(),
  ]);

  console.log(`\n  삭제  ActivityLog ${act.count}줄 · SensorLog ${sen.count}줄`);

  /* 시드 5줄 되돌리기 */
  if (EMPTY) {
    console.log('  --empty 라 한 줄도 넣지 않는다');
  } else {
    await prisma.activityLog.createMany({ data: SEED_LOGS });
    console.log(`\n  되돌린 기록 ${SEED_LOGS.length}줄`);
    for (const l of SEED_LOGS) {
      const where = l.storeId === 's1' ? '' : `  (${l.storeId} — s1 대시보드엔 안 뜸)`;
      console.log(`    ${l.who.padEnd(8)} ${l.msg}${where}`);
    }
  }

  /* 건드리지 않은 것들을 세어서 보여 준다.
     "로그 지웠는데 다른 게 날아간 거 아니야?" 를 눈으로 확인시키는 편이 빠르다 */
  const [stores, tables, slots, res] = await Promise.all([
    prisma.store.count(),
    prisma.storeTable.count(),
    prisma.parkingSlot.count(),
    prisma.reservation.count(),
  ]);
  console.log('\n  건드리지 않은 것');
  console.log(`    매장 ${stores} · 테이블 ${tables} · 주차면 ${slots} · 예약 ${res}`);
  console.log(
    EMPTY
      ? '\n  관리자 대시보드를 새로고침하면 「기록이 없어요」가 뜬다.'
      : '\n  관리자 대시보드를 새로고침하면 4줄이 보인다 (s1 기준, g5 는 s3 건).',
  );
  console.log('  모형차를 주차면에 올리면 맨 위에 새 줄이 붙는다.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
