// ==========================================
// pusher.js
// 주차 상태를 SPOT 서버로 POST 해서 알려준다.
//
// 지금까지는 우리가 "받는 쪽" 이었다 (앱이 GET 으로 물어봄).
// 여기서는 우리가 "보내는 쪽" 이 된다.
//
//   아두이노 → 우리 서버 → [POST] → SPOT 서버 → 앱
//
// ★ 가장 중요한 원칙
//   SPOT 서버가 꺼져 있든, 키가 틀렸든, 네트워크가 끊기든
//   우리 서버는 절대 죽지 않는다. 실패는 로그만 남기고 넘어간다.
//   주차장 시스템이 앱 사정 때문에 멈추면 안 된다.
//
// 설정은 .env 에서 한다.
//   SPOT_URL=https://sprint-spot.vercel.app/api/detect
//   SPOT_KEY=팀에서 공유한 키
//   SPOT_STORE_ID=s1
//
// SPOT_URL 이 비어 있으면 이 기능 전체가 꺼진다.
// ==========================================

'use strict';

const { nowKstIso } = require('./kst');

const SPOT_URL = process.env.SPOT_URL || '';
const SPOT_KEY = process.env.SPOT_KEY || '';
const STORE_ID = process.env.SPOT_STORE_ID || 's1';

// ------------------------------------------
// 보내는 주기
//
// SPOT 규격:
//   · 상태가 바뀐 순간마다 (10면 통째로)
//   · 변화가 없어도 1분에 한 번은 보낼 것 (안 보내면 "센서 오프라인" 처리)
//   · 3초마다 무조건 쏘지는 말 것 (Vercel 호출량)
//
// 그래서 "바뀔 때만 보내되, 최소 간격을 두고" + "1분 하트비트" 로 맞춘다.
// ------------------------------------------
// ⚠ 실측: SPOT 서버 응답이 5~12초 걸린다.
//   서울로 들어온 요청이 미국 동부(iad1)까지 갔다 오기 때문.
//   타임아웃을 짧게 잡으면 정상 요청도 전부 실패로 처리된다.
//   한 번에 10초씩 걸리는데 3초마다 보내면 계속 밀리므로 간격도 넉넉히 둔다.
const MIN_INTERVAL_MS = Number(process.env.SPOT_MIN_INTERVAL_MS) || 10000;
const HEARTBEAT_MS = Number(process.env.SPOT_HEARTBEAT_MS) || 60000;
const TIMEOUT_MS = Number(process.env.SPOT_TIMEOUT_MS) || 30000;

const enabled = !!SPOT_URL;

// ------------------------------------------
// 상태
// ------------------------------------------
let sending = false;      // 지금 보내는 중인지 (겹쳐 보내기 방지)
let pending = null;       // 보내는 중에 새 값이 생기면 여기 보관
let lastSpaces = null;    // 하트비트용 마지막 값
let lastStale = false;
let lastSentAt = 0;
let sendTimer = null;
let heartbeatTimer = null;

const stats = {
  enabled: enabled,
  url: SPOT_URL || null,
  storeId: STORE_ID,
  sent: 0,          // 성공 횟수
  failed: 0,        // 실패 횟수
  merged: 0,        // 간격 제한으로 합쳐진 횟수
  lastSentAt: null,
  lastError: null,
  lastResponse: null,
};

// ==========================================
// 우리 형식 → SPOT 형식
//
//   { spaceNumber: 1, occupied: true }
//        ↓
//   { code: "A1", status: "occupied" }
//
// stale=true 이면 전부 "unknown" 으로 보낸다.
// 아두이노가 빠졌을 때 옛날 값을 "available" 이라고 우기는 것보다,
// 모른다고 말하는 편이 훨씬 낫다. (SPOT 서버가 이용 가능 수에서 제외한다)
// ==========================================
function toSpotPayload(spaces, stale) {
  return {
    storeId: STORE_ID,
    detectedAt: Date.now(),
    slots: spaces.map((s) => ({
      code: 'A' + s.spaceNumber,
      status: stale ? 'unknown' : s.occupied ? 'occupied' : 'available',
    })),
  };
}

