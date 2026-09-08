// ==========================================
// serial-test.js
// 1단계: 메인 아두이노(UNO #4)의 USB Serial 한 줄을 그대로 읽어서 출력만 한다.
// 파싱, DB, API 없음.
//
// 실행: node serial-test.js
// 종료: Ctrl + C
//
// ⚠ 실행 전에 아두이노 IDE의 시리얼 모니터를 반드시 닫으세요.
//   시리얼 포트는 한 번에 한 프로그램만 열 수 있습니다.
// ==========================================

require('dotenv').config();

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORT_PATH = process.env.SERIAL_PORT;
const BAUD_RATE = Number(process.env.BAUD_RATE) || 9600;

if (!PORT_PATH) {
  console.error('[오류] .env 파일에 SERIAL_PORT가 없습니다. 예: SERIAL_PORT=COM10');
  process.exit(1);
}

console.log('==========================================');
console.log(' 아두이노 Serial 수신 테스트 (1단계)');
console.log(' 포트 :', PORT_PATH);
console.log(' 속도 :', BAUD_RATE);
console.log(' 종료 : Ctrl + C');
console.log('==========================================');

// autoOpen: false → 열기 결과를 직접 확인하려고 수동으로 연다
const port = new SerialPort({
  path: PORT_PATH,
  baudRate: BAUD_RATE,
  autoOpen: false,
});

// 아두이노는 Serial.println() 으로 보내므로 줄 끝이 \r\n 이다.
// \n 으로 자르고 남는 \r 은 trim() 으로 제거한다.
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

let dataCount = 0;   // 주차 데이터 줄 수
let otherCount = 0;  // 그 외 줄 수

port.open((err) => {
  if (err) {
    console.error('\n[열기 실패]', err.message);
    console.error('→ 확인할 것');
    console.error('  1) 아두이노 IDE 시리얼 모니터가 열려 있지 않은지');
    console.error('  2) .env 의 SERIAL_PORT 번호가 맞는지 (node list-ports.js 로 확인)');
    console.error('  3) USB 케이블이 데이터 전송용인지 (충전 전용 케이블은 안 됨)');
    process.exit(1);
  }
});

port.on('open', () => {
  console.log('\n[연결됨] 포트를 열었습니다. 데이터를 기다립니다...');
  console.log('(포트를 열면 아두이노가 리셋되므로 첫 데이터까지 2~3초 걸립니다)\n');
});

parser.on('data', (line) => {
  const text = line.trim(); // 끝에 붙는 \r 제거
  if (text === '') return;  // 빈 줄 무시

  const now = new Date().toLocaleTimeString('ko-KR');

  // 주차 데이터 줄인지 아닌지만 구분해서 표시한다. (파싱은 2단계에서)
  // 메인 스케치는 setup() 에서 "주차장 시스템 시작" 을 한 번 출력하므로
  // 데이터가 아닌 줄도 들어온다.
  if (text.includes('번:')) {
    dataCount++;
    console.log(`[${now}] #${dataCount} (${text.length}자) ${text}`);
  } else {
    otherCount++;
    console.log(`[${now}] [데이터 아님] ${text}`);
  }
});

port.on('error', (err) => {
  console.error('[포트 오류]', err.message);
});

port.on('close', () => {
  console.warn('\n[연결 끊김] USB가 빠졌거나 아두이노 전원이 꺼졌습니다.');
});

// Ctrl + C 로 종료할 때 포트를 깨끗하게 닫는다
process.on('SIGINT', () => {
  console.log('\n------------------------------------------');
  console.log('종료합니다.');
  console.log('  주차 데이터 줄 :', dataCount);
  console.log('  그 외 줄       :', otherCount);
  console.log('------------------------------------------');

  if (port.isOpen) {
    port.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
});
