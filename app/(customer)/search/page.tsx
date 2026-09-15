'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Segmented, Empty } from '@/components/ui/primitives';
import { StoreCard, NearbyCard, LotCard, FoodTile } from '@/components/customer/Cards';
import { PlaceSheet } from '@/components/customer/PlaceSheet';
import { DEMO_CENTER, useKakaoSdk } from '@/components/customer/MapCanvas';
import { searchPlaces, type NearbyPlace } from '@/lib/nearby';
import { useApp } from '@/lib/store';

/**
 * 검색 — 전체 화면 레이어
 * ─────────────────────────────────────────────────────────────
 * ★ 탭바를 숨긴다. (TabBar 가 /search 를 탭 경로로 보지 않으므로 자동으로 숨겨진다)
 * ★ 검색 전에는 최근 검색어 + 추천을 보여준다. 빈 화면을 주지 않는 것이 원칙이다.
 * ★ 검색 결과는 분류탭(식당 / 공영주차장) 기준으로 나눠 보여준다.
 *
 * [a8] 미입점 매장을 카카오 장소 검색으로 바꿨다.
 *   ─────────────────────────────────────────────────────────
 *   예전에는 lib/mock.ts 에 지어낸 여섯 곳이 전부였다. 실제로 존재하지 않는
 *   가게라 검색해도 거의 안 걸렸고, 걸려도 누르면 아무 일이 없었다.
 *
 *   ★ 두 목록의 성격이 다르다는 걸 화면이 말해야 한다
 *     위쪽 — SPOT 입점 매장. 좌석·주차를 실시간으로 안다. 예약도 된다.
 *     아래쪽 — 그냥 있는 가게. 이름과 주소만 안다.
 *     그래서 섹션을 나누고, 아래쪽 카드에는 숫자를 하나도 넣지 않는다.
 *
 *   ★ 입점 매장과 겹치면 아래쪽에서 뺀다
 *     카카오에도 우리 입점 매장이 등록돼 있어서 같은 가게가 두 번 나온다.
 *     이름으로 거른다. 좌표로 거르는 방법도 있지만 우리 DB 좌표가 아직
 *     정확하지 않은 매장이 있어 이름 쪽이 안전하다.
 *
 *   ★ 못 불러와도 화면은 그대로다
 *     카카오 쪽이 실패하면 미입점 섹션만 안 뜨고 입점 매장 결과는 그대로 나온다.
 *     발표장 네트워크가 흔들려도 시연에 필요한 건 위쪽 목록이다.
 */

/** 검색 반경. 시연 지역을 넘어 대덕구 전체 정도를 본다 */
const SEARCH_RADIUS_M = 5000;

