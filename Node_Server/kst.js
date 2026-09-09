// ==========================================
// kst.js
// 시각을 한국 시간(KST, UTC+9)으로 표시한다.
//
// 왜 필요한가:
//   JavaScript 의 toISOString() 은 항상 UTC 로 바꿔서 내보낸다.
//     2026-09-09T16:18:21.621Z   ← UTC. 한국 시간으로는 9/10 새벽 1시 18분
//   값은 맞지만 볼 때마다 9시간을 더해야 한다.
//
//   그래서 같은 순간을 한국 시간 표기로 바꿔준다.
//     2026-09-10T01:18:21+09:00
//
//   둘은 완전히 같은 시각이고, 둘 다 ISO-8601 표준이라
//   new Date() 로 파싱하면 동일한 결과가 나온다.
//
//   끝의 +09:00 은 "이 시각은 한국 시간이다" 라는 표시다.
//   9시간을 더하라는 뜻이 아니라, 이미 한국 시간임을 알려주는 꼬리표다.
//
// 사용법
//   const { toKstIso, nowKstIso, toKstText } = require('./kst');
// ==========================================

'use strict';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

// ------------------------------------------
// Date → "2026-09-10T01:18:21+09:00"
// API 응답에 쓴다.
// ------------------------------------------
function toKstIso(value) {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;

  // 9시간을 더한 뒤 UTC 로 찍으면 그 글자가 곧 한국 시간이 된다.
  // 서버 PC 의 시간대 설정과 무관하게 항상 같은 결과가 나온다.
  // slice(0, 19) 로 밀리초와 끝의 Z 를 잘라내고 +09:00 을 붙인다.
  return new Date(date.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 19) + '+09:00';
}

// ------------------------------------------
// 지금 시각을 KST 로
// ------------------------------------------
function nowKstIso() {
  return toKstIso(new Date());
}

// ------------------------------------------
// Date → "2026-09-10 01:18:21"
// 터미널 출력처럼 사람이 읽는 곳에 쓴다. (T 대신 공백, 시간대 표시 없음)
// ------------------------------------------
function toKstText(value) {
  const iso = toKstIso(value);
  if (!iso) return null;

  return iso.slice(0, 19).replace('T', ' ');
}

module.exports = {
  toKstIso,
  nowKstIso,
  toKstText,
};
