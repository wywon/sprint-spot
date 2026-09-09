// app/(auth)/admin/login/LoginForm.tsx
'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const initial: LoginState = {};

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-xl font-bold text-zinc-900">SPOT 관리자</h1>
        <p className="mt-1 text-sm text-zinc-500">매장 관리자 전용 화면이에요.</p>

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? 'login-error' : undefined}
              className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base
                         outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>

          {state.error && (
            <p id="login-error" role="alert" className="text-sm font-medium text-rose-600">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-zinc-900 py-3 text-base font-semibold text-white
                       disabled:opacity-50"
          >
            {pending ? '확인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  );
}