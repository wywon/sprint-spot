# 이슈목록 문서
- [링크](https://github.com/wywon/Team-Project-Sprint/wiki/%EC%9D%B4%EC%8A%88%ED%85%8C%EC%9D%B4%EB%B8%94(5%EC%A3%BC-%EB%B6%84%EC%97%85%ED%91%9C-%EC%95%84%ED%8B%B0%ED%8C%A9%ED%8A%B8))
- 작업목록은 여기서 확인하기

# SPOT

> 대전 원도심 입점 식당의 **실시간 좌석·예약**과 **주차면 센서 기반 실시간 주차**를 한 앱에서 확인하는 서비스

`SPOT_v3_프로토타입.html` 의 UI를 Next.js App Router 프로젝트로 옮긴 것입니다.
하나의 Next 앱 안에서 **라우트 그룹**으로 손님 앱과 관리자 패널을 나눴습니다.

---

## 목차

| 절 | 내용 | 누가 꼭 읽어야 하나 |
|---|---|---|
| 1 | 시작하기 | 전원 |
| 2 | 폴더 구조 | 전원 |
| 3 | 브랜치와 배포 | 전원 |
| 4 | 작업 분담 | 전원 |
| 5 | 손대면 안 되는 설계 규칙 | 전원 |
| 6 | **API 규격 9개** | A·B·C·**D** |
| 7 | 4주차에 실제 데이터로 바꾸는 법 | C |
| 8 | Hydration 주의사항 | A·B |
| 9 | 왜 모노레포가 아니라 라우트 그룹인가 | (배경 설명) |
| 10 | 아직 없는 것 | 전원 |
| 11 | 진행 상황 | 전원 |

---

## 1. 시작하기

```bash
npm install       # ⚠️ pnpm 아님. 4절 참고
npm run dev       # http://localhost:3000
```

| 주소 | 화면 |
|---|---|
| `/` | `/explore` 로 리다이렉트 |
| `/explore` | 손님 앱 첫 화면 |
| `/admin` | 관리자 패널 대시보드 |

화면 맨 위 검은 바에서 **손님 앱 ↔ 관리자 패널**을 오갈 수 있습니다.
이 바는 개발용이며 `components/ModeSwitch.tsx` 하나만 지우면 사라집니다.

> **1~3주차에는 DB·환경변수가 필요 없습니다.** `lib/mock.ts` 만 보고 화면을 만듭니다.
> DB 작업(C)만 `.env` 가 필요합니다. `.env.local` 이 아니라 **`.env`** 입니다 — Prisma CLI는 `.env.local` 을 읽지 않습니다.

### 스택

Next.js 15.5.25 (App Router) · React 19 · TypeScript strict · Tailwind CSS 3.4
Prisma 6 · Supabase (PostgreSQL) · Vercel

> **Prisma는 반드시 6입니다.** 7은 `url = env("DATABASE_URL")` 문법을 없애고 driver adapter를 요구합니다. 지금 스키마가 안 돌아갑니다.
> **Next 16으로 올리지 않습니다.** 5주 일정에 얻을 게 없습니다.

### 문제 생겼을 때

```bash
npm run doctor    # npm ls && npx prisma -v && npm run build
```

---

## 2. 폴더 구조

```
app/
├ layout.tsx              ★ 두 앱이 공유하는 유일한 레이아웃 (폰트·전역 CSS·전역 상태)
├ globals.css
├ page.tsx                → /explore 리다이렉트
│
├ (customer)/             ← 괄호 = URL에 안 나옴. 손님 앱 그룹
│  ├ layout.tsx           PhoneChrome + TabBar        [담당 A]
│  ├ explore/             /explore      지도 첫 화면
│  ├ search/              /search       전체화면 검색
│  ├ favorites/           /favorites    즐겨찾기
│  ├ lots/[id]/           /lots/L1      공영주차장 상세
│  ├ stores/[id]/         /stores/s1    식당 상세
│  │  ├ seats/            /stores/s1/seats     실시간 좌석
│  │  └ reviews/          /stores/s1/reviews   리뷰 목록
│  ├ reserve/[id]/        /reserve/s1          예약 3단계
│  │  └ done/             /reserve/s1/done     예약 완료
│  ├ parking/             /parking      주차 탭
│  ├ reservations/        /reservations 예약 목록
│  │  └ [id]/             /reservations/r1     예약 상세
│  │     └ review/        /reservations/r1/review  리뷰 작성
│  └ my/                  /my           마이페이지
│
├ (admin)/                ← 관리자 그룹
│  ├ layout.tsx           Sidebar + 데스크톱 셸        [담당 B]
│  └ admin/
│     ├ page.tsx          /admin           대시보드
│     ├ hall/             /admin/hall      홀 운영
│     ├ parking/          /admin/parking   주차 관리
│     └ store/            /admin/store     매장 관리 (정보·테이블·주차장·통계)
│
└ api/                    ★ 2~3주차에 생김. 6절 규격대로만 만든다   [담당 C]

prisma/                   [담당 C]
├ schema.prisma           DB 설계도
└ seed.ts                 mock.ts 데이터를 DB에 넣는 스크립트

detector/                 [담당 D] · Python · 웹과 완전히 분리

components/
├ ui/                     ★ 공용 부품. 화면에서 직접 스타일 쓰지 말고 여기 걸 쓴다  [담당 C]
│  ├ Icon.tsx             SVG 아이콘 48종
│  ├ primitives.tsx       Button Badge Card Chip Segmented Gauge Empty Skeleton LiveStamp
│  └ overlays.tsx         BottomSheet Modal NavSheet ToastHost ConfirmModal
├ customer/
│  ├ Shell.tsx            PhoneChrome TabBar SubHeader StickyCta
│  ├ Cards.tsx            StoreCard PlainStoreCard LotCard FoodTile
│  └ MapCanvas.tsx        지도 대체 구현 + 마커 3종
├ admin/
│  ├ Sidebar.tsx          AdminSidebar AdminTopbar
│  ├ SlotGrid.tsx         주차장 배치도 + 범례
│  ├ TableMap.tsx         테이블 배치도
│  ├ KPI.tsx              KPI StatBar StatRow
│  └ ResCalendar.tsx      예약 달력 모달
└ ModeSwitch.tsx          개발용 상단 바 (배포 시 삭제)

lib/                      ★ 여기가 계약서다. 바꾸려면 팀과 상의       [담당 C]
├ types.ts                도메인 타입 = Prisma 모델의 원본이자 API 응답의 모양
├ tokens.ts               상태 → 색·아이콘·라벨 매핑 / 탭·사이드바 정의
├ format.ts               cx, won, agoText, freshness …  순수 함수
├ status.ts               slotStatus, seatStats, parkStats, levelOf …  비즈니스 로직
├ mock.ts                 목업 데이터 (4주차에 API로 교체, 5주차에 삭제)
└ store.tsx               전역 상태 Context + 실시간 시뮬레이터
```

> ⚠️ **`lib/types.ts` 와 `lib/mock.ts` 는 옮기거나 이름을 바꾸지 않습니다.** 화면 41개가 여기서 import 합니다.
> ⚠️ `app/` `components/` `lib/` 안에는 **`.tsx` 와 `.ts` 만** 있어야 합니다. `.js` 가 보이면 컴파일 찌꺼기이니 지웁니다.

---

## 3. 브랜치와 배포

### 브랜치

```
main       항상 동작하는 상태 · Production 배포
  └ feature   통합 · Preview 배포
       └ feature-1/xxx   개인 작업 브랜치 ← 여기서 작업
```

**개인 브랜치는 `main` 이 아니라 `feature` 에서 자릅니다.**

```bash
git checkout feature
git pull
git checkout -b feature-1/a-profile-edit
```

| 하면 안 되는 것 | 이유 |
|---|---|
| **Squash merge** | 개인 커밋 기록이 사라져서 누가 뭘 했는지 안 남습니다 |
| **`vercel --prod` CLI 배포** | Git과 배포 상태가 어긋납니다. Git 연동 배포만 씁니다 |
| **`package-lock.json` 삭제** | 캐시가 아니라 **버전 계약서**입니다. 지우면 사람마다 다른 버전이 깔립니다 |
| **`pnpm` 사용** | lock 파일이 두 개가 되고 Vercel 빌드가 흔들립니다. **`npm` 으로 통일** |

### 배포

| | 주소 |
|---|---|
| Production (`main`) | `https://sprint-spot.vercel.app` |
| Preview (`feature`) | `https://sprint-spot-git-feature-wywon.vercel.app` |

- Vercel Hobby 플랜이라 **머지 커밋은 B가 만듭니다.**
- **`feature-1/xxx` 브랜치의 Preview 배포 실패는 정상입니다.** `main` `feature` 두 개만 배포 대상입니다.
- 버리는 커밋(오타 수정, 파일 정리)은 커밋 메시지에 `[skip ci]` 를 붙여 빌드 횟수를 아낍니다.
- 발표 직전, 그 시점의 **배포별 고정 URL을 따로 적어둡니다.** 시연 중 문제가 생기면 돌아갈 지점입니다.

---

## 4. 작업 분담

| 담당 | 폴더 | 다른 사람과 겹치지 않음 |
|---|---|---|
| **A** 손님 앱 | `app/(customer)/**` | ✅ |
| **B** 관리자 패널 | `app/(admin)/**` | ✅ |
| **C** 공용 부품·데이터 | `components/ui/**`, `lib/**`, `prisma/**`, `app/api/**` | ✅ |
| **D** 센서 | `detector/` (별도 · Python) | ✅ 접점은 `/api/detect` 하나 |

같은 파일을 두 사람이 고칠 일이 구조적으로 없습니다. 충돌이 나면 분담이 잘못된 것입니다.

### 만드는 순서 (권장)

1. **C** 가 `lib/` 와 `components/ui/` 를 먼저 확정 → A·B가 기다리지 않게
2. **A** `/explore` → `/stores/[id]` → `/reserve/[id]` → 나머지
3. **B** `/admin` → `/admin/hall` → `/admin/parking` → `/admin/store`
4. 4주차: `lib/mock.ts` 를 `fetch('/api/...')` 로 교체 (7절)

---

## 5. 손대면 안 되는 설계 규칙

이 규칙들은 화면을 예쁘게 하려는 게 아니라 **신뢰를 지키기 위한 것**입니다.
6절 API 규격이 이 번호를 그대로 참조합니다.

1. **예약 과정에 테이블 번호를 노출하지 않는다.** 손님은 테이블을 고르지 않습니다. 자리 배정은 매장이 결정합니다.
2. **`unknown`(확인 중) 주차면을 이용 가능 수에 넣지 않는다.** — `lib/status.ts` 의 `parkStats()`
3. **센서가 죽으면 `available` 을 `0` 이 아니라 `null` 로 준다.** `0` 은 "만차", `null` 은 "모른다". 완전히 다른 이야기입니다.
4. **색만으로 상태를 전달하지 않는다.** 색 + 아이콘 + 텍스트 + 빗금(`hatch-*`) 네 가지를 항상 함께 씁니다.
5. **부정 상태에는 반드시 대안 CTA를 둔다.** "만차입니다"로 끝내지 않습니다.
6. **손님 화면에 CCTV/센서/기술 용어를 노출하지 않는다.** 손님이 이해할 상태는 다섯 개뿐: 주차 가능 / 주차 중 / 만차 / 확인 중 / 확인 불가.
7. **실시간 수치 옆에는 항상 `<LiveStamp>` 를 둔다.** "이 숫자가 지금 상태인가?"에 답해야 합니다.

---

# 6. API 규격 9개

> 이슈 [E1] · 브랜치 `feature-1/e1-api-req-res`
> **이 절이 A·B·C·D 네 명의 계약서입니다.** 여기 적힌 모양과 다르게 만들면 4주차에 화면이 안 붙습니다.
> 구현은 2~3주차 C 담당. 지금 정한 건 **모양뿐이고 코드는 아직 없습니다.**

### 왜 지금 정하나

3주 동안 A·B·D가 각자 다른 모양을 상상한 채로 만들면, 4주차 연결하는 날 처음으로 안 맞는 걸 알게 됩니다. 그때는 고칠 시간이 없습니다.
특히 **D는 파이썬으로 별도 장비 코드**를 짜기 때문에 이 문서 없이는 아예 시작할 수 없습니다.

| # | 부르는 법 | 하는 일 | 쓰는 사람 |
|---|---|---|---|
| 1 | `GET /api/stores` | 매장 목록 | A |
| 2 | `GET /api/stores/[id]` | 매장 하나의 전부 | A |
| 3 | `GET /api/stores/[id]/times` | 예약 가능한 시간 | A |
| 4 | `POST /api/reservations` | 예약하기 | A |
| 5 | `GET /api/reservations?phone=` | 내 예약 보기 | A |
| 6 | `POST /api/reservations/[id]/cancel` | 예약 취소 | A |
| 7 | `PATCH /api/admin/tables/[id]` | 테이블 상태 바꾸기 | B |
| 8 | `PATCH /api/admin/slots/[id]` | 주차면 수동 지정 | B |
| 9 | `POST /api/detect` | 센서가 값 보내기 | **D** |

> 4·5번은 파일 하나(`app/api/reservations/route.ts`)에서 `POST`/`GET` 으로 나뉩니다. 주소는 9개, 파일은 8개.
> 3번은 이슈 목록에 `/slots` 로 적혀 있었지만 **`/times` 로 바꿉니다.** 이 프로젝트에서 `slot` 은 이미 주차면(`ParkingSlot`)이라, 같은 단어가 시간까지 가리키면 4주차에 반드시 헷갈립니다.

---

## 6-1. 모든 API가 지키는 약속 5개

### ① 응답은 `lib/types.ts` 모양 그대로 준다 ★가장 중요★

Prisma 스키마는 `lib/types.ts` 와 8군데가 다릅니다(테이블 `code` 분리, `parking` 평탄화, `Store` 병합 등).
그 차이는 **DB 사정이고 화면은 몰라야 합니다.** 서버가 응답을 만들 때 `lib/types.ts` 모양으로 되돌려서 보냅니다.

```
DB(Prisma 모양)  →  route.ts 에서 변환  →  응답(types.ts 모양)  →  화면 41개 무수정
```

지금 화면이 이렇게 쓰고 있습니다.

```tsx
<p>{store.seats.available}자리 남음</p>
```

API가 같은 모양으로 응답하면 **이 줄은 한 글자도 안 바뀝니다.** 다른 모양으로 정해버리면 41개 파일을 전부 고쳐야 합니다.

### ② 시각은 전부 숫자(ms)로 준다

```json
"updated": 1757030400000
```

8절에서 정한 대로 목업 timestamp가 전부 숫자라, `agoText()` `freshness()` `useNow()` 가 숫자를 전제로 쓰여 있습니다. 문자열로 보내면 `<LiveStamp>` 가 전부 깨집니다.
DB는 `DateTime` 이지만 응답 만들 때 `.getTime()` 으로 바꿔서 보냅니다.

단, **사람이 고른 날짜·시간은 문자열**입니다. `"2026-09-10"`, `"18:30"`.

### ③ 모르면 `null`, 없으면 `0` (5절 규칙 3)

```json
"available": 5      // 5자리 남음
"available": 0      // 만차 → "현재 만차예요"
"available": null   // 센서가 죽어서 모름 → "확인할 수 없어요"
```

- `total` 은 언제나 숫자입니다. 주차면 개수는 센서와 무관하게 아니까요.
- **`null` 이 될 수 있는 건 `available` 뿐입니다.**
- **좌석(`seats`)에는 `null` 이 없습니다.** 관리자가 손으로 누르는 값이라 항상 압니다. 주차만 해당됩니다.

### ④ 실패는 항상 같은 모양

```json
{ "error": { "code": "TIME_UNAVAILABLE", "message": "방금 마감된 시간이에요. 다른 시간을 골라 주세요." } }
```

- `code` — 화면이 분기할 때 쓰는 값
- `message` — **손님에게 그대로 보여줄 한국어.** 화면에서 문구를 다시 만들지 않습니다

| 번호 | 언제 |
|---|---|
| `400` | 보낸 값이 잘못됨 |
| `401` | `/api/detect` 키 틀림 |
| `403` | 남의 예약을 건드림 |
| `404` | 그런 매장·예약·테이블이 없음 |
| `409` | 이미 예약됨 / 이미 취소됨 / 불가능한 조작 |
| `500` | 서버 오류 |

성공 번호(200)를 주면서 본문에 error를 넣지 않습니다.

### ⑤ 모든 `route.ts` 맨 위에 이 한 줄

```ts
export const dynamic = 'force-dynamic'
```

없으면 Next.js가 빌드할 때 응답을 굳혀버려서 **배포 후 계속 같은 값만 나옵니다.** 로컬에서는 멀쩡해서 발표 직전에 발견하게 됩니다.
폴링 쪽도 `fetch(url, { cache: 'no-store' })` 를 꼭 붙입니다.

---

## 6-2. 쓸 수 있는 상태값 (오타 금지)

```ts
주차면  'available' | 'occupied' | 'unknown' | 'offline' | 'manual' | 'disabled' | 'ev'
테이블  'available' | 'occupied' | 'reserved' | 'cleaning' | 'disabled'
예약    'upcoming'  | 'visited'  | 'cancelled' | 'noshow'
```

`manual` 과 `offline` 은 **저장되는 값이 아니라 `slotStatus()` 가 계산해서 만드는 값**입니다. 센서도 DB도 이 둘을 직접 쓰지 않습니다.

### `id` 와 `code` 구분

| | `id` | `code` |
|---|---|---|
| 쓰는 곳 | API 부를 때 | 화면에 글자로 보일 때 |
| 테이블 | `tbl_a1b2` | `T04` |
| 주차면 | `slt_x9y8` | `A1` |

4주차에 `t.id` → `t.code` 로 고칠 파일은 `TableMap.tsx` 와 `SlotGrid.tsx` **두 개뿐**입니다. 손님 화면은 테이블 번호를 안 보여주니 영향 없습니다 (5절 규칙 1).

---

## API 1. `GET /api/stores` — 매장 목록

**언제** 탐색 지도 · 검색 결과 · "여기는 어떠세요?"

**보낼 것** 없음. 전체를 받아서 화면에서 거릅니다.
대전 3개 동 규모라 필터칩 누를 때마다 서버에 물어보면 오히려 느립니다. 검색어 `?q=` 만 선택으로 받습니다.

**받을 것**

```json
[
  {
    "id": "s1",
    "name": "대흥동 손칼국수",
    "category": "한식",
    "partner": true,
    "address": "대전 중구 대흥동 123-4",
    "lat": 36.3271, "lng": 127.4271,
    "image": "/img/s1.jpg",
    "tags": ["칼국수", "혼밥"],
    "rating": 4.6,
    "reviews": 128,
    "hours": { "open": "11:00", "close": "21:00", "isOpen": true },
    "seats":   { "total": 12, "available": 4, "occupied": 6, "reserved": 1, "cleaning": 1 },
    "parking": { "fee": "1시간 무료", "total": 20, "available": 5, "unknown": 1, "updated": 1757030400000 }
  },
  {
    "id": "s7",
    "name": "은행동 밀크티",
    "category": "카페",
    "partner": false,
    "address": "대전 중구 은행동 55",
    "lat": 36.3283, "lng": 127.4266
  }
]
```

- **미입점 매장(`partner: false`)은 `seats`·`parking`·`tags` 키를 아예 안 보냅니다.** 지도에 이름만 뜨고 예약 버튼이 죽어 있는 화면과 맞춥니다.
- **거리는 안 보냅니다.** 내 위치는 브라우저만 아니까 `lat`/`lng` 로 화면이 계산합니다.
- `parking.available` 은 `unknown` 을 빼고 셉니다 (5절 규칙 2).
- **주차면·테이블 배열은 목록에 안 넣습니다.** 20면 × 매장 수를 다 넣으면 응답이 수십 배가 됩니다.

---

## API 2. `GET /api/stores/[id]` — 매장 하나의 전부

**언제** 매장 상세 · 실시간 좌석 · 주차 바텀시트 · 주차장 배치도. 화면 4개가 이거 하나를 씁니다.

**받을 것** (목록에 있던 것 + 아래가 추가)

```json
{
  "id": "s1",
  "name": "대흥동 손칼국수",
  "partner": true,
  "phone": "042-123-4567",
  "images": ["/img/s1-1.jpg"],
  "menus": [
    { "id": "m1", "name": "손칼국수", "price": 9000, "image": "/img/m1.jpg", "signature": true }
  ],

  "seats": { "total": 12, "available": 4, "occupied": 6, "reserved": 1, "cleaning": 1 },
  "hourly": [ { "hour": 11, "level": "low" }, { "hour": 12, "level": "high" } ],
  "recommendTimes": ["14:00", "15:30"],

  "tables": [
    { "id": "tbl_a1b2", "code": "T04", "seats": 4, "status": "occupied",
      "statusSince": 1757029200000, "x": 2, "y": 1 }
  ],

  "parking": {
    "fee": "1시간 무료",
    "total": 20,
    "available": 5,
    "unknown": 1,
    "updated": 1757030400000,
    "slots": [
      { "id": "slt_x9y8", "code": "A1", "autoStatus": "occupied",
        "manualStatus": null, "manualUntil": null,
        "lastSeenAt": 1757030400000, "type": "normal", "x": 0, "y": 0 },
      { "id": "slt_q4w5", "code": "A2", "autoStatus": "available",
        "manualStatus": "disabled", "manualUntil": 1757037600000,
        "lastSeenAt": 1757030400000, "type": "ev", "x": 1, "y": 0 }
    ]
  },

  "reviewList": [
    { "id": "rv1", "name": "김**", "rating": 5, "text": "면발이 좋아요", "createdAt": 1756944000000 }
  ]
}
```

### 여기서 꼭 짚을 것 2개

**주차면 최종 상태를 서버가 계산하지 않습니다.**
`autoStatus`(센서가 쓴 값) · `manualStatus`(관리자가 쓴 값) · `manualUntil`(언제까지) **3개를 날것 그대로** 보내고, 최종 상태는 화면이 기존 `lib/status.ts` 의 `slotStatus()` 로 계산합니다.
→ 계산 규칙이 서버와 화면 두 군데로 갈라지면 값이 어긋납니다. 판단 지점은 한 군데여야 합니다.

**단, 테이블의 '정리 중 → 빈자리(40초)' 는 서버가 계산합니다.**
시연이 노트북 2대 동시 테스트라, 화면 타이머로 두면 두 노트북의 남은 좌석 수가 달라집니다. 서버가 `statusSince` 를 들고 있다가 응답 만들 때 40초 지난 `cleaning` 을 `available` 로 바꿔서 보냅니다.

**실패** — `404 STORE_NOT_FOUND` "매장 정보를 찾을 수 없어요."

---

## API 3. `GET /api/stores/[id]/times` — 예약 가능한 시간

**언제** 예약 1단계. 지금 목업이 가짜로 만드는 `timeOpen` 을 이게 대체합니다.

**보낼 것**

```
GET /api/stores/s1/times?date=2026-09-10&people=2
```

**받을 것**

```json
{
  "date": "2026-09-10",
  "people": 2,
  "times": [
    { "time": "11:00", "available": true },
    { "time": "11:30", "available": false },
    { "time": "12:00", "available": true }
  ]
}
```

- **`true`/`false` 2상태뿐입니다.** "3자리 남음" 같은 잔여 수를 보내지 않습니다. 예약 버튼엔 시간만 씁니다.
- 30분 간격. 영업시간~라스트오더 사이만 만듭니다.
- 계산 = `그 인원이 앉을 수 있는 테이블 수 − 그 시간 예약 수 > 0`
- **난수를 쓰지 않습니다.** 8절 Hydration과 같은 이유로, 같은 요청엔 항상 같은 답이어야 합니다.
- 오늘이면 **지난 시간은 목록에서 빼버립니다.** `false` 로 남기지 않습니다.

**실패** — `400 INVALID_DATE` · `404 STORE_NOT_FOUND` · `409 NOT_PARTNER_STORE` "이 매장은 예약을 받고 있지 않아요."

---

## API 4. `POST /api/reservations` — 예약하기

**보낼 것**

```json
{
  "storeId": "s1",
  "date": "2026-09-10",
  "time": "18:30",
  "people": 2,
  "seatType": "table",
  "name": "김지훈",
  "phone": "01012345678",
  "request": "창가 자리 부탁드려요",
  "noShowAgreed": true
}
```

- `phone` — **숫자만 11자리.** 하이픈은 화면에서 지워서 보냅니다. 나중에 이걸로 예약을 찾는데 형식이 흔들리면 못 찾습니다.
- `noShowAgreed` — `true` 가 아니면 `400`. 노쇼 동의는 필수 체크입니다.
- **`tableId` 를 보내지 않습니다** (5절 규칙 1).

**받을 것** `201`

```json
{
  "id": "res_k3j4",
  "code": "SPOT-0910-4821",
  "status": "upcoming",
  "storeId": "s1",
  "storeName": "대흥동 손칼국수",
  "date": "2026-09-10", "time": "18:30",
  "people": 2, "seatType": "table",
  "name": "김지훈", "phone": "01012345678",
  "createdAt": 1757030400000
}
```

`code` 는 예약 상세의 **QR에 넣는 값**입니다. `id` 는 주소용, `code` 는 사람이 읽고 찍는 값.

### 실패 — 여기가 이 API의 핵심

| 번호 | code | message |
|---|---|---|
| `400` | `NOSHOW_NOT_AGREED` | 노쇼 방지 정책에 동의해 주세요. |
| `400` | `INVALID_PHONE` | 연락처를 다시 확인해 주세요. |
| `409` | `TIME_UNAVAILABLE` | 방금 마감된 시간이에요. 다른 시간을 골라 주세요. |
| `409` | `DUPLICATE_RESERVATION` | 같은 시간에 이미 예약이 있어요. |

**⚠️ 정원 초과를 DB가 막아주지 않습니다.**

스키마의 unique 제약이 `[storeId, date, time, phone]` 이라, DB가 자동으로 막는 건 **"같은 사람이 같은 시간에 두 번 예약"** 뿐입니다.

정원 초과는 **트랜잭션 안에서 직접 세야** 합니다.

```ts
await prisma.$transaction(async (tx) => {
  const used = await tx.reservation.count({
    where: { storeId, date, time, status: 'upcoming' }
  })
  if (used >= capacity) throw new Conflict('TIME_UNAVAILABLE')
  return tx.reservation.create({ data: {...} })
})
```

트랜잭션 밖에서 세면 두 사람이 동시에 누를 때 **둘 다 통과합니다.** 노트북 2대 시연에서 실제로 재현되는 상황입니다.

---

## API 5. `GET /api/reservations?phone=` — 내 예약

**보낼 것** `?phone=01012345678` (필수)

**받을 것**

```json
{
  "upcoming": [
    {
      "id": "res_k3j4", "code": "SPOT-0910-4821", "status": "upcoming",
      "storeId": "s1", "storeName": "대흥동 손칼국수",
      "storeImage": "/img/s1.jpg", "storeAddress": "대전 중구 대흥동 123-4",
      "date": "2026-09-10", "time": "18:30",
      "people": 2, "seatType": "table",
      "name": "김지훈", "phone": "01012345678",
      "request": "창가 자리 부탁드려요"
    }
  ],
  "past": [
    {
      "id": "res_a0s9", "status": "visited",
      "storeId": "s3", "storeName": "소제동 커피",
      "date": "2026-09-01", "time": "15:00", "people": 3,
      "visitedAt": 1756702800000,
      "receiptUploaded": false,
      "reviewWritten": false
    }
  ]
}
```

- **배열 하나로 안 주고 `upcoming`/`past` 로 나눠서 줍니다.** 예약 탭이 두 섹션이라 화면에서 다시 거를 이유가 없습니다.
- `receiptUploaded` / `reviewWritten` — 지난 예약 상세의 **"영수증 올려야 리뷰쓰기 활성"** 조건입니다. 이 둘이 없으면 그 화면을 못 만듭니다.
- `past` 에는 `code` 를 안 보냅니다. 지난 예약엔 QR이 없습니다.

**보안 메모** — 전화번호만 알면 남의 예약이 보입니다. MVP는 이대로 가되(로그인 없음), 발표에 "Phase 2에서 본인 인증"으로 적습니다.
`phone` 이 없으면 **전체를 주지 말고 `400 PHONE_REQUIRED`** 를 냅니다.

---

## API 6. `POST /api/reservations/[id]/cancel` — 예약 취소

**보낼 것** `{ "phone": "01012345678" }` (본인 확인용)

**받을 것** `{ "id": "res_k3j4", "status": "cancelled", "cancelledAt": 1757030900000 }`

전체 예약을 다시 안 줍니다. 화면은 상태만 바꿔 그리면 됩니다.

| 번호 | code | message |
|---|---|---|
| `403` | `PHONE_MISMATCH` | 예약자 정보가 일치하지 않아요. |
| `404` | `RESERVATION_NOT_FOUND` | 예약을 찾을 수 없어요. |
| `409` | `ALREADY_CANCELLED` | 이미 취소된 예약이에요. |
| `409` | `TOO_LATE_TO_CANCEL` | 예약 시간이 지나 취소할 수 없어요. 매장으로 연락해 주세요. |

---

## API 7. `PATCH /api/admin/tables/[id]` — 테이블 상태 바꾸기

**보낼 것** — 상태가 아니라 **동작 이름**을 보냅니다

```json
{ "action": "seat", "reservationId": "res_k3j4" }
```

| `action` | 뜻 | 결과 |
|---|---|---|
| `seat` | 입장 | 테이블 `occupied` + 예약을 `visited` 로 |
| `leave` | 퇴장 | 테이블 `cleaning` (40초 뒤 자동으로 빈자리) |
| `cleaned` | 정리 완료(수동) | 테이블 `available` |
| `cancel` | 취소 | 예약 `cancelled` + 테이블 `available` |
| `noshow` | 미방문 | 예약 `noshow` + 테이블 `available` |
| `disable` / `enable` | 이용 불가 / 해제 | `disabled` ↔ `available` |

**왜 상태를 직접 안 받나** — 원시 상태를 그대로 받으면 빈 테이블에 갑자기 `cleaning` 을 넣는 식의 **불가능한 조작이 통과합니다.** 관리자 화면은 잘못 누르면 그대로 손님 화면 숫자가 틀어지는 곳이라, **가능한 동작만 이름으로 열어 둡니다.**

| 지금 상태 | 할 수 있는 것 |
|---|---|
| `available` | `seat` · `disable` |
| `occupied` | `leave` |
| `cleaning` | `cleaned` |
| `reserved` | `seat` · `cancel` · `noshow` |
| `disabled` | `enable` |

**받을 것** `{ "id": "tbl_a1b2", "code": "T04", "status": "occupied", "statusSince": 1757031000000 }`

**실패** — `404 TABLE_NOT_FOUND` · `409 INVALID_TRANSITION` "현재 상태에서는 할 수 없는 동작입니다. 화면을 새로고침해 주세요."

`409` 는 대부분 **다른 직원이 먼저 눌렀을 때** 납니다. 화면은 토스트를 띄우고 바로 재조회합니다.

---

## API 8. `PATCH /api/admin/slots/[id]` — 주차면 수동 지정

**보낼 것**

```json
{ "manualStatus": "occupied", "minutes": 120 }
```

- `manualStatus` — `available` · `occupied` · `disabled` · **`null`**
- **`null` 이 "자동 감지로 복귀"입니다.** 해제용 API를 따로 만들지 않습니다.
- `minutes` — 안 보내면 기본 120분. 서버가 `manualUntil = 지금 + minutes` 를 계산해 저장합니다.

**받을 것**

```json
{
  "id": "slt_x9y8", "code": "A1",
  "autoStatus": "available",
  "manualStatus": "occupied",
  "manualUntil": 1757038200000,
  "lastSeenAt": 1757030400000
}
```

**`autoStatus` 는 절대 안 건드립니다.** 수동 지정 중에도 센서 값은 계속 들어오고, 두 값이 다르면 관리자 화면이 "센서는 비어 있다고 봅니다"를 같이 보여줄 수 있습니다. 자동/수동 충돌을 감추지 않고 드러내는 방식입니다.

---

## API 9. `POST /api/detect` — 센서가 값 보내기 ★D가 알아야 할 유일한 것★

화면이 없습니다. D는 이 요청 하나만 만들면 됩니다.

**보낼 것**

```
POST /api/detect
Content-Type: application/json
x-spot-key: <팀에서 공유한 값>
```

```json
{
  "storeId": "s1",
  "detectedAt": 1757030400000,
  "slots": [
    { "code": "A1", "status": "occupied" },
    { "code": "A2", "status": "available" },
    { "code": "A3", "status": "unknown" }
  ]
}
```

- **`status` 는 `available` · `occupied` · `unknown` 세 개뿐입니다.**
- **보낸 주차면만 갱신됩니다.** 20면 중 3면만 보내면 나머지는 그대로. 매번 전체를 보낼 필요 없습니다.
- `detectedAt` 은 선택. 없으면 서버 도착 시각을 씁니다.

**D가 보내면 안 되는 값** — `offline` · `manual` · `disabled`

- `offline` 은 **서버가 판단합니다.** `lastSeenAt` 이 60초를 넘으면 offline 으로 그립니다. 센서가 죽으면 아무것도 못 보내니, 센서가 자기 죽음을 보고할 수는 없습니다.
- `manual` · `disabled` 는 관리자 영역입니다.

**값이 흔들리면 `unknown` 을 보냅니다.** 애매한 걸 `available` 로 보내면 손님이 헛걸음합니다 (5절 규칙 2).

**받을 것**

```json
{ "ok": true, "updated": 2, "ignored": ["A3"], "unknownCodes": ["B9"] }
```

- `ignored` — 수동 지정 중이라 최종 상태엔 반영 안 된 코드
- `unknownCodes` — **DB에 없는 코드.** 게이트웨이 설정 오타를 D가 바로 잡을 수 있게 돌려줍니다

**서버가 하는 일**

1. `x-spot-key` 확인 → 틀리면 `401`
2. 코드로 주차면 찾기 → 없으면 `unknownCodes` 에 담고 건너뜀 (**전체를 실패시키지 않음**)
3. `autoStatus` · `lastSeenAt` 갱신
4. `manualUntil` 이 지난 건 이때 `null` 로 정리
5. `SensorLog` 에 기록 (관리자 "센서 감지·변경 로그" 화면용)

**D를 위한 최소 예제**

```python
import requests, time

requests.post(
    "https://sprint-spot.vercel.app/api/detect",
    headers={"x-spot-key": "팀에서 공유한 값"},
    json={
        "storeId": "s1",
        "detectedAt": int(time.time() * 1000),
        "slots": [{"code": "A1", "status": "occupied"}],
    },
    timeout=5,
)
```

---

## 6-3. 구현 전에 `lib/types.ts` 와 대조할 것

- [ ] `hours` 를 객체로 둘지, 목업처럼 문자열 하나인지
- [ ] `seatType` 값 3개(`table`/`window`/`room`)가 예약 2단계 선택지와 같은지 — **A 확인**
- [ ] `hourly[].level` 값이 `lib/status.ts` 의 `levelOf()` 반환값과 같은지
- [ ] `slots[].type` 의 장애인 구획 이름 — 상태값 `disabled` 와 겹치니 `accessible` 로 쓸지
- [ ] 미입점 매장 응답에서 키를 **생략**할지 `null` 로 줄지
- [ ] `SPOT_DETECT_KEY` 를 Vercel 환경변수에 등록 — **D에게 공유하기 전에**

---

## 7. 4주차에 실제 데이터로 바꾸는 법

지금은 화면이 `lib/mock.ts` 를 직접 읽습니다. **바꿀 곳은 `lib/store.tsx` 한 파일뿐입니다.**

**① 시뮬레이터 `useEffect` 를 폴링으로 교체**

```ts
// 지금 (시뮬레이터)
useEffect(() => { const t = setInterval(() => { /* 랜덤으로 상태 바꿈 */ }, 3500); ... }, []);

// 바꾼 뒤 (3초 폴링)
useEffect(() => {
  const t = setInterval(async () => {
    const res = await fetch('/api/stores', { cache: 'no-store' });
    setStores(await res.json());
  }, 3000);
  return () => clearInterval(t);
}, []);
```

WebSocket 대신 폴링을 쓰는 이유: 학습·디버깅 비용이 크게 줄고, 3초 간격이면 체감 차이가 거의 없습니다.

**② `setTable(...)` 같은 함수 안을 fetch 로 교체**

```ts
setTable: async (storeId, tableId, action) => {
  await fetch(`/api/admin/tables/${tableId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  // 폴링이 곧 최신 상태를 가져오므로 화면 코드는 손대지 않는다
}
```

함수 이름과 화면에서 부르는 방식은 그대로 두고 **안쪽만** 바꿉니다.

### 대응표

| 지금 (목업) | 4주차 (API) |
|---|---|
| 시뮬레이터 `useEffect` | 3초 폴링 `GET /api/stores` |
| `mock.stores` | `GET /api/stores` |
| 매장 상세 진입 | `GET /api/stores/[id]` |
| 가짜 `timeOpen` | `GET /api/stores/[id]/times` |
| `setTable(...)` | `PATCH /api/admin/tables/[id]` → 성공하면 재조회 |
| `setSlot(...)` | `PATCH /api/admin/slots/[id]` → 성공하면 재조회 |

**낙관적 업데이트를 쓰지 않습니다.** 누르자마자 화면을 먼저 바꾸고 나중에 서버 응답으로 되돌리는 방식은, 노트북 2대 동시 조작 시연에서 화면이 튀는 걸로 보입니다. 버튼을 잠깐 비활성으로 두고 응답을 기다린 뒤 재조회하는 게 안전하고 코드도 짧습니다.

> **`lib/mock.ts` 삭제는 4주차가 아니라 5주차**(`chore/remove-mock`)입니다. 4주차엔 "안 쓰게" 만들고, 잘 도는 걸 확인한 뒤 지웁니다. 미리 지우면 API가 안 될 때 돌아갈 곳이 없어집니다.

---

## 8. Hydration 주의사항

Next.js는 서버에서 HTML을 먼저 만들고 브라우저에서 이어받습니다.
두 결과가 다르면 콘솔에 hydration 에러가 납니다. **원인은 대부분 둘 중 하나입니다.**

- `Date.now()` / `new Date()` 를 렌더 중에 호출 → 서버와 브라우저 시각이 다름
- `Math.random()` 을 렌더 중에 호출 → 값이 다름

그래서 이 프로젝트는 이렇게 처리합니다.

- 목업의 timestamp 는 전부 `0` 으로 시작하고, `SpotProvider` 가 마운트된 뒤 한 번 채웁니다.
- `useNow()` 는 서버 렌더 때 `0` 을 반환합니다. `now &&` 로 감싸서 쓰세요.
- `<LiveStamp>` 는 시각을 모를 때 "확인 중…"을 보여줍니다.
- 예약 달력·시간 가능 여부는 난수가 아니라 **인덱스 기반**으로 계산합니다.

### 빌드만 깨지는 함정

**`useSearchParams()` 는 반드시 `<Suspense>` 로 감쌉니다.** 안 감싸면 `npm run dev` 는 멀쩡한데 `npm run build` 만 실패합니다.

```
useSearchParams() should be wrapped in a suspense boundary at page "/explore"
```

현재 `explore/page.tsx` 와 `reserve/[id]/done/page.tsx` 두 곳에서 쓰고 있고 둘 다 처리돼 있습니다. **새 화면에서 쓰면 같은 처리를 하세요.**

---

## 9. 왜 모노레포가 아니라 라우트 그룹인가

| | 단일 앱 + 라우트 그룹 (선택) | Turborepo + 앱 2개 |
|---|---|---|
| 설치·빌드 | `npm run dev` 하나 | 워크스페이스·파이프라인 설정 필요 |
| 공용 부품 | `@/components` 로 바로 import | `packages/ui` 만들고 빌드 연결 |
| 배포 | Vercel 프로젝트 1개 | 2개 + 도메인 분리 |
| 새로 배울 개념 | 없음 | pnpm workspace, turbo.json, 패키지 참조 |

5주 · 비전공자 4명이라는 조건에서는 배울 게 없는 쪽이 맞습니다.
관리자만 따로 배포해야 할 상황이 오면 `(admin)` 폴더만 새 앱으로 옮기면 되므로, 지금 선택이 나중을 막지도 않습니다.

**라우트 그룹이란** 폴더 이름을 괄호로 감싸면 URL에 나타나지 않는 Next.js 기능입니다.
`app/(customer)/explore/page.tsx` → `/explore`. URL은 그대로 두고 레이아웃만 다르게 줍니다.

---

## 10. 아직 없는 것 (의도적)

| 없는 것 | 이유 / 언제 |
|---|---|
| `app/api/` 9개 | 폴더 자체가 없음. **6절 규격대로** 2~3주차 C |
| 관리자 로그인 | 주소만 알면 아무나 `/admin` 진입. 2주차 B (`feat/b-admin-login`) |
| 프로필 수정 | 버튼만 있고 화면이 없음. 2주차 A |
| 에러·로딩·404 화면 | `error.tsx` / `loading.tsx` 0개. 2주차 A |
| 영수증 업로드 | 버튼만 있고 파일이 안 올라감. 3주차 A (Supabase Storage) |
| 실제 지도 SDK | 키 발급·좌표계 리스크. `MapCanvas.tsx` 하나만 교체하면 됨 |
| 센서 코드 | `detector/` 폴더 자체가 없음. D |
| 결제 | Phase 2. 마이페이지 차량 정보가 그 포석 |

---

## 11. 진행 상황

| 이슈 | 브랜치 | 담당 | 상태 |
|---|---|---|---|
| Vercel 배포 | `chore/deploy` | B | ✅ Production 확인 |
| Supabase 프로젝트 생성 | `chore/supabase-setup` | C | 🔄 서울 리전으로 재생성 중 |
| Prisma 스키마 | `feat/prisma-schema` | C | 🔄 `validate` 통과 · `feature` 머지 대기 |
| **API 요청·응답 확정** | `feature-1/e1-api-req-res` | 전원 | 🔄 이 문서 6절 |
| seed 스크립트 | `feat/prisma-seed` | C | ⏸ 스키마 머지 후 |
| 각자 PR 1회 머지 | `chore/hello-<이름>` | 전원 | ⏸ |

**1주차 완료 기준** — 4명 모두 PR 1회 머지 + 배포 URL 존재 + `npx prisma studio` 에 데이터 보임 + 6절 확정
