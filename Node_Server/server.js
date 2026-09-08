// ==========================================
// server.js
// 주차장 서버. 이거 하나만 실행하면 된다.
//
//   1) Oracle 연결
//   2) 수집기 시작 (시리얼 → 파싱 → DB 저장)
//   3) Express API 시작 (DB → GET /api/parking)
//
// 실행
//   node server.js              아두이노 있을 때
//   node server.js --mock       아두이노 없을 때 (가짜 데이터)
//   node server.js --api-only   수집기 없이 API 만 (수집기를 따로 돌릴 때)
//
// 확인
//   http://localhost:3000/api/parking
//   http://localhost:3000/api/health
//
// ★ 수집기가 실패해도 API 는 계속 뜬다.
//   아두이노가 없거나 USB 가 빠져도 DB 의 마지막 상태를 계속 응답한다.
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');

const collector = require('./collector-core');

const PORT = Number(process.env.PORT) || 3000;
const TOTAL_SPACES = 10;

const API_ONLY = process.argv.includes('--api-only');
const USE_MOCK =
  process.argv.includes('--mock') || process.env.MOCK_MODE === 'true';

let pool = null;

// ==========================================
// DB 에서 현재 주차 현황 읽기
// ==========================================
const SELECT_SQL = `
SELECT SPACE_NUMBER, OCCUPIED, UPDATED_AT
  FROM PARKING_SPACES
 ORDER BY SPACE_NUMBER`;

async function getParkingStatus() {
  const connection = await pool.getConnection();

  try {
    const result = await connection.execute(SELECT_SQL, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const spaces = result.rows.map((row) => ({
      spaceNumber: row.SPACE_NUMBER,
      occupied: row.OCCUPIED === 1,
      updatedAt: row.UPDATED_AT.toISOString(),
    }));

    const occupiedSpaces = spaces.filter((s) => s.occupied).length;

    return {
      totalSpaces: TOTAL_SPACES,
      occupiedSpaces: occupiedSpaces,
      availableSpaces: TOTAL_SPACES - occupiedSpaces,
      spaces: spaces,
    };
  } finally {
    await connection.close();
  }
}

// ==========================================
// Express
// ==========================================
const app = express();

// 웹/앱 팀원이 다른 주소에서 호출하므로 CORS 를 열어둔다
app.use(cors());

// ------------------------------------------
// GET /api/parking  ← 본체
// ------------------------------------------
app.get('/api/parking', async (req, res) => {
  try {
    const data = await getParkingStatus();

    // 주차면이 10개가 아니면 데이터가 깨진 것이다. 그대로 내보내지 않는다.
    if (data.spaces.length !== TOTAL_SPACES) {
      return res.status(500).json({
        error: 'INVALID_DATA',
        message: `주차면이 ${data.spaces.length}개입니다. ${TOTAL_SPACES}개여야 합니다.`,
      });
    }

    res.json(data);
  } catch (err) {
    console.error('[/api/parking]', err.message);

    // DB 가 죽어도 서버는 살아있어야 한다.
    res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'DB 를 읽을 수 없습니다. 잠시 후 다시 시도하세요.',
    });
  }
});

// ------------------------------------------
// GET /api/health  ← 서버·DB·수집기 상태
// ------------------------------------------
app.get('/api/health', async (req, res) => {
  let dbOk = false;

  try {
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1 FROM DUAL');
    await connection.close();
    dbOk = true;
  } catch (e) {
    dbOk = false;
  }

  const s = collector.stats;

  res.json({
    server: 'ok',
    database: dbOk ? 'ok' : 'unavailable',
    collector: {
      mode: s.mode,                       // 'serial' | 'mock' | null
      serialConnected: s.serialConnected, // 아두이노가 붙어 있는지
      linesReceived: s.lines,
      dbUpdates: s.updates,
      lastLineAt: s.lastLineAt,           // 마지막으로 데이터를 받은 시각
      lastChangeAt: s.lastChangeAt,       // 마지막으로 상태가 바뀐 시각
    },
    time: new Date().toISOString(),
  });
});

// ------------------------------------------
// 안내 / 404
// ------------------------------------------
app.get('/', (req, res) => {
  res.json({
    message: '주차장 API 서버',
    endpoints: ['/api/parking', '/api/health'],
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `${req.method} ${req.path} 는 없는 주소입니다.`,
    endpoints: ['/api/parking', '/api/health'],
  });
});

// ==========================================
// 시작
// ==========================================
async function main() {
  console.log('==========================================');
  console.log(' 주차장 서버');
  console.log(' DB     :', process.env.DB_USER, '@', process.env.DB_CONNECT_STRING);
  if (API_ONLY) {
    console.log(' 수집기 : 사용 안 함 (--api-only)');
  } else if (USE_MOCK) {
    console.log(' 수집기 : 가짜 데이터 (아두이노 없음)');
  } else {
    console.log(' 수집기 : 시리얼', process.env.SERIAL_PORT);
  }
  console.log(' 종료   : Ctrl + C');
  console.log('==========================================\n');

  // ------------------------------------------
  // 1) DB. 여기서 실패하면 시작할 이유가 없다.
  // ------------------------------------------
  try {
    pool = await oracledb.createPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
      poolMin: 1,
      poolMax: 4,
    });
    console.log('[DB] 연결 준비 완료');
  } catch (err) {
    console.error('[DB] 연결 실패:', err.message);
    console.error('→ .env 를 확인하고 node db-test.js 로 접속을 먼저 점검하세요.');
    process.exit(1);
  }

  // ------------------------------------------
  // 2) 수집기.
  //
  // ★ 실패해도 서버를 죽이지 않는다.
  //   아두이노가 없거나 COM 포트가 틀려도 API 는 떠야 한다.
  //   DB 의 마지막 상태를 계속 응답할 수 있기 때문이다.
  // ------------------------------------------
  if (!API_ONLY) {
    try {
      await collector.start({ pool: pool, useMock: USE_MOCK });
    } catch (err) {
      console.error('[수집기] 시작 실패:', err.message);
      console.error('[수집기] → API 서버는 그대로 동작합니다. 값이 갱신되지 않을 뿐입니다.');
    }
  }

  // ------------------------------------------
  // 3) HTTP
  // ------------------------------------------
  app.listen(PORT, () => {
    console.log(`\n[HTTP] 포트 ${PORT} 에서 대기 중`);
    console.log('  http://localhost:' + PORT + '/api/parking');
    console.log('  http://localhost:' + PORT + '/api/health\n');
  });
}

// 예기치 못한 오류로 서버가 죽지 않게 한다
process.on('unhandledRejection', (err) => {
  console.error('[처리되지 않은 오류]', err && err.message ? err.message : err);
});

process.on('SIGINT', async () => {
  console.log('\n종료합니다.');

  try {
    await collector.stop();
  } catch (e) {
    console.error('수집기 종료 중 오류:', e.message);
  }

  try {
    if (pool) await pool.close(2);
  } catch (e) {
    console.error('DB 종료 중 오류:', e.message);
  }

  process.exit(0);
});

main();
