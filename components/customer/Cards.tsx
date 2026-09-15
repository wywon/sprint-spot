'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge, LiveStamp } from '@/components/ui/primitives';
import { cx, walkMin } from '@/lib/format';
import { levelOf, parkVerdict, lotStats, parkStats, seatStats } from '@/lib/status';
import type { NearbyPlace } from '@/lib/nearby';
import type { PartnerStore, PlainStore, PublicLot } from '@/lib/types';

/**
 * 목록 카드
 * ─────────────────────────────────────────────────────────────
 * ★ 정보 계층 규칙 (탐색 화면의 핵심)
 *   손님이 매장을 고를 때 가장 빨리 비교해야 하는 값은 딱 세 가지다.
 *     ① 좌석 여유  ② 주차 여유  ③ 거리
 *   그래서 카드에서 이 세 개를 같은 줄에 나란히 놓고, 나머지는 뒤로 뺀다.
 *   여기에 다른 정보를 추가하고 싶어지면, 대신 무엇을 뺄지 먼저 정할 것.
 *
 * [a8] 좌석·주차 알약을 썸네일 오른쪽 칸에서 꺼내 카드 폭 전체로 내렸다.
 *   ─────────────────────────────────────────────────────────
 *   폰 틀 안쪽은 370px 이고, 시트 여백(16×2)과 카드 안쪽 여백(14×2)을 빼면
 *   카드가 실제로 쓰는 폭은 310px 이다. 거기서 썸네일(68)과 간격(12)을 또 빼면
 *   오른쪽 칸은 230px 밖에 안 됐다. 그 안에 좌석 알약 + 주차 알약 + 여유도 라벨
 *   셋을 넣었으니 합이 240px 을 넘어서 flex 가 알약을 눌렀고 글자가 뭉개졌다.
 *   「주차 확인 불가」처럼 상태 문구가 길어질 때, 그러니까 그 정보가 제일 중요할 때
 *   제일 심하게 깨졌다.
 *
 *   고친 방법은 셋이다.
 *     1. 알약 두 개를 카드 폭 전체(310px)를 반씩 쓰는 그리드로 내렸다. 칸당 151px.
 *     2. 여유도 라벨(lv.label)을 지웠다. 옆 알약이 이미 숫자로 같은 말을 하고 있었다.
 *        「주차 3」 옆에 「여유」를 또 적는 건 한 사실을 두 번 적는 것이다.
 *     3. 알약 글자에 truncate 를 뒀다. 앱 설정에서 글자 크기를 '크게'로 올리면
 *        폭이 1.14배가 되는데, 그때 레이아웃이 깨지는 대신 잘리게 하는 안전장치다.
 */

/* ── 상태 알약 ───────────────────────────────────────────
   좌석과 주차가 같은 모양이어야 두 값을 나란히 비교할 수 있다.
   색 + 아이콘 + 글자 세 가지를 항상 함께 쓴다 (색만으로 상태를 전달하지 않는다). */

const PILL_TONE = {
  ok:   'bg-ok-50 text-ok-600 border-ok-200',
  busy: 'bg-busy-50 text-busy-600 border-busy-200',
  off:  'bg-off-50 text-off-600 border-off-200',
} as const;

const StatPill = ({
  icon, label, tone,
}: { icon: string; label: string; tone: keyof typeof PILL_TONE }) => (
  <span
    className={cx(
      'flex items-center gap-1.5 h-8 px-2.5 rounded-xl border text-[12px] font-extrabold min-w-0',
      PILL_TONE[tone],
    )}
  >
    <Icon n={icon} s={14} cls="shrink-0" />
    <span className="truncate tnum">{label}</span>
  </span>
);

/* ── 입점 식당 카드 ─────────────────────────────────────── */

