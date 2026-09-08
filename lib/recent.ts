// lib/recent.ts
// 최근 본 매장 — localStorage 기록·조회
//
// 저장하는 것은 매장 id 와 본 시각뿐이다.
// 좌석 수·주차 자리 수는 실시간으로 바뀌므로 스냅샷을 저장하지 않고,
// 화면에서 id 로 현재 매장 데이터를 다시 찾아 쓴다.
//
// 이 파일의 함수는 전부 브라우저에서만 의미가 있다.
// 서버 렌더 중에 부르면 조용히 빈 값을 돌려주므로 Hydration 오류가 나지 않는다.
// 다만 화면에서는 반드시 useEffect 안에서 호출할 것.

const KEY = 'spot.recent.v1';
const MAX = 20;

export type RecentEntry = {
  /** 매장 id — 예: 's1' */
  id: string;
  /** 마지막으로 본 시각 (Date.now()) */
  at: number;
};

const isBrowser = () => typeof window !== 'undefined';

/** localStorage 에서 읽어 유효한 항목만 남긴다. 깨져 있으면 빈 배열. */
function load(): RecentEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (e): e is RecentEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as RecentEntry).id === 'string' &&
          typeof (e as RecentEntry).at === 'number',
      )
      .slice(0, MAX);
  } catch {
    // JSON 이 깨졌거나 접근이 막힌 경우. 기록이 없는 것으로 본다.
    return [];
  }
}

/** localStorage 에 쓴다. 실패해도 앱 동작에는 영향을 주지 않는다. */
function save(list: RecentEntry[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 시크릿 모드·저장 용량 초과 등. 기록만 포기하고 넘어간다.
  }
}

/**
 * 매장 상세 화면에 들어왔을 때 호출한다.
 * 이미 본 매장이면 새로 쌓지 않고 맨 앞으로 끌어올린다.
 */
export function push(id: string): void {
  if (!id) return;
  const rest = load().filter((e) => e.id !== id);
  save([{ id, at: Date.now() }, ...rest].slice(0, MAX));
}

/** 최신순 목록. 시각까지 필요할 때 쓴다. */
export function read(): RecentEntry[] {
  return load();
}

/** 최신순 id 만. 목록 화면에서 매장 데이터를 찾을 때 쓴다. */
export function readIds(): string[] {
  return load().map((e) => e.id);
}

/** 특정 매장 하나만 기록에서 지운다. */
export function remove(id: string): void {
  save(load().filter((e) => e.id !== id));
}

/** 전체 삭제. */
export function clear(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

/** 기록 개수. 마이페이지에 배지로 띄울 때 쓴다. */
export function count(): number {
  return load().length;
}