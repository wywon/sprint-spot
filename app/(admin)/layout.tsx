import React from 'react';
import { AdminSidebar } from '@/components/admin/Sidebar';
import { Toaster } from '@/components/ui/overlays';
import { ModeSwitch } from '@/components/ModeSwitch';
import NoShowSweeper from '@/components/admin/NoShowSweeper'

/**
 * 관리자 패널 레이아웃 — Desktop First (1440 / 1280 기준)
 * ─────────────────────────────────────────────────────────────
 * 손님 앱과 완전히 다른 셸을 쓴다. 이것이 라우트 그룹을 나눈 이유다.
 *
 * ★ 관리자 UX의 제1원칙 — 빠른 상황 파악, 최소 조작 횟수.
 *   그래서 사이드바를 항상 펼쳐 두고(접기 버튼 없음), 화면 전환을 1클릭으로 만든다.
 *
 * ★ 로그인은 MVP 범위 밖이다.
 *   4주차에 붙일 때는 이 레이아웃 안에서 미들웨어 쿠키를 확인하고
 *   없으면 /admin/login 으로 보내는 방식이 가장 간단하다.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-ink-50">
      <ModeSwitch />
      <div className="grow flex overflow-hidden relative">
        <AdminSidebar />
        <main className="grow flex flex-col overflow-hidden">{children}</main>
        <NoShowSweeper />   
        <Toaster />
      </div>
    </div>
  );
}
