'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/primitives';
import { LotCard, StoreCard } from '@/components/customer/Cards';
import { levelOf, lotStats, parkStats } from '@/lib/status';
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

  const sortedLots = [...lots].sort((a, b) =>
          sort === 'free' ? (b.available ?? -1) - (a.available ?? -1) : a.id.localeCompare(b.id)
  );

  const sortedStores = [...stores].sort((a, b) => {
    const av = parkStats(a).available ?? -1;
    const bv = parkStats(b).available ?? -1;
    return sort === 'free' ? bv - av : a.id.localeCompare(b.id);
  });

  const totalFree = lots.reduce((a, l) => a + (l.available ?? 0), 0);
  const fullCount = lots.filter((l) => l.available === 0).length;

  return (
    <div className="absolute inset-0 bg-ink-50">
      <div className="absolute top-0 left-0 right-0 z-20 bg-white border-b border-ink-200 pt-12 px-4 pb-3">
        <div className="text-[20px] font-extrabold text-ink-900">주변 주차</div>
        <div className="text-[12.5px] font-bold text-ink-500 mt-1">
          지금 <b className="text-ok-600 tnum">{totalFree}자리</b> 비어 있어요
          {fullCount > 0 && <> · 만차 {fullCount}곳</>}
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
          {sortedLots.map((l) => {
            const lv = levelOf(lotStats(l));
            return <LotCard key={l.id} lot={l} dist={lv.key === 'full' ? undefined : undefined} />;
          })}

          <div className="flex items-center gap-1.5 px-1 pt-3">
            <Icon n="fork" s={15} cls="text-ink-400" />
            <span className="text-[12.5px] font-extrabold text-ink-600">주차장이 있는 식당</span>
            <span className="text-[11.5px] font-bold text-ink-400 tnum">{stores.length}</span>
          </div>
          {sortedStores.map((s) => <StoreCard key={s.id} store={s} />)}

          <div className="pt-2 pb-4 px-1 text-[11.5px] font-medium text-ink-400 leading-relaxed">
            공영주차장은 지자체에서 제공하는 잔여 대수 정보를,
            식당 주차장은 매장에 설치된 감지 장치의 정보를 사용해요.
          </div>
        </div>
      </div>
    </div>
  );
}
