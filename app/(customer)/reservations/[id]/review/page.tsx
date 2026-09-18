'use client';

import React, { use, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button, Card } from '@/components/ui/primitives';
import { SubHeader, StickyCta } from '@/components/customer/Shell';
import { StorePhoto } from '@/components/customer/Photo';
import { cx, fmtDateK } from '@/lib/format';
import { useApp } from '@/lib/store';

/**
 * 리뷰 작성
 * ─────────────────────────────────────────────────────────────
 * 영수증 인증을 마친 지난 예약에서만 들어올 수 있다.
 * ★ 주차 경험을 묻는 항목을 따로 둔다. 이 서비스가 좌석뿐 아니라
 *   주차까지 책임진다는 걸 리뷰 구조에서도 드러내기 위해서다.
 */
const TAGS = ['음식이 맛있어요', '자리가 넓어요', '주차가 편해요', '앱 정보가 정확했어요', '재방문 의사 있어요', '친절해요'];

export default function WriteReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getRes, getStore, addReview, pushToast } = useApp();

  const [rating, setRating] = useState(5);
  const [parkOk, setParkOk] = useState<boolean | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState('');

  const res = getRes(id);
  if (!res) notFound();
  const store = getStore(res.storeId);

  const submit = () => {
    addReview(res.storeId, res.id, rating, text || tags.join(' · ') || '잘 먹었습니다.');
    pushToast({ title: '리뷰가 등록되었어요', desc: '소중한 후기 감사합니다', tone: 'ok', icon: 'check' });
    router.push('/reservations');
  };

  return (
    <div className="absolute inset-0 bg-ink-50">
      <SubHeader title="리뷰 쓰기" sub={store?.name} />

      <div className="absolute inset-0 pt-[92px] pb-[104px] overflow-y-auto no-sb">
        <div className="p-4 space-y-3">
          <Card className="p-4 flex items-center gap-3">
            <StorePhoto store={store} className="w-14 h-14 rounded-xl shrink-0" />
            <div className="grow min-w-0">
              <div className="text-[14.5px] font-extrabold text-ink-900 truncate">{store?.name}</div>
              <div className="text-[11.5px] font-bold text-ink-500 mt-0.5 tnum">
                {fmtDateK(res.date)} · {res.party}명
              </div>
            </div>
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-ok-50 border border-ok-200 text-[10.5px] font-extrabold text-ok-600 shrink-0">
              <Icon n="receipt" s={11} />
              인증됨
            </span>
          </Card>

          {/* 별점 */}
          <Card className="p-5">
            <div className="text-[14px] font-extrabold text-ink-900 text-center mb-4">방문은 어떠셨나요?</div>
            <div className="flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n}점`} className="active:scale-90 transition-transform">
                  <Icon n={n <= rating ? 'star' : 'starO'} s={38} cls={n <= rating ? 'text-warn-300' : 'text-ink-300'} />
                </button>
              ))}
            </div>
            <div className="text-center text-[12.5px] font-extrabold text-ink-600 mt-3">
              {['', '아쉬워요', '그저 그래요', '괜찮아요', '좋아요', '최고예요'][rating]}
            </div>
          </Card>

          {/* 주차 경험 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-1">주차는 편하셨나요?</div>
            <div className="text-[11.5px] font-bold text-ink-500 mb-3">앱에 표시된 주차 정보가 실제와 맞았는지 알려 주세요</div>
            <div className="grid grid-cols-2 gap-2">
              {([[true, '정확했어요', 'check'], [false, '달랐어요', 'alert']] as const).map(([v, l, i]) => (
                <button
                  key={l}
                  onClick={() => setParkOk(v)}
                  className={cx(
                    'h-12 rounded-xl border-2 inline-flex items-center justify-center gap-1.5 text-[13px] font-extrabold transition-all active:scale-[.97]',
                    parkOk === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-700 border-ink-200'
                  )}
                >
                  <Icon n={i} s={16} />
                  {l}
                </button>
              ))}
            </div>
          </Card>

          {/* 태그 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">어떤 점이 좋았나요? (복수 선택)</div>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => setTags((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}
                    className={cx(
                      'h-9 px-3.5 rounded-full border text-[12.5px] font-bold transition-all active:scale-[.97]',
                      on ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-600 border-ink-300'
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* 자유 서술 */}
          <Card className="p-4">
            <div className="text-[13px] font-extrabold text-ink-900 mb-3">자세한 후기 (선택)</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={300}
              placeholder="다른 분들에게 도움이 될 후기를 남겨 주세요"
              className="w-full rounded-xl border border-ink-200 p-3.5 text-[13.5px] font-medium text-ink-900 outline-none focus:border-brand-500 resize-none placeholder:text-ink-400"
            />
            <div className="text-right text-[11px] font-bold text-ink-400 mt-1 tnum">{text.length} / 300</div>
          </Card>
        </div>
      </div>

      <StickyCta>
        <Button variant="primary" size="lg" full icon="check" onClick={submit}>
          리뷰 등록하기
        </Button>
      </StickyCta>
    </div>
  );
}
