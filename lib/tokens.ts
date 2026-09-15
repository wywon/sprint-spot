import type { AdminResStatus, SlotView, TableStatus } from './types';

/**
 * 상태 → 화면 표현 매핑
 * ─────────────────────────────────────────────────────────────
 * ★ 서비스 전체에서 상태 색·아이콘·라벨은 여기서만 정한다.
 *   컴포넌트 안에 'bg-ok-50' 같은 걸 직접 쓰지 말고 이 표를 참조할 것.
 *
 * ★ 접근성 원칙 — 색만으로 상태를 전달하지 않는다.
 *   그래서 항목마다 color(text/bg/border) + icon + label + hatch(빗금) 네 가지를 모두 갖는다.
 *   새 상태를 추가할 때도 네 가지를 다 채워야 한다.
 */

export interface StatusToken {
  key: string;
  label: string;
  short: string;
  icon: string;
  text: string;
  bg: string;
  border: string;
  hatch: string;
}

/** 주차면 */
export const SLOT: Record<SlotView, StatusToken> = {
  available: { key: 'available', label: '주차 가능',   short: '가능', icon: 'check',
               text: 'text-ok-500',    bg: 'bg-ok-50',    border: 'border-ok-300',    hatch: '' },
  occupied:  { key: 'occupied',  label: '주차 중',     short: '사용', icon: 'car',
               text: 'text-busy-500',  bg: 'bg-busy-50',  border: 'border-busy-200',  hatch: 'hatch-busy' },
  unknown:   { key: 'unknown',   label: '확인 중',     short: '확인', icon: 'question',
               text: 'text-unk-500',   bg: 'bg-unk-50',   border: 'border-unk-200',   hatch: 'hatch-unk' },
  offline:   { key: 'offline',   label: '센서 오류',   short: '오류', icon: 'sensor-off',
               text: 'text-off-500',   bg: 'bg-off-50',   border: 'border-off-200',   hatch: 'hatch-off' },
  manual:    { key: 'manual',    label: '수동 지정',   short: '수동', icon: 'hand',
               text: 'text-warn-500',  bg: 'bg-warn-50',  border: 'border-warn-300',  hatch: '' },
  disabled:  { key: 'disabled',  label: '장애인 전용', short: '장애', icon: 'accessible',
               text: 'text-brand-700', bg: 'bg-brand-50', border: 'border-brand-200', hatch: '' },
  ev:        { key: 'ev',        label: '전기차',      short: 'EV',  icon: 'bolt',
               text: 'text-ok-600',    bg: 'bg-ok-50',    border: 'border-ok-200',    hatch: '' },
};

/**
 * 주차면 — 배치도(노면) 위에서 쓰는 변형
 * ─────────────────────────────────────────────────────────────
 * ★ [b8] 배치도를 "위에서 내려다본 주차장"으로 그리면서 생긴 표다.
 *   위의 SLOT 은 흰 카드 위에 얹는 값(연한 배경 + 진한 글자)이라, 칸을 색으로 꽉 채우는
 *   배치도에 그대로 쓰면 진한 글자가 읽히지 않는다. 그래서 같은 상태를 "노면 위 표현"으로
 *   한 번 더 정의한다. 색만 바꾸는 것이고 label · short · icon 은 위의 SLOT 것을 그대로 쓴다.
 *   상태의 '말'은 한 곳에만 있어야 한다.
 *
 * ★ 색을 아껴 쓴다 — 주차 중은 회색이다.
 *   주차 중은 정상 상태인데 빨강으로 칠하면 화면이 "문제가 생겼다"고 소리친다.
 *   관리자가 실제로 찾는 건 '빈 칸'이므로 그쪽만 색으로 튀게 하고, 눈에 띄는 색은
 *   손봐야 하는 상태(확인 중 · 센서 오류 · 수동 지정)에 남겨 둔다.
 *
 * ★ 글자는 흰색 하나로 고정이고, 칠은 흰 글자가 읽히는 명도까지만 밝힌다.
 *   (배치도에는 주차면 번호만 얹히고 번호는 굵은 큰 글자라 3:1 이상이면 된다.
 *    아래 값은 전부 3.8:1 이상이다. 더 밝히면 번호가 흐려진다.)
 *
 * ★ 접근성 — 빗금(hatch)을 빼지 말 것. 어두운 칠 위라 흰 빗금이고,
 *   위의 hatch-* 가 아니라 globals.css 의 hatch-*-dk 를 쓴다.
 */
