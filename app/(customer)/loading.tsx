export default function CustomerLoading() {
  return (
    <div role="status" aria-live="polite" className="w-full px-5 py-6">
      <div className="animate-pulse space-y-4">
        {/* 검색창 자리 */}
        <div className="h-11 w-full rounded-xl bg-zinc-200" />

        {/* 지도 미리보기 자리 */}
        <div className="h-44 w-full rounded-2xl bg-zinc-200" />

        {/* 필터칩 자리 */}
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded-full bg-zinc-200" />
          <div className="h-8 w-20 rounded-full bg-zinc-200" />
          <div className="h-8 w-16 rounded-full bg-zinc-200" />
        </div>

        {/* 매장 카드 자리 */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-2xl border border-zinc-100 p-4">
            <div className="h-4 w-2/5 rounded bg-zinc-200" />
            <div className="h-3 w-1/3 rounded bg-zinc-200" />
            <div className="flex gap-2 pt-1">
              <div className="h-6 w-24 rounded-lg bg-zinc-200" />
              <div className="h-6 w-20 rounded-lg bg-zinc-200" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">불러오는 중입니다</span>
    </div>
  );
}