#!/usr/bin/env node
/* 원장님 가이드(GEO 콘텐츠) 빌더 — _i18n/build.mjs 와 별개. 그 파일·산출물은 건드리지 않는다.
 *
 *   node _geo/build.mjs           # guide/<slug>/index.html · guide/index.html · sitemap-guide.xml · llms.txt 생성
 *   node _geo/build.mjs --check   # 메모리에서만 빌드하고 바뀔 파일 수만 보고 (0 이어야 커밋 가능 상태)
 *
 * 글 원본: _geo/content/<slug>.md  (앞머리 title·description·date·updated·targets·summary)
 * 같은 원본이면 같은 결과가 나온다(빌드 시각을 쓰지 않는다) — 그래서 --check 가 의미 있다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, parseFront, firstParagraph, esc } from './md.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK = process.argv.includes('--check');
const SITE = 'https://rigidpointadvisory.com';
const APP_STORE = 'https://apps.apple.com/kr/app/vi-one/id6774170446';
const PLAY = 'https://play.google.com/store/apps/details?id=com.rigidpointadvisory.vioneapp';

/* 금칙어 — BRIEF §2 한국어 카피 금칙어 + 실적 주장. 걸리면 빌드 실패 */
const BANNED = [
  [/1인샵/, '1인샵(오염 검색어)'], [/소상공인/, '소상공인'], [/\bCRM\b/, 'CRM'],
  [/무료\s?체험/, '무료 체험'], [/(국내|업계)\s?(최초|유일|1위)/, '최초/유일/1위'],
  [/\d[\d,]*\s?(곳|명|개 매장)이\s?(사용|쓰고)/, '사용자 수 주장'], [/vione\.app/, 'vione.app(우리 도메인 아님)'],
  [/놓친\s?(전화|매출|예약|연락)/, '놓친 ~ (폐기된 메시지)'],
];

const CSS = readFileSync(join(HERE, 'guide.css'), 'utf8');

function lint(slug, text) {
  const hits = BANNED.filter(([re]) => re.test(text)).map(([, name]) => name);
  if (hits.length) throw new Error(`[${slug}] 금칙어: ${hits.join(', ')}`);
}

function loadPosts() {
  const dir = join(HERE, 'content');
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => {
    const src = readFileSync(join(dir, f), 'utf8');
    const { meta, body } = parseFront(src);
    const slug = f.replace(/\.md$/, '');
    for (const k of ['title', 'description', 'date']) if (!meta[k]) throw new Error(`[${slug}] 앞머리 ${k} 없음`);
    if (meta.status === 'draft') return null;
    lint(slug, src);
    const r = render(body);
    return {
      slug, ...meta, updated: meta.updated || meta.date,
      targets: Array.isArray(meta.targets) ? meta.targets : [],
      summary: meta.summary || firstParagraph(src),
      url: `${SITE}/guide/${slug}/`, ...r,
    };
  }).filter(Boolean).sort((a, b) => (b.updated + b.slug).localeCompare(a.updated + a.slug));
}

const head = ({ title, description, url, type = 'article', jsonld }) => `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}"><meta property="og:site_name" content="VI One · Rigid Point Advisory">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/assets/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="VI One 원장님 가이드" href="${SITE}/guide/feed.xml">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head><body>
<header><div class="wrap"><nav>
  <a class="logo" href="/"><img src="/assets/img/app-icon.svg" alt=""><span>VI One</span></a>
  <span class="sp"></span>
  <a class="l" href="/guide/">원장님 가이드</a>
  <a class="cta" href="/app">앱 받기</a>
</nav></div></header>`;

