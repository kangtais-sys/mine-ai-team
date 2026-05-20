// AssetUploader — Supabase Storage 직접 업로드 (Vercel 4.5MB 우회)
//   브라우저 → Supabase Storage → 받은 URL/path만 /api/creator/identity-import 로 보내 row 생성
// Props:
//   identityId?: 'mine-primary'
//   defaultAssetType?: 'photo'
//   defaultSource?: 'manual_upload' | 'reference'
//   onUploaded?: (assets) => void

import { useRef, useState } from 'react';
import { Upload, Loader2, Check, AlertCircle, X } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabaseClient';

const ASSET_TYPES = [
  { value: 'photo', label: '내 사진' },
  { value: 'video', label: '내 영상' },
  { value: 'product', label: '제품 컷' },
  { value: 'reference_photo', label: '레퍼런스 사진' },
  { value: 'reference_video', label: '레퍼런스 영상' },
  { value: 'bgm', label: 'BGM' },
];

const SOURCES = [
  { value: 'manual_upload', label: '수동 업로드' },
  { value: 'reference', label: '레퍼런스' },
];

const BUCKET = 'creator-library';
const MAX_BATCH = 20;
const MAX_FILE_MB = 50;

function safeName(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildPath(identityId, assetType, file) {
  const name = safeName(file.name);
  const hasExt = name.includes('.');
  const suffix = hasExt ? '' : `.${(file.type.split('/')[1] || 'bin').toLowerCase()}`;
  return `${identityId}/${assetType}/${crypto.randomUUID()}-${name}${suffix}`;
}

export default function AssetUploader({
  identityId = 'mine-primary',
  defaultAssetType = 'photo',
  defaultSource = 'manual_upload',
  onUploaded,
}) {
  const inputRef = useRef(null);
  const [assetType, setAssetType] = useState(defaultAssetType);
  const [source, setSource] = useState(defaultSource);
  const [queue, setQueue] = useState([]); // { file, status: 'pending'|'uploading'|'done'|'error', error? }
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const ok = [];
    const tooBig = [];
    for (const f of list) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) tooBig.push(f.name);
      else ok.push({ file: f, status: 'pending' });
    }
    setQueue((prev) => [...prev, ...ok].slice(0, MAX_BATCH));
    if (tooBig.length) {
      alert(`${MAX_FILE_MB}MB 초과 파일 제외: ${tooBig.join(', ')}`);
    }
  };

  const handlePick = (e) => {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const removeAt = (i) => setQueue((prev) => prev.filter((_, idx) => idx !== i));

  const upload = async () => {
    if (busy || queue.length === 0) return;
    setBusy(true);

    const updateItem = (i, patch) =>
      setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

    // 1단계: Supabase Storage 직접 업로드
    const uploaded = []; // { _i, url, path, mimeType, filename, assetType, source }
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === 'done') continue;
      updateItem(i, { status: 'uploading' });

      const file = queue[i].file;
      const path = buildPath(identityId, assetType, file);
      const contentType = file.type || 'application/octet-stream';

      const { error: upErr } = await supabaseBrowser.storage
        .from(BUCKET)
        .upload(path, file, { contentType, upsert: false });

      if (upErr) {
        updateItem(i, { status: 'error', error: upErr.message });
        continue;
      }

      const { data: pub } = supabaseBrowser.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push({
        _i: i,
        url: pub?.publicUrl,
        path,
        mimeType: contentType,
        filename: file.name,
        assetType,
        source,
      });
    }

    if (uploaded.length === 0) {
      setBusy(false);
      return;
    }

    // 2단계: row 생성만 서버 호출 (작은 JSON)
    try {
      const res = await fetch('/api/creator/identity-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityId,
          files: uploaded.map(({ _i, ...rest }) => rest),
        }),
      });
      const data = await res.json();
      const errMap = new Map((data.errors || []).map((e) => [e.index, e.error]));

      uploaded.forEach((p, ord) => {
        if (errMap.has(ord)) updateItem(p._i, { status: 'error', error: errMap.get(ord) });
        else updateItem(p._i, { status: 'done' });
      });

      if (onUploaded && data.assets?.length) onUploaded(data.assets);
    } catch (e) {
      uploaded.forEach((p) => updateItem(p._i, { status: 'error', error: e.message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 옵션 */}
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-zinc-400">타입</span>
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
          >
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-zinc-400">출처</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 드롭 존 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
          dragOver ? 'border-emerald-400 bg-emerald-400/5' : 'border-zinc-700 hover:border-zinc-500'
        }`}
      >
        <Upload className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
        <p className="text-sm text-zinc-200">
          탭하거나 파일 드롭 — 한 번에 최대 {MAX_BATCH}개, 파일당 {MAX_FILE_MB}MB
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Storage 직접 업로드 (Vercel 우회). Cmd / Shift 클릭으로 다중 선택
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          onChange={handlePick}
          className="hidden"
        />
      </div>

      {/* 대기열 */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((q, i) => (
            <div
              key={`${q.file.name}-${i}`}
              className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
            >
              <span className="flex-1 truncate text-zinc-200">{q.file.name}</span>
              <span className="text-xs text-zinc-500">
                {(q.file.size / 1024 / 1024).toFixed(1)}MB
              </span>
              {q.status === 'pending' && (
                <button onClick={() => removeAt(i)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-4 h-4" />
                </button>
              )}
              {q.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />}
              {q.status === 'done' && <Check className="w-4 h-4 text-emerald-400" />}
              {q.status === 'error' && (
                <span title={q.error} className="text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 액션 */}
      {queue.length > 0 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setQueue([])}
            disabled={busy}
            className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          >
            전체 비우기
          </button>
          <button
            onClick={upload}
            disabled={busy || queue.every((q) => q.status === 'done')}
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium px-4 py-2 rounded disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            업로드 {queue.filter((q) => q.status === 'pending').length}개
          </button>
        </div>
      )}
    </div>
  );
}
