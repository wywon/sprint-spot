// ==========================================
// db-inspect.js
// 현재 DB(DB_NAME)에 어떤 테이블이 있고, 어떤 컬럼으로 되어 있는지 확인한다.
// 아무것도 바꾸지 않는다. 읽기만 한다.
//
// 실행: node db-inspect.js   (또는 npm run db:check)
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const mysql = require('mysql2/promise');
const { toKstText } = require('./kst');

// 테이블 이름을 SQL 에 넣을 때 쓰는 안전한 따옴표 처리
function quoteName(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
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
    console.log(' DB 구조 확인 (읽기 전용)');
    console.log(' 계정 :', process.env.DB_USER, '@', process.env.DB_NAME);
    console.log('==========================================\n');

    // ------------------------------------------
    // 이 DB 에 있는 테이블 목록
    // ------------------------------------------
    const [tables] = await connection.query(
      `SELECT table_name AS name
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name`
    );

    if (tables.length === 0) {
      console.log('테이블이 하나도 없습니다. npm run db:init 을 실행하세요.');
      return;
    }

    console.log('[테이블 목록]');
    tables.forEach((t) => console.log('  · ' + t.name));
    console.log('');

    // ------------------------------------------
    // 각 테이블의 컬럼과 행 수
    // ------------------------------------------
    for (const t of tables) {
      const name = t.name;

      console.log('==========================================');
      console.log(' 테이블 :', name);
      console.log('==========================================');

      const [cols] = await connection.execute(
        `SELECT column_name    AS col,
                column_type    AS type,
                is_nullable    AS nullable,
                column_key     AS col_key,
                column_default AS def
           FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = ?
          ORDER BY ordinal_position`,
        [name]
      );

      console.log('컬럼:');
      cols.forEach((c) => {
        const nullable = c.nullable === 'YES' ? 'NULL 허용' : 'NOT NULL';
        const key = c.col_key === 'PRI' ? '  기본키' : '';
        const def = c.def !== null ? `  기본값=${c.def}` : '';
        console.log(`  · ${c.col.padEnd(20)} ${c.type.padEnd(16)} ${nullable}${key}${def}`);
      });

      // 행 수
      const [cnt] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM ${quoteName(name)}`
      );
      console.log(`\n행 수: ${cnt[0].cnt}`);

      // 데이터 맛보기 (최대 12행)
      if (cnt[0].cnt > 0) {
        const [sample] = await connection.query(
          `SELECT * FROM ${quoteName(name)} LIMIT 12`
        );

        console.log('\n내용 (최대 12행):');
        sample.forEach((row) => {
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
    console.error('  ' + (err.code ? err.code + ' — ' : '') + err.message);
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
