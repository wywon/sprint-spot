// ==========================================
// list-ports.js
// 이 컴퓨터에 연결된 시리얼 포트 목록을 출력한다.
// .env 의 SERIAL_PORT 에 넣을 번호를 찾을 때 사용.
//
// 실행: node list-ports.js
// ==========================================

const { SerialPort } = require('serialport');

SerialPort.list()
  .then((ports) => {
    if (ports.length === 0) {
      console.log('연결된 시리얼 포트가 없습니다.');
      console.log('→ USB 케이블 연결을 확인하세요. (충전 전용 케이블은 인식되지 않습니다)');
      return;
    }

    console.log('=== 연결된 포트 목록 ===\n');

    ports.forEach((p) => {
      console.log(`포트     : ${p.path}`);
      console.log(`제조사   : ${p.manufacturer || '(미상)'}`);
      console.log(`이름     : ${p.friendlyName || '(없음)'}`);
      console.log('---');
    });

    console.log('\n아두이노는 보통 "Arduino" 또는 "CH340" 이 이름에 들어갑니다.');
    console.log('헷갈리면 USB를 뽑고 다시 실행해서 사라지는 포트를 찾으세요.');
  })
  .catch((err) => {
    console.error('[오류]', err.message);
  });
