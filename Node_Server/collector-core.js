// ==========================================
// collector-core.js
// 시리얼 → 파싱 → Oracle 저장 담당. 모듈이라 직접 실행하지 않는다.
//
// 두 곳에서 쓴다.
//   · collector.js  — 수집기만 따로 돌릴 때
//   · server.js     — API 서버와 한 프로세스로 합쳐서 돌릴 때
//
// 사용법
//   const collector = require('./collector-core');
//   await collector.start({ pool, useMock, serialPort, baudRate });
//   await collector.stop();
// ==========================================

'use strict';

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const oracledb = require('oracledb');

const { parseParkingLine, summarize, toDisplayString, TOTAL_SPACES } = require('./parser');
const { nowKstIso } = require('./kst');

const RECONNECT_DELAY_MS = 3000; // 시리얼 끊겼을 때 재시도 간격
const MOCK_INTERVAL_MS = 1200;   // 실제 아두이노 전송 간격과 맞춤

// ------------------------------------------
// 상태
// ------------------------------------------
let pool = null;
let ownsPool = false;     // 이 모듈이 직접 만든 풀인지 (그래야 닫을 때 판단됨)
let port = null;
let reconnectTimer = null;
let mockTimer = null;
let shuttingDown = false;
let started = false;

let serialPortPath = null;
let serialBaudRate = 9600;

// DB 에 저장되어 있다고 알고 있는 현재 상태. [0]=1번 ... [9]=10번
let knownState = new Array(TOTAL_SPACES).fill(null);

// 바깥에서 읽을 수 있는 통계. /api/health 에서 사용한다.
const stats = {
  mode: null,             // 'serial' | 'mock'
  serialConnected: false,
  lines: 0,               // 정상 파싱된 줄 수
  ignored: 0,             // 버린 줄 수
  updates: 0,             // DB 갱신 횟수
  lastLineAt: null,       // 마지막으로 정상 데이터를 받은 시각
  lastChangeAt: null,     // 마지막으로 DB 를 갱신한 시각
  lastError: null,
};

// ==========================================
// DB 현재 상태 읽기
//
// 프로그램을 다시 켰을 때 이미 맞는 값을 또 쓰지 않기 위해 필요하다.
// ==========================================
async function loadKnownState() {
  const connection = await pool.getConnection();

  try {
    const result = await connection.execute(
      `SELECT SPACE_NUMBER, OCCUPIED
         FROM PARKING_SPACES
        ORDER BY SPACE_NUMBER`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length !== TOTAL_SPACES) {
      throw new Error(
        `PARKING_SPACES 행이 ${result.rows.length}개입니다. ` +
        `${TOTAL_SPACES}개여야 합니다. node db-init.js 를 먼저 실행하세요.`
      );
    }

    for (const row of result.rows) {
      knownState[row.SPACE_NUMBER - 1] = row.OCCUPIED === 1;
    }

    console.log('[수집기] DB 현재 상태를 읽었습니다.');
    console.log('[수집기] ' + toDisplayString(
      knownState.map((occ, i) => ({ spaceNumber: i + 1, occupied: occ }))
    ));
  } finally {
    await connection.close();
  }
}

// ==========================================
// 바뀐 주차면만 DB 에 반영
//
// 왜 전부 UPDATE 하지 않는가:
//   UPDATED_AT 이 "마지막으로 상태가 바뀐 시각" 이어야 의미가 있다.
//   1.2초마다 10행을 전부 갱신하면 UPDATED_AT 이 그냥 현재 시각이 되어
//   "언제부터 주차중이었나" 를 알 수 없게 된다.
// ==========================================
const UPDATE_SQL = `
UPDATE PARKING_SPACES
   SET OCCUPIED   = :occupied,
       UPDATED_AT = SYSTIMESTAMP
 WHERE SPACE_NUMBER = :spaceNumber`;

async function applyChanges(spaces) {
  const changes = [];

  for (const s of spaces) {
    const before = knownState[s.spaceNumber - 1];
    if (before !== s.occupied) {
      changes.push({ spaceNumber: s.spaceNumber, from: before, to: s.occupied });
    }
  }

  if (changes.length === 0) return [];

  const connection = await pool.getConnection();

  try {
    for (const c of changes) {
      await connection.execute(UPDATE_SQL, {
        occupied: c.to ? 1 : 0,
        spaceNumber: c.spaceNumber,
      });
    }

    await connection.commit();

    // DB 반영에 성공한 뒤에만 메모리 상태를 갱신한다.
    // 실패했는데 갱신해버리면 그 변화를 영원히 놓친다.
    for (const c of changes) {
      knownState[c.spaceNumber - 1] = c.to;
    }

    stats.updates += changes.length;
    stats.lastChangeAt = nowKstIso();

    return changes;
  } finally {
    await connection.close();
  }
}

