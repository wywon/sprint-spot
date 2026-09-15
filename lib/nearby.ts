'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 카카오 장소 검색 (미입점 매장)
 * ─────────────────────────────────────────────────────────────
 * [a8] 지어낸 미입점 매장 목록(lib/mock.ts 의 PLAIN_STORES)을 대신한다.
 *
 * ★ 왜 우리 DB 에 담지 않는가
 *   1. 담을 근거가 없다. 미입점 가게는 우리와 계약한 적이 없다.
 *   2. 카카오는 가이드에 안내된 방법으로 호출해 쓰는 것만 허용하고,
 *      응답을 따로 저장해 두고 쓰는 것은 허용하지 않는다.
 *   3. 5주차에 lib/mock.ts 를 지울 때 같이 죽는 코드가 생기지 않는다.
 *   불러서 그 자리에서 보여 주고 버린다. 이게 유일하게 맞는 구조다.
 *
 * ★ SDK 는 MapCanvas 가 이미 libraries=services 로 올려 둔 것을 그대로 쓴다.
 *   추가 설치도 키 발급도 없다. 다만 지도를 한 번도 안 띄운 화면(/search 로
 *   바로 들어온 경우)에서는 스크립트가 아직 없을 수 있으므로,
 *   쓰는 쪽에서 useKakaoSdk() 로 'ready' 를 확인하고 부를 것.
 *
 * ★ 실패하면 빈 배열이다. 예외를 던지지 않는다.
 *   발표장 네트워크가 흔들려도 우리 입점 매장 검색 결과는 그대로 나와야 한다.
 *   미입점 목록은 있으면 좋고 없어도 되는 정보다.
 */

export interface NearbyPlace {
  /** 카카오 장소 id. 우리 매장 id 와 섞이지 않게 접두사를 붙인다 */
  id: string;
  name: string;
  /** '음식점 > 한식 > 국밥' 의 마지막 조각 */
  cat: string;
  /** 분류 전체. 상세에서 한 줄로 보여 준다 */
  catFull: string;
  lat: number;
  lng: number;
  /** 도로명 주소. 없으면 지번 주소 */
  addr: string;
  jibun: string;
  tel: string;
  /** 카카오맵 장소 페이지 */
  url: string;
  /** 검색 기준점에서의 직선 거리(m) */
  dist: number;
  /** 카페인가 (아이콘을 가른다) */
  cafe: boolean;
}

const kakaoObj = (): any =>
  typeof window === 'undefined' ? null : (window as any).kakao;

/** 장소 검색을 쓸 수 있는 상태인가 */
export const placesReady = (): boolean =>
  Boolean(kakaoObj()?.maps?.services?.Places);

function toPlace(d: any): NearbyPlace {
  const full: string = d.category_name ?? '';
  return {
    id: `k${d.id}`,
    name: d.place_name ?? '',
    cat: full.split('>').pop()?.trim() || d.category_group_name || '',
    catFull: full.split('>').map((s: string) => s.trim()).filter(Boolean).join(' · '),
    lat: Number(d.y),
    lng: Number(d.x),
    addr: d.road_address_name || d.address_name || '',
    jibun: d.address_name || '',
    tel: d.phone || '',
    url: d.place_url || '',
    dist: Number(d.distance || 0),
    cafe: d.category_group_code === 'CE7',
  };
}

/**
 * 키워드로 찾는다. 검색 화면이 쓴다.
 *
 * @param center 거리 계산과 정렬의 기준점. 보통 DEMO_CENTER
 * @param radius 최대 20000m. 반경 밖은 아예 안 나온다
 */
export function searchPlaces(
  keyword: string,
  center: { lat: number; lng: number },
  radius = 5000,
): Promise<NearbyPlace[]> {
  const kakao = kakaoObj();
  const k = keyword.trim();
  if (!k || !placesReady()) return Promise.resolve([]);

  return new Promise((resolve) => {
    new kakao.maps.services.Places().keywordSearch(
      k,
      (data: any[], status: string) => {
        if (status !== kakao.maps.services.Status.OK) return resolve([]);
        resolve(data.map(toPlace));
      },
      {
        location: new kakao.maps.LatLng(center.lat, center.lng),
        radius,
        sort: kakao.maps.services.SortBy.DISTANCE,
        size: 15,           // 한 번에 받을 수 있는 최대치
      },
    );
  });
}

/**
 * 좌표에서 가장 가까운 로드뷰 파노라마 id.
 * 없으면 null — 골목 안쪽 가게는 파노라마가 없는 경우가 흔하다.
 *
 * radius 를 더 키우면 거의 항상 찾아내지만, 100m 떨어진 큰길 사진이 뜨면
 * 그건 그 가게 사진이 아니다. 80m 에서 못 찾으면 없는 셈 친다.
 */
export function roadviewPanoId(
  lat: number, lng: number, radius = 80,
): Promise<number | null> {
  const kakao = kakaoObj();
  if (!kakao?.maps?.RoadviewClient) return Promise.resolve(null);

  return new Promise((resolve) => {
    new kakao.maps.RoadviewClient().getNearestPanoId(
      new kakao.maps.LatLng(lat, lng),
      radius,
      (id: number | null) => resolve(id ?? null),
    );
  });
}