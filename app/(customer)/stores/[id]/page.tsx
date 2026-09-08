'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, Gauge, LiveStamp } from '@/components/ui/primitives';
import { BottomSheet, NavSheet } from '@/components/ui/overlays';
import { SubHeader, StickyCta } from '@/components/customer/Shell';
import { cx, won } from '@/lib/format';
import { levelOf, parkStats, seatStats } from '@/lib/status';
import { MENUS } from '@/lib/mock';
import { useApp } from '@/lib/store';

/**
 * 식당 상세
 * ─────────────────────────────────────────────────────────────
 * ★ 5초 안에 네 가지를 판단할 수 있어야 한다.
 *   ① 나에게 맞는 집인가  ② 지금 자리 있나  ③ 예약 되나  ④ 차 댈 데 있나
 *   그래서 사진 바로 아래에 좌석·주차 두 버튼을 나란히 놓는다. 그다음이 정보다.
 *
 * ★ 하단 CTA 는 '테이블 예약하기' 하나뿐이다.
 *   주차 위치 버튼을 같이 두면 주 행동이 흐려진다. 주차는 위의 카드에서 본다.
 */
export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getStore, reviews, favorites, toggleFav } = useApp();
  const [parkOpen, setParkOpen] = useState(false);
  const [nav, setNav] = useState(false);

  const store = getStore(id);
  if (!store) notFound();

  const ss = seatStats(store);
  const ps = parkStats(store);
  const lv = levelOf(ps);
  const list = reviews.filter((r) => r.storeId === store.id);
  const fav = favorites.includes(store.id);

  return (
    <div className="absolute inset-0 bg-ink-50">
      <div className="absolute inset-0 pb-[104px] overflow-y-auto no-sb">
        {/* 히어로 */}
        <div className={cx('h-[210px] bg-gradient-to-br relative', store.hero)}>
          <SubHeader
            transparent
            right={
              <button
                onClick={() => toggleFav(store.id)}
                aria-label="즐겨찾기"
                className="w-10 h-10 rounded-full bg-white/90 shadow-card grid place-items-center text-warn-400 shrink-0"
              >
                <Icon n={fav ? 'star' : 'starO'} s={19} />
              </button>
            }
          />
        </div>

        <div className="-mt-6 relative z-10 px-4 pb-4 space-y-3">
          {/* 이름 · 평점 */}
          <Card className="p-4">
            <div className="flex items-start gap-2">
              <div className="grow min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[20px] font-extrabold text-ink-900">{store.name}</span>
                  <Badge tone="brand" size="sm" solid>입점</Badge>
                </div>
                <div className="text-[12.5px] font-bold text-ink-500 mt-1">{store.cat}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-warn-400">
                  <Icon n="star" s={15} />
                  <span className="text-[15px] font-extrabold text-ink-900 tnum">{store.rating}</span>
                </div>
                <div className="text-[11px] font-bold text-ink-400 tnum mt-0.5">리뷰 {won(store.reviews)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {store.tags.map((t) => <Badge key={t} tone="ink" size="sm">{t}</Badge>)}
            </div>
          </Card>

          {/* ★ 실시간 상태 두 버튼 — 이 화면의 핵심 */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* 좌석 */}
            <Link
              href={`/stores/${store.id}/seats`}
              className={cx(
                'rounded-2xl border-2 bg-white p-3.5 text-left active:scale-[.98] transition-transform',
                ss.available > 0 ? 'border-ok-300' : 'border-busy-200'
              )}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon n={ss.available > 0 ? 'check' : 'people'} s={15} cls={ss.available > 0 ? 'text-ok-500' : 'text-busy-500'} />
                <span className={cx('text-[12px] font-extrabold', ss.available > 0 ? 'text-ok-600' : 'text-busy-600')}>
                  {ss.available > 0 ? '좌석 여유' : '자리 없음'}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-extrabold text-ink-900 leading-none tnum">{ss.available}</span>
                <span className="text-[12px] font-bold text-ink-400 tnum">/ {ss.total}</span>
              </div>
              <div className="text-[11px] font-bold text-ink-500 mt-1.5">지금 이용 가능한 자리</div>
              <div className="flex items-center gap-1 mt-2 text-[11.5px] font-extrabold text-brand-700">
                좌석 현황 보기 <Icon n="chevR" s={13} />
              </div>
            </Link>

            {/* 주차 */}
            <button
              onClick={() => setParkOpen(true)}
              className={cx(
                'rounded-2xl border-2 bg-white p-3.5 text-left active:scale-[.98] transition-transform',
                ps.offline ? 'border-off-200' : ps.available === 0 ? 'border-busy-200' : 'border-ok-300'
              )}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon n={ps.offline ? 'sensor-off' : 'car'} s={15} cls={ps.offline ? 'text-off-500' : lv.num} />
                <span className={cx('text-[12px] font-extrabold', ps.offline ? 'text-off-600' : lv.num)}>
                  {ps.offline ? '확인 불가' : lv.label}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-extrabold text-ink-900 leading-none tnum">
                  {ps.offline ? '—' : ps.available}
                </span>
                <span className="text-[12px] font-bold text-ink-400 tnum">/ {ps.total}</span>
              </div>
              <div className="text-[11px] font-bold text-ink-500 mt-1.5">
                {ps.offline ? '잠시 후 다시 확인해 주세요' : '지금 주차 가능한 자리'}
              </div>
              <div className="flex items-center gap-1 mt-2 text-[11.5px] font-extrabold text-brand-700">
                주차 현황 보기 <Icon n="chevR" s={13} />
              </div>
            </button>
          </div>

          {/* 매장 정보 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">매장 정보</div>
            {[
              ['pin', store.addr],
              ['clock', store.open],
              ['won', store.price],
              ['phone', store.tel],
              ['parkingP', store.parking.fee],
            ].map(([i, v]) => (
              <div key={v} className="flex items-start gap-2.5 py-2.5 border-b border-ink-100 last:border-0">
                <Icon n={i} s={15} cls="text-ink-400 shrink-0 mt-px" />
                <span className="text-[12.5px] font-bold text-ink-700 leading-relaxed">{v}</span>
              </div>
            ))}
          </Card>

          {/* 대표 메뉴 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">대표 메뉴</div>
            <div className="space-y-2.5">
              {MENUS.slice(0, 4).map(([name, price]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className={cx('w-14 h-14 rounded-xl bg-gradient-to-br shrink-0', store.hero)} />
                  <div className="grow min-w-0">
                    <div className="text-[13.5px] font-extrabold text-ink-900 truncate">{name}</div>
                    <div className="text-[12.5px] font-bold text-ink-500 mt-0.5 tnum">{price}원</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 리뷰 */}
          <Link href={`/stores/${store.id}/reviews`} className="block">
            <Card className="p-4 active:scale-[.99] transition-transform">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-extrabold text-ink-900">리뷰</span>
                  <span className="text-[12px] font-bold text-ink-400 tnum">{won(store.reviews)}</span>
                </div>
                <Icon n="chevR" s={16} cls="text-ink-300" />
              </div>
              {list.slice(0, 1).map((r) => (
                <div key={r.id}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[12.5px] font-extrabold text-ink-800">{r.name}</span>
                    <span className="flex text-warn-400">
                      {Array.from({ length: r.rating }).map((_, i) => <Icon key={i} n="star" s={11} />)}
                    </span>
                    <span className="text-[11px] font-bold text-ink-400">{r.date}</span>
                  </div>
                  <div className="text-[12.5px] font-medium text-ink-600 leading-relaxed line-clamp-2">{r.text}</div>
                </div>
              ))}
              <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5 text-[11.5px] font-medium text-ink-500 leading-relaxed">
                리뷰는 <b className="text-ink-700">방문하고 영수증을 인증한 손님</b>만 쓸 수 있어요
              </div>
            </Card>
          </Link>
        </div>
      </div>

      <StickyCta>
        <Button variant="primary" size="lg" full icon="calendar" onClick={() => router.push(`/reserve/${store.id}`)}>
          테이블 예약하기
        </Button>
      </StickyCta>

      {/* 주차 현황 바텀시트 */}
      <BottomSheet
        open={parkOpen}
        onClose={() => setParkOpen(false)}
        title="주차 현황"
        sub={`${store.name} 주차장`}
        right={<LiveStamp updated={store.parking.updated} offline={ps.offline} />}
        footer={
          <Button variant="primary" size="lg" full icon="nav" onClick={() => { setParkOpen(false); setNav(true); }}>
            주차장 길안내
          </Button>
        }
      >
        <div className="pb-2">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              ['전체', ps.total, 'text-ink-900'],
              ['주차 가능', ps.offline ? '—' : ps.available, 'text-ok-500'],
              ['주차 중', ps.offline ? '—' : ps.occupied, 'text-busy-500'],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl bg-ink-50 py-3 text-center">
                <div className={cx('text-[22px] font-extrabold tnum leading-none', c as string)}>{v as React.ReactNode}</div>
                <div className="text-[11px] font-bold text-ink-500 mt-1.5">{l as string}</div>
              </div>
            ))}
          </div>

          {!ps.offline && (
            <Gauge
              used={ps.occupied ?? 0}
              total={ps.total}
              tone={lv.tone === 'ok' ? 'ok' : lv.tone === 'busy' ? 'busy' : 'warn'}
              label="주차장 이용률"
              big
            />
          )}

          {/* 실시간 확인 가능 여부 안내 — 기술 용어는 쓰지 않는다 */}
          <div
            className={cx(
              'mt-4 rounded-xl border px-3.5 py-3 flex items-start gap-2.5',
              ps.offline ? 'bg-off-50 border-off-200' : (ps.unknown ?? 0) > 0 ? 'bg-unk-50 border-unk-200' : 'bg-ok-50 border-ok-200'
            )}
          >
            <Icon
              n={ps.offline ? 'sensor-off' : (ps.unknown ?? 0) > 0 ? 'question' : 'check'}
              s={16}
              cls={cx('shrink-0 mt-px', ps.offline ? 'text-off-500' : (ps.unknown ?? 0) > 0 ? 'text-unk-500' : 'text-ok-500')}
            />
            <div>
              <div className={cx('text-[12.5px] font-extrabold', ps.offline ? 'text-off-600' : (ps.unknown ?? 0) > 0 ? 'text-unk-600' : 'text-ok-600')}>
                {ps.offline
                  ? '주차 정보를 실시간으로 확인할 수 없어요'
                  : (ps.unknown ?? 0) > 0
                  ? `${ps.unknown}자리는 확인 중이에요`
                  : '실시간으로 확인되고 있어요'}
              </div>
              <div className="text-[11.5px] font-medium text-ink-500 mt-0.5 leading-relaxed">
                {ps.offline
                  ? '매장에 전화로 문의하시거나, 근처 공영주차장을 확인해 주세요.'
                  : (ps.unknown ?? 0) > 0
                  ? '확인 중인 자리는 이용 가능 수에 넣지 않았어요.'
                  : '매장 주차면마다 설치된 감지 장치로 확인하고 있어요.'}
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>

      <NavSheet open={nav} onClose={() => setNav(false)} target={`${store.name} 주차장`} />
    </div>
  );
}
