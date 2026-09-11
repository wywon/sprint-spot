'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, Gauge, LiveStamp } from '@/components/ui/primitives';
import { NavSheet } from '@/components/ui/overlays';
import { SubHeader, StickyCta } from '@/components/customer/Shell';
import { FoodTile } from '@/components/customer/Cards';
import { cx } from '@/lib/format';
import { levelOf, lotStats } from '@/lib/status';
import { findAny } from '@/lib/mock';
import { useApp } from '@/lib/store';

/**
 * 공영주차장 상세
 * ─────────────────────────────────────────────────────────────
 * ★ 어느 자리가 비었는지는 보여주지 않는다.
 *   공영주차장은 정산기 카운트만 받으므로 면 단위 정보가 애초에 없다.
 *   없는 정보를 있는 것처럼 그리면 신뢰가 깨진다.
 *
 * ★ 하단 CTA 는 '길안내 시작' 하나뿐이다.
 *   여기서 손님이 할 수 있는 결정은 "간다 / 안 간다" 하나이기 때문이다.
 *   맛집 버튼을 같이 두면 두 결정이 섞여서 둘 다 흐려진다.
 */
export default function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getLot } = useApp();
  const [nav, setNav] = useState(false);

  const lot = getLot(id);
  if (!lot) notFound();

  const st = lotStats(lot);
  const lv = levelOf(st);
  const full = st.available === 0;

  return (
    <div className="absolute inset-0 bg-ink-50">
      <SubHeader title={lot.name} sub={lot.gu} />

      <div className="absolute inset-0 pt-[92px] pb-[104px] overflow-y-auto no-sb">
        <div className="p-4 space-y-3">
          {/* 태그 · 이름 · 주소 */}
          <Card className="p-4">
            <div className="flex gap-1.5 mb-2.5">
              <Badge tone="ink" size="sm">{lot.type}</Badge>
              <Badge tone="ink" size="sm">{lot.hours}</Badge>
            </div>
            <div className="text-[19px] font-extrabold text-ink-900 leading-snug">{lot.name}</div>
            <div className="text-[12.5px] font-bold text-ink-500 mt-1.5 flex items-start gap-1.5">
              <Icon n="pin" s={15} cls="text-ink-400 shrink-0 mt-px" />
              {lot.addr}
            </div>
          </Card>

          {/* 실시간 현황 */}
          <Card className={cx('p-4 border-2', full ? 'border-busy-200' : 'border-ok-200')}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-extrabold text-ink-900">실시간 주차 현황</span>
              <LiveStamp updated={lot.updated} />
            </div>

            <div className="flex items-end gap-2 mb-3">
              <span className={cx('text-[40px] font-extrabold leading-none tnum', lv.num)}>{st.available}</span>
              <span className="text-[14px] font-bold text-ink-400 mb-1 tnum">/ {st.total}면</span>
              <span className="grow" />
              <Badge tone={lv.tone} icon={lv.icon} solid={full}>{lv.label}</Badge>
            </div>

            <Gauge used={st.occupied ?? 0} total={st.total} tone={lv.tone === 'ok' ? 'ok' : lv.tone === 'busy' ? 'busy' : 'warn'} label="이용률" big />
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                ['전체', st.total, 'text-ink-900'],
                ['주차 중', st.occupied, 'text-busy-500'],
                ['주차 가능', st.available, 'text-ok-500'],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-xl bg-ink-50 py-2.5 text-center">
                  <div className={cx('text-[18px] font-extrabold tnum leading-none', c as string)}>{v as number}</div>
                  <div className="text-[10.5px] font-bold text-ink-500 mt-1">{l as string}</div>
                </div>
              ))}
            </div>

            {/* 부정 상태에는 반드시 대안을 준다 */}
            {full && (
              <div className="mt-3 rounded-xl bg-busy-50 border border-busy-200 px-3.5 py-3 flex items-start gap-2.5">
                <Icon n="alert" s={16} cls="text-busy-500 shrink-0 mt-px" />
                <div>
                  <div className="text-[12.5px] font-extrabold text-busy-600">지금은 만차예요</div>
                  <div className="text-[11.5px] font-medium text-busy-600/80 mt-0.5 leading-relaxed">
                    보통 20~30분 뒤에 자리가 납니다. 근처 다른 주차장을 먼저 확인해 보세요.
                  </div>
                  <Link href="/parking" className="inline-block mt-2 text-[12px] font-extrabold text-busy-600 underline underline-offset-2">
                    주변 주차장 보기
                  </Link>
                </div>
              </div>
            )}
          </Card>

          {/* 요금 및 운영 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">요금 및 운영</div>
            {[
              ['기본 요금', lot.fee, 'won'],
              ['일 최대', lot.dayMax, 'won'],
              ['운영 시간', lot.hours, 'clock'],
              ['문의', lot.tel, 'phone'],
            ].map(([l, v, i]) => (
              <div key={l} className="flex items-center gap-2.5 py-2.5 border-b border-ink-100 last:border-0">
                <Icon n={i} s={15} cls="text-ink-400 shrink-0" />
                <span className="text-[12px] font-extrabold text-ink-500 w-[64px] shrink-0">{l}</span>
                <span className="text-[13px] font-bold text-ink-800">{v}</span>
              </div>
            ))}
          </Card>

          {/* 근처 추천 식당 */}
          <div className="pt-1">
            <div className="flex items-center justify-between px-1 mb-2.5">
              <div>
                <div className="text-[15px] font-extrabold text-ink-900">근처 추천 식당</div>
                <div className="text-[11.5px] font-bold text-ink-500 mt-0.5">여기 대고 걸어갈 만한 거리예요</div>
              </div>
              {/* 전체보기 → 이 주차장을 중심으로 지도에 식당만 표시 */}
              <Link
                href={`/explore?filter=food&focus=${lot.id}`}
                className="text-[12px] font-extrabold text-brand-700 shrink-0"
              >
                전체보기
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto no-sb -mx-4 px-4 pb-1">
              {lot.near.map(([sid, dist]) => {
                const s = findAny(sid);
                if (!s) return null;
                return <FoodTile key={sid} store={s} distM={dist} />;
              })}
            </div>
          </div>
        </div>
      </div>

      <StickyCta>
        <Button variant="primary" size="lg" full icon="nav" onClick={() => setNav(true)}>
          길안내 시작
        </Button>
      </StickyCta>

      <NavSheet open={nav} onClose={() => setNav(false)} target={lot.name} lat={lot.lat} lng={lot.lng} />
    </div>
  );
}