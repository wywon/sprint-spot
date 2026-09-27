// ==========================================
// db-init.js
// parking_spaces 테이블을 만들고 1~10번 행을 준비한다.
//
// 실행: node db-init.js   (또는 npm run db:init)
//
// 여러 번 실행해도 안전하다.
//   - 테이블이 이미 있으면 만들지 않는다
//   - 이미 있는 행은 건드리지 않고, 빠진 번호만 채운다
//   - 기존 주차 상태를 덮어쓰지 않는다
//
// ※ 데이터베이스(parking_db)와 계정(parking_user)은 이 스크립트가 만들지 않는다.
//   먼저 create-parking-user.sql 을 root 로 실행해 둘 것.
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const mysql = require('mysql2/promise');
const { toKstText } = require('./kst');

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

const TOTAL_SPACES = 10;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error('[오류] .env 의 DB_HOST / DB_USER / DB_PASSWORD / DB_NAME 을 확인하세요.');
  process.exit(1);
}

// ==========================================
// 테이블 정의
//
// space_number : 1~10, 기본키 → 같은 번호가 두 줄 생길 수 없다
// occupied     : 0 빈자리 / 1 주차중  (BOOLEAN 은 MySQL 에서 tinyint(1))
// updated_at   : 마지막 갱신 시각
//
// DATETIME 에는 시간대 정보가 없다.
//   MySQL 의 NOW() 가 한국 시간으로 기록하고,
//   Node.js 는 연결 설정 timezone: '+09:00' 으로 한국 시간으로 읽는다.
// ==========================================
const CREATE_TABLE_SQL = `
CREATE TABLE parking_spaces (
    space_number INT PRIMARY KEY,
    occupied BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const INSERT_SQL = `
INSERT INTO parking_spaces (space_number, occupied, updated_at)
VALUES (?, 0, NOW())`;

async function main() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      timezone: '+09:00',
    });

    console.log('==========================================');
    console.log(' 테이블 준비');
    console.log(' 계정 :', DB_USER, '@', DB_NAME);
    console.log('==========================================\n');

    // ------------------------------------------
    // 1) 테이블이 이미 있는지 확인
    // ------------------------------------------
    const [exists] = await connection.query(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'parking_spaces'`
    );

    if (exists[0].cnt > 0) {
      console.log('· parking_spaces 테이블이 이미 있습니다. 그대로 사용합니다.');
    } else {
      await connection.query(CREATE_TABLE_SQL);
      console.log('· parking_spaces 테이블을 만들었습니다.');
    }

    // ------------------------------------------
    // 2) 1~10번 행 채우기 (빠진 것만)
    //
    // 이미 있는 번호를 먼저 읽고, 없는 번호만 INSERT 한다.
    // 여러 행을 넣을 때 일부만 들어가지 않도록 트랜잭션으로 묶는다.
    // ------------------------------------------
    const [present] = await connection.query(
      'SELECT space_number FROM parking_spaces'
    );
    const have = new Set(present.map((r) => r.space_number));

    let inserted = 0;

    await connection.beginTransaction();
    try {
      for (let n = 1; n <= TOTAL_SPACES; n++) {
        if (have.has(n)) continue;
        await connection.execute(INSERT_SQL, [n]);
        inserted++;
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback().catch(() => {});
      throw err;
    }

    if (inserted > 0) {
      console.log(`· 주차면 ${inserted}개 행을 새로 넣었습니다.`);
    } else {
      console.log('· 1~10번 행이 이미 모두 있습니다.');
    }

    // ------------------------------------------
    // 3) 결과 확인
    // ------------------------------------------
    const [rows] = await connection.query(
      `SELECT space_number, occupied, updated_at
         FROM parking_spaces
        ORDER BY space_number ASC`
    );

    console.log('\n현재 테이블 내용');
    console.log('------------------------------------------');
    console.log('번호  상태     갱신시각');
    console.log('------------------------------------------');

    for (const row of rows) {
      const no = String(row.space_number).padStart(2, ' ');
      const status = Boolean(row.occupied) ? '주차중' : '빈자리';
      const at = toKstText(row.updated_at);
      console.log(`${no}    ${status}   ${at}`);
    }

    console.log('------------------------------------------');
    console.log(`총 ${rows.length}행\n`);

    if (rows.length !== TOTAL_SPACES) {
      console.warn(`⚠ 행이 ${TOTAL_SPACES}개가 아닙니다. 확인이 필요합니다.`);
    } else {
      console.log('준비 완료. npm start 로 서버를 실행할 수 있습니다.');
    }
  } catch (err) {
    console.error('\n❌ 실패');
    console.error('  ' + (err.code ? err.code + ' — ' : '') + err.message);

    if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR') {
      console.error('  → 권한이 없습니다. create-parking-user.sql 의 GRANT 부분을 root 로 다시 실행하세요.');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('  → parking_db 가 없습니다. create-parking-user.sql 을 root 로 먼저 실행하세요.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('  → MySQL 이 꺼져 있습니다. Get-Service MySQL84 로 확인하세요.');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('  → .env 의 DB_USER / DB_PASSWORD 를 확인하세요.');
    }

    process.exitCode = 1;
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        console.error('연결 닫기 실패:', e.message);
      }
    }
  }
}

main();
