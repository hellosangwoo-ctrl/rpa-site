/* 의존성 없는 작은 마크다운 → HTML 변환기 (가이드 글 전용).
 * 지원: ## / ### 제목, 문단, - 목록, 1. 목록, | 표 |, > 인용(문자 예시), **굵게**, [링크](url), `코드`
 * 그리고 "## 자주 묻는 질문" 아래의 "### Q. 질문" + 답 문단 → FAQ 추출.
 * 테스트: node --test _geo/md.test.mjs
 */

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugId(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:\/\//.test(u) && !/^https:\/\/rigidpointadvisory\.com/.test(u);
    return `<a href="${u}"${ext ? ' rel="noopener"' : ''}>${t}</a>`;
  });
  return out;
}

/* 앞머리:  ---\nkey: value\nlist: [a, b]\n--- */
export function parseFront(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const k = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (!k) continue;
    let v = k[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
    else v = v.replace(/^"(.*)"$/, '$1');
    meta[k[1]] = v;
  }
  return { meta, body: src.slice(m[0].length) };
}

export function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const toc = [];
  const faq = [];
  let i = 0;
  let inFaq = false;
  let curQ = null;

  const flushQ = () => { if (curQ && curQ.a.length) faq.push({ q: curQ.q, a: curQ.a.join(' ') }); curQ = null; };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m;
    if ((m = /^(#{2,3})\s+(.*)$/.exec(line))) {
      const level = m[1].length; const text = m[2].trim();
      if (level === 2) { flushQ(); inFaq = /자주 묻는 질문|FAQ/i.test(text); }
      if (level === 3 && inFaq) { flushQ(); curQ = { q: text.replace(/^Q\.\s*/, ''), a: [] }; }
      const id = slugId(text);
      if (level === 2) toc.push({ id, text });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++; continue;
    }
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(1).filter(r => !/^\|[\s:|-]+\|$/.test(r));
      html.push('<div class="tbl"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' + body.map(r => '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      html.push(`<blockquote class="msg">${q.map(inline).join('<br>')}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      html.push('<ul>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>');
      if (curQ) curQ.a.push(items.join(' / '));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      html.push('<ol>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ol>');
      if (curQ) curQ.a.push(items.join(' / '));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|\||>|[-*]\s|\d+\.\s)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    const text = para.join(' ');
    html.push(`<p>${inline(text)}</p>`);
    if (curQ) curQ.a.push(text.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
  }
  flushQ();
  return { html: html.join('\n'), toc, faq };
}

/* 첫 문단(answer-first 요약) — 메타 설명 기본값·llms.txt 용 */
export function firstParagraph(md) {
  const { body } = parseFront(md);
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (t && !/^(#|\||>|[-*]\s|\d+\.\s)/.test(t)) return t.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ');
  }
  return '';
}
