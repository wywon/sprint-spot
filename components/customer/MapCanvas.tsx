'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/format';
import { levelOf, lotStats, parkStats, parkVerdict, seatStats } from '@/lib/status';
import type { PartnerStore, PlainStore, PublicLot } from '@/lib/types';

/**
 * 지도 캔버스 — 카카오맵 SDK
 * ─────────────────────────────────────────────────────────────
 * [A6] CSS 격자 배경을 실제 지도로 교체했다.
 *
 * ★ 바꾼 것은 "좌표를 어디에 찍느냐" 하나뿐이다
 *   예전에는 lat/lng 를 0~100 퍼센트로 받아 position:absolute 로 얹었다.
 *   지금은 실제 위경도를 받아 카카오의 CustomOverlay 에 얹는다.
 *   마커 생김새(LotMarker / PartnerMarker / PlainMarker)는 한 글자도 안 고쳤다.
 *   디자인 검토를 다시 받을 일이 없다.
 *
 * ★ 왜 CustomOverlay + React portal 인가
 *   마커를 HTML 문자열로 만들면 Tailwind 클래스는 살지만 React 가 죽는다.
 *   onClick·조건부 클래스·아이콘 컴포넌트를 전부 문자열로 다시 써야 한다.
 *   그래서 빈 <div> 를 만들어 CustomOverlay 에 넘기고, 그 div 안으로
 *   createPortal 로 기존 React 마커를 밀어 넣는다.
 *   위치 계산은 카카오가 하고 내용물은 React 가 그린다. 지도를 끌어도 안 흔들린다.
 *
 * ★ 왜 좌표를 직접 검사하는가 (isKorea)
 *   DB의 Store.lat/lng 가 아직 퍼센트(38, 30 같은 값)일 수 있다.
 *   prisma/fixcoords.ts 를 안 돌린 팀원의 로컬이 그렇다.
 *   그대로 찍으면 마커가 아프리카 서쪽 바다에 떨어져서 지도가 텅 빈 것처럼 보인다.
 *   원인을 찾는 데 한참 걸리는 종류의 버그라 아예 그리지 않고 콘솔에 이유를 남긴다.
 *
 * ★ 개발 중에만 뜨는 좌표 찍기
 *   npm run dev 일 때 지도를 길게 눌렀다 떼면(또는 클릭하면) 그 지점의 위경도가
 *   상단에 뜨고 클립보드에 복사된다. 시연 매장 위치를 건물 위로 미세 조정할 때 쓴다.
 *   npm run build 에서는 이 코드가 통째로 빠진다.
 */

declare global {
  interface Window { kakao: any }
}

/**
 * 마커에 숫자를 찍을지.
 * ─────────────────────────────────────────────────────────
 * false 로 둔다. 지도는 "어디에 무엇이 있나"를 읽는 화면이고,
 * "몇 자리 남았나"는 마커를 누른 다음에 읽는 정보다.
 * 라벨 없는 숫자가 두 개씩 붙으면(8 8) 손님은 그게 무슨 뜻인지 모른 채
 * 마커 모양만 어지러워진다.
 *
 * 대신 마커는 문제가 있을 때만 말한다. 만석·만차는 발길을 돌리게 만드는
 * 정보라 누르기 전에 보여야 한다. 여유가 있다는 건 눌러서 확인해도 늦지 않다.
 *
 * true 로 바꾸면 예전처럼 전부 숫자가 나온다.
 */
const SHOW_COUNTS = false;

/** 스프린트 식당(s1) — 실시간 공영주차장 세 곳이 만드는 삼각형의 내심 */
export const DEMO_CENTER = { lat: 36.36572, lng: 127.43608 };

/** 시연용 '내 위치'. s1 에서 남서쪽으로 약 130m */
const ME_DEFAULT = { lat: 36.36485, lng: 127.43530 };

const SDK_URL = (key: string) =>
  `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services`;

/**
 * 한반도 범위 안의 좌표인가.
 * 퍼센트 값(0~100)과 실제 위경도를 가르는 기준은 경도다.
 * 위도 38 은 퍼센트로도 위경도로도 말이 되지만, 경도 30 은 대서양이다.
 */
const isKorea = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat > 33 && lat < 39 && lng > 124 && lng < 132;

/** 두 점 사이 직선 거리(m). 이 정도 범위에서는 평면 근사로 충분하다 */
export function distM(a: FitPoint, b: FitPoint): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.round(Math.hypot(dx, dy));
}

/** 같은 경고를 매 렌더마다 찍지 않도록 */
const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[MapCanvas]', msg);
}

