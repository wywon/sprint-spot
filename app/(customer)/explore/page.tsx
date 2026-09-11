'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/primitives';
import {
  MapCanvas, LotMarker, PartnerMarker, PlainMarker, MeMarker,
  DEMO_CENTER, distM, type FitPoint,
} from '@/components/customer/MapCanvas';
import { StoreCard, LotCard } from '@/components/customer/Cards';
import { cx } from '@/lib/format';
import { PLAIN_STORES } from '@/lib/mock';
import { useApp } from '@/lib/store';

/**
 * 탐색 (첫 화면)
 * ─────────────────────────────────────────────────────────────
 * ★ 왜 지도가 전체 화면인가
 *   이 서비스의 판단 기준은 "여기서 가까운가 + 자리 있나 + 차 댈 데 있나"다.
 *   세 값은 전부 공간과 묶여 있으므로 목록보다 지도가 먼저다.
 *   목록은 지도를 가리지 않도록 하단 시트로 겹쳐 올린다.
 *
 * ★ 검색창은 absolute 로 지도 위에 띄운다. 지도 높이를 깎지 않기 위해서다.
 *
 * URL 파라미터로 상태를 받는다 (다른 화면에서 돌아올 때 필터/초점을 복원하기 위함)
 *   ?filter=food|lot|all   ?focus=<id>   ?q=<검색어>
 *
 * ★ Suspense 로 감싸는 이유 — 빼면 `npm run build` 가 실패한다
 *   useSearchParams() 는 주소창의 ?뒤쪽을 읽는데, 그건 브라우저에서만 알 수 있는 값이다.
 *   Next.js 는 빌드할 때 페이지를 미리 HTML로 만들어 두려고 하는데,
 *   그 시점에는 ?뒤쪽을 모르므로 "여기는 나중에 채울 자리"라고 표시해 줘야 한다.
 *   그 표시가 <Suspense> 다. 없으면 빌드가 이 에러로 멈춘다:
 *     useSearchParams() should be wrapped in a suspense boundary at page "/explore"
 *
 *   ※ npm run dev 에서는 이 에러가 안 난다. 빌드할 때만 난다.
 *     useSearchParams() 를 새로 쓰는 화면이 생기면 똑같이 감싸 줄 것.
 */
/**
 * 첫 화면에 담을 반경(m). 스프린트 식당 기준이다.
 * 520m 면 실시간 공영주차장 세 곳이 전부 들어온다.
 *   송촌소리 133m · 법동시장 제2 305m · 송촌공영 444m
 * 더 좁게 보고 싶으면 이 숫자를 줄인다.
 */
const FIT_RADIUS_M = 520;

/** 안내 카드를 닫았는지 기억하는 키 */
const HINT_KEY = 'spot.hint.explore';

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 map-grid" />}>
      <ExploreView />
    </Suspense>
  );
}