export default function SearchPage() {
  const router = useRouter();
  const { stores, lots, recent, setRecent } = useApp();
  const sdk = useKakaoSdk();

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'food' | 'lot'>('food');
  const [submitted, setSubmitted] = useState(false);

  /** 미입점 매장 — 카카오가 준 것. null 이면 아직 안 불러왔다 */
  const [nearby, setNearby] = useState<NearbyPlace[] | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [picked, setPicked] = useState<NearbyPlace | null>(null);

  const results = useMemo(() => {
    const k = q.trim();
    if (!k) return { food: [], lot: [] };
    return {
      food: stores.filter((s) => s.name.includes(k) || s.cat.includes(k)),
      lot: lots.filter((l) => l.name.includes(k) || l.gu.includes(k)),
    };
  }, [q, stores, lots]);

  const hasResult = submitted && q.trim().length > 0;

  /**
   * 입점 매장 이름 목록을 문자열 하나로 만들어 둔다.
   * ★ stores 배열을 그대로 의존성에 넣으면 안 된다 —
   *   3초 폴링이 매번 새 배열을 만들어서 검색이 3초마다 다시 돈다.
   *   이름은 거의 안 바뀌므로 문자열로 바꿔 두면 값이 같아 다시 돌지 않는다.
   */
  const knownNames = useMemo(() => stores.map((s) => s.name).join('|'), [stores]);

  useEffect(() => {
    if (!hasResult || sdk !== 'ready') return;

    let alive = true;
    setNearbyLoading(true);

    searchPlaces(q, DEMO_CENTER, SEARCH_RADIUS_M)
      .then((list) => {
        if (!alive) return;
        const known = new Set(knownNames.split('|').filter(Boolean));
        setNearby(list.filter((p) => !known.has(p.name)).slice(0, 12));
      })
      .finally(() => { if (alive) setNearbyLoading(false); });

    return () => { alive = false; };
  }, [q, hasResult, sdk, knownNames]);

  const submit = (text: string) => {
    const k = text.trim();
    if (!k) return;
    setQ(k);
    setSubmitted(true);
    setNearby(null);
    setRecent((p) => [k, ...p.filter((x) => x !== k)].slice(0, 6));
  };

  const clear = () => {
    setQ('');
    setSubmitted(false);
    setNearby(null);
  };

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      {/* 검색 바 — 왼쪽에 뒤로가기 */}
      <div className="shrink-0 pt-12 px-3 pb-3 border-b border-ink-200 flex items-center gap-1.5">
        <button onClick={() => router.back()} aria-label="뒤로" className="w-10 h-10 grid place-items-center text-ink-800 shrink-0">
          <Icon n="chevL" s={21} />
        </button>
        <div className="grow h-11 rounded-xl bg-ink-100 flex items-center gap-2 px-3.5">
          <Icon n="search" s={18} cls="text-ink-400 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setSubmitted(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(q); }}
            placeholder="식당, 공영주차장 검색"
            className="grow bg-transparent outline-none text-[14.5px] font-bold text-ink-900 placeholder:text-ink-400 placeholder:font-medium"
          />
          {q && (
            <button onClick={clear} aria-label="지우기" className="text-ink-400 shrink-0">
              <Icon n="x" s={16} />
            </button>
          )}
        </div>
      </div>

      {/* 분류탭 */}
      <div className="shrink-0 px-4 py-3 border-b border-ink-100">
        <Segmented
          full
          value={tab}
          onChange={setTab}
          options={[{ value: 'food', label: '식당' }, { value: 'lot', label: '공영주차장' }]}
        />
      </div>

      <div className="grow overflow-y-auto no-sb">
        {!hasResult ? (
          <>
            {/* 최근 검색어 */}
            <div className="px-4 pt-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[13px] font-extrabold text-ink-900">최근 검색어</span>
                <button onClick={() => setRecent([])} className="text-[11.5px] font-bold text-ink-400">전체 삭제</button>
              </div>
              {recent.length ? (
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button
                      key={r}
                      onClick={() => submit(r)}
                      className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2.5 rounded-full bg-ink-100 text-[12.5px] font-bold text-ink-700"
                    >
                      {r}
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setRecent((p) => p.filter((x) => x !== r)); }}
                        className="text-ink-400"
                      >
                        <Icon n="x" s={12} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[12.5px] font-medium text-ink-400 py-2">최근 검색한 내역이 없어요</div>
              )}
            </div>

            {/* 추천 */}
            <div className="pt-6 pb-8">
              <div className="px-4 mb-3">
                <div className="text-[15px] font-extrabold text-ink-900">여기는 어떠세요?</div>
                <div className="text-[12px] font-bold text-ink-500 mt-0.5">지금 자리와 주차가 여유로운 곳이에요</div>
              </div>
              <div className="flex gap-3 overflow-x-auto no-sb px-4">
                {stores.map((s) => <FoodTile key={s.id} store={s} />)}
              </div>
            </div>
          </>
        ) : (
          <div className="p-4 space-y-3">
            {tab === 'food' ? (
              <>
                {results.food.length > 0 && (
                  <>
                    <div className="pb-1 text-[12px] font-extrabold text-ink-400">SPOT 입점 매장</div>
                    {results.food.map((s) => <StoreCard key={s.id} store={s} />)}
                  </>
                )}

                {/* 미입점 — 카카오가 준 실제 가게 */}
                {nearbyLoading && !nearby && (
                  <div className="py-6 flex items-center justify-center gap-2 text-ink-400">
                    <span className="w-4 h-4 rounded-full border-2 border-ink-200 border-t-brand-600 animate-spin" />
                    <span className="text-[12.5px] font-bold">주변 가게를 찾는 중</span>
                  </div>
                )}

                {nearby && nearby.length > 0 && (
                  <>
                    <div className="pt-2 pb-1">
                      <div className="text-[12px] font-extrabold text-ink-400">SPOT 미입점 매장</div>
                      <div className="text-[11px] font-medium text-ink-400 mt-0.5">
                        좌석과 주차는 알 수 없고, 기본 정보만 보여드려요
                      </div>
                    </div>
                    {nearby.map((p) => (
                      <NearbyCard key={p.id} place={p} onClick={() => setPicked(p)} />
                    ))}
                  </>
                )}

                {results.food.length === 0 && !nearbyLoading && (!nearby || nearby.length === 0) && (
                  <Empty
                    icon="search"
                    title="검색 결과가 없어요"
                    desc={`'${q}'와 일치하는 식당을 찾지 못했어요.\n다른 이름으로 검색해 보세요.`}
                  />
                )}
              </>
            ) : results.lot.length === 0 ? (
              <Empty icon="parkingP" title="검색 결과가 없어요" desc={`'${q}'와 일치하는 공영주차장을 찾지 못했어요.`} />
            ) : (
              results.lot.map((l) => <LotCard key={l.id} lot={l} />)
            )}
          </div>
        )}
      </div>

      <PlaceSheet place={picked} onClose={() => setPicked(null)} />
    </div>
  );
}