/**
 * 매장 · 메뉴 이미지 찾기
 * ─────────────────────────────────────────────────────────────
 * [b13] 매장 썸네일/대표 이미지와 대표 메뉴 사진이 전부 그라데이션 색 블록이었다.
 *   손님이 가게를 고르는 화면에서 사진이 없으면 세 매장이 색깔로만 구분된다.
 *
 * ★ 사진을 추가하거나 바꾸려면
 *   `public/img/` 에 **같은 파일명으로 덮어쓰기만** 하면 된다. 코드는 경로만 알고
 *   내용은 모르므로 이 파일을 고칠 일이 없다. 확장자를 바꾸려면(.jpg 등)
 *   아래 표의 값만 바꾼다.
 *
 *   상세 화면은 대표 메뉴를 4개까지만 보여 준다(slice(0, 4)). 그 4개는 세 매장
 *   모두 사진이 있다. 5~6번째(냉면·공깃밥·시저샐러드·수프&갈릭브레드·크로플·
 *   바스크치즈케이크)는 아직 사진이 없어서, 표에는 경로가 적혀 있어도 파일이
 *   없으므로 화면은 그라데이션으로 떨어진다. 사진을 넣으면 그때부터 자동으로 보인다.
 *   ※ 보여 주는 개수를 5개 이상으로 늘리려면 사진부터 채울 것.
 *
 * ★ 왜 DB 를 안 건드렸는가
 *   Menu 모델에는 이미지 칼럼이 없다. 칼럼을 늘리면 마이그레이션이 필요하고
 *   팀원 전원이 로컬 DB 를 다시 말아야 한다. 시연을 앞두고 치를 값이 아니다.
 *   대신 메뉴 '이름'으로 찾는다. DB 에 무엇이 들어 있든 지금 그대로 동작한다.
 *   나중에 매장이 직접 사진을 올리는 기능이 붙으면 그때 칼럼을 늘리고
 *   storeImage()/menuImage() 안쪽만 그 값을 먼저 보도록 고치면 된다.
 *
 * ★ 못 찾으면 null 을 준다
 *   빈 문자열이나 대체 이미지 경로를 주지 않는다. 화면 쪽에서 null 을 받으면
 *   예전처럼 그라데이션 블록을 그린다. 깨진 이미지 아이콘이 뜨는 것보다 낫다.
 */

/** 매장 대표 이미지 — 지도 카드 썸네일과 상세 화면 상단이 같은 파일을 쓴다 */
const STORE_IMG: Record<string, string> = {
  s1: '/img/stores/s1.webp',   // 스프린트 식당 — 칼국수 한 상
  s2: '/img/stores/s2.webp',   // 레스토랑 송촌 — 스테이크
  s3: '/img/stores/s3.webp',   // 법동 카페 — 라떼와 브런치
};

/**
 * 메뉴 이미지 — 키는 '공백을 지운 메뉴 이름'.
 * 매장이 메뉴 이름을 조금 바꿔도(띄어쓰기 등) 걸리도록 정규화해서 비교한다.
 */
const MENU_IMG: Record<string, string> = {
  // s1 스프린트 식당 · 한식
  두부두루치기: '/img/menus/s1-dubu.webp',
  칼국수: '/img/menus/s1-kalguksu.webp',
  수육한접시: '/img/menus/s1-suyuk.webp',
  모둠전: '/img/menus/s1-jeon.webp',
  냉면: '/img/menus/s1-naengmyeon.webp',
  공깃밥: '/img/menus/s1-rice.webp',

  // s2 레스토랑 송촌 · 양식
  안심스테이크: '/img/menus/s2-steak.webp',
  해산물토마토파스타: '/img/menus/s2-pasta.webp',
  트러플크림뇨끼: '/img/menus/s2-gnocchi.webp',
  마르게리타피자: '/img/menus/s2-pizza.webp',
  시저샐러드: '/img/menus/s2-salad.webp',
  '수프&갈릭브레드': '/img/menus/s2-soup.webp',

  // s3 법동 카페
  아메리카노: '/img/menus/s3-americano.webp',
  카페라떼: '/img/menus/s3-latte.webp',
  에그베네딕트: '/img/menus/s3-benedict.webp',
  프렌치토스트: '/img/menus/s3-frenchtoast.webp',
  크로플: '/img/menus/s3-croffle.webp',
  바스크치즈케이크: '/img/menus/s3-basque.webp',
};

