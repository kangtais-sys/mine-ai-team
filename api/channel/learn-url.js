// URL 학습 API — 사이트 자동 전체 탐색 (Jina AI Reader, 가입 불필요)
// POST { account, url } → 시작 URL → 내부 링크 탐색 → 제품 페이지 크롤 → Claude 통합 분석 → Redis
// DELETE { account, url } → 학습 항목 삭제
// GET  { account }       → 학습된 URL 목록
export const config = { maxDuration: 60 };

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_URLS_PER_ACCOUNT = 10;
const MAX_CRAWL_PAGES      = 10;    // 제품 페이지 최대 탐색 수
const MAX_CHARS_PER_PAGE   = 4000;  // 페이지당 문자 한도
const MAX_TOTAL_CHARS      = 18000; // Claude 전달 총 한도

// ────────────────────────────────────────────────
// Jina AI Reader
// ────────────────────────────────────────────────
async function fetchWithJina(url, ms = 20000) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  const text = await res.text();
  if (!text || text.length < 30) throw new Error('빈 페이지');
  return text.slice(0, MAX_CHARS_PER_PAGE);
}

async function fetchSafe(url) {
  try { return await fetchWithJina(url); } catch { return null; }
}

// ────────────────────────────────────────────────
// 마크다운에서 같은 도메인 내부 링크 추출
// ────────────────────────────────────────────────
function extractInternalLinks(markdown, baseUrl) {
  const base = new URL(baseUrl);
  const seen = new Set();
  const links = [];
  const re = /\]\((https?:\/\/[^)\s"]+)\)/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    try {
      const u = new URL(m[1]);
      if (u.hostname !== base.hostname) continue;
      const clean = u.origin + u.pathname + u.search;
      if (!seen.has(clean)) { seen.add(clean); links.push(clean); }
    } catch {}
  }
  return links;
}

// 제품 상세 > 카테고리 > 기타, 회원/주문/장바구니 제외
function prioritize(links) {
  const skip = ['/member/', '/order/', '/myshop/', '/board/', '/community/', 'login', 'join', '/cart', '/wish', 'instagram.com', 'kakao'];
  const ok = links.filter(l => !skip.some(s => l.includes(s)));
  const detail   = ok.filter(l => l.includes('/product/detail') || l.includes('/goods/') || l.match(/product_no=/));
  const category = ok.filter(l => l.includes('/product/list') || l.includes('/cate_no') || l.includes('/category'));
  const rest     = ok.filter(l => !detail.includes(l) && !category.includes(l));
  return [...detail, ...category, ...rest];
}

// ────────────────────────────────────────────────
// 사이트 자동 탐색
// ────────────────────────────────────────────────
async function crawlSite(startUrl) {
  const indexContent = await fetchWithJina(startUrl);
  const title = (indexContent.match(/^#\s+(.+)$/m) || [])[1]?.trim().slice(0, 100) || '';
  const allLinks = extractInternalLinks(indexContent, startUrl);
  const targets  = prioritize(allLinks).slice(0, MAX_CRAWL_PAGES);

  const pages = [{ url: startUrl, content: indexContent }];
  for (let i = 0; i < targets.length; i += 3) {
    const batch = targets.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(u => fetchSafe(u).then(c => ({ url: u, content: c })))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.content) pages.push(r.value);
    }
  }

  const combined = pages
    .map(p => `=== ${p.url} ===\n${p.content}`)
    .join('\n\n')
    .slice(0, MAX_TOTAL_CHARS);

  return { title, combined, crawledCount: pages.length, foundLinks: allLinks.length };
}

// ────────────────────────────────────────────────
// Redis helpers
// ────────────────────────────────────────────────
async function getKnowledge(account) {
  try {
    const raw = await redis.get(`channel:url-knowledge:${account}`);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch { return []; }
}

async function saveKnowledge(account, items) {
  await redis.set(`channel:url-knowledge:${account}`, JSON.stringify(items));
}

function isValidUrl(url) {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

// ────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { account } = req.query || {};
    if (!account) return res.status(400).json({ error: 'account required' });
    return res.status(200).json(await getKnowledge(account));
  }

  if (req.method === 'DELETE') {
    const { account, url } = req.body || {};
    if (!account || !url) return res.status(400).json({ error: 'account and url required' });
    const items = await getKnowledge(account);
    await saveKnowledge(account, items.filter(i => i.url !== url));
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { account, url } = req.body || {};
  if (!account || !['yuminhye', 'millimilli'].includes(account)) {
    return res.status(400).json({ error: 'account must be yuminhye or millimilli' });
  }
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: '유효한 URL을 입력해주세요 (https://...)' });
  }

  // 1. 사이트 자동 탐색 (시작 페이지 → 제품 상세 링크 자동 발견 → 크롤)
  let crawlResult;
  try {
    crawlResult = await crawlSite(url);
  } catch (e) {
    return res.status(400).json({ error: `사이트 접근 실패: ${e.message}` });
  }

  const { title, combined, crawledCount, foundLinks } = crawlResult;
  console.log(`[LearnURL][${account}] ${foundLinks}개 링크 발견 → ${crawledCount}페이지 크롤 완료`);

  // 2. Claude 통합 분석
  const accountName = account === 'yuminhye' ? '유민혜 인플루언서 채널' : '밀리밀리(MILLIMILLI) K뷰티 브랜드';
  let summary = '';
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250514',
        max_tokens: 1000,
        system: `당신은 ${accountName}의 SNS 응대 AI입니다.
여러 페이지에서 수집한 사이트 전체 내용을 분석해 고객 응대에 필요한 정보를 추출하세요.
- 각 제품명 + 특징 + 성분/효능 + 가격(있으면) + 용량
- 브랜드 철학, 핵심 메시지
- 구매처/판매채널
- 자주 묻는 질문과 답
반드시 JSON만 반환. 마크다운 없이.
{
  "products": ["제품명 — 특징/성분/효능/가격 요약", ...],
  "brand": "브랜드 핵심 메시지",
  "channels": "구매처 정보",
  "faq": ["Q: 답변", ...],
  "keyFacts": ["중요 사실", ...]
}`,
        messages: [{ role: 'user', content: `사이트 크롤 결과 (${crawledCount}페이지):\n\n${combined}` }],
      }),
    });
    const data = await claudeRes.json();
    summary = data.content?.[0]?.text?.trim() || '';
    try { JSON.parse(summary.replace(/```json\n?|```\n?/g, '').trim()); }
    catch { summary = JSON.stringify({ keyFacts: [summary.slice(0, 800)] }); }
  } catch (e) {
    return res.status(500).json({ error: `Claude 분석 실패: ${e.message}` });
  }

  // 3. Redis 저장
  const existing = await getKnowledge(account);
  const newItem = { url, title: title || url, summary, crawledPages: crawledCount, learnedAt: new Date().toISOString() };
  const alreadyLearned = existing.find(i => i.url === url);
  const updated = alreadyLearned
    ? existing.map(i => i.url === url ? newItem : i)
    : [newItem, ...existing].slice(0, MAX_URLS_PER_ACCOUNT);

  await saveKnowledge(account, updated);

  return res.status(200).json({
    success: true,
    title: newItem.title,
    url,
    crawledPages: crawledCount,
    foundLinks,
    isUpdate: !!alreadyLearned,
  });
}
