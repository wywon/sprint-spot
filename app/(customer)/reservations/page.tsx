'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge, Segmented, Empty, Button } from '@/components/ui/primitives';
import { cx, fmtDateK } from '@/lib/format';
import { useApp } from '@/lib/store';
import { isLiveRes } from '@/lib/types';
import type { Reservation } from '@/lib/types';
import { rejectReasonOf } from '@/lib/tokens';

/**
 * 예약 탭 — 다가오는 예약 / 지난 예약
 * ─────────────────────────────────────────────────────────────
 * ★ 지난 예약 카드에는 식당사진 · 식당명 · 예약일시 · 인원만 보여준다.
 *   여기에 '영수증 인증 → 리뷰쓰기' 흐름이 붙는다.
 * ★ 어느 카드에도 테이블 번호는 나오지 않는다.
 */
export default function ReservationsPage() {
  const { reservations, getStore } = useApp();
  const [tab, setTab] = useState<'upcoming' | 'done'>('upcoming');

  /* [a7] isLiveRes 로 가른다. status !== 'upcoming' 으로 가르면
     승인 대기 중(pending)인 예약이 '지난 예약'으로 떨어진다. */
  const list = reservations.filter((r) =>
    tab === 'upcoming' ? isLiveRes(r.status) : !isLiveRes(r.status)
  );

  return (
    <div className="absolute inset-0 bg-ink-50">
      <div className="absolute top-0 left-0 right-0 z-20 bg-white border-b border-ink-200 pt-12 px-4 pb-3">
        <div className="text-[20px] font-extrabold text-ink-900 mb-3">예약</div>
        <Segmented
          full
          value={tab}
          onChange={setTab}
          options={[{ value: 'upcoming', label: '다가오는 예약' }, { value: 'done', label: '지난 예약' }]}
        />
      </div>

      <div className="absolute inset-0 pt-[136px] pb-[76px] overflow-y-auto no-sb">
        <div className="p-4 space-y-3">
          {list.length === 0 ? (
            <Empty
              icon="calendar"
              title={tab === 'upcoming' ? '예정된 예약이 없어요' : '지난 예약이 없어요'}
              desc={tab === 'upcoming' ? '가고 싶은 식당을 찾아 예약해 보세요' : undefined}
              action={
                tab === 'upcoming' ? (
                  <Link href="/explore"><Button variant="primary" icon="compass">주변 둘러보기</Button></Link>
                ) : undefined
              }
            />
          ) : (
            list.map((r) => <ResCard key={r.id} res={r} past={tab === 'done'} store={getStore(r.storeId)} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ResCard({
  res, past, store,
}: { res: Reservation; past: boolean; store: ReturnType<ReturnType<typeof useApp>['getStore']> }) {
  const canReview = past && res.exited && res.receipt && !res.reviewed;
  const needReceipt = past && res.exited && !res.receipt;

  return (
    <Link
      href={`/reservations/${res.id}`}
      className="block bg-white rounded-2xl border border-ink-200 shadow-card p-3.5 active:scale-[.99] transition-transform"
    >
      <div className="flex gap-3">
        <div className={cx('w-[68px] h-[68px] rounded-xl bg-gradient-to-br shrink-0', store?.hero ?? 'from-ink-200 to-ink-300')} />
        <div className="grow min-w-0">
          <div className="flex items-start gap-2">
            <span className="grow text-[15px] font-extrabold text-ink-900 truncate">{store?.name ?? '알 수 없는 매장'}</span>
            {/* [a7] 상태가 다섯 가지다. '확인 중'과 '확정'을 같은 배지로 보여 주면
                손님은 매장이 이미 받아 준 줄 안다 */}
            {res.status === 'pending' ? (
              <Badge tone="warn" size="sm" solid>확인 중</Badge>
            ) : res.status === 'rejected' ? (
              <Badge tone="busy" size="sm">예약 불가</Badge>
            ) : res.status === 'canceled' ? (
              <Badge tone="off" size="sm">취소됨</Badge>
            ) : past ? (
              <Badge tone="ink" size="sm">방문 완료</Badge>
            ) : (
              <Badge tone="brand" size="sm" solid>예약 확정</Badge>
            )}
          </div>
          <div className="text-[12.5px] font-bold text-ink-600 mt-1.5 tnum">
            {fmtDateK(res.date)} {res.time}
          </div>
          <div className="text-[11.5px] font-bold text-ink-400 mt-0.5 tnum">
            {res.party}명 · {res.seatType}
          </div>

          {res.status === 'pending' && (
            <div className="mt-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-warn-50 border border-warn-200 text-[11.5px] font-extrabold text-warn-700">
              <Icon n="clock" s={12} />
              매장에서 확인하고 있어요
            </div>
          )}
          {res.status === 'rejected' && (
            <div className="mt-2 text-[11.5px] font-bold text-busy-600 leading-snug">
              {rejectReasonOf(res.rejectReason).title}
            </div>
          )}

          {canReview && (
            <div className="mt-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-brand-50 border border-brand-200 text-[11.5px] font-extrabold text-brand-700">
              <Icon n="pencil" s={12} />
              리뷰 쓸 수 있어요
            </div>
          )}
          {needReceipt && (
            <div className="mt-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-ink-100 text-[11.5px] font-bold text-ink-500">
              <Icon n="receipt" s={12} />
              영수증을 올리면 리뷰를 쓸 수 있어요
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}