/**
 * 이름이 정확히 안 맞을 때 쓰는 2차 단서.
 * 관리자가 '얼큰 칼국수' 처럼 수식어를 붙여 등록해도 면 사진이 나오게 한다.
 * 위에서부터 먼저 걸리는 것을 쓰므로 구체적인 말을 앞에 둔다.
 */
const MENU_HINTS: [string, string][] = [
  ['치즈케이크', '/img/menus/s3-basque.webp'],
  ['베네딕트', '/img/menus/s3-benedict.webp'],
  ['프렌치토스트', '/img/menus/s3-frenchtoast.webp'],
  ['크로플', '/img/menus/s3-croffle.webp'],
  ['라떼', '/img/menus/s3-latte.webp'],
  ['아메리카노', '/img/menus/s3-americano.webp'],
  ['두루치기', '/img/menus/s1-dubu.webp'],
  ['칼국수', '/img/menus/s1-kalguksu.webp'],
  ['수육', '/img/menus/s1-suyuk.webp'],
  ['전', '/img/menus/s1-jeon.webp'],
  ['냉면', '/img/menus/s1-naengmyeon.webp'],
  ['밥', '/img/menus/s1-rice.webp'],
  ['스테이크', '/img/menus/s2-steak.webp'],
  ['파스타', '/img/menus/s2-pasta.webp'],
  ['뇨끼', '/img/menus/s2-gnocchi.webp'],
  ['피자', '/img/menus/s2-pizza.webp'],
  ['샐러드', '/img/menus/s2-salad.webp'],
  ['수프', '/img/menus/s2-soup.webp'],
];

/** 배치도 없는 매장이나 모르는 메뉴가 쓸 기본 그라데이션 */
export const FALLBACK_GRADIENT = 'from-ink-200 to-ink-300';

/** '/img/…' 나 'https://…' 처럼 이미지 주소로 보이는가 */
const looksLikeUrl = (v: string | undefined | null): v is string =>
  !!v && (v.startsWith('/') || v.startsWith('http://') || v.startsWith('https://'));

/** 공백·중점 등을 지운 비교용 이름 */
const norm = (s: string) => s.replace(/[\s·・]/g, '');

/**
 * 매장 대표 이미지 경로. 없으면 null.
 *
 * hero 에 이미 주소가 들어 있으면 그것을 쓴다. 매장이 직접 사진을 올리게 되면
 * DB 의 Store.hero 에 주소가 담길 텐데, 그때 이 함수를 고치지 않아도 되도록.
 */
export function storeImage(store: { id?: string; hero?: string } | null | undefined): string | null {
  if (!store) return null;
  if (looksLikeUrl(store.hero)) return store.hero;
  return (store.id && STORE_IMG[store.id]) || null;
}

/** 이미지가 없을 때 그릴 그라데이션 클래스 */
export function storeGradient(store: { hero?: string } | null | undefined): string {
  const h = store?.hero;
  if (!h || looksLikeUrl(h)) return FALLBACK_GRADIENT;
  return h;
}

/** 메뉴 이미지 경로. 없으면 null */
export function menuImage(menu: { name?: string; img?: string } | null | undefined): string | null {
  if (!menu) return null;
  if (looksLikeUrl(menu.img)) return menu.img;
  if (!menu.name) return null;

  const key = norm(menu.name);
  if (MENU_IMG[key]) return MENU_IMG[key];

  for (const [hint, path] of MENU_HINTS) {
    if (key.includes(hint)) return path;
  }
  return null;
}
