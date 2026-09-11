'use client';

import React, { use, useEffect, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { SubHeader, StickyCta } from '@/components/customer/Shell';
import { cx, fmtDateK, pad } from '@/lib/format';
import { parkStats, seatStats } from '@/lib/status';
import { ME } from '@/lib/mock';
import { useApp } from '@/lib/store';

/**
 * 테이블 예약 — 3단계
 * ─────────────────────────────────────────────────────────────
 * 1단계  인원 → 날짜 → 시간   (이 순서가 중요하다. 아래 설명 참고)
 * 2단계  좌석 유형 · 요청사항
 * 3단계  내용 확인 + 주차 예상 + 알림 + 노쇼 동의
 *
 * ★ 왜 인원이 먼저인가
 *   인원이 정해져야 어떤 시간이 실제로 가능한지 계산할 수 있다.
 *   날짜를 먼저 고르게 하면 시간 버튼을 눌러 본 뒤에야 "인원이 안 맞습니다"를
 *   알려 주게 되는데, 그건 되돌아가야 하는 흐름이라 나쁘다.
 *
 * ★ 시간 버튼은 두 가지 상태뿐이다 — 선택 가능 / 선택 불가.
 *   '마감 임박' 같은 중간 라벨을 없앴다. 손님이 할 결정은 "이 시간에 되나"이고,
 *   임박 여부는 그 결정을 돕지 않으면서 화면만 복잡하게 만든다.
 *
 * ★ 테이블을 고르지 않는다. 테이블 번호도 나오지 않는다.
 *   자리 배정은 매장이 그날 상황을 보고 결정하는 게 서로에게 낫다.
 */

const PARTIES = [1, 2, 3, 4, 5, 6, 7, 8];
const SEAT_TYPES = ['상관없음', '창가석', '테이블석', '룸'];
const ALL_TIMES = ['11:00','11:30','12:00','12:30','13:00','13:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00'];

/** 14일치 날짜 후보 */
function buildDates(base: Date) {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return {
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      day: d.getDate(),
      dow: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()],
      weekend: d.getDay() === 0 || d.getDay() === 6,
    };
  });
}

/**
 * 그 시간에 예약을 받을 수 있는가.
 * ★ 목업이지만 Math.random 을 쓰지 않는다 — 다시 렌더할 때마다 답이 바뀌면 안 된다.
 *   4주차에 이 함수를 서버 호출로 바꾼다: GET /api/stores/[id]/slots?date=&party=
 */
function timeOpen(dateKey: string, time: string, party: number): boolean {
  const seed = [...(dateKey + time)].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (party >= 7) return seed % 4 !== 0;   // 단체는 자리가 적다
  if (party >= 5) return seed % 5 !== 0;
  return seed % 7 !== 0;
}

