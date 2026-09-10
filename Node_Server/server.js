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
const pusher = require('./pusher');
const { toKstIso, nowKstIso } = require('./kst');

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
      // 한국 시간(+09:00) 으로 내보낸다. UTC 의 Z 표기보다 눈으로 읽기 쉽다.
      updatedAt: toKstIso(row.UPDATED_AT),
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
// 앱 서버로 현재 현황을 보낸다
//
// 수집기가 "상태 바뀌었다" 고 알려줄 때 호출된다.
// 절대 예외를 밖으로 던지지 않는다 — 푸시가 실패해도 수집은 계속되어야 한다.
// ==========================================
function pushCurrentStatus() {
  getParkingStatus()
    .then((data) => pusher.notify(data.spaces, { stale: isSensorStale() }))
    .catch((err) => {
      console.warn('[SPOT] 현황 조회 실패 —', err.message);
    });
}

// ------------------------------------------
// 센서 값을 믿을 수 있는 상태인가
//
// 아두이노가 빠졌거나 한참 데이터가 안 들어오면
// DB 에 남은 값은 "지금 상태" 가 아니라 "마지막으로 봤던 상태" 다.
// 그럴 땐 SPOT 에 unknown 으로 보낸다.
// 애매한 걸 available 이라고 우기면 손님이 헛걸음한다.
// ------------------------------------------
const STALE_AFTER_MS = 30000; // 30초 동안 데이터가 없으면 못 믿는다

function isSensorStale() {
  const s = collector.stats;

  if (s.mode === null) return true;      // 수집기가 안 돌고 있음 (--api-only)
  if (s.mode === 'mock') return false;   // 가짜 데이터는 항상 최신
  if (!s.serialConnected) return true;   // 아두이노가 빠짐
  if (!s.lastLineAt) return true;        // 아직 한 줄도 못 받음

  return Date.now() - new Date(s.lastLineAt).getTime() > STALE_AFTER_MS;
}

// ==========================================
// Express
// ==========================================
const app = express();

// 웹/앱 팀원이 다른 주소에서 호출하므로 CORS 를 열어둔다
app.use(cors());

// POST 로 들어오는 JSON 본문을 읽으려면 필요하다.
// 이게 없으면 req.body 가 undefined 가 된다.
app.use(express.json());

// ==========================================
// POST 보호 (선택)
//
// .env 에 API_TOKEN 을 넣어두면 POST 요청에 같은 값을 헤더로 보내야 한다.
//   x-api-token: 그값
//
// 비워두면 누구나 POST 할 수 있다. 외부 터널이 열려 있으면
// 주소를 아는 사람이 주차 상태를 바꿀 수 있으니, 발표 전에는 넣어두는 편이 낫다.
// GET 은 보호하지 않는다. 읽기만 하니 막을 이유가 없다.
// ==========================================
const API_TOKEN = process.env.API_TOKEN || '';

function requireToken(req, res, next) {
  if (!API_TOKEN) return next(); // 설정 안 했으면 통과

  if (req.get('x-api-token') === API_TOKEN) return next();

  return res.status(401).json({
    error: 'UNAUTHORIZED',
    message: 'x-api-token 헤더가 없거나 값이 틀렸습니다.',
  });
}

// ==========================================
// 주차면 하나의 상태를 바꾼다 (DB + 수집기 메모리)
// ==========================================
const UPDATE_ONE_SQL = `
UPDATE PARKING_SPACES
   SET OCCUPIED   = :occupied,
       UPDATED_AT = SYSTIMESTAMP
 WHERE SPACE_NUMBER = :spaceNumber`;

async function setSpace(spaceNumber, occupied) {
  const connection = await pool.getConnection();

  try {
    const result = await connection.execute(UPDATE_ONE_SQL, {
      occupied: occupied ? 1 : 0,
      spaceNumber: spaceNumber,
    });

    await connection.commit();

    // 수집기가 기억하는 값도 같이 맞춘다.
    // 안 하면 센서 값이 바뀔 때까지 수집기가 이 칸을 무시한다.
    collector.setKnownState(spaceNumber, occupied);

    return result.rowsAffected;
  } finally {
    await connection.close();
  }
}

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
// POST /api/parking/reset
//   주차면 1~10번을 전부 빈자리로 만든다.
//
//   ⚠ 라우트 순서 주의:
//   아래의 /api/parking/:spaceNumber 보다 먼저 와야 한다.
//   순서가 반대면 "reset" 을 주차면 번호로 읽으려다 오류가 난다.
// ------------------------------------------
app.post('/api/parking/reset', requireToken, async (req, res) => {
  try {
    for (let n = 1; n <= TOTAL_SPACES; n++) {
      await setSpace(n, false);
    }

    console.log('[POST] 전체 초기화 — 1~10번 모두 빈자리');

    const data = await getParkingStatus();
    pusher.notify(data.spaces, { stale: isSensorStale() }); // SPOT 서버에도 알린다
    res.json({ message: '1~10번을 모두 빈자리로 바꿨습니다.', ...data });
  } catch (err) {
    console.error('[POST /api/parking/reset]', err.message);
    res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'DB 에 쓸 수 없습니다.',
    });
  }
});

