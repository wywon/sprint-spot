'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge, LiveStamp } from '@/components/ui/primitives';
import { cx, walkMin } from '@/lib/format';
import { levelOf, parkVerdict, lotStats, parkStats, seatStats } from '@/lib/status';
import type { PartnerStore, PlainStore, PublicLot } from '@/lib/types';

/**
 * 목록 카드
 * ─────────────────────────────────────────────────────────────
 * ★ 정보 계층 규칙 (탐색 화면의 핵심)
 *   손님이 매장을 고를 때 가장 빨리 비교해야 하는 값은 딱 세 가지다.
 *     ① 좌석 여유  ② 주차 여유  ③ 거리
 *   그래서 카드에서 이 세 개를 같은 줄에 나란히 놓고, 나머지는 뒤로 뺀다.
 *   여기에 다른 정보를 추가하고 싶어지면, 대신 무엇을 뺄지 먼저 정할 것.
 */

/* ── 입점 식당 카드 ─────────────────────────────────────── */

export const StoreCard = ({ store, dist }: { store: PartnerStore; dist?: number }) => {
  const ss = seatStats(store);
  const ps = parkStats(store);
  const lv = levelOf(ps);
  const pv = parkVerdict(ps);

  return (
    <Link
      href={`/stores/${store.id}`}
      className="block bg-white rounded-2xl border border-ink-200 shadow-card p-3.5 active:scale-[.99] transition-transform"
    >
      <div className="flex gap-3">
        <div className={cx('w-[68px] h-[68px] rounded-xl bg-gradient-to-br shrink-0', store.hero)} />
        <div className="grow min-w-0">
          <div className="flex items-start gap-2">
            <div className="grow min-w-0">
              <div className="text-[15px] font-extrabold text-ink-900 truncate">{store.name}</div>
              <div className="text-[11.5px] font-bold text-ink-500 mt-0.5 truncate">
                {store.cat}
                {dist != null && <> · {dist}m</>}
              </div>
            </div>
            <Badge tone="brand" size="sm" solid>입점</Badge>
          </div>

          {/* ① 좌석 ② 주차 — 한 줄에서 비교 */}
          <div className="flex items-center gap-2 mt-2.5">
            <span
              className={cx(
                'inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11.5px] font-extrabold border',
                ss.available > 0 ? 'bg-ok-50 text-ok-600 border-ok-200' : 'bg-busy-50 text-busy-600 border-busy-200'
              )}
            >
              <Icon n={ss.available > 0 ? 'check' : 'people'} s={13} />
              {ss.available > 0 ? `좌석 ${ss.available}` : '좌석 대기'}
            </span>
            <span
              className={cx(
                'inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11.5px] font-extrabold border',
                pv === 'unsure' ? 'bg-off-50 text-off-600 border-off-200'
                  : pv === 'full' ? 'bg-busy-50 text-busy-600 border-busy-200'
                  : 'bg-ok-50 text-ok-600 border-ok-200'
              )}
            >
              <Icon n={pv === 'unsure' ? 'sensor-off' : 'car'} s={13} />
              {pv === 'unsure' ? '주차 확인 불가' : pv === 'full' ? '만차' : `주차 ${ps.available}`}
            </span>
            <span className="grow" />
            <span className="text-[11px] font-extrabold text-ink-400">{lv.label}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

/* ── 미입점 식당 카드 — 상호명과 업종만 ───────────────── */

export const PlainStoreCard = ({ store }: { store: PlainStore }) => (
  <div className="bg-white rounded-2xl border border-ink-200 p-3.5 flex items-center gap-3 opacity-90">
    <div className="w-11 h-11 rounded-xl bg-ink-100 grid place-items-center text-ink-400 shrink-0">
      <Icon n="fork" s={20} />
    </div>
    <div className="grow min-w-0">
      <div className="text-[14.5px] font-extrabold text-ink-800 truncate">{store.name}</div>
      <div className="text-[11.5px] font-bold text-ink-400 mt-0.5">{store.cat}</div>
    </div>
    <span className="text-[11px] font-bold text-ink-400 shrink-0">정보 없음</span>
  </div>
);

/* ── 공영주차장 카드 ───────────────────────────────────── */

export const LotCard = ({ lot, dist }: { lot: PublicLot; dist?: number }) => {
  const st = lotStats(lot);
  const lv = levelOf(st);

  return (
    <Link
      href={`/lots/${lot.id}`}
      className="block bg-white rounded-2xl border border-ink-200 shadow-card p-3.5 active:scale-[.99] transition-transform"
    >
      <div className="flex items-start gap-3">
        <div className={cx('w-11 h-11 rounded-xl grid place-items-center shrink-0', lv.cls)}>
          <Icon n="parkingP" s={22} />
        </div>
        <div className="grow min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-extrabold text-ink-900 truncate">{lot.name}</span>
          </div>
          <div className="text-[11.5px] font-bold text-ink-500 mt-0.5">
            {lot.gu} · {lot.type}
            {dist != null && <> · 도보 {walkMin(dist)}분</>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={cx('text-[19px] font-extrabold tnum leading-none', lv.num)}>
              {st.available}
            </span>
            <span className="text-[11.5px] font-bold text-ink-400 tnum">/ {st.total}면</span>
            <span className="grow" />
            <Badge tone={lv.tone} size="sm" icon={lv.icon}>{lv.label}</Badge>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-ink-500 truncate">{lot.fee}</span>
            <LiveStamp updated={lot.updated} compact />
          </div>
        </div>
      </div>
    </Link>
  );
};

/* ── 추천 식당 슬라이드 타일 ───────────────────────────── */

export const FoodTile = ({
  store, distM,
}: { store: PartnerStore | PlainStore; distM?: number }) => (
  <Link
    href={store.partner ? `/stores/${store.id}` : `/explore?focus=${store.id}`}
    className="shrink-0 w-[164px] bg-white rounded-2xl border border-ink-200 shadow-card overflow-hidden active:scale-[.98] transition-transform"
  >
    <div className={cx('h-[86px] bg-gradient-to-br', store.partner ? (store as PartnerStore).hero : 'from-ink-200 to-ink-300')} />
    <div className="p-3">
      <div className="text-[13.5px] font-extrabold text-ink-900 truncate">{store.name}</div>
      <div className="text-[11px] font-bold text-ink-500 mt-0.5 truncate">
        {store.cat}
        {distM != null && <> · 도보 {walkMin(distM)}분</>}
      </div>
      {store.partner ? (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-extrabold text-ok-600">
          <Icon n="check" s={12} />
          예약 가능
        </div>
      ) : (
        <div className="mt-2 text-[11px] font-bold text-ink-400">정보 없음</div>
      )}
    </div>
  </Link>
);