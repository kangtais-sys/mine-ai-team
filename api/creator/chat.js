import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';
const PROFILES = {
  yuminhye:      '69d08807986d57bb8f72f7e6',
  millimilli:    '69d08cc1986d57bb8f733102',
  millimilli_us: '69fbfcd01fc1fdb66f249aa8',
};
const YUMINHYE_ID = PROFILES.yuminhye;
const MILLIMILLI_ID = PROFILES.millimilli;
const MILLIMILLI_US_ID = PROFILES.millimilli_us;

const zFetch = (path, opts = {}) =>
  fetch(`${ZERNIO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  }).then(r => r.json());

// ─── Tool definitions ────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_account_status',
    description: '유민혜(@lala_lounge_, @peerstory, @15초유민혜)와 밀리밀리 계정들의 팔로워 수, 최근 게시물, 오늘 발행 현황을 조회한다.',
    input_schema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          enum: ['yuminhye', 'millimilli', 'all'],
          description: '조회할 프로필. 전체는 all.',
        },
      },
      required: ['profile'],
    },
  },
  {
    name: 'run_crosspost',
    description: '@lala_lounge_ 인스타그램의 최신 게시물을 @peerstory TikTok과 @15초유민혜 YouTube에 크로스포스팅한다. 실제로 발행이 실행된다.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'publish_post',
    description: '밀리밀리 KR 또는 US 계정에 직접 게시물을 발행한다.',
    input_schema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: '게시물 캡션 (해시태그 포함)' },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['tiktok', 'youtube', 'instagram'] },
          description: '발행할 플랫폼 목록',
        },
        profile: {
          type: 'string',
          enum: ['millimilli', 'millimilli_us'],
          description: 'KR은 millimilli, 미국 계정은 millimilli_us',
          default: 'millimilli',
        },
        mediaUrl: { type: 'string', description: '미디어 URL (선택)' },
      },
      required: ['caption', 'platforms'],
    },
  },
  {
    name: 'get_today_report',
    description: '오늘의 크리에이터 보고서를 가져온다. 발행 건수, 댓글 응대, 팔로워 변동 등 포함.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'generate_caption',
    description: '주어진 주제나 키워드로 플랫폼별 최적화된 캡션과 해시태그를 생성한다.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '콘텐츠 주제 또는 키워드' },
        platform: {
          type: 'string',
          enum: ['instagram', 'tiktok', 'youtube'],
          description: '대상 플랫폼',
        },
        account: {
          type: 'string',
          enum: ['lala_lounge_', 'peerstory', 'millimilli_kr', 'millimilli_us'],
          description: '어떤 계정용인지',
        },
        language: {
          type: 'string',
          enum: ['ko', 'en'],
          description: '캡션 언어. millimilli_us는 en.',
        },
      },
      required: ['topic', 'platform', 'account'],
    },
  },
  {
    name: 'get_recent_posts',
    description: '특정 프로필의 최근 게시물 목록을 가져온다.',
    input_schema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          enum: ['yuminhye', 'millimilli'],
          description: '조회할 프로필',
        },
        limit: { type: 'number', description: '가져올 게시물 수 (최대 10)', default: 5 },
      },
      required: ['profile'],
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────

async function executeTool(name, input) {
  const today = new Date().toISOString().slice(0, 10);

  if (name === 'get_account_status') {
    const profiles = input.profile === 'all'
      ? [YUMINHYE_ID, MILLIMILLI_ID, MILLIMILLI_US_ID]
      : input.profile === 'yuminhye' ? [YUMINHYE_ID]
      : input.profile === 'millimilli' ? [MILLIMILLI_ID, MILLIMILLI_US_ID]
      : [MILLIMILLI_ID];

    const results = await Promise.all(profiles.map(async (pid) => {
      const [accts, posts] = await Promise.all([
        zFetch(`/accounts?profileId=${pid}`),
        zFetch(`/posts?profileId=${pid}&limit=5`),
      ]);
      const accounts = (accts?.accounts || []).map(a => ({
        platform: a.platform,
        username: a.username,
        followers: a.metadata?.profileData?.followersCount || 0,
        isActive: a.isActive,
      }));
      const recentPosts = (posts?.posts || []).slice(0, 5).map(p => ({
        id: p._id,
        content: (p.content || p.text || '').slice(0, 80),
        platforms: p.platforms?.map(pl => pl.platform || pl) || [],
        status: p.platforms?.[0]?.status || 'unknown',
        createdAt: p.createdAt,
      }));
      return { profileId: pid, accounts, recentPosts };
    }));

    // Add Instagram from KV (scraped)
    const igKV = await redis.get('followers:yuminhye:instagram');
    if (igKV && input.profile !== 'millimilli') {
      const ymResult = results.find(r => r.profileId === YUMINHYE_ID);
      if (ymResult) {
        ymResult.accounts.unshift({
          platform: 'instagram',
          username: 'lala_lounge_',
          followers: igKV.count || 0,
          isActive: true,
        });
      }
    }

    const [publishLog, crosspostLog] = await Promise.all([
      redis.get(`publish-log:${today}`),
      redis.get(`creator-crosspost-log:${today}`),
    ]);

    return {
      ok: true,
      profiles: results,
      todayPublished: Array.isArray(publishLog) ? publishLog.length : 0,
      todayCrossposted: Array.isArray(crosspostLog) ? crosspostLog.length : 0,
    };
  }

  if (name === 'run_crosspost') {
    const kvKey = `creator-crosspost:lala:${today}`;
    const postsData = await zFetch(`/posts?profileId=${YUMINHYE_ID}&limit=10`);
    const posts = postsData?.posts || [];
    const processed = (await redis.get(kvKey)) || [];

    let triggered = 0;
    for (const post of posts) {
      const postId = post._id || post.id;
      if (!postId || processed.includes(postId)) continue;

      const platforms = (post.platforms || []).map(p => p.platform || p);
      const hasIG = platforms.includes('instagram');
      const hasTT = platforms.includes('tiktok');
      const hasYT = platforms.includes('youtube');
      if (!hasIG || (hasTT && hasYT)) continue;

      const target = [];
      if (!hasTT) target.push('tiktok');
      if (!hasYT) target.push('youtube');

      await zFetch('/posts', {
        method: 'POST',
        body: JSON.stringify({
          profileId: YUMINHYE_ID,
          text: post.content || post.text || '',
          platforms: target,
          mediaUrl: post.mediaItems?.[0]?.url || post.mediaUrl,
        }),
      });

      processed.push(postId);
      triggered++;
    }

    await redis.set(kvKey, processed, { ex: 86400 });
    return { ok: true, triggered, message: triggered > 0 ? `${triggered}개 게시물 크로스포스팅 실행됨` : '크로스포스팅할 새 게시물 없음 (이미 처리됨)' };
  }

  if (name === 'publish_post') {
    const profileId = input.profile === 'millimilli_us' ? MILLIMILLI_US_ID : MILLIMILLI_ID;
    const label = input.profile === 'millimilli_us' ? '밀리밀리US' : '밀리밀리KR';
    const result = await zFetch('/posts', {
      method: 'POST',
      body: JSON.stringify({
        profileId,
        text: input.caption,
        platforms: input.platforms,
        ...(input.mediaUrl && { mediaUrl: input.mediaUrl }),
      }),
    });
    if (result.error) return { ok: false, error: result.error || result.message };
    await redis.lpush('activity:log:v2', JSON.stringify({
      agent: 'creator',
      action: `${label} ${input.platforms.join('+')} 게시물 발행`,
      time: new Date().toISOString(),
    }));
    await redis.ltrim('activity:log:v2', 0, 49);
    return { ok: true, postId: result._id || result.id, message: `${input.platforms.join(', ')}에 발행 완료` };
  }

  if (name === 'get_today_report') {
    const [report, publishLog, inboxLog, crosspostLog] = await Promise.all([
      redis.get(`creator-report:${today}`),
      redis.get(`publish-log:${today}`),
      redis.get(`inbox-log:${today}`),
      redis.get(`creator-crosspost-log:${today}`),
    ]);

    const pLogs = Array.isArray(publishLog) ? publishLog : [];
    const iLogs = Array.isArray(inboxLog) ? inboxLog : [];
    const cpLogs = Array.isArray(crosspostLog) ? crosspostLog : [];

    return {
      ok: true,
      date: today,
      reportText: report?.report || null,
      publishCount: pLogs.length,
      commentReplied: iLogs.reduce((s, l) => s + (l.replied || 0), 0),
      dmReplied: iLogs.reduce((s, l) => s + (l.dmReplied || 0), 0),
      crosspostCount: cpLogs.length,
    };
  }

  if (name === 'generate_caption') {
    const isUS = input.account === 'millimilli_us';
    const lang = isUS ? 'en' : (input.language || 'ko');
    const platformInstructions = {
      tiktok: lang === 'en'
        ? 'Under 60 chars hook caption + 7 hashtags, TikTok style'
        : '60자 이내 후킹 캡션 + 해시태그 7개, TikTok 스타일',
      instagram: lang === 'en'
        ? 'Engaging caption + 15 relevant hashtags, Instagram style'
        : '감성적 캡션 + 해시태그 15개, 인스타그램 스타일',
      youtube: lang === 'en'
        ? 'SEO title (60 chars) + description (300 chars) + 10 tags'
        : 'SEO 제목(60자) + 설명(300자) + 태그 10개',
    };

    const prompt = lang === 'en'
      ? `Topic: "${input.topic}"\nAccount: @${input.account}\nPlatform: ${input.platform}\n\n${platformInstructions[input.platform]}\n\nOutput only the caption/title and hashtags, nothing else.`
      : `주제: "${input.topic}"\n계정: @${input.account}\n플랫폼: ${input.platform}\n\n${platformInstructions[input.platform]}\n\n결과만 출력 (설명 없이).`;

    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    return { ok: true, caption: r.content[0]?.text, platform: input.platform, account: input.account };
  }

  if (name === 'get_recent_posts') {
    const profileId = input.profile === 'yuminhye' ? YUMINHYE_ID : MILLIMILLI_ID;
    const limit = Math.min(input.limit || 5, 10);
    const data = await zFetch(`/posts?profileId=${profileId}&limit=${limit}`);
    const posts = (data?.posts || []).map(p => ({
      id: p._id,
      content: (p.content || p.text || '').slice(0, 120),
      platforms: (p.platforms || []).map(pl => ({
        platform: pl.platform || pl,
        status: pl.status || 'unknown',
      })),
      createdAt: p.createdAt,
      mediaType: p.mediaItems?.[0]?.type || null,
    }));
    return { ok: true, posts };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

// ─── Agentic loop ────────────────────────────────────────────

const SYSTEM = `너는 MINE AI의 AI 크리에이터야. 실제 도구를 사용해서 업무를 직접 실행할 수 있어.

[관리 계정 - 팔로워 현황]
유민혜
- Instagram @lala_lounge_ (31.8만) → TikTok @peerstory (4,091) + YouTube @15초유민혜 (2,360) 자동 크로스포스팅
밀리밀리 KR (millimilli 프로필)
- Instagram @millimilli.kr (14,251) / TikTok @millimilli.kr (3)
밀리밀리 US (millimilli_us 프로필)
- Instagram @millimilli.us (2,386)

[업무 원칙]
- 현황 보고 요청 → get_account_status 먼저 호출해서 실데이터 기반으로 답변
- 크로스포스팅 요청 → run_crosspost 실행
- 캡션 작성 → generate_caption 사용
- 오늘 실적 → get_today_report 호출
- 발행 요청 → publish_post 실행
- 데이터 없이 추측으로 답하지 말 것
- 실행 결과를 구체적으로 보고할 것
- 밀리밀리 US 캡션은 영어로`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages required' });

    let msgs = messages.map(m => ({ role: m.role, content: m.content }));

    // Agentic loop: max 5 tool rounds
    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM,
        tools: TOOLS,
        messages: msgs,
      });

      if (response.stop_reason === 'end_turn') {
        const text = response.content.find(b => b.type === 'text')?.text || '응답 없음';
        return res.status(200).json({ content: text });
      }

      if (response.stop_reason === 'tool_use') {
        // Add assistant message with tool_use blocks
        msgs.push({ role: 'assistant', content: response.content });

        // Execute all tool calls in parallel
        const toolResults = await Promise.all(
          response.content
            .filter(b => b.type === 'tool_use')
            .map(async (block) => {
              let result;
              try {
                result = await executeTool(block.name, block.input);
              } catch (e) {
                result = { ok: false, error: e.message };
              }
              return {
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              };
            })
        );

        msgs.push({ role: 'user', content: toolResults });
        continue;
      }

      // Unexpected stop reason
      break;
    }

    return res.status(200).json({ content: '처리 중 오류가 발생했습니다.' });
  } catch (error) {
    console.error('[Creator Chat]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
