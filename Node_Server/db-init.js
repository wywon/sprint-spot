// ==========================================
// db-init.js
// 4단계: PARKING_SPACES 테이블을 만들고 1~10번 행을 준비한다.
//
// 실행: node db-init.js
//
// 여러 번 실행해도 안전하다.
//   - 테이블이 이미 있으면 만들지 않는다
//   - 이미 있는 행은 건드리지 않고, 빠진 번호만 채운다
//   - 기존 주차 상태를 덮어쓰지 않는다
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const oracledb = require('oracledb');

const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_CONNECT_STRING = process.env.DB_CONNECT_STRING;

const TOTAL_SPACES = 10;

if (!DB_USER || !DB_PASSWORD || !DB_CONNECT_STRING) {
  console.error('[오류] .env 의 DB_USER / DB_PASSWORD / DB_CONNECT_STRING 을 확인하세요.');
  process.exit(1);
}

// ==========================================
// 테이블 정의
//
// SPACE_NUMBER : 1~10, 기본키 → 같은 번호가 두 줄 생길 수 없다
// OCCUPIED     : 0 빈자리 / 1 주차중
// UPDATED_AT   : 마지막 갱신 시각
//
// TIMESTAMP WITH TIME ZONE 을 쓰는 이유:
//   시간대 정보가 같이 저장되어야 API 에서 ISO-8601 로 정확히 내보낼 수 있다.
//   그냥 TIMESTAMP 로 하면 "이게 한국 시간인가 UTC인가"가 코드마다 갈린다.
// ==========================================
const CREATE_TABLE_SQL = `
CREATE TABLE PARKING_SPACES (
  SPACE_NUMBER  NUMBER(2)                NOT NULL,
  OCCUPIED      NUMBER(1)  DEFAULT 0     NOT NULL,
  UPDATED_AT    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_PARKING_SPACES      PRIMARY KEY (SPACE_NUMBER),
  CONSTRAINT CK_PARKING_SPACE_NO    CHECK (SPACE_NUMBER BETWEEN 1 AND 10),
  CONSTRAINT CK_PARKING_OCCUPIED    CHECK (OCCUPIED IN (0, 1))
)`;

// 빠진 번호만 넣는다. 이미 있으면 아무것도 하지 않는다.
const SEED_SQL = `
MERGE INTO PARKING_SPACES t
USING (SELECT :num AS SPACE_NUMBER FROM DUAL) s
   ON (t.SPACE_NUMBER = s.SPACE_NUMBER)
 WHEN NOT MATCHED THEN
      INSERT (SPACE_NUMBER, OCCUPIED, UPDATED_AT)
      VALUES (s.SPACE_NUMBER, 0, SYSTIMESTAMP)`;

async function main() {
  let connection;

  try {
    connection = await oracledb.getConnection({
      user: DB_USER,
      password: DB_PASSWORD,
      connectString: DB_CONNECT_STRING,
    });

    console.log('==========================================');
    console.log(' 테이블 준비 (4단계)');
    console.log(' 계정 :', DB_USER);
    console.log('==========================================\n');

    // ------------------------------------------
    // 1) 테이블이 이미 있는지 확인
    // ------------------------------------------
    const exists = await connection.execute(
      `SELECT COUNT(*) AS CNT
         FROM USER_TABLES
        WHERE TABLE_NAME = 'PARKING_SPACES'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (exists.rows[0].CNT > 0) {
      console.log('· PARKING_SPACES 테이블이 이미 있습니다. 그대로 사용합니다.');
    } else {
      await connection.execute(CREATE_TABLE_SQL);
      console.log('· PARKING_SPACES 테이블을 만들었습니다.');
    }

    // ------------------------------------------
    // 2) 1~10번 행 채우기 (빠진 것만)
    // ------------------------------------------
    let inserted = 0;

    for (let n = 1; n <= TOTAL_SPACES; n++) {
      const r = await connection.execute(SEED_SQL, { num: n });
      inserted += r.rowsAffected;
    }

    await connection.commit();

    if (inserted > 0) {
      console.log(`· 주차면 ${inserted}개 행을 새로 넣었습니다.`);
    } else {
      console.log('· 1~10번 행이 이미 모두 있습니다.');
    }

    // ------------------------------------------
    // 3) 결과 확인
    // ------------------------------------------
    const rows = await connection.execute(
      `SELECT SPACE_NUMBER, OCCUPIED, UPDATED_AT
         FROM PARKING_SPACES
        ORDER BY SPACE_NUMBER`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log('\n현재 테이블 내용');
    console.log('------------------------------------------');
    console.log('번호  상태     갱신시각');
    console.log('------------------------------------------');

    for (const row of rows.rows) {
      const no = String(row.SPACE_NUMBER).padStart(2, ' ');
      const status = row.OCCUPIED === 1 ? '주차중' : '빈자리';
      const at = row.UPDATED_AT.toISOString();
      console.log(`${no}    ${status}   ${at}`);
    }

    console.log('------------------------------------------');
    console.log(`총 ${rows.rows.length}행\n`);

    if (rows.rows.length !== TOTAL_SPACES) {
      console.warn(`⚠ 행이 ${TOTAL_SPACES}개가 아닙니다. 확인이 필요합니다.`);
    } else {
      console.log('4단계 완료. 5단계(아두이노 데이터 저장)로 진행할 수 있습니다.');
    }
  } catch (err) {
    console.error('\n❌ 실패');
    console.error('  ' + err.message);

    if (err.message.includes('ORA-00955')) {
      console.error('  → 같은 이름의 객체가 이미 있습니다.');
    } else if (err.message.includes('ORA-01031')) {
      console.error('  → 권한이 없습니다. parking 계정에 RESOURCE 롤과 QUOTA 가 있는지 확인하세요.');
      console.error('     create-parking-user.sql 의 GRANT / ALTER USER 부분을 다시 실행해 보세요.');
    } else if (err.message.includes('ORA-01950')) {
      console.error('  → 테이블스페이스 사용 권한이 없습니다.');
      console.error('     SYSTEM 으로 접속해서: ALTER USER parking QUOTA UNLIMITED ON USERS;');
    }

    process.exitCode = 1;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {
        console.error('연결 닫기 실패:', e.message);
      }
    }
  }
}

main();
