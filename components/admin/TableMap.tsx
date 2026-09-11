'use client';

import React, { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/format';
import { TABLE } from '@/lib/tokens';
import type { PartnerStore, StoreTable } from '@/lib/types';

/**
 * 테이블 배치도
 * ─────────────────────────────────────────────────────────────
 * ★ 관리자 전용. 손님 화면에서는 배치도를 삭제했다.
 *   손님은 "몇 자리 비었나"만 알면 되고, 자리 배정은 매장이 결정한다.
 *
 * ★ 칸에 테이블 번호(t1, T04 …)를 쓰지 않는다. 좌석 수만 쓴다.
 *   손님과 대화할 때 번호가 새어 나가는 걸 원천 차단하기 위한 규칙이다.
 *
 * ★ '정리 중'은 배치도에 표시하지 않는다 — 빈 자리로 취급한다.
 *   퇴장 처리하면 40초 뒤 자동으로 available 이 되므로 관리자가 신경 쓸 필요가 없다.
 *   (데이터에는 cleaning 이 남아 있으므로 손님 화면의 '정리 중' 수치는 계속 정확하다.)
 */
export const TableMap = ({
  store, onSelect, selectedId, cols = 4, edit = false,
}: {
  store: PartnerStore;
  onSelect?: (t: StoreTable) => void;
  selectedId?: string | null;
  cols?: number;
  edit?: boolean;
}) => {
  const rows = useMemo(() => {
    const m: Record<number, StoreTable[]> = {};
    store.tables.forEach((t) => {
      (m[t.row] = m[t.row] || []).push(t);
    });
    return Object.keys(m)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => m[Number(k)].sort((a, b) => a.col - b.col));
  }, [store.tables]);

  return (
    <div className="space-y-2.5">
      {rows.map((row, ri) => (
        <div key={ri} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
          {row.map((t) => {
            const st = t.status === 'cleaning' ? 'available' : t.status;
            const cfg = TABLE[st];
            const sel = selectedId === t.code;
            return (
              <button
                key={t.id}
                onClick={() => onSelect && onSelect(t)}
                style={{ gridColumn: `span ${t.w || 1}` }}
                className={cx(
                  'relative rounded-xl border-2 px-2 py-3 text-left transition-all min-h-[78px] flex flex-col justify-between',
                  cfg.bg, cfg.border, cfg.hatch,
                  sel && 'ring-4 ring-brand-200 border-brand-500 z-10',
                  onSelect && 'hover:shadow-card hover:scale-[1.02] cursor-pointer active:scale-100'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cx('text-[12px] font-extrabold', cfg.text)}>{cfg.label}</span>
                  <Icon n={cfg.icon} s={14} cls={cfg.text} />
                </div>
                <div>
                  <div className="text-[15px] font-extrabold text-ink-900 tnum leading-none">
                    {t.seats}
                    <span className="text-[11px] font-bold text-ink-500 ml-0.5">인석</span>
                  </div>
                  {st === 'occupied' && t.since && (
                    <div className="text-[10px] text-ink-500 font-bold mt-1 tnum">{t.since}~</div>
                  )}
                  {st === 'reserved' && t.resAt && (
                    <div className="text-[10px] text-brand-600 font-bold mt-1 tnum">{t.resName} · {t.resAt}</div>
                  )}
                  {edit && (
                    <div className="text-[10px] text-ink-400 font-bold mt-1 tnum">{t.row + 1}행 {t.col + 1}열</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
