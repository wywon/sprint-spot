'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CLEAN_AUTO_MS } from './tokens';
import { rnd } from './format';
import { adaptStore, adaptStoreDetail, type ApiStoreDetail, type ApiStoreListItem } from './adapt';
import {
  ADMIN_RES, INITIAL_RESERVATIONS, PARTNER_STORES, PUBLIC_LOTS, REVIEWS, ME
} from './mock';
import type {
  AdminReservation, LogEntry, ParkingSlot, PartnerStore, Profile, PublicLot,
  Reservation, Review, SensorState, StoreTable, TableStatus, Toast,
} from './types';

/**
 * 전역 상태
 * ─────────────────────────────────────────────────────────────
 * MVP에서는 상태 관리 라이브러리를 쓰지 않는다. Context 하나로 충분하고,
 * 비전공자 팀에게는 Redux/Zustand 학습 비용이 더 크다.
 *
 * [C15] 시뮬레이터 → 3초 폴링 교체 완료.
 *   화면 41개는 한 줄도 고치지 않았다. 바꾼 건 이 파일 안쪽뿐이다.
 *
 *   읽기 — 2단 폴링
 *     · GET /api/stores          목록. 항상 3초
 *     · GET /api/stores/[id]     지금 보고 있는 매장 1개만. 3초
 *     목록 응답에는 tables[] · slots[] 이 없어서 배치도를 못 그린다. 그래서 두 단이다.
 *     전 매장 상세를 다 돌리면 Vercel Hobby 함수 호출이 매장 수만큼 배로 는다.
 *
 *   쓰기 — 낙관적 반영 후 PATCH
 *     화면을 먼저 바꾸고 서버에 보낸다. 실패해도 되돌리는 코드를 두지 않고,
 *     즉시 다시 읽어서 서버 값으로 맞춘다. 서버가 진실이다.
 *
 * ★ Hydration 주의
 *   fetch 와 Date.now() 는 전부 useEffect 안에서만 부른다.
 */

/** 폴링 주기. 3초면 체감상 실시간이고 WebSocket 학습 비용이 0이다 */
const POLL_MS = 3000;

/** 관리자 콘솔은 매장 한 곳만 본다 (점주 계정 = s1) */
const ADMIN_STORE_ID = 's1';

/* ── PATCH 요청 body ─────────────────────────────────────────
   ★ 서버 규격에 맞추는 지점. 라우트가 바뀌면 이 아래 두 함수만 고치면 된다. */

/**
 * 테이블 — PATCH /api/admin/tables/[id] 는 status 가 아니라 action(동사) 을 받는다.
 * 서버가 전이표를 들고 있고, 허용되지 않는 동작은 409 로 막는다.
 * 노트북 두 대에서 동시에 누르는 상황을 서버가 걸러 주는 구조다.
 * 그래서 "지금 상태 → 바꾸려는 상태" 를 보고 동사를 되짚어야 한다.
 */
type TableAction = 'seat' | 'leave' | 'cleaned' | 'cancel' | 'noshow' | 'disable' | 'enable';

function toTableAction(from: TableStatus | undefined, patch: Partial<StoreTable>): TableAction | null {
  const to = patch.status;
  if (!from || !to || from === to) return null;   // 상태가 안 바뀌는 patch 는 서버에 안 보낸다

  if (to === 'occupied' && (from === 'available' || from === 'reserved')) return 'seat';
  if (to === 'cleaning' && from === 'occupied') return 'leave';
  if (to === 'disabled' && from === 'available') return 'disable';

  if (to === 'available') {
    if (from === 'cleaning') return 'cleaned';
    if (from === 'disabled') return 'enable';
    // ★ reserved → available 은 '취소'와 '미방문' 두 갈래다. 화면이 구분해서 알려주지
    //   않으므로 '취소'로 보낸다. v3에서 홀 운영 버튼이 '노쇼'→'취소'로 바뀌었고,
    //   10분 경과 자동 미방문은 서버가 따로 처리한다(B 담당 feat/b-auto-noshow).
    if (from === 'reserved') return 'cancel';
  }

  return null;
}

/**
 * [b4] 매장 정보 — PATCH /api/admin/stores/[id]
 * 여긴 action 이 없다. 상태 전이가 아니라 값 교체라서 바뀐 필드만 그대로 보낸다.
 * 화면은 types.ts 이름(cat·addr·tel·open)으로 주고, 여기서 API 이름으로 옮긴다.
 */
