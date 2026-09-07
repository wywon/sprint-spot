'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CLEAN_AUTO_MS } from './tokens';
import { fmtTime, rnd } from './format';
import {
  ADMIN_RES, INITIAL_RESERVATIONS, PARTNER_STORES, PUBLIC_LOTS, REVIEWS, ME
} from './mock';
import type {
  AdminReservation, LogEntry, ParkingSlot, PartnerStore, Profile, PublicLot,
  Reservation, Review, SensorState, StoreTable, Toast, 
} from './types';

/**
 * 전역 상태
 * ─────────────────────────────────────────────────────────────
 * MVP에서는 상태 관리 라이브러리를 쓰지 않는다. Context 하나로 충분하고,
 * 비전공자 팀에게는 Redux/Zustand 학습 비용이 더 크다.
 *
 * ★ 4주차 교체 지점
 *   여기서 setStores(...) 를 호출하는 자리를
 *   fetch('/api/admin/tables/...', {method:'PATCH'}) → 응답으로 갱신
 *   으로 바꾸면 그대로 실서비스가 된다. 화면 코드는 손대지 않는다.
 *
 * ★ Hydration 주의
 *   목업의 timestamp 는 전부 0으로 시작한다. 서버 렌더링 시점에 Date.now() 를
 *   쓰면 서버와 브라우저 값이 달라져서 Next.js 가 hydration 에러를 낸다.
 *   그래서 마운트된 뒤(useEffect)에 한 번 시각을 채워 넣는다.
 */

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
  const [simOn, setSimOn] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [profile, setProfile] = useState<Profile>(ME); //서버 렌더링 시 ME 객체 고정

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

  /* ── 실시간 시뮬레이터 ──────────────────────────────────
     4주차에 이 useEffect 를 통째로 지우고 폴링(usePolling)으로 바꾼다. */
  useEffect(() => {
    if (!mounted || !simOn) return;

    const a = setInterval(() => {               // 주차면 센서 3.5초
      setStores((prev) =>
        prev.map((s) => {
          if (s.sensor === 'offline') return s;
          const slots = [...s.parking.slots];
          const i = rnd(0, slots.length - 1);
          const sl = slots[i];
          if (sl.manualStatus && sl.manualUntil && sl.manualUntil > Date.now()) return s;
          if (sl.type === 'disabled') return s;
          const r = Math.random();
          const nx = r < 0.45 ? 'available' : r < 0.93 ? 'occupied' : 'unknown';
          if (nx === sl.autoStatus) return s;
          slots[i] = { ...sl, autoStatus: nx, confidence: nx === 'unknown' ? 0.42 : 0.97 };
          return { ...s, parking: { ...s.parking, slots, updated: Date.now() } };
        })
      );
    }, 3500);

    const b = setInterval(() => {               // 좌석 5초
      setStores((prev) =>
        prev.map((s) => {
          const t = [...s.tables];
          const i = rnd(0, t.length - 1);
          const tb = t[i];
          if (tb.status === 'available' && Math.random() < 0.45) {
            t[i] = { ...tb, status: 'occupied', guest: rnd(1, tb.seats), since: fmtTime(new Date()) };
          } else if (tb.status === 'occupied' && Math.random() < 0.4) {
            t[i] = { ...tb, status: 'cleaning', guest: null, since: null, cleaningAt: Date.now() };
          } else {
            return s;
          }
          return { ...s, tables: t, tablesUpdated: Date.now() };
        })
      );
    }, 5000);

    const c = setInterval(() => {               // 공영주차장 9초
      setLots((prev) =>
        prev.map((l) => ({
          ...l,
          available: Math.max(0, Math.min(l.total, l.available + rnd(-4, 4))),
          updated: Date.now(),
        }))
      );
    }, 9000);

    return () => { clearInterval(a); clearInterval(b); clearInterval(c); };
  }, [mounted, simOn]);

  /* 정리 중 → 빈 자리 자동 전환. 관리자가 '정리 완료'를 누르지 않아도 풀린다 */
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

  const api: SpotApi = {
    mounted, stores, lots, reservations, adminRes, reviews, favorites, recent, simOn, toasts, log, profile,
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
    },
    setSlots: (storeId, slots, logInput) => {
      setStores((prev) =>
        prev.map((s) => (s.id !== storeId ? s : { ...s, parking: { ...s.parking, slots, updated: Date.now() } }))
      );
      if (logInput) addLog(logInput.who, logInput.msg, logInput.tone);
    },
    setTable: (storeId, tableId, patch, logInput) => {
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
    },
    setTables: (storeId, tables, logInput) => {
      setStores((prev) => prev.map((s) => (s.id !== storeId ? s : { ...s, tables, tablesUpdated: Date.now() })));
      if (logInput) addLog(logInput.who, logInput.msg, logInput.tone);
    },
    setSensor: (storeId, sensor) =>
      setStores((prev) =>
        prev.map((s) => (s.id !== storeId ? s : { ...s, sensor, parking: { ...s.parking, updated: Date.now() } }))
      ),
  };

  return <SpotCtx.Provider value={api}>{children}</SpotCtx.Provider>;
}
