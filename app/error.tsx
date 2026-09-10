"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      role="alert"
      className="flex min-h-screen w-full flex-col items-center justify-center bg-white px-6 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-7 w-7 text-amber-600"
          aria-hidden="true"
        >
          <path d="M12 4.5L2.8 20h18.4L12 4.5z" />
          <path d="M12 10v4" />
          <path d="M12 17.2v.1" />
        </svg>
      </div>

      <h1 className="mt-5 text-lg font-bold text-zinc-900">
        화면을 불러오지 못했어요
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
        일시적인 문제일 수 있어요.
        <br />
        잠시 후 다시 시도해 주세요.
      </p>

      <div className="mt-7 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-900 text-[15px] font-semibold text-white active:opacity-80"
        >
          다시 시도
        </button>
        <a
          href="/explore"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-200 text-[15px] font-semibold text-zinc-700 active:bg-zinc-50"
        >
          지도로 돌아가기
        </a>
      </div>

      {process.env.NODE_ENV === "development" && (
        <pre className="mt-8 max-w-full overflow-x-auto rounded-lg bg-zinc-50 p-3 text-left text-[11px] leading-relaxed text-zinc-400">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
      )}
    </main>
  );
}