export interface StoreInfoPatch {
  name: string;
  cat: string;
  addr: string;
  tel: string;
  /** '10:30 - 20:00' — types.ts 모양 그대로. 아래에서 잘라 보낸다 */
  open: string;
  price: string;
  parkingFee: string;
}

function toStoreBody(p: StoreInfoPatch): Record<string, unknown> {
  const [open = '', close = ''] = p.open.split('-').map((v) => v.trim());
  return {
    name: p.name,
    category: p.cat,
    address: p.addr,
    phone: p.tel,
    price: p.price,
    hours: { open, close },
    parking: { fee: p.parkingFee },
  };
}

/**
 * 주차면 — PATCH /api/admin/slots/[id] 는 만료 '시각'이 아니라 '분'을 받는다.
 * manualStatus 키가 없으면 400 이므로 항상 포함시킨다.
 * null 을 보내면 수동 지정 해제(자동 감지 복귀)다.
 */
function toSlotBody(patch: Partial<ParkingSlot>): Record<string, unknown> | null {
  if (!('manualStatus' in patch)) return null;    // 수동 지정과 무관한 patch 는 안 보낸다

  const manualStatus = patch.manualStatus ?? null;
  if (manualStatus === null) return { manualStatus: null };

  // 서버가 받는 값은 available · occupied 둘뿐이다 (unknown 은 센서 몫)
  if (manualStatus !== 'available' && manualStatus !== 'occupied') return null;

  const until = patch.manualUntil;
  const minutes = typeof until === 'number'
    ? Math.max(1, Math.round((until - Date.now()) / 60_000))
    : 120;                                        // 기본 2시간

  return { manualStatus, minutes };
}

/** URL 만 보고 "지금 보고 있는 매장"을 알아낸다. 화면이 알려줄 필요가 없다 */
function focusStoreId(pathname: string | null, reservations: Reservation[]): string | null {
  if (!pathname) return null;
  if (pathname.startsWith('/admin')) return ADMIN_STORE_ID;

  const m = pathname.match(/^\/(?:stores|reserve)\/([^/]+)/);
  if (m) return m[1];

  const r = pathname.match(/^\/reservations\/([^/]+)/);
  if (r) return reservations.find((x) => x.id === r[1])?.storeId ?? null;

  return null;
}

interface LogInput { who: string; msg: string; tone: LogEntry['tone'] }

interface SpotApi {
  mounted: boolean;
  stores: PartnerStore[];
  lots: PublicLot[];
  reservations: Reservation[];
  adminRes: AdminReservation[];
  reviews: Review[];
  favorites: string[];
  recent: string[];
  simOn: boolean;
  toasts: Toast[];
  log: LogEntry[];
  profile: Profile;
  

  /** [C15] 서버에서 한 번이라도 받아왔는가. false 면 아직 목업을 보고 있다 */
  live: boolean;
  /** [C15] 마지막으로 성공한 갱신 시각(ms). 0 이면 아직 모른다 */
  lastSync: number;
  /** [C15] 즉시 한 번 더 읽기 */
  refresh: () => void;

  setSimOn: (v: boolean) => void;
  setRecent: React.Dispatch<React.SetStateAction<string[]>>;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  addLog: (who: string, msg: string, tone: LogEntry['tone']) => void;

  getStore: (id: string) => PartnerStore | undefined;
  getLot: (id: string) => PublicLot | undefined;
  getRes: (id: string) => Reservation | undefined;

  toggleFav: (id: string) => void;
  addReservation: (r: Omit<Reservation, 'id'>) => string;
  cancelReservation: (id: string) => void;
  uploadReceipt: (id: string) => void;
  addReview: (storeId: string, resId: string, rating: number, text: string) => void;

  setSlot: (storeId: string, code: string, patch: Partial<ParkingSlot>, log?: LogInput) => void;
  setSlots: (storeId: string, slots: ParkingSlot[], log?: LogInput) => void;
  setTable: (storeId: string, tableId: string, patch: Partial<StoreTable>, log?: LogInput) => void;
  setTables: (storeId: string, tables: StoreTable[], log?: LogInput) => void;
  setSensor: (storeId: string, sensor: SensorState) => void;
  /** [b4] 매장 기본 정보 수정 (관리자 · 매장 관리 > 매장 정보) */
  updateStoreInfo: (storeId: string, patch: StoreInfoPatch) => void;
  setAdminRes: React.Dispatch<React.SetStateAction<AdminReservation[]>>;

  updateProfile: (next: Profile) => void;
}

const SpotCtx = createContext<SpotApi | null>(null);

