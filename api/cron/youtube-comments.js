import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

// 채널 설정: @15초유민혜 + @유민혜-z2r (밀리밀리)
const CHANNELS = [
  {
    handle: '@15초유민혜',
    persona: 'yuminhye',
    prompt: `당신은 유민혜 유튜브 크리에이터입니다.
영상 봐줘서 진심으로 감사한 마음으로 따뜻하게 댓글 답글을 달아요.
시청자와 소통하는 느낌으로 자연스럽게.
제품 관련 문의는 @millimilli.official 안내.
2문장 이내, 친근하게, 이모지 1-2개.
가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.`,
  },
  {
    handle: '@유민혜-z2r',
    persona: 'millimilli',
    prompt: `당신은 밀리밀리 유튜브 채널 담당자입니다.
500달톤 초저분자 단백질 화장품 브랜드.
영상 내용에 공감하며 따뜻하게 답글.
제품 문의 → 자사몰 또는 카카오채널 @밀리밀리.
2문장 이내, 이모지 1-2개.
가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.`,
  },
];

const SPAM = ['팔로우', '맞팔', 'follow', 'http://', 'https://', '홍보', 'dm주세요', '선팔', 'subscribe'];

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

async function ensureFreshToken(auth) {
  if (auth.credentials?.expiry_date && auth.credentials.expiry_date < Date.now() + 60000) {
    console.log('[YT-COMMENTS] Token expiring, refreshing...');
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
    console.log('[YT-COMMENTS] Token refreshed');
  }
}

async function resolveChannelId(youtube, handle) {
  const cacheKey = `yt:channelId:${handle}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const res = await youtube.channels.list({
    part: ['id'],
    forHandle: handle.replace('@', ''),
  });

  const channelId = res.data.items?.[0]?.id;
  if (channelId) {
    await redis.set(cacheKey, channelId, { ex: 86400 * 7 }); // 7일 캐시
    console.log(`[YT-COMMENTS] 채널 ${handle} → ${channelId}`);
  }
  return channelId;
}

async function getRecentVideos(youtube, channelId) {
  const res = await youtube.search.list({
    part: ['id'],
    channelId,
    type: ['video'],
    order: 'date',
    maxResults: 10,
  });
  return (res.data.items || []).map(item => item.id.videoId).filter(Boolean);
}

async function getNewComments(youtube, videoId, since) {
  const comments = [];
  let pageToken;

  do {
    const res = await youtube.commentThreads.list({
      part: ['snippet'],
      videoId,
      order: 'time',
      maxResults: 50,
      pageToken,
    });

    for (const item of res.data.items || []) {
      const snippet = item.snippet.topLevelComment.snippet;
      const publishedAt = new Date(snippet.publishedAt);

      if (publishedAt < since) {
        return comments; // 시간순 정렬이므로 이전 댓글 나오면 중단
      }

      comments.push({
        commentId: item.snippet.topLevelComment.id,
        text: snippet.textDisplay,
        author: snippet.authorDisplayName,
        authorChannelId: snippet.authorChannelId?.value,
        publishedAt: snippet.publishedAt,
        videoId,
      });
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return comments;
}

async function generateReply(text, systemPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: `댓글: "${text}"` }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

async function postReply(youtube, parentId, text) {
  const res = await youtube.comments.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        parentId,
        textOriginal: text,
      },
    },
  });
  return res.data.id;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.GOOGLE_REFRESH_TOKEN || !process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google OAuth 환경변수 누락' });
  }

  const auth = getAuth();
  const youtube = google.youtube({ version: 'v3', auth });
  const since = new Date(Date.now() - 30 * 60 * 1000); // 최근 30분

  const results = { channels: 0, videos: 0, newComments: 0, replied: 0, skipped: 0, errors: 0 };

  try {
    await ensureFreshToken(auth);

    for (const channel of CHANNELS) {
      try {
        const channelId = await resolveChannelId(youtube, channel.handle);
        if (!channelId) {
          console.error(`[YT-COMMENTS] 채널 못 찾음: ${channel.handle}`);
          results.errors++;
          continue;
        }
        results.channels++;

        const videoIds = await getRecentVideos(youtube, channelId);
        console.log(`[YT-COMMENTS] ${channel.handle} 영상 수: ${videoIds.length}`);
        results.videos += videoIds.length;

        for (const videoId of videoIds) {
          try {
            const comments = await getNewComments(youtube, videoId, since);

            for (const comment of comments) {
              try {
                // 중복 체크
                const dupeKey = `yt:replied:${comment.commentId}`;
                if (await redis.get(dupeKey)) {
                  results.skipped++;
                  continue;
                }

                // 자기 채널 댓글 스킵
                if (comment.authorChannelId === channelId) {
                  results.skipped++;
                  continue;
                }

                // 스팸 필터
                if (SPAM.some(k => comment.text.toLowerCase().includes(k))) {
                  await redis.set(dupeKey, 'spam', { ex: 86400 });
                  results.skipped++;
                  continue;
                }

                console.log(`[YT-COMMENTS] 새 댓글: ${comment.commentId} @${comment.author} "${comment.text.substring(0, 40)}"`);

                // Claude 답글 생성
                const reply = await generateReply(comment.text, channel.prompt);
                if (!reply || reply === 'SKIP') {
                  await redis.set(dupeKey, 'skip', { ex: 86400 });
                  results.skipped++;
                  continue;
                }

                // YouTube에 답글 달기
                const replyId = await postReply(youtube, comment.commentId, reply);
                await redis.set(dupeKey, replyId, { ex: 86400 * 7 }); // 7일 보관

                console.log(`[YT-COMMENTS] 답글 달성: ${comment.commentId} → "${reply.substring(0, 40)}" (${replyId})`);
                results.replied++;
              } catch (commentError) {
                console.error(`[YT-COMMENTS] 댓글 처리 에러 (${comment.commentId}):`, commentError.message);
                results.errors++;
              }
            }

            results.newComments += comments.length;
          } catch (videoError) {
            console.error(`[YT-COMMENTS] 영상 에러 (${videoId}):`, videoError.message);
            results.errors++;
          }
        }
      } catch (channelError) {
        console.error(`[YT-COMMENTS] 채널 에러 (${channel.handle}):`, channelError.message);
        results.errors++;
      }
    }

    console.log(`[YT-COMMENTS] 완료: channels=${results.channels}, videos=${results.videos}, new=${results.newComments}, replied=${results.replied}, skipped=${results.skipped}, errors=${results.errors}`);

    // KV 로그
    const today = new Date().toISOString().slice(0, 10);
    await redis.lpush(`yt-comments-log:${today}`, JSON.stringify({
      ...results,
      timestamp: new Date().toISOString(),
    }));

    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    console.error('[YT-COMMENTS] Fatal:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
