import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Film, Layers, Instagram, Video, Clock, CheckCircle2,
  Send, Loader2, RefreshCw, Trash2, Edit3, Calendar, ChevronDown,
  ChevronUp, AlertCircle, Play, Image, Plus, X,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────
const PILLARS = [
  { key: 'ingredient', label: '🧪 성분정보', desc: '원료·효능·주의사항' },
  { key: 'treatment',  label: '💉 시술정보', desc: '피부과·홈케어 루틴' },
  { key: 'behind',     label: '🔬 개발 비하인드', desc: 'R&D 과정·에피소드' },
  { key: 'collab',     label: '👨‍⚕️ 전문가 콜라보', desc: '의사·약사 협업' },
  { key: 'trend',      label: '✨ 뷰티 트렌드', desc: '트렌드·글로벌 동향' },
];

const FORMATS = [
  { key: 'reel',     label: 'Reels',     icon: Film,   desc: '인스타 세로 영상 (15-30초)' },
  { key: 'shorts',   label: 'Shorts',    icon: Video,  desc: '유튜브/틱톡 숏츠 (15-60초)' },
  { key: 'cardnews', label: '카드뉴스',   icon: Layers, desc: '인스타 슬라이드 (5-7장)' },
];

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'tiktok',    label: 'TikTok',    color: '#010101' },
  { key: 'youtube',   label: 'YouTube',   color: '#FF0000' },
];

const STATUS_LABELS = {
  draft:      { label: '초안',      color: '#AEAEB2', bg: '#F2F2F7' },
  generating: { label: '영상 생성 중', color: '#FF9500', bg: '#FFF5E6' },
  review:     { label: '검토 대기',   color: '#5E6AD2', bg: '#F0F0FF' },
  scheduled:  { label: '예약됨',     color: '#34C759', bg: '#F0FFF4' },
  publishing: { label: '발행 중',    color: '#FF9500', bg: '#FFF5E6' },
  published:  { label: '발행 완료',  color: '#34C759', bg: '#F0FFF4' },
  failed:     { label: '실패',       color: '#FF3B30', bg: '#FFF5F5' },
};

const TABS = [
  { key: 'create',    label: '새 콘텐츠' },
  { key: 'review',    label: '검토 대기' },
  { key: 'scheduled', label: '예약됨' },
  { key: 'published', label: '발행 완료' },
];

const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' };

// ─── Helpers ────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function formatScheduled(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Sub-components ──────────────────────────────────────────