// ==========================================
// 실제 전송
//
// 여기서 나는 모든 오류를 잡아낸다. 바깥으로 던지지 않는다.
// ==========================================
async function send(payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (SPOT_KEY) headers['x-spot-key'] = SPOT_KEY;

  // 응답이 없을 때 빠져나오기 위한 타임아웃
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(SPOT_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // 응답 본문을 읽어둔다. 오류 원인이 여기 담겨 온다.
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch (e) {
      bodyText = '(본문 없음)';
    }

    if (!res.ok) {
      stats.failed++;
      stats.lastError = `SPOT 서버 응답 ${res.status} — ${bodyText.slice(0, 200)}`;

      console.warn(`[SPOT] 실패 ${res.status}`);

      if (res.status === 401) {
        console.warn('[SPOT] → x-spot-key 가 틀렸습니다. .env 의 SPOT_KEY 를 확인하세요.');
      } else if (res.status === 400) {
        console.warn('[SPOT] → storeId 나 slots 가 빠졌습니다.');
      } else if (res.status === 404) {
        console.warn(`[SPOT] → storeId "${STORE_ID}" 가 SPOT DB 에 없습니다.`);
      }

      console.warn('[SPOT] → 우리 서버는 계속 동작합니다.');
      return false;
    }

    // 성공. 응답을 확인해서 이상하면 알려준다.
    stats.sent++;
    stats.lastSentAt = nowKstIso();
    stats.lastError = null;

    try {
      const json = JSON.parse(bodyText);
      stats.lastResponse = json;

      // code 오타가 있으면 여기 담겨 온다. 조용히 넘기면 안 된다.
      if (Array.isArray(json.unknownCodes) && json.unknownCodes.length > 0) {
        console.warn('[SPOT] ⚠ SPOT DB 에 없는 코드:', json.unknownCodes.join(', '));
      }
    } catch (e) {
      stats.lastResponse = bodyText.slice(0, 200);
    }

    return true;
  } catch (err) {
    // 여기로 오는 경우: SPOT 서버가 꺼짐 / 주소 틀림 / 네트워크 끊김 / 타임아웃
    stats.failed++;
    stats.lastError =
      err.name === 'AbortError'
        ? `응답 없음 (${TIMEOUT_MS}ms 초과)`
        : err.message;

    console.warn('[SPOT] 실패 —', stats.lastError);
    console.warn('[SPOT] → 우리 서버는 계속 동작합니다. 다음에 다시 시도합니다.');
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// ==========================================
// 바깥에서 부르는 함수
//
// 상태가 바뀔 때마다 호출한다. 실패해도 예외를 던지지 않는다.
//
//   spaces  : [{ spaceNumber, occupied }, ...] 10개
//   options : { stale: true } 면 전부 unknown 으로 보낸다
// ==========================================
function notify(spaces, options) {
  if (!enabled) return;
  if (!Array.isArray(spaces) || spaces.length === 0) return;

  const stale = !!(options && options.stale);

  // 하트비트가 쓸 수 있도록 최신 값을 보관해둔다
  lastSpaces = spaces;
  lastStale = stale;

  const sinceLast = Date.now() - lastSentAt;

  // 이미 보내는 중이면 최신 값만 남겨두고 끝낸다.
  if (sending) {
    if (pending) stats.merged++;
    pending = { spaces, stale };
    return;
  }

  // 최소 간격이 안 지났으면 예약만 해둔다.
  if (sinceLast < MIN_INTERVAL_MS) {
    if (pending) stats.merged++;
    pending = { spaces, stale };

    if (!sendTimer) {
      sendTimer = setTimeout(() => {
        sendTimer = null;
        flush();
      }, MIN_INTERVAL_MS - sinceLast);
    }
    return;
  }

  pending = { spaces, stale };
  flush();
}

async function flush() {
  if (!enabled || sending || !pending) return;

  const job = pending;
  pending = null;
  sending = true;
  lastSentAt = Date.now();

  try {
    await send(toSpotPayload(job.spaces, job.stale));
  } catch (err) {
    // send() 안에서 이미 다 잡지만, 만에 하나를 대비한 이중 안전장치
    stats.failed++;
    stats.lastError = err.message;
  } finally {
    sending = false;

    // 보내는 동안 새 값이 들어왔으면 이어서 처리
    if (pending && !sendTimer) {
      sendTimer = setTimeout(() => {
        sendTimer = null;
        flush();
      }, MIN_INTERVAL_MS);
    }
  }
}

// ==========================================
// 하트비트
//
// 변화가 없어도 1분에 한 번은 보낸다.
// 안 보내면 SPOT 서버가 "센서 오프라인" 으로 판단한다.
//
// 마지막 전송이 1분 이내면 건너뛴다. 방금 보냈는데 또 보낼 필요는 없다.
// ==========================================
function startHeartbeat() {
  if (!enabled || heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {
    if (!lastSpaces) return;                       // 아직 데이터가 없음
    if (Date.now() - lastSentAt < HEARTBEAT_MS) return; // 최근에 보냄

    notify(lastSpaces, { stale: lastStale });
  }, 10000); // 10초마다 확인만 한다. 실제 전송은 1분에 한 번.

  // 이 타이머 때문에 프로그램이 종료되지 않는 일이 없도록
  if (heartbeatTimer.unref) heartbeatTimer.unref();
}

// ==========================================
// 시작할 때 설정을 화면에 보여준다
// ==========================================
function describe() {
  if (!enabled) {
    return '[SPOT] 전송 꺼짐 (.env 의 SPOT_URL 미설정)';
  }

  const lines = [
    '[SPOT] 전송 켜짐',
    '       보낼 곳  : ' + SPOT_URL,
    '       storeId  : ' + STORE_ID,
    '       인증     : ' + (SPOT_KEY ? 'x-spot-key 사용' : '⚠ SPOT_KEY 없음 → 401 이 납니다'),
    '       최소간격 : ' + MIN_INTERVAL_MS / 1000 + '초',
    '       하트비트 : ' + HEARTBEAT_MS / 1000 + '초마다',
  ];

  return lines.join('\n');
}

function stop() {
  if (sendTimer) {
    clearTimeout(sendTimer);
    sendTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  pending = null;
}

module.exports = {
  notify,
  startHeartbeat,
  describe,
  stop,
  stats,
  toSpotPayload, // 테스트용
  get enabled() {
    return enabled;
  },
};
