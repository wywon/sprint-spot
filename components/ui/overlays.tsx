'use client';

import React from 'react';
import { Icon } from './Icon';
import { Button } from './primitives';
import { cx } from '@/lib/format';
import { NAV_APPS } from '@/lib/tokens';
import { useApp } from '@/lib/store';
import type { Toast } from '@/lib/types';

/**
 * 겹쳐 뜨는 UI
 * ─────────────────────────────────────────────────────────────
 * BottomSheet : 모바일(손님 앱) 전용. 위로 올라온다.
 * Modal       : 데스크톱(관리자) 전용. 가운데 뜬다.
 * NavSheet    : 길안내 → 외부 지도앱 선택. 우리가 내비를 직접 만들지 않는다는 설계.
 * ToastHost   : 되돌리기(Undo) 버튼을 붙일 수 있는 알림.
 */

/* ── BottomSheet ────────────────────────────────────────── */

export const BottomSheet = ({
  open, onClose, title, sub, right, children, footer, maxH = '84%',
}: {
  open: boolean; onClose: () => void; title?: string; sub?: React.ReactNode;
  right?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; maxH?: string;
}) => {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[60]">
      <div className="absolute inset-0 bg-ink-900/40 animate-fadeIn" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-sheet animate-sheetUp flex flex-col"
        style={{ maxHeight: maxH }}
      >
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-ink-300" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-3 flex items-start gap-3 shrink-0">
            <div className="grow min-w-0">
              <div className="text-[17px] font-extrabold text-ink-900">{title}</div>
              {sub && <div className="text-[12.5px] font-bold text-ink-500 mt-0.5">{sub}</div>}
            </div>
            {right}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-ink-100 grid place-items-center text-ink-500 shrink-0">
              <Icon n="x" s={16} />
            </button>
          </div>
        )}
        <div className="px-5 pb-4 overflow-y-auto no-sb grow">{children}</div>
        {footer && <div className="px-5 pt-3 pb-6 border-t border-ink-200 shrink-0">{footer}</div>}
      </div>
    </div>
  );
};

/* ── NavSheet (외부 지도앱 연결) ────────────────────────── */

/**
 * [A6] 버튼만 있던 시트를 실제로 앱이 열리게 바꿨다.
 *
 * ★ 왜 웹 주소를 먼저 두지 않는가
 *   kakaomap:// 는 앱이 깔려 있으면 즉시 열리지만, 없으면 아무 일도 안 일어난다.
 *   그래서 앱을 먼저 부르고 1.2초 뒤에도 화면이 그대로면 웹 지도로 넘긴다.
 *   앱이 열렸다면 브라우저가 뒤로 밀리면서 document.hidden 이 true 가 되므로
 *   그걸로 "열렸다"를 판별한다. 타이머를 취소하지 않으면 앱에서 돌아왔을 때
 *   웹 지도가 한 번 더 뜬다.
 *
 * ★ 데스크톱에서는 스킴을 시도하지 않는다
 *   PC 브라우저는 알 수 없는 스킴에 경고창을 띄운다. 심사 중에 그게 뜨면 곤란하다.
 *
 * ★ 좌표가 없으면 버튼을 막는다
 *   목적지를 모르는 채로 지도앱을 열면 엉뚱한 곳이 뜬다.
 *   "누르면 아무 일도 안 일어나는 버튼"보다 "왜 못 누르는지 적힌 버튼"이 낫다.
 */
const isMobile = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod|android/i.test(navigator.userAgent);

function openKakaoRoute(name: string, lat: number, lng: number) {
  const web = `https://map.kakao.com/link/to/${encodeURIComponent(name || '목적지')},${lat},${lng}`;

  if (!isMobile()) {
    window.open(web, '_blank', 'noopener');
    return;
  }

  const app = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
  const timer = setTimeout(() => {
    if (!document.hidden) window.location.href = web;
  }, 1200);
  const cancel = () => clearTimeout(timer);
  document.addEventListener('visibilitychange', cancel, { once: true });
  window.addEventListener('pagehide', cancel, { once: true });

  window.location.href = app;
}

