// node --test _geo/md.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, parseFront, inline, firstParagraph } from './md.mjs';

test('앞머리: 문자열·배열·따옴표', () => {
  const { meta, body } = parseFront('---\ntitle: "노쇼 줄이기"\ntargets: [P10, P14]\n---\n본문');
  assert.equal(meta.title, '노쇼 줄이기');
  assert.deepEqual(meta.targets, ['P10', 'P14']);
  assert.equal(body, '본문');
});

test('인라인: 이스케이프 후 굵게·링크·코드', () => {
  assert.equal(inline('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(inline('**굵게**'), '<strong>굵게</strong>');
  assert.equal(inline('[홈](/)'), '<a href="/">홈</a>');
  assert.equal(inline('[외부](https://law.go.kr/x)'), '<a href="https://law.go.kr/x" rel="noopener">외부</a>');
  assert.equal(inline('`a`'), '<code>a</code>');
});

test('제목·목차·목록·표·인용', () => {
  const md = '## 왜 생기나요?\n문단 하나\n둘\n\n- 가\n- 나\n\n1. 하나\n2. 둘\n\n| 순서 | 할 일 |\n|---|---|\n| 1 | 템플릿 |\n\n> [샵] 내일 2시\n> 답장 주세요';
  const { html, toc } = render(md);
  assert.deepEqual(toc.map(t => t.text), ['왜 생기나요?']);
  assert.match(html, /<h2 id="왜-생기나요">/);
  assert.match(html, /<p>문단 하나 둘<\/p>/);
  assert.match(html, /<ul><li>가<\/li><li>나<\/li><\/ul>/);
  assert.match(html, /<ol><li>하나<\/li><li>둘<\/li><\/ol>/);
  assert.match(html, /<th>순서<\/th>/);
  assert.match(html, /<td>템플릿<\/td>/);
  assert.doesNotMatch(html, /---/);
  assert.match(html, /<blockquote class="msg">\[샵\] 내일 2시<br>답장 주세요<\/blockquote>/);
});

test('FAQ 추출: 자주 묻는 질문 섹션의 ### 만', () => {
  const md = '## 본문\n### 소제목\n내용\n\n## 자주 묻는 질문\n### Q. 무료인가요?\n**Starter**는 무료입니다.\n\n### Q. 안드로이드도 되나요?\n네.\n\n## 정리\n끝';
  const { faq } = render(md);
  assert.deepEqual(faq, [
    { q: '무료인가요?', a: 'Starter는 무료입니다.' },
    { q: '안드로이드도 되나요?', a: '네.' },
  ]);
});

test('첫 문단 추출은 제목·목록을 건너뛴다', () => {
  assert.equal(firstParagraph('---\na: b\n---\n## 제목\n\n- x\n\n**답**은 이것입니다.\n둘째 줄'), '답은 이것입니다. 둘째 줄');
});
