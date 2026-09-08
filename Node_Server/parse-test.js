// ==========================================
// parse-test.js
// parser.js 가 제대로 동작하는지 확인한다.
// 아두이노 없이 실행 가능.
//
// 실행: node parse-test.js
// ==========================================

'use strict';

const { parseParkingLine, summarize, toDisplayString } = require('./parser');

// 실제 아두이노에서 받은 줄 (2026-09-07, 88자)
const REAL_LINE =
  '1번:빈자리 | 2번:주차중 | 3번:주차중 | 4번:주차중 | 5번:빈자리 | 6번:주차중 | 7번:빈자리 | 8번:빈자리 | 9번:주차중 | 10번:빈자리';

const cases = [
  {
    name: '실제 아두이노 출력',
    input: REAL_LINE,
    expectOk: true,
  },
  {
    name: '전부 빈자리',
    input: Array.from({ length: 10 }, (_, i) => `${i + 1}번:빈자리`).join(' | '),
    expectOk: true,
  },
  {
    name: '전부 주차중',
    input: Array.from({ length: 10 }, (_, i) => `${i + 1}번:주차중`).join(' | '),
    expectOk: true,
  },
  {
    name: '줄 끝에 \\r 이 붙은 경우',
    input: REAL_LINE + '\r',
    expectOk: true,
  },
  {
    name: '부팅 메시지 (걸러져야 함)',
    input: '주차장 시스템 시작',
    expectOk: false,
  },
  {
    name: '빈 줄 (걸러져야 함)',
    input: '   ',
    expectOk: false,
  },
  {
    name: '앞부분이 잘린 줄 (걸러져야 함)',
    input: ':빈자리 | 9번:주차중 | 10번:빈자리',
    expectOk: false,
  },
  {
    name: '9개만 들어온 줄 (걸러져야 함)',
    input: Array.from({ length: 9 }, (_, i) => `${i + 1}번:빈자리`).join(' | '),
    expectOk: false,
  },
  {
    name: '번호 중복 (걸러져야 함)',
    input: REAL_LINE.replace('2번:', '1번:'),
    expectOk: false,
  },
  {
    name: '알 수 없는 상태값 (걸러져야 함)',
    input: REAL_LINE.replace('1번:빈자리', '1번:고장'),
    expectOk: false,
  },
];

console.log('==========================================');
console.log(' parser.js 테스트');
console.log('==========================================\n');

let passed = 0;
let failed = 0;

for (const c of cases) {
  const result = parseParkingLine(c.input);
  const isPass = result.ok === c.expectOk;

  if (isPass) {
    passed++;
    console.log(`✅ ${c.name}`);
  } else {
    failed++;
    console.log(`❌ ${c.name}`);
    console.log(`   기대: ok=${c.expectOk} / 실제: ok=${result.ok}`);
  }

  if (result.ok) {
    console.log(`   → ${toDisplayString(result.spaces)}`);
  } else {
    console.log(`   → 걸러진 이유: ${result.error}`);
  }
  console.log('');
}

console.log('==========================================');
console.log(` 성공 ${passed} / 실패 ${failed}`);
console.log('==========================================\n');

// 실제 줄로 최종 형태를 한 번 보여준다
const real = parseParkingLine(REAL_LINE);

if (real.ok) {
  console.log('실제 줄의 파싱 결과 (API 응답에 쓰일 형태):\n');
  console.log(JSON.stringify(
    Object.assign({}, summarize(real.spaces), { spaces: real.spaces }),
    null,
    2
  ));
}

process.exit(failed === 0 ? 0 : 1);