// ==========================================
// 시리얼 한 줄 처리
// ==========================================
async function onLine(rawLine) {
  const result = parseParkingLine(rawLine);
  const time = new Date().toLocaleTimeString('ko-KR');

  if (!result.ok) {
    stats.ignored++;
    if (stats.ignored <= 3) {
      console.log(`[수집기] 무시: ${String(rawLine).trim()} (${result.error})`);
    }
    return;
  }

  stats.lines++;
  stats.lastLineAt = nowKstIso();

  try {
    const changes = await applyChanges(result.spaces);

    if (changes.length > 0) {
      const detail = changes
        .map((c) => `${c.spaceNumber}번 ${c.to ? '입차' : '출차'}`)
        .join(', ');

      const { occupiedSpaces, availableSpaces } = summarize(result.spaces);

      console.log(
        `[${time}] ${detail}  →  주차 ${occupiedSpaces} / 빈자리 ${availableSpaces}  (DB 저장됨)`
      );
    }
    // 변화가 없으면 출력하지 않는다. 1.2초마다 같은 줄이 쌓이면 못 본다.
  } catch (err) {
    // DB 오류로 프로그램이 죽으면 안 된다. 다음 줄에서 다시 시도된다.
    stats.lastError = err.message;
    console.error(`[${time}] [DB 오류] ${err.message}`);
  }
}

// ==========================================
// 시리얼 연결 + 재연결
//
// USB 가 빠져도 죽지 않고 계속 재시도한다.
// ==========================================
function connectSerial() {
  reconnectTimer = null;

  port = new SerialPort({
    path: serialPortPath,
    baudRate: serialBaudRate,
    autoOpen: false,
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
  parser.on('data', onLine);

  port.on('error', (err) => {
    stats.lastError = err.message;
    console.error('[수집기] 시리얼 오류:', err.message);
  });

  port.on('close', () => {
    stats.serialConnected = false;
    if (shuttingDown) return;
    console.warn('[수집기] 시리얼 연결이 끊겼습니다.');
    scheduleReconnect();
  });

  port.open((err) => {
    if (err) {
      stats.serialConnected = false;
      stats.lastError = err.message;
      console.error('[수집기] 시리얼 열기 실패:', err.message);
      scheduleReconnect();
      return;
    }
    stats.serialConnected = true;
    console.log(`[수집기] ${serialPortPath} 연결됨. 데이터를 기다립니다.`);
  });
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;

  console.log(`[수집기] ${RECONNECT_DELAY_MS / 1000}초 후 재연결을 시도합니다.`);
  reconnectTimer = setTimeout(connectSerial, RECONNECT_DELAY_MS);
}

// ==========================================
// 가짜 아두이노
//
// 시리얼 포트 대신 내부에서 줄을 만들어 onLine() 에 넣는다.
// onLine 부터 아래는 실제와 완전히 같은 경로를 탄다.
// ==========================================
function startMock() {
  const state = new Array(TOTAL_SPACES).fill(0);

  function makeLine() {
    return state
      .map((v, i) => `${i + 1}번:${v === 1 ? '주차중' : '빈자리'}`)
      .join(' | ');
  }

  console.log('[수집기] 가짜 모드 — 아두이노 없이 ' +
              (MOCK_INTERVAL_MS / 1000) + '초마다 데이터를 만듭니다.');

  // 실제 아두이노처럼 부팅 메시지를 먼저 한 번 보낸다
  onLine('주차장 시스템 시작');

  mockTimer = setInterval(() => {
    const i = Math.floor(Math.random() * TOTAL_SPACES);
    state[i] = state[i] === 1 ? 0 : 1;
    onLine(makeLine());
  }, MOCK_INTERVAL_MS);
}

// ==========================================
// 시작 / 정지
// ==========================================
async function start(options = {}) {
  if (started) return;

  started = true;
  shuttingDown = false;

  serialPortPath = options.serialPort || process.env.SERIAL_PORT;
  serialBaudRate = options.baudRate || Number(process.env.BAUD_RATE) || 9600;

  const useMock = !!options.useMock;
  stats.mode = useMock ? 'mock' : 'serial';

  if (!useMock && !serialPortPath) {
    started = false;
    throw new Error('.env 에 SERIAL_PORT 가 없습니다. (--mock 으로 실행하면 필요 없습니다)');
  }

  // 풀을 바깥에서 받으면 그걸 쓴다. server.js 와 합칠 때 풀을 두 번 만들지 않기 위함.
  if (options.pool) {
    pool = options.pool;
    ownsPool = false;
  } else {
    pool = await oracledb.createPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
      poolMin: 1,
      poolMax: 4,
    });
    ownsPool = true;
  }

  await loadKnownState();

  if (useMock) {
    startMock();
  } else {
    connectSerial();
  }
}

async function stop() {
  shuttingDown = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (mockTimer) {
    clearInterval(mockTimer);
    mockTimer = null;
  }

  if (port && port.isOpen) {
    await new Promise((resolve) => port.close(resolve));
  }

  if (pool && ownsPool) {
    await pool.close(2);
  }

  started = false;
}

module.exports = {
  start,
  stop,
  stats,
  TOTAL_SPACES,
};
