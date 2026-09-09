# 주차장 API 연동 안내 (웹/앱 담당자용)

서버는 완성되어 동작 중입니다. 이 문서 하나만 보고 화면을 만들 수 있습니다.

---

## 1. 주소

```
https://lens-salvage-unmixable.ngrok-free.dev
```

**이 주소는 고정입니다.** 서버를 껐다 켜도 바뀌지 않습니다.

| 상황 | 주소 |
|---|---|
| 서버 노트북 본인 | `http://localhost:3000` |
| 그 외 (팀원, 휴대폰) | `https://lens-salvage-unmixable.ngrok-free.dev` |

엔드포인트는 두 개입니다.

```
GET  /api/parking     주차 현황
GET  /api/health      서버·DB·수집기 상태
```

주소는 고정이지만 **서버가 켜져 있어야 응답합니다.** 꺼져 있으면 `ERR_NGROK_3200 ... is offline` 페이지가 나옵니다. 그럴 땐 서버 담당자에게 알려주세요.

---

## 2. ⚠ 요청에 헤더를 반드시 넣으세요

ngrok 무료 플랜은 브라우저 요청에 **경고 페이지(HTML)를 먼저 보냅니다.** 그냥 `fetch` 하면 JSON 대신 그 HTML이 와서 파싱 오류가 납니다.

헤더 하나로 건너뜁니다. **값은 아무거나 상관없고, 있기만 하면 됩니다.**

```js
fetch(url, {
  headers: { 'ngrok-skip-browser-warning': 'true' }
});
```

`localhost`로 접속할 땐 필요 없지만, 넣어둬도 문제없습니다. 그냥 항상 넣으세요.

---

## 3. 응답 형식

`GET /api/parking`

```json
{
  "totalSpaces": 10,
  "occupiedSpaces": 6,
  "availableSpaces": 4,
  "spaces": [
    { "spaceNumber": 1,  "occupied": true,  "updatedAt": "2026-09-10T01:18:21+09:00" },
    { "spaceNumber": 2,  "occupied": false, "updatedAt": "2026-09-10T01:18:44+09:00" },
    { "spaceNumber": 10, "occupied": true,  "updatedAt": "2026-09-10T01:18:54+09:00" }
  ]
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `totalSpaces` | number | 항상 10 |
| `occupiedSpaces` | number | 주차중인 면 수 |
| `availableSpaces` | number | 빈자리 수 (10 − occupiedSpaces) |
| `spaces` | array | **항상 1~10번 전부 포함**, 번호 오름차순 |
| `spaces[].spaceNumber` | number | 주차면 번호 1~10 |
| `spaces[].occupied` | **boolean** | `true` = 주차중 / `false` = 빈자리 |
| `spaces[].updatedAt` | string | ISO-8601, **한국 시간**. 그 주차면의 상태가 마지막으로 바뀐 시각 |

### 시간대

앞의 숫자가 **그대로 한국 시간**입니다. 뒤의 `+09:00` 은 "이 시각은 한국 시간이다"라는 표시일 뿐, 더하라는 뜻이 아닙니다.

```
"2026-09-10T01:18:21+09:00"  →  한국 시간 9월 10일 새벽 1시 18분 21초
```

`new Date()` 로 그대로 파싱하면 됩니다. 계산할 게 없습니다.

```js
new Date(space.updatedAt).toLocaleTimeString('ko-KR');   // 오전 1:18:21
```

보는 사람 컴퓨터의 시간대와 무관하게 항상 한국 시간으로 표시하려면:

```js
new Date(space.updatedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
```

### `updatedAt`은 "조회 시각"이 아닙니다

값이 바뀔 때만 갱신됩니다. 그래서 주차면마다 시각이 다릅니다.
이걸로 **"이 자리에 얼마나 오래 서 있었나"** 를 계산할 수 있습니다.

```js
const 주차경과ms = Date.now() - new Date(space.updatedAt).getTime();
```

반대로 "서버가 살아있나"를 이걸로 판단하면 안 됩니다. 아무 차도 안 움직이면 시각이 안 변하니까요. 생존 확인은 `/api/health`를 쓰세요.

---

## 4. 호출 예제

```js
const API_BASE = 'https://lens-salvage-unmixable.ngrok-free.dev';

async function fetchParking() {
  const res = await fetch(`${API_BASE}/api/parking`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });

  if (!res.ok) {
    // 503 = DB 일시 오류. 화면을 비우지 말고 이전 값을 유지할 것
    throw new Error(`서버 오류 ${res.status}`);
  }

  return res.json();
}

