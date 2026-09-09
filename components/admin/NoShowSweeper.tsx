'use client'

import { useEffect } from 'react'

/** 관리자 화면이 열려 있는 동안 1분마다 서버에 미방문 정리를 요청한다 */
export default function NoShowSweeper({ intervalMs = 60_000 }: { intervalMs?: number }) {
  useEffect(() => {
    const run = () => {
      fetch('/api/admin/noshow', { method: 'POST' }).catch(() => {
        /* 네트워크 오류는 무시 — 다음 주기에 다시 시도 */
      })
    }

    run()
    const timer = setInterval(run, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return null
}