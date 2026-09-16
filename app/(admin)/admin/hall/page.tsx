'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, LiveStamp } from '@/components/ui/primitives';
import { ConfirmModal } from '@/components/ui/overlays';
import { AdminTopbar } from '@/components/admin/Sidebar';
import { TableMap } from '@/components/admin/TableMap';
import { cx } from '@/lib/format';
import { ADMIN_STORE_ID, CLEAN_AUTO_MS, REJECT_REASONS, RES_ADMIN, TABLE } from '@/lib/tokens';
import { useApp } from '@/lib/store';
import { isOpenAdminRes, type AdminReservation, type RejectReasonCode, type StoreTable } from '@/lib/types';

/**
 * 홀 운영
 * ─────────────────────────────────────────────────────────────
 * ★ 화면을 배치도 중심으로 구성한다.
 *   상단 요약 라벨, '즉시 안내가능 좌석' 버튼, 빈자리/사용중 필터 칩을 전부 없앴다.
 *   그 정보들은 배치도를 보면 이미 다 보이므로 두 번 말하는 셈이었다.
 *
 * ★ 배치도에 '정리 중'을 표시하지 않는다.
 *   퇴장 처리하면 40초 뒤 자동으로 빈 자리가 되므로 관리자가 신경 쓸 일이 아니다.
 *
 * ★ '노쇼' 버튼을 '취소'로 바꿨다.
 *   미방문 처리는 시스템이 자동으로 한다. 관리자가 손으로 누르는 건
 *   손님이 전화로 못 온다고 알려온 경우이고, 그건 '취소'다.
 *
 * ★ 잘못 누름 방지 — 되돌릴 수 없는 동작(예약 취소, 이용 불가)만 확인 모달을 띄운다.
 *   모든 것에 모달을 띄우면 관리자가 확인 버튼을 기계적으로 누르게 되어 오히려 위험하다.
 *
 * ★ [b11] 토스트의 '되돌리기'를 뺐다.
 *   화면만 되돌리고 서버에는 아무 요청도 가지 않았다 — occupied→available,
 *   cleaning→occupied 는 서버 전이표(ALLOWED)에 없는 동작이다. 그래서 3초 뒤
 *   폴링이 원래대로 덮어썼고, "5분 내 되돌릴 수 있어요"는 4초 뒤 사라지는 토스트였다.
 *   잘못 입장시켰으면 퇴장을 누르면 된다(정리 40초 뒤 빈 자리).
 *   토스트는 방금 일어난 일만 말한다.
 *
 * ★ [b11] 예약석 입장·취소는 예약 레코드와 같이 움직인다.
 *   테이블만 occupied 로 바꾸면 Reservation 은 upcoming 으로 남아
 *   10분 뒤 자동 미방문 처리되고, 손님 앱에 「미방문」이 뜬다.
 */
