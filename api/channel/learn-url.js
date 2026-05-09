// URL 학습 API — Jina 텍스트 + Microlink 뷰포트 스크린샷 + Claude Vision
// 어떤 사이트든 (Cafe24 포함) 학습 가능
export const config = { maxDuration: 120 };

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_URLS_PER_ACCOUNT = 10;

// ────────────────────────────────────────────────
// Jina 텍스트 크롤
// ────────────────────────────────────────────────
async function jinaFetch(url, maxChars = 4000) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(15000),
    });
    const md = await res.text();
    return md.slice(0, maxChars);
  } catch {
    return '';
  }
}

// ────────────────────────────────────────────────
// 제품 URL 추출 (Cafe24 패턴 포함)
// ────────────────────────────────────────────────
function extractProductUrls(md, startUrl, maxProducts = 4) {
  const base = new URL(startUrl);
  const linkRe = /\]\((https?:\/\/[^)\s"]+)\)/g;
  const seen = new Set();
  const products = [];
  let m;

  while ((m = linkRe.exec(md)) !== null) {
    try {
      const u = new URL(m[1]);
      if (u.hostname !== base.hostname) continue;
      const clean = u.origin + u.pathname + u.search;
      const skip = ['/member/', '/order/', '/cart', '/wish', '/board/', 'login', 'join', '#'];
      if (skip.some(s => clean.includes(s))) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      if (
        clean.includes('/product/detail') ||
        clean.includes('/goods/') ||
        clean.includes('product_no=')
      ) {
        products.push(clean);
        if (products.length >= maxProducts) break;
      }
    } catch {}
  }
  return products;
}

// ────────────────────────────────────────────────
// Microlink 뷰포트 스크린샷 → base64
// (fullPage 없음 → 파일 작아서 Claude Vision 가능)
// ────────────────────────────────────────────────
async function getScreenshotBase64(url) {
  try {
    const mlRes = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&waitFor=2000`,
      { signal: AbortSignal.timeout(25000) }
    );
    const ml = await mlRes.json();
    const imgUrl = ml?.data?.screenshot?.url;
    if (!imgUrl) return null;

    // CDN에서 다운로드
    const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) return null;
    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength > 4 * 1024 * 1024) {
      console.log('[LearnURL] 스크린샷 4MB 초과 스킵:', buf.byteLength);
      return null;
    }
    const b64 = Buffer.from(buf).toString('base64');
    const ct = imgRes.headers.get('content-type') || 'image/png';
    console.log('[LearnURL] 스크린샷 성공:', url.slice(0, 60), `${Math.round(buf.byteLength / 1024)}KB`);
    return { b64, mediaType: ct.split(';')[0] || 'image/png' };
  } catch (e) {
    console.log('[LearnURL] Microlink 실패:', url.slice(0, 60), e.message);
    return null;
  }
}

// ────────────────────────────────────────────────
// 1단계: 페이지 수집 (텍스트 + 스크린샷)
// ────────────────────────────────────────────────
async function collectPageData(startUrl) {
  // 메인 페이지 Jina 텍스트 수집
  const mainText = await jinaFetch(startUrl, 5000);
  const title = (mainText.match(/^#\s+(.+)$/m) || [])[1]?.trim().slice(0, 100) || '';

  // 제품 URL 추출
  const productUrls = extractProductUrls(mainText, startUrl, 4);
  console.log(`[LearnURL] 제품 URL ${productUrls.length}개 발견`);

  // 메인 스크린샷 + 제품 페이지 Jina 텍스트 — 병렬
  const [screenshotResult, ...productTexts] = await Promise.all([
    getScreenshotBase64(startUrl),
    ...productUrls.slice(0, 3).map(u => jinaFetch(u, 2000)),
  ]);

  // 제품 텍스트 합치기 (제품명 위주로)
  const combinedProductText = productTexts
    .filter(Boolean)
    .map((t, i) => `[제품${i + 1}]\n${t}`)
    .join('\n\n')
    .slice(0, 4000);

  return {
    title,
    mainText,
    combinedProductText,
    screenshot: screenshotResult,
    productUrls,
  };
}

// ────────────────────────────────────────────────
// 2단계: Claude로 분석 (Vision 또는 텍스트 전용)
// ────────────────────────────────────────────────
async function analyzeWithClaude(data, accountName) {
  const { screenshot, mainText, combinedProductText } = data;

  const instructionText = `당신은 ${accountName}의 SNS 응대 AI입니다.
아래 쇼핑몰 정보에서 고객 응대에 필요한 내용을 추출하세요.
제품명, 성분, 효능, 가격, 용량, 사용법, 브랜드 메시지, 구매처, FAQ 등을 포함하세요.
반드시 JSON만 반환. 마크다운 없이.
{
  "products": ["제품명 — 특징/성분/효능/가격", ...],
  "brand": "브랜드 핵심 메시지",
  "channels": "구매처 정보",
  "faq": ["Q: 답변", ...],
  "keyFacts": ["중요 사실", ...]
}`;

  const textBlock = [
    mainText ? `[메인 페이지]\n${mainText.slice(0, 2000)}` : '',
    combinedProductText ? `[제품 상세 페이지]\n${combinedProductText}` : '',
  ].filter(Boolean).join('\n\n');

  const content = [];

  // 스크린샷이 있으면 Vision 모드
  if (screenshot) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: screenshot.mediaType, data: screenshot.b64 },
    });
    console.log('[LearnURL] Vision 모드로 분석');
  } else {
    console.log('[LearnURL] 텍스트 전용 분석');
  }

  content.push({
    type: 'text',
    text: `${instructionText}\n\n${textBlock}`,
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1200,
      messages: [{ role: 'user', content }],
    }),
  });

  const apiData = await res.json();
  console.log('[LearnURL] Claude HTTP:', res.status, '| stop_reason:', apiData.stop_reason, '| error:', JSON.stringify(apiData.error || null));

  if (apiData.error) {
    console.error('[LearnURL] Claude 에러 전체:', JSON.stringify(apiData.error));
    // Vision 실패 시 텍스트만으로 재시도
    if (screenshot && textBlock) {
      console.log('[LearnURL] 텍스트만으로 재시도');
      return analyzeWithClaude({ ...data, screenshot: null }, accountName);
    }
    // 에러 정보를 keyFacts에 담아서 반환 (디버그용)
    return { keyFacts: [`API 오류: ${apiData.error?.type} — ${apiData.error?.message}`] };
  }

  const raw = apiData.content?.[0]?.text?.trim() || '';
  console.log('[LearnURL] Claude 응답 길이:', raw.length, '| 첫 150자:', raw.slice(0, 150));

  // raw가 비어있으면 디버그 정보 포함해서 반환
  if (!raw) {
    const debugInfo = {
      httpStatus: res.status,
      stopReason: apiData.stop_reason,
      usage: apiData.usage,
      contentLength: apiData.content?.length,
      hasScreenshot: !!screenshot,
      textBlockLen: textBlock.length,
    };
    console.warn('[LearnURL] raw 비어있음! 디버그:', JSON.stringify(debugInfo));
    return { keyFacts: [`응답 비어있음 — stop_reason:${apiData.stop_reason} usage:${JSON.stringify(apiData.usage)}`] };
  }

  try {
    return JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim());
  } catch {
    if (raw.length > 10) return { keyFacts: [raw.slice(0, 500)] };
    return { keyFacts: ['JSON 파싱 실패 — raw:' + raw.slice(0, 100)] };
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

  // 1. 페이지 수집
  let pageData;
  try {
    pageData = await collectPageData(url);
  } catch (e) {
    return res.status(400).json({ error: `수집 실패: ${e.message}` });
  }

  const { title, screenshot, productUrls } = pageData;
  console.log(`[LearnURL][${account}] 스크린샷: ${screenshot ? 'O' : 'X'}, 제품URL: ${productUrls.length}개`);

  if (!pageData.mainText && !screenshot) {
    return res.status(400).json({ error: '페이지 내용을 읽을 수 없습니다' });
  }

  // 2. Claude 분석
  const accountName = account === 'yuminhye' ? '유민혜 인플루언서 채널' : '밀리밀리(MILLIMILLI) K뷰티 브랜드';
  const analyzed = await analyzeWithClaude(pageData, accountName);
  const summary = analyzed ? JSON.stringify(analyzed) : JSON.stringify({ keyFacts: ['분석 실패'] });

  // 3. Redis 저장
  const existing = await getKnowledge(account);
  const newItem = {
    url,
    title: title || url,
    summary,
    screenshotPages: screenshot ? 1 : 0,
    productUrlsFound: productUrls.length,
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
    screenshotPages: newItem.screenshotPages,
    productPagesFound: productUrls.length,
    isUpdate: !!alreadyLearned,
  });
}