/* ── SDK 로더 ───────────────────────────────────────────────
   script 태그를 한 번만 넣는다. autoload=false 를 붙이고 kakao.maps.load() 를
   직접 부르는 것이 공식 권장 방식이다. 안 붙이면 스크립트가 로드되는 즉시
   전역을 초기화해서 React 렌더 순서와 어긋난다. */

type SdkState = 'loading' | 'ready' | 'nokey' | 'error';

function useKakaoSdk(): SdkState {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const [state, setState] = useState<SdkState>(key ? 'loading' : 'nokey');

  useEffect(() => {
    if (!key) return;

    // 이미 올라와 있으면 바로 끝
    if (window.kakao?.maps?.LatLng) { setState('ready'); return; }

    const done = () => {
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => setState('ready'));
      } else {
        // 스크립트는 받았는데 kakao 가 없다 = 키가 틀렸거나 도메인 미등록
        setState('error');
      }
    };

    const exist = document.getElementById('kakao-map-sdk') as HTMLScriptElement | null;
    if (exist) {
      exist.addEventListener('load', done);
      exist.addEventListener('error', () => setState('error'));
      if (window.kakao?.maps) done();
      return () => { exist.removeEventListener('load', done); };
    }

    const s = document.createElement('script');
    s.id = 'kakao-map-sdk';
    s.async = true;
    s.src = SDK_URL(key);
    s.onload = done;
    s.onerror = () => setState('error');
    document.head.appendChild(s);
  }, [key]);

  return state;
}

/* ── 지도 컨텍스트 ─────────────────────────────────────────── */

const MapCtx = createContext<any>(null);
const useMap = () => useContext(MapCtx);

export interface FitPoint { lat: number; lng: number }

/**
 * 지도 본체.
 *
 * @param fit     이 점들이 전부 화면에 들어오도록 처음 한 번 맞춘다
 * @param fitKey  이 값이 바뀌면 다시 맞춘다 (필터 전환용).
 *                손님이 지도를 끌어 놓은 걸 3초 폴링이 되돌리면 안 되므로
 *                fitKey 가 그대로면 lots 가 갱신돼도 화면을 건드리지 않는다.
 */
export function MapCanvas({
  children, fit, fitKey = '', level = 5, maxLevel = 5, minLevel = 3,
}: {
  children: React.ReactNode;
  fit?: FitPoint[];
  fitKey?: string;
  level?: number;
  /** 이보다 더 멀어지지 않는다. 숫자가 클수록 넓게 본다 */
  maxLevel?: number;
  /** 이보다 더 가까워지지 않는다. 마커가 한두 개만 남았을 때의 안전장치 */
  minLevel?: number;
}) {
  const sdk = useKakaoSdk();
  const boxRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const fittedRef = useRef<string | null>(null);

  /* 지도 생성 — 한 번만 */
  useEffect(() => {
    if (sdk !== 'ready' || !boxRef.current || map) return;
    const kakao = window.kakao;
    const m = new kakao.maps.Map(boxRef.current, {
      center: new kakao.maps.LatLng(DEMO_CENTER.lat, DEMO_CENTER.lng),
      level,
      // 손님 화면은 손가락으로만 쓴다. +/- 버튼은 지도를 좁게 만든다
      draggable: true,
      scrollwheel: true,
    });
    setMap(m);
  }, [sdk, map, level]);

  /* 화면 크기가 바뀌면 지도에게 알려 줘야 한다.
     PhoneChrome 안에서 뜨는 화면이라 첫 렌더 시점의 높이가 0일 수 있다 */
  useEffect(() => {
    if (!map) return;
    const ro = new ResizeObserver(() => map.relayout());
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [map]);

  /* 마커가 전부 보이도록 맞추기 */
  useEffect(() => {
    if (!map || !fit?.length) return;
    if (fittedRef.current === fitKey) return;

    const pts = fit.filter((p) => isKorea(p.lat, p.lng));
    if (!pts.length) return;

    const kakao = window.kakao;
    const b = new kakao.maps.LatLngBounds();
    pts.forEach((p) => b.extend(new kakao.maps.LatLng(p.lat, p.lng)));
    // 아래쪽은 하단 시트가, 위쪽은 검색창이 가린다. 그만큼 여백을 준다
    map.setBounds(b, 150, 40, 230, 40);

    /* setBounds 는 "전부 들어오게" 만 한다. 마커가 몇 개 남았느냐에 따라
       배율이 크게 흔들려서, 첫 화면이 어떤 날은 동네가 어떤 날은 구 전체가 된다.
       손님이 첫 화면에서 읽어야 하는 건 "여기서 걸어갈 만한 거리에 뭐가 있나"다.
       그래서 위아래로 잘라 낸다. */
    const lv = map.getLevel();
    if (lv > maxLevel) map.setLevel(maxLevel);
    else if (lv < minLevel) map.setLevel(minLevel);

    fittedRef.current = fitKey;
  }, [map, fit, fitKey, maxLevel, minLevel]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-ink-100">
      <div ref={boxRef} className="absolute inset-0" />

      {sdk === 'ready' && map && (
        <MapCtx.Provider value={map}>
          {children}
          <CoordPicker />
        </MapCtx.Provider>
      )}

      {sdk === 'loading' && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/90 border border-ink-200 shadow-pop">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-200 border-t-brand-600 animate-spin" />
            <span className="text-[12px] font-bold text-ink-600">지도를 불러오는 중</span>
          </div>
        </div>
      )}

      {(sdk === 'nokey' || sdk === 'error') && <MapFallback reason={sdk} />}
    </div>
  );
}