const CTA = `<aside class="cta-box">
  <div class="k">VI One(브이원)</div>
  <h2>단골 손님이 계속 오실 수 있게.</h2>
  <p>미용실·네일·속눈썹·왁싱 원장님을 위한 예약장부·고객차트 앱입니다. 손님마다 다른 재방문 주기를 기억해 뜸해진 손님을 먼저 알려드리고, 예약 확인 문자로 노쇼를 줄입니다. Starter는 무료로 시작할 수 있습니다.</p>
  <div class="btns"><a class="btn w" href="${APP_STORE}">App Store</a><a class="btn o" href="${PLAY}">Google Play</a></div>
</aside>`;

/* 가이드별 스토어 링크 — Play 는 설치 출처(utm)를 Play Console 획득 보고서에 남긴다.
   App Store 는 제공자 토큰(pt)이 있어야 캠페인으로 잡히므로, APPLE_PT 가 비어 있으면 기본 링크를 쓴다. */
const APPLE_PT = '128861288';
const storeLinks = (slug) => ({
  ios: APPLE_PT ? `https://apps.apple.com/app/apple-store/id6774170446?pt=${APPLE_PT}&ct=${encodeURIComponent(('geo_' + slug).slice(0, 30))}&mt=8` : APP_STORE,
  android: `${PLAY}&referrer=${encodeURIComponent(`utm_source=rigidpointadvisory&utm_medium=guide&utm_campaign=${slug}`)}`,
});
const ctaFor = (slug) => { const l = storeLinks(slug); return CTA.replace(`href="${APP_STORE}"`, `href="${l.ios}"`).replace(`href="${PLAY}"`, `href="${l.android.replace(/&/g, '&amp;')}"`); };

const FOOT = `<footer><div class="wrap">
  <div><strong>VI One</strong> · <a href="/">rigidpointadvisory.com</a> · <a href="/guide/">원장님 가이드</a> · <a href="mailto:hellosangwoo@gmail.com">hellosangwoo@gmail.com</a></div>
  <div class="biz">Rigid Point Advisory · 대표 박상우 · 사업자등록번호 595-08-03684 · 서울 종로구</div>
  <div class="biz"><a href="https://hellosangwoo-ctrl.github.io/vione-legal/privacy-policy.html">개인정보처리방침</a> · <a href="https://hellosangwoo-ctrl.github.io/vione-legal/terms-of-service.html">이용약관</a></div>
</div></footer>
<script src="/assets/geo-beacon.js" defer></script>
</body></html>
`;

