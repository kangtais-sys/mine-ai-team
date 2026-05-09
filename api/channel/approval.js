// 긴급/승인 큐 — 자동응대 대신 보류된 댓글/DM 관리
// GET /api/channel/approval?account=yuminhye  → 계정별 큐 목록
// POST { type: 'approve', id, account, reply } → 답장 발송
// POST { type: 'reject', id, account }         → 거부(삭제)
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path, opts = {}) =>
  fetch(`${ZERNIO}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  }).then(r => r.json());

function parseItems(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map(item => {
    try { return typeof item === 'string' ? JSON.parse(item) : item; }
    catch { return null; }
  }).filter(Boolean);
}

async function getQueue(account) {
  const raw = await redis.lrange(`channel:approval:queue:${account}`, 0, 49);
  return parseItems(raw);
}

async function removeFromQueue(account, id) {
  const items = await getQueue(account);
  const filtered = items.filter(i => i.id !== id);
  await redis.del(`channel:approval:queue:${account}`);
  if (filtered.length > 0) {
    for (const item of [...filtered].reverse()) {
      await redis.lpush(`channel:approval:queue:${account}`, JSON.stringify(item));
    }
  }
}

async function logAction(type, account, data) {
  const logKey = `channel:auto:${type}:logs:${account}`;
  const countKey = `channel:auto:count:${type}:${account}`;
  try {
    await Promise.all([
      redis.lpush(logKey, JSON.stringify({ ...data, timestamp: new Date().toISOString() })),
      redis.ltrim(logKey, 0, 199),
      redis.incr(countKey),
    ]);
  } catch {}
}

export default async function handler(req, res) {
  // GET: 계정별 승인 대기 목록
  if (req.method === 'GET') {
    const { account } = req.query || {};
    if (account) {
      const items = await getQueue(account);
      return res.status(200).json(items);
    }
    const [ym, mm] = await Promise.all([getQueue('yuminhye'), getQueue('millimilli')]);
    return res.status(200).json({ yuminhye: ym, millimilli: mm });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, id, account, reply } = req.body || {};
  if (!account || !id) return res.status(400).json({ error: 'account and id required' });

  const items = await getQueue(account);
  const item = items.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found in queue' });

  // ── 승인: 실제 발송 ──
  if (type === 'approve') {
    const finalReply = (reply || '').trim() || item.suggestedReply;
    if (!finalReply) return res.status(400).json({ error: 'reply text required' });

    let zResult = {};
    try {
      if (item.type === 'comment') {
        zResult = await zFetch(`/inbox/comments/${item.itemId}/reply`, {
          method: 'POST',
          body: JSON.stringify({ text: finalReply }),
        });
      } else {
        zResult = await zFetch(`/inbox/messages/${item.itemId}/reply`, {
          method: 'POST',
          body: JSON.stringify({ text: finalReply }),
        });
      }
    } catch (e) {
      return res.status(500).json({ error: `Zernio API 오류: ${e.message}` });
    }

    const success = !zResult.error;
    await removeFromQueue(account, id);
    await logAction(item.type, account, {
      ...item,
      reply: finalReply,
      success,
      approvedManually: true,
    });

    console.log(`[Approval][${account}] 승인 발송: "${finalReply.slice(0, 40)}"`);
    return res.status(200).json({ success, zernioResponse: zResult });
  }

  // ── 거부: 큐에서 삭제 ──
  if (type === 'reject') {
    await removeFromQueue(account, id);
    console.log(`[Approval][${account}] 거부: ${id}`);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid type' });
}
