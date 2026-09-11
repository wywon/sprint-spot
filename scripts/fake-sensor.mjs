/**
 * 가짜 센서 — 중계 서버 없이 /api/detect 를 두드린다.
 *
 * 아두이노도 Oracle 도 없이 "센서가 살아서 보내는 상황"을 만들어 낸다.
 * 웹 쪽(배치도·집계·오프라인 판정)만 따로 검증할 때 쓴다.
 * 의존성 없음. Node 18 이상이면 그냥 돈다.
 *
 * ── 먼저 할 것 ──────────────────────────────────────────────
 *   .env 에 키를 넣어야 한다. 없으면 401 이 난다.
 *     DETECT_API_KEY="dev-detect-key"
 *   그리고 개발 서버를 띄워 둔다.  npm run dev
 *
 * ── 쓰는 법 ────────────────────────────────────────────────
 *   node scripts/fake-sensor.mjs --manual
 *       손으로 조종하는 모드. 숫자를 치면 그 칸에 차를 넣었다 뺀다.
 *       화면과 하나씩 대조해 볼 때 제일 편하다. 모형차를 옮기는 것과 같다.
 *
 *   node scripts/fake-sensor.mjs
 *       루프 모드. 2초마다 한 칸씩 뒤집어서 10면 전체를 보낸다.
 *       실제 중계 서버와 가장 비슷하다. Ctrl+C 로 멈춘다.
 *       천천히 보려면 --every 10 처럼 간격을 늘린다.
 *
 *   node scripts/fake-sensor.mjs --once P1,P3,P5
 *       P1·P3·P5 만 '주차 중', 나머지는 '비어 있음' 으로 한 번 보내고 끝낸다.
 *       특정 칸이 화면에서 바뀌는지 확인할 때.
 *
 *   node scripts/fake-sensor.mjs --once
 *       10면 전부 '비어 있음' 으로 한 번.
 *
 *   node scripts/fake-sensor.mjs --unknown
 *       10면 전부 '확인 중' 으로 한 번.
 *       (중계 서버가 아두이노를 놓쳤을 때 실제로 이렇게 보낸다)
 *
 * ── 옵션 ───────────────────────────────────────────────────
 *   --url <주소>     기본 http://localhost:3000/api/detect
 *                    배포본을 때리려면 https://sprint-spot.vercel.app/api/detect
 *   --key <키>       기본 .env 의 DETECT_API_KEY
 *   --store <id>     기본 s1
 *   --prefix <문자>  기본 P  (A1~A10 으로 보내보려면 --prefix A)
 *   --every <초>     기본 2
 *
 * ── 오프라인 판정을 확인하려면 ──────────────────────────────
 *   루프를 Ctrl+C 로 멈추고 3분을 기다린다.
 *   관리자 화면이 「주차면 센서 · 응답 없음」 으로 바뀌면 이슈 #91 이 동작하는 것이다.
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

/* ── .env 읽기 (dotenv 없이) ──────────────────────────────── */
function readEnv(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env', '.env.local']) {
    try {
      const line = readFileSync(f, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
    } catch {
      /* 파일이 없으면 다음 것 */
    }
  }
  return '';
}

/* ── 인자 ─────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const URL_ = flag('url', 'http://localhost:3000/api/detect');
const KEY = flag('key', readEnv('DETECT_API_KEY'));
const STORE = flag('store', 's1');
const PREFIX = flag('prefix', 'P');
const EVERY = Number(flag('every', '2')) * 1000;
const TOTAL = 10;

const ONCE = argv.includes('--once');
const ALL_UNKNOWN = argv.includes('--unknown');
const MANUAL = argv.includes('--manual');

/** --once 뒤에 붙은 목록. `--once P1,P3` → ['P1','P3'] */
const occupiedArg = (() => {
  const i = argv.indexOf('--once');
  const v = i >= 0 ? argv[i + 1] : null;
  if (!v || v.startsWith('--')) return [];
  return v.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
})();

const code = (n) => `${PREFIX}${n}`;

/* ── 모르는 옵션은 조용히 넘기지 않는다 ─────────────────────
   옛날 버전 파일에 --manual 을 붙이면 그냥 무시되고 루프 모드로 떨어졌다.
   "손으로 조종하려고 쳤는데 화면이 저절로 바뀐다" 가 그래서 생긴다. */
