'use client';

/**
 * 앱 설정 저장소
 * ─────────────────────────────────────────────────────────────
 * ★ 서버에 보내지 않는다. 기기 하나에만 남는 값이고 계정이 없어도 써야 한다.
 * ★ 저장 키는 spot.profile 과 같은 표기를 쓴다 (spot.___).
 * ★ 실제 적용은 applySettings() 가 <html> 의 data 속성을 바꾸는 것으로 끝난다.
 *   CSS 는 그 속성만 보면 되고, 화면 41개는 한 줄도 고치지 않는다.
 */

export type FontSize = 'small' | 'normal' | 'large';

export interface Settings {
  notiReserve: boolean;   // 예약 30분 전
  notiDepart: boolean;    // 출발할 시간
  notiNews: boolean;      // 혜택·소식
  fontSize: FontSize;
  reduceMotion: boolean;  // 움직임 줄이기
}

export const DEFAULT_SETTINGS: Settings = {
  notiReserve: true,
  notiDepart: true,
  notiNews: false,
  fontSize: 'normal',
  reduceMotion: false,
};

const KEY = 'spot.settings';

export const FONT_LABEL: Record<FontSize, string> = {
  small: '작게', normal: '보통', large: '크게',
};

/** 미리보기용 배율. globals.css 의 값과 반드시 같아야 한다 */
export const FONT_RATIO: Record<FontSize, number> = {
  small: 0.92, normal: 1, large: 1.14,
};

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(next: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  applySettings(next);
}

export function applySettings(s: Settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.font = s.fontSize;                        // small | normal | large
  root.dataset.motion = s.reduceMotion ? 'less' : 'full';
}