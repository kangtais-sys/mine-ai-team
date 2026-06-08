// §4 — 정시 자동 발행 cron
// creator_drafts 에서 status='scheduled' 이고 scheduledAt(UTC) <= now 인 드래프트를
// Zernio 즉시발행(calendar.js 의 검증된 publishDraftToZernio 단일 경로)으로 발행 → status='published'.
// Zernio 네이티브 예약에 의존하지 않고 우리 cron 으로 정시 발행(견고).
//
// 인증: 기존 cron 패턴(Bearer CRON_SECRET). ?dry=1 이면 실제 발행 없이 대상·payload만 반환(검증용).
import { getSupabase } from '../../lib/supabase.js';
import { publishDraftToZernio } from '../creator/calendar.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const dryRun = req.query?.dry === '1';
  const sb = getSupabase();
  const nowIso = new Date().toISOString();

  try {
    // 예약 상태 + 예약시각 도래 (scheduledAt 은 UTC ISO 문자열 → 사전식 비교가 곧 시간 비교)
    const { data: rows, error } = await sb
      .from('creator_drafts')
      .select('id, data')
      .filter('data->>status', 'eq', 'scheduled')
      .filter('data->>scheduledAt', 'lte', nowIso)
      .limit(20);
    if (error) throw error;

    const due = (rows || []).filter(r => r.data && r.data.version === 'milli-v1');
    const results = [];
    for (const row of due) {
      const draft = row.data;
      const pr = await publishDraftToZernio(draft, { dryRun });
      if (!dryRun) {
        await sb.from('creator_drafts').update({ data: draft }).eq('id', row.id);
      }
      results.push({
        id: row.id, channel: draft.channel, scheduledAt: draft.scheduledAt,
        ok: pr.ok, status: draft.status, error: pr.error || null,
        ...(dryRun && { wouldSend: pr.body }),
      });
    }

    const published = results.filter(r => r.ok && !dryRun).length;
    console.log(`[creator-publish-due] dryRun=${dryRun} due=${due.length} published=${published}`);
    return res.status(200).json({ ok: true, dryRun, now: nowIso, due: due.length, published, results });
  } catch (e) {
    console.error('[creator-publish-due]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
