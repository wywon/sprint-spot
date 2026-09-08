'use client';

// app/(customer)/stores/[id]/RecordRecent.tsx
// 매장 상세에 들어온 사실만 기록하는 컴포넌트. 화면에는 아무것도 그리지 않는다.
//
// 별도 컴포넌트로 뺀 이유
//  - 상세 페이지가 서버 컴포넌트든 클라이언트 컴포넌트든 그대로 붙일 수 있다.
//  - localStorage 접근을 이 파일 하나에 가둔다. 페이지는 이 사실을 몰라도 된다.
//  - useApp() 같은 의존이 없어서 어디에 붙여도 깨지지 않는다.

import { useEffect } from 'react';
import { push } from '@/lib/recent';

export default function RecordRecent({ id }: { id: string }) {
  useEffect(() => {
    // useEffect 안이므로 브라우저에서만 실행된다. Hydration 에 영향이 없다.
    // 개발 모드(StrictMode)에서는 두 번 호출되지만
    // push 가 같은 id 를 앞으로 끌어올리기만 하므로 중복이 쌓이지 않는다.
    push(id);
  }, [id]);

  return null;
}