function ExploreView() {
  const router = useRouter();
  const params = useSearchParams();
  const { stores, lots, favorites } = useApp();

  const filter = params.get('filter') ?? 'all';
  const focusId = params.get('focus');
  const query = params.get('q') ?? '';

  const [sel, setSel] = useState<string | null>(focusId);

  /**
   * 첫 화면 안내 카드.
   * ─────────────────────────────────────────────────────────
   * 한 번 읽으면 끝나는 문구다. 매번 다시 띄우면 지도를 가리는 방해물이 된다.
   * 닫은 사실은 localStorage 에 남겨서 다음에 켤 때도 안 뜨게 한다.
   *
   * 읽기를 useEffect 안에서 하는 이유 — 렌더 도중에 localStorage 를 읽으면
   * 서버가 만든 HTML(항상 '안 닫힘')과 브라우저 결과가 달라져 hydration 오류가 난다.
   * 그래서 일단 띄운 상태로 그리고, 마운트 직후에 닫힌 적이 있으면 치운다.
   */
  const [hintOff, setHintOff] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY) === '1') setHintOff(true);
    } catch { /* 시크릿 모드 등에서 막히면 그냥 띄운다 */ }
  }, []);

  const closeHint = () => {
    setHintOff(true);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* 무시 */ }
  };

  const showLots = filter === 'all' || filter === 'lot';
  const showFood = filter === 'all' || filter === 'food';

  const setFilter = (v: string) => {
    const p = new URLSearchParams(Array.from(params.entries()));
    if (v === 'all') p.delete('filter');
    else p.set('filter', v);
    router.replace(`/explore?${p.toString()}`);
  };

  const selStore = stores.find((s) => s.id === sel);
  const selLot = lots.find((l) => l.id === sel);

  /**
   * [A6] 첫 화면에 무엇이 보여야 하는가
   * ─────────────────────────────────────────────────────────
   * 실시간 주차장(초록)만 보이면 "우리가 실시간이라 자랑하는 것"만 남고,
   * 기본정보 주차장(회색)까지 같이 보여야 "이 동네 주차장은 이만큼 있고
   * 그중 실시간으로 아는 건 이만큼"이라는 사실이 한눈에 읽힌다.
   * 그래서 마커 전체가 들어오도록 지도를 맞춘다. 고정 줌을 쓰지 않는 이유다.
   *
   * fitKey 를 필터 값으로 두면 필터를 바꿀 때만 다시 맞춘다.
   * 3초·30초 폴링이 돌 때마다 지도가 튀면 손님이 끌어 놓은 화면이 매번 초기화된다.
   */
  const fitPoints = useMemo<FitPoint[]>(() => {
    const all: FitPoint[] = [];
    if (showLots) lots.forEach((l) => all.push({ lat: l.lat, lng: l.lng }));
    if (showFood) stores.forEach((s) => all.push({ lat: s.lat, lng: s.lng }));

    // 마커 전체를 다 넣으면 중리동·법1동까지 끌려 들어와 첫 화면이 구 단위가 된다.
    // 손님이 첫 화면에서 판단하는 건 "걸어갈 만한 거리에 뭐가 있나"이므로
    // 시연 매장 반경 안쪽만 기준으로 잡고, 나머지는 밀거나 줄여서 보게 둔다.
    const near = all.filter((p) => distM(p, DEMO_CENTER) <= FIT_RADIUS_M);
    return near.length >= 2 ? near : all;
  }, [showLots, showFood, lots, stores]);

  /** 실시간 잔여 대수를 아는 공영주차장 수. 칩에 숫자로 붙인다 */
  const liveLots = lots.filter((l) => l.available != null).length;

  return (
    <div className="absolute inset-0">
      <MapCanvas fit={fitPoints} fitKey={filter}>
        <MeMarker />
        {showLots && lots.map((l) => (
          <LotMarker key={l.id} lot={l} on={sel === l.id} onClick={() => setSel(l.id)} />
        ))}
        {showFood && PLAIN_STORES.map((s) => <PlainMarker key={s.id} store={s} />)}
        {showFood && stores.map((s) => (
          <PartnerMarker key={s.id} store={s} on={sel === s.id} onClick={() => setSel(s.id)} />
        ))}
      </MapCanvas>

      {/* 검색창 + 즐겨찾기 — 지도 위에 절대 위치 */}
      <div className="absolute top-0 left-0 right-0 z-40 pt-12 px-4">
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="grow h-12 rounded-2xl bg-white shadow-pop border border-ink-200 flex items-center gap-2.5 px-4"
          >
            <Icon n="search" s={19} cls="text-ink-400 shrink-0" />
            <span className={cx('text-[14px] font-bold truncate', query ? 'text-ink-900' : 'text-ink-400')}>
              {query || '식당, 공영주차장 검색'}
            </span>
          </Link>
          <Link
            href="/favorites"
            aria-label="즐겨찾기"
            className="w-12 h-12 rounded-2xl bg-white shadow-pop border border-ink-200 grid place-items-center shrink-0 text-warn-400"
          >
            <Icon n={favorites.length ? 'star' : 'starO'} s={21} />
          </Link>
        </div>

        {/* 필터 칩 */}
        <div className="flex gap-2 mt-3 overflow-x-auto no-sb -mx-4 px-4">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>전체</Chip>
          <Chip active={filter === 'lot'} icon="parkingP" onClick={() => setFilter('lot')} count={lots.length}>
            공영주차장
          </Chip>
          <Chip active={filter === 'food'} icon="fork" onClick={() => setFilter('food')} count={stores.length}>
            식당주차장
          </Chip>
        </div>
      </div>

      {/* 하단 시트 — 선택한 마커가 있으면 그 카드만, 없으면 전체 목록 */}
      <div className="absolute left-0 right-0 bottom-[76px] z-30 px-4 pb-3">
        {selStore ? (
          <div className="animate-popIn">
            <StoreCard store={selStore} />
          </div>
        ) : selLot ? (
          <div className="animate-popIn">
            <LotCard lot={selLot} />
          </div>
        ) : hintOff ? null : (
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-ink-200 shadow-pop pl-4 pr-2 py-3 flex items-center gap-2.5 animate-popIn">
            <Icon n="compass" s={18} cls="text-brand-600 shrink-0" />
            <div className="grow text-[12.5px] font-bold text-ink-700 leading-snug">
              {liveLots > 0 ? (
                <>
                  이 주변 주차장 {lots.length}곳 중{' '}
                  <b className="text-ink-900">{liveLots}곳</b>은 남은 자리까지 알 수 있어요
                  <br />
                  <span className="text-ink-500">지도에서 표시를 눌러 확인해 보세요</span>
                </>
              ) : (
                <>
                  지도에서 <b className="text-ink-900">가게 표시</b>를 누르면
                  <br />
                  좌석과 주차 상황을 함께 볼 수 있어요
                </>
              )}
            </div>
            {/* 손가락으로 눌러야 하므로 44px 확보한다. 아이콘만 작게 보인다 */}
            <button
              onClick={closeHint}
              aria-label="안내 닫기"
              className="shrink-0 w-11 h-11 -my-2 grid place-items-center text-ink-400 active:scale-90 transition-transform"
            >
              <Icon n="x" s={16} />
            </button>
          </div>
        )}
      </div>

      {/* 선택 해제 */}
      {sel && (
        <button
          onClick={() => setSel(null)}
          className="absolute right-4 bottom-[190px] z-30 w-11 h-11 rounded-full bg-white shadow-pop border border-ink-200 grid place-items-center text-ink-500"
          aria-label="선택 해제"
        >
          <Icon n="x" s={18} />
        </button>
      )}
    </div>
  );
}