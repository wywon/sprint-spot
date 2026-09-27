// ==========================================
// db-test.js
// MySQL 접속만 확인한다. 테이블 생성, 저장 없음.
//
// 실행: node db-test.js   (또는 npm run db:test)
//
// .env 에 다음이 채워져 있어야 한다.
//   DB_HOST=localhost
//   DB_PORT=3306
//   DB_USER=parking_user
//   DB_PASSWORD=
//   DB_NAME=parking_db
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

// ------------------------------------------
// 설정 확인
// ------------------------------------------
const missing = [];
if (!DB_HOST) missing.push('DB_HOST');
if (!DB_USER) missing.push('DB_USER');
if (!DB_PASSWORD) missing.push('DB_PASSWORD');
if (!DB_NAME) missing.push('DB_NAME');

if (missing.length > 0) {
  console.error('[오류] .env 에 다음 항목이 비어 있습니다:', missing.join(', '));
  console.error('→ Node_Server\\.env 를 메모장으로 열어 채우세요.');
  process.exit(1);
}

console.log('==========================================');
console.log(' MySQL 접속 테스트');
console.log(' 계정   :', DB_USER);
console.log(' 접속   :', `${DB_HOST}:${DB_PORT}/${DB_NAME}`);
console.log(' 비밀번호: (' + DB_PASSWORD.length + '자, 화면에 표시하지 않음)');
console.log('==========================================\n');

// ------------------------------------------
// 오류 코드를 초보자용 안내로 바꿔준다
// ------------------------------------------
function explain(err) {
  const code = err.code || '';
  const message = err.message || '';

  const hints = [
    {
      match: ['ECONNREFUSED'],
      text: [
        'MySQL 서버에 연결할 수 없습니다. MySQL 이 꺼져 있을 가능성이 큽니다.',
        '→ PowerShell 에서 확인: Get-Service MySQL84',
        '   Status 가 Running 이어야 합니다.',
        '→ 꺼져 있으면 관리자 PowerShell 에서: Start-Service MySQL84',
        '→ .env 의 DB_HOST / DB_PORT(3306) 도 확인하세요.',
      ],
    },
    {
      match: ['ER_ACCESS_DENIED_ERROR'],
      text: [
        '계정명 또는 비밀번호가 틀렸습니다.',
        '→ .env 의 DB_USER / DB_PASSWORD 를 확인하세요.',
        '→ 비밀번호는 따옴표 없이 그대로 적어야 합니다.',
      ],
    },
    {
      match: ['ER_BAD_DB_ERROR'],
      text: [
        'DB_NAME 에 적힌 데이터베이스가 없습니다.',
        '→ root 로 접속해서: CREATE DATABASE parking_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
      ],
    },
    {
      match: ['ER_DBACCESS_DENIED_ERROR'],
      text: [
        '이 계정에 해당 데이터베이스 권한이 없습니다.',
        '→ create-parking-user.sql 의 GRANT 부분을 root 로 다시 실행하세요.',
      ],
    },
    {
      match: ['ER_NOT_SUPPORTED_AUTH_MODE', 'AUTH_SWITCH', 'authentication plugin'],
      text: [
        '인증 방식(Authentication plugin) 문제입니다.',
        '→ npm ls mysql2 로 버전을 확인하세요. 3.x 여야 합니다.',
      ],
    },
    {
      match: ['ETIMEDOUT', 'timeout'],
      text: [
        '응답이 없습니다. MySQL 이 시작 중이거나 주소가 틀렸을 수 있습니다.',
        '→ 잠시 후 다시 시도하고, 그래도 안 되면 서비스 상태를 확인하세요.',
      ],
    },
  ];

  for (const h of hints) {
    if (h.match.some((m) => code === m || message.includes(m))) {
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

    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      timezone: '+09:00',
    });

    console.log('\n✅ 접속 성공\n');

    // DATE_FORMAT 으로 글자 그대로 받아서 시간대 변환이 끼어들지 않게 한다
    const [rows] = await connection.query(
      `SELECT VERSION()      AS version,
              CURRENT_USER() AS db_user,
              DATABASE()     AS db_name,
              DATE_FORMAT(NOW(),           '%Y-%m-%d %H:%i:%s') AS now_local,
              DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS now_utc,
              TIMESTAMPDIFF(HOUR, UTC_TIMESTAMP(), NOW())       AS offset_hours`
    );
    const r = rows[0];

    console.log(' MySQL 서버 버전   :', r.version);
    console.log(' 접속된 계정       :', r.db_user);
    console.log(' 사용 중인 DB      :', r.db_name);
    console.log(' DB 서버 시각      :', r.now_local);
    console.log(' UTC 시각          :', r.now_utc);

    // updated_at = NOW() 가 한국 시간이어야 API 의 +09:00 이 맞는다
    if (Number(r.offset_hours) === 9) {
      console.log(' 시간대            : 한국 시간(UTC+9) ✅');
    } else {
      console.warn(` 시간대            : UTC+${r.offset_hours} ⚠`);
      console.warn('   → MySQL 의 NOW() 가 한국 시간이 아닙니다. API 의 updatedAt 이 어긋납니다.');
      console.warn('   → Windows 시간대가 "(UTC+09:00) 서울" 인지 확인하세요.');
    }

    // 테이블이 준비됐는지도 같이 알려준다 (없어도 실패로 보지 않는다)
    const [tables] = await connection.query(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'parking_spaces'`
    );
    console.log(
      ' parking_spaces    :',
      tables[0].cnt > 0 ? '있음' : '없음 → npm run db:init 을 실행하세요'
    );

    console.log('\n접속 확인 완료.');
  } catch (err) {
    console.error('\n❌ 접속 실패\n');
    console.error('원본 메시지:');
    console.error('  ' + (err.code ? err.code + ' — ' : '') + err.message);
    console.error('\n확인할 것:');
    explain(err).forEach((line) => console.error('  ' + line));
    process.exitCode = 1;
  } finally {
    if (connection) {
      try {
        await connection.end();
        console.log('\n(연결을 닫았습니다)');
      } catch (e) {
        console.error('연결 닫기 실패:', e.message);
      }
    }
  }
}

main();
