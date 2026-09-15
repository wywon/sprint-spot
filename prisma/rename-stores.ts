/**
 * prisma/rename-stores.ts — s2 · s3 의 상호와 메뉴를 바꾼다
 * ─────────────────────────────────────────────────────────────
 * 실행:  npx tsx prisma/rename-stores.ts
 *
 * ★ 왜 필요한가
 *   s2 '은행동 두부두루치기' · s3 '소제동 브런치하우스' 는 시연 지역이
 *   중구 대흥동이던 시절에 만든 이름이다. A6 에서 대덕구 송촌동으로 옮길 때
 *   좌표만 바꾸고 이름과 주소를 그대로 뒀다. 그래서 지금은 카카오맵과 대조하면
 *   '은행동' 이라는 가게가 대덕구에 서 있다.
 *
 * ★ 왜 실재하는 가게 이름을 쓰지 않는가
 *   입점 매장은 계약 관계를 전제한다. 실제 상호를 쓰면 그 가게의 좌석 수·주차면·
 *   예약 가능 시간을 우리가 지어내는 셈이 된다. 미입점 매장(지도 배경·검색)은
 *   카카오에서 이름만 가져와 보여 주지만, 입점 매장은 반대로 가상의 이름을 쓴다.
 *
 * ★ 메뉴도 같이 바꾼다
 *   seed 는 mock 의 MENUS 6개를 전 매장에 똑같이 넣었다. 이름만 고치면
 *   '법동 카페' 의 대표 메뉴가 두부두루치기·수육이 된다. 상세 화면에서
 *   바로 티가 나므로 상호와 메뉴는 한 번에 바꿔야 한다.
 *
 * ★ 무엇을 건드리지 않는가
 *   테이블·주차면·예약·리뷰는 손대지 않는다. Store 의 표시용 칸과 Menu 행뿐이다.
 *   좌표는 prisma/fixcoords.ts 가 맡는다 — 한 값을 두 스크립트가 쓰면
 *   나중에 한쪽만 고치고 잊는다.
 *
 * ★ 주소는 시연용 가상 주소다
 *   동과 도로명은 실제 좌표와 맞췄지만 건물 번호는 임의값이다.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface Patch {
  name: string
  cat: string
  addr: string
  tel: string
  open: string
  price: string
  tags: string[]
  /** [이름, 가격] — 기존 메뉴를 전부 지우고 이걸로 채운다 */
  menus: [string, string][]
}

const PATCHES: Record<string, Patch> = {
  s2: {
    name: '레스토랑 송촌',
    cat: '양식 · 레스토랑',
    addr: '대전 대덕구 송촌북로 32',
    tel: '042-625-8080',
    open: '11:00 - 22:00',
    price: '14,000~26,000원',
    tags: ['단체석', '주차 가능', '예약 권장'],
    menus: [
      ['안심 스테이크', '26,000'],
      ['해산물 토마토 파스타', '18,000'],
      ['트러플 크림 뇨끼', '17,000'],
      ['마르게리타 피자', '16,000'],
      ['시저 샐러드', '12,000'],
      ['수프 & 갈릭브레드', '6,000'],
    ],
  },
  s3: {
    name: '법동 카페',
    cat: '카페 · 브런치',
    addr: '대전 대덕구 계족로664번길 21',
    tel: '042-633-2200',
    open: '09:30 - 18:00',
    price: '6,000~15,000원',
    tags: ['브런치', '예약 권장', '주차 가능'],
    menus: [
      ['아메리카노', '4,500'],
      ['카페라떼', '5,000'],
      ['에그 베네딕트', '15,000'],
      ['프렌치토스트', '13,000'],
      ['크로플', '8,000'],
      ['바스크 치즈케이크', '7,500'],
    ],
  },
}

async function main() {
  const ids = Object.keys(PATCHES)

  const found = await prisma.store.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, cat: true },
  })

  const missing = ids.filter((id) => !found.some((s) => s.id === id))
  if (missing.length) {
    console.warn('DB 에 없는 매장 (건너뜀):', missing.join(', '))
  }

  for (const s of found) {
    const p = PATCHES[s.id]

    await prisma.store.update({
      where: { id: s.id },
      data: {
        name: p.name,
        cat: p.cat,
        addr: p.addr,
        tel: p.tel,
        open: p.open,
        price: p.price,
        tags: p.tags,
      },
    })

    /* 메뉴는 전부 지우고 다시 넣는다.
       이름으로 맞춰 고치려 들면 개수가 다를 때 옛 메뉴가 남는다. */
    await prisma.menu.deleteMany({ where: { storeId: s.id } })
    await prisma.menu.createMany({
      data: p.menus.map(([name, price], i) => ({
        storeId: s.id,
        name,
        price,
        order: i,
      })),
    })

    console.log(
      `${s.id.padEnd(3)} ${s.name} (${s.cat})\n     → ${p.name} (${p.cat}) · 메뉴 ${p.menus.length}개`,
    )
  }

  console.log(`\n완료 — ${found.length}곳 갱신`)
  console.log('좌표는 npx tsx prisma/fixcoords.ts 로 따로 맞출 것')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())