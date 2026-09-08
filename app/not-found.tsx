import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-7 w-7 text-zinc-500"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
          <path d="M11 8v3.5" />
          <path d="M11 14.2v.1" />
        </svg>
      </div>

      <h1 className="mt-5 text-lg font-bold text-zinc-900">
        찾는 페이지가 없어요
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
        주소가 바뀌었거나 삭제된 화면일 수 있어요.
        <br />
        지도에서 다시 찾아보시겠어요?
      </p>

      <Link
        href="/explore"
        className="mt-7 inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl bg-zinc-900 text-[15px] font-semibold text-white active:opacity-80"
      >
        지도로 돌아가기
      </Link>
    </main>
  );
}