function TabBar({ active, onChange, counts }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid #E5E5EA', background: '#FFF' }}>
      {TABS.map(t => {
        const cnt = counts[t.key] ?? null;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            padding: '12px 16px', border: 'none', background: 'transparent',
            fontSize: 13.5, fontWeight: active === t.key ? 600 : 400,
            color: active === t.key ? '#1D1D1F' : '#6E6E73',
            borderBottom: active === t.key ? '2px solid #1D1D1F' : '2px solid transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            transition: 'color 0.15s',
          }}>
            {t.label}
            {cnt != null && cnt > 0 && (
              <span style={{ background: '#5E6AD2', color: '#FFF', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>
                {cnt}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.draft;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 6 }}>
      {status === 'generating' && <Loader2 size={10} style={{ marginRight: 3, display: 'inline', verticalAlign: 'middle', animation: 'spin 1s linear infinite' }} />}
      {s.label}
    </span>
  );
}

function PlatformChips({ platforms }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {platforms.map(p => {
        const pl = PLATFORMS.find(x => x.key === p);
        return (
          <span key={p} style={{ fontSize: 10, fontWeight: 600, color: pl?.color || '#6E6E73', background: '#F2F2F7', padding: '2px 7px', borderRadius: 5 }}>
            {pl?.label || p}
          </span>
        );
      })}
    </div>
  );
}

// ─── Draft Card ──────────────────────────────────────────────
function DraftCard({ draft, onUpdate, onPublish, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [caption, setCaption] = useState(draft.caption || '');
  const [hashtags, setHashtags] = useState(draft.hashtags || '');
  const [scheduledAt, setScheduledAt] = useState(draft.scheduledAt
    ? new Date(draft.scheduledAt).toISOString().slice(0, 16)
    : '');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const fmt = FORMATS.find(f => f.key === draft.format);
  const FmtIcon = fmt?.icon || Film;

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(draft.id, { caption, hashtags });
    setSaving(false);
  };

  const handleSchedule = async () => {
    if (!scheduledAt) return;
    setSaving(true);
    await onUpdate(draft.id, { caption, hashtags, scheduledAt: new Date(scheduledAt).toISOString(), status: 'scheduled' });
    setSaving(false);
  };

  const handlePublishNow = async () => {
    setPublishing(true);
    await onPublish(draft.id);
    setPublishing(false);
  };

  const pillar = PILLARS.find(p => p.key === draft.pillar);

  return (
    <div style={{ ...CARD, marginBottom: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F2F2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FmtIcon size={15} color="#1D1D1F" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{pillar?.label || draft.pillar}</span>
            <span style={{ fontSize: 11, color: '#AEAEB2' }}>·</span>
            <span style={{ fontSize: 11.5, color: '#6E6E73' }}>{fmt?.label || draft.format}</span>
          </div>
          <PlatformChips platforms={draft.platforms || []} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <StatusBadge status={draft.status} />
          <span style={{ fontSize: 11, color: '#AEAEB2' }}>{timeAgo(draft.createdAt)}</span>
          <button onClick={() => setExpanded(!expanded)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6E6E73', padding: 2 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Hook preview (always visible) */}
      {draft.hook && (
        <div style={{ background: '#F8F8FA', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#AEAEB2', fontWeight: 600 }}>HOOK</span>
          <p style={{ fontSize: 13, color: '#1D1D1F', margin: '4px 0 0', lineHeight: 1.5 }}>{draft.hook}</p>
        </div>
      )}

      {/* Media preview */}
      {draft.mediaUrl && (
        <div style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden', background: '#000', maxHeight: 200, display: 'flex', justifyContent: 'center' }}>
          <video src={draft.mediaUrl} controls style={{ maxHeight: 200, borderRadius: 8 }} />
        </div>
      )}
      {draft.mediaUrls?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 4 }}>
          {draft.mediaUrls.map((url, i) => (
            <img key={i} src={url} alt={`슬라이드 ${i + 1}`} style={{ height: 80, borderRadius: 6, flexShrink: 0 }} />
          ))}
        </div>
      )}

      {/* Expanded: Script + Caption edit */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* Script */}
          {draft.script && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', display: 'block', marginBottom: 4 }}>스크립트</label>
              <div style={{ background: '#F8F8FA', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#1D1D1F', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {draft.script}
              </div>
            </div>
          )}

          {/* Slides preview for cardnews */}
          {draft.slides?.length > 0 && !draft.mediaUrls?.length && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', display: 'block', marginBottom: 4 }}>슬라이드 ({draft.slides.length}장)</label>
              {draft.slides.map((s, i) => (
                <div key={i} style={{ background: '#F8F8FA', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#5E6AD2' }}>#{s.num || i + 1}</span>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginTop: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>{s.body}</div>
                </div>
              ))}
            </div>
          )}

          {/* Caption edit */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', display: 'block', marginBottom: 4 }}>캡션</label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Hashtags edit */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', display: 'block', marginBottom: 4 }}>해시태그</label>
            <textarea
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', color: '#5E6AD2' }}
            />
          </div>

          {/* Action buttons */}
          {(draft.status === 'review' || draft.status === 'scheduled') && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* 저장 */}
              <button onClick={handleSave} disabled={saving} style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#FFF',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#1D1D1F', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {saving ? <Loader2 size={13} /> : <Edit3 size={13} />} 저장
              </button>

              {/* 예약 발행 */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 12.5, fontFamily: 'inherit' }}
                />
                <button onClick={handleSchedule} disabled={saving || !scheduledAt} style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', background: '#5E6AD2',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#FFF', display: 'flex', alignItems: 'center', gap: 5,
                  opacity: !scheduledAt ? 0.5 : 1,
                }}>
                  <Calendar size={13} /> 예약
                </button>
              </div>

              {/* 지금 발행 */}
              <button onClick={handlePublishNow} disabled={publishing} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1D1D1F',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#FFF', display: 'flex', alignItems: 'center', gap: 5,
                opacity: publishing ? 0.6 : 1,
              }}>
                {publishing ? <Loader2 size={13} /> : <Send size={13} />} 지금 발행
              </button>
            </div>
          )}

          {draft.status === 'published' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#34C759' }}>
              <CheckCircle2 size={14} /> {formatScheduled(draft.publishedAt)} 발행 완료
            </div>
          )}

          {draft.status === 'failed' && draft.error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#FF3B30', background: '#FFF5F5', padding: '8px 12px', borderRadius: 8 }}>
              <AlertCircle size={13} /> {draft.error}
            </div>
          )}

          {/* 삭제 */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F2F2F7', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => onDelete(draft.id)} style={{
              border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#FF3B30',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Form ─────────────────────────────────────────────
function CreateForm({ onGenerated }) {
  const [pillar, setPillar] = useState('');
  const [format, setFormat] = useState('reel');
  const [platforms, setPlatforms] = useState(['instagram', 'tiktok']);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('idle'); // idle | generating | media | done | error
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [generateMedia, setGenerateMedia] = useState(true);

  const togglePlatform = (key) => {
    setPlatforms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const handleGenerate = async () => {
    if (!pillar) return;
    setLoading(true);
    setStep('generating');
    setError('');

    try {
      // Step 1: Claude 텍스트 생성
      const genRes = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pillar, format, platforms, notes }),
      });
      const genData = await genRes.json();
      if (!genData.success) throw new Error(genData.error || '생성 실패');

      const newDraft = genData.draft;
      setDraft(newDraft);

      // Step 2: 미디어 생성 (옵션)
      if (generateMedia) {
        setStep('media');
        const mediaRes = await fetch('/api/creator/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: newDraft.id }),
        });
        const mediaData = await mediaRes.json();
        if (mediaData.success) setDraft(mediaData.draft);
      }

      setStep('done');
      onGenerated();
    } catch (e) {
      setError(e.message);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('idle');
    setError('');
    setDraft(null);
    setNotes('');
  };

  if (step === 'done' && draft) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ ...CARD, borderColor: '#34C759', background: '#F0FFF4', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CheckCircle2 size={18} color="#34C759" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F' }}>콘텐츠 생성 완료!</span>
          </div>
          <p style={{ fontSize: 13, color: '#6E6E73', margin: 0 }}>
            {draft.format === 'generating'
              ? '영상 생성 중 (1-3분 소요) — "검토 대기" 탭에서 확인하세요.'
              : '"검토 대기" 탭에서 확인·편집·발행할 수 있어요.'}
          </p>
        </div>
        <button onClick={reset} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#FFF', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> 새 콘텐츠 만들기
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {/* 페르소나 헤더 */}
      <div style={{ ...CARD, marginBottom: 16, background: 'linear-gradient(135deg, #F8F8FF 0%, #F0F0FF 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            🧬
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1D1D1F' }}>밀리 (Milli) · @millimilli.kr</div>
            <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>화장품 개발자 컨셉 · 의사·약사 콜라보 · 500달톤 프로틴 연구</div>
          </div>
        </div>
      </div>

      {/* 1. 콘텐츠 기둥 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          콘텐츠 기둥
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PILLARS.map(p => (
            <button key={p.key} onClick={() => setPillar(p.key)} style={{
              padding: '8px 14px', borderRadius: 20, border: `1.5px solid ${pillar === p.key ? '#5E6AD2' : '#E5E5EA'}`,
              background: pillar === p.key ? '#F0F0FF' : '#FFF',
              fontSize: 13, fontWeight: pillar === p.key ? 600 : 400,
              color: pillar === p.key ? '#5E6AD2' : '#6E6E73',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {p.label}
            </button>
          ))}
        </div>
        {pillar && <p style={{ fontSize: 11.5, color: '#AEAEB2', margin: '6px 0 0' }}>{PILLARS.find(p => p.key === pillar)?.desc}</p>}
      </div>

      {/* 2. 포맷 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          포맷
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMATS.map(f => {
            const FIcon = f.icon;
            return (
              <button key={f.key} onClick={() => setFormat(f.key)} style={{
                flex: 1, padding: '12px 10px', borderRadius: 10,
                border: `1.5px solid ${format === f.key ? '#1D1D1F' : '#E5E5EA'}`,
                background: format === f.key ? '#F8F8FA' : '#FFF',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              }}>
                <FIcon size={18} color={format === f.key ? '#1D1D1F' : '#AEAEB2'} style={{ display: 'block', margin: '0 auto 5px' }} />
                <div style={{ fontSize: 13, fontWeight: format === f.key ? 600 : 400, color: format === f.key ? '#1D1D1F' : '#6E6E73' }}>{f.label}</div>
                <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: 2 }}>{f.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 플랫폼 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          발행 플랫폼
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {PLATFORMS.map(p => (
            <button key={p.key} onClick={() => togglePlatform(p.key)} style={{
              padding: '8px 16px', borderRadius: 8,
              border: `1.5px solid ${platforms.includes(p.key) ? p.color : '#E5E5EA'}`,
              background: platforms.includes(p.key) ? `${p.color}12` : '#FFF',
              fontSize: 13, fontWeight: platforms.includes(p.key) ? 600 : 400,
              color: platforms.includes(p.key) ? p.color : '#6E6E73',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. 추가 메모 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          추가 메모 (선택)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="예: 500달톤 프로틴 신제품 출시 기념 / 레티놀 vs 나이아신아마이드 비교 / 의사 콜라보 영상"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      {/* 미디어 생성 옵션 (영상/카드뉴스 포맷만) */}
      {format !== 'reel' || true ? (
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="gen-media" checked={generateMedia} onChange={e => setGenerateMedia(e.target.checked)} style={{ cursor: 'pointer' }} />
          <label htmlFor="gen-media" style={{ fontSize: 13, color: '#6E6E73', cursor: 'pointer' }}>
            {format === 'cardnews' ? '카드뉴스 이미지 자동 생성 (Bannerbear)' : '영상 자동 생성 (Higgsfield)'}
          </label>
        </div>
      ) : null}

      {/* 오류 */}
      {step === 'error' && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FFF5F5', borderRadius: 8, fontSize: 13, color: '#FF3B30', display: 'flex', gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {/* 생성 버튼 */}
      <button
        onClick={handleGenerate}
        disabled={loading || !pillar || platforms.length === 0}
        style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: loading || !pillar ? '#E5E5EA' : '#1D1D1F',
          color: loading || !pillar ? '#AEAEB2' : '#FFF',
          fontSize: 14.5, fontWeight: 700, cursor: loading || !pillar ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.15s',
        }}
      >
        {loading ? (
          <>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            {step === 'generating' ? 'Claude가 콘텐츠 생성 중...' : step === 'media' ? '미디어 생성 중...' : '처리 중...'}
          </>
        ) : (
          <><Sparkles size={16} /> AI 콘텐츠 생성</>
        )}
      </button>
    </div>
  );
}

