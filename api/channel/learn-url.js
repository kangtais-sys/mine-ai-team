// URL 학습 API — 브랜드/제품 사이트를 학습해서 응대에 활용
// POST { account, url } → 페이지 크롤 → Claude 요약 → Redis 저장
// DELETE { account, url } → 학습 항목 삭제
// GET { account } → 학습된 URL 목록
export const config = { maxDuration: 30 };

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_URLS_PER_ACCOUNT = 10;
const MAX_CONTENT_CHARS = 8000;

// HTML → 순수 텍스트 추출
function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

// 페이지 제목 추출
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim().slice(0, 100) : '';
}

// URL 유효성 체크
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

async function getKnowledge(account) {
  try {
    const raw = await redis.get(`channel:url-knowledge:${account}`);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
  } catch { return []; }
}

async function saveKnowledge(account, items) {
  await redis.set(`channel:url-knowledge:${account}`, JSON.stringify(items));
}

export default async function handler(req, res) {
  // GET: 학습된 URL 목록
  if (req.method === 'GET') {
    const { account } = req.query || {};
    if (!account) return res.status(400).json({ error: 'account required' });
    const items = await getKnowledge(account);
    return res.status(200).json(items);
  }

  // DELETE: URL 학습 삭제
  if (req.method === 'DELETE') {
    const { account, url } = req.body || {};
    if (!account || !url) return res.status(400).json({ error: 'account and url required' });
    const items = await getKnowledge(account);
    const filtered = items.filter(i => i.url !== url);
    await saveKnowledge(account, filtered);
    return res.status(200).json({ success: true, count: filtered.length });
  }

  // POST: URL 학습
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { account, url } = req.body || {};
  if (!account || !['yuminhye', 'millimilli'].includes(account)) {
    return res.status(400).json({ error: 'account must be yuminhye or millimilli' });
  }
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: '유효한 URL을 입력해주세요 (https://...)' });
  }

  // 최대 개수 체크
  const existing = await getKnowledge(account);
  const alreadyLearned = existing.find(i => i.url === url);

  // 1. URL 크롤
  let rawText = '';
  let title = '';
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MilliliBot/1.0; +https://mine-ai-team.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    rawText = extractText(html);
    title = extractTitle(html);
    if (!rawText || rawText.length < 100) throw new Error('페이지 내용을 읽을 수 없습니다');
  } catch (e) {
    return res.status(400).json({ error: `URL 접근 실패: ${e.message}` });
  }

  // 2. Claude로 요약 (브랜드/제품 지식 추출)
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
        max_tokens: 600,
        system: `당신은 ${accountName}의 SNS 응대 AI입니다.
주어진 웹페이지 내용에서 고객 응대에 유용한 정보만 추출해주세요.
- 제품명, 성분, 효능, 가격대, 용량, 사용법
- 브랜드 철학, 핵심 메시지
- 구매처, 판매 채널
- FAQ 또는 자주 묻는 내용
응답은 반드시 JSON만 반환. 마크다운 없이.
{
  "products": ["제품1 — 특징/성분/효능 요약", "제품2..."],
  "brand": "브랜드 핵심 메시지 1-2문장",
  "channels": "구매처 정보",
  "faq": ["자주묻는Q: 답변", ...],
  "keyFacts": ["기타 중요 사실 1", ...]
}`,
        messages: [{ role: 'user', content: `웹페이지 내용:\n${rawText}` }],
      }),
    });
    const data = await claudeRes.json();
    summary = data.content?.[0]?.text?.trim() || '';
    // JSON 파싱 시도
    try { JSON.parse(summary.replace(/```json\n?|```\n?/g, '')); }
    catch { summary = JSON.stringify({ keyFacts: [summary.slice(0, 500)] }); }
  } catch (e) {
    return res.status(500).json({ error: `Claude 요약 실패: ${e.message}` });
  }

  // 3. Redis 저장
  const newItem = { url, title: title || url, summary, learnedAt: new Date().toISOString() };
  let updated;
  if (alreadyLearned) {
    // 기존 항목 업데이트
    updated = existing.map(i => i.url === url ? newItem : i);
  } else {
    updated = [newItem, ...existing].slice(0, MAX_URLS_PER_ACCOUNT);
  }
  await saveKnowledge(account, updated);

  console.log(`[LearnURL][${account}] 학습 완료: ${url}`);
  return res.status(200).json({
    success: true,
    title: newItem.title,
    url,
    isUpdate: !!alreadyLearned,
    count: updated.length,
  });
}