export default function ReservePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getStore, addReservation, pushToast } = useApp();

  const [step, setStep] = useState(1);
  const [party, setParty] = useState(2);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [seatType, setSeatType] = useState('상관없음');
  const [memo, setMemo] = useState('');
  const [alertOn, setAlertOn] = useState(true);
  const [agree, setAgree] = useState(false);

  const store = getStore(id);
  if (!store) notFound();

  /**
   * 날짜 후보는 마운트 뒤에 채운다.
   * ─────────────────────────────────────────────────────────
   * 예전 코드는 useMemo(() => buildDates(new Date(2026, 7, 18)), []) 였다.
   * 문제가 둘이었다.
   *
   *   1. 8월 18일이 그대로 박혀 있었다. 오늘이 9월이어도 8월 18일부터 시작했다.
   *   2. useMemo 는 서버 렌더에서도 돈다. 'use client' 가 붙어 있어도
   *      Next.js 는 첫 HTML 을 서버에서 만든다. 거기서 new Date() 를 부르면
   *      Vercel(UTC)과 브라우저(KST)의 날짜가 9시간 어긋난다.
   *      한국 시간으로 자정~오전 9시 사이에는 서버가 '어제'를 그려서
   *      hydration 불일치가 나고, 첫 날짜가 하루 밀린다.
   *
   * useEffect 는 브라우저에서만 돌기 때문에 두 문제를 한 번에 없앤다.
   * 값이 채워지기 전 한 프레임 동안은 날짜 칸이 비는데, 그건 아래에서 자리만 잡아 둔다.
   *
   * ※ 서버가 계산하는 값(hours.isOpen, 예약 since)은 이 방법으로 못 고친다.
   *   Vercel 환경변수에 TZ=Asia/Seoul 을 넣어야 한다. 아직 안 넣었다.
   */
  const [dates, setDates] = useState<ReturnType<typeof buildDates>>([]);
  useEffect(() => { setDates(buildDates(new Date())); }, []);
  const ss = seatStats(store);
  const ps = parkStats(store);

  const canNext = step === 1 ? !!(party && date && time) : step === 2 ? true : agree;

  const submit = () => {
    if (!date || !time) return;
    const rid = addReservation({
      storeId: store.id, date, time, party, seatType,
      status: 'upcoming', name: ME.name, phone: ME.phone, memo, parkingAlert: alertOn,
    });
    pushToast({ title: '예약이 확정되었어요', desc: `${store.name} · ${fmtDateK(date)} ${time}`, tone: 'ok', icon: 'check' });
    router.push(`/reserve/${store.id}/done?rid=${rid}`);
  };

  return (
    <div className="absolute inset-0 bg-ink-50">
      <SubHeader
        title="테이블 예약"
        sub={store.name}
        onBack={() => (step > 1 ? setStep(step - 1) : router.back())}
      />

      {/* 단계 표시 */}
      <div className="absolute top-[92px] left-0 right-0 z-10 bg-white border-b border-ink-200 px-4 py-3">
        <div className="flex items-center gap-2">
          {['인원 · 일시', '좌석 · 요청', '확인'].map((l, i) => {
            const n = i + 1;
            return (
              <React.Fragment key={l}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cx(
                      'w-5 h-5 rounded-full grid place-items-center text-[10.5px] font-extrabold',
                      step > n ? 'bg-ok-500 text-white' : step === n ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-500'
                    )}
                  >
                    {step > n ? <Icon n="check" s={11} /> : n}
                  </span>
                  <span className={cx('text-[11.5px] font-extrabold', step >= n ? 'text-ink-900' : 'text-ink-400')}>{l}</span>
                </div>
                {i < 2 && <div className="grow h-px bg-ink-200" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-0 pt-[150px] pb-[104px] overflow-y-auto no-sb">
        <div className="p-4 space-y-3">
          {/* ── 1단계 ───────────────────────────────── */}
          {step === 1 && (
            <>
              <Card className="p-4">
                <div className="text-[13px] font-extrabold text-ink-900 mb-1">몇 분이서 오시나요?</div>
                <div className="text-[11.5px] font-bold text-ink-500 mb-3">인원에 따라 가능한 시간이 달라져요</div>
                <div className="grid grid-cols-4 gap-2">
                  {PARTIES.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setParty(p); setTime(null); }}
                      className={cx(
                        'h-12 rounded-xl border-2 text-[14px] font-extrabold tnum transition-all active:scale-[.97]',
                        party === p ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-700 border-ink-200'
                      )}
                    >
                      {p}명
                    </button>
                  ))}
                </div>
                {party > ss.maxParty && ss.maxParty > 0 && (
                  <div className="mt-3 rounded-xl bg-warn-50 border border-warn-200 px-3 py-2.5 text-[11.5px] font-medium text-warn-700 leading-relaxed">
                    지금 바로 앉을 수 있는 가장 큰 자리는 {ss.maxParty}인석이에요. 예약은 가능해요.
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <div className="text-[13px] font-extrabold text-ink-900 mb-3">언제 오시나요?</div>
                <div className="flex gap-2 overflow-x-auto no-sb -mx-4 px-4 pb-1">
                  {/* 마운트 전 한 프레임 — 칸 높이가 튀지 않게 자리만 잡아 둔다 */}
                  {dates.length === 0 &&
                    Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className="shrink-0 w-[54px] h-[64px] rounded-xl bg-ink-100 animate-pulse" />
                    ))}
                  {dates.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => { setDate(d.key); setTime(null); }}
                      className={cx(
                        'shrink-0 w-[54px] h-[64px] rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-[.97]',
                        date === d.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-ink-200'
                      )}
                    >
                      <span className={cx('text-[10.5px] font-bold', date === d.key ? 'text-white/80' : d.weekend ? 'text-busy-400' : 'text-ink-400')}>
                        {d.dow}
                      </span>
                      <span className={cx('text-[16px] font-extrabold tnum', date === d.key ? 'text-white' : 'text-ink-900')}>
                        {d.day}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-[13px] font-extrabold text-ink-900 mb-1">시간을 골라 주세요</div>
                <div className="text-[11.5px] font-bold text-ink-500 mb-3">
                  {date ? `${fmtDateK(date)} · ${party}명 기준` : '날짜를 먼저 선택해 주세요'}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {ALL_TIMES.map((t) => {
                    const open = date ? timeOpen(date, t, party) : false;
                    const on = time === t;
                    return (
                      <button
                        key={t}
                        disabled={!open}
                        onClick={() => setTime(t)}
                        className={cx(
                          'h-11 rounded-xl border-2 text-[13px] font-extrabold tnum transition-all',
                          !open
                            ? 'bg-ink-100 text-ink-300 border-ink-100 cursor-not-allowed'
                            : on
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-ink-800 border-ink-200 active:scale-[.97]'
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-600">
                    <span className="w-3.5 h-3.5 rounded border-2 border-ink-200 bg-white" />
                    선택 가능
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-600">
                    <span className="w-3.5 h-3.5 rounded bg-ink-100" />
                    선택 불가
                  </span>
                </div>
              </Card>
            </>
          )}

          {/* ── 2단계 ───────────────────────────────── */}
          {step === 2 && (
            <>
              <Card className="p-4">
                <div className="text-[13px] font-extrabold text-ink-900 mb-1">좌석 유형</div>
                <div className="text-[11.5px] font-bold text-ink-500 mb-3">
                  희망하는 자리를 알려 주세요. 자리 배정은 매장에서 도와드려요.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SEAT_TYPES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeatType(s)}
                      className={cx(
                        'h-12 rounded-xl border-2 text-[13.5px] font-extrabold transition-all active:scale-[.97]',
                        seatType === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-700 border-ink-200'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-[13px] font-extrabold text-ink-900 mb-3">요청사항 (선택)</div>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={4}
                  maxLength={100}
                  placeholder="예) 아이 의자가 필요해요"
                  className="w-full rounded-xl border border-ink-200 p-3.5 text-[13.5px] font-medium text-ink-900 outline-none focus:border-brand-500 resize-none placeholder:text-ink-400"
                />
                <div className="text-right text-[11px] font-bold text-ink-400 mt-1 tnum">{memo.length} / 100</div>
              </Card>
            </>
          )}

          {/* ── 3단계 ───────────────────────────────── */}
          {step === 3 && date && time && (
            <>
              <Card className="p-4">
                <div className="text-[13px] font-extrabold text-ink-900 mb-3">예약 내용</div>
                {[
                  ['일시', `${fmtDateK(date)} ${time}`],
                  ['인원', `${party}명`],
                  ['좌석', seatType],
                  ['예약자', `${ME.name} · ${ME.phone}`],
                  ...(memo ? [['요청사항', memo]] : []),
                ].map(([l, v]) => (
                  <div key={l} className="flex gap-3 py-2.5 border-b border-ink-100 last:border-0">
                    <span className="w-[60px] shrink-0 text-[12px] font-extrabold text-ink-500">{l}</span>
                    <span className="text-[13px] font-bold text-ink-900">{v}</span>
                  </div>
                ))}
              </Card>

              {/* 방문 시점 주차 예상 — 이 서비스만의 화면 */}
              <Card className="p-4 border-2 border-brand-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center shrink-0">
                    <Icon n="car" s={17} />
                  </span>
                  <div>
                    <div className="text-[13px] font-extrabold text-ink-900">방문 시점 주차 예상</div>
                    <div className="text-[11px] font-bold text-ink-500">{time} 기준 · 최근 4주 평균</div>
                  </div>
                </div>
                <div className="rounded-xl bg-brand-50 p-3.5">
                  <div className="text-[13px] font-extrabold text-brand-800">
                    이 시간대에는 보통 <span className="tnum">3~5자리</span> 정도 비어 있어요
                  </div>
                  <div className="text-[11.5px] font-medium text-brand-800/80 mt-1 leading-relaxed">
                    매장 주차장 총 {ps.total}면 기준이에요. 만차일 때를 대비해 예약 상세에서
                    근처 공영주차장도 함께 확인하실 수 있어요.
                  </div>
                </div>

                <label className="flex items-center gap-2.5 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertOn}
                    onChange={(e) => setAlertOn(e.target.checked)}
                    className="w-5 h-5 accent-brand-600 shrink-0"
                  />
                  <span className="text-[12.5px] font-bold text-ink-800">
                    방문 30분 전에 주차 상황 알림 받기
                  </span>
                </label>
              </Card>

              {/* 노쇼 동의 — 컴포넌트 밖. 체크해야 예약 완료 */}
              <label className="flex items-start gap-2.5 px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="w-5 h-5 accent-brand-600 shrink-0 mt-px"
                />
                <span className="text-[12px] font-medium text-ink-600 leading-relaxed">
                  예약 시간에서 <b className="text-ink-900">10분이 지나도 방문하지 않으면 자동으로 취소</b>되며,
                  노쇼가 반복되면 예약 이용이 제한될 수 있다는 데 동의합니다.{' '}
                  <span className="font-bold text-ink-800 underline">약관 보기</span>
                </span>
              </label>
            </>
          )}
        </div>
      </div>

      <StickyCta>
        {step < 3 ? (
          <Button variant="primary" size="lg" full disabled={!canNext} onClick={() => setStep(step + 1)} iconRight="chevR">
            {step === 1 ? '좌석 · 요청사항 선택' : '예약 내용 확인'}
          </Button>
        ) : (
          <Button variant="primary" size="lg" full disabled={!agree} onClick={submit} icon="check">
            예약 완료하기
          </Button>
        )}
      </StickyCta>
    </div>
  );
}