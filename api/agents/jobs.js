// 에이전트 작업 큐 — Astra(Codex)가 오케스트레이션하고 Claude·Codex·Aside 가 집어가는 공용 버스.
// docs/agent-roster.md
//
// 왜 필요한가: Claude·Codex·Aside 는 각각 별개 프로세스라 서로를 직접 호출할 수 없다.
//   유일하게 셋 다 닿을 수 있는 지점이 이 앱의 HTTP API 다. 그래서 앱이 버스가 된다.
//   (파일 드롭으로 붙이면 맥이 꺼져 있을 때 끊기고, 누가 언제 집었는지 추적이 안 된다.)
//
// 인증: Authorization: Bearer ${CRON_SECRET}  — 모든 메서드.
//
// POST /api/agents/jobs?action=create   { type, role, payload, priority? }  → 작업 생성
// POST /api/agents/jobs?action=claim    { role, worker }                    → 원자적 점유(1건)
// POST /api/agents/jobs?action=complete { id, result }                      → 완료
// POST /api/agents/jobs?action=fail     { id, error, requeue? }             → 실패(재시도 가능)
// POST /api/agents/jobs?action=reap     {}                                  → 리스 만료분 회수
// GET  /api/agents/jobs?role=&status=&limit=                                → 조회
//
// 원자성: 역할별 Redis 리스트에서 RPOP 으로 꺼낸다(원자적). 본문은 별도 해시.
//   두 워커가 같은 작업을 집는 경합이 구조적으로 불가능하다.

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const JOBS = 'agents:jobs:v1';                 // hash: id → job
const queueKey = (role) => `agents:queue:v1:${role}`;
const CLAIMED = 'agents:claimed:v1';           // set 대용 hash: id → leaseUntil(ISO)
const LEASE_MS = 30 * 60 * 1000;               // 30분 — 브라우저 수집은 오래 걸린다

// 역할 = 누가 할 수 있는 일인가. 워커는 자기 역할의 큐만 집는다.
export const ROLES = {
  browser: '브라우저 관찰·수집 (Aside / Codex) — 틱톡·인스타·메타 라이브러리',
  code: '코드·파이프라인·판정 (Claude)',
  generate: '소재 생성 (Higgsfield 경유)',
  judge: '검수·QA 게이트',
};

export const TYPES = {
  'trend.observe': '플랫폼에서 위너 영상을 관찰하고 구조를 받아적는다',
  'hook.card': '관찰 결과를 훅 카드로 정규화해 라이브러리에 적재',
  'creative.brief': '훅 카드 → 소재 블루프린트(4비트·캡션·컴플라이언스)',
  'creative.make': '블루프린트 → 실제 소재 생성',
  'qa.gate': 'QA 체크리스트 판정',
};

