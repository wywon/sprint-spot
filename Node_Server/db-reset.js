// ==========================================
// db-reset.js
// parking_spaces 테이블을 통째로 지우고 새로 만든다.
//
// ⚠ 기존 데이터가 전부 사라진다. 되돌릴 수 없다.
//
// 실행: node db-reset.js --yes   (또는 npm run db:reset)
//   (--yes 없이 실행하면 아무것도 하지 않고 안내만 출력한다)
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const mysql = require('mysql2/promise');
const { toKstText } = require('./kst');

const TOTAL_SPACES = 10;
const TABLE_NAME = 'parking_spaces';

// db-init.js 와 동일한 정의
const CREATE_TABLE_SQL = `
CREATE TABLE parking_spaces (
    space_number INT PRIMARY KEY,
    occupied BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const INSERT_SQL = `
INSERT INTO parking_spaces (space_number, occupied, updated_at)
VALUES (?, 0, NOW())`;

// ------------------------------------------
// 안전장치
// ------------------------------------------
if (!process.argv.includes('--yes')) {
  console.log('==========================================');
  console.log(' ⚠ 이 명령은 parking_spaces 테이블을');
  console.log('   통째로 삭제하고 새로 만듭니다.');
  console.log('   기존 데이터는 복구할 수 없습니다.');
  console.log('==========================================');
  console.log('');
  console.log('실행하려면 뒤에 --yes 를 붙이세요:');
  console.log('');
  console.log('   node db-reset.js --yes');
  console.log('');
  process.exit(0);
}

async function main() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      timezone: '+09:00',
    });

    console.log('==========================================');
    console.log(' 테이블 초기화');
    console.log(' 계정 :', process.env.DB_USER, '@', process.env.DB_NAME);
    console.log('==========================================\n');

    // ------------------------------------------
    // 1) 기존 테이블 삭제
    //
    // ※ MySQL 에서 DROP / CREATE TABLE 은 트랜잭션으로 되돌릴 수 없다.
    //   실행 즉시 확정된다.
    // ------------------------------------------
    const [exists] = await connection.execute(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ?`,
      [TABLE_NAME]
    );

    if (exists[0].cnt > 0) {
      await connection.query(`DROP TABLE ${TABLE_NAME}`);
      console.log(`· 기존 ${TABLE_NAME} 테이블을 삭제했습니다.`);
    } else {
      console.log(`· ${TABLE_NAME} 테이블이 없습니다. 삭제 건너뜁니다.`);
    }

    // ------------------------------------------
    // 2) 새로 생성
    // ------------------------------------------
    await connection.query(CREATE_TABLE_SQL);
    console.log(`· ${TABLE_NAME} 테이블을 새로 만들었습니다.`);

    // ------------------------------------------
    // 3) 1~10번 행 넣기 (전부 들어가거나, 하나도 안 들어가거나)
    // ------------------------------------------
    await connection.beginTransaction();
    try {
      for (let n = 1; n <= TOTAL_SPACES; n++) {
        await connection.execute(INSERT_SQL, [n]);
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback().catch(() => {});
      throw err;
    }
    console.log(`· 주차면 1~${TOTAL_SPACES}번 행을 넣었습니다.`);

    // ------------------------------------------
    // 4) 확인
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
      console.log(`${no}    ${status}   ${toKstText(row.updated_at)}`);
    }

    console.log('------------------------------------------');
    console.log(`총 ${rows.length}행\n`);
    console.log('초기화 완료. 서버가 켜져 있었다면 다시 실행하세요.');
  } catch (err) {
    console.error('\n❌ 실패');
    console.error('  ' + (err.code ? err.code + ' — ' : '') + err.message);

    if (err.code === 'ER_TABLEACCESS_DENIED_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR') {
      console.error('  → 권한 부족. parking_user 에 CREATE, DROP 권한이 있는지 확인하세요.');
      console.error('     root 로: SHOW GRANTS FOR \'parking_user\'@\'localhost\';');
    } else if (err.code === 'ER_LOCK_WAIT_TIMEOUT') {
      console.error('  → 다른 프로그램이 테이블을 쓰고 있습니다.');
      console.error('     서버(node)나 MySQL Workbench 를 닫고 다시 실행하세요.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('  → MySQL 이 꺼져 있습니다. Get-Service MySQL84 로 확인하세요.');
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
