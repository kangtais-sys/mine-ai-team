// #1 — Cowork 전용 콘텐츠 투입 엔드포인트.
// 코웍 파이프라인이 영상을 만든 뒤 {channel, date, mediaUrl, caption} 만 POST 하면
// 해당 슬롯(channel|date)의 보드 드래프트를 생성/갱신한다.
//
// 인증: 대시보드 비번 미들웨어에서 제외(외부 자동화가 호출) → 자체 Bearer 시크릿으로 보호.
//   헤더: Authorization: Bearer <CREATOR_INGEST_SECRET>
import { getSupabase } from '../../lib/supabase.js';

const envTrim = (k, fb = '') => (process.env[k] || fb).trim();
const PROFILE = {
  kr: envTrim('ZERNIO_MILLIMILLI_PROFILE_ID', '69d08cc1986d57bb8f733102'),
  us: envTrim('ZERNIO_MILLIMILLI_US_PROFILE_ID', '69fbfcd01fc1fdb66f249aa8'),
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers.authorization !== `Bearer ${process.env.CREATOR_INGEST_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { channel, date, mediaUrl, mediaUrls, caption, hashtags, format, slotType, status } = req.body || {};
  if (!channel || !date) return res.status(400).json({ error: 'channel, date 필수' });
  if (!['kr_ig', 'kr_tt', 'us_ig', 'us_tt'].includes(channel)) return res.status(400).json({ error: 'channel 값 오류' });

  const region = channel.startsWith('us') ? 'us' : 'kr';
  const platform = channel.endsWith('tt') ? 'tiktok' : 'instagram';
  const sb = getSupabase();

  try {
    // 같은 채널|날짜 기존 드래프트 찾기 (보드 index 와 동일 키)
    const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(300);
    const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === channel && r.data.date === date);

    const applyMedia = (d) => {
      if (mediaUrl !== undefined) d.mediaUrl = mediaUrl;
      if (mediaUrls !== undefined) d.mediaUrls = mediaUrls;
      if (caption != null) d.caption = caption;
      if (hashtags != null) d.hashtags = hashtags;
      if (format) d.format = format;
      d.updatedAt = new Date().toISOString();
    };

    if (existing) {
      const d = existing.data;
      applyMedia(d);
      // 미디어가 들어왔고 아직 초안/생성중이면 → 검토 대기로 승격
      if (status) d.status = status;
      else if ((d.mediaUrl || (d.mediaUrls && d.mediaUrls.length)) && ['draft', 'generating'].includes(d.status)) d.status = 'review';
      await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
      return res.status(200).json({ ok: true, action: 'updated', id: existing.id, draft: d });
    }

    const id = `milli_${channel}_${date}_${Date.now().toString(36)}`;
    const draft = {
      id, version: 'milli-v1', channel, region, platform,
      date, slotType: slotType || null,
      status: status || ((mediaUrl || (mediaUrls && mediaUrls.length)) ? 'review' : 'draft'),
      format: format || 'reel',
      caption: caption || '', hashtags: hashtags || '',
      mediaUrl: mediaUrl || null, mediaUrls: mediaUrls || [],
      profileId: PROFILE[region],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
    return res.status(200).json({ ok: true, action: 'created', id, draft });
  } catch (e) {
    console.error('[ingest]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
