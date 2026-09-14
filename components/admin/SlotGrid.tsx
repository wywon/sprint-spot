'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/format';
import { SLOT, SLOT_LOT } from '@/lib/tokens';
import { slotStatus } from '@/lib/status';
import type { ParkingSlot, PartnerStore } from '@/lib/types';

/**
 * 주차장 배치도
 * ─────────────────────────────────────────────────────────────
 * ★ 관리자 전용이다. 손님 화면에는 배치도를 보여주지 않는다.
 *   손님에게는 "몇 자리 남았는지"만 알려주면 되고, 어느 칸인지까지 알려주면
 *   그 칸이 사라졌을 때 오히려 신뢰가 깨진다.
 *
 * ★ [b8] 표(格子)가 아니라 "위에서 내려다본 주차장"으로 그린다.
 *   관리자는 이 화면과 실제 주차장(시연에서는 아두이노 모형)을 눈으로 대조한다.
 *   둥근 카드가 간격을 두고 떠 있으면 몇 번째 칸인지 세어야 하지만,
 *   노면 · 흰 주차선 · 주행통로 · 출입구가 실제와 같은 모양이면 위치로 바로 찾는다.
 *     · 주차선은 칸과 칸 사이에 한 줄만 (양쪽 테두리를 겹쳐 두 줄로 만들지 않는다)
 *     · 주차면은 세로로 길다 (실제 2.5m × 5m 비율)
 *     · 줄과 줄 사이는 빈 노면 = 주행통로
 *
 * ★ 칸 안에는 번호만 쓴다.
 *   상태는 색 + 그림(위에서 본 자동차 · 체크 · 물음표 · 끊긴 센서) + 빗금으로 말한다.
 *   번호·상태·그림이 셋 다 칸 가운데를 두고 다투면 아무것도 빨리 안 읽힌다.
 *   상태의 '말'은 범례와 칸을 눌렀을 때 뜨는 창에 있고, 마우스를 올리면 title 로도 뜬다.
 *
 * ★ 그림자·질감·테두리를 쓰지 않는다(평면).
 *   관리자 콘솔이 전부 흰 화면이라 배치도만 입체적이면 혼자 떠 보인다.
 *
 * ★ 접근성 — 색만으로 상태를 전달하지 않는다. 색 + 그림 + 빗금 세 가지를 함께 쓰고,
 *   빗금(lot.hatch)을 빼지 말 것. 색은 lib/tokens.ts 의 SLOT_LOT(노면용)을 쓴다.
 *
 * ★ 칸 위치는 slot.row / slot.col 을 그대로 좌표로 쓴다(절대 배치).
 *   배치 편집의 "3행 2열"과 화면이 1:1로 맞아야 편집 결과를 신뢰할 수 있다.
 *
 * cell: 주차면 한 칸의 가로 픽셀 — **최댓값**이다.
 *   실제 크기는 부모(가로 스크롤 컨테이너)의 폭을 재서 그 안에 다 들어가도록 정한다.
 *     · 카드가 넓으면 cell 까지 키운다 — 남는 공간을 두고 칸만 작으면 읽기만 손해다
 *     · 좁아지면 CELL_MIN 까지만 줄이고, 그 아래로는 줄이지 않고 가로 스크롤에 맡긴다
 *   칸이 더 작아지면 터치 정확도가 떨어져서 잘못 누르게 된다. 그 선이 CELL_MIN 이다.
 */

/** 주차선 두께 */
const LINE = 4;

/** 이보다 작게는 줄이지 않는다 (터치 정확도) */
const CELL_MIN = 62;

/**
 * 위에서 내려다본 자동차.
 * 배치도는 노면을 위에서 본 그림인데 옆에서 본 자동차 아이콘이 놓여 있으면 시점이 어긋난다.
 * 색·라벨은 lib/tokens.ts 가 정하고 여기서는 '주차 중' 칸의 그림만 맡는다.
 */
const CarTop = ({ w = 56 }: { w?: number }) => (
  <svg width={w} height={Math.round(w * 1.62)} viewBox="0 0 24 39" aria-hidden>
    <rect x="2.4" y="1.6" width="19.2" height="35.8" rx="6" fill="rgba(255,255,255,.95)" />
    <path d="M5.6 12.4c1.3-4.6 2.6-6.4 6.4-6.4s5.1 1.8 6.4 6.4z" fill="rgba(0,0,0,.3)" />
    <path d="M5.8 26.6c1.2 4.4 2.5 6 6.2 6s5-1.6 6.2-6z" fill="rgba(0,0,0,.3)" />
    <rect x="4.6" y="15.6" width="14.8" height="8" rx="2" fill="rgba(0,0,0,.13)" />
    <rect x="0" y="13.6" width="3" height="3.4" rx="1.4" fill="rgba(255,255,255,.95)" />
    <rect x="21" y="13.6" width="3" height="3.4" rx="1.4" fill="rgba(255,255,255,.95)" />
  </svg>
);

