import type { SlotView, TableStatus } from './types';

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
 * 되살리려면 이 배열을 비우면 된다.
 */
export const HIDDEN_STORE_IDS: string[] = ['s2', 's3'];