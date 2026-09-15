'use client';

import React, { use, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, Segmented, LiveStamp } from '@/components/ui/primitives';
import { ConfirmModal, NavSheet } from '@/components/ui/overlays';
import { SubHeader, StickyCta } from '@/components/customer/Shell';
import { cx, fmtDateK, resAt, untilText } from '@/lib/format';
import { levelOf, parkingOptions, type ParkingOption } from '@/lib/status';
import { rejectReasonOf } from '@/lib/tokens';
import { isLiveRes } from '@/lib/types';
import { useApp, useNow } from '@/lib/store';
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
  const { getRes, getStore, lots, resLoaded, cancelReservation, uploadReceipt, pushToast } = useApp();
  /* 1분마다면 충분하다. 초 단위로 줄어드는 숫자는 읽는 데 방해만 된다 */
  const now = useNow(60_000);

  const [sort, setSort] = useState<'ai' | 'free' | 'near'>('ai');
  const [picked, setPicked] = useState<string | null>(null);
  const [nav, setNav] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  

  const res = getRes(id);

  /* [a7] 예약 목록을 아직 안 읽었으면 404 가 아니라 로딩이다.
     목업을 걷어내면서 첫 렌더의 목록이 빈 배열이 됐다. 주소로 바로 열거나
     예약 완료 화면에서 '예약 상세 보기'를 누르면 그 순간 목록이 비어 있어
     notFound() 가 즉시 터졌다. 예약이 없는 게 아니라 아직 안 읽은 것이다. */
  if (!res && !resLoaded) {
    return (
      <div className="absolute inset-0 bg-ink-50 grid place-items-center">
        <span className="w-6 h-6 rounded-full border-2 border-ink-200 border-t-brand-600 animate-spin" />
      </div>
    );
  }
  if (!res) notFound();
  const store = getStore(res.storeId);
  /* [a7] pending 은 아직 진행 중이다. status !== 'upcoming' 으로 가르면
     승인 대기 예약이 '지난 예약' 화면으로 열린다 (QR 도 사라진다). */
  const past = !isLiveRes(res.status);
  /* [a7] 아직 매장이 안 본 예약. 확정된 예약과 화면이 달라야 한다 —
     QR·출발 알림·주차 현황·길안내는 자리가 잡힌 뒤에 의미가 있다.
     '갈 수 있는 자리'가 아직 아닌데 길안내를 띄우면 손님이 출발한다. */
  const waiting = res.status === 'pending';
  const confirmed = res.status === 'upcoming';

  /** 예약까지 남은 시간. 지났으면 null */
  const until = now ? untilText(resAt(res.date, res.time).getTime() - now) : null;

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
                  res.status === 'canceled' ? 'bg-off-400'
                    : res.status === 'rejected' ? 'bg-busy-500'
                    : waiting ? 'bg-warn-500'
                    : past ? 'bg-ink-400' : 'bg-brand-600'
                )}
              >
                <Icon
                  n={
                    res.status === 'canceled' || res.status === 'rejected' ? 'x'
                      : waiting ? 'clock'
                      : past ? 'check' : 'calendar'
                  }
                  s={21}
                />
              </span>
              <div>
                <div className="text-[16px] font-extrabold text-ink-900">
                  {res.status === 'canceled' ? '취소된 예약이에요'
                    : res.status === 'rejected' ? rejectReasonOf(res.rejectReason).title
                    : waiting ? '매장에서 확인하고 있어요'
                    : past ? '방문을 마친 예약이에요'
                    : '자리가 준비됐어요'}
                </div>
                <div className="text-[12px] font-bold text-ink-500 mt-0.5 leading-relaxed">
                  {res.status === 'rejected' ? rejectReasonOf(res.rejectReason).desc
                    : waiting ? '답변이 오면 알려드릴게요. 보통 10분 안에 와요'
                    : past ? '이용해 주셔서 감사합니다'
                    : '방문 2시간 전까지 변경·취소할 수 있어요'}
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
            {confirmed && (
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
          {confirmed && (
            <>
              {/* 방문 안내
                  [a8] 예전에는 "11시 52분에 출발하시면 딱 맞아요 · 차로 약 18분" 이
                  글자로 박혀 있었다. 예약이 17시든 13시든 같은 문장이 떠서,
                  바로 위에 적힌 예약 시각과 같은 화면 안에서 서로 모순됐다.

                  ★ 이동 시간은 뺐다
                    손님 위치를 모르고 경로 계산도 하지 않는다. '차로 18분' 은
                    근거가 없는 숫자였다. 아는 것(예약까지 남은 시간)만 말하고,
                    모르는 것은 손님이 직접 확인할 수 있게 아래 주차 현황으로 넘긴다.
                    출발 시각 추천은 위치 권한과 길찾기가 붙은 뒤에 할 일이다. */}
              <Card className="p-4 border-2 border-brand-200 bg-brand-50">
                <div className="flex items-start gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-brand-600 text-white grid place-items-center shrink-0">
                    <Icon n="bell" s={18} />
                  </span>
                  <div>
                    <div className="text-[13px] font-extrabold text-brand-800">
                      {/* now 가 0 이면 아직 마운트 전이다. 서버 렌더에서 시간을 계산하면
                          hydration 이 어긋나므로 그때는 시각만 보여 준다 */}
                      {!now
                        ? `${fmtDateK(res.date)} ${res.time} 방문 예정이에요`
                        : until
                        ? `예약까지 ${until} 남았어요`
                        : '예약 시간이 되었어요'}
                    </div>
                    <div className="text-[11.5px] font-medium text-brand-800/80 mt-1 leading-relaxed">
                      {res.parkingAlert
                        ? '방문 30분 전 주차 알림을 켜두셨어요. '
                        : ''}
                      출발하시기 전에 아래 주차 현황을 한 번 더 확인해 주세요.
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
        ) : res.status === 'rejected' ? (
          /* 부정 상태로 끝내지 않는다. 다음 행동을 하나 둔다 */
          <Button
            variant="primary" size="lg" full icon="calendar"
            onClick={() => router.push(`/reserve/${res.storeId}`)}
          >
            다른 시간으로 다시 잡기
          </Button>
        ) : waiting ? (
          /* 승인 전에는 길안내를 띄우지 않는다. 아직 갈 수 있는 자리가 아니다 */
          <Button variant="outline" size="lg" full onClick={() => setAskCancel(true)}>
            예약 요청 취소
          </Button>
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
        title={waiting ? '요청을 취소할까요?' : '예약을 취소할까요?'}
        sub={waiting
          ? '아직 매장이 확인 전이에요. 취소하면 그 시간은 다른 분께 넘어갈 수 있어요.'
          : '취소 후에는 같은 시간대를 다시 잡지 못할 수 있어요.'}
        confirmLabel={waiting ? '요청 취소' : '예약 취소'}
        danger
        onConfirm={() => {
          /* 실패 토스트는 store 쪽에서 띄운다. 여기서 성공을 단정하지 않는다 —
             서버가 거절하면(이미 승인됨·시각 지남) 목록에 그대로 남는다 */
          void cancelReservation(res.id);
          router.push('/reservations');
        }}
      />
    </div>
  );
}