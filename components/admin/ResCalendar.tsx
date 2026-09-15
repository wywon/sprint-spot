'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/overlays';
import { cx, pad } from '@/lib/format';
import { adaptAdminRes, type ApiAdminRes } from '@/lib/adapt';
import { ADMIN_STORE_ID } from '@/lib/tokens';
import type { AdminReservation } from '@/lib/types';

/**
 * 예약 달력
 * ─────────────────────────────────────────────────────────────
 * 대시보드의 '오늘 예약' 카드를 누르면 열린다.
 * 어느 날 · 몇 시 · 누가 예약했는지를 한 화면에서 본다.
 * 관리자에게 가장 자주 필요한 조회이므로 1클릭 안에 둔다.
 *
 * [b9] lib/mock.ts 의 MONTH_RES → GET /api/admin/reservations?month= 로 교체.
 *      목업은 2026년 8·9월만 있는 인덱스 기반 가짜 데이터라 10월로 넘기면 전부 0건이었다.
 *
 * ★ 열려 있을 때만 읽는다
 *   3초 폴링에 얹지 않는다. 달력은 '지금 상황'이 아니라 '조회'다.
 *   닫혀 있는 모달 때문에 한 달치를 3초마다 실어 나를 이유가 없다.
 *
 * ★ 날짜별로 묶는 일은 여기서 한다
 *   서버는 adminRes 와 같은 평평한 배열을 준다. 묶기는 이 화면의 사정이다.
 *
 * ★ 첫 화면은 이번 달 · 오늘
 *   전에는 2026-08 · 18일이 코드에 박혀 있었다. 관리자가 달력을 여는 이유는
 *   대개 '오늘과 그 앞뒤'를 보려는 것이다.
 */

