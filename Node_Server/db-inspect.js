// ==========================================
// db-inspect.js
// 현재 DB 계정에 어떤 테이블이 있고, 어떤 컬럼으로 되어 있는지 확인한다.
// 아무것도 바꾸지 않는다. 읽기만 한다.
//
// 실행: node db-inspect.js
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const oracledb = require('oracledb');
const { toKstText } = require('./kst');

async function main() {
  let connection;

  try {
    connection = await oracledb.getConnection({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
    });

    console.log('==========================================');
    console.log(' DB 구조 확인 (읽기 전용)');
    console.log(' 계정 :', process.env.DB_USER);
    console.log('==========================================\n');

    // ------------------------------------------
    // 이 계정이 가진 테이블 목록
    // ------------------------------------------
    const tables = await connection.execute(
      `SELECT TABLE_NAME FROM USER_TABLES ORDER BY TABLE_NAME`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (tables.rows.length === 0) {
      console.log('테이블이 하나도 없습니다.');
      return;
    }

    console.log('[테이블 목록]');
    tables.rows.forEach((t) => console.log('  · ' + t.TABLE_NAME));
    console.log('');

    // ------------------------------------------
    // 각 테이블의 컬럼과 행 수
    // ------------------------------------------
    for (const t of tables.rows) {
      const name = t.TABLE_NAME;

      console.log('==========================================');
      console.log(' 테이블 :', name);
      console.log('==========================================');

      const cols = await connection.execute(
        `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
           FROM USER_TAB_COLUMNS
          WHERE TABLE_NAME = :t
          ORDER BY COLUMN_ID`,
        { t: name },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      console.log('컬럼:');
      cols.rows.forEach((c) => {
        let type = c.DATA_TYPE;

        if (c.DATA_PRECISION !== null) {
          type += `(${c.DATA_PRECISION}${c.DATA_SCALE ? ',' + c.DATA_SCALE : ''})`;
        } else if (['VARCHAR2', 'CHAR', 'NVARCHAR2'].includes(c.DATA_TYPE)) {
          type += `(${c.DATA_LENGTH})`;
        }

        const nullable = c.NULLABLE === 'Y' ? 'NULL 허용' : 'NOT NULL';
        console.log(`  · ${c.COLUMN_NAME.padEnd(20)} ${type.padEnd(28)} ${nullable}`);
      });

      // 행 수
      const cnt = await connection.execute(
        `SELECT COUNT(*) AS CNT FROM "${name}"`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log(`\n행 수: ${cnt.rows[0].CNT}`);

      // 데이터 맛보기 (최대 12행)
      if (cnt.rows[0].CNT > 0) {
        const sample = await connection.execute(
          `SELECT * FROM "${name}" FETCH FIRST 12 ROWS ONLY`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('\n내용 (최대 12행):');
        sample.rows.forEach((row) => {
          const text = Object.entries(row)
            .map(([k, v]) => `${k}=${v instanceof Date ? toKstText(v) : v}`)
            .join('  ');
          console.log('  ' + text);
        });
      }

      console.log('');
    }
  } catch (err) {
    console.error('\n❌ 실패');
    console.error('  ' + err.message);
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
