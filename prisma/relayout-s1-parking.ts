/**
 * [b7] s1 주차장 배치도를 아두이노 모형 도면(P1~P10)으로 교체한다.
 *
 * 실행 —  npm run relayout:s1
 * 확인 —  npx prisma studio  또는  관리자 패널 > 주차 관리
 *
 * ★ 이 스크립트는 '구조'만 만든다. '상태'는 한 글자도 넣지 않는다.
 *   10면 전부 unknown(신뢰도 0 · lastSeenAt 없음)으로 만들고 끝이다. 이 매장의
 *   주차 상태는 오직 아두이노가 정하고, 노트북 중계 서버가 POST /api/detect 로
 *   보내는 순간(약 1.2초마다) 전부 실제 값으로 바뀐다.
 *   occupied/available 을 미리 섞어 두면 센서가 멈춰도 화면이 그럴듯한 거짓말을
 *   한다. 그게 이 서비스에서 제일 치명적인 실패다 (UX 규칙 3).
 *   그래서 여기에는 예시 상태를 넣는 옵션 자체를 두지 않았다.
 *   아두이노 없이 리허설해야 하면 중계 서버를 mock 모드로 띄울 것 —
 *   DB 를 가짜로 채우는 것과 달리 파이프라인 전 구간이 그대로 검증된다.
 *
 * ★ 왜 seed 를 다시 돌리지 않는가
 *   `npx prisma db seed` 는 매장·예약·리뷰를 전부 지우고 mock.ts 로 되돌린다.
 *   지금 DB 의 s1 은 이름이 '스프린트 식당' 으로 바뀌어 있고 예약도 쌓여 있다.
 *   그래서 이 스크립트는 s1 의 ParkingSlot 만 건드린다.
 *
 * ★ 몇 번을 돌려도 결과가 같다. 매번 s1 주차면을 지우고 10면을 다시 넣는다.
 *
 * ★ 배치 근거 — 모형은 가운데 주행통로를 사이에 두고 주차면이 마주 본다.
 *     row 0 : P1 P2 P3 P4 P5 P6   (모형 왼쪽 줄 6면)
 *     row 1 : P7 P8 P9 P10        (모형 오른쪽 줄 4면. P1~P4 와 같은 칸에 선다)
 *   화면은 줄을 가로로 그리므로 모형을 시계 방향 90도 돌린 모양이 된다.
 *   입출차 감지 센서·LED 가 있는 끝이 P6·P10 쪽이라 이 둘만 nearGate 다.
 *
 * ★ code 는 아두이노 Serial 의 '1번~10번' 과 1:1 이다 (P{n} ↔ n번).
 */

import { PrismaClient, type SlotStatus } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 's1';

/**
 * 주차면 번호 접두사. n번 센서 → `${CODE_PREFIX}${n}`.
 *
 * ★ 이 값은 세 군데와 반드시 같아야 한다. 하나라도 다르면 /api/detect 가
 *   주차면을 못 찾고 화면이 영영 안 바뀐다.
 *     ① 모형에 붙은 라벨 테이프
 *     ② 노트북 중계 서버가 POST /api/detect 로 보내는 code
 *     ③ 여기(DB ParkingSlot.code)
 *
 *   중계 서버가 A1~A10 을 보내는 쪽으로 통일하기로 했다면 'A' 로 바꾸고
 *   이 스크립트를 다시 돌린 뒤, 모형 라벨도 A 로 다시 붙이면 된다.
 *   (셋이 맞으면 app/api/detect/route.ts 의 'A7 → P7' 보정 블록은 지운다.)
 */
const CODE_PREFIX = 'P';

const code = (n: number) => `${CODE_PREFIX}${n}`;

/** [센서 번호, row, col, 입구 근처인가] — 상태값은 여기 없다. 센서가 정한다. */
const LAYOUT: [number, number, number, boolean][] = [
  [1,  0, 0, false],
  [2,  0, 1, false],
  [3,  0, 2, false],
  [4,  0, 3, false],
  [5,  0, 4, false],
  [6,  0, 5, true],
  [7,  1, 0, false],
  [8,  1, 1, false],
  [9,  1, 2, false],
  [10, 1, 3, true],
];

async function main() {
  const store = await prisma.store.findUnique({
    where: { id: STORE_ID },
    select: { id: true, name: true, partner: true },
  });

  if (!store) throw new Error(`매장 ${STORE_ID} 이(가) DB 에 없습니다. seed 를 먼저 돌리세요.`);
  if (!store.partner) throw new Error(`매장 ${STORE_ID} 은(는) 입점 매장이 아닙니다.`);

  const before = await prisma.parkingSlot.findMany({
    where: { storeId: STORE_ID },
    select: { code: true },
    orderBy: [{ row: 'asc' }, { col: 'asc' }],
  });

  const now = new Date();

  await prisma.$transaction([
    // SensorLog 는 slotCode(문자열)만 들고 있어 FK 가 아니다. 지난 감지 기록은 그대로 둔다.
    prisma.parkingSlot.deleteMany({ where: { storeId: STORE_ID } }),
    prisma.parkingSlot.createMany({
      data: LAYOUT.map(([n, row, col, nearGate]) => ({
        id: `${STORE_ID}_${code(n)}`,
        storeId: STORE_ID,
        code: code(n),
        row,
        col,
        zone: row === 0 ? 'A' : 'B',
        // ★ 상태는 센서만 정한다. 이 스크립트는 구조만 만든다.
        autoStatus: 'unknown' as SlotStatus,
        // null = 센서 소식을 아직 한 번도 못 받음. /api/detect 가 채운다.
        lastSeenAt: null,
        manualStatus: null,
        manualUntil: null,
        manualBy: null,
        type: null,
        nearGate,
        // 0 = 센서 등록 대기. 값이 흔들리는 상태(0.42)와 구분된다.
        confidence: 0,
      })),
    }),
    prisma.store.update({
      where: { id: STORE_ID },
      data: { parkingUpdated: now, sensor: 'online' },
    }),
    prisma.activityLog.create({
      data: {
        storeId: STORE_ID,
        at: now,
        who: '최영호',
        msg: `주차장 배치도 수정 · ${LAYOUT.length}면 (${code(1)}~${code(LAYOUT.length)})`,
        tone: 'brand',
      },
    }),
  ]);

  console.log(`${store.name}(${STORE_ID}) 주차면 교체 완료`);
  console.log(`  이전 ${before.length}면 : ${before.map((s) => s.code).join(' ') || '(없음)'}`);
  const line = (ns: number[]) => ns.map(code).join(' ');
  console.log(`  이후 ${LAYOUT.length}면 : ${line([1, 2, 3, 4, 5, 6])} / ${line([7, 8, 9, 10])}`);
  console.log('  상태 : 전부 「확인 중」. POST /api/detect 가 들어오면 실제 센서 값으로 바뀝니다.');
}

main()
  .catch((e) => {
    console.error('\n교체 실패:\n', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
