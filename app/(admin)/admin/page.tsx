'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Card, Gauge, LiveStamp } from '@/components/ui/primitives';
import { AdminTopbar } from '@/components/admin/Sidebar';
import { KPI } from '@/components/admin/KPI';
import { ResCalendar } from '@/components/admin/ResCalendar';
import { cx, agoText } from '@/lib/format';
import { ADMIN_STORE_ID } from '@/lib/tokens';
import { parkStats, seatStats } from '@/lib/status';
import { useApp, useNow } from '@/lib/store';

/**
 * 관리자 대시보드
 * ─────────────────────────────────────────────────────────────
 * ★ 정보 우선순위 — 3초 안에 파악해야 하는 순서대로 위에서 아래로 놓는다.
 *   1) 지금 당장 조치가 필요한 일 (문제 알림)
 *   2) 좌석 · 주차 · 예약 숫자
 *   3) 곧 도착하는 손님
 *   4) 최근 변경 기록
 *
 *   문제 알림을 맨 위에 두는 이유: 관리자는 대시보드를 '읽으려고' 열지 않는다.
 *   "지금 뭔가 잘못됐나?"를 확인하려고 연다.
 */
export default function AdminDashboardPage() {
  const router = useRouter();
  const { getStore, adminRes, log } = useApp();
  const now = useNow(1000);
  const [cal, setCal] = useState(false);

  const store = getStore(ADMIN_STORE_ID);
  if (!store) return null;

  const ss = seatStats(store);
  const ps = parkStats(store);
  /* [b10] '오늘 예약'과 '승인 대기'를 갈라 센다.
     adminRes 에는 날짜와 무관한 pending 이 전부 들어 있다(a7 의 의도 — 내일 요청도
     오늘 봐야 한다). 그런데 대시보드가 그걸 다 세는 바람에 다음 주 요청 3건이
     '오늘 예약'을 3건 부풀렸다. 거기에 취소·거절까지 더해지고 있었다.

     ★ 오늘 건수에서 취소·거절은 뺀다
       카드의 숫자는 '오늘 몇 팀이 오는가'다. 거절한 예약은 오는 팀이 아니다.
       미방문은 남긴다 — 자리를 잡아 뒀다가 안 온 것이라 오늘 일어난 일이 맞다. */
  const pending = adminRes.filter((r) => r.status === 'pending');
  const todayAll = adminRes.filter(
    (r) => r.status !== 'pending' && r.status !== 'canceled' && r.status !== 'rejected',
  );

  const upcoming = todayAll.filter((r) => r.status === 'upcoming');
  const seated = todayAll.filter((r) => r.status === 'seated');
  const noshow = todayAll.filter((r) => r.status === 'noshow');

  // 조치가 필요한 일만 모은다
  const issues: { icon: string; tone: string; title: string; desc: string; go?: string }[] = [];

    /* [b10] 승인 대기를 맨 위에 둔다.
     여기 있던 넷(센서 오류·감지 흔들림·수동 지정·미방문)은 전부 '기계가 이상하다'였는데,
     정작 사람이 답을 기다리고 있는 항목이 빠져 있었다. 관리자가 대시보드를 여는 이유는
     "지금 뭐 할 일 있나"이고, 손님을 기다리게 하는 일보다 급한 건 없다. */
  if (pending.length > 0) {
    issues.push({
      icon: 'clock', tone: 'warn',
      title: `승인을 기다리는 예약이 ${pending.length}건 있어요`,
      desc: '손님이 앱에서 답을 기다리는 중이에요. 승인하면 바로 알림이 갑니다.',
      go: '/admin/hall',
    });
  }

  if (store.sensor === 'offline') {
    issues.push({
      icon: 'sensor-off', tone: 'busy',
      title: '주차면 센서가 응답하지 않아요',
      desc: '손님 앱에는 「확인 불가」로 표시되고 있어요. 게이트웨이 전원을 확인해 주세요.',
      go: '/admin/parking',
    });
  }
  if ((ps.unknown ?? 0) > 0) {
    issues.push({
      icon: 'question', tone: 'unk',
      title: `${ps.unknown}자리의 감지값이 흔들리고 있어요`,
      desc: '차가 선을 걸쳐 세웠을 수 있어요. 이용 가능 수에는 넣지 않았습니다.',
      go: '/admin/parking',
    });
  }
  if (ps.manual > 0) {
    issues.push({
      icon: 'hand', tone: 'warn',
      title: `손으로 지정해 둔 주차면이 ${ps.manual}곳 있어요`,
      desc: '2시간 뒤 자동으로 센서 감지로 돌아갑니다.',
      go: '/admin/parking',
    });
  }
  if (noshow.length > 0) {
    issues.push({
      icon: 'alert', tone: 'off',
      title: `오늘 미방문이 ${noshow.length}건 있어요`,
      desc: '예약 시간에서 10분이 지나 자동으로 처리되었습니다.',
      go: '/admin/hall',
    });
  }

  return (
    <>
      <AdminTopbar
        title="대시보드"
        sub={`${store.name} · 오늘 예약 ${todayAll.length}건`}
        right={<div className="mr-2"><LiveStamp updated={store.tablesUpdated} /></div>}
      />

      <div className="grow overflow-y-auto thin-sb bg-ink-50 p-7">
        {/* 1. 조치가 필요한 일 */}
        {issues.length > 0 && (
          <div className="mb-5 space-y-2">
            {issues.map((it) => (
              <Card
                key={it.title}
                className={cx(
                  'p-4 border-2 flex items-start gap-3',
                  it.tone === 'busy' ? 'border-busy-200 bg-busy-50'
                    : it.tone === 'unk' ? 'border-unk-200 bg-unk-50'
                    : it.tone === 'warn' ? 'border-warn-200 bg-warn-50'
                    : 'border-off-200 bg-off-50',
                  it.go && 'cursor-pointer hover:shadow-pop transition-shadow'
                )}
                onClick={() => it.go && router.push(it.go)}
              >
                <span
                  className={cx(
                    'w-9 h-9 rounded-lg grid place-items-center text-white shrink-0',
                    it.tone === 'busy' ? 'bg-busy-500' : it.tone === 'unk' ? 'bg-unk-500' : it.tone === 'warn' ? 'bg-warn-400' : 'bg-off-500'
                  )}
                >
                  <Icon n={it.icon} s={18} />
                </span>
                <div className="grow">
                  <div className="text-[13.5px] font-extrabold text-ink-900">{it.title}</div>
                  <div className="text-[12px] font-medium text-ink-600 mt-0.5 leading-relaxed">{it.desc}</div>
                </div>
                {it.go && <Icon n="chevR" s={18} cls="text-ink-400 shrink-0 mt-1" />}
              </Card>
            ))}
          </div>
        )}

        {/* 2. 숫자 */}
        <div className="grid grid-cols-4 gap-4 mb-5">
          <KPI
            label="테이블"
            value={ss.available}
            unit={`/ ${ss.total}`}
            icon="grid"
            tone={ss.available > 0 ? 'ok' : 'busy'}
            sub="지금 앉을 수 있는 자리"
            breakdown={[
              ['사용 중', ss.occupied - ss.reserved, 'text-busy-500'],
              ['예약', ss.reserved, 'text-brand-600'],
              ['이용 불가', ss.disabled, 'text-off-500'],
            ]}
          />
          <KPI
            label="주차장"
            value={ps.offline ? '—' : ps.available}
            unit={`/ ${ps.total}`}
            icon="parkingP"
            tone={ps.offline ? 'off' : (ps.available ?? 0) > 0 ? 'ok' : 'busy'}
            sub={ps.offline ? '센서 응답 없음' : '지금 댈 수 있는 자리'}
            breakdown={
              ps.offline
                ? undefined
                : [
                    ['주차 중', ps.occupied ?? 0, 'text-busy-500'],
                    ['확인 중', ps.unknown ?? 0, 'text-unk-500'],
                    ['수동', ps.manual, 'text-warn-500'],
                  ]
            }
          />
          <KPI
            label="오늘 예약"
            value={todayAll.length}
            unit="건"
            icon="calendar"
            tone="brand"
            /* [b10] 승인 대기는 오늘 건수와 성격이 다르다. 날짜도 다를 수 있고,
               무엇보다 '이미 잡힌 예약'이 아니라 '내가 답해야 할 요청'이다.
               같은 숫자에 섞으면 둘 다 뜻을 잃는다. */
            sub={
              pending.length > 0
                ? `승인 대기 ${pending.length} · 도착 예정 ${upcoming.length}`
                : `도착 예정 ${upcoming.length} · 착석 ${seated.length}`
            }
            onClick={() => setCal(true)}
            actionLabel="예약 달력 보기"
          />
          <KPI
            label="현재 방문 손님"
            value={store.tables.filter((t) => t.status === 'occupied').reduce((a, t) => a + (t.guest ?? 0), 0)}
            unit="명"
            icon="people"
            tone="ok"
            sub={`${store.tables.filter((t) => t.status === 'occupied').length}개 테이블 이용 중`}
          />
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* 3. 곧 도착 */}
          <Card className="col-span-2 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[15px] font-extrabold text-ink-900">곧 도착하는 손님</div>
                <div className="text-[12px] font-bold text-ink-500 mt-0.5">도착 순서대로 보여드려요</div>
              </div>
              <Badge tone="brand" size="sm">{upcoming.length}팀</Badge>
            </div>

            {upcoming.length === 0 ? (
              <div className="py-10 text-center text-[13px] font-bold text-ink-400">예정된 손님이 없어요</div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-ink-200 bg-white">
                    <span className="text-[15px] font-extrabold text-brand-700 tnum w-[46px] shrink-0">{r.time}</span>
                    <div className="grow min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-extrabold text-ink-900">{r.name}</span>
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-ink-500 tnum">
                          <Icon n="people" s={12} />
                          {r.party}명
                        </span>
                      </div>
                      {r.memo && <div className="text-[11.5px] font-medium text-ink-500 mt-0.5 truncate">{r.memo}</div>}
                    </div>
                    <Badge tone="ink" size="sm">{r.eta}</Badge>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4">
              <Gauge used={ss.occupied} total={ss.total} tone={ss.available > 0 ? 'brand' : 'busy'} label="좌석 이용률" big />
              <div className="h-3" />
              {!ps.offline && (
                <Gauge used={ps.occupied ?? 0} total={ps.total} tone={(ps.available ?? 0) > 0 ? 'warn' : 'busy'} label="주차장 이용률" big />
              )}
            </div>
          </Card>

          {/* 4. 최근 변경 */}
          <Card className="p-6">
            <div className="text-[15px] font-extrabold text-ink-900 mb-1">최근 변경</div>
            <div className="text-[12px] font-bold text-ink-500 mb-4">센서와 관리자 조작 기록이에요</div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto thin-sb pr-1">
              {log.length === 0 ? (
                <div className="py-8 text-center text-[12.5px] font-bold text-ink-400">기록이 없어요</div>
              ) : (
                log.map((l, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span
                      className={cx(
                        'w-2 h-2 rounded-full shrink-0 mt-1.5',
                        l.tone === 'ok' ? 'bg-ok-500' : l.tone === 'warn' ? 'bg-warn-400' : l.tone === 'busy' ? 'bg-busy-500' : l.tone === 'brand' ? 'bg-brand-500' : 'bg-off-400'
                      )}
                    />
                    <div className="grow min-w-0">
                      <div className="text-[12.5px] font-bold text-ink-800 leading-snug">{l.msg}</div>
                      <div className="text-[11px] font-bold text-ink-400 mt-0.5">
                        {l.who} · {now ? agoText(now - l.t) : '—'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <ResCalendar open={cal} onClose={() => setCal(false)} />
    </>
  );
}
