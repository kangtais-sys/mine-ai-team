import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path) =>
  fetch(`${ZERNIO}${path}`, {
    headers: { Authorization: `Bearer ${process.env.ZERNIO_API_KEY}` },
  }).then(r => r.ok ? r.json() : null).catch(() => null);

const PROFILES = {
  yuminhye: {
    label: '유민혜',
    id: process.env.ZERNIO_YUMINHYE_PROFILE_ID || '69d08807986d57bb8f72f7e6',
    channels: ['@lala_lounge_ (IG)', '@peerstory (TT)', '@15초유민혜 (YT)'],
  },
  millimilli: {
    label: '밀리밀리',
    id: process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '69d08cc1986d57bb8f733102',
    channels: ['@millimilli.kr (IG/TT)', '@millimilli.us (IG/TT)'],
  },
};

async function getYouTubeStats() {
  try {
    const { getGoogleRefreshToken } = await import('../utils/google-auth.js');
    const refreshToken = await getGoogleRefreshToken();
    if (!refreshToken) return null;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const { access_token } = await r.json();
    if (!access_token) return null;

    const statsRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const data = await statsRes.json();
    return data?.items?.[0]?.statistics || null;
  } catch {
    return null;
  }
}

// vercel.json cron: '0 23 * * *' = KST 08:00
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  try {
    const profileData = {};
    for (const [key, profile] of Object.entries(PROFILES)) {
      const [stats, posts] = await Promise.all([
        zFetch(`/profiles/${profile.id}`),
        zFetch(`/posts?profileId=${profile.id}&limit=20`),
      ]);
      const postList = posts?.posts || posts || [];
      const sevenDays = new Date(Date.now() - 7 * 86400000);
      const recentPosts = Array.isArray(postList)
        ? postList.filter(p => new Date(p.createdAt || p.publishedAt || 0) > sevenDays)
        : [];
      const avgComments = recentPosts.length
        ? Math.round(recentPosts.reduce((s, p) => s + (p.comments || 0), 0) / recentPosts.length)
        : 0;
      const todayPost = recentPosts.find(p => (p.createdAt || '').startsWith(today));

      profileData[key] = {
        label: profile.label,
        channels: profile.channels,
        followers: stats?.followers || stats?.followerCount || null,
        recentPostCount: recentPosts.length,
        avgComments,
        hasPostToday: !!todayPost,
      };
    }

    // YouTube
    const ytStats = await getYouTubeStats();
    const ytSubscribers = ytStats?.subscriberCount || null;

    // Prev day followers for delta
    const prevReport = await redis.get(`creator-report:${yesterday}`);
    const prevYuminhye = prevReport?.profiles?.yuminhye?.followers;
    const prevMilli = prevReport?.profiles?.millimilli?.followers;

    const delta = (curr, prev) => {
      if (!curr || !prev) return '';
      const d = curr - prev;
      return d >= 0 ? `(+${d})` : `(${d})`;
    };

    const summaryRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `오늘(${today}) AI 크리에이터 보고서를 작성해줘.

[유민혜]
- 팔로워: ${profileData.yuminhye.followers || '조회불가'} ${delta(profileData.yuminhye.followers, prevYuminhye)}
- 최근 7일 게시물: ${profileData.yuminhye.recentPostCount}개 | 평균 댓글: ${profileData.yuminhye.avgComments}개
- 오늘 게시 여부: ${profileData.yuminhye.hasPostToday ? '✅ 발행됨' : '❌ 미발행'}
- 채널: ${profileData.yuminhye.channels.join(', ')}
- YouTube 구독자: ${ytSubscribers || '조회불가'}

[밀리밀리]
- 팔로워: ${profileData.millimilli.followers || '조회불가'} ${delta(profileData.millimilli.followers, prevMilli)}
- 최근 7일 게시물: ${profileData.millimilli.recentPostCount}개 | 평균 댓글: ${profileData.millimilli.avgComments}개
- 오늘 게시 여부: ${profileData.millimilli.hasPostToday ? '✅ 발행됨' : '❌ 미발행'}
- 채널: ${profileData.millimilli.channels.join(', ')}

형식:
📊 AI 크리에이터 보고 (${today})
━━━━━━━━━━━━━━━━━━━━
[유민혜] ...
[밀리밀리] ...
💡 인사이트 1~2줄
━━━━━━━━━━━━━━━━━━━━`,
      }],
    });

    const report = summaryRes.content[0]?.text;
    const payload = {
      report,
      profiles: profileData,
      ytSubscribers,
      generatedAt: new Date().toISOString(),
    };

    await redis.set(`creator-report:${today}`, payload, { ex: 86400 * 7 });

    if (process.env.SLACK_WEBHOOK_URL) {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: report }),
      }).catch(() => {});
    }

    return res.status(200).json({ success: true, report });
  } catch (error) {
    console.error('[Creator Report]', error.message);
    return res.status(500).json({ error: error.message });
  }
}