export const StoreCard = ({ store, dist }: { store: PartnerStore; dist?: number }) => {
  const ss = seatStats(store);
  const ps = parkStats(store);
  const pv = parkVerdict(ps);

  /* 테이블이 0개인 매장은 available 도 0 이라 '좌석 대기'가 떠 버린다.
     자리가 찬 게 아니라 아직 배치도를 안 만든 매장이다.
     주차 쪽은 parkVerdict() 가 이미 같은 경우를 'unsure' 로 걸러 준다. */
  const seatUnknown = ss.total === 0;

  return (
    <Link
      href={`/stores/${store.id}`}
      className="block bg-white rounded-2xl border border-ink-200 shadow-card p-3.5 active:scale-[.99] transition-transform"
    >
      <div className="flex gap-3">
        <div className={cx('w-[68px] h-[68px] rounded-xl bg-gradient-to-br shrink-0', store.hero)} />
        <div className="grow min-w-0 flex flex-col justify-center">
          <div className="flex items-start gap-2">
            <span className="grow min-w-0 text-[15px] font-extrabold text-ink-900 truncate">
              {store.name}
            </span>
            <Badge tone="brand" size="sm" solid className="shrink-0">입점</Badge>
          </div>
          <div className="text-[11.5px] font-bold text-ink-500 mt-1 truncate">
            {store.cat}
            {dist != null && <> · {dist}m</>}
          </div>
          <div className="text-[11px] font-bold text-ink-400 mt-1 truncate">{store.open}</div>
        </div>
      </div>

      {/* ① 좌석 ② 주차 — 카드 폭 전체를 반씩 나눠 쓴다 */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <StatPill
          icon={seatUnknown ? 'question' : ss.available > 0 ? 'check' : 'people'}
          tone={seatUnknown ? 'off' : ss.available > 0 ? 'ok' : 'busy'}
          label={seatUnknown ? '좌석 확인 불가' : ss.available > 0 ? `좌석 ${ss.available}` : '좌석 대기'}
        />
        <StatPill
          icon={pv === 'unsure' ? 'sensor-off' : 'car'}
          tone={pv === 'unsure' ? 'off' : pv === 'full' ? 'busy' : 'ok'}
          label={pv === 'unsure' ? '주차 확인 불가' : pv === 'full' ? '주차 만차' : `주차 ${ps.available}`}
        />
      </div>
    </Link>
  );
};

/* ── 미입점 매장 카드 ──────────────────────────────────────
   [a8] 지어낸 PlainStore 대신 카카오 장소 검색 결과를 받는다.
   눌리는 카드다. 예전에는 눌러도 아무 일이 없어서 고장 난 것처럼 보였다. */

export const NearbyCard = ({
  place, onClick,
}: { place: NearbyPlace; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full bg-white rounded-2xl border border-ink-200 p-3.5 flex items-center gap-3 text-left active:scale-[.99] transition-transform"
  >
    <div className="w-11 h-11 rounded-xl bg-ink-100 grid place-items-center text-ink-400 shrink-0">
      <Icon n="fork" s={20} />
    </div>
    <div className="grow min-w-0">
      <div className="text-[14.5px] font-extrabold text-ink-800 truncate">{place.name}</div>
      <div className="text-[11.5px] font-bold text-ink-400 mt-0.5 truncate">
        {place.cat}
        {place.dist > 0 && <> · 도보 {walkMin(place.dist)}분</>}
      </div>
    </div>
    <span className="flex items-center gap-0.5 text-[11px] font-bold text-ink-400 shrink-0">
      기본 정보
      <Icon n="chevR" s={14} />
    </span>
  </button>
);

/* ── 공영주차장 카드 ───────────────────────────────────── */

export const LotCard = ({ lot, dist }: { lot: PublicLot; dist?: number }) => {
  const st = lotStats(lot);
  const lv = levelOf(st);

  /**
   * [a8] 잔여 대수를 모르는 주차장이 훨씬 많다.
   *   대전시 데이터에서 실시간 연동은 대상 30곳 중 6곳뿐이고, 나머지는 available 이 null 이다.
   *   예전 코드는 그 null 을 그대로 그려서 19px 숫자 자리가 통째로 비었다.
   *   배지는 「확인 불가」로 맞게 떴는데 숫자만 사라지니 고장 난 카드처럼 보였다.
   *
   *   숫자 자리에는 '—' 를 넣고, 시각 도장 자리에는 왜 모르는지를 적는다.
   *   잔여 대수를 모르는 주차장에 「실시간 · 방금 전」을 띄우는 게 더 나쁜 거짓말이다.
   */
  const live = st.available != null;

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
          <div className="text-[15px] font-extrabold text-ink-900 truncate">{lot.name}</div>
          <div className="text-[11.5px] font-bold text-ink-500 mt-0.5 truncate">
            {lot.gu} · {lot.type}
            {dist != null && <> · 도보 {walkMin(dist)}분</>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={cx('text-[19px] font-extrabold tnum leading-none shrink-0', lv.num)}>
              {live ? st.available : '—'}
            </span>
            <span className="text-[11.5px] font-bold text-ink-400 tnum shrink-0">/ {st.total}면</span>
            <span className="grow" />
            <Badge tone={lv.tone} size="sm" icon={lv.icon} className="shrink-0">{lv.label}</Badge>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-ink-500 truncate">{lot.fee}</span>
            {live ? (
              <LiveStamp updated={lot.updated} compact />
            ) : (
              <span className="text-[10.5px] font-bold text-ink-400 shrink-0">잔여 대수 미제공</span>
            )}
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