'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, LiveStamp } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { AdminTopbar } from '@/components/admin/Sidebar';
import { SlotGrid, SlotLegend } from '@/components/admin/SlotGrid';
import { cx, agoText } from '@/lib/format';
import { ADMIN_STORE_ID, SLOT } from '@/lib/tokens';
import { nextSlotCode, parkStats, slotStatus } from '@/lib/status';
import { useApp, useNow } from '@/lib/store';
import type { ParkingSlot } from '@/lib/types';

/**
 * 주차 관리
 * ─────────────────────────────────────────────────────────────
 * ★ 카메라 미리보기가 없다.
 *   감지 방식이 비전(카메라)이 아니라 주차면마다 설치한 센서이기 때문이다.
 *   대신 센서 연결 상태 바를 그 자리에 둔다.
 *
 * ★ 센서는 100% 정확하지 않다는 전제로 만든다.
 *   그래서 다음 네 가지를 반드시 화면에 둔다.
 *     ① 마지막 갱신 시각  ② '확인 중' 상태  ③ 수동 지정  ④ 변경 로그
 *   수동 지정은 2시간 뒤 자동으로 풀린다 — 관리자가 되돌리는 걸 잊어도
 *   센서 값과 영원히 어긋나 있지 않도록 하는 안전장치다.
 *
 * ★ 주차면 칸 크기를 줄이지 않는다.
 *   화면이 좁으면 가로 스크롤 + 전체화면 보기로 해결한다.
 *   칸이 작아지면 터치 정확도가 떨어져서 잘못 누르게 된다.
 */
