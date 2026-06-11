import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 기본값 — 인스타 밴 방지 기준치
// 계정 규모별: 소형(<1만) 50/20, 중형(1만~10만) 100/50, 대형(10만+) 200/80
const DEFAULT = {
  autoComment: false,
  autoDm: false,
  // 활성 시간대 (KST, 24h)
  activeHoursStart: 9,   // 오전 9시
  activeHoursEnd: 23,    // 오후 11시
  // 일일 최대 건수
  commentDailyLimit: 100,
  dmDailyLimit: 50,
  // 최소 응대 간격 (분)
  commentCooldownMin: 1,
  dmCooldownMin: 2,
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [ym, mm, mmUs] = await Promise.all([
      redis.get('channel:settings:yuminhye'),
      redis.get('channel:settings:millimilli'),
      redis.get('channel:settings:millimilli_us'),
    ]);
    return res.status(200).json({
      yuminhye: { ...DEFAULT, ...(ym || {}) },
      millimilli: { ...DEFAULT, ...(mm || {}) },
      millimilli_us: { ...DEFAULT, ...(mmUs || {}) },
    });
  }

  if (req.method === 'POST') {
    const {
      account, autoComment, autoDm,
      activeHoursStart, activeHoursEnd,
      commentDailyLimit, dmDailyLimit,
      commentCooldownMin, dmCooldownMin,
    } = req.body || {};
    if (!account) return res.status(400).json({ error: 'account required' });

    const key = `channel:settings:${account}`;
    const existing = (await redis.get(key)) || {};
    const updated = { ...DEFAULT, ...existing };

    if (autoComment !== undefined) updated.autoComment = Boolean(autoComment);
    if (autoDm !== undefined) updated.autoDm = Boolean(autoDm);
    if (activeHoursStart !== undefined) updated.activeHoursStart = Number(activeHoursStart);
    if (activeHoursEnd !== undefined) updated.activeHoursEnd = Number(activeHoursEnd);
    if (commentDailyLimit !== undefined) updated.commentDailyLimit = Math.min(300, Math.max(1, Number(commentDailyLimit)));
    if (dmDailyLimit !== undefined) updated.dmDailyLimit = Math.min(150, Math.max(1, Number(dmDailyLimit)));
    if (commentCooldownMin !== undefined) updated.commentCooldownMin = Math.max(1, Number(commentCooldownMin));
    if (dmCooldownMin !== undefined) updated.dmCooldownMin = Math.max(1, Number(dmCooldownMin));

    await redis.set(key, updated);
    return res.status(200).json({ success: true, settings: updated });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
