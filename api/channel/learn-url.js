// URL 학습 API — Microlink 스크린샷 + Jina 텍스트 + Claude Vision
// 어떤 사이트든 (Cafe24 포함) 학습 가능
export const config = { maxDuration: 120 };

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_URLS_PER_ACCOUNT = 10;

// ────────────────────────────────────────────────
// 1단계: Microlink로 페이지 스크린샷 (어떤 사이트든)
// ────────────────────────────────────────────────
async function getScreenshots(startUrl) {
  // 시작 페이지 스크린샷
  const screenshots = [];

  // Jina로 내부 링크 먼저 추출 (텍스트 크롤)
  let textContent = '';
  let title = '';
  let productUrls = [];

  try {
    const jinaRes = await fetch(`https://r.jina.ai/${startUrl}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(15000),
    });
    const md = await jinaRes.text();
    textContent = md.slice(0, 5000);
    title = (md.match(/^#\s+(.+)$/m) || [])[1]?.trim().slice(0, 100) || '';

    // 제품 상세 링크 추출
    const base = new URL(startUrl);
    const linkRe = /\]\((https?:\/\/[^)\s"]+)\)/g;
    const seen = new Set();
    let m;
    while ((m = linkRe.exec(md)) !== null) {
      try {
        const u = new URL(m[1]);
        if (u.hostname !== base.hostname) continue;
        const clean = u.origin + u.pathname + u.search;
        const skip = ['/member/', '/order/', '/cart', '/wish', '/board/', 'login', 'join'];
        if (skip.some(s => clean.includes(s))) continue;
        if (seen.has(clean)) continue;
        seen.add(clean);
        // 제품 상세 우선
        if (clean.includes('/product/detail') || clean.includes('/goods/') || clean.includes('product_no=')) {
          productUrls.push(clean);
        }
      } catch {}
    }
  } catch (e) {
    console.log('[LearnURL] Jina 텍스트 크롤 실패:', e.message);
  }

  // 스크린샷 대상: 시작 URL + 제품 페이지 최대 3개
  const screenshotTargets = [startUrl, ...productUrls.slice(0, 3)];
  console.log(`[LearnURL] 스크린샷 대상: ${screenshotTargets.length}개`);

  // Microlink로 스크린샷 병렬 요청
  const screenshotJobs = screenshotTargets.map(async (url) => {
    try {
      const mlRes = await fetch(
        `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&fullPage=true&waitFor=2000`,
        { signal: AbortSignal.timeout(25000) }
      );
      const ml = await mlRes.json();
      const imgUrl = ml?.data?.screenshot?.url;
      if (imgUrl) {
        console.log(`[LearnURL] 스크린샷 완료: ${url.slice(0, 60)}`);
        return { url, imgUrl };
      }
    } catch (e) {
      console.log(`[LearnURL] Microlink 실패: ${url.slice(0, 60)}`, e.message);
    }
    return null;
  });

  const results = await Promise.all(screenshotJobs);
  screenshots.push(...results.filter(Boolean));

  return { title, textContent, screenshots, productUrls };
}

// ────────────────────────────────────────────────
// 2단계: Microlink 스크린샷 → base64 변환
// ────────────────────────────────────────────────
async function screenshotToBase64(imgUrl) {
  try {
    const res = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // 5MB 초과 시 스킵 (Claude 제한)
    if (buf.byteLength > 5 * 1024 * 1024) {
      console.log('[LearnURL] 스크린샷 너무 큼, 스킵:', buf.byteLength);
      return null;
    }
    const b64 = Buffer.from(buf).toString('base64');
    const ct = res.headers.get('content-type') || 'image/png';
    return { b64, mediaType: ct.split(';')[0] || 'image/png' };
  } catch (e) {
    console.log('[LearnURL] 스크린샷 다운로드 실패:', e.message);
    return null;
  }
}

// ────────────────────────────────────────────────
// 3단계: Claude Vision으로 스크린샷 읽기
// ────────────────────────────────────────────────
async function analyzeWithVision(screenshots, textContent, accountName) {
  if (screenshots.length === 0 && !textContent) return null;

  const content = [];

  // 스크린샷 → base64 변환 (병렬, 최대 3개)
  const b64Jobs = screenshots.slice(0, 3).map(s => screenshotToBase64(s.imgUrl));
  const b64Results = await Promise.all(b64Jobs);

  let imgCount = 0;
  for (const r of b64Results) {
    if (!r) continue;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: r.mediaType, data: r.b64 },
    });
    imgCount++;
  }
  console.log(`[LearnURL] Vision에 이미지 ${imgCount}개 전송`);

  // 텍스트 내용도 함께 전달
  const textPart = textContent
    ? `\n\n[페이지 텍스트 내용]\n${textContent.slice(0, 3000)}`
    : '';

  content.push({
    type: 'text',
    text: `당신은 ${accountName}의 SNS 응대 AI입니다.
위 스크린샷(들)은 브랜드 쇼핑몰 페이지입니다. 화면에 보이는 모든 텍스트를 읽어 고객 응대에 필요한 정보를 추출하세요.
제품명, 성분, 효능, 가격, 용량, 사용법, 브랜드 메시지, 구매처, FAQ 등을 포함하세요.
반드시 JSON만 반환. 마크다운 없이.
{
  "products": ["제품명 — 특징/성분/효능/가격", ...],
  "brand": "브랜드 핵심 메시지",
  "channels": "구매처 정보",
  "faq": ["Q: 답변", ...],
  "keyFacts": ["중요 사실", ...]
}${textPart}`,
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content }],
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error('[LearnURL] Claude 에러:', JSON.stringify(data.error));
    // 이미지 없이 텍스트만으로 재시도
    if (textContent) {
      console.log('[LearnURL] 텍스트만으로 재시도');
      return analyzeTextOnly(textContent, accountName);
    }
    return null;
  }

  const raw = data.content?.[0]?.text?.trim() || '';
  console.log('[LearnURL] Claude 응답:', raw.slice(0, 150));

  try {
    return JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim());
  } catch {
    return { keyFacts: [raw.slice(0, 500)] };
  }
}

// 이미지 없이 텍스트만으로 분석 (fallback)
async function analyzeTextOnly(textContent, accountName) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `당신은 ${accountName}의 SNS 응대 AI입니다.
아래 쇼핑몰 텍스트에서 고객 응대에 필요한 정보를 추출하세요.
반드시 JSON만 반환. 마크다운 없이.
{
  "products": ["제품명 — 특징/성분/효능/가격", ...],
  "brand": "브랜드 핵심 메시지",
  "channels": "구매처 정보",
  "faq": ["Q: 답변", ...],
  "keyFacts": ["중요 사실", ...]
}

[텍스트]
${textContent.slice(0, 4000)}`,
      }],
    }),
  });
  const data = await res.json();
  if (data.error) return null;
  const raw = data.content?.[0]?.text?.trim() || '';
  try {
    return JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim());
  } catch {
    return { keyFacts: [raw.slice(0, 500)] };
  }
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
    return res.status(400).json({ error: '유효한 URL을 입력해주세요' });
  }

  // 1. 스크린샷 + 텍스트 수집
  let crawlResult;
  try {
    crawlResult = await getScreenshots(url);
  } catch (e) {
    return res.status(400).json({ error: `수집 실패: ${e.message}` });
  }

  const { title, textContent, screenshots, productUrls } = crawlResult;
  console.log(`[LearnURL][${account}] 스크린샷 ${screenshots.length}개, 제품링크 ${productUrls.length}개`);

  if (screenshots.length === 0 && !textContent) {
    return res.status(400).json({ error: '페이지 내용을 읽을 수 없습니다' });
  }

  // 2. Claude Vision 분석
  const accountName = account === 'yuminhye' ? '유민혜 인플루언서 채널' : '밀리밀리(MILLIMILLI) K뷰티 브랜드';
  const analyzed = await analyzeWithVision(screenshots, textContent, accountName);

  const summary = analyzed ? JSON.stringify(analyzed) : JSON.stringify({ keyFacts: ['분석 실패'] });

  // 3. Redis 저장
  const existing = await getKnowledge(account);
  const newItem = {
    url,
    title: title || url,
    summary,
    screenshotPages: screenshots.length,
    learnedAt: new Date().toISOString(),
  };
  const alreadyLearned = existing.find(i => i.url === url);
  const updated = alreadyLearned
    ? existing.map(i => i.url === url ? newItem : i)
    : [newItem, ...existing].slice(0, MAX_URLS_PER_ACCOUNT);

  await saveKnowledge(account, updated);

  return res.status(200).json({
    success: true,
    title: newItem.title,
    url,
    screenshotPages: screenshots.length,
    productPagesFound: productUrls.length,
    isUpdate: !!alreadyLearned,
  });
}
