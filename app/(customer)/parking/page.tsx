'use client';

import React, { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/primitives';
import { LotCard, StoreCard } from '@/components/customer/Cards';
import { distFrom, parkStats, parkVerdict } from '@/lib/status';
import { MY_LOCATION } from '@/components/customer/MapCanvas';
import { useApp } from '@/lib/store';

/**
 * 주차 탭
 * ─────────────────────────────────────────────────────────────
 * ★ 이 탭은 목록이 곧 내용이므로 탭바를 유지한다.
 *   (다른 화면들은 한 뎁스 들어가면 탭바를 숨기지만 여기는 예외다.)
 *
 * ★ 정렬 기본값은 '여유순'이다.
 *   이 탭에 들어온 사람의 질문은 "지금 어디에 댈 수 있나"이므로,
 *   가까운 순보다 자리가 있는 순이 먼저다. 가까운데 만차면 소용이 없다.
 */
export default function ParkingTabPage() {
  const { lots, stores } = useApp();
  const [sort, setSort] = useState<'free' | 'near'>('free');

  /**
   * [a8] '가까운 순' 이 실제 거리를 본다.
   * ───────────────────────────────────────────────────────────
   * 예전에는 a.id.localeCompare(b.id) 였다. lot-01, lot-02 … 순서일 뿐
   * 거리와 아무 상관이 없었는데, 누르면 순서가 바뀌니 동작하는 것처럼 보였다.
   * 그게 더 나쁘다 — 손님은 맨 위에 뜬 곳이 가장 가깝다고 믿고 그리로 간다.
   *
   * 기준점은 지도에 찍히는 '내 위치'(MY_LOCATION)다. 실제 GPS 가 아니라
   * 시연용 고정 좌표이므로, 위치 권한이 붙으면 이 한 줄만 바꾸면 된다.
   *
   * ★ 거리를 모르는 곳은 맨 뒤로 보낸다
   *   좌표가 없거나 퍼센트 값이 남아 있는 데이터가 섞일 수 있다.
   *   그때 distFrom 은 null 을 준다. 이걸 0 으로 바꾸면 맨 앞으로 올라와
   *   가장 가까운 곳인 척하게 된다. 모르는 것은 모르는 자리에 둔다.
   */
  const NOPE = Number.POSITIVE_INFINITY;

  const sortedLots = useMemo(() => {
    return lots
      .map((l) => ({ l, dist: distFrom(MY_LOCATION, l) }))
      .sort((a, b) =>
        sort === 'free'
          ? (b.l.available ?? -1) - (a.l.available ?? -1)
          : (a.dist ?? NOPE) - (b.dist ?? NOPE)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, sort]);

  const sortedStores = useMemo(() => {
    return stores
      .map((s) => ({ s, dist: distFrom(MY_LOCATION, s), ps: parkStats(s) }))
      .sort((a, b) =>
        sort === 'free'
          ? (b.ps.available ?? -1) - (a.ps.available ?? -1)
          : (a.dist ?? NOPE) - (b.dist ?? NOPE)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, sort]);

  /**
   * [a8] 상단 요약이 세 가지를 구분한다.
   *   예전에는 공영주차장만 세고(식당 주차장은 빠져 있었다),
   *   잔여 대수를 모르는 24곳을 (l.available ?? 0) 으로 0자리 취급했다.
   *   합계 숫자는 같아 보여도 '모른다' 와 '없다' 를 같게 쓰는 코드다.
   *   이 프로젝트가 가장 조심하는 지점이라 세 칸으로 나눠서 말한다.
   */
  const summary = useMemo(() => {
    let free = 0, full = 0, unsure = 0;

    for (const l of lots) {
      if (l.available == null) { unsure++; continue; }
      free += l.available;
      if (l.available === 0) full++;
    }
    for (const s of stores) {
      const ps = parkStats(s);
      const v = parkVerdict(ps);
      /* available 이 null 인 경우는 parkVerdict 이 이미 'unsure' 로 거르지만,
         타입으로는 드러나지 않아 여기서 한 번 더 본다 */
      if (v === 'unsure' || ps.available == null) { unsure++; continue; }
      free += ps.available;
      if (v === 'full') full++;
    }
    return { free, full, unsure };
  }, [lots, stores]);

  return (
    <div className="absolute inset-0 bg-ink-50">
      <div className="absolute top-0 left-0 right-0 z-20 bg-white border-b border-ink-200 pt-12 px-4 pb-3">
        <div className="text-[20px] font-extrabold text-ink-900">주변 주차</div>
        <div className="text-[12.5px] font-bold text-ink-500 mt-1">
          지금 <b className="text-ok-600 tnum">{summary.free}자리</b> 비어 있어요
          {summary.full > 0 && <> · 만차 {summary.full}곳</>}
          {summary.unsure > 0 && <> · 확인 불가 {summary.unsure}곳</>}
        </div>
        <div className="mt-3">
          <Segmented
            size="sm"
            value={sort}
            onChange={setSort}
            options={[{ value: 'free', label: '여유순' }, { value: 'near', label: '가까운 순' }]}
          />
        </div>
      </div>

      <div className="absolute inset-0 pt-[142px] pb-[76px] overflow-y-auto no-sb">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-1.5 px-1">
            <Icon n="parkingP" s={15} cls="text-ink-400" />
            <span className="text-[12.5px] font-extrabold text-ink-600">공영주차장</span>
            <span className="text-[11.5px] font-bold text-ink-400 tnum">{lots.length}</span>
          </div>
          {sortedLots.map(({ l, dist }) => (
            <LotCard key={l.id} lot={l} dist={dist ?? undefined} />
          ))}

          <div className="flex items-center gap-1.5 px-1 pt-3">
            <Icon n="fork" s={15} cls="text-ink-400" />
            <span className="text-[12.5px] font-extrabold text-ink-600">주차장이 있는 식당</span>
            <span className="text-[11.5px] font-bold text-ink-400 tnum">{stores.length}</span>
          </div>
          {sortedStores.map(({ s, dist }) => (
            <StoreCard key={s.id} store={s} dist={dist ?? undefined} />
          ))}

          <div className="pt-2 pb-4 px-1 text-[11.5px] font-medium text-ink-400 leading-relaxed">
            공영주차장은 지자체에서 제공하는 잔여 대수 정보를,
            식당 주차장은 매장에 설치된 감지 장치의 정보를 사용해요.
          </div>
        </div>
      </div>
    </div>
  );
}