export default function AdminHallPage() {
  const { getStore, setTable, adminRes, decideRes, pushToast } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { type: 'disable' | 'cancelRes'; table: StoreTable }>(null);
  /** [a7] 거절 사유를 고르는 중인 예약 */
  const [rejecting, setRejecting] = useState<AdminReservation | null>(null);

  /* [a7] 승인 대기를 따로 뽑는다.
     관리자가 이 화면에서 해야 하는 일 중 '기다리는 손님에게 답하기'가 가장 급하다.
     오늘 예약 목록에 섞어 두면 시간 순 어딘가에 묻힌다. */
  const pending = adminRes.filter((r) => r.status === 'pending');
  const todayRes = adminRes.filter((r) => r.status !== 'pending');

  const store = getStore(ADMIN_STORE_ID);
  if (!store) return null;

  const table = sel ? store.tables.find((t) => t.id === sel) ?? null : null;

  /**
   * [b11] 이 예약석에 걸린 예약을 찾는다. 없으면 null.
   *
   * ① Reservation.tableId 가 이 테이블인 도착 예정 예약 — 서버가 준 연결이라 정확하다
   * ② 테이블의 resName · resAt 과 이름 · 시각이 같은 도착 예정 예약
   *
   * ★ ①이 먼저인 이유
   *   GET /api/stores/[id] 는 테이블의 resName · resAt 을 내려주지 않는다
   *   (손님 앱도 읽는 공개 응답이라 예약자 이름을 실으면 안 된다).
   *   lib/adapt.ts 는 그 값을 직전 화면 값에서 이어받는데, 첫 폴링의 직전 값은
   *   목업 테이블(id 't4')이고 DB 테이블 id 는 's1_t4' 라 이어받을 게 없다.
   *   그래서 실제 화면에서 resName 은 거의 항상 null 이고, ②만으로는 못 찾는다.
   *   ②는 나중에 resName 이 제대로 내려오게 되면 그때 살아나는 보조 수단이다.
   *
   * ★ 도착 예정(upcoming)만 본다
   *   이미 착석·취소·미방문인 예약에 또 입장을 걸면 서버가 상태를 뒤집어 버린다.
   *   목록이 시각 순이므로 find 는 같은 테이블의 가장 이른 예약을 고른다.
   */
  const linkedRes = (t: StoreTable): AdminReservation | null => {
    if (t.status !== 'reserved') return null;
    const open = adminRes.filter((r) => r.status === 'upcoming');
    return (
      open.find((r) => r.tableId === t.id) ??
      (t.resName && t.resAt
        ? open.find((r) => r.name === t.resName && r.time === t.resAt)
        : undefined) ??
      null
    );
  };

  /**
   * 테이블 상태를 바꾸고, 방금 일어난 일만 토스트로 알린다.
   * [b11] 되돌리기를 뺐다 — 위 파일 머리 주석 참고.
   */
  const act = (
    t: StoreTable,
    next: Partial<StoreTable>,
    label: string,
    tone: 'ok' | 'warn' | 'busy' | 'brand',
    desc: string,
    res?: AdminReservation | null,
  ) => {
    setTable(store.id, t.id, next, { who: '최영호', msg: `${t.seats}인석 ${label}`, tone }, res?.id ?? null);
    pushToast(
      tone === 'warn'
        // 할 일이 남았다는 안내는 읽을 시간이 더 필요하다
        ? { title: label, desc, tone, duration: 7000 }
        : { title: label, desc, tone, icon: 'check' },
    );
    setSel(null);
  };

  /**
   * [b11] 예약석 입장.
   * 연결된 예약을 못 찾으면 테이블은 그대로 앉히되, 경고 토스트로 사실을 알린다.
   * 조용히 넘어가면 10분 뒤 손님 앱에 「미방문」이 뜨는 원래 문제가 그대로 남는다.
   */
  const seatReserved = (t: StoreTable) => {
    const res = linkedRes(t);
    const guest = res?.party ?? t.resParty ?? 2;
    const next: Partial<StoreTable> = { status: 'occupied', guest, since: '지금', resAt: null, resName: null, resParty: null };

    if (res) {
      act(t, next, '예약 손님 입장', 'ok', `${res.time} ${res.name}님 ${res.party}명 · 예약도 착석으로 바뀌어요`, res);
    } else {
      act(t, next, '입장 처리', 'warn', '연결된 예약을 찾지 못해 테이블만 바꿨어요. 예약 손님이면 오른쪽 오늘 예약에서 입장을 눌러 주세요');
    }
  };

  /** [b11] 예약석 취소. 확인 모달의 "고객에게 취소 알림이 발송" 이 사실이 되려면 예약도 같이 바뀌어야 한다 */
  const cancelReserved = (t: StoreTable) => {
    const res = linkedRes(t);
    const next: Partial<StoreTable> = { status: 'available', resAt: null, resName: null, resParty: null };

    if (res) {
      act(t, next, '예약 취소', 'busy', `${res.time} ${res.name}님 · 예약도 취소로 바뀌어요`, res);
    } else {
      act(t, next, '예약석 비움', 'warn', '연결된 예약을 찾지 못해 자리만 비웠어요. 예약이 남아 있으면 오른쪽 오늘 예약에서 취소를 눌러 주세요');
    }
  };

  /** 선택한 예약석에 걸린 예약 — 패널 설명 줄에 쓴다 */
  const selRes = table ? linkedRes(table) : null;

  return (
    <>
      <AdminTopbar title="홀 운영" />

      <div className="grow overflow-hidden bg-ink-50 flex">
        {/* 배치도 */}
        <div className="grow overflow-y-auto thin-sb p-7">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="text-[15px] font-extrabold text-ink-900">테이블 배치도</div>
              <LiveStamp updated={store.tablesUpdated} />
            </div>

            <div className="rounded-2xl bg-ink-50 border border-ink-200 p-6">
              <div className="text-[10px] font-extrabold text-ink-400 tracking-[.25em] text-center mb-4">창 　 측</div>
              <TableMap store={store} cols={4} onSelect={(t) => setSel(t.id)} selectedId={sel} />
              <div className="mt-5 h-8 rounded-lg bg-ink-900 text-white text-[10px] font-extrabold grid place-items-center tracking-[.2em]">
                ▲ 출 입 구 · 카 운 터
              </div>
            </div>

            {/* 선택한 테이블의 빠른 동작 */}
            {table && (
              <div className="mt-5 rounded-2xl border-2 border-brand-300 bg-brand-50 p-4 animate-popIn">
                <div className="flex items-center gap-4 flex-wrap">
                  <div
                    className={cx(
                      'w-14 h-14 rounded-xl border-2 grid place-items-center shrink-0',
                      TABLE[table.status === 'cleaning' ? 'available' : table.status].bg,
                      TABLE[table.status === 'cleaning' ? 'available' : table.status].border
                    )}
                  >
                    <span className="text-[16px] font-extrabold text-ink-800 tnum">{table.seats}</span>
                  </div>

                  <div className="grow min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-extrabold text-ink-900">{table.seats}인석</span>
                      <Badge
                        tone={
                          table.status === 'available' || table.status === 'cleaning' ? 'ok'
                            : table.status === 'occupied' ? 'busy'
                            : table.status === 'reserved' ? 'brand' : 'off'
                        }
                        icon={TABLE[table.status === 'cleaning' ? 'available' : table.status].icon}
                        size="sm"
                      >
                        {TABLE[table.status === 'cleaning' ? 'available' : table.status].label}
                      </Badge>
                    </div>
                    <div className="text-[12px] font-bold text-ink-500 mt-1 tnum">
                      {table.status === 'occupied' && table.since ? `${table.since}부터 · ${table.guest}명`
                        /* [b11] resName 은 실제 화면에서 거의 항상 null 이다 (linkedRes 주석).
                           "null · null · null명" 이 뜨지 않게 연결된 예약에서 읽는다 */
                        : table.status === 'reserved'
                          ? selRes ? `${selRes.name} · ${selRes.time} · ${selRes.party}명`
                            : table.resName && table.resAt ? `${table.resName} · ${table.resAt} · ${table.resParty ?? '-'}명`
                            : '예약 정보를 찾지 못했어요'
                        : '비어 있음'}
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {(table.status === 'available' || table.status === 'cleaning') && (
                      <>
                        <Button variant="ok" icon="people" onClick={() => act(table, { status: 'occupied', guest: table.seats, since: '지금' }, '입장 처리', 'ok', `${table.code.toUpperCase()} · ${table.seats}명`)}>
                          입장
                        </Button>
                        <Button variant="outline" icon="ban" onClick={() => setConfirm({ type: 'disable', table })}>
                          이용 불가
                        </Button>
                      </>
                    )}
                    {table.status === 'occupied' && (
                      <Button variant="primary" icon="check" onClick={() => act(table, { status: 'cleaning', guest: null, since: null, cleaningAt: Date.now() }, '퇴장 처리', 'brand', `${table.code.toUpperCase()} · 정리 시간 ${CLEAN_AUTO_MS / 1000}초 뒤 빈 자리가 돼요`)}>
                        퇴장
                      </Button>
                    )}
                    {table.status === 'reserved' && (
                      <>
                        <Button variant="ok" icon="people" onClick={() => seatReserved(table)}>
                          입장
                        </Button>
                        <Button variant="outline" onClick={() => setConfirm({ type: 'cancelRes', table })}>
                          예약 취소
                        </Button>
                      </>
                    )}
                    {table.status === 'disabled' && (
                      <Button variant="ok" icon="check" onClick={() => act(table, { status: 'available' }, '이용 가능으로 변경', 'ok', `${table.code.toUpperCase()} · 손님 앱에서도 빈 자리로 보여요`)}>
                        다시 사용
                      </Button>
                    )}
                  </div>
                </div>

                {table.status === 'occupied' && (
                  <div className="mt-3 pt-3 border-t border-brand-200 text-[11.5px] font-medium text-ink-600 leading-relaxed">
                    퇴장 처리하면 정리 시간을 거쳐 <b>40초 뒤 자동으로 빈 자리</b>가 됩니다. 따로 누르실 필요 없어요.
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* 오늘 예약 */}
        <aside className="w-[340px] shrink-0 border-l border-ink-200 bg-white overflow-y-auto thin-sb">
          <div className="p-5 border-b border-ink-200">
            <div className="text-[14px] font-extrabold text-ink-900">오늘 예약</div>
            <div className="text-[11.5px] font-bold text-ink-500 mt-1 tnum">
              {/* [b10] 아직 처리할 예약과 끝난 예약을 갈라 센다.
                  전에는 도착 예정·착석·미방문 셋만 세서, 거절·취소한 건이 목록엔
                  보이는데 요약엔 없었다. 숫자와 카드 수가 안 맞으면 둘 다 못 믿는다. */}
              도착 예정 {todayRes.filter((r) => r.status === 'upcoming').length} ·
              착석 {todayRes.filter((r) => r.status === 'seated').length} ·
              종료 {todayRes.filter((r) => !isOpenAdminRes(r.status)).length}
            </div>
          </div>

          <div className="px-4 py-3 bg-ink-50 border-b border-ink-200 flex items-start gap-2">
            <Icon n="question" s={14} cls="text-ink-400 shrink-0 mt-0.5" />
            <div className="text-[11.5px] font-medium text-ink-600 leading-relaxed">
              예약 시간에서 <b>10분이 지나면 자동으로 미방문 처리</b>돼요. 예약 변경은 손님이 앱에서 합니다.
            </div>
          </div>

          {/* ── 승인 대기 ─────────────────────────────────────
              손님이 지금 이 순간 답을 기다리고 있다. 맨 위에 둔다. */}
          {pending.length > 0 && (
            <div className="border-b border-ink-200 bg-warn-50/40">
              <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-warn-500 text-white grid place-items-center">
                  <Icon n="clock" s={12} />
                </span>
                <span className="text-[13px] font-extrabold text-ink-900">
                  승인 대기 {pending.length}건
                </span>
              </div>
              <div className="px-4 pb-2 text-[11px] font-medium text-ink-500 leading-relaxed">
                승인하면 손님 앱에 바로 알림이 가요. 오늘이 아닌 날짜도 여기 모입니다.
              </div>

              <div className="p-4 pt-1 space-y-2">
                {pending.map((r) => (
                  <div key={r.id} className="p-3.5 rounded-xl border-2 border-warn-300 bg-white">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-extrabold text-warn-700 tnum shrink-0">{r.time}</span>
                      <span className="text-[13px] font-extrabold text-ink-900 grow truncate">{r.name}</span>
                      <span className="text-[11.5px] font-extrabold text-ink-500 tnum shrink-0">{r.party}명</span>
                    </div>

                    {/* 승인 여부를 판단하려면 날짜·좌석 유형·요청사항이 다 보여야 한다 */}
                    <div className="text-[11px] font-bold text-ink-400 mt-1 tnum">
                      {r.date} · {r.eta} · {r.seatType}
                    </div>
                    <div className="text-[11px] font-bold text-ink-400 mt-0.5 tnum">{r.phone}</div>
                    {r.memo && (
                      <div className="text-[11.5px] font-medium text-ink-700 mt-2 p-2 rounded-lg bg-ink-50 leading-relaxed">
                        {r.memo}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="ok" size="sm" full icon="check"
                        onClick={() => void decideRes(r.id, 'approve')}
                      >
                        승인
                      </Button>
                      <Button variant="outline" size="sm" full onClick={() => setRejecting(r)}>
                        거절
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 space-y-2">
            {todayRes.length === 0 && pending.length === 0 && (
              <div className="py-10 text-center text-[12px] font-bold text-ink-400">
                오늘 예약이 없어요
              </div>
            )}
            {todayRes.map((r) => {
              /* [b10] 상태의 '말'과 색을 lib/tokens.ts 에서 가져온다.
                 전에는 여기 삼항이 박혀 있었다 —
                   r.status === 'upcoming' ? r.eta : r.status === 'seated' ? '착석' : '미방문'
                 else 가 '미방문'이라 거절·취소·방문 완료가 전부 미방문으로 보였다.
                 타입을 넓혀도 컴파일러가 못 잡는 모양이라(else 가 다 받는다)
                 표 조회로 바꾼다. 상태가 또 늘면 Record 가 컴파일 에러로 잡아 준다. */
              const st = RES_ADMIN[r.status];
              const open = isOpenAdminRes(r.status);
              return (
                <div
                  key={r.id}
                  className={cx(
                    'p-3.5 rounded-xl border',
                    // 끝난 예약은 눌러 둔다. 관리자가 찾는 건 아직 남은 일이다
                    open ? 'border-ink-200 bg-white' : 'border-ink-200 bg-ink-50 opacity-70'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-extrabold text-brand-700 tnum shrink-0">{r.time}</span>
                    <span className="text-[13px] font-extrabold text-ink-900 grow truncate">{r.name}</span>
                    <span className="text-[11.5px] font-extrabold text-ink-500 tnum shrink-0">{r.party}명</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cx('inline-flex items-center gap-1 text-[11px] font-extrabold', st.text)}>
                      <Icon n={st.icon} s={11} />
                      {st.label}
                    </span>
                    {/* 도착 예정일 때만 '8분 후'가 의미 있다. 끝난 예약에는 '-' 가 들어온다 */}
                    {r.status === 'upcoming' && (
                      <span className="text-[11px] font-bold text-ink-400 tnum">· {r.eta}</span>
                    )}
                  </div>

                  <div className="text-[11px] font-bold text-ink-400 mt-0.5 tnum">{r.phone}</div>
                  {r.memo && <div className="text-[11.5px] font-medium text-ink-500 mt-1.5">{r.memo}</div>}

                  {r.status === 'upcoming' && (
                    /* [a7] 로컬 상태만 바꾸던 것을 실제 API 로 바꿨다.
                       '되돌리기'를 뺐다 — seated → upcoming 역방향 전이는 허용하지 않는다.
                       손님이 이미 앉아 있는데 "아직 안 왔음"으로 되돌리는 건 실제로 없는 일이다. */
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="ok" size="sm" full icon="check"
                        onClick={() => void decideRes(r.id, 'seat')}
                      >
                        입장
                      </Button>
                      <Button
                        variant="outline" size="sm" full
                        onClick={() => void decideRes(r.id, 'cancel')}
                      >
                        취소
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* ── 거절 사유 고르기 ───────────────────────────────
          ★ 사유를 반드시 고르게 한다
            "거절되었습니다" 한 줄만 가면 손님은 다음에 뭘 해야 할지 모른다.
            사유마다 다음 행동이 다르다 — 자리가 없으면 다른 시간,
            인원이 문제면 인원 조정, 휴무면 다른 날짜다.
          ★ 한 번에 끝내고 확인 모달을 겹치지 않는다
            사유를 고르는 행위 자체가 확인이다. 모달을 두 번 띄우면
            관리자는 두 번째를 기계적으로 누르게 된다. */}
      {rejecting && (
        <div
          className="fixed inset-0 z-50 bg-ink-900/40 grid place-items-center p-6"
          onClick={() => setRejecting(null)}
        >
          <div
            className="w-[420px] max-w-full bg-white rounded-2xl shadow-pop overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <div className="text-[16px] font-extrabold text-ink-900">
                이 예약을 받기 어려우신가요?
              </div>
              <div className="text-[12px] font-bold text-ink-500 mt-1 tnum">
                {rejecting.date} {rejecting.time} · {rejecting.name}님 {rejecting.party}명
              </div>
              <div className="text-[11.5px] font-medium text-ink-500 mt-2 leading-relaxed">
                고르신 사유에 맞는 안내가 손님 앱으로 전달돼요.
              </div>
            </div>

            <div className="px-5 pb-2 space-y-1.5">
              {REJECT_REASONS.map((o) => (
                <button
                  key={o.key}
                  className="w-full text-left px-3.5 py-3 rounded-xl border border-ink-200 hover:bg-ink-50 active:scale-[.99] transition-transform"
                  onClick={() => {
                    const target = rejecting;
                    setRejecting(null);
                    void decideRes(target.id, 'reject', o.key as RejectReasonCode);
                  }}
                >
                  <div className="text-[13px] font-extrabold text-ink-900">{o.admin}</div>
                  <div className="text-[11.5px] font-medium text-ink-500 mt-0.5 leading-snug">
                    손님에게 — {o.title}
                  </div>
                </button>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-ink-100">
              <Button variant="ghost" size="sm" full onClick={() => setRejecting(null)}>
                닫기
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.type === 'disable' ? '이 자리를 이용 불가로 설정할까요?' : '예약을 취소할까요?'}
        sub={
          confirm?.type === 'disable'
            ? '손님 앱에서도 이용 불가로 표시되며 예약을 받을 수 없어요.'
            : '고객에게 취소 알림이 발송되고 되돌릴 수 없어요.'
        }
        confirmLabel={confirm?.type === 'disable' ? '이용 불가 설정' : '예약 취소'}
        danger
        onConfirm={() => {
          if (!confirm) return;
          const t = confirm.table;
          if (confirm.type === 'disable') act(t, { status: 'disabled' }, '이용 불가로 변경', 'warn', `${t.code.toUpperCase()} · 손님 앱에서도 이용 불가로 보여요`);
          else cancelReserved(t);
        }}
      />
    </>
  );
}