export function useApp(): SpotApi {
  const v = useContext(SpotCtx);
  if (!v) throw new Error('useApp 은 <SpotProvider> 안에서만 쓸 수 있습니다.');
  return v;
}

/** 현재 시각을 주기적으로 갱신. 서버 렌더 때는 0을 준다 */
export function useNow(interval = 1000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(Date.now());
    const t = setInterval(() => setN(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return n;
}

export function SpotProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [stores, setStores] = useState<PartnerStore[]>(() =>
    PARTNER_STORES.map((s) => ({
      ...s,
      tables: s.tables.map((t) => ({ ...t })),
      parking: { ...s.parking, slots: s.parking.slots.map((x) => ({ ...x })) },
    }))
  );
  const [lots, setLots] = useState<PublicLot[]>(() => PUBLIC_LOTS.map((l) => ({ ...l })));
  const [reservations, setRes] = useState<Reservation[]>(INITIAL_RESERVATIONS);
  const [adminRes, setAdminRes] = useState<AdminReservation[]>(ADMIN_RES);
  const [reviews, setReviews] = useState<Review[]>(REVIEWS);
  const [favorites, setFav] = useState<string[]>(['s1']);
  const [recent, setRecent] = useState<string[]>(['대흥동 손칼국수', '두부두루치기', '으능정이 주차장', '소제동 브런치']);
  const [simOn, setSimOn] = useState(true);   // [C15] 이제 '실시간 갱신 켜기' 를 뜻한다
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [profile, setProfile] = useState<Profile>(ME); //서버 렌더링 시 ME 객체 고정

  const [live, setLive] = useState(false);
  const [lastSync, setLastSync] = useState(0);

  const pathname = usePathname();
  const focusId = useMemo(() => focusStoreId(pathname, reservations), [pathname, reservations]);

  /** 폴링 루프를 즉시 한 바퀴 더 돌리는 손잡이 */
  const refreshRef = useRef<() => void>(() => {});
  /** 연결 끊김 토스트를 한 번만 띄우기 위한 표시 */
  const warnedRef = useRef(false);

  /* 마운트 직후 한 번 — 시각 관련 값을 실제 시간으로 채운다 */
  useEffect(() => {
    const now = Date.now();
    setStores((prev) =>
      prev.map((s) => ({
        ...s,
        tablesUpdated: now - rnd(3000, 30000),
        parking: { ...s.parking, updated: now - rnd(2000, 20000) },
      }))
    );
    setLots((prev) => prev.map((l) => ({ ...l, updated: now - rnd(40000, 210000) })));
    setLog([
      { t: now - 32000,  who: '센서',   msg: 'B3 감지값 불안정 — 확인 필요', tone: 'warn' },
      { t: now - 140000, who: '센서',   msg: 'A7 주차 중 → 주차 가능', tone: 'ok' },
      { t: now - 260000, who: '최영호', msg: 'A3 수동 지정 → 주차 가능', tone: 'warn' },
      { t: now - 480000, who: '시스템', msg: '게이트웨이 재연결 완료', tone: 'ok' },
    ]);
    try {
      const saved = localStorage.getItem('spot.profile');
      if (saved) setProfile({ ...ME, ...JSON.parse(saved)});
    }catch {}
    setMounted(true);
  }, []);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { ...t, id }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), t.duration || 4000);
  }, []);

  const addLog = useCallback((who: string, msg: string, tone: LogEntry['tone']) => {
    setLog((p) => [{ t: Date.now(), who, msg, tone }, ...p].slice(0, 40));
  }, []);

    const updateProfile = useCallback((next: Profile) => {
    setProfile(next);
    try { localStorage.setItem('spot.profile', JSON.stringify(next)); } catch {}
  }, []);

  /* ── 3초 폴링 ────────────────────────────────────────────────
     setInterval 을 쓰지 않는다. 응답이 3초보다 늦으면 요청이 겹쳐 쌓이기 때문에,
     한 바퀴가 끝난 뒤에 다음 바퀴를 예약하는 방식(setTimeout 재귀)으로 만든다. */
  useEffect(() => {
    if (!mounted || !simOn) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ac = new AbortController();

    const schedule = () => {
      if (!alive) return;
      timer = setTimeout(tick, POLL_MS);
    };

    async function getJSON<T>(url: string): Promise<T> {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(`${url} → ${r.status}`);
      return r.json() as Promise<T>;
    }

    async function tick() {
      if (!alive) return;

      // 다른 탭을 보고 있으면 서버를 부르지 않는다. Hobby 플랜 호출 수를 아낀다
      if (typeof document !== 'undefined' && document.hidden) return schedule();

      try {
        const list = await getJSON<ApiStoreListItem[]>('/api/stores');
        if (!alive) return;

        setStores((prev) => {
          const before = new Map(prev.map((s) => [s.id, s]));
          return list
            .filter((x) => x.partner)          // 미입점 매장은 이 배열에 넣지 않는다
            .map((x) => adaptStore(x, before.get(x.id)));
        });

        // 지금 보고 있는 매장 한 곳만 배열까지 받아온다
        if (focusId) {
          const detail = await getJSON<ApiStoreDetail>(`/api/stores/${focusId}`);
          if (!alive) return;
          if (detail?.partner) {
            setStores((prev) =>
              prev.map((s) => (s.id === detail.id ? adaptStoreDetail(detail, s) : s)),
            );
          }
        }

        setLive(true);
        setLastSync(Date.now());
        warnedRef.current = false;
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        // 실패해도 화면의 마지막 값을 지우지 않는다. 빈 화면보다 오래된 값이 낫다
        console.error('[poll]', e);
        if (!warnedRef.current) {
          warnedRef.current = true;
          pushToast({ title: '실시간 정보를 불러오지 못했어요', desc: '연결을 확인하는 중입니다', tone: 'warn' });
        }
      }

      schedule();
    }

    refreshRef.current = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };

    void tick();

    // 탭으로 돌아오면 3초를 기다리지 않고 바로 한 번 읽는다
    const onVisible = () => { if (!document.hidden) refreshRef.current(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      ac.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      refreshRef.current = () => {};
    };
  }, [mounted, simOn, focusId, pushToast]);