const nowIso = () => new Date().toISOString();
const auth = (req) => req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });

  // ─── 조회 ───
  if (req.method === 'GET') {
    const q = req.query || {};
    const all = Object.values((await redis.hgetall(JOBS)) || {}).filter(Boolean);
    let jobs = all;
    if (q.role) jobs = jobs.filter(j => j.role === q.role);
    if (q.status) jobs = jobs.filter(j => j.status === q.status);
    if (q.type) jobs = jobs.filter(j => j.type === q.type);
    jobs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const counts = all.reduce((m, j) => (m[j.status] = (m[j.status] || 0) + 1, m), {});
    const byRole = all.filter(j => j.status === 'queued')
      .reduce((m, j) => (m[j.role] = (m[j.role] || 0) + 1, m), {});
    return res.status(200).json({
      status: 'connected', roles: ROLES, types: TYPES,
      counts, queuedByRole: byRole,
      jobs: jobs.slice(0, Number(q.limit) || 50),
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = String(req.query?.action || 'create');
  const body = req.body || {};

  try {
    // ─── 생성 ───
    if (action === 'create') {
      const items = Array.isArray(body.jobs) ? body.jobs : [body];
      const created = [];
      for (const it of items) {
        if (!it.type || !it.role) return res.status(400).json({ error: 'type·role 필수' });
        if (!ROLES[it.role]) return res.status(400).json({ error: `알 수 없는 role: ${it.role}` });
        const id = `job_${Date.now().toString(36)}_${Math.round(performance.now() * 1000).toString(36)}_${created.length}`;
        const job = {
          id, type: it.type, role: it.role, status: 'queued',
          payload: it.payload ?? null, result: null, error: null,
          priority: it.priority === 'high' ? 'high' : 'normal',
          note: it.note || null,
          claimedBy: null, claimedAt: null, leaseUntil: null,
          attempts: 0, createdAt: nowIso(), updatedAt: nowIso(),
        };
        await redis.hset(JOBS, { [id]: job });
        // high 는 뒤(RPOP 이 꺼내는 쪽)에 넣어 먼저 나가게 한다.
        if (job.priority === 'high') await redis.rpush(queueKey(job.role), id);
        else await redis.lpush(queueKey(job.role), id);
        created.push(id);
      }
      return res.status(200).json({ ok: true, created });
    }

    // ─── 점유 ───
    if (action === 'claim') {
      const { role, worker } = body;
      if (!role || !ROLES[role]) return res.status(400).json({ error: 'role 필수' });
      if (!worker) return res.status(400).json({ error: 'worker 필수 (누가 집는지 기록해야 함)' });
      // RPOP 은 원자적 — 두 워커가 같은 id 를 받을 수 없다.
      const id = await redis.rpop(queueKey(role));
      if (!id) return res.status(200).json({ ok: true, job: null, message: '대기 중인 작업 없음' });
      const job = await redis.hget(JOBS, id);
      if (!job) return res.status(200).json({ ok: true, job: null, message: '본문 유실(스킵)' });
      const lease = new Date(Date.now() + LEASE_MS).toISOString();
      Object.assign(job, { status: 'claimed', claimedBy: worker, claimedAt: nowIso(), leaseUntil: lease, attempts: (job.attempts || 0) + 1, updatedAt: nowIso() });
      await redis.hset(JOBS, { [id]: job });
      await redis.hset(CLAIMED, { [id]: lease });
      return res.status(200).json({ ok: true, job });
    }

    // ─── 완료 / 실패 ───
    if (action === 'complete' || action === 'fail') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'id 필수' });
      const job = await redis.hget(JOBS, id);
      if (!job) return res.status(404).json({ error: '작업 없음' });
      if (action === 'complete') {
        Object.assign(job, { status: 'done', result: body.result ?? null, error: null, updatedAt: nowIso() });
        await redis.hdel(CLAIMED, id);
      } else {
        const requeue = body.requeue !== false && (job.attempts || 0) < 3;
        Object.assign(job, { status: requeue ? 'queued' : 'failed', error: body.error || '알 수 없는 실패', updatedAt: nowIso() });
        await redis.hdel(CLAIMED, id);
        if (requeue) await redis.rpush(queueKey(job.role), id); // 재시도는 우선 처리
      }
      await redis.hset(JOBS, { [id]: job });
      return res.status(200).json({ ok: true, job });
    }

    // ─── 리스 만료 회수 ───
    // 워커가 죽으면 작업이 claimed 로 영원히 묶인다. 만료분을 큐로 되돌린다.
    if (action === 'reap') {
      const claimed = (await redis.hgetall(CLAIMED)) || {};
      const now = Date.now();
      const revived = [];
      for (const [id, lease] of Object.entries(claimed)) {
        if (new Date(lease).getTime() > now) continue;
        const job = await redis.hget(JOBS, id);
        await redis.hdel(CLAIMED, id);
        if (!job || job.status !== 'claimed') continue;
        if ((job.attempts || 0) >= 3) {
          Object.assign(job, { status: 'failed', error: `리스 만료 ${job.attempts}회 — 포기`, updatedAt: nowIso() });
        } else {
          Object.assign(job, { status: 'queued', claimedBy: null, claimedAt: null, leaseUntil: null, updatedAt: nowIso() });
          await redis.rpush(queueKey(job.role), id);
          revived.push(id);
        }
        await redis.hset(JOBS, { [id]: job });
      }
      return res.status(200).json({ ok: true, revived: revived.length, ids: revived });
    }

    return res.status(400).json({ error: `알 수 없는 action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
