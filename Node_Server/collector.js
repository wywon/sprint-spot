// ==========================================
// collector.js
// 수집기만 따로 돌린다. (시리얼 → 파싱 → Oracle 저장)
//
// 실행: node collector.js           아두이노 있을 때
//       node collector.js --mock    아두이노 없을 때
// 종료: Ctrl + C
//
// ⚠ 아두이노 IDE 시리얼 모니터를 닫고 실행할 것.
//
// 참고: server.js 를 그냥 실행하면 이 수집기가 안에서 같이 돈다.
//       따로 돌리고 싶을 때만 이 파일을 쓴다.
//       (그럴 땐 server.js 를 --api-only 로 실행할 것)
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const collector = require('./collector-core');

const USE_MOCK =
  process.argv.includes('--mock') || process.env.MOCK_MODE === 'true';

async function main() {
  console.log('==========================================');
  console.log(' 주차 데이터 수집기');
  if (USE_MOCK) {
    console.log(' 입력   : 가짜 데이터 (아두이노 없음)');
  } else {
    console.log(' 시리얼 :', process.env.SERIAL_PORT, '/',
                Number(process.env.BAUD_RATE) || 9600);
  }
  console.log(' DB     :', process.env.DB_USER, '@', process.env.DB_CONNECT_STRING);
  console.log(' 종료   : Ctrl + C');
  console.log('==========================================\n');

  try {
    await collector.start({ useMock: USE_MOCK });
  } catch (err) {
    console.error('[수집기] 시작 실패:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  const s = collector.stats;

  console.log('\n==========================================');
  console.log(' 받은 데이터 줄 :', s.lines);
  console.log(' 무시한 줄      :', s.ignored);
  console.log(' DB 갱신 횟수   :', s.updates);
  console.log('==========================================');

  try {
    await collector.stop();
  } catch (e) {
    console.error('종료 중 오류:', e.message);
  }

  process.exit(0);
});

main();
