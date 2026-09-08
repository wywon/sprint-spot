// app/(auth)/admin/login/page.tsx
import LoginForm from "./LoginForm";

export const metadata = { title: 'SPOT 관리자 로그인' };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? '/admin'} />;
}