/**
 * 지도를 못 띄웠을 때.
 * 화면을 하얗게 비우지 않는다. 손님에게는 이유를 숨기고, 개발자에게는 남긴다.
 */
function MapFallback({ reason }: { reason: 'nokey' | 'error' }) {
  useEffect(() => {
    warnOnce(
      'sdk-' + reason,
      reason === 'nokey'
        ? 'NEXT_PUBLIC_KAKAO_MAP_KEY 가 없다. .env 에 넣고 dev 서버를 다시 켤 것 (.env.local 아님)'
        : '카카오 SDK 로드 실패. JavaScript 키가 맞는지, 지금 접속한 주소가 [사이트 도메인]에 등록돼 있는지 확인할 것. Vercel Preview 는 프로덕션과 주소가 다르다',
    );
  }, [reason]);

  return (
    <div className="absolute inset-0 map-grid grid place-items-center px-8">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-white border border-ink-200 shadow-pop grid place-items-center mx-auto text-ink-400">
          <Icon n="compass" s={22} />
        </div>
        <div className="mt-3 text-[13px] font-extrabold text-ink-700">지도를 표시할 수 없어요</div>
        <div className="mt-1 text-[11.5px] font-bold text-ink-500 leading-relaxed">
          아래 목록에서 좌석과 주차 상황은
          <br />
          그대로 확인하실 수 있어요
        </div>
      </div>
    </div>
  );
}

/* ── 오버레이 한 칸 ─────────────────────────────────────────
   빈 div 를 만들어 카카오에게 위치를 맡기고, 그 안에 React 를 심는다 */

function Overlay({
  lat, lng, z = 20, yAnchor = 1, children,
}: {
  lat: number; lng: number; z?: number; yAnchor?: number; children: React.ReactNode;
}) {
  const map = useMap();
  const [el] = useState(() =>
    typeof document === 'undefined' ? null : document.createElement('div'),
  );
  const ovRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !el) return;
    const kakao = window.kakao;
    const ov = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content: el,
      xAnchor: 0.5,
      yAnchor,
      zIndex: z,
      clickable: true,   // 없으면 마커를 눌러도 지도가 먼저 먹는다
    });
    ov.setMap(map);
    ovRef.current = ov;
    return () => { ov.setMap(null); ovRef.current = null; };
    // 위치·zIndex 변경은 아래 훅이 처리한다. 여기서 다시 만들면 깜빡인다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el]);

  useEffect(() => {
    if (!ovRef.current) return;
    ovRef.current.setPosition(new window.kakao.maps.LatLng(lat, lng));
  }, [lat, lng]);

  useEffect(() => {
    ovRef.current?.setZIndex(z);
  }, [z]);

  if (!el) return null;
  return createPortal(children, el);
}

/* ── 공영주차장 마커 ────────────────────────────────────────
   [A6] 실시간 연동 주차장과 기본정보 주차장을 구분한다.

   available 이 숫자면 실시간 연동 주차장이다. 잔여 대수를 그대로 보여 준다.
   available 이 null 이면 그 주차장은 실시간 정보를 내보내지 않는다.
   대전시 주차안내시스템이 초록/회색으로 나누는 기준과 같다.

   ★ null 을 0 으로 바꿔 표시하면 안 된다. "모른다"와 "만차"는 다른 이야기고,
     손님이 헛걸음하는 쪽은 후자로 잘못 읽었을 때가 아니라 전자로 잘못 읽었을 때다. */