export default function AdminParkingPage() {
  const { getStore, setSlot, setSlots, setSensor, pushToast, addLog, log } = useApp();
  const now = useNow(1000);

  const [sel, setSel] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<ParkingSlot[] | null>(null);
  const [editSel, setEditSel] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const store = getStore(ADMIN_STORE_ID);
  if (!store) return null;

  const ps = parkStats(store);
  const slot = sel ? store.parking.slots.find((s) => s.code === sel) ?? null : null;
  const stale = now > 0 && now - store.parking.updated > 120000;

  const startEdit = () => {
    setDraft(store.parking.slots.map((s) => ({ ...s })));
    setEditSel(store.parking.slots[0]?.code ?? null);
    setSel(null);
    setEdit(true);
  };
  const cancelEdit = () => { setEdit(false); setDraft(null); setEditSel(null); setUploaded(false); };
  const saveEdit = () => {
    if (!draft) return;
    setSlots(store.id, draft, { who: '최영호', msg: `주차장 배치도 수정 · ${draft.length}면`, tone: 'brand' });
    pushToast({ title: '배치도를 저장했어요', desc: `주차면 ${draft.length}면`, tone: 'ok', icon: 'check' });
    cancelEdit();
  };

  const patch = (code: string, p: Partial<ParkingSlot>) =>
    setDraft((d) => (d ? d.map((s) => (s.code === code ? { ...s, ...p } : s)) : d));
  const taken = (r: number, c: number, except: string | null) =>
    !!draft?.some((s) => s.code !== except && s.row === r && s.col === c);
  const dSlot = draft && editSel ? draft.find((s) => s.code === editSel) ?? null : null;

  const move = (dr: number, dc: number) => {
    if (!dSlot) return;
    const nr = Math.max(0, Math.min(7, dSlot.row + dr));
    const nc = Math.max(0, Math.min(9, dSlot.col + dc));
    if (taken(nr, nc, dSlot.code)) return;
    patch(dSlot.code, { row: nr, col: nc });
  };
  const addSlot = () => {
    if (!draft) return;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        if (!taken(r, c, null)) {
          const code = nextSlotCode(draft);
          // 같은 줄에 이미 있는 면의 구역을 따라간다 (P7~P10 줄에 추가하면 B 구역)
          const zone = draft.find((s) => s.row === r)?.zone ?? draft[0]?.zone ?? 'A';
          setDraft((d) => (d ? [...d, {
            code, row: r, col: c, zone, autoStatus: 'available',
            manualStatus: null, manualUntil: null, manualBy: null, type: null, nearGate: false, confidence: 0.98,
          }] : d));
          setEditSel(code);
          return;
        }
      }
    }
  };
  const delSlot = () => {
    if (!dSlot) return;
    setDraft((d) => (d ? d.filter((s) => s.code !== dSlot.code) : d));
    setEditSel(null);
  };

  const applyManual = (s: ParkingSlot, as: 'available' | 'occupied') => {
    setSlot(store.id, s.code, { manualStatus: as, manualUntil: Date.now() + 2 * 3600 * 1000, manualBy: '최영호' },
      { who: '최영호', msg: `${s.code} 수동 지정 → ${as === 'available' ? '주차 가능' : '주차 중'}`, tone: 'warn' });
    pushToast({ title: `${s.code} 수동 지정`, desc: '2시간 후 자동으로 해제됩니다', tone: 'warn', icon: 'hand' });
    setSel(null);
  };
  const backToAuto = (s: ParkingSlot) => {
    setSlot(store.id, s.code, { manualStatus: null, manualUntil: null, manualBy: null },
      { who: '최영호', msg: `${s.code} 센서 감지로 복귀`, tone: 'ok' });
    pushToast({ title: `${s.code} 센서 감지로 복귀`, tone: 'ok', icon: 'refresh' });
    setSel(null);
  };

  const gridStore = edit && draft ? { ...store, parking: { ...store.parking, slots: draft } } : store;

  return (
    <>
      <AdminTopbar
        title="주차 관리"
        sub={edit ? '배치 편집 중 · 저장해야 반영됩니다' : `총 ${ps.total}면 · 이용 가능 ${ps.available ?? '—'}면`}
        right={
          edit ? (
            <div className="flex items-center gap-2 mr-2">
              <Button variant="ghost" size="sm" onClick={cancelEdit}>취소</Button>
              <Button variant="primary" size="sm" icon="check" onClick={saveEdit}>배치 저장</Button>
            </div>
          ) : (
            <Button
              variant="outline" size="sm" icon="sensor-off" className="mr-2"
              onClick={() => {
                const nx = store.sensor === 'online' ? 'offline' : 'online';
                setSensor(store.id, nx);
                addLog('시스템', `주차면 센서 ${nx === 'offline' ? '연결 끊김' : '연결 복구'}`, nx === 'offline' ? 'busy' : 'ok');
                pushToast({
                  title: nx === 'offline' ? '센서 연결이 끊겼어요' : '센서가 복구되었어요',
                  desc: nx === 'offline' ? '손님 앱에는 「확인 불가」로 표시됩니다' : '실시간 감지를 재개합니다',
                  tone: nx === 'offline' ? 'busy' : 'ok', icon: 'sensor',
                });
              }}
            >
              센서 상태 전환
            </Button>
          )
        }
      />

      <div className="grow overflow-y-auto thin-sb bg-ink-50 p-7">
        {/* 센서 상태 바 (카메라 미리보기 자리) */}
        <Card className={cx('p-4 mb-4 border-2', store.sensor === 'offline' ? 'border-busy-300 bg-busy-50' : stale ? 'border-warn-200' : 'border-ok-200')}>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3 shrink-0">
              <div className={cx('w-11 h-11 rounded-xl grid place-items-center text-white', store.sensor === 'offline' ? 'bg-busy-500' : 'bg-ok-500')}>
                <Icon n={store.sensor === 'offline' ? 'sensor-off' : 'sensor'} s={21} />
              </div>
              <div>
                <div className="text-[13.5px] font-extrabold text-ink-900">
                  {store.sensor === 'offline' ? '주차면 센서 · 응답 없음' : '주차면 센서 · 정상 감지 중'}
                </div>
                <div className="text-[11.5px] font-bold text-ink-500 tnum">
                  주차면 {ps.total}개 · 지자기 센서 · 게이트웨이 1대
                </div>
              </div>
            </div>

            <div className="w-px h-10 bg-ink-200 shrink-0" />

            <div className="shrink-0">
              <div className="text-[11px] font-extrabold text-ink-400 mb-1">마지막 갱신</div>
              <LiveStamp updated={store.parking.updated} offline={store.sensor === 'offline'} />
            </div>

            <div className="grow" />

            <Button variant="outline" size="sm" icon="expand" onClick={() => setFull(true)}>전체화면 보기</Button>
            {!edit && <Button variant="outline" size="sm" icon="grid" onClick={startEdit}>배치 편집</Button>}
          </div>
        </Card>

        {/* 숫자 요약 */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {([
            ['전체', ps.total, 'text-ink-900', 'parkingP'],
            ['주차 가능', ps.available ?? '—', 'text-ok-500', 'check'],
            ['주차 중', ps.occupied ?? '—', 'text-busy-500', 'car'],
            ['확인 중', ps.unknown ?? '—', 'text-unk-500', 'question'],
            ['수동 지정', ps.manual, 'text-warn-500', 'hand'],
          ] as const).map(([l, v, c, i]) => (
            <Card key={l} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11.5px] font-extrabold text-ink-500">{l}</span>
                <Icon n={i} s={15} cls={c} />
              </div>
              <div className={cx('text-[26px] font-extrabold tnum leading-none', c)}>{v}</div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-5">
          <Card className="col-span-2 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[15px] font-extrabold text-ink-900">주차장 배치도</div>
              <SlotLegend />
            </div>

            {/* 도면 업로드 → 격자 정렬 초안 */}
            {edit && (
              <div className="mb-4 rounded-2xl border-2 border-dashed border-ink-300 bg-ink-50 p-5">
                {uploaded ? (
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-ok-500 text-white grid place-items-center shrink-0">
                      <Icon n="check" s={19} />
                    </span>
                    <div>
                      <div className="text-[13px] font-extrabold text-ok-600">도면을 격자로 정렬했어요</div>
                      <div className="text-[11.5px] font-medium text-ink-600 mt-0.5">
                        초안이 만들어졌어요. 아래에서 위치와 종류를 다듬어 주세요.
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setUploaded(true);
                      pushToast({ title: '도면을 격자로 정렬했어요', desc: '초안을 확인하고 다듬어 주세요', tone: 'ok', icon: 'check' });
                    }}
                    className="w-full flex flex-col items-center gap-2 py-3"
                  >
                    <Icon n="image" s={26} cls="text-ink-400" />
                    <span className="text-[13px] font-extrabold text-ink-700">주차장 도면 이미지 올리기</span>
                    <span className="text-[11.5px] font-medium text-ink-500 text-center leading-relaxed">
                      사선으로 놓인 주차장이어도 격자로 반듯하게 정렬해서 초안을 만들어 드려요
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* 가로 스크롤 — 주차면 한 칸 크기를 유지한다 */}
            <div className="rounded-2xl bg-ink-50 border border-ink-200 p-5 overflow-x-auto thin-sb">
              <SlotGrid
                store={gridStore}
                cell={64}
                onSelect={(s) => (edit ? setEditSel(s.code) : setSel(s.code))}
                selectedCode={edit ? editSel : sel}
              />
            </div>

            {/* 편집 도구 */}
            {edit && dSlot && (
              <div className="mt-4 rounded-2xl border-2 border-brand-300 bg-brand-50 p-4 animate-popIn">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="shrink-0">
                    <div className="text-[11.5px] font-extrabold text-ink-500">선택한 주차면</div>
                    <div className="text-[16px] font-extrabold text-ink-900 tnum mt-0.5">
                      {dSlot.code} · {dSlot.row + 1}행 {dSlot.col + 1}열
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1 w-[112px] shrink-0">
                    <span />
                    <Button variant="outline" size="sm" onClick={() => move(-1, 0)}>↑</Button>
                    <span />
                    <Button variant="outline" size="sm" onClick={() => move(0, -1)}>←</Button>
                    <div className="h-9 rounded-xl bg-ink-100 grid place-items-center text-[10px] font-extrabold text-ink-400">이동</div>
                    <Button variant="outline" size="sm" onClick={() => move(0, 1)}>→</Button>
                    <span />
                    <Button variant="outline" size="sm" onClick={() => move(1, 0)}>↓</Button>
                    <span />
                  </div>

                  <div className="shrink-0">
                    <div className="text-[11.5px] font-extrabold text-ink-500 mb-1.5">종류</div>
                    <div className="flex gap-1">
                      {([['일반', null], ['전기차', 'ev'], ['장애인', 'disabled']] as const).map(([l, v]) => (
                        <button
                          key={l}
                          onClick={() => patch(dSlot.code, { type: v })}
                          className={cx(
                            'h-9 px-3 rounded-lg text-[12px] font-extrabold border-2 transition-colors',
                            dSlot.type === v ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-600 border-ink-200'
                          )}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => patch(dSlot.code, { nearGate: !dSlot.nearGate })}
                    className={cx(
                      'h-9 px-3 rounded-lg text-[12px] font-extrabold border-2 shrink-0 mt-5 transition-colors',
                      dSlot.nearGate ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-600 border-ink-200'
                    )}
                  >
                    {dSlot.nearGate ? '✓ 출입구 근처' : '출입구 근처'}
                  </button>

                  <div className="grow" />

                  <div className="flex gap-2 shrink-0 mt-5">
                    <Button variant="outline" size="sm" icon="plus" onClick={addSlot}>주차면 추가</Button>
                    <Button variant="danger" size="sm" icon="x" onClick={delSlot}>삭제</Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* 센서 변경 로그 */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Icon n="sensor" s={17} cls="text-ok-500" />
              <div className="text-[15px] font-extrabold text-ink-900">센서 감지 · 변경 로그</div>
            </div>
            <div className="text-[12px] font-bold text-ink-500 mb-4">
              센서가 보고한 변화와 손으로 지정한 기록이에요
            </div>

            <div className="space-y-3 max-h-[560px] overflow-y-auto thin-sb pr-1">
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

      {/* 전체화면 배치도 */}
      <Modal open={full} onClose={() => setFull(false)} title="주차장 배치도 · 전체화면" w="max-w-6xl">
        <div className="overflow-x-auto thin-sb">
          <SlotGrid store={store} cell={78} onSelect={(s) => { setFull(false); setSel(s.code); }} />
        </div>
        <div className="mt-4"><SlotLegend /></div>
      </Modal>

      {/* 주차면 하나 수동 지정 */}
      <Modal
        open={!!slot}
        onClose={() => setSel(null)}
        title={slot ? `${slot.code} 주차면` : ''}
        sub="센서 값이 실제와 다르면 손으로 지정할 수 있어요"
        w="max-w-md"
      >
        {slot && (() => {
          const eff = store.sensor === 'offline' ? 'offline' : slotStatus(slot);
          const cfg = SLOT[eff];
          const alive = !!(slot.manualStatus && slot.manualUntil && slot.manualUntil > Date.now());
          return (
            <div>
              <div className={cx('rounded-xl border-2 p-4 flex items-center gap-3 mb-4', cfg.bg, cfg.border, cfg.hatch)}>
                <Icon n={cfg.icon} s={22} cls={cfg.text} />
                <div>
                  <div className={cx('text-[15px] font-extrabold', cfg.text)}>{cfg.label}</div>
                  <div className="text-[11.5px] font-bold text-ink-500 mt-0.5">
                    {alive
                      ? `${slot.manualBy} · ${Math.max(0, Math.round(((slot.manualUntil ?? 0) - now) / 60000))}분 후 자동 해제`
                      : `센서 감지 · 신뢰도 ${Math.round(slot.confidence * 100)}%`}
                  </div>
                </div>
              </div>

              {alive ? (
                <Button variant="ok" full icon="refresh" onClick={() => backToAuto(slot)}>
                  센서 감지로 되돌리기
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ok" icon="check" onClick={() => applyManual(slot, 'available')}>비어 있음으로</Button>
                  <Button variant="danger" icon="car" onClick={() => applyManual(slot, 'occupied')}>주차 중으로</Button>
                </div>
              )}

              {slot.autoStatus === 'unknown' && (
                <div className="mt-4 rounded-xl bg-unk-50 border border-unk-200 p-3.5 flex items-start gap-2.5">
                  <Icon n="question" s={16} cls="text-unk-500 shrink-0 mt-px" />
                  <div>
                    <div className="text-[12.5px] font-extrabold text-unk-600">센서 값이 흔들리고 있어요</div>
                    <div className="text-[11.5px] font-medium text-unk-600/80 mt-1 leading-relaxed">
                      차량이 선을 걸쳐 세웠거나 센서 위에 이물질이 있을 수 있어요.
                      손님 앱에는 <b>「확인 중」</b>으로 표시되며 이용 가능 수에 포함되지 않아요.
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <Badge tone="ink" size="sm">{slot.zone} 구역</Badge>
                {slot.nearGate && <Badge tone="brand" size="sm">출입구 근처</Badge>}
                {slot.type === 'ev' && <Badge tone="ok" size="sm" icon="bolt">전기차</Badge>}
                {slot.type === 'disabled' && <Badge tone="brand" size="sm" icon="accessible">장애인 전용</Badge>}
              </div>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
