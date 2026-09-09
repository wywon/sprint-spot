'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/format';

type Props = {
  reservationId: string;
  /** 예약 조회에 쓰는 전화번호. 서버가 예약자 본인인지 확인하는 값 */
  phone: string;
  /** 전역 상태가 이미 아는 값. 첫 렌더 깜빡임을 없앤다 */
  initialReceipt?: boolean;
  /** 업로드 성공 시 호출. 페이지에서 uploadReceipt(id) + 토스트를 실행한다 */
  onUploaded: () => void;
};

type Phase = 'idle' | 'working' | 'done' | 'error';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 폰 사진은 보통 4~8MB라 Vercel 요청 본문 한도(4.5MB)에 걸린다.
 * 긴 변 1600px / JPEG 0.8 로 줄여서 보낸다. 실패하면 원본을 그대로 쓴다.
 */
async function shrink(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function ReceiptUpload({ reservationId, phone, initialReceipt = false, onUploaded }: Props) {
  // 전역 상태가 이미 답을 알고 있으므로 로딩 단계 없이 바로 시작한다
  const [phase, setPhase] = useState<Phase>(initialReceipt ? 'done' : 'idle');
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const base = `/api/reservations/${reservationId}/receipt`;

  // 이미 올린 영수증의 썸네일만 뒤에서 받아온다.
  // signed URL 은 1시간 뒤 만료되므로 DB에 저장하지 않고 화면에 들어올 때마다 새로 받는다.
  // 실패해도 무시한다 — 인증 여부는 전역 상태가 이미 알고 있다.
  useEffect(() => {
    if (!initialReceipt) return;
    let alive = true;
    fetch(`${base}?phone=${encodeURIComponent(phone)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d?.url && setUrl(d.url))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId, phone]);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 change 가 뜨도록
    if (!picked) return;

    if (!picked.type.startsWith('image/')) {
      setPhase('error');
      setMessage('사진 파일(JPG, PNG)만 올릴 수 있어요');
      return;
    }

    setPhase('working');
    setMessage('');

    const file = await shrink(picked);
    if (file.size > MAX_BYTES) {
      setPhase('error');
      setMessage('사진이 너무 커요. 5MB 이하로 올려주세요');
      return;
    }

    const body = new FormData();
    body.append('file', file);
    body.append('phone', phone);

    try {
      const r = await fetch(base, { method: 'POST', body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPhase('error');
        setMessage(d.message ?? '업로드에 실패했어요. 잠시 후 다시 시도해 주세요');
        return;
      }
      setUrl(d.url ?? null);
      setPhase('done');
      onUploaded();
    } catch {
      setPhase('error');
      setMessage('네트워크가 불안정해요. 연결을 확인하고 다시 시도해 주세요');
    }
  }

  const open = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePick}
        className="hidden"
      />

      {phase === 'done' && (
        <>
          <div className="rounded-xl bg-ok-50 border border-ok-200 px-3.5 py-3 flex items-center gap-2.5">
            <Icon n="check" s={17} cls="text-ok-500 shrink-0" />
            <div>
              <div className="text-[12.5px] font-extrabold text-ok-600">영수증 인증이 완료되었어요</div>
              <div className="text-[11.5px] font-medium text-ok-600/80 mt-0.5">이제 리뷰를 쓰실 수 있어요</div>
            </div>
          </div>

          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="올린 영수증"
              className="mt-3 w-full max-h-[260px] rounded-xl bg-ink-50 border border-ink-100 object-contain"
            />
          )}

          <button
            onClick={open}
            className="mt-3 w-full rounded-xl border-2 border-ink-200 py-3 text-[12.5px] font-extrabold text-ink-600 active:scale-[.99] transition-transform"
          >
            다른 사진으로 다시 올리기
          </button>
        </>
      )}

      {(phase === 'idle' || phase === 'error') && (
        <>
          <button
            onClick={open}
            className={cx(
              'w-full rounded-2xl border-2 border-dashed py-7 flex flex-col items-center gap-2 active:scale-[.99] transition-transform',
              phase === 'error' ? 'border-busy-300 bg-busy-50' : 'border-ink-300 bg-ink-50'
            )}
          >
            <Icon n="receipt" s={26} cls={phase === 'error' ? 'text-busy-500' : 'text-ink-400'} />
            <span className="text-[13px] font-extrabold text-ink-700">
              {phase === 'error' ? '다시 시도하기' : '영수증 사진 올리기'}
            </span>
            <span className="text-[11.5px] font-medium text-ink-500">촬영하거나 갤러리에서 선택</span>
          </button>

          {phase === 'error' && (
            <div className="mt-2.5 flex items-start gap-1.5">
              <Icon n="alert" s={14} cls="text-busy-500 shrink-0 mt-px" />
              <span className="text-[11.5px] font-bold text-busy-600 leading-relaxed">{message}</span>
            </div>
          )}

          <div className="mt-3 text-[11.5px] font-medium text-ink-500 leading-relaxed">
            실제로 방문하신 분만 리뷰를 쓸 수 있도록 영수증을 확인해요.
            사진은 인증 용도로만 쓰이고 다른 손님에게는 보이지 않아요.
          </div>
        </>
      )}

      {phase === 'working' && (
        <div className="rounded-2xl border-2 border-ink-200 bg-ink-50 py-7 flex flex-col items-center gap-2.5">
          <span className="w-6 h-6 rounded-full border-[3px] border-ink-200 border-t-brand-600 animate-spin" />
          <span className="text-[13px] font-extrabold text-ink-700">사진을 올리는 중이에요</span>
          <span className="text-[11.5px] font-medium text-ink-500">잠시만 기다려 주세요</span>
        </div>
      )}
    </>
  );
}