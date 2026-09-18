'use client';

// app/(customer)/my/recent/page.tsx
// 최근 본 매장 목록
//
// localStorage 에는 매장 id 만 들어 있다. 좌석·주차 수치는 실시간으로 바뀌므로
// 여기서 현재 매장 데이터를 다시 찾아 StoreCard 로 그린다.
// /my/recent 는 lib/tokens.ts 의 TABS 에 없으므로 탭바는 자동으로 숨는다.
//
// [b13] 이 화면만 혼자 다른 뼈대를 쓰고 있어서 두 가지가 깨져 있었다.
//
//   ① 헤더가 상태 표시줄과 겹쳤다
//      직접 만든 <header sticky top-0 py-3> 가 폰 맨 위에서 시작했다.
//      PhoneChrome 의 상태 표시줄(12:30 · 배터리)이 h-11 로 그 위를 덮는 층이라
//      「최근 본 매장」이 「12:30」과, 「편집」이 배터리 아이콘과 겹쳤다.
//      다른 화면이 쓰는 SubHeader 는 pt-11 로 그 44px 을 비워 둔다.
//
//   ② 목록이 길어지면 스크롤이 안 됐다
//      <div flex min-h-full> 로 짜여 있었는데, 부모인 레이아웃의
//      <div absolute inset-0> 에는 overflow 설정이 없다. 넘친 내용은
//      PhoneChrome 의 overflow-hidden 에 그냥 잘렸다. 최근 본 매장이
//      네댓 개를 넘으면 아래쪽은 볼 방법이 없었다.
//
// 그래서 다른 화면과 같은 뼈대로 맞췄다.
//   <div absolute inset-0> + <SubHeader> + <div absolute inset-0 pt-[92px] overflow-y-auto>
// 화면 로직(읽기·지우기·전체 삭제)은 한 줄도 건드리지 않았다.

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { read, remove, clear, type RecentEntry } from '@/lib/recent';
import { useApp } from '@/lib/store';
import { StoreCard } from '@/components/customer/Cards';
import { SubHeader } from '@/components/customer/Shell';

export default function RecentStoresPage() {
  const { stores } = useApp();

  // 첫 렌더에서는 절대 localStorage 를 읽지 않는다.
  // 서버 결과와 브라우저 결과가 달라지면 Hydration 오류가 난다.
  const [entries, setEntries] = useState<RecentEntry[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setEntries(read());
  }, []);

  // 기록된 id 중 지금 존재하는 매장만 남긴다 (문 닫은 매장이 남아 있을 수 있다).
  // flatMap 을 쓰면 store 가 undefined 가 아님을 타입이 알아준다.
  const items = (entries ?? []).flatMap((entry) => {
    const store = stores.find((s) => s.id === entry.id);
    return store ? [{ entry, store }] : [];
  });

  function handleRemove(id: string) {
    remove(id);
    const next = read();
    setEntries(next);
    if (next.length === 0) setEditing(false);
  }

  function handleClear() {
    clear();
    setEntries([]);
    setConfirmClear(false);
    setEditing(false);
  }

  return (
    <div className="absolute inset-0 bg-ink-50">
      {/* 한 뎁스 깊은 화면이므로 뒤로가기를 둔다.
          뒤로가기와 pt-11(상태 표시줄 비우기)은 SubHeader 가 처리한다 */}
      <SubHeader
        title="최근 본 매장"
        right={
          items.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                setConfirmClear(false);
              }}
              className="shrink-0 rounded-lg px-2.5 py-1.5 mr-1 text-[12.5px] font-extrabold text-ink-500 active:bg-ink-100"
            >
              {editing ? '완료' : '편집'}
            </button>
          ) : undefined
        }
      />

      <div className="absolute inset-0 pt-[92px] overflow-y-auto no-sb">
        {/* 편집 모드에서만 전체 삭제를 노출한다 — 실수로 누르기 어렵게.
            스크롤을 내려도 남도록 sticky 로 둔다 */}
        {editing && (
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-200 bg-white px-4 py-2.5">
            {confirmClear ? (
              <>
                <p className="grow text-[12.5px] font-bold text-ink-500">
                  기록을 모두 지울까요? 되돌릴 수 없어요.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-extrabold text-ink-500"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-lg bg-busy-600 px-3 py-1.5 text-[12.5px] font-extrabold text-white"
                >
                  전체 삭제
                </button>
              </>
            ) : (
              <>
                <p className="grow text-[12.5px] font-bold text-ink-400">
                  기록에서 지워도 매장은 그대로예요.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="rounded-lg border border-busy-200 bg-busy-50 px-3 py-1.5 text-[12.5px] font-extrabold text-busy-600"
                >
                  전체 삭제
                </button>
              </>
            )}
          </div>
        )}

        <main className="px-4 py-4 pb-8">
          {entries === null ? (
            /* Loading — localStorage 를 읽기 전. 아주 짧게 지나간다 */
            <ul className="space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-[92px] animate-pulse rounded-2xl bg-ink-100" />
              ))}
            </ul>
          ) : items.length === 0 ? (
            /* Empty — 빈 화면으로 끝내지 않고 탐색으로 보낸다 */
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <p className="text-[15px] font-extrabold text-ink-900">아직 본 매장이 없어요</p>
              <p className="mt-2 text-[12.5px] font-bold leading-relaxed text-ink-500">
                매장을 열어보면 여기에 모아 둘게요.
                <br />
                다시 찾을 때 바로 들어올 수 있어요.
              </p>
              <Link
                href="/explore"
                className="mt-6 rounded-xl bg-ink-900 px-5 py-3 text-[13px] font-extrabold text-white"
              >
                주변 매장 둘러보기
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map(({ entry, store }) => (
                /* 카드가 Link 라서 삭제 버튼을 안에 넣을 수 없다.
                   (a 안의 button 은 잘못된 마크업)
                   편집 모드에서 카드 옆에 나란히 세운다. 배지도 가리지 않는다. */
                <li key={entry.id} className="flex items-center gap-2">
                  <div className="min-w-0 grow">
                    <StoreCard store={store} />
                  </div>

                  {editing && (
                    <button
                      type="button"
                      onClick={() => handleRemove(entry.id)}
                      aria-label={`${store.name} 기록에서 지우기`}
                      className="shrink-0 rounded-xl border border-busy-200 bg-busy-50 px-3 py-2.5 text-[12px] font-extrabold text-busy-600 active:scale-95 transition-transform"
                    >
                      지우기
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}