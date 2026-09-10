'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button, Card, Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/format';
import { useApp } from '@/lib/store';
import {
  DEFAULT_SETTINGS, FONT_LABEL, FONT_RATIO,
  loadSettings, saveSettings, type FontSize, type Settings,
} from '@/lib/settings';

/**
 * 앱 설정 · 접근성
 * ─────────────────────────────────────────────────────────────
 * ★ 스위치 옆에 켬/끔 글자를 같이 둔다.
 *   UX 절대 규칙 1 — 색상만으로 상태를 전달하지 않는다.
 *
 * ★ 저장값은 마운트 뒤에 읽는다.
 *   서버 렌더 때 localStorage 를 읽으면 hydration 이 깨진다.
 *
 * ★ 알림은 값만 저장한다. 실제 푸시 발송은 MVP 범위 밖이므로
 *   "기기 알림이 꺼져 있으면 소용없다"는 사실을 화면에 적어 둔다.
 *   토글은 켜졌는데 알림이 안 오는 상황이 가장 나쁜 경험이다.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { pushToast } = useApp();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => { setS(loadSettings()); }, []);

  const patch = (p: Partial<Settings>) => {
    const next = { ...s, ...p };
    setS(next);
    saveSettings(next);
  };

  return (
    <div className="absolute inset-0 pt-11 pb-8 bg-ink-50 overflow-y-auto no-sb">
      {/* 헤더 */}
      <div className="bg-white px-2 py-2.5 border-b border-ink-200 flex items-center gap-1">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="w-9 h-9 rounded-full grid place-items-center text-ink-600 hover:bg-ink-100 shrink-0"
        >
          <Icon n="chevL" s={20} />
        </button>
        <div className="text-[16px] font-extrabold text-ink-900">앱 설정 · 접근성</div>
      </div>

      <div className="p-4 space-y-3">
        {/* ── 알림 ─────────────────────────────────── */}
        <Card className="p-1">
          <div className="px-3.5 pt-3 pb-1 text-[13px] font-extrabold text-ink-900">알림</div>
          <Toggle
            label="예약 30분 전 알림" desc="예약 시간이 다가오면 알려드려요"
            on={s.notiReserve} onToggle={() => patch({ notiReserve: !s.notiReserve })}
          />
          <Toggle
            label="출발할 시간 알림" desc="주차와 이동 시간을 계산해서 알려드려요"
            on={s.notiDepart} onToggle={() => patch({ notiDepart: !s.notiDepart })}
          />
          <Toggle
            label="혜택 · 소식" desc="새로 입점한 매장과 이벤트 소식을 받아요"
            on={s.notiNews} onToggle={() => patch({ notiNews: !s.notiNews })}
          />
          <div className="mx-3.5 mb-3 mt-1 rounded-xl bg-ink-50 px-3 py-2.5 flex items-start gap-2">
            <Icon n="question" s={14} cls="text-ink-400 shrink-0 mt-0.5" />
            <span className="text-[11px] font-medium text-ink-600 leading-relaxed">
              휴대폰 설정에서 SPOT 알림이 꺼져 있으면 위 설정과 상관없이 알림이 오지 않아요.
            </span>
          </div>
        </Card>

        {/* ── 글자 크기 ─────────────────────────────── */}
        <Card className="p-4">
          <div className="text-[13px] font-extrabold text-ink-900 mb-3">글자 크기</div>
          <Segmented<FontSize>
            full
            value={s.fontSize}
            onChange={(v) => patch({ fontSize: v })}
            options={(['small', 'normal', 'large'] as const).map((v) => ({
              value: v, label: FONT_LABEL[v],
            }))}
          />

          <div className="text-[11px] font-bold text-ink-400 mt-3 mb-1.5">미리보기</div>
          <div
            className="rounded-xl border border-ink-200 px-3.5 py-3"
            style={{ zoom: FONT_RATIO[s.fontSize] }}
          >
            <div className="text-[14.5px] font-extrabold text-ink-900">대흥동 손칼국수</div>
            <div className="text-[12px] font-bold text-ink-500 mt-0.5">
              지금 이용 가능한 테이블 4개 · 주차 3자리
            </div>
          </div>
          <div className="text-[11px] font-medium text-ink-500 mt-2 leading-relaxed">
            앱 전체 글자와 버튼이 함께 커집니다.
          </div>
        </Card>

        {/* ── 접근성 ────────────────────────────────── */}
        <Card className="p-1">
          <div className="px-3.5 pt-3 pb-1 text-[13px] font-extrabold text-ink-900">접근성</div>
          <Toggle
            label="화면 움직임 줄이기" desc="애니메이션과 깜빡임을 최소로 줄여요"
            on={s.reduceMotion} onToggle={() => patch({ reduceMotion: !s.reduceMotion })}
          />
          <div className="mx-3.5 mb-3 mt-1 rounded-xl bg-brand-50 border border-brand-100 px-3.5 py-3 flex items-start gap-2.5">
            <Icon n="sparkle" s={16} cls="text-brand-600 shrink-0 mt-0.5" />
            <div className="text-[11.5px] font-medium text-brand-800/85 leading-relaxed">
              SPOT은 <b>색깔만으로 상태를 알려주지 않아요.</b> 좌석과 주차 상태는
              언제나 아이콘과 글자를 함께 보여드립니다.
            </div>
          </div>
        </Card>

        {/* ── 기타 ─────────────────────────────────── */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="grow">
              <div className="text-[13px] font-extrabold text-ink-900">설정 초기화</div>
              <div className="text-[11.5px] font-medium text-ink-500 mt-0.5">
                알림과 글자 크기를 기본값으로 되돌려요
              </div>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                setS(DEFAULT_SETTINGS);
                saveSettings(DEFAULT_SETTINGS);
                pushToast({ title: '기본값으로 되돌렸어요', tone: 'ok' });
              }}
            >
              초기화
            </Button>
          </div>
          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between">
            <span className="text-[12px] font-bold text-ink-500">앱 버전</span>
            <span className="text-[12px] font-extrabold text-ink-800 tnum">0.1.0</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── 토글 한 줄 ──────────────────────────────────────────────
   마이페이지의 시뮬레이션 스위치와 같은 치수를 쓴다.
   다만 켬/끔 글자를 옆에 붙였다 — 색만으로는 상태를 전달하지 않는다. */
function Toggle({
  label, desc, on, onToggle,
}: { label: string; desc?: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3.5 py-3.5 hover:bg-ink-50 rounded-xl transition-colors text-left"
    >
      <span className="grow min-w-0">
        <span className="block text-[13.5px] font-bold text-ink-800">{label}</span>
        {desc && <span className="block text-[11.5px] font-medium text-ink-500 mt-0.5">{desc}</span>}
      </span>
      <span className={cx('text-[10.5px] font-extrabold shrink-0', on ? 'text-ok-600' : 'text-ink-400')}>
        {on ? '켬' : '끔'}
      </span>
      <span className={cx('w-[46px] h-[26px] rounded-full transition-colors relative shrink-0', on ? 'bg-ok-500' : 'bg-ink-300')}>
        <span className={cx('absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all', on ? 'left-[23px]' : 'left-[3px]')} />
      </span>
    </button>
  );
}