const ORG = { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Rigid Point Advisory', url: `${SITE}/` };
const APP = { '@type': 'SoftwareApplication', '@id': `${SITE}/#vione`, name: 'VI One', alternateName: '브이원' };

function postPage(p, all) {
  const related = all.filter(x => x.slug !== p.slug).slice(0, 4);
  const graph = [
    { '@type': 'Article', headline: p.title, description: p.description, inLanguage: 'ko',
      datePublished: p.date, dateModified: p.updated, mainEntityOfPage: p.url,
      author: ORG, publisher: ORG, about: APP, image: `${SITE}/assets/img/og.png` },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: '원장님 가이드', item: `${SITE}/guide/` },
      { '@type': 'ListItem', position: 3, name: p.title, item: p.url }] },
  ];
  if (p.faq.length) graph.push({ '@type': 'FAQPage', mainEntity: p.faq.map(f => ({
    '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

  return head({ title: `${p.title} | VI One 원장님 가이드`, description: p.description, url: p.url,
                jsonld: { '@context': 'https://schema.org', '@graph': graph } }) + `
<main class="wrap art">
  <div class="crumb"><a href="/">홈</a> › <a href="/guide/">원장님 가이드</a></div>
  <h1>${esc(p.title)}</h1>
  <div class="meta">작성 ${p.date} · 갱신 <time datetime="${p.updated}">${p.updated}</time> · VI One 팀</div>
  <p class="answer">${esc(p.summary)}</p>
  ${p.toc.length > 2 ? `<nav class="toc"><b>목차</b><ol>${p.toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : ''}
  <article>
${p.html}
  </article>
  ${ctaFor(p.slug)}
  ${related.length ? `<section class="rel"><h2>함께 읽으면 좋은 글</h2><ul>${related.map(r => `<li><a href="/guide/${r.slug}/">${esc(r.title)}</a></li>`).join('')}</ul></section>` : ''}
</main>
` + FOOT;
}

function hubPage(all) {
  const url = `${SITE}/guide/`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'VI One 원장님 가이드', url,
    isPartOf: { '@id': `${SITE}/#org` },
    hasPart: all.map(p => ({ '@type': 'Article', headline: p.title, url: p.url, dateModified: p.updated })) };
  return head({ title: 'VI One 원장님 가이드 — 예약·노쇼·단골 관리 실무', type: 'website',
    description: '미용실·네일·속눈썹·왁싱 원장님을 위한 실무 가이드. 노쇼 줄이기, 단골 재방문 주기 관리, 예약 문자 예시, 고객차트 정리법.',
    url, jsonld }) + `
<main class="wrap art">
  <h1>원장님 가이드</h1>
  <p class="answer">미용실·네일·속눈썹·왁싱 원장님이 예약·노쇼·단골 관리에서 바로 써먹을 수 있는 실무 글을 모았습니다. 어떤 앱을 쓰든 통하는 방법을 먼저 쓰고, VI One(브이원)에서는 어떻게 하는지 마지막에 붙였습니다.</p>
  <ul class="hub">
${all.map(p => `    <li><a href="/guide/${p.slug}/"><b>${esc(p.title)}</b><span>${esc(p.description)}</span><small>갱신 ${p.updated}</small></a></li>`).join('\n')}
  </ul>
  ${CTA}
</main>
` + FOOT;
}

function sitemap(all) {
  const latest = all.reduce((m, p) => (p.updated > m ? p.updated : m), '2026-10-24');
  const rows = [`  <url><loc>${SITE}/guide/</loc><lastmod>${latest}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`]
    .concat(all.map(p => `  <url><loc>${p.url}</loc><lastmod>${p.updated}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

function feed(all) {
  const items = all.map(p => `  <item><title>${esc(p.title)}</title><link>${p.url}</link><guid>${p.url}</guid><pubDate>${new Date(p.updated + 'T09:00:00+09:00').toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>VI One 원장님 가이드</title><link>${SITE}/guide/</link><description>예약·노쇼·단골 관리 실무</description><language>ko</language>\n${items.join('\n')}\n</channel></rss>\n`;
}

function llms(all) {
  const facts = readFileSync(join(HERE, 'llms-head.md'), 'utf8').trim();
  return `${facts}\n\n## 원장님 가이드\n\n${all.map(p => `- [${p.title}](${p.url}): ${p.summary}`).join('\n')}\n`;
}

const posts = loadPosts();
const out = [
  ...posts.map(p => ({ path: join(ROOT, 'guide', p.slug, 'index.html'), body: postPage(p, posts) })),
  { path: join(ROOT, 'guide', 'index.html'), body: hubPage(posts) },
  { path: join(ROOT, 'guide', 'feed.xml'), body: feed(posts) },
  { path: join(ROOT, 'sitemap-guide.xml'), body: sitemap(posts) },
  { path: join(ROOT, 'llms.txt'), body: llms(posts) },
];

let changed = 0;
for (const f of out) {
  const prev = existsSync(f.path) ? readFileSync(f.path, 'utf8') : null;
  if (prev === f.body) continue;
  changed++;
  if (CHECK) { console.log('would change:', f.path.slice(ROOT.length + 1)); continue; }
  mkdirSync(dirname(f.path), { recursive: true });
  writeFileSync(f.path, f.body);
  console.log('wrote', f.path.slice(ROOT.length + 1));
}
console.log(`${posts.length} posts · ${changed} files ${CHECK ? 'would change' : 'changed'}`);
if (CHECK && changed) process.exitCode = 1;
