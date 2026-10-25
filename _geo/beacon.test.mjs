// assets/geo-beacon.js 를 가짜 브라우저에서 돌려, 유입·스토어 클릭이 의도대로 전송되는지 확인한다.
//   node _geo/beacon.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'geo-beacon.js'), 'utf8');

function boot({ href, referrer }) {
  const sent = [];
  const ss = new Map();
  let clickHandler = null;
  const loc = new URL(href);
  const ctx = {
    URL, JSON, decodeURIComponent,
    Blob: class { constructor(parts) { this.text = parts.join(''); } },
    navigator: { sendBeacon: (u, b) => { sent.push(JSON.parse(b.text)); return true; } },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)) },
    location: { href: loc.href, hostname: loc.hostname, pathname: loc.pathname, search: loc.search },
    document: { referrer: referrer || '', addEventListener: (t, fn) => { if (t === 'click') clickHandler = fn; } },
    fetch: () => {},
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  const click = (attrHref) => clickHandler({ target: { closest: () => ({ getAttribute: () => attrHref }) } });
  return { sent, click, ctx, ss };
}

// 1) AI 유입: 리퍼러가 chatgpt.com 이면 유입 1건
{
  const b = boot({ href: 'https://rigidpointadvisory.com/guide/no-show/', referrer: 'https://chatgpt.com/' });
  assert.equal(b.sent.length, 1);
  assert.deepEqual(b.sent[0], { h: 'chatgpt.com', p: '/guide/no-show/', u: '' });
  // 2) 같은 세션에서 Play 버튼 클릭 → 스토어 클릭에 첫 유입 출처가 실린다
  b.click('https://play.google.com/store/apps/details?id=com.rigidpointadvisory.vioneapp&referrer=utm_source%3Drigidpointadvisory');
  assert.equal(b.sent.length, 2);
  assert.deepEqual(b.sent[1], { k: 'store', s: 'android', p: '/guide/no-show/', l: '/guide/no-show/', h: 'chatgpt.com', u: '' });
}

// 3) 직접 방문은 유입을 보내지 않지만, 스토어 클릭은 보낸다(출처 비어 있음 → 서버가 direct 로 분류)
{
  const b = boot({ href: 'https://rigidpointadvisory.com/', referrer: '' });
  assert.equal(b.sent.length, 0);
  b.click('https://apps.apple.com/kr/app/vi-one/id6774170446');
  assert.equal(b.sent.length, 1);
  assert.equal(b.sent[0].k, 'store');
  assert.equal(b.sent[0].s, 'ios');
  assert.equal(b.sent[0].h, '');
}

// 4) 스토어가 아닌 링크·/app 판별
{
  const b = boot({ href: 'https://rigidpointadvisory.com/guide/', referrer: '' });
  const of = b.ctx.window.__geoStoreOf;
  assert.equal(of('/guide/no-show/'), null);
  assert.equal(of('https://example.com/'), null);
  assert.equal(of('/app'), 'app_page');
  assert.equal(of('https://rigidpointadvisory.com/app/'), 'app_page');
  b.click('/guide/vi-one/');
  assert.equal(b.sent.length, 0);
}

// 5) 사내 이동 리퍼러(같은 도메인)는 유입이 아니다
{
  const b = boot({ href: 'https://rigidpointadvisory.com/guide/vi-one/', referrer: 'https://rigidpointadvisory.com/guide/' });
  assert.equal(b.sent.length, 0);
}

console.log('beacon tests: ok');
