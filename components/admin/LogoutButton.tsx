// components/admin/LogoutButton.tsx
import { logout } from '@/app/(auth)/admin/login/actions';

export default function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100"
      >
        로그아웃
      </button>
    </form>
  );
}