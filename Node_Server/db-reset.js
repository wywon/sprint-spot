// ==========================================
// db-reset.js
// PARKING_SPACES 테이블을 통째로 지우고 새로 만든다.
//
// ⚠ 기존 데이터가 전부 사라진다. 되돌릴 수 없다.
//
// 실행: node db-reset.js --yes
//   (--yes 없이 실행하면 아무것도 하지 않고 안내만 출력한다)
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const oracledb = require('oracledb');

const TOTAL_SPACES = 10;
const TABLE_NAME = 'PARKING_SPACES';

// db-init.js 와 동일한 정의
const CREATE_TABLE_SQL = `
CREATE TABLE PARKING_SPACES (
  SPACE_NUMBER  NUMBER(2)                NOT NULL,
  OCCUPIED      NUMBER(1)  DEFAULT 0     NOT NULL,
  UPDATED_AT    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_PARKING_SPACES      PRIMARY KEY (SPACE_NUMBER),
  CONSTRAINT CK_PARKING_SPACE_NO    CHECK (SPACE_NUMBER BETWEEN 1 AND 10),
  CONSTRAINT CK_PARKING_OCCUPIED    CHECK (OCCUPIED IN (0, 1))
)`;

const INSERT_SQL = `
INSERT INTO PARKING_SPACES (SPACE_NUMBER, OCCUPIED, UPDATED_AT)
VALUES (:num, 0, SYSTIMESTAMP)`;

// ------------------------------------------
// 안전장치
// ------------------------------------------
if (!process.argv.includes('--yes')) {
  console.log('==========================================');
  console.log(' ⚠ 이 명령은 PARKING_SPACES 테이블을');
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
    connection = await oracledb.getConnection({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
    });

    console.log('==========================================');
    console.log(' 테이블 초기화');
    console.log(' 계정 :', process.env.DB_USER);
    console.log('==========================================\n');

    // ------------------------------------------
    // 1) 기존 테이블 삭제
    //
    // PURGE 를 붙이면 휴지통(Recycle Bin)에 남지 않고 완전히 지워진다.
    // 안 붙이면 BIN$... 이름으로 남아서 용량을 계속 차지한다.
    // ------------------------------------------
    const exists = await connection.execute(
      `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :t`,
      { t: TABLE_NAME },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (exists.rows[0].CNT > 0) {
      await connection.execute(`DROP TABLE ${TABLE_NAME} PURGE`);
      console.log(`· 기존 ${TABLE_NAME} 테이블을 삭제했습니다.`);
    } else {
      console.log(`· ${TABLE_NAME} 테이블이 없습니다. 삭제 건너뜁니다.`);
    }

    // ------------------------------------------
    // 2) 새로 생성
    // ------------------------------------------
    await connection.execute(CREATE_TABLE_SQL);
    console.log(`· ${TABLE_NAME} 테이블을 새로 만들었습니다.`);

    // ------------------------------------------
    // 3) 1~10번 행 넣기
    // ------------------------------------------
    for (let n = 1; n <= TOTAL_SPACES; n++) {
      await connection.execute(INSERT_SQL, { num: n });
    }

    await connection.commit();
    console.log(`· 주차면 1~${TOTAL_SPACES}번 행을 넣었습니다.`);

    // ------------------------------------------
    // 4) 확인
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
      console.log(`${no}    ${status}   ${row.UPDATED_AT.toISOString()}`);
    }

    console.log('------------------------------------------');
    console.log(`총 ${rows.rows.length}행\n`);
    console.log('4단계 완료. 5단계(아두이노 데이터 저장)로 진행할 수 있습니다.');
  } catch (err) {
    console.error('\n❌ 실패');
    console.error('  ' + err.message);

    if (err.message.includes('ORA-01031')) {
      console.error('  → 권한 부족. parking 계정에 RESOURCE 롤이 있는지 확인하세요.');
    } else if (err.message.includes('ORA-01950')) {
      console.error('  → SYSTEM 으로: ALTER USER parking QUOTA UNLIMITED ON USERS;');
    } else if (err.message.includes('ORA-00054')) {
      console.error('  → 다른 프로그램이 테이블을 쓰고 있습니다.');
      console.error('     SQL Developer 나 다른 node 창을 닫고 다시 실행하세요.');
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
