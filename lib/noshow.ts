import { prisma } from '@/lib/prisma'

/** 예약 시각으로부터 이 시간이 지나면 미방문 처리 */
export const NOSHOW_GRACE_MIN = 10

/** 'YYYY-MM-DD' + 'HH:mm' 을 KST 기준 Date 로 (서버가 UTC여도 안전) */
function kstDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`)
}

/** 지금 이 순간의 KST 날짜 문자열 'YYYY-MM-DD' */
function kstToday(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * 예약 시각 + 10분이 지난 'upcoming' 예약을 미방문으로 바꾼다.
 * 테이블이 배정된 예약이었다면 그 테이블도 빈자리로 되돌린다.
 * 여러 번 호출해도 결과가 같다.
 */
export async function sweepNoShow(storeId?: string) {
  const now = new Date()

  const candidates = await prisma.reservation.findMany({
    where: {
      status: 'upcoming',
      date: { lte: kstToday(now) },   // 오늘 + 어제 이전에 남은 것까지
      ...(storeId ? { storeId } : {}),
    },
    select: { id: true, tableId: true, date: true, time: true },
  })

  const limit = now.getTime() - NOSHOW_GRACE_MIN * 60_000
  const expired = candidates.filter(
    (r) => kstDateTime(r.date, r.time).getTime() <= limit
  )

  if (expired.length === 0) return { changed: 0, ids: [] as string[] }

  const ids = expired.map((r) => r.id)

  // tableId 는 배정 전이면 null 이므로 걸러낸다
  const tableIds = [
    ...new Set(
      expired
        .map((r) => r.tableId)
        .filter((id): id is string => id !== null)
    ),
  ]

  const [updated] = await prisma.$transaction([
    prisma.reservation.updateMany({
      where: { id: { in: ids }, status: 'upcoming' },  // 동시 호출 방지
      data: { status: 'noshow' },
    }),
    prisma.storeTable.updateMany({
      where: { id: { in: tableIds }, status: 'reserved' },
      data: { status: 'available' },
    }),
  ])

  return { changed: updated.count, ids }
}