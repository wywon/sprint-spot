// ==========================================
// parser.js
// 2단계: 아두이노 시리얼 한 줄을 데이터로 바꾸는 함수 모음.
//
// 이 파일은 직접 실행하지 않는다. 다른 파일에서 require 해서 쓴다.
//   const { parseParkingLine } = require('./parser');
//
// 실제 아두이노 출력 예 (88자 고정):
//   1번:빈자리 | 2번:주차중 | ... | 10번:빈자리
// ==========================================

'use strict';

const TOTAL_SPACES = 10;

// 아두이노가 보내는 한글 상태 → true/false
const STATUS_MAP = {
  빈자리: false, // 빈자리
  주차중: true,  // 주차중
};

// "3번:주차중" 형태 하나를 검사하는 패턴
const ENTRY_PATTERN = /^(\d{1,2})번:(빈자리|주차중)$/;

// 실패 결과를 만드는 도우미
function fail(reason) {
  return { ok: false, spaces: null, error: reason };
}

// ==========================================
// 한 줄 → 주차면 배열
//
// 성공: { ok: true,  spaces: [{spaceNumber, occupied}, ...10개], error: null }
// 실패: { ok: false, spaces: null, error: '이유' }
//
// 실패해도 예외를 던지지 않는다. 서버가 죽으면 안 되기 때문.
// ==========================================
function parseParkingLine(rawLine) {
  if (typeof rawLine !== 'string') {
    return fail('문자열이 아님');
  }

  // 줄 끝의 \r 과 앞뒤 공백 제거
  const line = rawLine.trim();

  if (line === '') {
    return fail('빈 줄');
  }

  // "주차장 시스템 시작" 같은 부팅 메시지를 여기서 걸러낸다
  if (!line.includes('번:')) {
    return fail('주차 데이터 줄이 아님');
  }

  // " | " 로 나눈다. 공백 개수가 달라져도 되도록 trim 을 각각 적용.
  const parts = line
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '');

  if (parts.length !== TOTAL_SPACES) {
    return fail(`항목이 ${parts.length}개 (${TOTAL_SPACES}개여야 함)`);
  }

  // 번호를 인덱스로 써서 채운다. 순서가 뒤바뀌어도 올바르게 들어간다.
  const spaces = new Array(TOTAL_SPACES).fill(null);

  for (const part of parts) {
    const matched = part.match(ENTRY_PATTERN);

    if (!matched) {
      return fail(`형식이 잘못된 항목: "${part}"`);
    }

    const spaceNumber = Number(matched[1]);
    const statusText = matched[2];

    if (spaceNumber < 1 || spaceNumber > TOTAL_SPACES) {
      return fail(`주차면 번호가 범위를 벗어남: ${spaceNumber}`);
    }

    if (spaces[spaceNumber - 1] !== null) {
      return fail(`주차면 번호 중복: ${spaceNumber}`);
    }

    spaces[spaceNumber - 1] = {
      spaceNumber: spaceNumber,
      occupied: STATUS_MAP[statusText],
    };
  }

  // 1~10번이 하나도 빠지지 않았는지 확인
  const missing = [];
  for (let i = 0; i < TOTAL_SPACES; i++) {
    if (spaces[i] === null) missing.push(i + 1);
  }

  if (missing.length > 0) {
    return fail(`빠진 주차면: ${missing.join(', ')}번`);
  }

  return { ok: true, spaces: spaces, error: null };
}

// ==========================================
// 주차면 배열 → 요약 숫자
// 최종 API 응답과 같은 이름을 쓴다.
// ==========================================
function summarize(spaces) {
  const occupiedSpaces = spaces.filter((s) => s.occupied).length;

  return {
    totalSpaces: TOTAL_SPACES,
    occupiedSpaces: occupiedSpaces,
    availableSpaces: TOTAL_SPACES - occupiedSpaces,
  };
}

// ==========================================
// 보기 좋은 한 줄 요약 (터미널 확인용)
// 예: [.X..X.....] 주차 2 / 빈자리 8
// ==========================================
function toDisplayString(spaces) {
  const grid = spaces.map((s) => (s.occupied ? 'X' : '.')).join('');
  const { occupiedSpaces, availableSpaces } = summarize(spaces);

  return `[${grid}] 주차 ${occupiedSpaces} / 빈자리 ${availableSpaces}`;
}

module.exports = {
  parseParkingLine,
  summarize,
  toDisplayString,
  TOTAL_SPACES,
};
