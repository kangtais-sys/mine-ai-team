// IdentityLibrary — V3 Identity 탭의 페이지 컴포넌트
//   StyleProfileCard + AssetUploader + Pinterest 그리드 + AssetDetail 모달 일체.
// Props:
//   identityId?: 'mine-primary'
//   onSelectAsset?: (asset) => void   // (선택) 외부에서도 자산 클릭 hook
//   reloadKey?: number                // (선택) 외부 갱신 트리거

import { useEffect, useMemo, useState } from 'react';
import { Star, Filter, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import AssetUploader from './AssetUploader';
import AssetDetail from './AssetDetail';
import StyleProfileCard from './StyleProfileCard';

const ASSET_TYPES = [
  { value: '', label: '전체' },
  { value: 'photo', label: '사진' },
  { value: 'video', label: '영상' },
  { value: 'product', label: '제품' },
  { value: 'reference_photo', label: '레퍼런스(사진)' },
  { value: 'reference_video', label: '레퍼런스(영상)' },
];

const SORTS = [
  { value: 'newest', label: '최신순' },
  { value: 'favorited', label: '즐겨찾기순' },
  { value: 'most_used', label: '많이 쓴 순' },
];

const PAGE = 50;

export default function IdentityLibrary({ identityId = 'mine-primary', onSelectAsset, reloadKey: externalReloadKey = 0 }) {
  const [assets, setAssets] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tagging, setTagging] = useState(false);

  const [assetType, setAssetType] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [sort, setSort] = useState('newest');

  // 내부 흡수: AssetDetail 모달 + 업로드 후 자동 갱신
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [internalReloadKey, setInternalReloadKey] = useState(0);
  const reloadKey = externalReloadKey + internalReloadKey;

  const params = useMemo(() => {
    const p = new URLSearchParams({ identityId, sort, limit: String(PAGE), offset: String(offset) });
    if (assetType) p.set('assetType', assetType);
    if (favoriteOnly) p.set('favorite', 'true');
    if (tagQuery.trim()) p.set('tag', tagQuery.trim());
    return p.toString();
  }, [identityId, sort, offset, assetType, favoriteOnly, tagQuery]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/creator/identity-search?${params}`);
      const d = await r.json();
      setAssets(d.assets || []);
      setTotal(d.total || 0);
    } catch (e) {
      console.error('[IdentityLibrary]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAssets(); }, [params, reloadKey]);

  const untaggedIds = assets
    .filter((a) => !a.tagged_at && !a.asset_type.includes('video') && a.asset_type !== 'bgm')
    .slice(0, 10)
    .map((a) => a.id);

  const tagBatch = async () => {
    if (tagging || untaggedIds.length === 0) return;
    setTagging(true);
    try {
      await fetch('/api/creator/identity-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: untaggedIds }),
      });
      await fetchAssets();
    } catch (e) {
      console.error('[IdentityLibrary tag]', e);
    } finally {
      setTagging(false);
    }
  };

  const handleUploaded = () => setInternalReloadKey((k) => k + 1);

  const handleCardClick = (a) => {
    setSelectedAsset(a);
    onSelectAsset?.(a);
  };

  const handleAssetChanged = (updated) => {
    setSelectedAsset(updated);
    setInternalReloadKey((k) => k + 1);
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <StyleProfileCard identityId={identityId} />

        <section className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/40">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">자산 업로드</h3>
          <AssetUploader identityId={identityId} onUploaded={handleUploaded} />
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">라이브러리</h3>
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Filter className="w-4 h-4 text-zinc-400" />
        <select
          value={assetType}
          onChange={(e) => { setOffset(0); setAssetType(e.target.value); }}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
        >
          {ASSET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <button
          onClick={() => { setOffset(0); setFavoriteOnly((v) => !v); }}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${
            favoriteOnly
              ? 'bg-amber-400/10 border-amber-400/40 text-amber-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-300'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${favoriteOnly ? 'fill-amber-300' : ''}`} />
          즐겨찾기만
        </button>

        <input
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          onBlur={() => setOffset(0)}
          onKeyDown={(e) => { if (e.key === 'Enter') setOffset(0); }}
          placeholder="태그 검색 (콤마 구분)"
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 w-44"
        />

        <select
          value={sort}
          onChange={(e) => { setOffset(0); setSort(e.target.value); }}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {untaggedIds.length > 0 && (
            <button
              onClick={tagBatch}
              disabled={tagging}
              className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
              title={`${untaggedIds.length}개 자동 태깅`}
            >
              {tagging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              자동 태깅 ({untaggedIds.length})
            </button>
          )}
          <button
            onClick={fetchAssets}
            disabled={loading}
            className="text-zinc-400 hover:text-zinc-200"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 그리드 */}
      {loading && assets.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : assets.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">
          자산이 없어. 위에서 업로드해.
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 [column-fill:_balance]">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} onClick={() => handleCardClick(a)} />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {total > PAGE && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-zinc-500">
            {offset + 1}–{Math.min(offset + PAGE, total)} / {total}
          </span>
          <button
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
            className="px-3 py-1 rounded bg-zinc-800 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
        </section>

        {selectedAsset && (
          <AssetDetail
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
            onChanged={handleAssetChanged}
          />
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset, onClick }) {
  const isVideo = asset.asset_type?.includes('video');
  const hasTags = asset.tagged_at;
  return (
    <button
      onClick={onClick}
      className="mb-3 w-full break-inside-avoid relative group rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition"
    >
      {isVideo ? (
        <video
          src={asset.url}
          poster={asset.thumbnail_url || undefined}
          muted
          playsInline
          className="w-full h-auto block"
        />
      ) : (
        <img
          src={asset.thumbnail_url || asset.url}
          alt=""
          loading="lazy"
          className="w-full h-auto block"
        />
      )}

      {/* 즐겨찾기 배지 */}
      {asset.is_favorite && (
        <div className="absolute top-2 right-2 bg-amber-400 text-zinc-900 rounded-full p-1">
          <Star className="w-3 h-3 fill-current" />
        </div>
      )}

      {/* 태그 상태 */}
      {!hasTags && !isVideo && asset.asset_type !== 'bgm' && (
        <div className="absolute bottom-2 left-2 text-[10px] bg-zinc-900/80 text-zinc-300 px-1.5 py-0.5 rounded">
          미태깅
        </div>
      )}
    </button>
  );
}
