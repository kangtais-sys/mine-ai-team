// URL 학습 API — 사이트 자동 전체 탐색 (Jina AI Reader, 가입 불필요)
// POST { account, url } → 시작 URL → 내부 링크 탐색 → 제품 페이지 크롤 → Claude 통합 분석 → Redis
// DELETE { account, url } → 학습 항목 삭제
// GET  { account }       → 학습된 URL 목록
export const config = { maxDuration: 300 };

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_URLS_PER_ACCOUNT = 10;
const MAX_CRAWL_PAGES      = 8;     // 제품 페이지 최대 탐색 수
const MAX_CHARS_PER_PAGE   = 3000;  // 페이지당 텍스트 한도
const MAX_TOTAL_CHARS      = 15000; // Claude 전달 총 한도
const MAX_IMAGES_PER_PAGE  = 3;     // 페이지당 Vision 분석 이미지 수
const MAX_IMAGE_PAGES      = 4;     // Vision 분석할 최대 페이지 수

// ────────────────────────────────────────────────
// Jina AI Reader
// ────────────────────────────────────────────────
async function fetchWithJina(url, ms = 20000, maxChars = MAX_CHARS_PER_PAGE) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  const text = await res.text();
  if (!text || text.length < 30) throw new Error('빈 페이지');
  return text.slice(0, maxChars);
}

async function fetchSafe(url) {
  try { return await fetchWithJina(url); } catch { return null; }
}

// ────────────────────────────────────────────────
// 마크다운에서 같은 도메인 이미지 URL 추출 (상품 상세 이미지)
// ────────────────────────────────────────────────
function extractImageUrls(markdown, baseUrl) {
  const base = new URL(baseUrl);
  const seen = new Set();
  const imgs = [];
  // 마크다운 이미지 링크 파싱: ![alt](url)
  const re = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const imgUrl = m[1].split('?')[0]; // 쿼리스트링 제거
    if (!/\.(jpg|jpeg|png|webp)$/i.test(imgUrl)) continue;
    try {
      const u = new URL(imgUrl);
      if (u.hostname !== base.hostname) continue;
      // 로고·아이콘·썸네일 제외, 상품 상세 이미지만
      const skip = ['/category/', '/logo/', '/icon', '/small/', '/tiny/', 'glo.png'];
      if (skip.some(s => imgUrl.includes(s))) continue;
      if (seen.has(imgUrl)) continue;
      seen.add(imgUrl);
      imgs.push(imgUrl);
    } catch {}
  }
  return imgs;
}

// Claude Vision으로 이미지에서 텍스트 추출
async function readImagesWithVision(imageUrls) {
  if (!imageUrls.length) return '';
  const targets = imageUrls.slice(0, MAX_IMAGES_PER_PAGE);
  const imageContent = targets.map(url => ({
    type: 'image',
    source: { type: 'url', url },
  }));
  imageContent.push({
    type: 'text',
    text: '이 이미지들은 한국 뷰티 브랜드 쇼핑몰의 제품 상세 이미지입니다. 이미지에서 텍스트 정보를 읽어 제품명, 성분, 효능, 가격, 용량, 사용법, 주의사항을 추출해 한국어로 정리해주세요. 이미지에 텍스트가 없으면 "텍스트 없음"이라고만 답하세요.',
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: imageContent }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim() || '';
    return text === '텍스트 없음' ? '' : text;
  } catch { return ''; }
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

  // 텍스트 크롤
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

  // Claude Vision으로 상품 이미지 텍스트 추출 (제품 상세 페이지, 이미지 추출용 별도 전체 fetch)
  const productUrls = pages
    .filter(p => p.url.includes('/product/detail') || p.url.includes('/goods/') || p.url.match(/product_no=/))
    .map(p => p.url)
    .slice(0, MAX_IMAGE_PAGES);

  // 제품 페이지 Vision 분석 - 병렬 실행
  const visionJobs = productUrls.map(async (productUrl) => {
    try {
      const fullContent = await fetchWithJina(productUrl, 20000, 15000);
      if (!fullContent) return null;
      const imgUrls = extractImageUrls(fullContent, startUrl);
      if (imgUrls.length === 0) return null;
      console.log(`[Vision] ${productUrl} → 이미지 ${imgUrls.length}개`);
      const visionText = await readImagesWithVision(imgUrls);
      return visionText ? `[이미지 분석 — ${productUrl}]\n${visionText}` : null;
    } catch (e) {
      console.warn(`[Vision] 실패: ${productUrl}`, e.message);
      return null;
    }
  });
  const visionResults = (await Promise.all(visionJobs)).filter(Boolean);

  const textContent = pages
    .map(p => `=== ${p.url} ===\n${p.content}`)
    .join('\n\n')
    .slice(0, MAX_TOTAL_CHARS - 3000);

  const combined = visionResults.length > 0
    ? `${textContent}\n\n=== 상품 이미지 분석 (Claude Vision) ===\n${visionResults.join('\n\n')}`
    : textContent;

  return {
    title,
    combined: combined.slice(0, MAX_TOTAL_CHARS),
    crawledCount: pages.length,
    foundLinks: allLinks.length,
    visionPages: visionResults.length,
  };
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

  const { title, combined, crawledCount, foundLinks, visionPages = 0 } = crawlResult;
  console.log(`[LearnURL][${account}] ${foundLinks}링크 → ${crawledCount}페이지 크롤 + ${visionPages}페이지 Vision 분석`);

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
    visionPages,
    isUpdate: !!alreadyLearned,
  });
}
