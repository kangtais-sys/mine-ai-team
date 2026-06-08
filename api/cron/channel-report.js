import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 60 };

// ────────────────────────────────────────────────
// 응대 로그에서 주제별 통계 추출
// ────────────────────────────────────────────────
function categorizeReplies(logs) {
  const cats = { product: [], praise: [], complaint: [], general: [], dm: [] };

  logs.forEach(raw => {
    let log;
    try { log = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!log || !log.text) return;

    const t = (log.text || '').toLowerCase();
    const entry = { text: (log.text || '').slice(0, 50), reply: (log.reply || '').slice(0, 50) };

    if (log.type === 'dm') {
      cats.dm.push(entry);
    } else if ([
      // 재입고·출시 문의 (불만 키워드 '언제'보다 먼저 체크)
      '재입고', '입고', '출시', '언제 나', '언제 출', '언제 오', '언제 생',
      // 기존 제품문의
      '가격', '성분', '효능', '어디서', '구매', '살 수', '파는', '할인', '링크', '문의',
    ].some(k => t.includes(k))) {
      cats.product.push(entry);
    } else if (['감사', '좋아요', '최고', '최애', '사랑', '예뻐', '잘봤', '팔로', '대박', '짱'].some(k => t.includes(k))) {
      cats.praise.push(entry);
    } else if ([
      // 실제 불만 키워드만 (과도하게 넓은 '언제', '왜' 제거)
      '불만', '별로', '아쉽', '실망', '환불', '교환', '느려', '안와',
      '왜 안', '왜 이렇', '왜 아직', '불량', '파손', '잘못',
    ].some(k => t.includes(k))) {
      cats.complaint.push(entry);
    } else {
      cats.general.push(entry);
    }
  });

  return {
    product: cats.product.length,
    praise: cats.praise.length,
    complaint: cats.complaint.length,
    general: cats.general.length,
    dm: cats.dm.length,
    samples: {
      product: cats.product.slice(0, 2),
      complaint: cats.complaint.slice(0, 2),
    },
  };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const nowKST = new Date(Date.now() + 9 * 3600000);
    const today = nowKST.toISOString().slice(0, 10);

    // 1. 팔로워 & 자동응대 통계
    const [ymFollowers, mmFollowers, ymCC, mmCC, ymDC, mmDC, ymSettings, mmSettings] = await Promise.all([
      redis.get('followers:yuminhye:instagram'),
      redis.get('followers:millimilli:instagram'),
      redis.get('channel:auto:count:comment:yuminhye'),
      redis.get('channel:auto:count:comment:millimilli'),
      redis.get('channel:auto:count:dm:yuminhye'),
      redis.get('channel:auto:count:dm:millimilli'),
      redis.get('channel:settings:yuminhye'),
      redis.get('channel:settings:millimilli'),
    ]);

    // 2. 최근 게시물 avg comments
    const [ymPosts, mmPosts] = await Promise.all([
      redis.get('channel:posts:yuminhye'),
      redis.get('channel:posts:millimilli'),
    ]);

    const avgComments = (posts) => {
      if (!posts || posts.length === 0) return 0;
      const cutoff = new Date(nowKST - 7 * 86400000);
      const recent = posts.filter(p => new Date(p.timestamp) >= cutoff);
      if (recent.length === 0) return 0;
      return Math.round(recent.reduce((s, p) => s + (p.comments_count || 0), 0) / recent.length);
    };

    // 3. 최근 응대 로그 (최근 100개씩)
    const [ymCommentLogs, mmCommentLogs, ymDmLogs, mmDmLogs] = await Promise.all([
      redis.lrange('channel:auto:comment:logs:yuminhye', 0, 99),
      redis.lrange('channel:auto:comment:logs:millimilli', 0, 99),
      redis.lrange('channel:auto:dm:logs:yuminhye', 0, 49),
      redis.lrange('channel:auto:dm:logs:millimilli', 0, 49),
    ]);

    const ymCategories = categorizeReplies([...ymCommentLogs, ...ymDmLogs]);
    const mmCategories = categorizeReplies([...mmCommentLogs, ...mmDmLogs]);

    // 4. 긴급 승인 대기 큐
    const [ymQueue, mmQueue] = await Promise.all([
      redis.lrange('channel:approval:queue:yuminhye', 0, -1),
      redis.lrange('channel:approval:queue:millimilli', 0, -1),
    ]);

    const parseQueue = (raw) => {
      try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    };
    const ymPending = ymQueue.map(parseQueue).filter(i => i && i.status === 'pending').length;
    const mmPending = mmQueue.map(parseQueue).filter(i => i && i.status === 'pending').length;

    const summary = {
      date: today,
      yuminhye: {
        followers: ymFollowers?.count || 0,
        avgComments7d: avgComments(ymPosts),
        autoCommentTotal: ymCC || 0,
        autoDmTotal: ymDC || 0,
        autoCommentOn: ymSettings?.autoComment || false,
        autoDmOn: ymSettings?.autoDm || false,
        categories: ymCategories,
        urgentPending: ymPending,
      },
      millimilli: {
        followers: mmFollowers?.count || 0,
        avgComments7d: avgComments(mmPosts),
        autoCommentTotal: mmCC || 0,
        autoDmTotal: mmDC || 0,
        autoCommentOn: mmSettings?.autoComment || false,
        autoDmOn: mmSettings?.autoDm || false,
        categories: mmCategories,
        urgentPending: mmPending,
      },
      totalUrgent: ymPending + mmPending,
      updatedAt: new Date().toISOString(),
    };

    // 5. Claude 보고서 생성
    let report = '';
    if (process.env.ANTHROPIC_API_KEY) {
      const fmt = (n) => (n || 0).toLocaleString('ko-KR');
      const ym = summary.yuminhye;
      const mm = summary.millimilli;

      const promptLines = [
        `당신은 밀리밀리(MILLIMILLI) 브랜드의 AI 채널 매니저입니다. 담당은 댓글·DM 응대 운영입니다.`,
        `매일 아침 8시 채널 운영 보고서를 작성해주세요.`,
        `※ 콘텐츠 제작·기획(릴스/티저/카드뉴스/스토리 제작 등)은 크리에이터 담당이라 보고에 넣지 마세요. 오직 채널 응대·관리 운영만 다룹니다.`,
        ``,
        `[${today} 채널 현황]`,
        `■ 유민혜 계정 (@lala_lounge_)`,
        `- 팔로워: ${fmt(ym.followers)}명 | 최근7일 평균댓글: ${ym.avgComments7d}개`,
        `- 누적 자동댓글: ${fmt(ym.autoCommentTotal)}건 / 자동DM: ${fmt(ym.autoDmTotal)}건`,
        `- 자동댓글: ${ym.autoCommentOn ? 'ON' : 'OFF'} / 자동DM: ${ym.autoDmOn ? 'ON' : 'OFF'}`,
        `- 오늘 응대 주제: 제품문의 ${ym.categories.product}건 / 칭찬 ${ym.categories.praise}건 / 불만 ${ym.categories.complaint}건 / 일반 ${ym.categories.general}건 / DM ${ym.categories.dm}건`,
        ym.urgentPending > 0 ? `- ⚠ 긴급/승인 대기: ${ym.urgentPending}건` : '',
        ``,
        `■ 밀리밀리 계정 (@millimilli_official)`,
        `- 팔로워: ${fmt(mm.followers)}명 | 최근7일 평균댓글: ${mm.avgComments7d}개`,
        `- 누적 자동댓글: ${fmt(mm.autoCommentTotal)}건 / 자동DM: ${fmt(mm.autoDmTotal)}건`,
        `- 자동댓글: ${mm.autoCommentOn ? 'ON' : 'OFF'} / 자동DM: ${mm.autoDmOn ? 'ON' : 'OFF'}`,
        `- 오늘 응대 주제: 제품문의 ${mm.categories.product}건 / 칭찬 ${mm.categories.praise}건 / 불만 ${mm.categories.complaint}건 / 일반 ${mm.categories.general}건 / DM ${mm.categories.dm}건`,
        mm.urgentPending > 0 ? `- ⚠ 긴급/승인 대기: ${mm.urgentPending}건` : '',
        ``,
        `[보고서 작성 지시]`,
        `1. 오늘 채널 요약 한 줄 (이모지 포함)`,
        `2. 주요 응대 현황 (주제별 두드러진 패턴)`,
        `3. 긴급 승인 대기 안내 (있는 경우만)`,
        `4. 채널 응대 운영 개선 제안 2가지 — 응대 품질·속도, 미응대/긴급 처리, 자동댓글·DM 설정·톤, 반복 문의 대응 등 운영 관점만. (콘텐츠 제작·기획 제안 금지)`,
        ``,
        `간결하고 실무적으로, 총 200자 이내로 작성해주세요.`,
      ].filter(l => l !== '').join('\n');

      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            messages: [{ role: 'user', content: promptLines }],
          }),
        });
        const data = await claudeRes.json();
        report = data.content?.[0]?.text || '';
      } catch (e) {
        console.error('[Channel Report] Claude error:', e.message);
      }
    }

    const result = { report, summary, date: today, updatedAt: new Date().toISOString() };
    await redis.set('channel:daily-report', JSON.stringify(result), { ex: 86400 * 2 });

    console.log('[Channel Report] Generated for', today, '| urgent:', summary.totalUrgent);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Channel Report] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
