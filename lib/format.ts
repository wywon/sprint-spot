/**
 * 순수 함수 모음 — 상태도 없고 React도 모른다.
 * 서버 컴포넌트/클라이언트 컴포넌트 어디서든 import 해도 된다.
 */

/** 조건부 클래스 결합. clsx 를 설치하지 않기 위한 최소 구현 */
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export const pad = (n: number) => String(n).padStart(2, '0');

/** a 이상 b 이하 정수. 목업 시뮬레이터에서만 쓴다 */
export const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const won = (n: number) => n.toLocaleString('ko-KR');

/** 거리(m) → 도보 분. 성인 보행속도 약 67 m/분 */
export const walkMin = (m: number) => Math.max(1, Math.round(m / 67));

/** 경과 시간을 사람이 읽는 문구로 */
export function agoText(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 10) return '방금 전';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  return `${Math.floor(m / 60)}시간 전`;
}

/**
 * 데이터 신선도
 * ─────────────────────────────────────────────────────────────
 * 실시간 서비스에서 가장 중요한 UX 장치다.
 * "이 숫자가 정말 지금 상태인가?"를 사용자가 스스로 판단할 수 있어야 한다.
 * 화면에 실시간 수치를 띄우는 곳에는 반드시 이 결과를 함께 표시할 것.
 */
export function freshness(ms: number): { label: string; warn: boolean; tone: string } {
  if (ms < 30_000)  return { label: '실시간',       warn: false, tone: 'ok' };
  if (ms < 120_000) return { label: '최근 기준',    warn: false, tone: 'ink' };
  if (ms < 300_000) return { label: '갱신 지연',    warn: true,  tone: 'warn' };
  return { label: '오래된 정보', warn: true, tone: 'off' };
}

/** 'YYYY-MM-DD' → '8월 24일 (월)' */
export function fmtDateK(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${dow})`;
}

/**
 * [a8] 예약 시각 다루기
 * ─────────────────────────────────────────────────────────────
 * 예약은 'YYYY-MM-DD' 와 'HH:mm' 두 문자열로 저장된다. 시간대가 없다.
 * 그대로 new Date('2026-09-17 17:00') 하면 그 코드가 도는 기계의 시간대를 따르므로
 * 서버(UTC)와 브라우저(KST)가 9시간 다른 답을 낸다.
 * +09:00 을 붙여 넘기면 어디서 계산해도 같은 순간을 가리킨다.
 */
export const resAt = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`);

/**
 * 남은 시간을 사람이 읽는 문구로. 이미 지났으면 null.
 *
 * agoText() 의 반대 방향이다. 단위를 하나만 쓰지 않고 '2일 3시간' 처럼 두 개를
 * 붙이는 이유는, 예약이 며칠 뒤일 때 '2일' 만 보여 주면 오늘인지 모레인지
 * 손님이 날짜를 다시 세어야 하기 때문이다.
 */
export function untilText(ms: number): string | null {
  if (ms <= 0) return null;
  const m = Math.round(ms / 60_000);
  if (m < 1) return '곧';
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}시간 ${rm}분` : `${h}시간`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}일 ${rh}시간` : `${d}일`;
}