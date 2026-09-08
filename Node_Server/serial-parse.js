// ==========================================
// serial-parse.js
// 2단계: 아두이노 시리얼을 받아서 parser.js 로 파싱한 결과를 보여준다.
// DB, API 없음.
//
// 실행: node serial-parse.js
// 종료: Ctrl + C
//
// ⚠ 아두이노 IDE 시리얼 모니터를 닫고 실행하세요.
// ==========================================

'use strict';

require('dotenv').config();

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const { parseParkingLine, summarize, toDisplayString } = require('./parser');

const PORT_PATH = process.env.SERIAL_PORT;
const BAUD_RATE = Number(process.env.BAUD_RATE) || 9600;

if (!PORT_PATH) {
  console.error('[오류] .env 에 SERIAL_PORT 가 없습니다. 예: SERIAL_PORT=COM10');
  process.exit(1);
}

console.log('==========================================');
console.log(' 시리얼 파싱 테스트 (2단계)');
console.log(' 포트 :', PORT_PATH);
console.log(' 속도 :', BAUD_RATE);
console.log(' 종료 : Ctrl + C');
console.log('==========================================\n');

const port = new SerialPort({
  path: PORT_PATH,
  baudRate: BAUD_RATE,
  autoOpen: false,
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

// ------------------------------------------
// 통계
// ------------------------------------------
let okCount = 0;
let ngCount = 0;
let lastAt = null;          // 직전 정상 줄 수신 시각
const intervals = [];       // 줄 사이 간격(ms) — 실제 전송 주기 확인용

// 마지막 정상 데이터. 일시적인 오류로 사라지지 않게 보관한다.
// (5단계에서 DB 저장용으로 그대로 쓸 구조)
let lastGoodData = null;

port.open((err) => {
  if (err) {
    console.error('[열기 실패]', err.message);
    console.error('→ 시리얼 모니터가 열려 있거나 COM 번호가 틀렸을 수 있습니다.');
    process.exit(1);
  }
});

port.on('open', () => {
  console.log('[연결됨] 데이터를 기다립니다...\n');
});

parser.on('data', (line) => {
  const result = parseParkingLine(line);
  const now = new Date();
  const time = now.toLocaleTimeString('ko-KR');

  if (!result.ok) {
    // 부팅 메시지, 잘린 줄 등은 버린다. 서버는 계속 돈다.
    ngCount++;
    console.log(`[${time}] ⚠ 무시함 (${result.error}) : ${line.trim()}`);
    return;
  }

  okCount++;

  // 전송 간격 측정
  let gap = '';
  if (lastAt !== null) {
    const ms = now - lastAt;
    intervals.push(ms);
    gap = ` (+${(ms / 1000).toFixed(2)}초)`;
  }
  lastAt = now;

  // 마지막 정상 데이터 보관
  lastGoodData = {
    spaces: result.spaces,
    summary: summarize(result.spaces),
    updatedAt: now.toISOString(),
  };

  console.log(`[${time}] #${okCount} ${toDisplayString(result.spaces)}${gap}`);
});

port.on('error', (err) => {
  console.error('[포트 오류]', err.message);
});

port.on('close', () => {
  console.warn('\n[연결 끊김] USB가 빠졌거나 아두이노 전원이 꺼졌습니다.');
  console.warn('→ 마지막 정상 데이터는 그대로 보관되어 있습니다.');
});

process.on('SIGINT', () => {
  console.log('\n==========================================');
  console.log(' 정상 파싱 :', okCount, '줄');
  console.log(' 무시됨    :', ngCount, '줄');

  if (intervals.length > 0) {
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const min = Math.min(...intervals);
    const max = Math.max(...intervals);
    console.log(' 전송 간격 : 평균', (avg / 1000).toFixed(2), '초',
                '(최소', (min / 1000).toFixed(2), '/ 최대', (max / 1000).toFixed(2), ')');
  }

  if (lastGoodData) {
    console.log('\n 마지막 정상 데이터 (API 응답 형태):');
    console.log(JSON.stringify(
      Object.assign({}, lastGoodData.summary, {
        spaces: lastGoodData.spaces.map((s) => ({
          spaceNumber: s.spaceNumber,
          occupied: s.occupied,
          updatedAt: lastGoodData.updatedAt,
        })),
      }),
      null,
      2
    ));
  }

  console.log('==========================================');

  if (port.isOpen) {
    port.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
});
