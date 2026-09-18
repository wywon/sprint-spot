import React from 'react';
import { cx } from '@/lib/format';
import { menuImage, storeGradient, storeImage } from '@/lib/images';

/**
 * 매장 · 메뉴 사진
 * ─────────────────────────────────────────────────────────────
 * [b13] 사진 자리가 전부 그라데이션 색 블록이었다. 그 자리를 이 부품이 맡는다.
 *
 * ★ 왜 부품으로 묶는가
 *   같은 사진이 지도 카드(68px) · 추천 타일(86px) · 상세 상단(210px) ·
 *   메뉴 줄(56px) · 예약 목록(68px) · 리뷰 쓰기(56px) 여섯 곳에서 쓰인다.
 *   경로 찾기와 실패 처리를 여섯 번 쓰면 한 곳만 고치는 실수가 난다.
 *
 * ★ 왜 <img> 가 아니라 배경 이미지인가  ← 이게 이 파일의 핵심이다
 *   처음에는 <img onError> 로 실패를 잡아 그라데이션으로 바꿨다. 그런데
 *   이 화면들은 서버에서 HTML 로 먼저 그려진다. 브라우저는 HTML 을 읽는 즉시
 *   이미지를 받으러 가는데, React 가 붙는(hydrate) 것은 그 뒤다.
 *   그래서 **파일이 없는 경우 error 이벤트가 React 보다 먼저 터져서 사라지고**,
 *   onError 는 영영 안 불린다. 화면에는 깨진 이미지 아이콘이 남는다.
 *   시연 화면에 깨진 아이콘이 뜨는 것이 최악이라 방식을 바꿨다.
 *
 *   지금은 그라데이션을 깐 상자 위에 배경 이미지를 한 겹 덮는다.
 *   사진이 없거나 못 받으면 위층이 그냥 비어서 아래 그라데이션이 그대로 보인다.
 *   JS 가 한 줄도 관여하지 않으므로 hydrate 순서와 무관하고,
 *   자바스크립트가 꺼져 있어도 같은 그림이 나온다.
 *
 *   재현 — public/img/menus/ 에서 아무 파일이나 지우고 그 메뉴가 있는 매장을 연다.
 *
 * ★ alt 가 없어도 되는 이유
 *   여섯 자리 전부 바로 옆이나 아래에 매장명·메뉴명이 글자로 있다.
 *   배경 이미지는 화면 낭독기가 읽지 않으므로 이름을 두 번 읽는 일이 없다.
 *   장식용 이미지의 올바른 처리다.
 *
 * ★ next/image 를 안 쓰는 이유
 *   파일이 7~26KB 라 리사이즈로 얻을 게 없고, next/image 는 위의 실패 처리를
 *   똑같이 다시 만들어야 한다. 진짜 큰 사진(수백 KB)으로 바뀌면 그때 옮기는 게 맞다.
 */

function Frame({
  src, gradient, className,
}: { src: string | null; gradient: string; className?: string }) {
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br', gradient, className)}>
      {src && (
        <span
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${src}")` }}
        />
      )}
    </div>
  );
}

/** 매장 대표 사진. className 으로 크기·모서리를 준다 */
export function StorePhoto({
  store, className,
}: {
  store: { id?: string; hero?: string } | null | undefined;
  className?: string;
}) {
  return <Frame src={storeImage(store)} gradient={storeGradient(store)} className={className} />;
}

/**
 * 메뉴 사진.
 * 메뉴 이미지가 없으면 그 매장의 그라데이션으로 떨어진다(예전과 같은 모습).
 */
export function MenuPhoto({
  menu, store, className,
}: {
  menu: { name?: string; img?: string } | null | undefined;
  store?: { hero?: string } | null;
  className?: string;
}) {
  return <Frame src={menuImage(menu)} gradient={storeGradient(store)} className={className} />;
}
