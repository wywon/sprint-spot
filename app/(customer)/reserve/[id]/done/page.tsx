'use client';

import React, { Suspense, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button, Card } from '@/components/ui/primitives';
import { fmtDateK } from '@/lib/format';
import { useApp } from '@/lib/store';

/** 예약 완료 */
function Done({ storeId }: { storeId: string }) {
  const params = useSearchParams();
  const rid = params.get('rid') ?? '';
  const { getStore, getRes, resLoaded } = useApp();
  const store = getStore(storeId);
  const res = getRes(rid);
  /* 아직 매장이 안 본 상태인가. 목록을 못 읽었을 때도 '요청함'으로 본다 —
     방금 신청한 직후라 그게 사실에 가깝다 */
  const waiting = !res || res.status === 'pending';

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="grow flex flex-col items-center justify-center px-6 text-center">
        {/* [a7] 승인제로 바뀌면서 이 화면은 '확정'이 아니라 '접수'를 알린다.
            아직 매장이 안 봤는데 초록 체크와 "확정되었어요"를 띄우면
            손님은 자리가 잡힌 줄 알고 출발한다. 가장 비싼 거짓말이다.
            승인이 끝난 예약으로 다시 들어왔을 때만 확정 문구를 쓴다. */}
        {waiting ? (
          <>
            <div className="w-20 h-20 rounded-full bg-warn-50 grid place-items-center text-warn-500 mb-5 animate-popIn">
              <Icon n="clock" s={38} />
            </div>
            <div className="text-[22px] font-extrabold text-ink-900">예약 요청을 보냈어요</div>
            <div className="text-[13px] font-bold text-ink-500 mt-2 leading-relaxed">
              매장에서 확인하는 대로 알려드릴게요
              <br />
              보통 <b className="text-ink-800">10분 안에</b> 답변이 와요
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-ok-50 grid place-items-center text-ok-500 mb-5 animate-popIn">
              <Icon n="check" s={40} />
            </div>
            <div className="text-[22px] font-extrabold text-ink-900">자리가 준비됐어요</div>
            <div className="text-[13px] font-bold text-ink-500 mt-2 leading-relaxed">
              예약 내역은 <b className="text-ink-800">예약 탭</b>에서 언제든 확인하실 수 있어요
            </div>
          </>
        )}

        {res && store && (
          <Card className="w-full p-4 mt-6 text-left">
            <div className="text-[16px] font-extrabold text-ink-900">{store.name}</div>
            <div className="text-[12.5px] font-bold text-ink-500 mt-1">{store.addr}</div>
            <div className="mt-3 pt-3 border-t border-ink-100 space-y-2">
              {[
                ['calendar', `${fmtDateK(res.date)} ${res.time}`],
                ['people', `${res.party}명 · ${res.seatType}`],
                ['car', store.parking.fee],
              ].map(([i, v]) => (
                <div key={v} className="flex items-center gap-2.5">
                  <Icon n={i} s={15} cls="text-ink-400 shrink-0" />
                  <span className="text-[12.5px] font-bold text-ink-700">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="w-full mt-4 rounded-2xl bg-brand-50 border border-brand-100 p-4 text-left">
          <div className="flex items-center gap-2 mb-2">
            <Icon n="bell" s={16} cls="text-brand-600" />
            <span className="text-[12.5px] font-extrabold text-brand-800">
              {waiting ? '지금부터 이렇게 진행돼요' : '앞으로 이렇게 알려드려요'}
            </span>
          </div>
          <ul className="space-y-1.5 text-[11.5px] font-medium text-brand-800/85 leading-relaxed">
            {waiting ? (
              <>
                <li>· 매장이 확인하면 바로 알려드려요.</li>
                <li>· 기다리는 동안에도 다른 시간을 알아보실 수 있어요.</li>
                <li>· 이 요청은 예약 탭에서 취소하실 수 있어요.</li>
              </>
            ) : (
              <>
                <li>· 출발하실 시간이 되면 알림을 보내드려요.</li>
                <li>· 방문 30분 전에 주차 상황을 알려드려요.</li>
                <li>· 예약 시간 10분이 지나면 자동으로 취소돼요.</li>
                <li>· 변경·취소는 방문 2시간 전까지 앱에서 가능해요.</li>
              </>
            )}
          </ul>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-8 pt-3 space-y-2">
        {/* rid 가 없으면(요청이 실패했거나 주소를 직접 열었을 때) 상세로 보내지 않는다.
            없는 예약으로 이동해서 404 를 보여 주느니 예약 탭으로 보내는 편이 낫다 */}
        <Link href={rid ? `/reservations/${rid}` : '/reservations'} className="block">
          <Button variant="primary" size="lg" full icon="calendar">
            {waiting ? '요청 내역 보기' : '예약 상세 보기'}
          </Button>
        </Link>
        <Link href="/explore" className="block">
          <Button variant="ghost" size="lg" full>홈으로</Button>
        </Link>
      </div>
    </div>
  );
}

export default function ReserveDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-white" />}>
      <Done storeId={id} />
    </Suspense>
  );
}