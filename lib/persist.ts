// lib/persist.ts
// 문자열 목록을 localStorage 에 담아 두는 얇은 한 겹
//
// [a8] 즐겨찾기와 최근 검색어가 메모리에만 있어서 새로고침하면 사라졌다.
//   별표를 아무리 눌러도 되돌아갔고, '전체 삭제'를 눌러도 다시 나타났다.
//   손님 입장에서는 지워지지 않는 기록이다.
//
// lib/recent.ts(최근 본 매장)가 이미 같은 일을 하고 있지만 그쪽은
// { id, at } 객체를 다루고 방문 시각까지 쌓는다. 여기는 문자열 목록만 본다.
// 하나로 합치려면 recent.ts 의 자료 모양을 바꿔야 하는데,
// 그건 최근 본 매장 기능을 다시 손보는 일이라 따로 둔다.
//
// ★ 이 파일의 함수는 브라우저에서만 의미가 있다.
//   서버 렌더 중에는 조용히 빈 배열을 돌려주므로 Hydration 오류가 나지 않는다.
//   다만 화면·Provider 에서는 반드시 useEffect 안에서 부를 것.
//
// ★ 저장에 실패해도 앱은 그대로 돌아간다.
//   시크릿 모드나 용량 초과에서 예외가 나는데, 기록 하나 때문에
//   화면이 죽으면 안 된다.

const isBrowser = () => typeof window !== 'undefined';

/** 유효한 문자열만 남겨서 읽는다. 깨져 있으면 빈 배열. */
export function readList(key: string, max = 30): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .slice(0, max);
  } catch {
    return [];
  }
}

/** 쓴다. 실패는 무시한다. */
export function writeList(key: string, list: string[], max = 30): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, max)));
  } catch {
    // 시크릿 모드 · 용량 초과 — 기록만 포기한다
  }
}

/** 키 이름은 한곳에 모은다. 흩어 두면 오타가 조용한 버그가 된다 */
export const KEY_FAVORITES = 'spot.favorites.v1';
export const KEY_SEARCHES = 'spot.searches.v1';