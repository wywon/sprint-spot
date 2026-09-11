'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button, Card, Gauge, Segmented } from '@/components/ui/primitives';
import { AdminTopbar } from '@/components/admin/Sidebar';
import { KPI, StatBar, StatRow } from '@/components/admin/KPI';
import { SlotGrid, SlotLegend } from '@/components/admin/SlotGrid';
import { TableMap } from '@/components/admin/TableMap';
import { cx } from '@/lib/format';
import { ADMIN_STORE_ID } from '@/lib/tokens';
import { nextSlotCode } from '@/lib/status';
import { useApp } from '@/lib/store';
import type { ParkingSlot, PartnerStore, StoreTable } from '@/lib/types';

/**
 * 매장 관리 (구 '매장 설정')
 * ─────────────────────────────────────────────────────────────
 * 탭 4개 : 매장 정보 · 테이블 구성 · 주차장 구성 · 이용 통계
 *
 * ★ 카메라 감지 설정 항목이 없다. 감지가 센서 방식이므로 존재할 이유가 없다.
 * ★ 배치도 편집은 여기로 모았다. 홀 운영·주차 관리 화면은 '지금 상황을 본다'는
 *   목적에 집중시키고, '구조를 바꾼다'는 목적은 이 화면으로 분리한 것이다.
 *   (주차 관리에도 편집 진입점은 남겨 뒀다 — 자주 쓰는 동선이라서.)
 */
export default function AdminStorePage() {
  const { getStore } = useApp();
  const [tab, setTab] = useState<'info' | 'tables' | 'parking' | 'stats'>('info');

  const store = getStore(ADMIN_STORE_ID);
  if (!store) return null;

  const TITLE = { info: '매장 정보', tables: '테이블 구성', parking: '주차장 구성', stats: '이용 통계' };

  return (
    <>
      <AdminTopbar
        title="매장 관리"
        sub={TITLE[tab]}
        right={
          <div className="mr-2">
            <Segmented
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'info', label: '매장 정보' },
                { value: 'tables', label: '테이블 구성' },
                { value: 'parking', label: '주차장 구성' },
                { value: 'stats', label: '이용 통계' },
              ]}
            />
          </div>
        }
      />

      <div className="grow overflow-y-auto thin-sb bg-ink-50 p-7">
        {tab === 'info' && <SetInfo store={store} />}
        {tab === 'tables' && <SetTables store={store} />}
        {tab === 'parking' && <SetParking store={store} />}
        {tab === 'stats' && <SetStats store={store} />}
      </div>
    </>
  );
}

/* ── 매장 정보 ─────────────────────────────────────────── */

/**
 * [b4] 매장 정보 — 보기 / 수정 두 모드
 *
 * ★ 왜 draft 를 따로 두는가
 *   lib/store.tsx 가 3초마다 서버를 다시 읽어 store 를 통째로 갈아 끼운다.
 *   input 을 store 값에 바로 묶으면 타이핑 도중 3초마다 값이 되돌아간다.
 *   그래서 '수정' 을 누른 순간 값을 한 번 복사해 두고, 저장·취소 전까지는
 *   폴링 결과를 쳐다보지 않는다. 테이블·주차장 구성 탭과 같은 방식이다.
 */
