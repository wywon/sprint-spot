'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button, Card, Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/format';
// import { ME } from '@/lib/mock';
import { useApp } from '@/lib/store';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * 마이페이지
 * ─────────────────────────────────────────────────────────────
 * ★ 차량 정보를 여기서 받는 이유
 *   지금은 쓰지 않지만, 관리자 콘솔에서 주차 시간을 정산할 때 필요하다.
 *   (Phase 2의 주차 결제로 가는 포석이기도 하다.)
 *   '차로 가는지 걸어가는지' 같은 이동수단 토글은 두지 않는다 —
 *   그건 매번 바뀌는 값이라 설정에 저장할 성격이 아니다.
 *
 * ★ 알림은 "주차 몇 자리 남음"이 아니라 "예약까지 몇 분 남음"을 보여준다.
 *   주차 자리 수는 계속 바뀌므로 알림으로 보내면 소음이 된다.
 */
export default function MyPage() {
  const { reservations, simOn, setSimOn, profile } = useApp();
  const router = useRouter();

  const upcoming = reservations.filter((r) => r.status === 'upcoming').length;
  const visits = reservations.filter((r) => r.status === 'done').length;
  const written = reservations.filter((r) => r.reviewed).length;

  return (
    <div className="absolute inset-0 pt-11 pb-[76px] bg-ink-50 overflow-y-auto no-sb">
      <div className="bg-white px-5 pt-4 pb-5 border-b border-ink-200">
        <div className="text-[20px] font-extrabold text-ink-900 mb-4">마이페이지</div>
        <div className="flex items-center gap-3.5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-white text-[22px] font-extrabold shrink-0">
            {profile.name.slice(0, 1)}
          </div>
          <div className="grow min-w-0">
            <div className="text-[17px] font-extrabold text-ink-900">{profile.name}</div>
            <div className="text-[12.5px] font-bold text-ink-500 tnum">{profile.phone}</div>
          </div>
          <Button variant="outline" size="sm" icon="pencil"
            onClick={()=> router.push('/my/edit')}>프로필 수정</Button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          {([['예약', upcoming], ['방문', visits], ['리뷰', written]] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl bg-ink-50 p-3 text-center">
              <div className="text-[19px] font-extrabold text-ink-900 tnum">{v}</div>
              <div className="text-[11px] font-bold text-ink-500 mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* 차량 정보 */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-extrabold text-ink-900">차량 정보</div>
          </div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-50 grid place-items-center text-brand-600 shrink-0">
                <Icon n="car" s={21} />
              </div>
              <div className="grow">
                <div className="text-[14.5px] font-extrabold text-ink-900 tnum">{profile.car}</div>
                <div className="text-[11.5px] font-bold text-ink-500">{profile.carType}</div>
              </div>
            </div>
          <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2.5 flex items-start gap-2">
            <Icon n="question" s={14} cls="text-ink-400 shrink-0 mt-0.5" />
            <span className="text-[11px] font-medium text-ink-600 leading-relaxed">
              등록하신 차량 번호는 매장에서 <b>주차 시간을 정산</b>할 때 쓰여요.
            </span>
          </div>
        </Card>

        {/* 알림 — 예약 기준 */}
        <Card className="p-4">
          <div className="text-[13px] font-extrabold text-ink-900 mb-3">알림</div>
          <div className="rounded-xl bg-brand-50 border border-brand-100 px-3.5 py-3 flex items-start gap-2.5">
            <Icon n="bell" s={17} cls="text-brand-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-[12.5px] font-extrabold text-brand-800">
                대흥동 손칼국수 예약 <span className="tnum">1시간 42분</span> 남았어요
              </div>
              <div className="text-[11.5px] font-medium text-brand-800/75 mt-0.5">
                출발하실 시간이 되면 다시 알려드릴게요
              </div>
            </div>
          </div>
        </Card>

        {/* 배치만 — 4주차 이후 채운다 */}
        <Card className="p-1">
  {([
    ['history',  '최근 본 매장', '/my/recent'],
    ['settings', '앱 설정',      '/my/settings'],
  ] as const).map(([i, t, href]) => {
    const cls =
      'w-full flex items-center gap-3 px-3.5 py-3.5 hover:bg-ink-50 rounded-xl transition-colors';
    const inner = (
      <>
        <Icon n={i} s={19} cls="text-ink-400 shrink-0" />
        <div className="grow text-left text-[13.5px] font-bold text-ink-800">{t}</div>
        <Icon n="chevR" s={16} cls="text-ink-300 shrink-0" />
      </>
    );

    return href ? (
      <Link key={t} href={href} className={cls}>
        {inner}
      </Link>
    ) : (
      <button key={t} type="button" className={cls}>
        {inner}
      </button>
    );
  })}
</Card>

        {/* 시뮬레이션 토글 */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="grow">
              <div className="text-[13px] font-extrabold text-ink-900">실시간 시뮬레이션</div>
              <div className="text-[11.5px] font-medium text-ink-500 mt-1 leading-relaxed">
                좌석과 주차 상태를 계속 새로 받아옵니다. <b className="text-warn-600">데이터 요금이 부과될 수 있어요.</b>
              </div>
            </div>
            <button
              onClick={() => setSimOn(!simOn)}
              aria-label="실시간 시뮬레이션"
              className={cx('w-[46px] h-[26px] rounded-full transition-colors relative shrink-0', simOn ? 'bg-ok-500' : 'bg-ink-300')}
            >
              <span className={cx('absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all', simOn ? 'left-[23px]' : 'left-[3px]')} />
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