const KNOWN = ['--once', '--unknown', '--manual', '--url', '--key', '--store', '--prefix', '--every'];
const TAKES_VALUE = ['--url', '--key', '--store', '--prefix', '--every'];
const bad = argv.filter((a, i) => {
  if (!a.startsWith('--')) {
    const prev = argv[i - 1];
    // 값으로 쓰인 것(--prefix A, --once P1,P3)은 옵션이 아니다
    return !(prev && (TAKES_VALUE.includes(prev) || prev === '--once'));
  }
  return !KNOWN.includes(a);
});
if (bad.length) {
  console.log(`모르는 옵션입니다: ${bad.join(', ')}`);
  console.log(`쓸 수 있는 것: ${KNOWN.join(' ')}`);
  console.log('');
  console.log('※ --manual 이 안 먹으면 이 파일이 옛날 버전입니다. 새 파일로 교체하세요.');
  process.exit(1);
}

/* ── 전송 ─────────────────────────────────────────────────── */
let sent = 0;
let failed = 0;

async function push(slots) {
  const body = { storeId: STORE, detectedAt: Date.now(), slots };
  const stamp = new Date().toTimeString().slice(0, 8);

  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-spot-key': KEY },
      body: JSON.stringify(body),
    });

    const text = await res.text();

    if (!res.ok) {
      failed++;
      console.log(`${stamp}  ✗ HTTP ${res.status}  ${text.slice(0, 200)}`);
      if (res.status === 401) {
        console.log('        → 키가 틀립니다. .env 의 DETECT_API_KEY 를 확인하세요.');
      } else if (res.status === 404) {
        console.log(`        → 매장 "${STORE}" 가 DB 에 없습니다.`);
      }
      return;
    }

    sent++;
    let json = null;
    try { json = JSON.parse(text); } catch { /* 그대로 출력 */ }

    if (!json) {
      console.log(`${stamp}  ✓ ${text.slice(0, 120)}`);
      return;
    }

    const occ = slots.filter((s) => s.status === 'occupied').length;
    const avl = slots.filter((s) => s.status === 'available').length;
    const unk = slots.filter((s) => s.status === 'unknown').length;

    let line = `${stamp}  ✓ 반영 ${json.updated}면   주차중 ${occ} · 비어있음 ${avl} · 확인중 ${unk}`;
    if (json.aliased?.length) line += `\n        ↳ 번호 보정: ${json.aliased.join(', ')}`;
    if (json.unknownCodes?.length) {
      line += `\n        ⚠ DB 에 없는 번호: ${json.unknownCodes.join(', ')}`;
      line += `\n          → 보낸 번호(${code(1)}~${code(TOTAL)})가 DB 의 주차면 번호와 다릅니다.`;
      line += `\n            관리자 배치도에서 실제 번호를 확인하고 --prefix 를 맞추세요.`;
    }
    if (json.ignored?.length) line += `\n        ↳ 수동 지정 중이라 화면엔 안 보임: ${json.ignored.join(', ')}`;
    console.log(line);
  } catch (err) {
    failed++;
    console.log(`${stamp}  ✗ ${err.message}`);
    console.log('        → 개발 서버가 떠 있나요?  npm run dev');
  }
}

/* ── 만들기 ───────────────────────────────────────────────── */
const build = (isOccupied, forceUnknown = ALL_UNKNOWN) =>
  Array.from({ length: TOTAL }, (_, i) => ({
    code: code(i + 1),
    status: forceUnknown ? 'unknown' : isOccupied(i + 1) ? 'occupied' : 'available',
  }));

/**
 * 지금 상태를 배치도 모양으로 그린다 (관리자 화면과 같은 배열).
 *   윗줄 P1~P6 · 아랫줄 P7~P10, 가운데가 주행통로.
 */
function draw(state) {
  const cell = (n) => (state[n - 1] ? ' 🚗 ' : ' ·  ');
  const head = (ns) => ns.map((n) => String(code(n)).padEnd(4)).join('');
  const body = (ns) => ns.map(cell).join('');
  console.log('');
  console.log('   ' + head([1, 2, 3, 4, 5, 6]));
  console.log('   ' + body([1, 2, 3, 4, 5, 6]));
  console.log('   ' + '─'.repeat(24) + '  주행통로');
  console.log('   ' + head([7, 8, 9, 10]));
  console.log('   ' + body([7, 8, 9, 10]));
  console.log('');
}