// ─── Draft List ──────────────────────────────────────────────
function DraftList({ statusFilter, drafts, loading, onRefresh, onUpdate, onPublish, onDelete }) {
  const filtered = drafts.filter(d => {
    if (statusFilter === 'review') return d.status === 'review' || d.status === 'generating' || d.status === 'failed';
    if (statusFilter === 'scheduled') return d.status === 'scheduled';
    if (statusFilter === 'published') return d.status === 'published';
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={onRefresh} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
          <RefreshCw size={13} /> 새로고침
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#AEAEB2' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#AEAEB2' }}>
          <Sparkles size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p style={{ fontSize: 13.5, margin: 0 }}>
            {statusFilter === 'review' ? '검토 대기 콘텐츠가 없어요' :
             statusFilter === 'scheduled' ? '예약된 콘텐츠가 없어요' :
             statusFilter === 'published' ? '아직 발행한 콘텐츠가 없어요' : '콘텐츠가 없어요'}
          </p>
        </div>
      ) : (
        filtered.map(d => (
          <DraftCard key={d.id} draft={d} onUpdate={onUpdate} onPublish={onPublish} onDelete={onDelete} />
        ))
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function CreatorView() {
  const [tab, setTab] = useState('create');
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  const fetchDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const res = await fetch('/api/creator/list');
      const data = await res.json();
      if (data.drafts) setDrafts(data.drafts);
    } catch {}
    setLoadingDrafts(false);
  }, []);

  useEffect(() => {
    fetchDrafts();
    // generating 상태인 게 있으면 30초마다 폴링
    const interval = setInterval(() => {
      if (drafts.some(d => d.status === 'generating')) fetchDrafts();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDrafts, drafts.some(d => d.status === 'generating')]);

  const handleUpdate = async (id, fields) => {
    try {
      const res = await fetch(`/api/creator/draft?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.draft) setDrafts(prev => prev.map(d => d.id === id ? data.draft : d));
    } catch {}
  };

  const handlePublish = async (id) => {
    try {
      const res = await fetch('/api/creator/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.draft) setDrafts(prev => prev.map(d => d.id === id ? data.draft : d));
      if (data.success) setTab('published');
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠어요?')) return;
    try {
      await fetch(`/api/creator/draft?id=${id}`, { method: 'DELETE' });
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  const counts = {
    review: drafts.filter(d => ['review', 'generating', 'failed'].includes(d.status)).length,
    scheduled: drafts.filter(d => d.status === 'scheduled').length,
    published: drafts.filter(d => d.status === 'published').length,
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F5F5F7' }}>
      {/* Header */}
      <div style={{ background: '#FFF', borderBottom: '1px solid #E5E5EA', padding: '16px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color="#FFF" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1D1D1F' }}>AI 크리에이터</h1>
            <p style={{ margin: 0, fontSize: 11.5, color: '#AEAEB2' }}>밀리밀리 · 페르소나 콘텐츠 생성·검토·발행</p>
          </div>
        </div>
        <TabBar active={tab} onChange={setTab} counts={counts} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {tab === 'create' && (
          <CreateForm onGenerated={() => { fetchDrafts(); setTab('review'); }} />
        )}
        {(tab === 'review' || tab === 'scheduled' || tab === 'published') && (
          <DraftList
            statusFilter={tab}
            drafts={drafts}
            loading={loadingDrafts}
            onRefresh={fetchDrafts}
            onUpdate={handleUpdate}
            onPublish={handlePublish}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