// 2초마다 갱신
let last = null;

async function tick() {
  try {
    last = await fetchParking();
    render(last);
  } catch (e) {
    console.warn('갱신 실패, 이전 값 유지:', e.message);
    // last 를 그대로 두고 화면은 건드리지 않는다
  }
}

tick();
setInterval(tick, 2000);
```

CORS는 열려 있습니다. 별도 설정 없이 브라우저에서 바로 호출됩니다.

---

## 5. 갱신 주기

**아두이노가 1.2초마다 상태를 보냅니다.** 그보다 자주 호출해도 같은 값만 옵니다.

권장: **2초 간격 폴링.**

---

## 6. 오류 처리

| 상태 | 의미 | 화면에서 할 일 |
|---|---|---|
| `200` | 정상 | 값 표시 |
| `503` | DB 일시 오류 | **이전 값 유지.** 화면을 비우지 말 것 |
| `500` | 데이터 이상 (주차면이 10개가 아님) | 오류 표시 |
| `404` | 주소 오타 | 주소 확인 |
| HTML이 옴 | ngrok 헤더 누락 | 2번 항목의 헤더 추가 |
| 연결 실패 | 서버나 터널이 꺼짐 | "연결 끊김" 표시, 이전 값은 유지 |

```json
{ "error": "DATABASE_UNAVAILABLE", "message": "DB 를 읽을 수 없습니다. 잠시 후 다시 시도하세요." }
```

**중요:** 오류가 났다고 화면을 비우면 발표 중에 최악입니다. 이전 값을 유지하고 "갱신 안 됨" 표시만 작게 띄우세요.

---

## 7. 서버가 꺼져 있을 때 개발하는 법

서버 노트북이 항상 켜져 있진 않습니다. 응답 형식은 확정됐으니 **가짜 데이터로 화면을 먼저 만드세요.**

```js
const USE_MOCK = true;   // 서버 붙일 때 false 로

// 실제 서버와 같은 형식으로 시각을 만든다
function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19) + '+09:00';
}

const MOCK = {
  totalSpaces: 10,
  occupiedSpaces: 3,
  availableSpaces: 7,
  spaces: Array.from({ length: 10 }, (_, i) => ({
    spaceNumber: i + 1,
    occupied: [2, 5, 9].includes(i + 1),
    updatedAt: kstNow(),
  })),
};

const data = USE_MOCK ? MOCK : await fetchParking();
```

---

## 8. 화면 구성 제안

필수 표시 항목 5가지입니다.

- 전체 주차면 수
- 현재 주차중인 차량 수
- 빈자리 수
- 1~10번 각각의 주차 상태
- 마지막 갱신 시간

**숫자 하나를 크게.** 발표장 뒷줄에서 읽히는 건 `빈자리 3` 하나뿐입니다. 10칸 그리드와 상세 표는 가까이 온 사람용입니다.

색은 하드웨어 LED와 맞추면 이해가 빠릅니다 — **주차중 빨강 / 빈자리 초록.**

---

## 9. 상태 확인

`GET /api/health`

```json
{
  "server": "ok",
  "database": "ok",
  "collector": {
    "mode": "serial",
    "serialConnected": true,
    "linesReceived": 842,
    "dbUpdates": 37,
    "lastLineAt": "2026-09-10T01:18:55+09:00",
    "lastChangeAt": "2026-09-10T01:18:54+09:00"
  },
  "time": "2026-09-10T01:18:56+09:00"
}
```

| 항목 | 의미 |
|---|---|
| `database` | `unavailable` 이면 DB가 죽은 것 |
| `collector.mode` | `serial` = 실제 아두이노 / `mock` = 가짜 데이터 |
| `collector.serialConnected` | 아두이노가 USB로 붙어 있는지 |
| `collector.lastLineAt` | 마지막으로 데이터를 받은 시각. 이게 몇 분 전이면 아두이노가 멈춘 것 |

문제가 보이면 서버 담당자에게 이 응답을 그대로 전달하면 원인 파악이 빠릅니다.