/* ── 시작 ─────────────────────────────────────────────────── */
console.log('가짜 센서');
console.log(`  보낼 곳 : ${URL_}`);
console.log(`  매장    : ${STORE}`);
console.log(`  번호    : ${code(1)} ~ ${code(TOTAL)}`);
console.log(`  키      : ${KEY ? `설정됨 (${KEY.length}자)` : '⚠ 없음 → 401 이 납니다'}`);
console.log('');

if (MANUAL) {
  const state = new Array(TOTAL).fill(false);

  console.log('손으로 조종하는 모드입니다. 모형차를 옮기는 것과 같습니다.');
  console.log('');
  console.log(`  1 ~ ${TOTAL}  그 칸에 차를 넣거나 뺍니다 (숫자 치고 Enter)`);
  console.log('  a        전부 비우기');
  console.log('  f        전부 채우기 (만차)');
  console.log('  u        전부 확인 중 (센서 값이 흔들리는 상황)');
  console.log('  q        끝내기');
  console.log('');
  console.log('화면은 3초마다 스스로 갱신되니 새로고침하지 않아도 됩니다.');

  await push(build((n) => state[n - 1]));
  draw(state);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();

  async function handle(input) {
    const v = input.trim().toLowerCase();

    if (v === 'q') { rl.close(); return; }
    if (v === '') { rl.prompt(); return; }

    if (v === 'u') {
      await push(build(() => false, true));
      console.log('   (전부 확인 중 — 배치도가 보라색 빗금으로 바뀌어야 합니다)');
      rl.prompt();
      return;
    }

    if (v === 'a') state.fill(false);
    else if (v === 'f') state.fill(true);
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > TOTAL) {
        console.log(`   1~${TOTAL} 숫자 또는 a · f · u · q 중에서 입력하세요.`);
        rl.prompt();
        return;
      }
      state[n - 1] = !state[n - 1];
      console.log(`   ${code(n)} → ${state[n - 1] ? '주차 중' : '비어 있음'}`);
    }

    await push(build((n) => state[n - 1]));
    draw(state);
    rl.prompt();
  }

  /* 입력을 한 줄씩 차례로 처리한다.
     여러 줄이 한꺼번에 들어와도(붙여넣기) 전송이 뒤엉키지 않는다. */
  let chain = Promise.resolve();
  rl.on('line', (input) => {
    chain = chain.then(() => handle(input)).catch((e) => console.log(`   ${e.message}`));
  });

  rl.on('close', () => {
    chain.then(() => {
      console.log('');
      console.log(`끝냈습니다. 성공 ${sent} · 실패 ${failed}`);
      console.log('이제 3분 뒤 관리자 화면이 「주차면 센서 · 응답 없음」 이 되는지 보세요.');
      process.exit(0);
    });
  });
} else if (ONCE || ALL_UNKNOWN) {
  const set = new Set(occupiedArg);
  await push(build((n) => set.has(code(n))));
  console.log('');
  console.log('한 번만 보내고 끝냅니다. 관리자 화면을 새로고침해 보세요.');
} else {
  console.log(`${EVERY / 1000}초마다 한 칸씩 뒤집습니다. Ctrl+C 로 멈춥니다.`);
  console.log('멈춘 뒤 3분을 기다리면 「센서 응답 없음」 으로 바뀌어야 합니다 (이슈 #91).');
  console.log('');

  const state = new Array(TOTAL).fill(false);
  await push(build((n) => state[n - 1]));

  const timer = setInterval(async () => {
    const i = Math.floor(Math.random() * TOTAL);
    state[i] = !state[i];
    await push(build((n) => state[n - 1]));
  }, EVERY);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('');
    console.log(`멈췄습니다. 성공 ${sent} · 실패 ${failed}`);
    console.log('이제 3분 뒤 관리자 화면이 「주차면 센서 · 응답 없음」 이 되는지 보세요.');
    process.exit(0);
  });
}