export const NavSheet = ({
  open, onClose, target, lat, lng,
}: {
  open: boolean;
  onClose: () => void;
  target: string;
  /** 목적지 실제 위경도. 없으면 버튼이 잠긴다 */
  lat?: number;
  lng?: number;
}) => {
  const ready =
    typeof lat === 'number' && typeof lng === 'number' &&
    lat > 33 && lat < 39 && lng > 124 && lng < 132;

  const go = () => {
    if (!ready) return;
    onClose();
    openKakaoRoute(target, lat as number, lng as number);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="길안내 시작" sub={target}>
      <div className="space-y-2 pb-2">
        {NAV_APPS.map((a) => (
          <button
            key={a.key}
            onClick={go}
            disabled={!ready}
            className={cx(
              'w-full flex items-center gap-3.5 p-3.5 rounded-2xl border border-ink-200 transition-colors',
              ready ? 'hover:bg-ink-50 active:scale-[.99]' : 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className={cx('w-11 h-11 rounded-xl grid place-items-center text-[17px] font-extrabold shrink-0', a.color, a.dark ? 'text-ink-900' : 'text-white')}>
              {a.initial}
            </span>
            <span className="grow text-left text-[14.5px] font-extrabold text-ink-900">{a.name}</span>
            <Icon n="chevR" s={17} cls="text-ink-300" />
          </button>
        ))}
        <div className="pt-2 text-[11.5px] font-medium text-ink-400 text-center leading-relaxed">
          {ready
            ? '앱이 설치되어 있지 않으면 웹 지도로 열려요'
            : '목적지 위치를 아직 확인하지 못했어요'}
        </div>
      </div>
    </BottomSheet>
  );
};

/* ── Modal (관리자) ─────────────────────────────────────── */

export const Modal = ({
  open, onClose, title, sub, children, footer, w = 'max-w-lg',
}: {
  open: boolean; onClose: () => void; title?: string; sub?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; w?: string;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-6">
      <div className="absolute inset-0 bg-ink-900/45 animate-fadeIn" onClick={onClose} />
      <div className={cx('relative bg-white rounded-2xl shadow-pop w-full animate-popIn max-h-[86vh] flex flex-col', w)}>
        <div className="px-6 pt-5 pb-4 flex items-start gap-3 border-b border-ink-200 shrink-0">
          <div className="grow min-w-0">
            <div className="text-[17px] font-extrabold text-ink-900">{title}</div>
            {sub && <div className="text-[12.5px] font-bold text-ink-500 mt-1 leading-relaxed">{sub}</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-ink-100 grid place-items-center text-ink-500 shrink-0">
            <Icon n="x" s={16} />
          </button>
        </div>
        {children && <div className="px-6 py-5 overflow-y-auto thin-sb grow">{children}</div>}
        {footer && <div className="px-6 py-4 border-t border-ink-200 flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
};

/* ── ToastHost ──────────────────────────────────────────── */

const TOAST_TONE: Record<string, string> = {
  brand: 'bg-brand-700', ok: 'bg-ok-600', warn: 'bg-warn-500', busy: 'bg-busy-600', off: 'bg-off-700',
};

export const ToastHost = ({ toasts }: { toasts: Toast[] }) => (
  <div className="absolute left-0 right-0 bottom-24 z-[90] px-4 space-y-2 pointer-events-none">
    {toasts.map((t) => (
      <div
        key={t.id}
        className={cx('rounded-2xl px-4 py-3 text-white shadow-pop flex items-center gap-3 animate-toastIn pointer-events-auto', TOAST_TONE[t.tone || 'brand'])}
      >
        {t.icon && <Icon n={t.icon} s={19} cls="shrink-0" />}
        <div className="grow min-w-0">
          <div className="text-[13.5px] font-extrabold">{t.title}</div>
          {t.desc && <div className="text-[11.5px] font-medium text-white/80 mt-0.5">{t.desc}</div>}
        </div>
        {t.actionLabel && (
          <button onClick={t.onAction} className="shrink-0 text-[12.5px] font-extrabold underline underline-offset-2">
            {t.actionLabel}
          </button>
        )}
      </div>
    ))}
  </div>
);

/** 스토어에 연결된 ToastHost. 레이아웃에 한 번만 놓으면 된다 */
export const Toaster = () => {
  const { toasts } = useApp();
  return <ToastHost toasts={toasts} />;
};

/** 확인이 필요한 파괴적 동작에 쓰는 모달. 잘못 누름을 막는 장치 */
export const ConfirmModal = ({
  open, onClose, title, sub, confirmLabel = '확인', danger, onConfirm,
}: {
  open: boolean; onClose: () => void; title: string; sub?: string;
  confirmLabel?: string; danger?: boolean; onConfirm: () => void;
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    sub={sub}
    w="max-w-md"
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel}
        </Button>
      </>
    }
  />
);