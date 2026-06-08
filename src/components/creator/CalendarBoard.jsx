// CalendarBoard.jsx — AI 크리에이터 주간 콘텐츠 관제탑
// 요일(월~일) × 4채널(KR IG/TT · US IG/TT) 그리드.
// 셀: 미리보기·슬롯·상태·캡션 → 클릭 시 우측 드로어에서 승인/수정/예약/발행.
// 데이터: GET /api/creator/calendar?week=YYYY-MM-DD (creator_drafts, version 'milli-v1')
// API 미응답(로컬 vite) 시 내장 샘플 주간으로 폴백 렌더.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Camera, Music2, Plus, Play,
  Check, Pencil, Clock, Send, Trash2, X, Loader2, RefreshCw, Sparkles, Upload,
} from 'lucide-react';
import { upload } from '@vercel/blob/client';

// 영상 URL 판별 (format 또는 확장자)
const isVideoMedia = (draft) =>
  draft?.format === 'reel' || draft?.format === 'shorts' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(draft?.mediaUrl || '');

// ─── 상수 ────────────────────────────────────────────────
const ACCENT = '#5E6AD2';

const STATUS = {
  empty:      { label: '미생성',     color: '#C7C7CC', bg: '#F2F2F7' },
  draft:      { label: '초안',       color: '#8E8E93', bg: '#F2F2F7' },
  generating: { label: '생성 중',    color: '#FF9500', bg: '#FFF5E6' },
  review:     { label: '검토 대기',  color: '#5E6AD2', bg: '#EEF0FF' },
  approved:   { label: '승인됨',     color: '#0A84FF', bg: '#EAF4FF' },
  scheduled:  { label: '예약됨',     color: '#30B85C', bg: '#EAFBF0' },
  published:  { label: '발행 완료',  color: '#30B85C', bg: '#EAFBF0' },
  failed:     { label: '실패',       color: '#FF3B30', bg: '#FFECEB' },
};

const WEEKDAYS = [
  { key: 'mon', label: '월', concept: '사이트 후기',        hint: '자사몰/아마존 베스트 후기 후킹' },
  { key: 'tue', label: '화', concept: '0605 스왑',          hint: '템플릿 스왑 · 이름·날짜·ml 랜덤' },
  { key: 'wed', label: '수', concept: '프로모션',           hint: '진행 중 프로모션 후킹' },
  { key: 'thu', label: '목', concept: '0603 비포·애프터',   hint: '못생김→예뻐짐 · POV 자막' },
  { key: 'fri', label: '금', concept: '카드뉴스',           hint: '뜨는 성분/시술 5선' },
  { key: 'sat', label: '토', concept: '제품 합성',          hint: '날씨/장소 감성 합성' },
  { key: 'sun', label: '일', concept: '후기 릴스',          hint: '후기 기반 후킹 9:16 영상' },
];

const CHANNELS = [
  { key: 'kr_ig', region: 'kr', platform: 'instagram', label: 'KR 인스타', flag: '🇰🇷', market: '한국 시장 · 한국어' },
  { key: 'kr_tt', region: 'kr', platform: 'tiktok',    label: 'KR 틱톡',   flag: '🇰🇷', market: '한국 시장 · 한국어' },
  { key: 'us_ig', region: 'us', platform: 'instagram', label: 'US 인스타', flag: '🇺🇸', market: 'US 시장 · 영어' },
  { key: 'us_tt', region: 'us', platform: 'tiktok',    label: 'US 틱톡',   flag: '🇺🇸', market: 'US 시장 · 영어' },
];