// ------------------------------------------
// POST /api/parking/:spaceNumber
//   주차면 하나의 상태를 바꾼다.
//
//   요청 본문
//     { "occupied": true }    주차중으로
//     { "occupied": false }   빈자리로
//
//   예)  POST /api/parking/3   { "occupied": true }
// ------------------------------------------
app.post('/api/parking/:spaceNumber', requireToken, async (req, res) => {
  // --- 주차면 번호 검사 ---
  const spaceNumber = Number(req.params.spaceNumber);

  if (!Number.isInteger(spaceNumber) || spaceNumber < 1 || spaceNumber > TOTAL_SPACES) {
    return res.status(400).json({
      error: 'INVALID_SPACE_NUMBER',
      message: `주차면 번호는 1~${TOTAL_SPACES} 사이의 정수여야 합니다. 받은 값: "${req.params.spaceNumber}"`,
    });
  }

  // --- 본문 검사 ---
  const body = req.body || {};

  if (typeof body.occupied !== 'boolean') {
    return res.status(400).json({
      error: 'INVALID_BODY',
      message: '본문에 occupied 를 true 또는 false 로 넣어주세요. 예: { "occupied": true }',
      received: body,
    });
  }

  // --- 반영 ---
  try {
    const changed = await setSpace(spaceNumber, body.occupied);

    if (changed === 0) {
      return res.status(404).json({
        error: 'SPACE_NOT_FOUND',
        message: `${spaceNumber}번 주차면이 DB 에 없습니다. npm run db:init 을 실행하세요.`,
      });
    }

    console.log(
      `[POST] ${spaceNumber}번 → ${body.occupied ? '주차중' : '빈자리'} (수동 변경)`
    );

    const data = await getParkingStatus();
    pusher.notify(data.spaces, { stale: isSensorStale() }); // SPOT 서버에도 알린다

    res.json({
      message: `${spaceNumber}번을 ${body.occupied ? '주차중' : '빈자리'}으로 바꿨습니다.`,
      ...data,
    });
  } catch (err) {
    console.error('[POST /api/parking/:spaceNumber]', err.message);
    res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'DB 에 쓸 수 없습니다.',
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
    spot: {
      enabled: pusher.stats.enabled,      // SPOT 서버 전송을 쓰는지
      url: pusher.stats.url,
      storeId: pusher.stats.storeId,
      sent: pusher.stats.sent,            // 성공 횟수
      failed: pusher.stats.failed,        // 실패 횟수
      lastSentAt: pusher.stats.lastSentAt,
      lastError: pusher.stats.lastError,  // 마지막 실패 이유
      sensorStale: isSensorStale(),       // true 면 unknown 으로 보내는 중
    },
    time: nowKstIso(),
  });
});

// ------------------------------------------
// 안내 / 404
// ------------------------------------------
const ENDPOINTS = [
  'GET  /api/parking                 주차 현황 조회',
  'GET  /api/health                  서버·DB·수집기 상태',
  'POST /api/parking/:번호            한 자리 상태 변경  { "occupied": true }',
  'POST /api/parking/reset           전부 빈자리로',
];

app.get('/', (req, res) => {
  res.json({
    message: '주차장 API 서버',
    endpoints: ENDPOINTS,
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `${req.method} ${req.path} 는 없는 주소입니다.`,
    endpoints: ENDPOINTS,
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
      await collector.start({
        pool: pool,
        useMock: USE_MOCK,

        // 주차 상태가 바뀔 때마다 앱 서버로 보낸다.
        // PUSH_URL 이 없으면 아예 연결하지 않는다 (불필요한 DB 조회 방지).
        onChange: pusher.enabled ? pushCurrentStatus : undefined,
      });
    } catch (err) {
      console.error('[수집기] 시작 실패:', err.message);
      console.error('[수집기] → API 서버는 그대로 동작합니다. 값이 갱신되지 않을 뿐입니다.');
    }
  }

  // ------------------------------------------
  // 3) SPOT 서버 전송
  //
  // 하트비트를 켠다. 변화가 없어도 1분에 한 번은 보내야
  // SPOT 서버가 "센서 오프라인" 으로 판단하지 않는다.
  // ------------------------------------------
  console.log('');
  console.log(pusher.describe());

  if (pusher.enabled) {
    pusher.startHeartbeat();

    // 서버가 뜨자마자 현재 상태를 한 번 보낸다.
    // DB 연결이 자리잡을 시간을 조금 준다.
    setTimeout(pushCurrentStatus, 2000);
  }

  // ------------------------------------------
  // 3) HTTP
  // ------------------------------------------
  app.listen(PORT, () => {
    console.log(`\n[HTTP] 포트 ${PORT} 에서 대기 중`);
    console.log('  GET  http://localhost:' + PORT + '/api/parking');
    console.log('  GET  http://localhost:' + PORT + '/api/health');
    console.log('  POST http://localhost:' + PORT + '/api/parking/3   { "occupied": true }');
    console.log('  POST http://localhost:' + PORT + '/api/parking/reset');

    if (API_TOKEN) {
      console.log('\n[보안] POST 는 x-api-token 헤더가 필요합니다.');
    } else {
      console.log('\n[보안] POST 가 열려 있습니다. (.env 의 API_TOKEN 미설정)');
      console.log('       외부 터널을 켤 때는 API_TOKEN 을 넣는 편이 안전합니다.');
    }
    console.log('');
  });
}

// 예기치 못한 오류로 서버가 죽지 않게 한다
process.on('unhandledRejection', (err) => {
  console.error('[처리되지 않은 오류]', err && err.message ? err.message : err);
});

process.on('SIGINT', async () => {
  console.log('\n종료합니다.');

  try {
    pusher.stop();
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
