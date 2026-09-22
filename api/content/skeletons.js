// 골격 라이브러리 — 터진 영상/이미지에서 뽑아낸 **구조**만 모아둔다.
//
// 왜 이게 자산인가: 매번 새로 기획하면 매번 처음부터다. 골격은 한 번 해부하면 영원히 쓴다.
//   골격 10 × 앵글 6 × 훅 13 = 780 조합. '무한 생성'의 실체는 이 곱셈이다.
//
// 골격은 **구조**지 내용이 아니다. 컷 타이밍·카메라·자막 위치·BGM 타입·엔드카드 구조만 담는다.
// 얼굴·제품·워딩은 이식 단계에서 우리 것으로 갈아끼운다.
//
// GET    /api/content/skeletons            목록
// POST   /api/content/skeletons            추가 (body = 골격 1건)
// PATCH  /api/content/skeletons?id=...     수정 (상태 변경 등)
// DELETE /api/content/skeletons?id=...     삭제
//
// 쓰기에는 CRON_SECRET 또는 x-admin 헤더가 필요 없다 — 무인증 공개 앱이라
// 대시보드에서 바로 편집한다(2026-06-20 로그인 제거 결정에 맞춤).

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'content:skeletons:v1';

// 씨앗 — MINE 이 공유한 스레드 사례에서 관찰한 구조.
// 아직 우리가 돌려본 적 없으므로 전부 status:'후보'. 검증된 척하지 않는다.
const SEED = [
  {
    id: 'SK-POD-01',
    name: '팟캐스트 폭로형',
    kind: 'video',
    source: 'Threads @ocho.create 공유 (미국 AI 인플루언서 계정군)',
    sourceNote: '5.7M / 602K / 556K 조회 클립 다수. 같은 골격 반복.',
    beats: [
      { at: '0~1.8초', what: '팟캐스트 세팅 2샷 · 듣는 쪽이 놀라는 리액션 · 화면 상단 텍스트 1줄' },
      { at: '1.8~7초', what: '말하는 쪽 클로즈업 3컷 · 자막 대문자 강조 · "Listen carefully..." 고정 문구' },
      { at: '7~11초', what: '증거 구간 — 분할 화면 또는 제품 인서트' },
      { at: '11~13초', what: '제품 단독 + CTA' },
    ],
    captionPattern: 'The {나라} secret to {결과} is finally OUT',
    bgm: '대화형 앰비언트 · 비트 없음',
    ratio: '9:16',
    status: '후보',
    fits: ['AUT', 'ING', 'GLA'],
    createdAt: '2026-09-22',
  },
  {
    id: 'SK-REC-01',
    name: '리크리에이트 스트럭쳐',
    kind: 'video',
    source: 'Threads @ai_creator_nomad 5단계',
    sourceNote: '뼈대는 그대로 두고 모델·제품만 교체하는 방식 자체를 골격으로 등록.',
    beats: [
      { at: '0~1.5초', what: '원본 훅 구도 그대로 · 인물만 교체' },
      { at: '1.5~8초', what: '원본 컷 타이밍 유지 · 제품 교체 · 자막 재작성' },
      { at: '8~끝', what: '원본 엔드카드 구조 유지 · 우리 CTA' },
    ],
    captionPattern: '(원본 자막 구조 유지 · 6문법으로 재작성)',
    bgm: '원본과 같은 계열',
    ratio: '9:16',
    status: '후보',
    fits: ['BA', 'GLA', 'CLI', 'ING', 'AUT', 'PRO'],
    createdAt: '2026-09-22',
  },
];

const load = async () => {
  try {
    const v = await redis.get(KEY);
    if (Array.isArray(v) && v.length) return v;
  } catch { /* 없으면 씨앗 */ }
  return SEED;
};
const save = (list) => redis.set(KEY, list);

export default async function handler(req, res) {
  try {
    const list = await load();
    const id = req.query?.id;

    if (req.method === 'GET') {
      return res.status(200).json({ skeletons: list, count: list.length });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name) return res.status(400).json({ error: 'name 필요' });
      const item = {
        id: b.id || `SK-${String(b.kind || 'VID').slice(0, 3).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        name: b.name,
        kind: b.kind === 'image' ? 'image' : 'video',
        source: b.source || '',
        sourceNote: b.sourceNote || '',
        beats: Array.isArray(b.beats) ? b.beats : [],
        captionPattern: b.captionPattern || '',
        bgm: b.bgm || '',
        ratio: b.ratio || '9:16',
        // 새 골격은 항상 '후보'. 우리 성과로 합격해야 '검증'이 된다.
        status: '후보',
        fits: Array.isArray(b.fits) ? b.fits : [],
        createdAt: new Date().toISOString().slice(0, 10),
      };
      const next = [item, ...list];
      await save(next);
      return res.status(200).json({ ok: true, item, count: next.length });
    }

    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const next = list.map(x => (x.id === id ? { ...x, ...(req.body || {}), id } : x));
      await save(next);
      return res.status(200).json({ ok: true, item: next.find(x => x.id === id) });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const next = list.filter(x => x.id !== id);
      await save(next);
      return res.status(200).json({ ok: true, count: next.length });
    }

    return res.status(405).json({ error: 'GET/POST/PATCH/DELETE only' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
