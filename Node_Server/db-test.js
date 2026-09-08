// ==========================================
// db-test.js
// 3단계: Oracle 접속만 확인한다. 테이블 생성, 저장 없음.
//
// 실행: node db-test.js
//
// .env 에 다음이 채워져 있어야 한다.
//   DB_USER=
//   DB_PASSWORD=
//   DB_CONNECT_STRING=localhost:1521/XEPDB1
//
// node-oracledb 6 이상은 Thin 모드가 기본이라
// Oracle Instant Client 를 따로 설치하지 않아도 된다.
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const oracledb = require('oracledb');

const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_CONNECT_STRING = process.env.DB_CONNECT_STRING;

// ------------------------------------------
// 설정 확인
// ------------------------------------------
const missing = [];
if (!DB_USER) missing.push('DB_USER');
if (!DB_PASSWORD) missing.push('DB_PASSWORD');
if (!DB_CONNECT_STRING) missing.push('DB_CONNECT_STRING');

if (missing.length > 0) {
  console.error('[오류] .env 에 다음 항목이 비어 있습니다:', missing.join(', '));
  console.error('→ Node_Server\\.env 를 메모장으로 열어 채우세요.');
  process.exit(1);
}

console.log('==========================================');
console.log(' Oracle 접속 테스트 (3단계)');
console.log(' 계정   :', DB_USER);
console.log(' 접속   :', DB_CONNECT_STRING);
console.log(' 비밀번호: (' + DB_PASSWORD.length + '자, 화면에 표시하지 않음)');
console.log('==========================================\n');

// ------------------------------------------
// 오류 메시지를 초보자용 안내로 바꿔준다
// ------------------------------------------
function explain(message) {
  const hints = [
    {
      match: ['ORA-01017', 'invalid username'],
      text: [
        '계정명 또는 비밀번호가 틀렸습니다.',
        '→ .env 의 DB_USER / DB_PASSWORD 를 확인하세요.',
        '→ 비밀번호에 특수문자가 있으면 따옴표 없이 그대로 적어야 합니다.',
      ],
    },
    {
      match: ['ORA-12541', 'no listener', 'ECONNREFUSED', 'DPY-6005'],
      text: [
        'Oracle 리스너에 연결할 수 없습니다. DB가 꺼져 있을 가능성이 큽니다.',
        '→ 서비스 확인: Win+R → services.msc',
        '   OracleServiceXE 와 OracleOraDB21Home1TNSListener 가 "실행 중" 이어야 합니다.',
        '→ 또는 관리자 cmd 에서: net start OracleServiceXE',
      ],
    },
    {
      match: ['ORA-12514', 'DPY-6001', 'unknown service'],
      text: [
        '서비스 이름을 찾을 수 없습니다.',
        '→ XE 21c 는 보통 localhost:1521/XEPDB1 입니다.',
        '→ 확인: cmd 에서 lsnrctl status 실행 후 Service 목록을 보세요.',
      ],
    },
    {
      match: ['ORA-28000', 'account is locked'],
      text: [
        '계정이 잠겨 있습니다.',
        '→ SYSTEM 으로 접속해서: ALTER USER 계정명 ACCOUNT UNLOCK;',
      ],
    },
    {
      match: ['ORA-28001', 'password has expired'],
      text: [
        '비밀번호가 만료되었습니다.',
        '→ SYSTEM 으로 접속해서: ALTER USER 계정명 IDENTIFIED BY 새비밀번호;',
      ],
    },
    {
      match: ['ETIMEDOUT', 'timeout'],
      text: [
        '응답이 없습니다. 방화벽이나 DB 기동 중일 수 있습니다.',
        '→ 잠시 후 다시 시도하고, 그래도 안 되면 서비스 상태를 확인하세요.',
      ],
    },
  ];

  for (const h of hints) {
    if (h.match.some((m) => message.includes(m))) {
      return h.text;
    }
  }

  return ['알 수 없는 오류입니다. 위 메시지를 그대로 공유해 주세요.'];
}

// ------------------------------------------
// 접속 테스트
// ------------------------------------------
async function main() {
  let connection;

  try {
    console.log('접속 시도 중...');

    connection = await oracledb.getConnection({
      user: DB_USER,
      password: DB_PASSWORD,
      connectString: DB_CONNECT_STRING,
    });

    console.log('\n✅ 접속 성공\n');

    // 서버 정보 (권한 없이도 확인 가능)
    console.log(' Oracle 서버 버전 :', connection.oracleServerVersionString);
    console.log(' 드라이버 모드     :', oracledb.thin ? 'Thin (Instant Client 불필요)' : 'Thick');

    // 아주 단순한 쿼리 하나
    const result = await connection.execute(
      `SELECT USER AS db_user,
              TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS') AS now
         FROM DUAL`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log(' 접속된 계정       :', result.rows[0].DB_USER);
    console.log(' DB 서버 시각      :', result.rows[0].NOW);

    console.log('\n3단계 완료. 4단계(테이블 생성)로 진행할 수 있습니다.');
  } catch (err) {
    console.error('\n❌ 접속 실패\n');
    console.error('원본 메시지:');
    console.error('  ' + err.message);
    console.error('\n확인할 것:');
    explain(err.message).forEach((line) => console.error('  ' + line));
    process.exitCode = 1;
  } finally {
    if (connection) {
      try {
        await connection.close();
        console.log('\n(연결을 닫았습니다)');
      } catch (e) {
        console.error('연결 닫기 실패:', e.message);
      }
    }
  }
}

main();
