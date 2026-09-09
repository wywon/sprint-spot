import React from 'react';
import { PhoneChrome, TabBar } from '@/components/customer/Shell';
import { Toaster } from '@/components/ui/overlays';
import { ModeSwitch } from '@/components/ModeSwitch';
import { SettingsBoot } from './SettingsBoot';
/**
 * 손님 앱 레이아웃 — Mobile First (390 × 844 기준)
 * ─────────────────────────────────────────────────────────────
 * 이 그룹 아래의 모든 화면은 폰 틀 안에서 렌더된다.
 *
 * ★ 탭바 표시 규칙은 TabBar 안에 있다. 화면마다 prop 으로 넘기지 않는다.
 *   화면이 늘어날수록 "이 화면에서 탭바를 켜야 하나?"를 매번 판단하게 되는데,
 *   그걸 한 군데(TAB_ROUTES)에서만 정하도록 만든 것이다.
 *
 * ★ 실제 배포 시에는 <PhoneChrome> 만 걷어내면 그대로 모바일 웹이 된다.
 *   화면 코드는 이미 absolute inset-0 기준으로 작성되어 있다.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-100 flex flex-col">
      <ModeSwitch />
      <div className="grow grid place-items-center py-8 overflow-y-auto thin-sb">
        <PhoneChrome>
          <SettingsBoot/>
          <div className="absolute inset-0 bg-white spot-zoom">
            {children}
            <TabBar />
            <Toaster />
          </div>
        </PhoneChrome>
      </div>
    </div>
  );
}
