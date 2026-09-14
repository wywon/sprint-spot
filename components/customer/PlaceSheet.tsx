'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button } from '@/components/ui/primitives';
import { BottomSheet, NavSheet } from '@/components/ui/overlays';
import { cx, walkMin } from '@/lib/format';
import { roadviewPanoId, type NearbyPlace } from '@/lib/nearby';

/**
 * 미입점 매장 상세
 * ─────────────────────────────────────────────────────────────
 * [a8] 예전에는 미입점 카드를 눌러도 아무 일도 일어나지 않았다.
 *   손님 입장에서 "안 눌리는 카드"와 "눌렀는데 반응이 없는 카드"는 다르다.
 *   후자는 앱이 고장 났다고 읽힌다.
 *
 * ★ 무엇을 보여 주고 무엇을 안 보여 주는가
 *   보여 준다 — 이름·업종·주소·전화·거리·위치. 가게를 찾아가는 데 필요한 것.
 *   안 보여 준다 — 좌석·주차·예약. 우리가 모르는 것이다.
 *   모르는 값을 0 이나 '-' 로 그려 두면 "자리가 없다"로 읽힌다.
 *   칸 자체를 만들지 않고, 왜 없는지를 한 줄로 적는다.
 *
 * ★ 왜 라우트가 아니라 바텀시트인가
 *   /places/[id] 를 만들면 새로고침했을 때 복원할 방법이 마땅치 않다.
 *   카카오 장소 검색에는 "id 로 하나만 조회" 가 없어서, 이름으로 다시 검색해
 *   같은 id 를 골라내야 한다. 정보가 다섯 줄인 화면을 위해 치를 값이 아니다.
 *   나중에 리뷰나 사진이 붙어 화면이 무거워지면 그때 라우트로 올린다.
 */

/* ── 표지 ────────────────────────────────────────────────
   카카오 Places 는 사진을 주지 않는다. 대신 로드뷰를 쓴다.
   파노라마가 없으면(골목 안쪽 가게) 업종 색으로 떨어진다. */

function PlaceCover({ place }: { place: NearbyPlace }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');

    roadviewPanoId(place.lat, place.lng).then((id) => {
      if (!alive) return;
      if (!id || !boxRef.current) { setState('none'); return; }
      try {
        const kakao = (window as any).kakao;
        const rv = new kakao.maps.Roadview(boxRef.current);
        rv.setPanoId(id, new kakao.maps.LatLng(place.lat, place.lng));
        setState('ok');
      } catch {
        setState('none');
      }
    });

    return () => { alive = false; };
  }, [place.id, place.lat, place.lng]);

  return (
    <div className="relative h-[168px] -mx-5 overflow-hidden bg-ink-100">
      {/* 로드뷰가 들어갈 자리. 항상 그려 둬야 SDK 가 크기를 잴 수 있다 */}
      <div ref={boxRef} className="absolute inset-0" />

      {state !== 'ok' && (
        <div
          className={cx(
            'absolute inset-0 grid place-items-center bg-gradient-to-br',
            place.cafe ? 'from-amber-200 via-orange-200 to-amber-300' : 'from-ink-200 via-ink-100 to-ink-200',
          )}
        >
          <div className="text-center">
            <Icon n="image" s={26} cls="mx-auto text-ink-400" />
            <div className="mt-1.5 text-[11px] font-bold text-ink-500">
              {state === 'loading' ? '사진을 찾는 중' : '사진 정보가 없어요'}
            </div>
          </div>
        </div>
      )}

      {state === 'ok' && (
        <span className="absolute right-2 bottom-2 px-2 h-6 rounded-full bg-ink-900/60 text-white text-[10px] font-bold grid place-items-center pointer-events-none">
          카카오 로드뷰
        </span>
      )}
    </div>
  );
}

/* ── 시트 ───────────────────────────────────────────────── */

export function PlaceSheet({
  place, onClose,
}: { place: NearbyPlace | null; onClose: () => void }) {
  const [nav, setNav] = useState(false);

  /* 다른 가게를 열면 길안내 시트는 닫는다 */
  useEffect(() => { setNav(false); }, [place?.id]);

  if (!place) return null;

  const rows: [string, string, string][] = [
    ['pin', '주소', place.addr || '주소 정보 없음'],
    ...(place.jibun && place.jibun !== place.addr
      ? ([['pin', '지번', place.jibun]] as [string, string, string][])
      : []),
    ...(place.tel ? ([['phone', '전화', place.tel]] as [string, string, string][]) : []),
    ['fork', '분류', place.catFull || place.cat],
  ];

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={place.name}
        sub={
          <>
            {place.cat}
            {place.dist > 0 && <> · 도보 {walkMin(place.dist)}분</>}
          </>
        }
        footer={
          <div className="flex gap-2">
            {place.url && (
              <Button
                variant="outline"
                size="lg"
                className="shrink-0 px-4"
                onClick={() => window.open(place.url, '_blank', 'noopener')}
              >
                카카오맵
              </Button>
            )}
            <Button variant="primary" size="lg" full icon="nav" onClick={() => setNav(true)}>
              길안내
            </Button>
          </div>
        }
      >
        <PlaceCover place={place} />

        <div className="pt-4 pb-2">
          <div className="flex items-center gap-1.5 mb-3">
            <Badge tone="ink" size="sm">미입점</Badge>
            <span className="text-[11.5px] font-bold text-ink-400">SPOT 제휴 매장이 아니에요</span>
          </div>

          {rows.map(([i, l, v]) => (
            <div key={l} className="flex items-start gap-2.5 py-2.5 border-b border-ink-100 last:border-0">
              <Icon n={i} s={15} cls="text-ink-400 shrink-0 mt-px" />
              <span className="text-[12px] font-extrabold text-ink-500 w-[38px] shrink-0">{l}</span>
              {l === '전화' ? (
                <a href={`tel:${v.replace(/[^0-9+]/g, '')}`} className="text-[13px] font-bold text-brand-700 underline underline-offset-2">
                  {v}
                </a>
              ) : (
                <span className="text-[13px] font-bold text-ink-900 leading-relaxed">{v}</span>
              )}
            </div>
          ))}

          {/* 없는 기능을 왜 없는지 적는다. 빈 칸으로 두면 0 으로 읽힌다 */}
          <div className="mt-4 rounded-xl bg-ink-50 border border-ink-200 px-3.5 py-3 flex items-start gap-2.5">
            <Icon n="question" s={16} cls="text-ink-400 shrink-0 mt-px" />
            <div>
              <div className="text-[12.5px] font-extrabold text-ink-700">
                좌석과 주차는 알려드릴 수 없어요
              </div>
              <div className="text-[11.5px] font-medium text-ink-500 mt-0.5 leading-relaxed">
                이 가게는 아직 SPOT에 입점하지 않았어요. 가게 정보는 카카오맵에서 가져왔고,
                자리와 주차 상황은 입점 매장에서만 실시간으로 확인할 수 있어요.
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>

      <NavSheet
        open={nav}
        onClose={() => setNav(false)}
        target={place.name}
        lat={place.lat}
        lng={place.lng}
      />
    </>
  );
}