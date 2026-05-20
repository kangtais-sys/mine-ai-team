// StyleProfileCard — Phase 1.5: placeholder
// Phase 2의 style-profile-update.js 가 데이터를 채우면 그 시점에 본 카드가 렌더됨.

import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Calendar, Lock } from 'lucide-react';

export default function StyleProfileCard({ identityId = 'mine-primary' }) {
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [profile, setProfile] = useState(null);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/creator/style-profile?identityId=${identityId}`);
      const d = await r.json();
      setExists(!!d.exists);
      setProfile(d.profile || null);
    } catch (e) {
      console.error('[StyleProfileCard]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, [identityId]);

  if (loading) {
    return (
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/40">
        <div className="h-5 w-32 bg-zinc-800 rounded animate-pulse mb-3" />
        <div className="h-3 w-full bg-zinc-800 rounded animate-pulse mb-2" />
        <div className="h-3 w-2/3 bg-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!exists) {
    return (
      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/40">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Style Profile</h3>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-zinc-500">
            <Lock className="w-3 h-3" /> Phase 2
          </span>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          MINE의 영상·캡션·구도·BGM 톤을 50개 샘플에서 학습해 Style DNA로 저장하는 카드.
          Phase 2의 <code className="text-zinc-300">style-profile-update</code> 가 첫 추출 후
          여기서 평균 영상 길이, 공간 비율, 후킹 패턴, 색감을 보여줄 거야.
        </p>
        <p className="text-xs text-zinc-500 mt-3">월 1회 명시적 업데이트로 갱신.</p>
      </div>
    );
  }

  const data = profile.profile_data || {};
  return (
    <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/40 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Style Profile</h3>
        <span className="ml-auto text-xs text-zinc-500 inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          v{profile.version} · {new Date(profile.last_updated).toLocaleDateString()}
        </span>
        <button
          onClick={fetchProfile}
          className="text-zinc-500 hover:text-zinc-300"
          title="새로고침"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="평균 영상 길이" value={data.avg_video_length_sec ? `${data.avg_video_length_sec}s` : '—'} />
        <Stat label="캡션 톤" value={data.caption_tone || '—'} />
        <Stat label="이모지 평균" value={data.emoji_avg ?? '—'} />
        <Stat label="컬러 톤" value={data.color_tone || '—'} />
      </dl>

      {data.common_hooks?.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-1">자주 쓰는 후킹</p>
          <div className="flex flex-wrap gap-1">
            {data.common_hooks.slice(0, 6).map((h, i) => (
              <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">
                {h}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded px-3 py-2">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-zinc-100 mt-0.5">{value}</p>
    </div>
  );
}
