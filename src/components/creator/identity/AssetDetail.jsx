// AssetDetail — 자산 상세 모달 (⭐ 즐겨찾기 토글 + manual_tags 편집 + notes)
// ⭐ 는 라이브러리 정리용 (자동화 트리거 아님 — Reference Tone 자동화는 별도)
// Props:
//   asset: creator_assets row
//   onClose: () => void
//   onChanged?: (updated) => void   // 부모가 그리드 갱신할 수 있게

import { useEffect, useState } from 'react';
import { Star, X, Tag, Loader2, Check, Sparkles } from 'lucide-react';

export default function AssetDetail({ asset, onClose, onChanged }) {
  const [favorite, setFavorite] = useState(!!asset.is_favorite);
  const [notes, setNotes] = useState(asset.notes || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(asset.manual_tags || []);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [retagging, setRetagging] = useState(false);
  const [autoTags, setAutoTags] = useState(asset.auto_tags || {});

  // ESC 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isVideo = asset.asset_type?.includes('video');

  const patch = async (body) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/creator/identity-search?id=${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok && d?.asset) {
        onChanged?.(d.asset);
        setSavedAt(Date.now());
      } else {
        console.error('[AssetDetail patch]', d.error);
      }
    } catch (e) {
      console.error('[AssetDetail patch]', e);
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    patch({ is_favorite: next, favorited_at: next ? new Date().toISOString() : null });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(''); return; }
    const next = [...tags, t];
    setTags(next);
    setTagInput('');
    patch({ manual_tags: next });
  };

  const removeTag = (t) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    patch({ manual_tags: next });
  };

  const saveNotes = () => patch({ notes });

  const retag = async () => {
    if (retagging || isVideo || asset.asset_type === 'bgm') return;
    setRetagging(true);
    try {
      const r = await fetch('/api/creator/identity-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const d = await r.json();
      const updated = d.tagged?.[0]?.auto_tags;
      if (updated) {
        setAutoTags(updated);
        if (onChanged) onChanged({ ...asset, auto_tags: updated, tagged_at: new Date().toISOString() });
      }
    } finally {
      setRetagging(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 미디어 */}
        <div className="md:w-1/2 bg-black flex items-center justify-center">
          {isVideo ? (
            <video src={asset.url} controls className="max-h-[60vh] md:max-h-[90vh] w-full" />
          ) : (
            <img src={asset.url} alt="" className="max-h-[60vh] md:max-h-[90vh] w-full object-contain" />
          )}
        </div>

        {/* 패널 */}
        <div className="md:w-1/2 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFavorite}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                  favorite
                    ? 'bg-amber-400 text-zinc-900'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
                title="라이브러리 즐겨찾기 — 자동화 트리거 아님"
              >
                <Star className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />
                {favorite ? '즐겨찾기됨' : '즐겨찾기'}
              </button>
              {saving && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
              {savedAt && !saving && <Check className="w-4 h-4 text-emerald-400" />}
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-5 text-sm">
            {/* 메타 */}
            <section>
              <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">메타</h4>
              <dl className="grid grid-cols-2 gap-2 text-zinc-300">
                <Meta label="타입" value={asset.asset_type} />
                <Meta label="출처" value={asset.source} />
                <Meta label="사용 횟수" value={asset.use_count ?? 0} />
                <Meta label="업로드" value={new Date(asset.created_at).toLocaleDateString()} />
              </dl>
            </section>

            {/* 자동 태그 */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase tracking-wide text-zinc-500">자동 태그</h4>
                {!isVideo && asset.asset_type !== 'bgm' && (
                  <button
                    onClick={retag}
                    disabled={retagging}
                    className="text-xs text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {retagging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    재태깅
                  </button>
                )}
              </div>
              {Object.keys(autoTags || {}).length === 0 ? (
                <p className="text-xs text-zinc-500">아직 자동 태그 없음.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {autoTags.space && <ChipReadonly label={`공간: ${autoTags.space}`} />}
                  {autoTags.outfit && <ChipReadonly label={`옷: ${autoTags.outfit}`} />}
                  {autoTags.lighting && <ChipReadonly label={`조명: ${autoTags.lighting}`} />}
                  {autoTags.subject && <ChipReadonly label={`주체: ${autoTags.subject}`} />}
                  {(autoTags.mood || []).map((m) => <ChipReadonly key={m} label={m} />)}
                  {(autoTags.usable_for || []).map((u) => <ChipReadonly key={u} label={`▸${u}`} />)}
                </div>
              )}
            </section>

            {/* 수동 태그 */}
            <section>
              <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> 내 태그
              </h4>
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => removeTag(t)}
                    className="text-xs bg-zinc-800 text-zinc-200 px-2 py-1 rounded hover:bg-red-500/20 hover:text-red-300"
                    title="클릭해서 제거"
                  >
                    {t} ✕
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
                  placeholder="태그 입력 후 Enter"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm"
                />
                <button
                  onClick={addTag}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
                >
                  추가
                </button>
              </div>
            </section>

            {/* 노트 */}
            <section>
              <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">메모</h4>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={3}
                placeholder="이 자산에 대한 메모 (선택)"
                className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm resize-none"
              />
            </section>

            <p className="text-[10px] text-zinc-600 leading-relaxed">
              ⭐ 즐겨찾기는 라이브러리 정리용이야 — 자동화 트리거 아님.
              비슷한 영상 양산은 별도의 <em>Reference Tone</em> 자동화가 담당해.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] text-zinc-500 uppercase">{label}</dt>
      <dd className="text-zinc-200">{String(value)}</dd>
    </div>
  );
}

function ChipReadonly({ label }) {
  return (
    <span className="text-xs bg-zinc-800/60 text-zinc-300 px-2 py-1 rounded border border-zinc-700/50">
      {label}
    </span>
  );
}