function SetInfo({ store }: { store: PartnerStore }) {
  const { updateStoreInfo, pushToast, addLog } = useApp();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<InfoDraft | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const rows: [string, string][] = [
    ['매장명', store.name], ['업종', store.cat], ['주소', store.addr],
    ['전화번호', store.tel], ['영업시간', store.open], ['가격대', store.price],
    ['주차 요금', store.parking.fee],
  ];

  const start = () => {
    const [openAt = '', closeAt = ''] = (store.open || '').split('-').map((v) => v.trim());
    setDraft({
      name: store.name, cat: store.cat, addr: store.addr, tel: store.tel,
      openAt, closeAt, price: store.price, parkingFee: store.parking.fee,
    });
    setTouched({});
    setEdit(true);
  };

  const cancel = () => {
    if (draft && dirtyOf(store, draft) && !confirm('저장하지 않고 나갈까요?')) return;
    setEdit(false);
    setDraft(null);
  };

  const set = (k: keyof InfoDraft, v: string) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const errors = draft ? validateInfo(draft) : {};
  const canSave = Object.keys(errors).length === 0;

  const save = () => {
    if (!draft || !canSave) return;
    const open = draft.openAt && draft.closeAt ? `${draft.openAt} - ${draft.closeAt}` : '';

    updateStoreInfo(store.id, {
      name: draft.name.trim(),
      cat: draft.cat.trim(),
      addr: draft.addr.trim(),
      tel: draft.tel.trim(),
      open,
      price: draft.price.trim(),
      parkingFee: draft.parkingFee.trim(),
    });

    addLog('최영호', `매장 정보 수정 · ${draft.name.trim()}`, 'brand');
    pushToast({
      title: '매장 정보를 저장했어요',
      desc: '손님 앱 매장 상세에 바로 반영됩니다',
      tone: 'ok',
      icon: 'check',
    });
    setEdit(false);
    setDraft(null);
  };

  return (
    <div className="grid grid-cols-3 gap-5">
      <Card className="col-span-2 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-extrabold text-ink-900">기본 정보</div>
          {edit ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={cancel}>취소</Button>
              <Button variant="primary" size="sm" icon="check" disabled={!canSave} onClick={save}>저장</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" icon="pencil" onClick={start}>수정</Button>
          )}
        </div>

        {edit && draft ? (
          <>
            <div className="mb-5 rounded-xl bg-brand-50 border border-brand-200 px-4 py-3 flex items-start gap-2.5">
              <Icon n="question" s={16} cls="text-brand-600 shrink-0 mt-px" />
              <div className="text-[12px] font-medium text-brand-700 leading-relaxed">
                저장하면 <b>손님 앱 매장 상세</b>에 바로 반영됩니다. 수정하는 동안에는
                실시간 갱신이 이 화면의 입력값을 덮어쓰지 않습니다.
              </div>
            </div>

            <div className="space-y-4">
              <InfoField label="매장명" error={touched.name ? errors.name : undefined}>
                <input
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                  maxLength={40}
                  placeholder="대흥동 손칼국수"
                  className={infoInput(touched.name && errors.name)}
                />
              </InfoField>

              <div className="grid grid-cols-2 gap-4">
                <InfoField label="업종" error={touched.cat ? errors.cat : undefined}>
                  <input
                    value={draft.cat}
                    onChange={(e) => set('cat', e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, cat: true }))}
                    maxLength={20}
                    placeholder="칼국수 · 분식"
                    className={infoInput(touched.cat && errors.cat)}
                  />
                </InfoField>

                <InfoField
                  label="전화번호"
                  optional
                  error={touched.tel ? errors.tel : undefined}
                >
                  <input
                    value={draft.tel}
                    onChange={(e) => set('tel', e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, tel: true }))}
                    inputMode="tel"
                    placeholder="042-256-1234"
                    className={cx(infoInput(touched.tel && errors.tel), 'tnum')}
                  />
                </InfoField>
              </div>

              <InfoField label="주소" error={touched.addr ? errors.addr : undefined}>
                <input
                  value={draft.addr}
                  onChange={(e) => set('addr', e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, addr: true }))}
                  maxLength={100}
                  placeholder="대전 중구 대흥동 123-4"
                  className={infoInput(touched.addr && errors.addr)}
                />
              </InfoField>

              <InfoField
                label="영업시간"
                help="손님 앱의 '영업 중 / 영업 종료' 표시와 예약 가능 시간이 이 값으로 계산됩니다"
                error={touched.hours ? errors.hours : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="time"
                    value={draft.openAt}
                    onChange={(e) => set('openAt', e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, hours: true }))}
                    className={cx(infoInput(touched.hours && errors.hours), 'tnum w-[150px]')}
                  />
                  <span className="text-[13px] font-extrabold text-ink-400">–</span>
                  <input
                    type="time"
                    value={draft.closeAt}
                    onChange={(e) => set('closeAt', e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, hours: true }))}
                    className={cx(infoInput(touched.hours && errors.hours), 'tnum w-[150px]')}
                  />
                </div>
              </InfoField>

              <div className="grid grid-cols-2 gap-4">
                <InfoField label="가격대" optional error={touched.price ? errors.price : undefined}>
                  <input
                    value={draft.price}
                    onChange={(e) => set('price', e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, price: true }))}
                    maxLength={40}
                    placeholder="8,000~14,000원"
                    className={infoInput(touched.price && errors.price)}
                  />
                </InfoField>

                <InfoField
                  label="주차 요금"
                  optional
                  error={touched.parkingFee ? errors.parkingFee : undefined}
                >
                  <input
                    value={draft.parkingFee}
                    onChange={(e) => set('parkingFee', e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, parkingFee: true }))}
                    maxLength={60}
                    placeholder="식사 시 1시간 무료 · 이후 10분 300원"
                    className={infoInput(touched.parkingFee && errors.parkingFee)}
                  />
                </InfoField>
              </div>
            </div>
          </>
        ) : (
          rows.map(([l, v]) => (
            <div key={l} className="flex gap-4 py-3 border-b border-ink-100 last:border-0">
              <span className="w-[104px] shrink-0 text-[12.5px] font-extrabold text-ink-500">{l}</span>
              <span className="text-[13.5px] font-bold text-ink-800">
                {v || <span className="text-ink-400">등록되지 않음</span>}
              </span>
            </div>
          ))
        )}
      </Card>

      <div className="space-y-5">
        <Card className="p-6">
          <div className="text-[15px] font-extrabold text-ink-900 mb-1">손님 앱 노출</div>
          <div className="text-[12px] font-medium text-ink-500 leading-relaxed mb-4">
            입점 매장은 손님 앱 지도에 <b>실시간 좌석·주차</b>와 함께 표시됩니다.
          </div>
          <div className="rounded-xl bg-ok-50 border border-ok-200 p-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-ok-500 text-white grid place-items-center">
              <Icon n="check" s={18} />
            </span>
            <div>
              <div className="text-[12.5px] font-extrabold text-ok-600">노출 중</div>
              <div className="text-[11px] font-bold text-ok-600/75">좌석 · 주차 · 예약 모두 공개</div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-[15px] font-extrabold text-ink-900 mb-4">운영 규칙</div>
          <div className="space-y-3.5">
            {([
              ['정리 중 자동 해제', '40초 뒤 빈 자리로 전환'],
              ['미방문 자동 처리', '예약 시각 10분 경과 시 자동 전환'],
              ['수동 지정 유지시간', '2시간 뒤 센서 감지로 복귀'],
            ] as const).map(([l, v]) => (
              <div key={l} className="flex items-center justify-between">
                <div>
                  <div className="text-[12.5px] font-extrabold text-ink-800">{l}</div>
                  <div className="text-[11px] font-bold text-ink-500 mt-0.5">{v}</div>
                </div>
                <span className="w-10 h-6 rounded-full bg-brand-600 relative shrink-0">
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white" />
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── 매장 정보 폼 보조 ──────────────────────────────────────
   ★ export 를 붙이지 않는다. page.tsx 는 default 외의 export 를 허용하지 않는다.
     5주차에 components/ui/primitives.tsx 로 옮기면 my/edit 의 Field 와 합칠 수 있다. */

interface InfoDraft {
  name: string;
  cat: string;
  addr: string;
  tel: string;
  openAt: string;   // 'HH:MM'
  closeAt: string;  // 'HH:MM'
  price: string;
  parkingFee: string;
}

/** 전화번호 — 숫자와 하이픈만. 서버(app/api/admin/stores/[id])와 같은 규칙 */
const TEL_RE = /^\d[\d-]{7,14}$/;

/**
 * 서버 검증과 같은 규칙을 화면에서도 한 번 본다.
 * 서버 검증을 없애자는 뜻이 아니다. 왕복 한 번을 아껴 오타를 즉시 알려 주려는 것이고,
 * 최종 판단은 언제나 서버가 한다.
 */
function validateInfo(d: InfoDraft): Record<string, string> {
  const e: Record<string, string> = {};

  if (!d.name.trim()) e.name = '매장명을 입력해 주세요';
  if (!d.cat.trim()) e.cat = '업종을 입력해 주세요';
  if (!d.addr.trim()) e.addr = '주소를 입력해 주세요';

  const tel = d.tel.trim();
  if (tel && !TEL_RE.test(tel)) e.tel = '숫자와 - 만 넣어 주세요. 예) 042-256-1234';

  const { openAt: o, closeAt: c } = d;
  if (o || c) {
    if (!o || !c) e.hours = '시작 시각과 종료 시각을 모두 입력해 주세요';
    // ★ 자정을 넘기는 영업시간은 아직 저장할 수 없다.
    //   손님 화면의 '영업 중' 판단이 open ≤ 지금 < close 한 줄이라 하루 종일 종료로 뜬다.
    else if (c <= o) e.hours = '종료 시각이 시작 시각보다 빠릅니다. 자정을 넘기는 영업시간은 아직 등록할 수 없어요';
  }

  if (d.price.trim().length > 40) e.price = '40자 이내로 입력해 주세요';
  if (d.parkingFee.trim().length > 60) e.parkingFee = '60자 이내로 입력해 주세요';

  return e;
}

/** 저장하지 않고 나갈 때 확인 창을 띄울지 판단한다 */
function dirtyOf(store: PartnerStore, d: InfoDraft) {
  const [o = '', c = ''] = (store.open || '').split('-').map((v) => v.trim());
  return (
    d.name !== store.name || d.cat !== store.cat || d.addr !== store.addr ||
    d.tel !== store.tel || d.openAt !== o || d.closeAt !== c ||
    d.price !== store.price || d.parkingFee !== store.parking.fee
  );
}

const infoInput = (bad?: string | false) =>
  cx(
    'w-full h-11 rounded-xl border px-3.5 text-[13.5px] font-bold text-ink-900 outline-none transition-colors',
    bad ? 'border-busy-500 focus:border-busy-500' : 'border-ink-200 focus:border-brand-500'
  );

function InfoField({
  label, help, error, optional, children,
}: {
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[12px] font-extrabold text-ink-700">{label}</span>
        {optional && <span className="text-[11px] font-bold text-ink-400">선택</span>}
      </div>
      {children}
      {error ? (
        <div className="flex items-start gap-1 mt-1.5">
          <Icon n="alert" s={13} cls="text-busy-500 shrink-0 mt-px" />
          <span className="text-[11.5px] font-bold text-busy-500">{error}</span>
        </div>
      ) : help ? (
        <div className="text-[11.5px] font-medium text-ink-500 mt-1.5 leading-relaxed">{help}</div>
      ) : null}
    </div>
  );
}

/* ── 테이블 구성 · 배치도 편집 ─────────────────────────── */

/**
 * [b6] 테이블 배치도 — 저장이 서버까지 간다
 *
 * ★ 왜 code 로 고르는가
 *   DB 의 id 는 's1_t1' 이고 code 가 't1' 이다. 새로 추가한 테이블은 아직 DB 에
 *   없어서 id 가 없다. 화면과 서버가 테이블을 알아보는 기준을 code 하나로 통일한다.
 *
 * ★ 왜 편집 중 폴링을 멈추는가
 *   3초마다 서버를 다시 읽어 store 를 갈아 끼우므로, 안 멈추면 방금 옮긴 테이블이
 *   3초 뒤 제자리로 돌아간다. 매장 정보 탭이 draft 를 쓰는 것과 같은 이유다.
 */
function SetTables({ store }: { store: PartnerStore }) {
  const { setTables, setEditing, pushToast } = useApp();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<StoreTable[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const list = edit && draft ? draft : store.tables;
  const view = { ...store, tables: list };
  const t = sel ? list.find((x) => x.code === sel) ?? null : null;
  const seats = list.reduce((a, b) => a + b.seats, 0);

  useEffect(() => {
    setEditing(edit);
    return () => setEditing(false);
  }, [edit, setEditing]);

  /* 저장하지 않고 탭을 닫으려 하면 붙잡는다 */
  useEffect(() => {
    if (!edit) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [edit]);

  const start = () => {
    setDraft(store.tables.map((x) => ({ ...x })));
    setSel(store.tables[0]?.code ?? null);
    setEdit(true);
  };
  const cancel = () => { setEdit(false); setDraft(null); setSel(null); };

  /* ★ 실패하면 편집 모드를 닫지 않는다. 몇 분 걸려 옮긴 배치를 오류 한 번에
       버리게 하면 안 된다. 실패 안내 문구는 서버가 보내고 store.tsx 가 띄운다. */
  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    const ok = await setTables(store.id, draft, {
      who: '최영호', msg: `테이블 배치도 수정 · ${draft.length}개`, tone: 'brand',
    });
    setSaving(false);
    if (!ok) return;

    pushToast({
      title: '테이블 배치도를 저장했어요',
      desc: `총 ${draft.length}개 · ${draft.reduce((a, b) => a + b.seats, 0)}석`,
      tone: 'ok', icon: 'check',
    });
    cancel();
  };

  const patch = (code: string, p: Partial<StoreTable>) =>
    setDraft((d) => (d ? d.map((x) => (x.code === code ? { ...x, ...p } : x)) : d));
  const taken = (r: number, c: number, except: string | null) =>
    !!draft?.some((x) => x.code !== except && x.row === r && x.col === c);
  const move = (dr: number, dc: number) => {
    if (!t) return;
    const nr = Math.max(0, Math.min(5, t.row + dr));
    const nc = Math.max(0, Math.min(3, t.col + dc));
    if (taken(nr, nc, t.code)) return;
    patch(t.code, { row: nr, col: nc });
  };

  /* 못 가는 방향은 눌러도 아무 일이 없어 고장난 것처럼 보인다. 미리 꺼 둔다 */
  const canMove = (dr: number, dc: number) => {
    if (!t) return false;
    const nr = t.row + dr;
    const nc = t.col + dc;
    if (nr < 0 || nr > 5 || nc < 0 || nc > 3) return false;
    return !taken(nr, nc, t.code);
  };

  const add = () => {
    if (!draft) return;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        if (!taken(r, c, null)) {
          // ★ code 로 번호를 만든다. id('s1_t1')에서 숫자를 뽑으면 11 이 나온다
          const nums = draft.map((x) => parseInt(x.code.replace(/\D/g, ''), 10) || 0);
          const code = 't' + (Math.max(0, ...nums) + 1);
          setDraft((d) => (d ? [...d, {
            id: code,        // 아직 DB 에 없다. 저장 뒤 서버가 준 id 로 채워진다
            code, seats: 4, status: 'available' as const, row: r, col: c, w: 1,
            guest: null, since: null, cleaningAt: null, resAt: null, resName: null, resParty: null,
          }] : d));
          setSel(code);
          return;
        }
      }
    }
    pushToast({ title: '더 놓을 자리가 없어요', desc: '기존 테이블을 옮긴 뒤 추가해 주세요', tone: 'warn', icon: 'alert' });
  };

  const del = () => {
    if (!t) return;
    setDraft((d) => (d ? d.filter((x) => x.code !== t.code) : d));
    setSel(null);
  };

  return (
    <div className="grid grid-cols-3 gap-5">
      <Card className="col-span-2 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[15px] font-extrabold text-ink-900">테이블 배치도</div>
            <div className="text-[12px] font-bold text-ink-500 mt-0.5 tnum">테이블 {list.length}개 · 총 {seats}석</div>
          </div>
          {edit ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>취소</Button>
              <Button variant="primary" size="sm" icon="check" onClick={save} disabled={saving}>
                {saving ? '저장하는 중…' : '배치 저장'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" icon="pencil" onClick={start}>배치도 편집</Button>
          )}
        </div>

        {edit && (
          <div className="mb-4 rounded-xl bg-brand-50 border border-brand-200 px-4 py-3 flex items-start gap-2.5">
            <Icon n="question" s={16} cls="text-brand-600 shrink-0 mt-px" />
            <div className="text-[12px] font-medium text-brand-700 leading-relaxed">
              테이블을 눌러 선택한 뒤 오른쪽에서 <b>좌석 수 · 위치 · 폭</b>을 바꿔 주세요.
              편집하는 동안에는 <b>실시간 갱신이 멈춥니다.</b> 손님에게는 테이블 번호가 보이지 않고,
              좌석 수와 남은 자리 수만 전달됩니다.
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-ink-50 border border-ink-200 p-6">
          <div className="text-[10px] font-extrabold text-ink-400 tracking-[.25em] text-center mb-4">창 　 측</div>
          <TableMap store={view} cols={4} edit={edit} onSelect={(x) => edit && setSel(x.code)} selectedId={edit ? sel : null} />
          <div className="mt-5 h-8 rounded-lg bg-ink-900 text-white text-[10px] font-extrabold grid place-items-center tracking-[.2em]">
            ▲ 출 입 구 · 카 운 터
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        {edit && t ? (
          <Card className="p-5">
            <div className="text-[14px] font-extrabold text-ink-900 mb-4">선택한 테이블</div>
            <div className="rounded-xl bg-ink-50 border border-ink-200 p-4 mb-4">
              <div className="text-[11.5px] font-extrabold text-ink-500 mb-1">현재 위치</div>
              <div className="text-[15px] font-extrabold text-ink-900 tnum">{t.row + 1}행 {t.col + 1}열 · {t.seats}인석</div>
            </div>

            <div className="text-[11.5px] font-extrabold text-ink-500 mb-2">좌석 수</div>
            <div className="flex items-center gap-2 mb-5">
              <Button variant="outline" size="sm" icon="minus" onClick={() => patch(t.code, { seats: Math.max(1, t.seats - 1) })} />
              <span className="grow text-center text-[18px] font-extrabold text-ink-900 tnum">
                {t.seats}<span className="text-[12px] text-ink-500 ml-0.5">석</span>
              </span>
              <Button variant="outline" size="sm" icon="plus" onClick={() => patch(t.code, { seats: Math.min(12, t.seats + 1) })} />
            </div>

            <div className="text-[11.5px] font-extrabold text-ink-500 mb-2">위치 이동</div>
            <div className="grid grid-cols-3 gap-1.5 w-[148px] mx-auto mb-2">
              <span />
              <Button variant="outline" size="sm" disabled={!canMove(-1, 0)} onClick={() => move(-1, 0)}>↑</Button>
              <span />
              <Button variant="outline" size="sm" disabled={!canMove(0, -1)} onClick={() => move(0, -1)}>←</Button>
              <div className="h-9 rounded-xl bg-ink-100 grid place-items-center text-[10.5px] font-extrabold text-ink-400">이동</div>
              <Button variant="outline" size="sm" disabled={!canMove(0, 1)} onClick={() => move(0, 1)}>→</Button>
              <span />
              <Button variant="outline" size="sm" disabled={!canMove(1, 0)} onClick={() => move(1, 0)}>↓</Button>
              <span />
            </div>
            <div className="text-[11px] font-medium text-ink-500 text-center mb-5 leading-relaxed">
              다른 테이블이 있는 칸으로는 옮길 수 없어요. 먼저 그 테이블을 옮겨 주세요.
            </div>

            <div className="text-[11.5px] font-extrabold text-ink-500 mb-2">차지하는 폭</div>
            <Segmented
              full size="sm"
              value={String(t.w || 1)}
              onChange={(v) => patch(t.code, { w: Number(v) })}
              options={[{ value: '1', label: '1칸' }, { value: '2', label: '2칸 (긴 테이블)' }]}
            />

            <div className="text-[11.5px] font-extrabold text-ink-500 mt-5 mb-2">사용 여부</div>
            <Segmented
              full size="sm"
              value={t.status === 'disabled' ? 'off' : 'on'}
              onChange={(v) => patch(t.code, { status: v === 'off' ? 'disabled' : 'available' })}
              options={[{ value: 'on', label: '사용' }, { value: 'off', label: '사용 안 함' }]}
            />
            {t.status !== 'available' && t.status !== 'disabled' && (
              <div className="mt-2 text-[11.5px] font-bold text-warn-600 leading-relaxed">
                지금 사용 중인 자리라 사용 여부는 바뀌지 않습니다. 손님이 나간 뒤에 바꿔 주세요.
              </div>
            )}

            <div className="flex gap-2 mt-5 pt-5 border-t border-ink-200">
              <Button variant="outline" size="sm" icon="plus" full onClick={add}>테이블 추가</Button>
              <Button variant="danger" size="sm" icon="x" full onClick={del}>삭제</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="text-[14px] font-extrabold text-ink-900 mb-4">좌석 구성 요약</div>
            {([
              ['2인석', list.filter((x) => x.seats <= 2).length],
              ['4인석', list.filter((x) => x.seats > 2 && x.seats <= 4).length],
              ['6인석 이상', list.filter((x) => x.seats > 4).length],
              ['사용 안 함', list.filter((x) => x.status === 'disabled').length],
            ] as const).map(([l, v]) => <StatRow key={l} label={l} value={v} sub="개" />)}
            <div className="mt-4 rounded-xl bg-ink-50 border border-ink-200 p-3.5 text-[11.5px] font-medium text-ink-600 leading-relaxed">
              좌석 구성을 바꾸면 손님 앱의 <b>예약 가능 인원</b>과 <b>실시간 좌석 수</b>가 함께 바뀝니다.
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="text-[14px] font-extrabold text-ink-900 mb-3">손님에게 보이는 방식</div>
          <div className="rounded-xl border border-ok-200 bg-ok-50 p-4">
            <div className="text-[12.5px] font-extrabold text-ok-600">지금 4자리 이용 가능</div>
            <div className="text-[11.5px] font-bold text-ok-600/75 mt-1">2인석 2 · 4인석 2</div>
          </div>
          <div className="mt-3 text-[11.5px] font-medium text-ink-500 leading-relaxed">
            테이블 번호(T04 등)는 손님 화면 어디에도 표시되지 않습니다. 자리 배정은 매장에서 결정합니다.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── 주차장 구성 · 배치도 편집 ─────────────────────────── */

/**
 * [b6] 주차장 배치도
 *
 * ★ 주차면 번호(code)는 센서 쪽 설정과 글자 하나까지 같아야 한다.
 *   POST /api/detect 가 code 로만 주차면을 찾기 때문이다. 여기서 'P1' 을
 *   'P01' 로 바꾸면 센서는 계속 P1 을 보내고 화면은 영영 안 바뀐다.
 *
 * ★ 시연 매장 s1 은 아두이노 모형 도면(P1~P10)을 그대로 쓴다.
 *   P{n} 이 아두이노 Serial 의 'n번' 이다. 번호를 바꾸려면 스케치도 같이 고칠 것.
 */
function SetParking({ store }: { store: PartnerStore }) {
  const { setSlots, setEditing, pushToast } = useApp();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<ParkingSlot[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const list = edit && draft ? draft : store.parking.slots;
  // 편집 중에는 센서 오류 상태를 무시하고 구조만 보여준다
  const view = { ...store, sensor: 'online' as const, parking: { ...store.parking, slots: list } };
  const s = sel ? list.find((x) => x.code === sel) ?? null : null;

  useEffect(() => {
    setEditing(edit);
    return () => setEditing(false);
  }, [edit, setEditing]);

  useEffect(() => {
    if (!edit) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [edit]);

  const start = () => {
    setDraft(store.parking.slots.map((x) => ({ ...x })));
    setSel(store.parking.slots[0]?.code ?? null);
    setEdit(true);
  };
  const cancel = () => { setEdit(false); setDraft(null); setSel(null); };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    const ok = await setSlots(store.id, draft, {
      who: '최영호', msg: `주차장 배치도 수정 · ${draft.length}면`, tone: 'brand',
    });
    setSaving(false);
    if (!ok) return;   // 실패하면 편집 모드를 유지한다

    pushToast({ title: '주차장 배치도를 저장했어요', desc: `주차면 ${draft.length}면`, tone: 'ok', icon: 'check' });
    cancel();
  };

  const patch = (code: string, p: Partial<ParkingSlot>) =>
    setDraft((d) => (d ? d.map((x) => (x.code === code ? { ...x, ...p } : x)) : d));
  const taken = (r: number, c: number, except: string | null) =>
    !!draft?.some((x) => x.code !== except && x.row === r && x.col === c);
  const move = (dr: number, dc: number) => {
    if (!s) return;
    const nr = Math.max(0, Math.min(7, s.row + dr));
    const nc = Math.max(0, Math.min(9, s.col + dc));
    if (taken(nr, nc, s.code)) return;
    patch(s.code, { row: nr, col: nc });
  };
  const canMove = (dr: number, dc: number) => {
    if (!s) return false;
    const nr = s.row + dr;
    const nc = s.col + dc;
    if (nr < 0 || nr > 7 || nc < 0 || nc > 9) return false;
    return !taken(nr, nc, s.code);
  };

  const add = () => {
    if (!draft) return;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        if (!taken(r, c, null)) {
          const code = nextSlotCode(draft);
          // 같은 줄에 이미 있는 면의 구역을 따라간다 (P7~P10 줄에 추가하면 B 구역)
          const zone = draft.find((x) => x.row === r)?.zone ?? draft[0]?.zone ?? 'A';
          setDraft((d) => (d ? [...d, {
            id: code,
            code, row: r, col: c, zone,
            // ★ 센서가 아직 안 붙었으므로 unknown 이다. available 로 두면
            //   손님 앱이 없는 자리를 있다고 말한다 (규칙 3).
            autoStatus: 'unknown' as const,
            manualStatus: null, manualUntil: null, manualBy: null,
            type: null, nearGate: false, confidence: 0,
          }] : d));
          setSel(code);
          return;
        }
      }
    }
    pushToast({ title: '더 놓을 자리가 없어요', desc: '기존 주차면을 옮긴 뒤 추가해 주세요', tone: 'warn', icon: 'alert' });
  };

  const del = () => {
    if (!s) return;
    setDraft((d) => (d ? d.filter((x) => x.code !== s.code) : d));
    setSel(null);
  };

  const pending = list.filter((x) => x.autoStatus === 'unknown').length;

  return (
    <div className="grid grid-cols-3 gap-5">
      <Card className="col-span-2 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[15px] font-extrabold text-ink-900">주차장 배치도</div>
            <div className="text-[12px] font-bold text-ink-500 mt-0.5 tnum">주차면 {list.length}면 · 센서 {list.length}개</div>
          </div>
          {edit ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>취소</Button>
              <Button variant="primary" size="sm" icon="check" onClick={save} disabled={saving}>
                {saving ? '저장하는 중…' : '배치 저장'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" icon="pencil" onClick={start}>배치도 편집</Button>
          )}
        </div>

        {edit && (
          <div className="mb-4 rounded-xl bg-brand-50 border border-brand-200 px-4 py-3 flex items-start gap-2.5">
            <Icon n="question" s={16} cls="text-brand-600 shrink-0 mt-px" />
            <div className="text-[12px] font-medium text-brand-700 leading-relaxed">
              주차면 하나가 곧 <b>센서 한 개</b>입니다. 주차면 번호는 센서 쪽 설정과 <b>똑같아야</b> 하고,
              배치도에서 지운 주차면은 감지 대상에서 제외됩니다. 편집하는 동안에는 <b>실시간 갱신이 멈춥니다.</b>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-ink-50 border border-ink-200 p-5 overflow-x-auto thin-sb">
          <SlotGrid store={view} cell={62} onSelect={(x) => edit && setSel(x.code)} selectedCode={edit ? sel : null} />
        </div>
        <div className="mt-4"><SlotLegend /></div>
      </Card>

      <div className="space-y-5">
        {edit && s ? (
          <Card className="p-5">
            <div className="text-[14px] font-extrabold text-ink-900 mb-4">선택한 주차면</div>
            <div className="rounded-xl bg-ink-50 border border-ink-200 p-4 mb-4">
              <div className="text-[11.5px] font-extrabold text-ink-500 mb-1">주차면 번호 · 위치</div>
              <div className="text-[15px] font-extrabold text-ink-900 tnum">{s.code} · {s.row + 1}행 {s.col + 1}열</div>
            </div>

            <div className="text-[11.5px] font-extrabold text-ink-500 mb-2">위치 이동</div>
            <div className="grid grid-cols-3 gap-1.5 w-[148px] mx-auto mb-2">
              <span />
              <Button variant="outline" size="sm" disabled={!canMove(-1, 0)} onClick={() => move(-1, 0)}>↑</Button>
              <span />
              <Button variant="outline" size="sm" disabled={!canMove(0, -1)} onClick={() => move(0, -1)}>←</Button>
              <div className="h-9 rounded-xl bg-ink-100 grid place-items-center text-[10.5px] font-extrabold text-ink-400">이동</div>
              <Button variant="outline" size="sm" disabled={!canMove(0, 1)} onClick={() => move(0, 1)}>→</Button>
              <span />
              <Button variant="outline" size="sm" disabled={!canMove(1, 0)} onClick={() => move(1, 0)}>↓</Button>
              <span />
            </div>
            <div className="text-[11px] font-medium text-ink-500 text-center mb-5 leading-relaxed">
              다른 주차면이 있는 칸으로는 옮길 수 없어요.
            </div>

            <div className="text-[11.5px] font-extrabold text-ink-500 mb-2">주차면 종류</div>
            <Segmented
              full size="sm"
              value={s.type ?? 'normal'}
              onChange={(v) => patch(s.code, { type: v === 'normal' ? null : (v as 'ev' | 'disabled') })}
              options={[
                { value: 'normal', label: '일반' },
                { value: 'ev', label: '전기차' },
                { value: 'disabled', label: '장애인' },
              ]}
            />

            <button
              onClick={() => patch(s.code, { nearGate: !s.nearGate })}
              className={cx(
                'mt-4 w-full h-10 rounded-xl border-2 text-[12.5px] font-extrabold transition-colors',
                s.nearGate ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-600 border-ink-300'
              )}
            >
              {s.nearGate ? '✓ 출입구 근처' : '출입구 근처로 표시'}
            </button>

            <div className="flex gap-2 mt-5 pt-5 border-t border-ink-200">
              <Button variant="outline" size="sm" icon="plus" full onClick={add}>주차면 추가</Button>
              <Button variant="danger" size="sm" icon="x" full onClick={del}>삭제</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="text-[14px] font-extrabold text-ink-900 mb-4">주차면 구성 요약</div>
            {([
              ['일반', list.filter((x) => !x.type).length],
              ['전기차', list.filter((x) => x.type === 'ev').length],
              ['장애인', list.filter((x) => x.type === 'disabled').length],
              ['출입구 근처', list.filter((x) => x.nearGate).length],
            ] as const).map(([l, v]) => <StatRow key={l} label={l} value={v} sub="면" />)}
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-8 h-8 rounded-lg bg-ok-50 text-ok-500 grid place-items-center">
              <Icon n="sensor" s={17} />
            </span>
            <div className="text-[14px] font-extrabold text-ink-900">센서 등록 현황</div>
          </div>
          <StatRow label="정상 감지" value={list.length - pending} sub="개" tone="text-ok-500" />
          <StatRow label="등록 대기" value={pending} sub="개" />
          <StatRow label="게이트웨이" value={1} sub="대" />
          <div className="mt-4 text-[11.5px] font-medium text-ink-500 leading-relaxed">
            주차면 감지는 바닥에 설치한 지자기 센서가 담당합니다. 새로 추가한 주차면은
            센서가 같은 번호로 신호를 보내기 전까지 <b>등록 대기</b>로 표시됩니다.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── 이용 통계 ─────────────────────────────────────────── */

/**
 * ★ 목업(STAT_*)이 아니라 GET /api/admin/stats 를 읽는다.
 *   폴링하지 않는다 — lib/store.tsx 의 3초 폴링에 얹으면 30일치 SensorLog 를
 *   3초마다 스캔하게 된다. 화면 진입 시 1회 + 수동 새로고침이면 충분하다.
 *
 * ★ 값이 null 인 지표는 숫자를 지어내지 않고 '데이터 수집 중' 으로 표시한다.
 *   (평균 이용시간 · 예약 경로 · 좌석 vs 주차 — 스키마에 이력이 없다)
 *   규칙 3 — 불확실을 가능으로 세지 않는다.
 */

type Stats = {
  range: { days: number; from: string; to: string };
  coverage: { totalSlots: number; reportingSlots: number; sensorSamples: number; thin: boolean };
  reservation: {
    total: number; visited: number; noshow: number; canceled: number;
    fulfillRate: number | null; noshowRate: number | null;
    byWeekday: { d: string; res: number; visit: number; noshow: number }[];
    byParty: [string, number][];
    busiestDay: { d: string; res: number } | null;
    quietDay: { d: string; res: number } | null;
    worstNoshow: { label: string; count: number } | null;
    avgDurationMin: number | null;
    bySource: null;
  };
  parking: {
    avgOccupancy: number | null; avgParkMin: number | null;
    turnover: number | null; fullCount: number | null; sessions: number;
    byHour: { h: number; park: number; samples: number }[];
    heatHours: number[];
    heatmap: { d: string; v: (number | null)[]; samples: number[] }[];
    peak: { h: number; park: number } | null;
    quiet: { h: number; park: number } | null;
    seatVsPark: null;
  };
  insights: { tone: 'ok' | 'warn' | 'brand'; title: string; body: string }[];
  generatedAt: string;
};

const heatTone = (v: number | null) =>
  v === null ? 'bg-ink-100 text-ink-400'
    : v >= 90 ? 'bg-busy-500 text-white'
    : v >= 75 ? 'bg-busy-300 text-busy-600'
    : v >= 55 ? 'bg-warn-300 text-warn-600'
    : v >= 35 ? 'bg-ok-200 text-ok-600'
    : 'bg-ok-100 text-ok-600';

/** 아직 계산할 수 없는 지표 자리 — 빈칸으로 두지 않고 이유를 적는다 */
const Pending = ({ title, why }: { title: string; why: string }) => (
  <Card className="p-6">
    <div className="text-[14px] font-extrabold text-ink-900 mb-3">{title}</div>
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-4">
      <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink-600 mb-1">
        <Icon n="clock" s={14} />
        데이터 수집 중
      </div>
      <div className="text-[11.5px] font-medium text-ink-500 leading-relaxed">{why}</div>
    </div>
  </Card>
);

function SetStats({ store }: { store: PartnerStore }) {
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [data, setData] = useState<Stats | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const r = await fetch(`/api/admin/stats?store=${store.id}&days=${range}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setPhase('ok');
    } catch {
      setPhase('error');
    }
  }, [store.id, range]);

  useEffect(() => { load(); }, [load]);

  const Head = (
    <div className="flex items-center justify-between">
      <div className="text-[12.5px] font-bold text-ink-500">
        집계 기준 · 최근 {range}일
        {data && <span className="text-ink-400 tnum"> ({data.range.from} ~ {data.range.to})</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={load}
          className="h-8 px-3 rounded-lg border border-ink-200 bg-white text-[12px] font-extrabold text-ink-600 hover:border-brand-300 inline-flex items-center gap-1.5"
        >
          <Icon n="refresh" s={13} />
          새로고침
        </button>
        <Segmented
          size="sm" value={range} onChange={setRange}
          options={[{ value: '7', label: '7일' }, { value: '30', label: '30일' }, { value: '90', label: '90일' }]}
        />
      </div>
    </div>
  );

  if (phase === 'loading' && !data) {
    return (
      <div className="space-y-5">
        {Head}
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-5 h-[132px] animate-pulse bg-ink-100 border-ink-200" />
          ))}
        </div>
        <Card className="p-6 h-[280px] animate-pulse bg-ink-100 border-ink-200" />
      </div>
    );
  }

  if (phase === 'error' || !data) {
    return (
      <div className="space-y-5">
        {Head}
        <Card className="p-10 text-center">
          <div className="text-[14px] font-extrabold text-ink-900 mb-1">통계를 불러오지 못했어요</div>
          <div className="text-[12px] font-bold text-ink-500 mb-4">
            네트워크 상태를 확인한 뒤 다시 시도해 주세요.
          </div>
          <Button onClick={load}>다시 시도</Button>
        </Card>
      </div>
    );
  }

  const { reservation: rs, parking: pk, coverage: cv } = data;
  const maxRes = Math.max(1, ...rs.byWeekday.map((x) => x.res));
  const noData = rs.total === 0 && cv.sensorSamples === 0;

  return (
    <div className="space-y-5">
      {Head}

      {noData && (
        <Card className="p-6 border-warn-200 bg-warn-50">
          <div className="text-[13.5px] font-extrabold text-warn-600 mb-1">아직 집계할 기록이 없어요</div>
          <div className="text-[12px] font-medium text-ink-600 leading-relaxed">
            최근 {range}일 안에 예약과 센서 기록이 모두 없습니다. 센서 게이트웨이를 켜 두면
            시간이 지나면서 시간대별 · 요일별 패턴이 채워집니다.
          </div>
        </Card>
      )}

      {/* 1. 예약 이용현황 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 grid place-items-center"><Icon n="calendar" s={16} /></span>
          <div className="text-[15px] font-extrabold text-ink-900">예약 이용현황</div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <KPI
            label="총 예약" value={rs.total} unit="건" icon="calendar" tone="brand"
            sub={rs.canceled > 0 ? `취소 ${rs.canceled}건 포함` : undefined}
          />
          <KPI
            label="방문 완료" value={rs.visited} unit="건" icon="check" tone="ok"
            sub={rs.fulfillRate !== null ? `이행률 ${rs.fulfillRate}%` : '집계할 예약이 없어요'}
          />
          <KPI
            label="미방문" value={rs.noshow} unit="건" icon="alert" tone="busy"
            sub={rs.noshowRate !== null ? `미방문율 ${rs.noshowRate}%` : '집계할 예약이 없어요'}
          />
          <KPI label="평균 이용시간" value="—" icon="clock" tone="unk" sub="데이터 수집 중" />
        </div>

        <div className="grid grid-cols-3 gap-5">
          <Card className="col-span-2 p-6">
            <div className="text-[14px] font-extrabold text-ink-900">요일별 예약</div>
            <div className="text-[11.5px] font-bold text-ink-500 mb-4">
              {rs.busiestDay
                ? <>{rs.busiestDay.d}요일에 가장 많습니다. 이 요일의 주차 안내를 먼저 준비하세요.</>
                : <>아직 요일 패턴을 판단할 만큼 예약이 쌓이지 않았어요.</>}
            </div>
            <StatBar
              items={rs.byWeekday as unknown as Record<string, string | number>[]}
              valueKey="res" max={maxRes}
            />
            <div className="mt-4 pt-4 border-t border-ink-200 grid grid-cols-3 gap-4">
              <div>
                <div className="text-[11.5px] font-extrabold text-ink-500 mb-1">가장 붐비는 요일</div>
                <div className="text-[15px] font-extrabold text-ink-900">
                  {rs.busiestDay
                    ? <>{rs.busiestDay.d}요일 <span className="text-[12px] text-ink-500 tnum">{rs.busiestDay.res}건</span></>
                    : <span className="text-ink-400">—</span>}
                </div>
              </div>
              <div>
                <div className="text-[11.5px] font-extrabold text-ink-500 mb-1">가장 한가한 요일</div>
                <div className="text-[15px] font-extrabold text-ink-900">
                  {rs.quietDay
                    ? <>{rs.quietDay.d}요일 <span className="text-[12px] text-ink-500 tnum">{rs.quietDay.res}건</span></>
                    : <span className="text-ink-400">—</span>}
                </div>
              </div>
              <div>
                <div className="text-[11.5px] font-extrabold text-ink-500 mb-1">미방문이 잦은 시간</div>
                <div className="text-[15px] font-extrabold text-busy-500">
                  {rs.worstNoshow ? rs.worstNoshow.label : <span className="text-ink-400">—</span>}
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-6">
              <div className="text-[14px] font-extrabold text-ink-900 mb-3">예약 인원 분포</div>
              {rs.total === 0 ? (
                <div className="py-6 text-center text-[12px] font-bold text-ink-400">집계할 예약이 없어요</div>
              ) : (
                <>
                  {rs.byParty.map(([l, v]) => (
                    <div key={l} className="mb-3 last:mb-0">
                      <Gauge used={v} total={100} tone="brand" label={l} />
                    </div>
                  ))}
                  <div className="mt-4 pt-4 border-t border-ink-200 text-[11.5px] font-medium text-ink-600 leading-relaxed">
                    <b>1~2인 예약이 {rs.byParty[0]?.[1] ?? 0}%</b>입니다. 비중이 높다면 2인석을 늘려 회전을 높일 수 있어요.
                  </div>
                </>
              )}
            </Card>

            <Pending
              title="예약 경로"
              why="예약이 앱 · 전화 · 워크인 중 어디서 들어왔는지 저장하고 있지 않습니다. 예약 데이터에 경로 항목이 추가되면 이 자리에 채워집니다."
            />
          </div>
        </div>
      </div>

      {/* 2. 센서 기반 혼잡도 · 이용패턴 */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg bg-ok-50 text-ok-500 grid place-items-center"><Icon n="sensor" s={16} /></span>
          <div className="text-[15px] font-extrabold text-ink-900">센서 기반 혼잡도 · 이용패턴</div>
          <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-ok-50 border border-ok-200 text-[11px] font-extrabold text-ok-600 tnum">
            <Icon n="sensor" s={12} />
            주차면 {cv.totalSlots}면 중 {cv.reportingSlots}면 집계
          </span>
        </div>

        {cv.sensorSamples === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-[13.5px] font-extrabold text-ink-900 mb-1">센서 기록이 아직 없어요</div>
            <div className="text-[12px] font-medium text-ink-500 leading-relaxed">
              최근 {range}일 안에 도착한 센서 데이터가 없습니다. 게이트웨이가 켜져 있는지 확인해 주세요.
            </div>
          </Card>
        ) : (
          <>
            {/* ★ 몇 면이 보고했는지 숨기지 않는다. 1면 기준 수치를 전체인 척하면 안 된다 */}
            {(cv.thin || cv.reportingSlots < cv.totalSlots) && (
              <Card className="p-4 mb-4 border-warn-200 bg-warn-50">
                <div className="flex items-start gap-2">
                  <span className="text-warn-500 mt-0.5 shrink-0"><Icon n="alert" s={15} /></span>
                  <div className="text-[11.5px] font-medium text-ink-600 leading-relaxed">
                    {cv.reportingSlots < cv.totalSlots && (
                      <>
                        전체 {cv.totalSlots}면 중 <b className="tnum">{cv.reportingSlots}면</b>만 센서가 보고하고 있습니다.
                        아래 점유율은 <b>보고 중인 주차면 기준</b>이며 주차장 전체 값이 아닙니다.{' '}
                      </>
                    )}
                    {cv.thin && (
                      <>표본이 <b className="tnum">{cv.sensorSamples}건</b>으로 적어 시간대별 수치가 흔들릴 수 있어요.</>
                    )}
                  </div>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-4 gap-4 mb-4">
              <KPI
                label="평균 주차 점유율" value={pk.avgOccupancy ?? '—'}
                unit={pk.avgOccupancy !== null ? '%' : undefined}
                icon="parkingP" tone="warn" sub={`보고 ${cv.reportingSlots}면 기준`}
              />
              <KPI
                label="평균 주차 시간" value={pk.avgParkMin ?? '—'}
                unit={pk.avgParkMin !== null ? '분' : undefined}
                icon="clock" tone="brand"
                sub={pk.sessions > 0 ? `주차 ${pk.sessions}회 기준` : '완료된 주차 기록이 없어요'}
              />
              <KPI
                label="일 평균 회전" value={pk.turnover ?? '—'}
                unit={pk.turnover !== null ? '회' : undefined}
                icon="refresh" tone="ok" sub="주차면 1면 기준"
              />
              <KPI
                label="만차 발생" value={pk.fullCount ?? '—'}
                unit={pk.fullCount !== null ? '회' : undefined}
                icon="alert" tone={pk.fullCount !== null ? 'busy' : 'unk'}
                sub={pk.fullCount !== null ? '10분 단위 판정' : '전 주차면 센서 필요'}
              />
            </div>

            <div className="grid grid-cols-3 gap-5">
              <Card className="col-span-2 p-6">
                <div className="text-[14px] font-extrabold text-ink-900 mb-1">시간대별 주차 점유율</div>
                <div className="text-[11.5px] font-bold text-ink-500 mb-4">
                  {pk.peak && pk.quiet && pk.peak.h !== pk.quiet.h ? (
                    <>
                      {pk.peak.h}시에 <b className="text-busy-500 tnum">{pk.peak.park}%</b>로 가장 붐비고,{' '}
                      {pk.quiet.h}시에 <b className="text-ok-500 tnum">{pk.quiet.park}%</b>로 가장 여유롭습니다.
                    </>
                  ) : (
                    <>아직 여러 시간대를 비교할 만큼 기록이 쌓이지 않았어요.</>
                  )}
                </div>
                <StatBar
                  items={pk.byHour as unknown as Record<string, string | number>[]}
                  valueKey="park" max={100} tone="bg-warn-400" unit="%"
                />

                <div className="mt-5 pt-5 border-t border-ink-200">
                  <div className="text-[13px] font-extrabold text-ink-900 mb-3">요일 × 시간대 혼잡도</div>
                  <div className="overflow-x-auto thin-sb">
                    <div style={{ minWidth: Math.max(320, pk.heatHours.length * 38 + 36) }}>
                      <div className="flex gap-1 mb-1 pl-9">
                        {pk.heatHours.map((h) => (
                          <div key={h} className="grow text-center text-[10px] font-extrabold text-ink-400 tnum">{h}</div>
                        ))}
                      </div>
                      {pk.heatmap.map((row) => (
                        <div key={row.d} className="flex gap-1 mb-1 items-center">
                          <div className="w-8 shrink-0 text-[11px] font-extrabold text-ink-500">{row.d}</div>
                          {row.v.map((v, i) => (
                            <div
                              key={i}
                              title={v === null ? '기록 없음' : `${row.d} ${pk.heatHours[i]}시 · ${v}% · 표본 ${row.samples[i]}건`}
                              className={cx(
                                'grow h-8 rounded-md grid place-items-center text-[10px] font-extrabold tnum',
                                heatTone(v),
                                // 표본이 적은 칸은 흐리게 — 2건짜리 100% 를 진하게 그리면 거짓말이 된다
                                v !== null && row.samples[i] < 5 && 'opacity-40'
                              )}
                            >
                              {v === null ? '—' : v}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {([['여유', 'bg-ok-100 text-ok-600'], ['보통', 'bg-ok-200 text-ok-600'], ['혼잡', 'bg-warn-300 text-warn-600'],
                       ['많이 혼잡', 'bg-busy-300 text-busy-600'], ['만차 임박', 'bg-busy-500 text-white'],
                       ['기록 없음', 'bg-ink-100 text-ink-400']] as const).map(([l, c]) => (
                      <span key={l} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-600">
                        <span className={cx('w-4 h-4 rounded', c)} />
                        {l}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] font-medium text-ink-500">
                    색만으로 구분하지 않도록 각 칸에 점유율 수치를 함께 표시합니다. 흐린 칸은 표본이 5건 미만입니다.
                  </div>
                </div>
              </Card>

              <div className="space-y-5">
                <Pending
                  title="좌석 vs 주차"
                  why="주차는 센서 기록이 쌓이지만 좌석은 현재 상태만 저장하고 있어 과거 시간대를 비교할 수 없습니다. 테이블 입 · 퇴장 기록이 추가되면 이 자리에 채워집니다."
                />

                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon n="sparkle" s={17} cls="text-brand-600" />
                    <div className="text-[14px] font-extrabold text-ink-900">읽어낸 패턴</div>
                  </div>
                  {data.insights.length === 0 ? (
                    <div className="py-6 text-center text-[12px] font-bold text-ink-400">
                      패턴을 읽어낼 만큼 기록이 쌓이지 않았어요
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.insights.map((it) => (
                        <div
                          key={it.title}
                          className={cx('rounded-xl border p-3.5',
                            it.tone === 'warn' ? 'bg-warn-50 border-warn-200'
                              : it.tone === 'ok' ? 'bg-ok-50 border-ok-200'
                              : 'bg-brand-50 border-brand-200')}
                        >
                          <div className={cx('text-[12.5px] font-extrabold mb-1',
                            it.tone === 'warn' ? 'text-warn-600'
                              : it.tone === 'ok' ? 'text-ok-600'
                              : 'text-brand-700')}>
                            {it.title}
                          </div>
                          <div className="text-[11.5px] font-medium text-ink-600 leading-relaxed">{it.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}