export const LotMarker = ({
  lot, on, onClick,
}: { lot: PublicLot; on?: boolean; onClick?: () => void }) => {
  if (!isKorea(lot.lat, lot.lng)) {
    warnOnce('lot-' + lot.id, `${lot.name} 좌표가 위경도가 아니다 (${lot.lat}, ${lot.lng})`);
    return null;
  }

  const live = lot.available != null;
  const lv = levelOf(lotStats(lot));
  const full = lot.available === 0;   // 실시간으로 확인된 만차. null(모름)과 다르다

  return (
    <Overlay lat={lot.lat} lng={lot.lng} z={on ? 90 : live ? 22 : 12}>
      <button onClick={onClick} className="block">
        <span
          className={cx(
            'flex items-center gap-1 rounded-full shadow-mk border-2 border-white transition-transform',
            live ? 'h-8 pl-1.5 pr-2' : 'h-7 px-1.5',
            (SHOW_COUNTS && live) || full ? 'pr-2.5' : '',
            lv.cls,
            on && 'scale-110',
          )}
        >
          <Icon n={full ? 'ban' : 'parkingP'} s={live ? 16 : 14} />
          {full ? (
            <span className="text-[11px] font-extrabold">만차</span>
          ) : SHOW_COUNTS && live ? (
            <span className="text-[12.5px] font-extrabold tnum">{lot.available}</span>
          ) : null}
        </span>
        <span
          className={cx('block w-2 h-2 rotate-45 -mt-1 mx-auto border-2 border-white', lv.cls)}
          style={{ background: 'currentColor' }}
        />
      </button>
    </Overlay>
  );
};

/* ── 입점 식당 마커 ─────────────────────────────────────────
   좌석과 주차를 한 칩에 같이 담는다. 이 서비스의 존재 이유가 그 두 숫자를
   한 번에 보여 주는 것이라, 지도에서도 떨어뜨려 놓지 않는다.

   숫자의 출처는 3초 폴링(lib/store.tsx)이 채우는 store 객체다.
   s1 은 센서가 실제로 밀어 넣은 값이 여기까지 그대로 올라온다. */
export const PartnerMarker = ({
  store, on, onClick,
}: { store: PartnerStore; on?: boolean; onClick?: () => void }) => {
  if (!isKorea(store.lat, store.lng)) {
    warnOnce(
      'store-' + store.id,
      `${store.name}(${store.id}) 좌표가 위경도가 아니다 (${store.lat}, ${store.lng}). ` +
      'npx tsx prisma/fixcoords.ts 를 돌렸는지 확인할 것',
    );
    return null;
  }

  const ss = seatStats(store);
  const ps = parkStats(store);

  /* 마커가 말해야 하는 것은 "가도 되나"뿐이다.
     자리가 있으면 이름만 보여 주고, 없을 때만 이유를 붙인다.

     ★ '모른다'를 '없다'로 바꾸지 않는다
       available === 0 만 보면 안 된다. 센서는 살아 있는데 10면이 전부 unknown 이면
       available 도 0 이 되는데, 그건 만차가 아니라 확인 불가다.
       그때 관리자 배치도는 「확인 중」을 그리는데 손님 마커만 「주차 만차」가 되어
       두 화면이 어긋난다. b7 이 levelOf() 에서 고친 것과 같은 문제다.
       재현 — node scripts/fake-sensor.mjs --unknown
       센서 꺼짐(offline)도 만차가 아니다. 지도에서 설명하기엔 긴 이야기라
       마커에는 아무 말도 안 붙이고, 마커를 누른 뒤 시트에서 다룬다.

     ★ 테이블이나 주차면이 0개인 매장도 걸러야 한다
       total 0 이면 available 도 0 이라 '만석'이 뜬다. 아직 배치도를 안 만든 매장이다. */
  const seatFull = ss.total > 0 && ss.available === 0;
  const parkFull = parkVerdict(ps) === 'full';
  const warn = seatFull && parkFull ? '만석 · 만차' : seatFull ? '만석' : parkFull ? '주차 만차' : null;

  return (
    <Overlay lat={store.lat} lng={store.lng} z={on ? 95 : 30}>
      <button onClick={onClick} className="block">
        <span
          className={cx(
            'flex items-center gap-1.5 h-9 pl-2 pr-2.5 rounded-full bg-white shadow-mk border-2 transition-transform',
            on ? 'border-brand-600 scale-110' : 'border-ink-900/10',
          )}
        >
          <span className="w-5 h-5 rounded-full bg-food-400 text-white grid place-items-center shrink-0">
            <Icon n="fork" s={12} />
          </span>
          <span className="text-[12px] font-extrabold text-ink-900 max-w-[96px] truncate">
            {store.name}
          </span>

          {SHOW_COUNTS ? (
            <span className="flex items-center gap-0.5">
              <span className={cx('text-[11px] font-extrabold tnum', ss.available > 0 ? 'text-ok-500' : 'text-busy-500')}>
                {ss.available}
              </span>
              <span className="text-ink-300 text-[10px]">·</span>
              <span
                className={cx(
                  'text-[11px] font-extrabold tnum',
                  ps.offline ? 'text-off-400' : (ps.available ?? 0) > 0 ? 'text-ok-500' : 'text-busy-500',
                )}
              >
                {ps.offline ? '—' : ps.available}
              </span>
            </span>
          ) : warn ? (
            <span
              className={cx(
                'shrink-0 px-1.5 h-[18px] rounded-full text-[10px] font-extrabold grid place-items-center',
                seatFull ? 'bg-busy-500 text-white' : 'bg-warn-400 text-warn-900',
              )}
            >
              {warn}
            </span>
          ) : null}
        </span>
        <span className="block w-2 h-2 rotate-45 -mt-1 mx-auto bg-white border-r-2 border-b-2 border-ink-900/10" />
      </button>
    </Overlay>
  );
};