export const SlotGrid = ({
  store, onSelect, selectedCode, cell = 64,
}: {
  store: PartnerStore;
  onSelect?: (s: ParkingSlot) => void;
  selectedCode?: string | null;
  cell?: number;
}) => {
  const rows = useMemo(() => {
    const m: Record<number, ParkingSlot[]> = {};
    store.parking.slots.forEach((s) => {
      (m[s.row] = m[s.row] || []).push(s);
    });
    return Object.keys(m)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => m[Number(k)].sort((a, b) => a.col - b.col));
  }, [store.parking.slots]);

  const off = store.sensor === 'offline';

  /**
   * 쓸 수 있는 폭을 재서 칸 크기를 정한다.
   * 부모는 overflow-x-auto 컨테이너이므로 clientWidth 가 "보이는 폭"이다.
   * (자기 자신을 재면 minWidth 때문에 내용이 넓어질수록 같이 넓어져서 되먹임이 생긴다)
   */
  const hostRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    // clientWidth 는 부모의 padding 을 포함한다. 그만큼 빼야 실제로 쓸 수 있는 폭이 된다
    const read = () => {
      const cs = getComputedStyle(host);
      setAvail(host.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0'));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  /** 가장 긴 줄의 칸 수 */
  const cols = rows.length ? Math.max(...rows.map((r) => Math.max(...r.map((s) => s.col)) + 1)) : 0;
  const fit = avail && cols ? Math.floor((avail - 40 - LINE * 2) / cols) - LINE : 0;
  const size = fit ? Math.max(CELL_MIN, Math.min(cell, fit)) : cell;

  const w = size;                      // 주차면 폭
  const h = Math.round(size * 1.45);   // 주차면 깊이 — 실제 주차면 비율
  const pitch = w + LINE;              // 주차선 한 줄을 포함한 칸 간격
  const aisle = Math.round(h * 0.9);   // 주행통로 — 차가 돌아나갈 수 있어 보이는 폭

  const fNum = Math.max(15, Math.round(size * 0.25));   // 주차면 번호
  const pad = Math.round(size * 0.3);                   // 번호가 놓인 쪽으로 그림이 밀리지 않게

  /** 한 줄의 가로 폭. 중간에 빈 열이 있어도 실제 col 위치를 지킨다 */
  const rowWidth = (row: ParkingSlot[]) => (Math.max(...row.map((s) => s.col)) + 1) * pitch + LINE;
  const lotW = rows.length ? Math.max(...rows.map(rowWidth)) : 0;

  /**
   * 출입구가 어느 쪽인가 — `nearGate` 주차면(입출차 감지 센서가 붙은 끝)이 몰린 쪽.
   * 표지를 손으로 찍어 두면 배치를 바꿨을 때 표지만 옛 자리에 남는다.
   */
  const gate = useMemo(() => {
    const g = store.parking.slots.filter((s) => s.nearGate);
    if (!g.length || !rows.length) return null;
    const maxCol = Math.max(...store.parking.slots.map((s) => s.col));
    const avg = g.reduce((a, s) => a + s.col, 0) / g.length;
    return { right: avg >= maxCol / 2 };
  }, [store.parking.slots, rows.length]);

  /** 마지막 줄 옆에 빈 노면이 남으면 거기에, 아니면 줄 아래에 표지를 둔다 */
  const gateH = Math.round(size * 0.5);
  const spare = rows.length ? lotW - rowWidth(rows[rows.length - 1]) : 0;
  const gateInline = !!gate && spare >= Math.round(size * 1.7);

  const GatePlate = gate ? (
    <span
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink-800 px-4"
      style={{ height: gateH, fontSize: Math.max(12, Math.round(size * 0.16)) }}
    >
      <Icon n="parkingP" s={Math.round(size * 0.21)} cls="text-white" />
      <span className="font-extrabold text-white tracking-[.08em]">출입구</span>
    </span>
  ) : null;

  if (!rows.length) {
    return (
      <div className="lot-ground rounded-2xl p-10 grid place-items-center" style={{ minWidth: 280 }}>
        <div className="text-center">
          <div className="text-[13px] font-extrabold text-ink-700">주차면이 없어요</div>
          <div className="text-[11.5px] font-medium text-ink-500 mt-1">배치 편집에서 주차면을 추가해 주세요</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="lot-ground relative rounded-2xl p-5" style={{ minWidth: lotW + 40 }}>
      <div className="relative" style={{ width: lotW }}>
        {rows.map((row, i) => {
          /** 통로를 향한 쪽(열린 쪽). 첫 줄은 아래, 나머지 줄은 위가 통로를 향한다 */
          const openDown = i === 0 && rows.length > 1;
          const rw = rowWidth(row);
          const last = i === rows.length - 1;

          return (
            <React.Fragment key={i}>
              <div className="relative" style={{ height: h }}>
                {row.map((s) => {
                  const eff = off ? 'offline' : slotStatus(s);
                  const isManual = s.manualStatus && s.manualUntil && s.manualUntil > Date.now();
                  const key = s.type === 'disabled' && eff !== 'occupied' ? 'disabled' : (eff in SLOT ? eff : 'unknown');
                  const cfg = SLOT[key];       // 말(라벨·아이콘)
                  const lot = SLOT_LOT[key];   // 노면 위 색
                  const sel = selectedCode === s.code;
                  const left = s.col * pitch;

                  return (
                    <React.Fragment key={s.code}>
                      {/* 주차선 — 칸의 좌/우 경계에 한 줄씩. 옆 칸과 위치가 같아 두 줄로 겹치지 않는다 */}
                      <span className="absolute top-0 bg-white" style={{ left, width: LINE, height: h }} />
                      <span className="absolute top-0 bg-white" style={{ left: left + pitch, width: LINE, height: h }} />

                      <button
                        onClick={() => onSelect && onSelect(s)}
                        title={`${s.code} · ${cfg.label}${s.nearGate ? ' · 출입구 근처' : ''}`}
                        aria-label={`${s.code} ${cfg.label}`}
                        style={{ left: left + LINE, width: w, height: h }}
                        className={cx(
                          'absolute top-0 rounded-[3px] overflow-hidden transition-[filter,outline] duration-150',
                          lot.fill, lot.hatch,
                          sel && 'outline outline-[3px] outline-brand-500 z-20',
                          onSelect && 'hover:brightness-110 hover:z-10 cursor-pointer active:brightness-100'
                        )}
                      >
                        {/* 상태 그림 — 번호가 놓인 쪽은 비워 둔다 */}
                        <span
                          className="absolute inset-0 grid place-items-center"
                          style={openDown ? { paddingTop: pad } : { paddingBottom: pad }}
                        >
                          {eff === 'occupied'
                            ? <CarTop w={Math.round(size * 0.6)} />
                            : <Icon n={cfg.icon} s={Math.round(size * 0.52)} cls={lot.text} />}
                        </span>

                        {/* 주차면 번호 — 통로 반대쪽 끝 */}
                        <span
                          className={cx('absolute inset-x-0 text-center tnum font-extrabold leading-none', lot.text)}
                          style={{ fontSize: fNum, ...(openDown ? { top: Math.round(size * 0.15) } : { bottom: Math.round(size * 0.15) }) }}
                        >
                          {s.code}
                        </span>

                        {s.type === 'ev' && (
                          <span className={cx('absolute right-1 text-[9px] font-extrabold text-ok-900 bg-ok-200 px-1 rounded', openDown ? 'bottom-1' : 'top-1')}>
                            EV
                          </span>
                        )}
                        {isManual && (
                          <span className={cx('absolute right-1 text-white', openDown ? 'bottom-1' : 'top-1')}>
                            <Icon n="hand" s={13} />
                          </span>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}

                {/* 노면 선 — 칸 위에 덧그린다.
                    바깥쪽 끝선은 그 줄의 폭만큼(주차면이 여기서 끝난다),
                    통로와 맞닿은 경계선은 주차장 폭 전체로 길게(차로는 이어진다). */}
                <span
                  className="absolute z-30 pointer-events-none bg-white left-0"
                  style={openDown ? { width: rw, height: LINE, top: 0 } : { width: rw, height: LINE, bottom: 0 }}
                />
                {i > 0 && <span className="absolute z-30 pointer-events-none left-0 top-0 h-[2px] bg-white/90" style={{ width: lotW }} />}
                {i < rows.length - 1 && <span className="absolute z-30 pointer-events-none left-0 bottom-0 h-[2px] bg-white/90" style={{ width: lotW }} />}

                {/* 출입구 표지 — 마지막 줄 옆 빈 노면에 */}
                {last && gateInline && (
                  <span
                    className="absolute z-30 pointer-events-none"
                    style={{
                      bottom: Math.round(size * 0.12),
                      ...(gate!.right ? { right: 0 } : { left: rw + 12 }),
                    }}
                  >
                    {GatePlate}
                  </span>
                )}
              </div>

              {/* 주행통로 — 빈 노면. 글자도 화살표도 얹지 않는다 */}
              {i < rows.length - 1 && <div style={{ height: aisle }} />}
            </React.Fragment>
          );
        })}

        {/* 옆에 자리가 없으면 줄 아래에 */}
        {gate && !gateInline && (
          <div className={cx('mt-3 flex', gate.right ? 'justify-end' : 'justify-start')}>{GatePlate}</div>
        )}
      </div>
    </div>
  );
};

/**
 * 범례
 * ★ 배치도 칸에는 번호만 쓰므로, 상태의 '말'은 여기서 책임진다. 지우지 말 것.
 *   조각 색도 배치도와 같아야 한다 — 범례만 다른 색이면 범례를 보고 칸을 찾지 못한다.
 */
export const SlotLegend = () => (
  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
    {(['available', 'occupied', 'unknown', 'offline', 'manual'] as const).map((k) => {
      const c = SLOT[k];
      const lot = SLOT_LOT[k];
      return (
        <span key={k} className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-700">
          <span className={cx('w-[18px] h-[18px] rounded-[3px] grid place-items-center', lot.fill, lot.hatch)}>
            <Icon n={c.icon} s={11} cls={lot.text} />
          </span>
          {c.label}
        </span>
      );
    })}
  </div>
);
