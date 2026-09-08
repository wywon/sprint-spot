'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { cx, fmtTime } from '@/lib/format';
import { ADMIN_NAV, ADMIN_STORE_ID } from '@/lib/tokens';
import { useApp, useNow } from '@/lib/store';
import LogoutButton from './LogoutButton'; 

/**
 * 관리자 사이드바
 * ─────────────────────────────────────────────────────────────
 * ★ 점주/직원 구분을 두지 않는다. 하나의 '매장 관리자'로 통합했다.
 *   소규모 매장에서는 사장과 직원이 같은 태블릿을 쓴다. 권한을 나누면
 *   로그인 전환이라는 마찰만 생기고 얻는 게 없다.
 */
export const AdminSidebar = () => {
  const pathname = usePathname();
  const { getStore, adminRes } = useApp();
  const store = getStore(ADMIN_STORE_ID);
  const upcoming = adminRes.filter((r) => r.status === 'upcoming').length;

  if (!store) return null;

  return (
    <aside className="w-[236px] shrink-0 bg-ink-900 text-white flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-[11px] font-extrabold tracking-[.16em] text-brand-300">SPOT ADMIN</div>
        <div className="text-[16px] font-extrabold mt-1">{store.name}</div>
        <div className="text-[11.5px] text-white/50 font-bold mt-0.5 tnum">
          테이블 {store.tables.length} · 주차 {store.parking.slots.length}면
        </div>
      </div>

      <nav className="p-3 grow">
        {ADMIN_NAV.map((it) => {
          // '/admin' 은 정확히 일치할 때만 활성 (하위 경로에서 같이 켜지면 안 된다)
          const on = it.href === '/admin' ? pathname === '/admin' : pathname.startsWith(it.href);
          const alert = it.key === 'parking' && store.sensor === 'offline';
          const badge = it.key === 'hall' ? upcoming : 0;
          return (
            <Link
              key={it.key}
              href={it.href}
              className={cx(
                'w-full flex items-center gap-3 px-3.5 h-11 rounded-xl mb-1 transition-colors text-[13.5px] font-bold',
                on ? 'bg-brand-600 text-white' : 'text-white/60 hover:bg-white/[.07] hover:text-white'
              )}
            >
              <Icon n={it.icon} s={19} />
              <span className="grow text-left">{it.label}</span>
              {badge > 0 && (
                <span className="text-[10.5px] font-extrabold bg-white/20 px-1.5 rounded-full tnum">{badge}</span>
              )}
              {alert && <span className="w-2 h-2 rounded-full bg-warn-300 animate-pulseDot" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-8 h-8 rounded-full bg-brand-500 grid place-items-center text-[12px] font-extrabold">최</div>
          <div className="grow min-w-0">
            <div className="text-[12.5px] font-bold truncate">최영호</div>
            <div className="text-[10.5px] text-white/45 font-bold">매장 관리자</div>
          </div>
          <button className="text-white/40 hover:text-white" aria-label="로그아웃">
            <Icon n="logout" s={17} />
          </button>
        </div>
      </div>
      <LogoutButton />
    </aside>
  );


};

/** 관리자 화면 상단 바 */
export const AdminTopbar = ({
  title, sub, right,
}: { title: string; sub?: string; right?: React.ReactNode }) => {
  const now = useNow(1000);
  const { getStore } = useApp();
  const store = getStore(ADMIN_STORE_ID);
  const offline = store?.sensor === 'offline';

  return (
    <header className="h-[68px] shrink-0 bg-white border-b border-ink-200 px-7 flex items-center gap-4">
      <div className="grow">
        <div className="text-[19px] font-extrabold text-ink-900 leading-tight">{title}</div>
        {sub && <div className="text-[12px] font-bold text-ink-500 mt-0.5">{sub}</div>}
      </div>
      {right}
      <div
        className={cx(
          'flex items-center gap-2 h-9 px-3 rounded-xl border text-[12px] font-extrabold',
          offline ? 'bg-busy-50 border-busy-200 text-busy-600' : 'bg-ok-50 border-ok-200 text-ok-600'
        )}
      >
        <span className={cx('w-2 h-2 rounded-full', offline ? 'bg-busy-500' : 'bg-ok-500 animate-pulseDot')} />
        {offline ? '센서 연결 끊김' : '센서 연결됨'}
      </div>
      <div className="text-[12px] font-bold text-ink-500 tnum w-[42px] text-right">
        {now ? fmtTime(new Date(now)) : '--:--'}
      </div>
    </header>
  );
};
