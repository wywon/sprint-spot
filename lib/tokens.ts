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