/** 미입점 식당 마커 — 상호명만. 눌러도 상세로 가지 않는다 */
export const PlainMarker = ({ store }: { store: PlainStore }) => {
  if (!isKorea(store.lat, store.lng)) return null;
  return (
    <Overlay lat={store.lat} lng={store.lng} z={8}>
      <span className="flex items-center gap-1 h-6 px-2 rounded-full bg-white/85 border border-ink-200 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-400" />
        <span className="text-[11px] font-bold text-ink-500 max-w-[80px] truncate">{store.name}</span>
      </span>
    </Overlay>
  );
};

/** 내 위치 */
export const MeMarker = ({
  lat = ME_DEFAULT.lat, lng = ME_DEFAULT.lng,
}: { lat?: number; lng?: number }) => {
  if (!isKorea(lat, lng)) return null;
  return (
    <Overlay lat={lat} lng={lng} z={40} yAnchor={0.5}>
      <span className="block w-4 h-4 rounded-full bg-brand-600 border-[3px] border-white shadow-mk pointer-events-none" />
    </Overlay>
  );
};

/* ── 개발용 좌표 찍기 ───────────────────────────────────────
   시연 매장을 건물 위로 올릴 때 쓴다.

   ★ 기본은 꺼져 있다
     주소창에 ?pick=1 을 붙였을 때만 켜진다. 그 전에는 리스너조차 달지 않는다.
     지도를 만질 때마다 클립보드가 덮어써지면 다른 작업이 방해받는다.
       /explore?pick=1

   ★ 프로덕션 빌드에서는 통째로 빠진다
     process.env.NODE_ENV 는 빌드 시점에 문자열로 치환되므로 죽은 가지가 제거된다. */
function CoordPicker() {
  const map = useMap();
  const [armed, setArmed] = useState(false);
  const [hit, setHit] = useState<string | null>(null);

  /* 주소창 확인은 useEffect 안에서 한다.
     렌더 도중에 window 를 읽으면 서버 렌더 결과와 달라져 hydration 오류가 난다 */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    setArmed(new URLSearchParams(window.location.search).has('pick'));
  }, []);

  useEffect(() => {
    if (!armed || !map) return;
    const kakao = window.kakao;

    const onClick = (e: any) => {
      const ll = e.latLng;
      const text = `${ll.getLat().toFixed(5)}, ${ll.getLng().toFixed(5)}`;
      setHit(text);
      navigator.clipboard?.writeText(text).catch(() => {});
      console.log('[좌표]', text);

      // 좌표 → 주소. 관리자 패널 '주소' 칸에 넣을 값은 좌표가 아니라 이쪽이다
      if (kakao.maps.services) {
        new kakao.maps.services.Geocoder().coord2Address(
          ll.getLng(), ll.getLat(),
          (res: any, status: any) => {
            if (status !== kakao.maps.services.Status.OK) return;
            const a = res?.[0];
            console.log('[지번]  ', a?.address?.address_name ?? '없음');
            console.log('[도로명]', a?.road_address?.address_name ?? '없음');
          },
        );
      }
    };

    kakao.maps.event.addListener(map, 'click', onClick);
    return () => kakao.maps.event.removeListener(map, 'click', onClick);
  }, [armed, map]);

  if (!armed || !hit) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[280px] z-50 pointer-events-none">
      <span className="px-2.5 py-1.5 rounded-lg bg-ink-900/85 text-white text-[11px] font-extrabold tnum">
        {hit} · 복사됨 · 주소는 콘솔
      </span>
    </div>
  );
}