export interface LotToken {
  fill: string;   // 칸을 채우는 색
  text: string;   // 번호·아이콘
  hatch: string;
}

export const SLOT_LOT: Record<SlotView, LotToken> = {
  available: { fill: 'bg-[#0F9070]', text: 'text-white', hatch: '' },
  occupied:  { fill: 'bg-[#7A8291]', text: 'text-white', hatch: 'hatch-dk' },
  unknown:   { fill: 'bg-[#8271DA]', text: 'text-white', hatch: 'hatch-dk-rev' },
  offline:   { fill: 'bg-[#5A6472]', text: 'text-white', hatch: 'hatch-dk' },
  manual:    { fill: 'bg-[#9A6100]', text: 'text-white', hatch: '' },
  disabled:  { fill: 'bg-[#2F63E4]', text: 'text-white', hatch: '' },
  ev:        { fill: 'bg-[#0E7A5F]', text: 'text-white', hatch: '' },
};

/** 테이블 */
export const TABLE: Record<TableStatus, StatusToken> = {
  available: { key: 'available', label: '빈 자리',   short: '빈자리', icon: 'check',
               text: 'text-ok-500',    bg: 'bg-ok-50',    border: 'border-ok-300',   hatch: '' },
  occupied:  { key: 'occupied',  label: '사용 중',   short: '사용',   icon: 'people',
               text: 'text-busy-500',  bg: 'bg-busy-50',  border: 'border-busy-200', hatch: 'hatch-busy' },
  reserved:  { key: 'reserved',  label: '예약',      short: '예약',   icon: 'bookmark',
               text: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-200', hatch: '' },
  cleaning:  { key: 'cleaning',  label: '정리 중',   short: '정리',   icon: 'broom',
               text: 'text-warn-500',  bg: 'bg-warn-50',  border: 'border-warn-200', hatch: '' },
  disabled:  { key: 'disabled',  label: '이용 불가', short: '불가',   icon: 'ban',
               text: 'text-off-500',   bg: 'bg-off-50',   border: 'border-off-200',  hatch: 'hatch-off' },
};

/** 주차장 여유도 — 카드/마커에서 한눈에 보여주는 등급 */
export interface LevelToken {
  key: string;
  label: string;
  icon: string;
  cls: string;   // 마커 배경
  num: string;   // 숫자 색
  tone: 'ok' | 'brand' | 'warn' | 'busy' | 'off';
}

export const LEVEL: Record<string, LevelToken> = {
  plenty: { key: 'plenty', label: '여유',      icon: 'check',    cls: 'bg-ok-500 text-white',      num: 'text-ok-500',    tone: 'ok' },
  some:   { key: 'some',   label: '보통',      icon: 'car',      cls: 'bg-brand-500 text-white',   num: 'text-brand-600', tone: 'brand' },
  few:    { key: 'few',    label: '혼잡',      icon: 'alert',    cls: 'bg-warn-400 text-warn-900', num: 'text-warn-500',  tone: 'warn' },
  full:   { key: 'full',   label: '만차',      icon: 'ban',      cls: 'bg-busy-500 text-white',    num: 'text-busy-500',  tone: 'busy' },
  none:   { key: 'none',   label: '확인 불가', icon: 'question', cls: 'bg-off-300 text-off-800',   num: 'text-off-500',   tone: 'off' },
};

/**
 * 외부 지도앱 — 길안내는 여기로 넘긴다.
 * 우리가 내비게이션을 직접 만들지 않는다는 설계 결정이다.
 *
 * [A6] 네이버 지도·TMAP 를 뺐다.
 *   버튼만 있고 실제로 열리지 않는 항목이 셋 중 둘이면, 손님은 그 화면 전체를
 *   "눌러도 안 되는 화면"으로 학습한다. 실제로 연결되는 하나만 남기는 쪽이 낫다.
 *   지도 SDK 를 카카오로 붙였으므로 좌표계·장소명이 그대로 이어진다는 이점도 있다.
 *   나중에 늘릴 때는 여기에 항목을 넣고 overlays.tsx 의 openNav 에 분기를 추가한다.
 */
export const NAV_APPS = [
  { key: 'kakao', name: '카카오맵', color: 'bg-[#FEE500]', initial: 'K', dark: true },
] as const;

/**
 * [a7] 거절 사유 — 관리자가 고르는 라벨과 손님에게 나가는 문구를 짝지어 둔다.
 *
 * ★ 두 문장을 나눠 놓은 이유
 *   관리자는 짧게 골라야 하고(한 손으로 3초), 손님은 다음 행동을 알아야 한다.
 *   같은 문장을 양쪽에 쓰면 관리자 화면은 길어지고 손님 화면은 무뚝뚝해진다.
 *
 * ★ '거절'이라는 말을 손님에게 쓰지 않는다
 *   매장이 손님을 밀어낸 게 아니라 사정이 안 되는 것이다.
 *   문구는 항상 다음 행동(다른 시간 고르기)으로 이어져야 한다.
 */
export const REJECT_REASONS = [
  {
    key: 'full',
    admin: '자리가 없어요',
    title: '그 시간은 자리가 어려워요',
    desc: '이미 예약이 찬 시간이에요. 앞뒤 시간대는 여유가 있을 수 있어요.',
  },
  {
    key: 'party',
    admin: '인원을 받기 어려워요',
    title: '요청하신 인원은 어려울 것 같아요',
    desc: '인원을 줄이시거나 다른 시간으로 다시 잡아보시겠어요?',
  },
  {
    key: 'closed',
    admin: '그날 휴무예요',
    title: '그날은 문을 열지 않아요',
    desc: '다른 날짜로 잡아주시면 준비해 둘게요.',
  },
  {
    key: 'break',
    admin: '준비 시간이에요',
    title: '그 시간에는 준비 중이에요',
    desc: '조금 이르거나 늦은 시간으로 잡아보시겠어요?',
  },
  {
    key: 'etc',
    admin: '매장 사정',
    title: '매장 사정으로 어려울 것 같아요',
    desc: '불편을 드려 죄송해요. 다른 시간을 골라주시면 감사하겠습니다.',
  },
] as const;

/** 코드 → 문구. 모르는 코드가 와도 화면이 비지 않게 etc 로 떨어진다 */
export const rejectReasonOf = (key?: string | null) =>
  REJECT_REASONS.find((r) => r.key === key) ?? REJECT_REASONS[REJECT_REASONS.length - 1];

/**
 * [b10] 관리자 화면의 예약 상태 표현.
 *
 * ★ 왜 토큰으로 빼는가
 *   지금 홀 운영에 이렇게 박혀 있다 —
 *     r.status === 'upcoming' ? r.eta : r.status === 'seated' ? '착석' : '미방문'
 *   상태가 일곱으로 늘면 이 삼항이 여섯 단이 되고, 같은 판단이 대시보드·사이드바·
 *   달력에도 흩어진다. 상태의 '말'은 한 곳에만 있어야 한다. (b8 의 SLOT_LOT 과 같은 이유)
 *
 * ★ 색을 아껴 쓴다
 *   승인 대기만 눈에 띄게 둔다. 관리자가 이 화면에서 해야 하는 일이 그것뿐이다.
 *   착석·방문 완료는 정상적으로 끝난 일이라 소리칠 이유가 없고, 취소·거절은
 *   이미 지나간 일이라 회색이 맞다. 미방문만 경고색으로 남긴다.
 */
export const RES_ADMIN: Record<AdminResStatus, StatusToken> = {
  pending:  { key: 'pending',  label: '승인 대기', short: '대기', icon: 'clock',
              text: 'text-warn-600',  bg: 'bg-warn-50',  border: 'border-warn-300', hatch: '' },
  upcoming: { key: 'upcoming', label: '도착 예정', short: '예정', icon: 'calendar',
              text: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-200', hatch: '' },
  seated:   { key: 'seated',   label: '착석',      short: '착석', icon: 'people',
              text: 'text-ok-600',    bg: 'bg-ok-50',    border: 'border-ok-200',   hatch: '' },
  done:     { key: 'done',     label: '방문 완료', short: '완료', icon: 'check',
              text: 'text-ink-500',   bg: 'bg-ink-50',   border: 'border-ink-200',  hatch: '' },
  noshow:   { key: 'noshow',   label: '미방문',    short: '미방', icon: 'alert',
              text: 'text-off-500',   bg: 'bg-off-50',   border: 'border-off-200',  hatch: '' },
  canceled: { key: 'canceled', label: '취소됨',    short: '취소', icon: 'x',
              text: 'text-ink-400',   bg: 'bg-ink-50',   border: 'border-ink-200',  hatch: '' },
  rejected: { key: 'rejected', label: '거절함',    short: '거절', icon: 'ban',
              text: 'text-ink-400',   bg: 'bg-ink-50',   border: 'border-ink-200',  hatch: '' },
};

/** 정리 중 → 빈 자리 자동 전환까지 걸리는 시간. 관리자가 버튼을 누르지 않아도 풀린다 */
export const CLEAN_AUTO_MS = 40 * 1000;

/** 손님 앱 하단 탭. 한 뎁스 깊어지면 숨긴다 (단 주차 탭은 유지) */
export const TABS = [
  { key: 'explore',      href: '/explore',      icon: 'compass',  label: '탐색' },
  { key: 'parking',      href: '/parking',      icon: 'parkingP', label: '주차' },
  { key: 'reservations', href: '/reservations', icon: 'calendar', label: '예약' },
  { key: 'my',           href: '/my',           icon: 'user',     label: '마이' },
] as const;

/** 관리자 사이드바. 점주/직원 구분 없이 하나의 사용자로 통합했다 */
export const ADMIN_NAV = [
  { key: 'dashboard', href: '/admin',         icon: 'dashboard', label: '대시보드' },
  { key: 'hall',      href: '/admin/hall',    icon: 'grid',      label: '홀 운영' },
  { key: 'parking',   href: '/admin/parking', icon: 'parkingP',  label: '주차 관리' },
  { key: 'store',     href: '/admin/store',   icon: 'settings',  label: '매장 관리' },
] as const;

/** 관리자가 운영하는 매장. MVP에서는 한 곳으로 고정한다 */
export const ADMIN_STORE_ID = 's1';

/**
 * [a8] 손님 화면에서 잠깐 가려 두는 입점 매장.
 * ─────────────────────────────────────────────────────────────
 * s2 '은행동 두부두루치기' · s3 '소제동 브런치하우스' 는 대흥동·은행동에서
 * 시연하던 시절에 만든 목업 매장이다. A6 에서 시연 지역을 대덕구 송촌동으로
 * 옮길 때 좌표만 바꾸고 이름·주소를 그대로 뒀다. 그래서 지금은 카카오맵 배경과
 * 대조하면 그 자리에 없는 가게이고, 센서도 달려 있지 않다.
 *
 * ★ 지우지 않고 가리는 이유
 *   DB 에서 지우면 그 매장에 달린 예약·리뷰·주차면이 같이 날아가고,
 *   되돌리려면 시드를 다시 돌려야 한다(운영 DB 라 금지).
 *   여기 id 를 넣고 빼는 것만으로 켜고 끌 수 있게 둔다.
 *
 * ★ 가려지는 범위
 *   손님 화면 전부 — 지도 마커 · 주차 탭 목록 · 검색 결과 · 추천 슬라이드.
 *   판단 지점은 lib/store.tsx 한 곳뿐이라 화면 파일은 하나도 안 고쳤다.
 *   주소로 /stores/s2 를 직접 열면 404 가 된다. 가린 매장이니 맞는 동작이다.
 *   관리자 콘솔은 영향이 없다 — ADMIN_STORE_ID(s1) 만 본다.
 *
 * ★ 지금은 비어 있다 (2026-09-14)
 *   좌표를 서로 300m 이상 벌려서(prisma/fixcoords.ts) 라벨이 겹치던 문제를
 *   해결했으므로 다시 켰다. 이름이 여전히 대흥동·은행동 시절 값이라는 문제는
 *   남아 있다 — 그건 좌표가 아니라 이름을 바꿔야 하는 일이라 따로 정한다.
 *
 * 다시 가리려면 id 를 넣으면 된다.
 */
export const HIDDEN_STORE_IDS: string[] = [];