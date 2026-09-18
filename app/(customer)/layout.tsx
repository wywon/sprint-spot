import React from 'react';
import { PhoneChrome, TabBar } from '@/components/customer/Shell';
import { Toaster } from '@/components/ui/overlays';
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
 *
 * [b13] 상단 개발 바(ModeSwitch)를 걷어냈다.
 *   「개발 모드 · 목업 데이터」 문구와 손님앱/관리자 전환 버튼이 시연 화면에
 *   그대로 노출됐다. 손님에게 보여 줄 화면에 개발자용 안내가 있으면
 *   "아직 덜 된 것"으로 읽힌다.
 *   화면 전환은 주소로 한다 — 손님 /explore · 관리자 /admin
 *   실시간 시뮬레이션 켜고 끄기는 마이 → 앱 설정에 그대로 있다.
 *   되돌리려면 components/ModeSwitch.tsx 를 여기와 (admin)/layout.tsx 에
 *   다시 넣으면 된다. 파일은 지우지 않았다.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-100 flex flex-col">
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
