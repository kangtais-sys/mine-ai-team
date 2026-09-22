// 페르소나 — AI 인플루언서 계정의 정체(얼굴·목소리·말투·채널).
//
// 트랙 B. 소재 무한 생성(트랙 A)이 먼저지만, 같은 골격을 쓰기 때문에
// 처음부터 자리를 만들어 둔다 — 나중에 끼워 넣으면 구조가 틀어진다.
//
// ⚠️ 원칙 두 가지. 코드가 아니라 운영 규칙이지만 여기 적어둔다.
//   1) 페르소나는 **브랜드 진행자**다. 실제 사용자인 척 증언하지 않는다.
//      증거가 필요한 자리에는 실제 후기 스크린샷을 쓴다(CLAUDE.md 규칙).
//   2) AI 연출 표기를 붙인다. disclosure 필드가 비면 운영중으로 못 올린다.
//
// GET / POST / PATCH?id= / DELETE?id=

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'content:personas:v1';
export const STAGES = ['기획', '얼굴·목소리 고정', '계정 개설', '워밍업', '운영중', '중단'];

const load = async () => {
  try { const v = await redis.get(KEY); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const save = (list) => redis.set(KEY, list);

export default async function handler(req, res) {
  try {
    const list = await load();
    const id = req.query?.id;

    if (req.method === 'GET') {
      const counts = Object.fromEntries(STAGES.map(s => [s, list.filter(x => x.stage === s).length]));
      return res.status(200).json({ personas: list, counts, total: list.length, stages: STAGES });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name) return res.status(400).json({ error: 'name 필요' });
      const item = {
        id: b.id || `P-${Date.now().toString(36).slice(-5).toUpperCase()}`,
        name: b.name,
        handle: b.handle || '',
        market: b.market === 'kr' ? 'kr' : 'us',
        look: b.look || '',            // 외형 설명 — Higgsfield character 고정용
        voice: b.voice || '',          // 목소리 설명 / voice id
        tone: b.tone || '',            // 말투
        channels: Array.isArray(b.channels) ? b.channels : [],
        disclosure: b.disclosure || '', // AI 연출 표기 문구
        characterId: b.characterId || null,  // Higgsfield show_characters 의 id
        voiceId: b.voiceId || null,
        stage: '기획',
        note: b.note || '',
        createdAt: new Date().toISOString().slice(0, 10),
      };
      const next = [item, ...list];
      await save(next);
      return res.status(200).json({ ok: true, item });
    }

    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const patch = req.body || {};
      if (patch.stage && !STAGES.includes(patch.stage)) {
        return res.status(400).json({ error: `stage 는 ${STAGES.join('/')} 중 하나` });
      }
      const cur = list.find(x => x.id === id);
      // AI 표기 없이 운영중으로 못 올린다. 규칙을 화면 밖에서도 막는다.
      if (patch.stage === '운영중' && !(patch.disclosure || cur?.disclosure)) {
        return res.status(400).json({ error: 'AI 연출 표기(disclosure)가 있어야 운영중으로 올릴 수 있습니다' });
      }
      const next = list.map(x => (x.id === id ? { ...x, ...patch, id } : x));
      await save(next);
      return res.status(200).json({ ok: true, item: next.find(x => x.id === id) });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id 필요' });
      await save(list.filter(x => x.id !== id));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'GET/POST/PATCH/DELETE only' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
