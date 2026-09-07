'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button, Card, Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/format';
import { useApp } from '@/lib/store';
import type { CarType, Profile } from '@/lib/types';

/**
 * 프로필 수정
 * ─────────────────────────────────────────────────────────────
 * ★ 편집 진입점은 여기 하나다.
 *   my/page.tsx 의 차량 인라인 편집기는 이 화면으로 옮기면서 지웠다.
 *   같은 값을 두 군데서 고치면 "저장했는데 왜 안 바뀌지"가 반드시 생긴다.
 *
 * ★ Hydration
 *   profile 은 첫 렌더에 ME, 마운트 뒤 localStorage 값으로 바뀐다.
 *   useState(profile) 로만 잡으면 폼에 저장값이 아니라 ME 가 남는다.
 *   그래서 mounted 를 보고 한 번 동기화한다.
 *
 * ★ 저장은 updateProfile 한 줄만 거친다.
 *   4주차에 API 로 바꿔도 이 화면은 고치지 않는다.
 */

const CAR_TYPES: { value: CarType; label: string }[] = [
  { value: '경차', label: '경차' },
  { value: '중형', label: '중형' },
  { value: '대형', label: '대형' },
  { value: '전기차', label: '전기차' },
];

/** 010-1234-5678 형태로 자동 정리 */
function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 12가3456 / 서울12가3456 */
const CAR_RE = /^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/;

type Errors = Partial<Record<'name' | 'phone' | 'car', string>>;

function validate(f: Profile): Errors {
  const e: Errors = {};

  const name = f.name.trim();
  if (!name) e.name = '이름을 입력해 주세요';
  else if (name.length > 20) e.name = '이름은 20자까지 쓸 수 있어요';

  const digits = f.phone.replace(/\D/g, '');
  if (!digits) e.phone = '연락처를 입력해 주세요';
  else if (digits.length < 10 || digits.length > 11) e.phone = '연락처를 정확히 입력해 주세요';

  const car = f.car.trim();
  if (car && !CAR_RE.test(car)) e.car = '차량번호 형식을 확인해 주세요 (예: 12가3456)';

  return e;
}

export default function ProfileEditPage() {
  const router = useRouter();
  const { profile, updateProfile, pushToast, mounted } = useApp();

  const [form, setForm] = useState<Profile>(profile);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  /* 마운트 뒤 localStorage 값이 들어오면 폼에 한 번 반영 */
  useEffect(() => {
    if (mounted) setForm(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const errors = validate(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(profile);
  const canSave = dirty && Object.keys(errors).length === 0 && !saving;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = () => {
    setTouched({ name: true, phone: true, car: true });
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      updateProfile({ ...form, name: form.name.trim(), car: form.car.trim() });
      pushToast({ title: '프로필을 저장했어요', tone: 'ok', icon: 'check' });
      router.replace('/my');   // push 아님 — 뒤로가기로 편집 화면에 다시 안 들어오게
    } catch {
      setSaving(false);
      pushToast({
        title: '저장하지 못했어요',
        desc: '잠시 후 다시 시도해 주세요',
        tone: 'busy',
        icon: 'alert',
      });
    }
  };

  const back = () => {
    if (dirty && !confirm('저장하지 않고 나갈까요?')) return;
    router.back();
  };

  return (
    <div className="absolute inset-0 pt-11 bg-ink-50 flex flex-col">
      {/* 서브 헤더 — Shell.tsx 에 공용 부품이 있으면 그걸로 교체 */}
      <div className="bg-white border-b border-ink-200 h-14 flex items-center px-2 shrink-0">
        <button
          onClick={back}
          aria-label="뒤로"
          className="w-10 h-10 grid place-items-center rounded-xl hover:bg-ink-50"
        >
          <Icon n="chevL" s={20} cls="text-ink-700" />
        </button>
        <div className="text-[16px] font-extrabold text-ink-900">프로필 수정</div>
      </div>

      <div className="grow overflow-y-auto no-sb p-4 space-y-3">
        <Card className="p-4 space-y-4">
          <Field label="이름" error={touched.name ? errors.name : undefined}>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              placeholder="이름"
              maxLength={20}
              className={inputCls(touched.name && errors.name)}
            />
          </Field>

          <Field
            label="연락처"
            help="예약 조회에 사용돼요. 바꾸면 이전 예약을 못 찾을 수 있어요"
            error={touched.phone ? errors.phone : undefined}
          >
            <input
              value={form.phone}
              onChange={(e) => set('phone', formatPhone(e.target.value))}
              onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
              inputMode="numeric"
              placeholder="010-0000-0000"
              className={cx(inputCls(touched.phone && errors.phone), 'tnum')}
            />
          </Field>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="text-[13px] font-extrabold text-ink-900">차량 정보</div>

          <Field
            label="차량번호"
            optional
            help="등록하신 차량 번호는 매장에서 주차 시간을 정산할 때 쓰여요"
            error={touched.car ? errors.car : undefined}
          >
            <input
              value={form.car}
              onChange={(e) => set('car', e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, car: true }))}
              placeholder="12가3456"
              className={cx(inputCls(touched.car && errors.car), 'tnum')}
            />
          </Field>

          <Field label="차종">
            <Segmented
              full
              value={form.carType}
              onChange={(v) => set('carType', v)}
              options={CAR_TYPES}
            />
          </Field>
        </Card>
      </div>

      {/* 하단 고정 CTA — 키보드가 올라와도 사라지지 않는다 */}
      <div className="shrink-0 bg-white border-t border-ink-200 px-4 py-3 pb-5">
        <Button variant="primary" size="lg" full disabled={!canSave} onClick={save}>
          {saving ? '저장 중…' : '저장하기'}
        </Button>
      </div>
    </div>
  );
}

/* ── 로컬 부품 ────────────────────────────────────────────
   components/ui/** 는 C 소유라 여기서 고칠 수 없다.
   5주차 정리 때 C 가 primitives.tsx 로 옮긴다.
   ★ export 를 붙이지 말 것 — page.tsx 는 default 외 export 를 허용하지 않는다 */

const inputCls = (bad?: string | false) =>
  cx(
    'w-full h-11 rounded-xl border px-3.5 text-[14px] font-bold outline-none transition-colors',
    bad ? 'border-busy-500 focus:border-busy-500' : 'border-ink-200 focus:border-brand-500'
  );

function Field({
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
          <Icon n="alert" s={13} cls="text-busy-500 shrink-0 mt-[1px]" />
          <span className="text-[11.5px] font-bold text-busy-600 leading-relaxed">{error}</span>
        </div>
      ) : help ? (
        <div className="text-[11px] font-medium text-ink-500 mt-1.5 leading-relaxed">{help}</div>
      ) : null}
    </div>
  );
}