/** 지금 이 순간의 KST 날짜 'YYYY-MM-DD'. 서버·브라우저 시간대가 달라도 같은 답 */
function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const ResCalendar = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  /* 서버 렌더 때는 날짜를 모른다(hydration). 열릴 때 채운다 */
  const [today, setToday] = useState('');
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  const [rows, setRows] = useState<AdminReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  /* 모달이 열리는 순간 '오늘'로 맞춘다. 닫았다 다시 열면 자정을 넘겼어도 정확하다 */
  useEffect(() => {
    if (!open) return;
    const t = kstToday();
    setToday(t);
    setYm({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) });
    setPick(t);
  }, [open]);

  const monthKey = ym ? `${ym.y}-${pad(ym.m)}` : null;

  const load = useCallback(async () => {
    if (!monthKey) return;
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(
        `/api/admin/reservations?storeId=${ADMIN_STORE_ID}&month=${monthKey}`,
        { cache: 'no-store' },
      );
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as ApiAdminRes[];
      setRows(data.map(adaptAdminRes));
    } catch (e) {
      console.error('[ResCalendar]', e);
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    if (!open || !monthKey) return;
    void load();
  }, [open, monthKey, load]);

  /** 날짜별로 묶는다. 서버가 date·time 순으로 보내므로 그대로 쌓으면 정렬이 유지된다 */
  const byDate = useMemo(() => {
    const m: Record<string, AdminReservation[]> = {};
    rows.forEach((r) => {
      if (!r.date) return;
      (m[r.date] = m[r.date] || []).push(r);
    });
    return m;
  }, [rows]);

  if (!ym) {
    // 아직 '오늘'을 모르는 상태 (모달이 닫혀 있을 때)
    return <Modal open={open} onClose={onClose} title="예약 달력" w="max-w-3xl" />;
  }

  const first = new Date(ym.y, ym.m - 1, 1).getDay();
  const last = new Date(ym.y, ym.m, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: last }, (_, i) => i + 1),
  ];

  const move = (d: number) => {
    let { y, m } = ym;
    m += d;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setYm({ y, m });
    setPick(null);
  };

  const list = pick ? byDate[pick] ?? [] : [];

  return (
    <Modal open={open} onClose={onClose} title="예약 달력" sub="날짜를 누르면 그날 예약을 볼 수 있어요" w="max-w-3xl">
      <div className="flex gap-6">
        {/* 달력 */}
        <div className="w-[420px] shrink-0">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => move(-1)} className="w-9 h-9 rounded-lg hover:bg-ink-100 grid place-items-center text-ink-600" aria-label="이전 달">
              <Icon n="chevL" s={18} />
            </button>
            <div className="text-[15px] font-extrabold text-ink-900 tnum flex items-center gap-2">
              {ym.y}년 {ym.m}월
              {loading && <span className="text-[11px] font-bold text-ink-400">불러오는 중…</span>}
            </div>
            <button onClick={() => move(1)} className="w-9 h-9 rounded-lg hover:bg-ink-100 grid place-items-center text-ink-600" aria-label="다음 달">
              <Icon n="chevR" s={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={cx('text-center text-[11px] font-extrabold py-1', i === 0 ? 'text-busy-400' : i === 6 ? 'text-brand-500' : 'text-ink-400')}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const key = `${ym.y}-${pad(ym.m)}-${pad(d)}`;
              const n = (byDate[key] ?? []).length;
              const on = pick === key;
              const isToday = key === today;
              return (
                <button
                  key={key}
                  onClick={() => setPick(key)}
                  className={cx(
                    'h-[54px] rounded-lg border flex flex-col items-center justify-center gap-1 transition-all',
                    on ? 'bg-brand-600 border-brand-600 text-white'
                      // 오늘은 선택되지 않았을 때도 테두리로 구분한다 — 관리자가 기준점으로 삼는 날이다
                      : isToday ? 'bg-white border-brand-400 border-2'
                      : 'bg-white border-ink-200 hover:border-brand-300'
                  )}
                >
                  <span className={cx('text-[13px] font-extrabold tnum', on ? 'text-white' : isToday ? 'text-brand-700' : 'text-ink-800')}>{d}</span>
                  {n > 0 && (
                    <span className={cx('text-[9.5px] font-extrabold px-1.5 rounded-full tnum', on ? 'bg-white/25' : 'bg-brand-50 text-brand-700')}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-warn-50 border border-warn-200 px-3 py-2">
              <span className="text-[11.5px] font-bold text-warn-600">예약을 불러오지 못했어요</span>
              <button onClick={() => void load()} className="text-[11.5px] font-extrabold text-brand-700 underline shrink-0">
                다시 시도
              </button>
            </div>
          )}
        </div>

        {/* 그날 예약 목록 */}
        <div className="grow min-w-0">
          <div className="text-[13.5px] font-extrabold text-ink-900 mb-3">
            {pick ? `${Number(pick.slice(5, 7))}월 ${Number(pick.slice(8))}일 예약` : '날짜를 선택해 주세요'}
            {pick && <span className="text-[12px] font-bold text-ink-400 ml-2 tnum">{list.length}건</span>}
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto thin-sb pr-1">
            {loading && rows.length === 0 ? (
              <div className="py-10 text-center text-[12.5px] font-bold text-ink-400">불러오는 중이에요</div>
            ) : list.length === 0 ? (
              <div className="py-10 text-center text-[12.5px] font-bold text-ink-400">
                {pick ? '예약이 없는 날이에요' : '왼쪽 달력에서 날짜를 선택해 주세요'}
              </div>
            ) : (
              list.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-ink-200 bg-white">
                  <span className="text-[13px] font-extrabold text-brand-700 tnum w-[42px] shrink-0">{r.time}</span>
                  <div className="grow min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-extrabold text-ink-900 truncate">{r.name}</span>
                      {/* 승인 대기는 관리자가 아직 답하지 않은 요청이다. 달력에서도 눈에 띄어야 한다 */}
                      {r.status === 'pending' && (
                        <span className="text-[10px] font-extrabold text-warn-600 bg-warn-50 border border-warn-200 rounded px-1 shrink-0">
                          승인 대기
                        </span>
                      )}
                    </div>
                    {r.memo && <div className="text-[11px] font-medium text-ink-500 truncate mt-0.5">{r.memo}</div>}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-extrabold text-ink-500 tnum shrink-0">
                    <Icon n="people" s={13} />
                    {r.party}명
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