/* ── 공영주차장 — 30초 폴링 ────────────────────────────────
     서버가 1분 캐시를 두므로 30초면 충분하다 */
  useEffect(() => {
    if (!mounted || !simOn) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (!alive) return;
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(tick, 30_000);
        return;
      }
      try {
        const r = await fetch('/api/lots', { cache: 'no-store' });
        if (r.ok) {
          const data = (await r.json()) as PublicLot[];
          if (alive && Array.isArray(data) && data.length) setLots(data);
        }
      } catch (e) {
        console.error('[lots]', e);   // 실패해도 마지막 값을 유지한다
      }
      timer = setTimeout(tick, 30_000);
    }

    void tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [mounted, simOn]);

  /* 정리 중 → 빈 자리 자동 전환.
     서버(GET /api/stores)도 같은 40초 규칙으로 계산해서 내려준다. 여기 타이머는
     폴링과 폴링 사이의 최대 3초를 메우는 용도다. 기준이 같으므로 어긋나지 않는다. */
  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => {
      const now = Date.now();
      setStores((prev) => {
        let changed = false;
        const next = prev.map((s) => {
          const tables = s.tables.map((tb) => {
            if (tb.status === 'cleaning' && tb.cleaningAt && now - tb.cleaningAt >= CLEAN_AUTO_MS) {
              changed = true;
              return { ...tb, status: 'available' as const, cleaningAt: null };
            }
            return tb;
          });
          return changed ? { ...s, tables, tablesUpdated: now } : s;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mounted]);

  /** 쓰기 공통 — 보내고, 끝나면 즉시 다시 읽어 서버 값으로 맞춘다 */
  const send = useCallback(
    async (url: string, body: Record<string, unknown>, failMsg: string) => {
      try {
        const r = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          // 서버가 준 안내문이 우리 문구보다 정확하다.
          // 409(다른 직원이 먼저 누름)면 "화면을 새로고침해 주세요" 가 그대로 뜬다
          const j = await r.json().catch(() => null);
          pushToast({ title: failMsg, desc: j?.message ?? `오류 ${r.status}`, tone: 'warn' });
        }
      } catch (e) {
        console.error('[PATCH]', e);
        pushToast({ title: failMsg, desc: '연결을 확인해 주세요', tone: 'warn' });
      } finally {
        refreshRef.current();   // 성공이든 실패든 서버가 진실이다
      }
    },
    [pushToast],
  );

  const api: SpotApi = {
    mounted, stores, lots, reservations, adminRes, reviews, favorites, recent, simOn, toasts, log, profile,
    live, lastSync,
    refresh: () => refreshRef.current(),
    setSimOn, setRecent, pushToast, addLog, setAdminRes, updateProfile,

    getStore: (id) => stores.find((s) => s.id === id),
    getLot:   (id) => lots.find((l) => l.id === id),
    getRes:   (id) => reservations.find((r) => r.id === id),

    toggleFav: (id) => setFav((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),

    addReservation: (r) => {
      const id = 'r' + Math.random().toString(36).slice(2, 7);
      setRes((p) => [{ ...r, id }, ...p]);
      return id;
    },
    cancelReservation: (id) =>
      setRes((p) => p.map((r) => (r.id === id ? { ...r, status: 'canceled' as const } : r))),
    uploadReceipt: (id) =>
      setRes((p) => p.map((r) => (r.id === id ? { ...r, receipt: true } : r))),
    addReview: (storeId, resId, rating, text) => {
      setReviews((p) => [
        { id: 'v' + Math.random().toString(36).slice(2, 7), storeId, name: '김**', rating, date: '방금 전', text },
        ...p,
      ]);
      setRes((p) => p.map((r) => (r.id === resId ? { ...r, reviewed: true } : r)));
    },

    setSlot: (storeId, code, patch, logInput) => {
      const found = stores.find((s) => s.id === storeId)?.parking.slots.find((x) => x.code === code);

      // 1) 화면 먼저 바꾼다 — 관리자가 누른 즉시 반응해야 한다
      setStores((prev) =>
        prev.map((s) =>
          s.id !== storeId ? s : {
            ...s,
            parking: {
              ...s.parking,
              updated: Date.now(),
              slots: s.parking.slots.map((x) => (x.code !== code ? x : { ...x, ...patch })),
            },
          }
        )
      );
      if (logInput) addLog(logInput.who, logInput.msg, logInput.tone);

      // 2) 서버에 보낸다
      const body = toSlotBody(patch);
      if (!body) return;                                   // 수동 지정과 무관한 변경
      const slotId = found?.id ?? `${storeId}_${code}`;     // 목업에는 id 가 없다
      void send(`/api/admin/slots/${slotId}`, body, '주차면 상태를 저장하지 못했어요');
    },

    setTable: (storeId, tableId, patch, logInput) => {
      const before = stores.find((s) => s.id === storeId)?.tables.find((t) => t.id === tableId);

      setStores((prev) =>
        prev.map((s) =>
          s.id !== storeId ? s : {
            ...s,
            tablesUpdated: Date.now(),
            tables: s.tables.map((t) => (t.id !== tableId ? t : { ...t, ...patch })),
          }
        )
      );
      if (logInput) addLog(logInput.who, logInput.msg, logInput.tone);

      const action = toTableAction(before?.status, patch);
      if (!action) return;                                 // 상태가 안 바뀌는 변경
      void send(`/api/admin/tables/${tableId}`, { action }, '테이블 상태를 저장하지 못했어요');
    },

    // 배치도 통째 저장은 아직 API 가 없다 (B 담당 feat/b-layout-save). 지금은 메모리에만 반영한다
    setSlots: (storeId, slots, logInput) => {
      setStores((prev) =>
        prev.map((s) => (s.id !== storeId ? s : { ...s, parking: { ...s.parking, slots, updated: Date.now() } }))
      );
      if (logInput) addLog(logInput.who, logInput.msg, logInput.tone);
    },
    setTables: (storeId, tables, logInput) => {
      setStores((prev) => prev.map((s) => (s.id !== storeId ? s : { ...s, tables, tablesUpdated: Date.now() })));
      if (logInput) addLog(logInput.who, logInput.msg, logInput.tone);
    },
    setSensor: (storeId, sensor) =>
      setStores((prev) =>
        prev.map((s) => (s.id !== storeId ? s : { ...s, sensor, parking: { ...s.parking, updated: Date.now() } }))
      ),

      // [b4] 매장 정보 — 다른 쓰기와 같다. 화면을 먼저 바꾸고 보낸 뒤 다시 읽는다.
      updateStoreInfo: (storeId, patch) => {
        setStores((prev) =>
          prev.map((s) =>
            s.id !== storeId ? s : {
              ...s,
              name: patch.name,
              cat: patch.cat,
              addr: patch.addr,
              tel: patch.tel,
              open: patch.open,
              price: patch.price,
              parking: { ...s.parking, fee: patch.parkingFee },
            }
          )
        );
        void send(`/api/admin/stores/${storeId}`, toStoreBody(patch), '매장 정보를 저장하지 못했어요');
      },
  };

  return <SpotCtx.Provider value={api}>{children}</SpotCtx.Provider>;
}
