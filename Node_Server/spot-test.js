// ==========================================
// spot-test.js
// SPOT 서버로 POST 가 되는지 확인한다.
//
// curl 은 되는데 서버에서는 안 될 때, 원인을 가르기 위한 도구.
// 두 가지 방식으로 각각 보내보고 어느 쪽이 되는지 확인한다.
//
//   ① fetch      — Node 내장 (지금 pusher.js 가 쓰는 방식)
//   ② node:https — Node 기본 모듈 (curl 에 더 가까운 방식)
//
// 실행: node spot-test.js
// ==========================================

'use strict';

require('dotenv').config({ quiet: true });

const https = require('https');
const { URL } = require('url');

const SPOT_URL = process.env.SPOT_URL || 'https://sprint-spot.vercel.app/api/detect';
const SPOT_KEY = process.env.SPOT_KEY || '';
const STORE_ID = process.env.SPOT_STORE_ID || 's1';

const PAYLOAD = JSON.stringify({
  storeId: STORE_ID,
  detectedAt: Date.now(),
  slots: [{ code: 'A1', status: 'unknown' }],
});

console.log('==========================================');
console.log(' SPOT 전송 진단');
console.log('==========================================');
console.log(' Node 버전 :', process.version);
console.log(' 보낼 곳   :', SPOT_URL);
console.log(' storeId   :', STORE_ID);
console.log(' 키        :', SPOT_KEY ? `설정됨 (${SPOT_KEY.length}자)` : '⚠ 없음');
console.log(' fetch 존재:', typeof fetch === 'function' ? '예' : '아니오');

// 프록시 환경변수가 있으면 curl 은 쓰고 fetch 는 안 쓴다.
// 이게 원인인 경우가 흔하다.
const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY'];
const foundProxy = proxyVars.filter((v) => process.env[v]);

if (foundProxy.length > 0) {
  console.log('\n ⚠ 프록시 환경변수가 있습니다:');
  foundProxy.forEach((v) => console.log(`   ${v} = ${process.env[v]}`));
  console.log('   curl 은 이걸 쓰지만 Node 의 fetch 는 무시합니다.');
  console.log('   → 이게 원인일 가능성이 높습니다.');
} else {
  console.log(' 프록시    : 없음');
}

console.log('');

// ==========================================
// ① fetch 로 보내기
// ==========================================
async function tryFetch() {
  console.log('------------------------------------------');
  console.log(' ① fetch 로 시도 (지금 서버가 쓰는 방식)');
  console.log('------------------------------------------');

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(SPOT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-spot-key': SPOT_KEY,
      },
      body: PAYLOAD,
      signal: controller.signal,
    });

    const text = await res.text();
    const took = Date.now() - started;

    console.log(` ✅ 성공  HTTP ${res.status}  (${took}ms)`);
    console.log(` 응답: ${text.slice(0, 300)}`);
    return true;
  } catch (err) {
    const took = Date.now() - started;
    console.log(` ❌ 실패  (${took}ms)`);
    console.log(` 이유: ${err.name} — ${err.message}`);
    if (err.cause) console.log(` 원인: ${err.cause.message || err.cause}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
// ② node:https 로 보내기
// ==========================================
function tryHttps() {
  console.log('');
  console.log('------------------------------------------');
  console.log(' ② node:https 로 시도 (Node 기본 모듈)');
  console.log('------------------------------------------');

  return new Promise((resolve) => {
    const started = Date.now();
    const url = new URL(SPOT_URL);

    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(PAYLOAD),
          'x-spot-key': SPOT_KEY,
        },
        timeout: 20000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const took = Date.now() - started;
          console.log(` ✅ 성공  HTTP ${res.statusCode}  (${took}ms)`);
          console.log(` 응답: ${body.slice(0, 300)}`);
          resolve(true);
        });
      }
    );

    req.on('timeout', () => {
      console.log(` ❌ 실패  20초 초과`);
      req.destroy();
      resolve(false);
    });

    req.on('error', (err) => {
      const took = Date.now() - started;
      console.log(` ❌ 실패  (${took}ms)`);
      console.log(` 이유: ${err.message}`);
      resolve(false);
    });

    req.write(PAYLOAD);
    req.end();
  });
}

// ==========================================
// 판정
// ==========================================
async function main() {
  const fetchOk = await tryFetch();
  const httpsOk = await tryHttps();

  console.log('');
  console.log('==========================================');
  console.log(' 결과');
  console.log('==========================================');
  console.log(' fetch      :', fetchOk ? '성공' : '실패');
  console.log(' node:https :', httpsOk ? '성공' : '실패');
  console.log('');

  if (fetchOk) {
    console.log(' → fetch 가 됩니다. 서버 쪽 다른 문제일 수 있습니다.');
  } else if (httpsOk) {
    console.log(' → fetch 만 안 됩니다.');
    console.log('   pusher.js 를 node:https 방식으로 바꾸면 해결됩니다.');
  } else {
    console.log(' → 둘 다 안 됩니다. Node 자체가 밖으로 못 나가는 상태입니다.');
    console.log('   백신 방화벽이 node.exe 를 막고 있을 가능성이 큽니다.');
  }

  console.log('');
}

main();