// ─── 날짜 유틸 ───────────────────────────────────────────
function startOfWeekMon(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 월=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function iso(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function fmtMD(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }

// ─── 샘플 폴백(로컬 프리뷰용) ────────────────────────────
function sampleDrafts(weekStart) {
  const tue = iso(addDays(weekStart, 1));
  const mon = iso(addDays(weekStart, 0));
  const fri = iso(addDays(weekStart, 4));
  return [
    {
      id: 'sample-tue-us-ig', channel: 'us_ig', date: tue, slotType: 'tue',
      status: 'review', region: 'us', platform: 'instagram',
      format: 'reel', mediaUrl: null, thumbHue: 280,
      caption: '0.4ml에서 2.4ml까지. 12주의 기록 📈\nL. Moretti 케이스 — Baseline 1/25 → Follow-up 4/5.',
      hashtags: '#millimilli #proteinskincare #beforeafter',
      scheduledAt: `${tue}T09:00`,
    },
    {
      id: 'sample-tue-us-tt', channel: 'us_tt', date: tue, slotType: 'tue',
      status: 'review', region: 'us', platform: 'tiktok',
      format: 'reel', mediaUrl: null, thumbHue: 280,
      caption: 'POV: your skin filling back up 💧 0.4 → 2.4ml in 12 weeks.',
      hashtags: '#skincare #beforeafter #glassskin', scheduledAt: `${tue}T09:00`,
    },
    {
      id: 'sample-mon-kr-ig', channel: 'kr_ig', date: mon, slotType: 'mon',
      status: 'scheduled', region: 'kr', platform: 'instagram',
      format: 'cardnews', mediaUrl: null, thumbHue: 12,
      caption: '오늘 실시간 밀리밀리 ⭐ 자사몰 베스트 후기 모음',
      hashtags: '#밀리밀리 #리뷰', scheduledAt: `${mon}T09:00`,
    },
    {
      id: 'sample-fri-kr-ig', channel: 'kr_ig', date: fri, slotType: 'fri',
      status: 'draft', region: 'kr', platform: 'instagram',
      format: 'cardnews', mediaUrl: null, thumbHue: 200,
      caption: '요즘 뜨는 성분 5가지 🔬', hashtags: '#성분 #뷰티트렌드', scheduledAt: `${fri}T09:00`,
    },
  ];
}

// ─── 상태 배지 ───────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: s.color, background: s.bg,
      padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function PlatformIcon({ platform, size = 13 }) {
  return platform === 'tiktok'
    ? <Music2 size={size} />
    : <Camera size={size} />;
}

// ─── 셀 ──────────────────────────────────────────────────
function Cell({ draft, weekday, onClick }) {
  if (!draft) {
    return (
      <button onClick={onClick} style={{
        width: '100%', height: '100%', minHeight: 96, border: '1px dashed #DADAE0',
        borderRadius: 10, background: 'transparent', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, color: '#B0B0B8', transition: 'all .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = '#FAFAFF'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#DADAE0'; e.currentTarget.style.background = 'transparent'; }}>
        <Plus size={16} />
        <span style={{ fontSize: 10 }}>{weekday.concept}</span>
      </button>
    );
  }
  const s = STATUS[draft.status] || STATUS.draft;
  const isVideo = isVideoMedia(draft);
  return (
    <button onClick={onClick} style={{
      width: '100%', height: '100%', minHeight: 96, border: `1px solid ${s.color}33`,
      borderRadius: 10, background: '#FFF', cursor: 'pointer', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0,
      boxShadow: '0 1px 2px rgba(0,0,0,.04)', transition: 'all .12s',
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,.10)'; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.04)'; }}>
      {/* 썸네일 */}
      <div style={{
        height: 46, position: 'relative', flexShrink: 0, overflow: 'hidden',
        background: draft.mediaUrl && !isVideo
          ? `center/cover url(${draft.mediaUrl})`
          : (draft.mediaUrls && draft.mediaUrls.length
            ? `center/cover url(${draft.mediaUrls[0]})`
            : `linear-gradient(135deg, hsl(${draft.thumbHue ?? 260} 60% 88%), hsl(${(draft.thumbHue ?? 260) + 30} 55% 78%))`),
      }}>
        {draft.mediaUrl && isVideo && (
          <video src={draft.mediaUrl} muted playsInline preload="metadata"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {draft.mediaUrl && isVideo && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={16} color="#fff" fill="#fff" />
          </div>
        )}
        <span style={{ position: 'absolute', top: 4, left: 5, fontSize: 9, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>
          {isVideo ? 'VIDEO' : (draft.format === 'cardnews' ? `CARD${draft.mediaUrls?.length ? ' ×' + draft.mediaUrls.length : ''}` : 'IMG')}
        </span>
      </div>
      {/* 본문 */}
      <div style={{ padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <StatusBadge status={draft.status} />
        <div style={{ fontSize: 10.5, color: '#3A3A3C', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {draft.caption || '—'}
        </div>
      </div>
    </button>
  );
}

// ─── 우측 드로어 ─────────────────────────────────────────
function Drawer({ cell, onClose, onAction, busy }) {
  // 부모가 cell 변경 시 key로 리마운트 → 초기값 동기화
  const [caption, setCaption] = useState(cell?.draft?.caption || '');
  const [hashtags, setHashtags] = useState(cell?.draft?.hashtags || '');
  const [time, setTime] = useState(cell?.draft?.scheduledAt?.slice(11, 16) || '09:00');
  const [revisionNote, setRevisionNote] = useState('');
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadErr('');
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/creator/blob-upload',
        contentType: file.type,
        multipart: file.size > 5 * 1024 * 1024,
      });
      const fmt = file.type.startsWith('video') ? 'reel' : (draft?.format || 'cardnews');
      // 업로드한 URL 을 드래프트에 저장(save) — 저장 후 보드 리로드되어 셀에 영상 표시
      onAction('save', { ...cell, caption, hashtags, time, mediaUrl: blob.url, format: fmt });
    } catch (err) {
      setUploadErr(err?.message || '업로드 실패');
      setUploading(false);
    }
  }

  if (!cell) return null;
  const { channel, weekday, date, draft } = cell;
  const status = draft?.status || 'empty';
  const isVideo = isVideoMedia(draft);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.28)' }} />
      <div style={{
        position: 'relative', width: 420, maxWidth: '92vw', height: '100%', background: '#FFF',
        boxShadow: '-8px 0 30px rgba(0,0,0,.14)', display: 'flex', flexDirection: 'column',
      }}>
        {/* 헤더 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEE', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: '#1D1D1F' }}>
            <span>{channel.flag}</span><PlatformIcon platform={channel.platform} size={15} />
            {channel.label}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8E8E93' }}>
            {weekday.label}요일 · {fmtMD(new Date(date))}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8E8E93', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 슬롯 정보 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT, background: '#EEF0FF', padding: '3px 9px', borderRadius: 6 }}>{weekday.concept}</span>
            <span style={{ fontSize: 11, color: '#8E8E93' }}>{weekday.hint}</span>
          </div>
          <div style={{ fontSize: 11, color: '#8E8E93' }}>타겟: <b style={{ color: '#3A3A3C' }}>{channel.market}</b> · 시장 트렌드 기반 후킹</div>

          {/* 미리보기 */}
          {draft && draft.mediaUrls && draft.mediaUrls.length ? (
            // 카드뉴스 캐러셀 — 슬라이드 가로 스크롤
            <div style={{ display: 'flex', height: 190, flexShrink: 0, gap: 8, overflowX: 'auto', padding: '2px 0 8px', scrollSnapType: 'x mandatory' }}>
              {draft.mediaUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer"
                  style={{ flex: '0 0 auto', width: 150, height: '100%', borderRadius: 10, overflow: 'hidden',
                    border: '1px solid #E5E5EA', scrollSnapAlign: 'start', background: `center/cover url(${u}) #000` }} />
              ))}
            </div>
          ) : (
            <div style={{
              borderRadius: 12, aspectRatio: '9/16', maxHeight: 280, alignSelf: 'center', width: '60%',
              overflow: 'hidden', position: 'relative',
              background: draft?.mediaUrl && !isVideo ? `center/cover url(${draft.mediaUrl}) #000`
                : `linear-gradient(135deg, hsl(${draft?.thumbHue ?? 260} 60% 86%), hsl(${(draft?.thumbHue ?? 260) + 30} 55% 74%))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              {draft?.mediaUrl && isVideo && (
                <video src={draft.mediaUrl} controls playsInline preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
              )}
              {!draft && <span style={{ fontSize: 12, opacity: .8 }}>아직 생성 안 됨</span>}
              {draft && !draft.mediaUrl && <span style={{ fontSize: 11, opacity: .9 }}>미리보기 대기</span>}
            </div>
          )}

          {/* 미디어 업로드 (§3 — Blob 직업로드) */}
          {draft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,image/*"
                onChange={handleFile} style={{ display: 'none' }} />
              <button type="button" disabled={uploading || busy} onClick={() => fileRef.current?.click()}
                style={{ ...ghostBtn, justifyContent: 'center', opacity: uploading ? .6 : 1 }}>
                {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                {uploading ? '업로드 중…' : (draft.mediaUrl ? '미디어 교체' : '영상/이미지 업로드')}
              </button>
              {uploadErr && <span style={{ fontSize: 10.5, color: '#FF3B30' }}>{uploadErr}</span>}
              <span style={{ fontSize: 10, color: '#AEAEB2' }}>mp4·이미지 직접 업로드(최대 200MB). 업로드 후 자동 저장됩니다.</span>
            </div>
          )}

          {draft && <StatusBadge status={status} />}

          {/* 캡션 편집 */}
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73' }}>캡션</label>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
            placeholder="캡션 — 후킹 + 댓글/저장/공유/팔로우 유도 + AI 연출 명시"
            style={{ border: '1px solid #E0E0E5', borderRadius: 8, padding: 10, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }} />

          <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73' }}>해시태그</label>
          <input value={hashtags} onChange={e => setHashtags(e.target.value)}
            style={{ border: '1px solid #E0E0E5', borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: 'inherit' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={14} color="#8E8E93" />
            <span style={{ fontSize: 11, color: '#6E6E73' }}>발행 시각(현지)</span>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              style={{ marginLeft: 'auto', border: '1px solid #E0E0E5', borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }} />
          </div>

          {/* ② 자연어 수정 요청 → 재생성 */}
          {draft && (
            <div style={{ borderTop: '1px solid #EEE', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73' }}>수정 요청 (콘텐츠 재생성)</label>
              <textarea value={revisionNote} onChange={e => setRevisionNote(e.target.value)} rows={3}
                placeholder="예: 비포 더 야위게 + 줌 타이트하게(숫자가 볼·턱에) + 캡션 더 후킹하게"
                style={{ border: '1px solid #E0E0E5', borderRadius: 8, padding: 10, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }} />
              <button disabled={busy || !revisionNote.trim()}
                onClick={() => onAction('revise', { ...cell, caption, hashtags, time, revisionNote })}
                style={{ ...ghostBtn, justifyContent: 'center', borderColor: '#D9CCF5', color: ACCENT, opacity: revisionNote.trim() ? 1 : 0.5 }}>
                {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} 이 지시대로 재생성
              </button>
              {draft.lastRevisionNote && (
                <div style={{ fontSize: 10.5, color: '#A0A0A8' }}>최근 요청: {draft.lastRevisionNote}</div>
              )}
            </div>
          )}
        </div>

        {/* 액션 바 */}
        <div style={{ padding: 16, borderTop: '1px solid #EEE', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!draft ? (
            <button disabled={busy} onClick={() => onAction('generate', { channel, weekday, date })} style={primaryBtn}>
              {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} 이 슬롯 생성하기
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy} onClick={() => onAction('save', { ...cell, caption, hashtags, time })} style={ghostBtn}>
                  <Pencil size={14} /> 저장
                </button>
                <button disabled={busy} onClick={() => onAction('approve', { ...cell, caption, hashtags, time })} style={ghostBtn}>
                  <Check size={14} /> 승인
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy} onClick={() => onAction('schedule', { ...cell, caption, hashtags, time })} style={ghostBtn}>
                  <Clock size={14} /> 예약
                </button>
                <button disabled={busy} onClick={() => onAction('publish', { ...cell, caption, hashtags, time })} style={primaryBtn}>
                  {busy ? <Loader2 size={15} className="spin" /> : <Send size={14} />} 발행
                </button>
              </div>
              <button disabled={busy} onClick={() => onAction('delete', cell)} style={{ ...ghostBtn, color: '#FF3B30', borderColor: '#FFD9D6', justifyContent: 'center' }}>
                <Trash2 size={14} /> 삭제
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '11px 14px', border: 'none', borderRadius: 9, background: ACCENT, color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const ghostBtn = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 12px', border: '1px solid #E0E0E5', borderRadius: 9, background: '#FFF',
  color: '#3A3A3C', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

// ─── 메인 ────────────────────────────────────────────────
export default function CalendarBoard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMon(new Date()));
  const [drafts, setDrafts] = useState([]);
  const [usingSample, setUsingSample] = useState(false);
  const [cell, setCell] = useState(null);   // 열린 드로어
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/creator/calendar?week=${iso(weekStart)}`);
      if (!res.ok) throw new Error('no api');
      const data = await res.json();
      const list = data.drafts || [];
      if (!Array.isArray(list)) throw new Error('bad');
      setDrafts(list);
      setUsingSample(false);
    } catch {
      setDrafts(sampleDrafts(weekStart));
      setUsingSample(true);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  // index: `${channel}|${date}` → draft
  const index = useMemo(() => {
    const m = {};
    for (const d of drafts) m[`${d.channel}|${d.date}`] = d;
    return m;
  }, [drafts]);

  const counts = useMemo(() => {
    const c = { review: 0, scheduled: 0, published: 0, draft: 0 };
    for (const d of drafts) if (c[d.status] != null) c[d.status]++;
    return c;
  }, [drafts]);

  async function handleAction(type, payload) {
    // 샘플 모드(로컬)에서는 로컬 상태만 갱신 — 디자인 검증용
    if (usingSample) {
      setBusy(true);
      setTimeout(() => {
        setDrafts(prev => {
          const next = [...prev];
          const key = payload?.draft?.id;
          const i = next.findIndex(d => d.id === key);
          if (type === 'delete' && i >= 0) next.splice(i, 1);
          else if (i >= 0) {
            const map = { approve: 'approved', schedule: 'scheduled', publish: 'published', save: next[i].status, revise: 'review' };
            next[i] = {
              ...next[i],
              status: map[type] ?? next[i].status,
              caption: payload.caption ?? next[i].caption,
              hashtags: payload.hashtags ?? next[i].hashtags,
              ...(type === 'revise' && { lastRevisionNote: payload.revisionNote }),
            };
          }
          return next;
        });
        setBusy(false); setCell(null);
      }, 400);
      return;
    }
    // 실 API
    setBusy(true);
    try {
      await fetch('/api/creator/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type, ...payload, channel: payload.channel?.key, date: payload.date }),
      });
      await load();
    } catch (e) {
      alert('작업 실패: ' + e.message);
    } finally {
      setBusy(false); setCell(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F5F7' }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* 상단 바 */}
      <div style={{ padding: '16px 24px', background: '#FFF', borderBottom: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1D1D1F' }}>주간 콘텐츠</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={navBtn}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3C', minWidth: 116, textAlign: 'center' }}>
            {fmtMD(days[0])} – {fmtMD(days[6])}
          </div>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={navBtn}><ChevronRight size={16} /></button>
          <button onClick={() => setWeekStart(startOfWeekMon(new Date()))} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }}>이번 주</button>
        </div>

        {/* 요약 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 12 }}>
          <Summary color={STATUS.review.color} label="검토 대기" n={counts.review} />
          <Summary color={STATUS.scheduled.color} label="예약됨" n={counts.scheduled} />
          <Summary color={STATUS.published.color} label="발행" n={counts.published} />
        </div>
        <button onClick={load} style={navBtn} title="새로고침"><RefreshCw size={15} /></button>
      </div>

      {usingSample && (
        <div style={{ padding: '7px 24px', background: '#FFF8E6', color: '#9A6B00', fontSize: 11.5, borderBottom: '1px solid #F4E6BE' }}>
          ⚠️ 미리보기 모드 — 실데이터 API(/api/creator/calendar) 미응답. 디자인 확인용 샘플을 표시 중입니다. (버튼은 로컬에서만 동작)
        </div>
      )}

      {/* 그리드 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(7, minmax(120px, 1fr))', gap: 8, minWidth: 980 }}>
          {/* 헤더 행 */}
          <div />
          {days.map((d, i) => {
            const wk = WEEKDAYS[i];
            const isToday = iso(d) === iso(new Date());
            return (
              <div key={wk.key} style={{ padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? ACCENT : '#1D1D1F' }}>
                  {wk.label} <span style={{ fontSize: 11, fontWeight: 500, color: '#A0A0A8' }}>{fmtMD(d)}</span>
                </div>
                <div style={{ fontSize: 10, color: '#A0A0A8', marginTop: 1 }}>{wk.concept}</div>
              </div>
            );
          })}

          {/* 채널 행 */}
          {CHANNELS.map(ch => (
            <FragmentRow key={ch.key} channel={ch} days={days} index={index} onOpen={(d, wk) => setCell({ channel: ch, weekday: wk, date: iso(d), draft: index[`${ch.key}|${iso(d)}`] || null })} />
          ))}
        </div>
      </div>

      <Drawer key={cell ? `${cell.channel.key}|${cell.date}` : 'none'} cell={cell} onClose={() => setCell(null)} onAction={handleAction} busy={busy} />
    </div>
  );
}

function FragmentRow({ channel, days, index, onOpen }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px', position: 'sticky', left: 0 }}>
        <span style={{ fontSize: 15 }}>{channel.flag}</span>
        <PlatformIcon platform={channel.platform} size={15} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{channel.label}</span>
          <span style={{ fontSize: 9.5, color: '#A0A0A8' }}>{channel.market}</span>
        </div>
      </div>
      {days.map((d, i) => (
        <Cell key={channel.key + i} draft={index[`${channel.key}|${iso(d)}`] || null} weekday={WEEKDAYS[i]} onClick={() => onOpen(d, WEEKDAYS[i])} />
      ))}
    </>
  );
}

function Summary({ color, label, n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      <span style={{ color: '#6E6E73' }}>{label}</span>
      <b style={{ color: '#1D1D1F' }}>{n}</b>
    </div>
  );
}

const navBtn = {
  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid #E5E5EA', borderRadius: 8, background: '#FFF', color: '#3A3A3C', cursor: 'pointer',
};
