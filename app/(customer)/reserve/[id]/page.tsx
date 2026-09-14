'use client';

import React, { use, useEffect, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { SubHeader, StickyCta } from '@/components/customer/Shell';
import { cx, fmtDateK, pad } from '@/lib/format';
import { parkStats, parkVerdict, seatStats } from '@/lib/status';
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
 *
 * [a8] 시간 목록을 서버에서 받아온다.
 *   ─────────────────────────────────────────────────────────
 *   예전에는 timeOpen() 이 '날짜+시간' 문자열의 문자 코드를 더해 7 로 나눈
 *   나머지로 가능·불가를 정했다. 화면에만 있는 계산이라 서버와 아무 관계가
 *   없었고, 그래서 이런 일이 벌어졌다.
 *
 *     · 매장이 승인해서 자리가 찬 시간도 손님 화면에는 계속 '선택 가능'
 *     · 영업시간 밖인 시간도 눌림 (11:00~20:00 이 화면에 박혀 있었다)
 *     · 오늘 이미 지난 시간도 눌림
 *     · 눌러서 요청을 보내면 서버가 거절
 *
 *   lib/types.ts 주석이 경고해 둔 그대로다. 이제 A7 이 만든
 *   GET /api/stores/[id]/times?date=&people= 하나만 본다.
 *   그 라우트는 영업시간·라스트오더(마감 60분 전)·인원이 앉을 수 있는 테이블 수·
 *   이미 자리를 차지한 예약(pending 포함)을 전부 세서 답한다.
 *   POST /api/reservations 와 같은 목록(HOLDING_STATUSES)을 보므로 두 답이 어긋나지 않는다.
 *
 * ★ 목록은 언제 다시 읽는가
 *   날짜·인원이 바뀔 때, 그리고 1단계로 돌아올 때다.
 *   2·3단계에 머무는 동안 다른 손님이 그 시간을 가져갈 수 있다.
 *   돌아왔을 때 고른 시간이 사라져 있으면 선택을 풀고 알려 준다.
 *   최종 판정은 어차피 서버가 한 번 더 한다 — 화면은 '틀릴 수 있는 안내'이고
 *   서버가 '맞는 답'이다. 이 순서를 뒤집지 말 것.
 */

const PARTIES = [1, 2, 3, 4, 5, 6, 7, 8];
const SEAT_TYPES = ['상관없음', '창가석', '테이블석', '룸'];

/** GET /api/stores/[id]/times 응답 한 칸 */
interface TimeSlot {
  time: string;
  available: boolean;
}

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

export default function ReservePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getStore, addReservation, pushToast, profile } = useApp();

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
   */
  const [dates, setDates] = useState<ReturnType<typeof buildDates>>([]);
  useEffect(() => {
    const list = buildDates(new Date());
    setDates(list);
    // [a8] 오늘을 미리 골라 둔다. 날짜를 안 고르면 시간 목록을 부를 수 없어
    //      첫 화면이 늘 '날짜를 먼저 선택해 주세요' 로 비어 있었다.
    setDate((d) => d ?? list[0]?.key ?? null);
  }, []);

  /* ── [a8] 예약 가능 시간 ──────────────────────────────────
     times === null 은 '아직 모른다'(로딩)이고 [] 는 '없다'이다.
     둘을 같은 값으로 쓰면 로딩 중에 "예약 가능한 시간이 없어요" 가 번쩍인다. */
  const [times, setTimes] = useState<TimeSlot[] | null>(null);
  const [timesErr, setTimesErr] = useState<string | null>(null);
  /** 값이 바뀌면 다시 읽는다 (1단계 복귀·재시도·요청 실패) */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!date) return;
    let alive = true;
    setTimes(null);
    setTimesErr(null);

    fetch(`/api/stores/${id}/times?date=${date}&people=${party}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.message ?? '예약 가능 시간을 불러오지 못했어요');
        return (body?.times ?? []) as TimeSlot[];
      })
      .then((list) => { if (alive) setTimes(list); })
      .catch((e: Error) => { if (alive) setTimesErr(e.message); });

    return () => { alive = false; };
  }, [id, date, party, reloadKey]);

  /* 1단계로 돌아오면 다시 읽는다. 2·3단계에 있는 동안 남이 가져갔을 수 있다 */
  useEffect(() => {
    if (step === 1) setReloadKey((k) => k + 1);
  }, [step]);

  /* 고른 시간이 사라졌으면 선택을 풀고 알려 준다.
     조용히 풀어 버리면 손님은 자기가 안 고른 줄 안다. */
  useEffect(() => {
    if (!time || !times) return;
    const hit = times.find((t) => t.time === time);
    if (hit?.available) return;
    setTime(null);
    pushToast({
      title: '방금 그 시간이 마감됐어요',
      desc: '다른 시간을 골라 주세요',
      tone: 'warn', icon: 'alert',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times]);

  const ss = seatStats(store);
  const ps = parkStats(store);
  const pv = parkVerdict(ps);
  const todayKey = dates[0]?.key;

  const canNext = step === 1 ? !!(party && date && time) : step === 2 ? true : agree;

  const [sending, setSending] = useState(false);

  /**
   * [a7] 승인제로 바뀌면서 여기가 '확정'이 아니라 '요청'이 됐다.
   *
   * ★ 서버 응답을 기다린다
   *   id 를 서버가 만들고, 그 id 로 완료 화면과 QR 이 만들어진다.
   *   또 서버가 정원을 다시 세므로 먼저 "예약됐어요"를 띄우면 안 된다.
   *   "예약됐어요" 뒤에 "사실은 마감이었어요"가 최악이다.
   *
   * ★ 실패하면 화면을 넘기지 않는다
   *   실패 사유 토스트는 store 쪽에서 이미 띄운다. 여기 머물러야
   *   손님이 다른 시간을 바로 고를 수 있다.
   *
   * ★ 보내는 동안 버튼을 잠근다
   *   두 번 누르면 409(DUPLICATE_RESERVATION)가 뜬다. 손님 잘못이 아니다.
   */
  const submit = async () => {
    if (!date || !time || sending) return;
    setSending(true);
    try {
      const rid = await addReservation({
        storeId: store.id, date, time, party, seatType,
        status: 'pending', name: profile.name, phone: profile.phone, memo, parkingAlert: alertOn,
      });
      if (!rid) {
        /* [a8] 실패 사유 토스트는 store 쪽에서 이미 나갔다.
           여기서는 다른 시간을 고를 수 있는 자리로 되돌려 놓는다.
           마감이 원인인 경우가 가장 흔하므로 목록도 새로 읽는다. */
        setTime(null);
        setStep(1);
        setReloadKey((k) => k + 1);
        return;
      }

      pushToast({
        title: '예약 요청을 보냈어요',
        desc: '매장에서 확인하는 대로 알려드릴게요',
        tone: 'ok', icon: 'check',
      });
      router.push(`/reserve/${store.id}/done?rid=${rid}`);
    } finally {
      setSending(false);
    }
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

                {/* 못 읽었을 때 — 빈 목록으로 위장하지 않는다.
                    '시간이 없다' 와 '못 물어봤다' 는 다른 말이고,
                    전자로 보이면 손님은 다른 날짜를 뒤지느라 시간을 쓴다 */}
                {timesErr ? (
                  <div className="rounded-xl bg-off-50 border border-off-200 px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                      <Icon n="alert" s={16} cls="text-off-600 shrink-0 mt-px" />
                      <div className="grow">
                        <div className="text-[12.5px] font-extrabold text-off-700">
                          예약 가능한 시간을 불러오지 못했어요
                        </div>
                        <div className="text-[11.5px] font-medium text-ink-500 mt-0.5">{timesErr}</div>
                      </div>
                    </div>
                    <Button
                      variant="outline" size="sm" icon="refresh" className="mt-3"
                      onClick={() => setReloadKey((k) => k + 1)}
                    >
                      다시 시도
                    </Button>
                  </div>
                ) : times === null ? (
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="h-11 rounded-xl bg-ink-100 animate-pulse" />
                    ))}
                  </div>
                ) : times.length === 0 ? (
                  <div className="rounded-xl bg-ink-50 border border-ink-200 px-3.5 py-4 text-center">
                    <div className="text-[12.5px] font-extrabold text-ink-700">
                      {date === todayKey
                        ? '오늘은 예약을 받을 수 있는 시간이 지났어요'
                        : '이 날짜에는 예약을 받지 않아요'}
                    </div>
                    <div className="text-[11.5px] font-medium text-ink-500 mt-1">
                      위에서 다른 날짜를 골라 주세요
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {times.map((t) => {
                        const on = time === t.time;
                        return (
                          <button
                            key={t.time}
                            disabled={!t.available}
                            onClick={() => setTime(t.time)}
                            className={cx(
                              'h-11 rounded-xl border-2 text-[13px] font-extrabold tnum transition-all',
                              !t.available
                                ? 'bg-ink-100 text-ink-300 border-ink-100 cursor-not-allowed'
                                : on
                                ? 'bg-brand-600 text-white border-brand-600'
                                : 'bg-white text-ink-800 border-ink-200 active:scale-[.97]'
                            )}
                          >
                            {t.time}
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
                        예약 마감
                      </span>
                    </div>
                  </>
                )}
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
                  ['예약자', `${profile.name} · ${profile.phone}`],
                  ...(memo ? [['요청사항', memo]] : []),
                ].map(([l, v]) => (
                  <div key={l} className="flex gap-3 py-2.5 border-b border-ink-100 last:border-0">
                    <span className="w-[60px] shrink-0 text-[12px] font-extrabold text-ink-500">{l}</span>
                    <span className="text-[13px] font-bold text-ink-900">{v}</span>
                  </div>
                ))}
              </Card>

              {/* 매장 주차 현황 — 이 서비스만의 화면
                  [a8] 예전에는 "최근 4주 평균 · 보통 3~5자리" 라고 적혀 있었다.
                  4주치 통계도 없고 3~5 라는 숫자도 화면에 박아 둔 값이었다.
                  없는 근거를 지어내느니 지금 값을 지금 값이라고 말하는 편이 낫다.
                  센서가 죽었을 때(unsure) 0 으로 세지 않는 것도 같은 이유다. */}
              <Card className="p-4 border-2 border-brand-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center shrink-0">
                    <Icon n="car" s={17} />
                  </span>
                  <div>
                    <div className="text-[13px] font-extrabold text-ink-900">매장 주차 현황</div>
                    <div className="text-[11px] font-bold text-ink-500">지금 기준</div>
                  </div>
                </div>
                <div className="rounded-xl bg-brand-50 p-3.5">
                  <div className="text-[13px] font-extrabold text-brand-800">
                    {pv === 'unsure'
                      ? '지금은 주차 상황을 확인할 수 없어요'
                      : pv === 'full'
                      ? '지금은 주차장이 꽉 차 있어요'
                      : <>지금은 <span className="tnum">{ps.available}자리</span> 비어 있어요</>}
                  </div>
                  <div className="text-[11.5px] font-medium text-brand-800/80 mt-1 leading-relaxed">
                    매장 주차장 총 {ps.total}면 기준이에요. {time}에는 달라질 수 있으니,
                    예약 상세에서 방문 직전에 다시 확인하시고 근처 공영주차장도 함께 보실 수 있어요.
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
            예약 요청하기
          </Button>
        )}
      </StickyCta>
    </div>
  );
}