import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const DEFAULT_PERSONAS = {
  yuminhye: {
    name: '유민혜',
    handles: ['@lala_lounge_', '@yuminhye'],
    character: '친근한 언니 느낌, 진솔하고 따뜻함, 감성적',
    tone: '반말 위주 친근체, 이모티콘 자주 사용, 솔직한 소통, 팔로워에게 친구처럼',
    topics: ['스킨케어', 'K뷰티', '일상', '해외생활', '뷰티팁'],
    commentStyle: '활발하고 긍정적, 팔로워 닉네임 부르기, 공감과 리액션 먼저',
    dmStyle: '개인적이고 진심 어린 답변, 팔로워를 소중히 여기는 느낌, 정성껏 길게',
    dmGreeting: '안녕! 반가워요 😊',
    forbid: ['반말 욕설', '정치 발언', '타 브랜드 비교 비하', '가격 할인 약속'],
  },
  millimilli: {
    name: '밀리밀리',
    handles: ['@millimilli_official'],
    character: '브랜드 계정, 전문적이되 친근함, 뷰티 전문가 느낌',
    tone: '존댓말 기본, 브랜드 일관성 유지, 제품 정보 정확하게, 따뜻한 고객 응대',
    topics: ['밀리밀리 제품', '스킨케어 루틴', '성분 정보', '올리브영 입점'],
    commentStyle: '감사 표현 적극적, 제품 관련 질문 상세히 답변, 해시태그 활용',
    dmStyle: '제품 문의 정확하고 빠르게, 구매 링크/판매처 안내, 브랜드 이미지 유지',
    dmGreeting: '안녕하세요! 밀리밀리입니다 😊',
    forbid: ['경쟁사 언급', '미확인 효능 주장', '재고 확약', '개인정보 수집'],
  },
};

// Rules stored as JSON array at channel:rules key
async function getRules() {
  const raw = await redis.get('channel:rules');
  if (!raw) return [];
  try { return Array.isArray(raw) ? raw : JSON.parse(raw); }
  catch { return []; }
}

async function saveRules(rules) {
  await redis.set('channel:rules', JSON.stringify(rules));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default async function handler(req, res) {
  // GET: return persona + rules + url knowledge
  if (req.method === 'GET') {
    const [ymRaw, mmRaw, rules, ymUrls, mmUrls] = await Promise.all([
      redis.get('channel:persona:yuminhye'),
      redis.get('channel:persona:millimilli'),
      getRules(),
      redis.get('channel:url-knowledge:yuminhye').then(r => {
        if (!r) return [];
        try { return Array.isArray(r) ? r : JSON.parse(r); } catch { return []; }
      }).catch(() => []),
      redis.get('channel:url-knowledge:millimilli').then(r => {
        if (!r) return [];
        try { return Array.isArray(r) ? r : JSON.parse(r); } catch { return []; }
      }).catch(() => []),
    ]);

    return res.status(200).json({
      yuminhye: { ...DEFAULT_PERSONAS.yuminhye, ...(ymRaw || {}), urlKnowledge: ymUrls },
      millimilli: { ...DEFAULT_PERSONAS.millimilli, ...(mmRaw || {}), urlKnowledge: mmUrls },
      rules,
    });
  }

  if (req.method === 'POST') {
    const { type, account, data } = req.body || {};

    // Add a new rule
    if (type === 'rule') {
      const rules = await getRules();
      const newRule = {
        id: genId(),
        text: typeof data === 'string' ? data : data?.text,
        account: account || 'all',
        enabled: true,
        addedAt: new Date().toISOString(),
      };
      rules.unshift(newRule);
      if (rules.length > 30) rules.splice(30);
      await saveRules(rules);
      return res.status(200).json({ success: true, rule: newRule });
    }

    // Toggle rule enabled/disabled
    if (type === 'toggle_rule') {
      const { id } = data || {};
      const rules = await getRules();
      const idx = rules.findIndex(r => r.id === id);
      if (idx !== -1) rules[idx].enabled = !rules[idx].enabled;
      await saveRules(rules);
      return res.status(200).json({ success: true, rules });
    }

    // Delete a rule by ID
    if (type === 'delete_rule') {
      const { id, clearAll } = data || {};
      if (clearAll) {
        await saveRules([]);
      } else {
        const rules = await getRules();
        const filtered = rules.filter(r => r.id !== id);
        await saveRules(filtered);
      }
      return res.status(200).json({ success: true });
    }

    // Update persona base data
    if (type === 'persona') {
      const key = `channel:persona:${account}`;
      const existing = (await redis.get(key)) || {};
      await redis.set(key, { ...existing, ...data });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid type' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
