/**
 * prisma/fixcoords.ts — 매장 좌표만 실제 위경도로 바꾼다
 * ─────────────────────────────────────────────────────────────
 * 실행:  npx tsx prisma/fixcoords.ts
 *
 * ★ 왜 seed 를 다시 돌리지 않는가
 *   seed 는 테이블·주차면·예약을 전부 다시 만든다. 지금 DB에는 손으로 넣은
 *   예약과 B가 작업 중인 주차면 10면이 들어 있어서 날리면 안 된다.
 *   바꿔야 하는 건 Store.lat / Store.lng 두 칸뿐이라 UPDATE 만 한다.
 *
 * ★ 스키마는 건드리지 않는다
 *   Store.lat / lng 는 이미 Float 다. 들어가는 값의 의미만
 *   "목업 지도 0~100%" 에서 "실제 위경도" 로 바뀐다.
 *   이 값을 읽는 곳은 components/customer/MapCanvas.tsx 하나뿐이라
 *   (grep 으로 확인함) 다른 화면은 영향이 없다.
 *
 * ★ 좌표 근거
 *   s1 = 실시간 공영주차장 세 곳(법동시장 제2 · 송촌소리 · 송촌공영)이 만드는
 *        삼각형의 내심. 내심 36.365764 / 127.436058, 내접원 반지름 약 106m.
 *        송촌동 먹자골목 블록 안이고 세 주차장 모두 도보 5~9분이다.
 *   나머지는 같은 블록에 흩어 놓은 시연용 값이라 정확할 필요가 없다.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** id → [위도, 경도] */
const COORDS: Record<string, [number, number]> = {
  // ── 입점 식당 ───────────────────────────────────────────
  s1: [36.36572, 127.43608],   // ★ 스프린트 식당 — 내심. 여기만 정확해야 한다
  s2: [36.36540, 127.43780],
  s3: [36.36640, 127.43700],

  // ── 미입점 식당 (지도에 상호명만) ───────────────────────
  p1: [36.36530, 127.43660],
  p2: [36.36600, 127.43530],
  p3: [36.36510, 127.43740],
  p4: [36.36620, 127.43840],
  p5: [36.36480, 127.43700],
  p6: [36.36660, 127.43580],
}

async function main() {
  const ids = Object.keys(COORDS)
  const found = await prisma.store.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, lat: true, lng: true },
  })

  const missing = ids.filter((id) => !found.some((s) => s.id === id))
  if (missing.length) {
    console.warn('DB 에 없는 매장 (건너뜀):', missing.join(', '))
  }

  for (const s of found) {
    const [lat, lng] = COORDS[s.id]
    await prisma.store.update({ where: { id: s.id }, data: { lat, lng } })
    console.log(
      `${s.id.padEnd(3)} ${s.name}\n     ${s.lat}, ${s.lng}  →  ${lat}, ${lng}`,
    )
  }

  console.log(`\n완료 — ${found.length}곳 갱신`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())