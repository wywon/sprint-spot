'use client';

import React, { use, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, Segmented, LiveStamp } from '@/components/ui/primitives';
import { ConfirmModal, NavSheet } from '@/components/ui/overlays';
import { SubHeader, StickyCta } from '@/components/customer/Shell';
import { cx, fmtDateK } from '@/lib/format';
import { levelOf, parkingOptions, type ParkingOption } from '@/lib/status';
import { useApp } from '@/lib/store';
import ReceiptUpload from './ReceiptUpload';

/**
 * 예약 상세
 * ─────────────────────────────────────────────────────────────
 * 다가오는 예약 : 상태 → 예약정보 → QR → 예약자 정보 → 주차 현황 → 길안내
 * 지난 예약     : QR 없음. 영수증 인증 → 리뷰쓰기
 *
 * ★ 주차 현황 섹션이 이 화면의 핵심이다.
 *   예약을 잡은 시점과 방문하는 시점 사이의 몇 시간을 이 서비스가 책임진다는 뜻이고,
 *   경쟁 앱들이 하지 않는 일이다.
 *   매장 주차장과 주변 공영주차장을 한 목록에 놓고 정렬만 바꿔 비교하게 한다.
 *
 * ★ 여기에도 테이블 번호는 없다.
 */
export default function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getRes, getStore, lots, cancelReservation, uploadReceipt, pushToast } = useApp();

  const [sort, setSort] = useState<'ai' | 'free' | 'near'>('ai');
  const [picked, setPicked] = useState<string | null>(null);
  const [nav, setNav] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  

  const res = getRes(id);
  
  if (!res) notFound();
  const store = getStore(res.storeId);
  const past = res.status !== 'upcoming';

  const options = parkingOptions(store ?? null, lots);
  const sorted = [...options].sort((a, b) => {
    if (sort === 'free') return (b.available ?? -1) - (a.available ?? -1);
    if (sort === 'near') return a.dist - b.dist;
    // AI 추천 = 여유도와 거리를 함께 본다. 만차는 무조건 뒤로 보낸다.
    const score = (o: ParkingOption) =>
      (o.available == null ? -100 : o.available === 0 ? -50 : (o.available / o.total) * 100) - o.walk * 4;
    return score(b) - score(a);
  });

  const pickedOpt = sorted.find((o) => `${o.kind}-${o.id}` === picked);
  const canReview = past && res.exited && res.receipt && !res.reviewed;

  return (
    <div className="absolute inset-0 bg-ink-50">
      <SubHeader title={past ? '지난 예약' : '예약 상세'} sub={store?.name} />

      <div className="absolute inset-0 pt-[92px] pb-[104px] overflow-y-auto no-sb">
        <div className="p-4 space-y-3">
          {/* 상태 */}
          <Card
            className={cx('p-4 border-2', res.status === 'canceled' ? 'border-off-200' : past ? 'border-ink-200' : 'border-brand-300')}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cx(
                  'w-11 h-11 rounded-xl grid place-items-center text-white shrink-0',
                  res.status === 'canceled' ? 'bg-off-400' : past ? 'bg-ink-400' : 'bg-brand-600'
                )}
              >
                <Icon n={res.status === 'canceled' ? 'x' : past ? 'check' : 'calendar'} s={21} />
              </span>
              <div>
                <div className="text-[16px] font-extrabold text-ink-900">
                  {res.status === 'canceled' ? '취소된 예약이에요' : past ? '방문을 마친 예약이에요' : '예약이 확정되었어요'}
                </div>
                <div className="text-[12px] font-bold text-ink-500 mt-0.5">
                  {past ? '이용해 주셔서 감사합니다' : '방문 2시간 전까지 변경·취소할 수 있어요'}
                </div>
              </div>
            </div>
          </Card>

          {/* 예약 정보 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">예약 정보</div>
            {[
              ['calendar', '일시', `${fmtDateK(res.date)} ${res.time}`],
              ['pin', '장소', store?.name ?? '-'],
              ['people', '인원', `${res.party}명`],
              ['bookmark', '좌석', res.seatType],
            ].map(([i, l, v]) => (
              <div key={l} className="flex items-center gap-2.5 py-2.5 border-b border-ink-100 last:border-0">
                <Icon n={i} s={15} cls="text-ink-400 shrink-0" />
                <span className="text-[12px] font-extrabold text-ink-500 w-[38px] shrink-0">{l}</span>
                <span className="text-[13px] font-bold text-ink-900">{v}</span>
              </div>
            ))}

            {/* 입장 확인 QR — 지난 예약에는 표시하지 않는다 */}
            {!past && res.status === 'upcoming' && (
              <div className="mt-4 pt-4 border-t border-ink-100 flex flex-col items-center">
                <div className="w-[124px] h-[124px] rounded-xl bg-ink-900 grid place-items-center">
                  <div className="grid grid-cols-7 gap-[3px] p-2">
                    {Array.from({ length: 49 }).map((_, i) => (
                      <span
                        key={i}
                        className={cx('w-2.5 h-2.5 rounded-[2px]', (i * 7 + (i % 5)) % 3 === 0 ? 'bg-white' : 'bg-ink-900')}
                      />
                    ))}
                  </div>
                </div>
                <div className="text-[11.5px] font-bold text-ink-500 mt-2.5">매장에서 이 화면을 보여주세요</div>
              </div>
            )}
          </Card>

          {/* 예약자 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">예약자</div>
            {[
              ['user', '성함', res.name],
              ['phone', '연락처', res.phone],
              ['pencil', '요청사항', res.memo || '없음'],
            ].map(([i, l, v]) => (
              <div key={l} className="flex items-start gap-2.5 py-2.5 border-b border-ink-100 last:border-0">
                <Icon n={i} s={15} cls="text-ink-400 shrink-0 mt-px" />
                <span className="text-[12px] font-extrabold text-ink-500 w-[54px] shrink-0">{l}</span>
                <span className="text-[13px] font-bold text-ink-900 leading-relaxed">{v}</span>
              </div>
            ))}
          </Card>

          {/* ── 다가오는 예약: 출발 알림 + 주차 현황 ── */}
          {!past && res.status === 'upcoming' && (
            <>
              <Card className="p-4 border-2 border-brand-200 bg-brand-50">
                <div className="flex items-start gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-brand-600 text-white grid place-items-center shrink-0">
                    <Icon n="bell" s={18} />
                  </span>
                  <div>
                    <div className="text-[13px] font-extrabold text-brand-800">
                      11시 52분에 출발하시면 딱 맞아요
                    </div>
                    <div className="text-[11.5px] font-medium text-brand-800/80 mt-1 leading-relaxed">
                      차로 약 18분 걸려요. 출발하실 시간이 되면 알림을 보내드리고,
                      그때 주차 여유가 있는 곳을 함께 추천해 드릴게요.
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-extrabold text-ink-900">주차 현황</span>
                  {store && <LiveStamp updated={store.parking.updated} offline={store.sensor === 'offline'} compact />}
                </div>
                <div className="text-[11.5px] font-bold text-ink-500 mb-3">
                  매장 주차장과 근처 공영주차장을 함께 보여드려요
                </div>

                <Segmented
                  size="sm"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'ai', label: 'AI 추천순' },
                    { value: 'free', label: '여유순' },
                    { value: 'near', label: '가까운 순' },
                  ]}
                />

                <div className="space-y-2 mt-3">
                  {sorted.map((o) => {
                    const key = `${o.kind}-${o.id}`;
                    const lv = levelOf({ total: o.total, available: o.available, unknown: o.unknown });
                    const on = picked === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setPicked(on ? null : key)}
                        className={cx(
                          'w-full rounded-xl border-2 p-3 text-left transition-all active:scale-[.99]',
                          on ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cx('w-9 h-9 rounded-lg grid place-items-center shrink-0', lv.cls)}>
                            <Icon n="parkingP" s={18} />
                          </span>
                          <div className="grow min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13.5px] font-extrabold text-ink-900 truncate">{o.name}</span>
                              <Badge tone={o.kind === 'store' ? 'brand' : 'ink'} size="sm">{o.badge}</Badge>
                            </div>
                            <div className="text-[11px] font-bold text-ink-500 mt-0.5">
                              {o.kind === 'store' ? '바로 앞' : `도보 ${o.walk}분`} · {o.fee}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cx('text-[17px] font-extrabold tnum leading-none', lv.num)}>
                              {o.available == null ? '—' : o.available}
                            </div>
                            <div className="text-[10px] font-bold text-ink-400 tnum mt-0.5">/ {o.total}면</div>
                          </div>
                          {on && <Icon n="check" s={18} cls="text-brand-600 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </>
          )}

          {/* ── 지난 예약: 영수증 인증 ── */}
          {res.status === 'done' && (
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">영수증 인증</div>
            <ReceiptUpload
              reservationId={res.id}
              phone={res.phone}
              initialReceipt={!!res.receipt}
              onUploaded={() => {
                uploadReceipt(res.id);
                pushToast({
                  title: '영수증 인증이 완료되었어요',
                  desc: '이제 리뷰를 쓰실 수 있어요',
                  tone: 'ok',
                  icon: 'check',
                });
              }}
            />
          </Card>
        )}
        </div>
      </div>

      <StickyCta>
        {past ? (
          res.reviewed ? (
            <Button variant="outline" size="lg" full disabled>리뷰를 작성했어요</Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              full
              icon="pencil"
              disabled={!canReview}
              onClick={() => router.push(`/reservations/${res.id}/review`)}
            >
              {canReview ? '리뷰 쓰기' : !res.receipt ? '영수증을 먼저 인증해 주세요' : '방문 확인이 끝나면 리뷰를 쓸 수 있어요'}
            </Button>
          )
        ) : res.status === 'canceled' ? (
          <Button variant="outline" size="lg" full disabled>취소된 예약이에요</Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="shrink-0 px-5" onClick={() => setAskCancel(true)}>
              예약 취소
            </Button>
            <Button
              variant="primary"
              size="lg"
              full
              icon="nav"
              disabled={!pickedOpt}
              onClick={() => setNav(true)}
            >
              {pickedOpt ? `${pickedOpt.name} 길안내` : '주차장을 선택해 주세요'}
            </Button>
          </div>
        )}
      </StickyCta>

      <NavSheet open={nav} onClose={() => setNav(false)} target={pickedOpt?.name ?? ''} lat={pickedOpt?.lat} lng={pickedOpt?.lng} />

      <ConfirmModal
        open={askCancel}
        onClose={() => setAskCancel(false)}
        title="예약을 취소할까요?"
        sub="취소 후에는 같은 시간대를 다시 잡지 못할 수 있어요."
        confirmLabel="예약 취소"
        danger
        onConfirm={() => {
          cancelReservation(res.id);
          pushToast({ title: '예약이 취소되었어요', tone: 'busy', icon: 'x' });
          router.push('/reservations');
        }}
      />
    </div>
  );
}